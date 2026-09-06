---
title: "PBF 流体模拟详解 — 位置基不可压缩约束、XSPH 粘度与涡度增强"
excerpt: "系统推导 Position Based Fluids（PBF）：从 PBD 约束投影框架出发，到密度约束的拉格朗日乘子法、约束梯度计算、单边约束的物理理由、人工表面张力修正、XSPH 粘度与涡度约束，最后给出 GPU Compute Shader 实现与 SPH 的对比。"
date: "2026-09-06"
category: "Physics"
subtopic: "Fluid"
tags: ["PBF", "PBD", "流体模拟", "约束求解", "C++"]
readTime: "阅读约40分钟"
---

> **Position Based Fluids（PBF）** 由 Macklin 与 Müller 在 SIGGRAPH 2013 提出，是 Position Based Dynamics（PBD）框架在不可压缩流体模拟中的应用。与基于力的 SPH 不同，PBF 将不可压缩性表达为密度约束 $C_i = \rho_i/\rho_0 - 1 = 0$，通过拉格朗日乘子迭代投影位置，而非通过压力力显式积分。
>
> 本文系统推导 PBF 的数学内核——密度约束的拉格朗日乘子、约束梯度、单边约束的物理意义——并补全原工程文档中缺失的 PBD 框架说明、单边约束理由与 GPU Compute Shader 实现。与&#12298;[SPH 流体模拟详解](/knowledge/sph-fluid-simulation/)&#12299;（基于力的视角）、&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;（PBD/XPBD 约束求解原理）形成交叉引用。

---

## 一、引言：从 PBD 到流体

### 1.1 PBD 框架回顾

**Position Based Dynamics（PBD）** 是一种基于约束的物理模拟框架（Müller et al. 2007），其核心思想与基于力的方法有本质区别：

| | 基于力（SPH 等） | 基于位置（PBD/PBF） |
|---|---|---|
| 求解对象 | 力 → 加速度 → 速度 → 位置 | 直接求解位置修正 |
| 物理表达 | 运动方程 $m\mathbf{a} = \mathbf{F}$ | 约束方程 $C(\mathbf{p}) = 0$ |
| 时间步 | 显式积分，受 CFL 限制 | 迭代投影，无条件稳定 |
| 稳定性 | 条件稳定（步长过大爆炸） | 无条件稳定（步长只影响精度） |

PBD 的标准流程是 **predict-correct**：

1. **预测**：施加外力得到预测位置 $\mathbf{p}^* = \mathbf{p} + \Delta t\,\mathbf{v}$。
2. **投影**：迭代修正 $\mathbf{p}^*$ 使其满足所有约束 $C(\mathbf{p}) = 0$。
3. **更新**：由实际位移反推速度 $\mathbf{v} = (\mathbf{p}^* - \mathbf{p})/\Delta t$。

关键在于第二步：约束通过拉格朗日乘子法转化为位置修正 $\Delta\mathbf{p}$，而非通过力。这使得即使时间步长很大也不会"爆炸"——因为位置始终被投影到约束流形上。PBD/XPBD 的刚度控制与 compliance 机制详见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;的 XPBD 章节。

### 1.2 核心思想

PBF 将 PBD 推广到流体：将每个粒子的**不可压缩性**表达为密度约束。具体而言，粒子 $i$ 的密度 $\rho_i$ 应等于静止密度 $\rho_0$：

$$
C_i = \frac{\rho_i}{\rho_0} - 1 = 0
$$

当所有粒子的密度约束都被满足时，流体整体不可压缩。PBF 通过迭代求解所有粒子的密度约束（用拉格朗日乘子法计算位置修正），在固定迭代次数内逼近不可压缩状态。

### 1.3 与 SPH 的关系

PBF 与 SPH 共享核函数插值框架——密度 $\rho_i = \sum_j m_j W(\mathbf{p}_i - \mathbf{p}_j, h)$ 的计算方式完全相同。区别在于密度偏差的处理方式：

- **SPH**：将密度通过状态方程转为压力 $p = k(\rho - \rho_0)$，再由压力梯度力 $-\nabla p$ 驱动粒子运动（基于力）。
- **PBF**：将密度偏差视为约束违例 $C_i \ne 0$，直接计算位置修正消除偏差（基于约束）。

因此 PBF 不需要状态方程、不需要 CFL 稳定性分析、不受声速限制，代价是不可压缩性是迭代近似的而非精确的。

---

## 二、密度约束的数学推导

### 2.1 密度约束

粒子 $i$ 的密度由核函数插值得到：

$$
\rho_i = \sum_j m_j W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

密度约束函数：

$$
C_i = \frac{\rho_i}{\rho_0} - 1
$$

约束 $C_i = 0$ 意味着粒子 $i$ 处的密度恰好等于静止密度，即流体不可压缩。

### 2.2 拉格朗日乘子法

PBD 求解约束的标准方法是拉格朗日乘子法。对约束 $C_i$ 做一阶泰勒展开：

$$
C_i(\mathbf{p} + \Delta\mathbf{p}) \approx C_i(\mathbf{p}) + \nabla C_i \cdot \Delta\mathbf{p} = 0
$$

PBD 假设位置修正沿约束梯度方向：

$$
\Delta\mathbf{p}_k = \lambda_i \,\nabla_{\mathbf{p}_k} C_i
$$

其中 $\lambda_i$ 是约束 $i$ 的拉格朗日乘子，$\nabla_{\mathbf{p}_k} C_i$ 是约束 $i$ 对粒子 $k$ 位置的梯度。代入展开式：

$$
C_i + \sum_k \nabla_{\mathbf{p}_k} C_i \cdot \lambda_i \nabla_{\mathbf{p}_k} C_i = 0
$$

$$
C_i + \lambda_i \sum_k |\nabla_{\mathbf{p}_k} C_i|^2 = 0
$$

解得：

$$
\lambda_i = -\frac{C_i}{\sum_k |\nabla_{\mathbf{p}_k} C_i|^2}
$$

加入正则化项 $\varepsilon$（防止除零并改善数值条件）：

$$
\lambda_i = -\frac{C_i}{\sum_k |\nabla_{\mathbf{p}_k} C_i|^2 + \varepsilon}
$$

其中 $\varepsilon$ 通常取 $10^{-4} \sim 10^{-6}$。

### 2.3 约束梯度

密度 $\rho_i = \sum_j m_j W(\mathbf{p}_i - \mathbf{p}_j, h)$ 对各粒子位置的梯度，由核函数的梯度决定。设 $\mathbf{r}_{ij} = \mathbf{p}_i - \mathbf{p}_j$，则 $\nabla_{\mathbf{p}_i} W = \nabla W(\mathbf{r}_{ij})$，$\nabla_{\mathbf{p}_j} W = -\nabla W(\mathbf{r}_{ij})$。

约束对粒子 $k$ 的梯度分三种情况：

**$k = i$（约束所属粒子）**：

$$
\nabla_{\mathbf{p}_i} C_i = \frac{1}{\rho_0}\sum_j m_j \nabla W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

**$k = j \ne i$（邻居粒子）**：

$$
\nabla_{\mathbf{p}_j} C_i = -\frac{m_j}{\rho_0}\nabla W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

**$k$ 既非 $i$ 也非邻居**：梯度为零，不参与约束。

值得注意的是，$\nabla_{\mathbf{p}_i} C_i = -\sum_{j\ne i}\nabla_{\mathbf{p}_j} C_i$（梯度之和为零），这反映了约束的平移不变性——整体平移所有粒子不改变密度。

### 2.4 单边约束（不可压缩只防压缩）

PBF 的密度约束是**单边（不等式）约束**：只在密度超过静止密度时修正，低于静止密度时不修正。

$$
\lambda_i = \begin{cases} -\dfrac{C_i}{\sum_k |\nabla_{\mathbf{p}_k} C_i|^2 + \varepsilon} & C_i > 0 \;(\rho_i > \rho_0) \\[6pt] 0 & C_i \le 0 \;(\rho_i \le \rho_0) \end{cases}
$$

```cpp
float CalculateLambda(int32 i)
{
    float density = Densities[i];
    float C = density / RestDensity - 1.0f;

    // 单边约束：密度未超过静止密度时，无需修正
    if (C <= 0.0f) return 0.0f;

    float sumGradients = 0.0f;
    FVector gradI = FVector::ZeroVector;
    FVector pi = PredictedPositions[i];

    for (int32 j : Neighbors[i])
    {
        FVector gradJ = (ParticleMass / RestDensity) * GradWspiky(pi - PredictedPositions[j], SmoothingRadius);
        gradI += gradJ;
        sumGradients += gradJ.SizeSquared();
    }
    sumGradients += gradI.SizeSquared();

    return -C / (sumGradients + Epsilon);
}
```

**物理理由**：流体的不可压缩性是**抗压不抗拉**的——流体可以抵抗压缩（密度 > $\rho_0$ 时产生排斥），但不会主动吸引分离的粒子（密度 < $\rho_0$ 时不产生拉力）。在自由表面处，粒子外侧缺失邻居，密度天然低于 $\rho_0$；若双向约束会错误地将表面粒子向内拉，破坏自由表面形态。单边约束确保只有压缩被修正，分离被允许，这正是不可压缩流体的正确物理行为。

> 这与 PBD 中碰撞约束的单边性 $C(\mathbf{p}) \ge 0$ 一致——只在穿透时修正，不产生虚假吸引力。

---

## 三、核函数

PBF 使用与 SPH 相同的核函数族（推导见&#12298;[SPH 流体模拟详解](/knowledge/sph-fluid-simulation/)&#12299;§3），此处仅列出 PBF 用到的两个。

### 3.1 Poly6 核（密度计算）

$$
W_{\text{poly6}}(r, h) = \frac{315}{64\pi h^9}(h^2 - r^2)^3, \quad 0 \le r \le h
$$

Poly6 平滑且数值稳定，适合密度计算。

### 3.2 Spiky 核（梯度计算）

$$
W_{\text{spiky}}(r, h) = \frac{15}{\pi h^6}(h - r)^3, \quad 0 \le r \le h
$$

$$
\nabla W_{\text{spiky}}(\mathbf{r}, h) = -\frac{45}{\pi h^6}(h - r)^2 \frac{\mathbf{r}}{|\mathbf{r}|}, \quad 0 < r \le h
$$

Spiky 核的梯度在 $r \to 0$ 时不为零，防止粒子聚集。PBF 的约束梯度与位置修正均使用 Spiky 梯度。

---

## 四、算法流程

### 4.1 完整流程

```
for each time step:
    1. 预测位置（施加外力）
       vᵢ ← vᵢ + Δt·f_ext/m
       p*ᵢ ← pᵢ + Δt·vᵢ

    2. 邻域搜索（空间哈希/均匀网格）

    3. 迭代求解密度约束（solverIterations 次）
       for iter in range(solverIterations):
           for each particle i:  计算 ρᵢ 与 λᵢ
           for each particle i:  计算 Δpᵢ，p*ᵢ ← p*ᵢ + Δpᵢ

    4. 更新速度与位置
       vᵢ ← (p*ᵢ - pᵢ)/Δt
       pᵢ ← p*ᵢ

    5. XSPH 粘度（可选）
    6. 涡度约束（可选）
    7. 碰撞与边界处理
```

### 4.2 预测

施加外力并预测位置，此步不计压力/约束力：

$$
\mathbf{v}_i \leftarrow \mathbf{v}_i + \Delta t\,\frac{\mathbf{f}_{\text{ext}}}{m}, \quad \mathbf{p}_i^* \leftarrow \mathbf{p}_i + \Delta t\,\mathbf{v}_i
$$

```cpp
ParallelFor(NumParticles, [&](int32 i)
{
    Velocities[i] += DeltaTime * (Gravity + ExternalForces[i]) / ParticleMass;
    PredictedPositions[i] = Positions[i] + DeltaTime * Velocities[i];
});
```

### 4.3 约束求解迭代

每次迭代分两阶段：先计算所有粒子的 $\lambda_i$（用当前 $\mathbf{p}^*$），再计算位置修正 $\Delta\mathbf{p}_i$ 并更新 $\mathbf{p}^*$。两阶段分离是必要的——同一迭代内 $\lambda_i$ 必须基于一致的密度场。

**位置修正公式**（综合自身约束与邻居约束的贡献）：

$$
\Delta\mathbf{p}_i = \frac{1}{\rho_0}\sum_j(\lambda_i + \lambda_j + s_{\text{corr}})\nabla W(\mathbf{p}_i^* - \mathbf{p}_j^*, h)
$$

其中 $s_{\text{corr}}$ 是人工表面张力修正项（见 §5）。$\lambda_i + \lambda_j$ 的对称形式保证动量守恒（类似 SPH 的对称压力力）。

```cpp
FVector CalculatePositionDelta(int32 i)
{
    FVector delta = FVector::ZeroVector;
    FVector pi = PredictedPositions[i];

    for (int32 j : Neighbors[i])
    {
        if (i == j) continue;
        FVector dir = pi - PredictedPositions[j];
        float r = dir.Size();
        if (r < SMALL_NUMBER) continue;

        // 人工表面张力修正
        float sCorr = -SurfaceTensionK * FMath::Pow(
            Wpoly6(r, SmoothingRadius) / Wpoly6(SurfaceTensionDeltaQ * SmoothingRadius, SmoothingRadius),
            SurfaceTensionN);

        delta += (Lambdas[i] + Lambdas[j] + sCorr) * GradWspiky(dir, SmoothingRadius);
    }

    return (1.0f / RestDensity) * delta;
}
```

### 4.4 速度与位置更新

约束求解后，由实际位移反推速度（PBD 的标志性操作）：

$$
\mathbf{v}_i = \frac{\mathbf{p}_i^* - \mathbf{p}_i}{\Delta t}, \quad \mathbf{p}_i = \mathbf{p}_i^*
$$

```cpp
ParallelFor(NumParticles, [&](int32 i)
{
    Velocities[i] = (PredictedPositions[i] - Positions[i]) / DeltaTime;
    Positions[i] = PredictedPositions[i];
});
```

---

## 五、人工表面张力与压力修正

### 5.1 问题

PBF 的密度约束在自由表面处存在数值问题：表面粒子外侧缺失邻居，密度天然低于 $\rho_0$，单边约束不修正它们。但表面附近的粒子对之间存在数值吸引——因为约束梯度在低压区可能将粒子拉到一起而非排斥。这会导致粒子聚集、表面粗糙。

### 5.2 s_corr 修正

Macklin & Müller 引入人工表面张力修正项 $s_{\text{corr}}$，对近距离粒子对施加额外排斥：

$$
s_{\text{corr}} = -k\left(\frac{W(\mathbf{p}_i - \mathbf{p}_j, h)}{W(\Delta q, h)}\right)^n
$$

其中：
- $k \approx 0.0001 \sim 0.001$——表面张力强度。
- $n = 4$——衰减指数（使修正仅对近邻粒子有效）。
- $\Delta q \approx 0.1h \sim 0.3h$——参考距离（归一化核函数值）。

**物理直觉**：当两个粒子非常接近时，$W(\mathbf{p}_i - \mathbf{p}_j, h)$ 较大（接近 $W(0, h)$），比值远大于 1，$s_{\text{corr}}$ 显著为负（增加排斥）；当粒子距离正常时，比值接近 1，$s_{\text{corr}} \approx -k$ 可忽略。这等效于一种基于核函数值的短程排斥力，平滑了自由表面。

---

## 六、XSPH 粘度

PBF 在约束求解后、碰撞处理前施加 XSPH 粘度，使粒子速度趋于一致、抑制噪声：

$$
\mathbf{v}_i^{\text{new}} = \mathbf{v}_i + c\sum_j \frac{m_j}{\rho_j}(\mathbf{v}_j - \mathbf{v}_i)\,W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

其中 $c$ 是 XSPH 粘度系数（通常 $0.01$）。XSPH 粘度不同于 SPH 的物理粘度力——它直接在速度层面做加权平均，不需要拉普拉斯算子，计算更简单且数值稳定。

```cpp
void ApplyXSPHViscosity()
{
    ParallelFor(NumParticles, [&](int32 i)
    {
        FVector delta = FVector::ZeroVector;
        for (int32 j : Neighbors[i])
        {
            delta += (Velocities[j] - Velocities[i])
                   * Wpoly6(FVector::Distance(Positions[i], Positions[j]), SmoothingRadius);
        }
        Velocities[i] += XsphViscosity * delta;
    });
}
```

---

## 七、涡度约束

PBD 的约束投影会数值耗散涡度（旋转动能），使流体显得"死气沉沉"。涡度约束（vorticity confinement）在速度场中检测并重新注入涡度。

### 7.1 涡度计算

粒子 $i$ 的涡度（速度旋度）由邻居速度差与核函数梯度估计：

$$
\boldsymbol{\omega}_i = \nabla \times \mathbf{v} = \sum_j (\mathbf{v}_j - \mathbf{v}_i) \times \nabla W(\mathbf{p}_i - \mathbf{p}_j, h)
$$

```cpp
FVector CalculateVorticity(int32 i)
{
    FVector omega = FVector::ZeroVector;
    for (int32 j : Neighbors[i])
    {
        FVector vij = Velocities[j] - Velocities[i];
        omega += FVector::CrossProduct(vij, GradWspiky(Positions[i] - Positions[j], SmoothingRadius));
    }
    return omega;
}
```

### 7.2 涡度力

沿涡度的梯度方向施加力，放大局部旋转：

$$
\mathbf{f}_i^{\text{vorticity}} = \varepsilon\,(\mathbf{N} \times \boldsymbol{\omega}_i)
$$

$$
\mathbf{N} = \frac{\boldsymbol{\eta}}{|\boldsymbol{\eta}|}, \quad \boldsymbol{\eta} = \sum_j \nabla W(\mathbf{p}_i - \mathbf{p}_j, h)\,|\boldsymbol{\omega}_j|
$$

其中 $\varepsilon$ 是涡度约束系数（通常 $0.001 \sim 0.01$），$\boldsymbol{\eta}$ 指向涡度增大的方向，$\mathbf{N}\times\boldsymbol{\omega}_i$ 垂直于涡度方向——这正是维持旋转所需的向心力方向。

```cpp
FVector CalculateVorticityForce(int32 i)
{
    FVector omega = Vorticities[i];
    if (omega.IsNearlyZero()) return FVector::ZeroVector;

    FVector eta = FVector::ZeroVector;
    for (int32 j : Neighbors[i])
        eta += GradWspiky(Positions[i] - Positions[j], SmoothingRadius) * Vorticities[j].Size();

    if (eta.IsNearlyZero()) return FVector::ZeroVector;
    return VorticityEpsilon * FVector::CrossProduct(eta.GetSafeNormal(), omega);
}
```

---

## 八、边界处理与初始化

### 8.1 边界碰撞

```cpp
void ResolveCollision(FVector& pos, FVector& vel)
{
    for (int32 axis = 0; axis < 3; axis++)
    {
        if (pos[axis] < BoundsMin[axis])
        {
            pos[axis] = BoundsMin[axis];
            vel[axis] *= -Restitution;
        }
        else if (pos[axis] > BoundsMax[axis])
        {
            pos[axis] = BoundsMax[axis];
            vel[axis] *= -Restitution;
        }
    }
}
```

PBF 的边界也可用虚拟粒子方法（与 SPH 相同），使边界附近密度计算更准确。

### 8.2 粒子初始化

根据静止密度与质量反推粒子间距，确保初始密度接近 $\rho_0$：

$$
d = \sqrt[3]{\frac{m}{\rho_0}}
$$

```cpp
float spacing = FMath::Pow(ParticleMass / RestDensity, 1.0f / 3.0f);
for (int32 x = 0; x < NumX; x++)
    for (int32 y = 0; y < NumY; y++)
        for (int32 z = 0; z < NumZ; z++)
        {
            FVector pos = FVector(x, y, z) * spacing + Origin;
            Particles.Add(FPBFParticle{pos, FVector::ZeroVector});
        }
```

---

## 九、参数调优

### 9.1 核心参数

| 参数 | 推荐范围 | 说明 |
|------|----------|------|
| 静止密度 $\rho_0$ | 1000–2000 | 水通常用 1000 |
| 光滑半径 $h$ | 粒子间距的 2–3 倍 | 影响邻域范围 |
| 迭代次数 | 2–10 | 越多越不可压缩但越慢 |
| 松弛 $\varepsilon$ | $10^{-4}\sim10^{-6}$ | 防除零 |
| 时间步长 $\Delta t$ | 0.008–0.016 | 60 FPS 时为 0.016 s |

### 9.2 表面张力与粘度

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| $k$（表面张力） | 0.0001–0.01 | 人工表面张力强度 |
| $n$（衰减指数） | 4 | 近邻衰减 |
| $\Delta q$ | 0.1–0.3 $h$ | 参考距离 |
| XSPH $c$ | 0.001–0.1 | 粘度系数 |
| 涡度 $\varepsilon$ | 0.0001–0.01 | 涡度约束强度 |

### 9.3 调优建议

1. **从少量迭代开始**（2–3 次），逐步增加直到视觉满意。
2. 流体太"硬"或有间隙——增加迭代次数。
3. 流体太"松散"——减小 $h$ 或增加迭代。
4. 流体缺乏活力——增加涡度约束 $\varepsilon$。
5. 表面粗糙——增加表面张力 $k$。

> PBF 的 CFL 条件远宽松于 SPH：因为位置始终被投影到约束流形上，稳定性不依赖步长。但步长过大会降低约束求解精度，通常 $\Delta t \le h/v_{\max}$ 仍作为精度参考。

---

## 十、GPU 实现

PBF 的密度计算、$\lambda$ 求解、位置修正均为粒子独立操作，适合 GPU 并行。以下为 HLSL Compute Shader 示例，采用与 SPH 篇相同的均匀网格邻域结构。

### 10.1 密度计算

```hlsl
[numthreads(256, 1, 1)]
void ComputeDensity(uint3 id : SV_DispatchThreadID)
{
    uint i = id.x;
    if (i >= NumParticles) return;

    float3 pi = PredictedPositions[i];
    float density = 0.0;

    int3 cell = GetCellIndex(pi);
    for (int dx = -1; dx <= 1; dx++)
        for (int dy = -1; dy <= 1; dy++)
            for (int dz = -1; dz <= 1; dz++)
            {
                uint start = CellStart[HashCell(cell + int3(dx, dy, dz))];
                uint end   = CellEnd[HashCell(cell + int3(dx, dy, dz))];
                for (uint j = start; j < end; j++)
                {
                    float r = length(pi - PredictedPositions[j]);
                    density += Mass * WPoly6(r, SmoothingRadius);
                }
            }

    Densities[i] = density;
    Constraints[i] = density / RestDensity - 1.0;
}
```

### 10.2 拉格朗日乘子

```hlsl
[numthreads(256, 1, 1)]
void ComputeLambda(uint3 id : SV_DispatchThreadID)
{
    uint i = id.x;
    if (i >= NumParticles) return;

    float Ci = Constraints[i];
    if (Ci <= 0.0) { Lambdas[i] = 0.0; return; } // 单边约束

    float3 pi = PredictedPositions[i];
    float3 gradI = float3(0, 0, 0);
    float sumSq = 0.0;

    int3 cell = GetCellIndex(pi);
    for (int dx = -1; dx <= 1; dx++)
        for (int dy = -1; dy <= 1; dy++)
            for (int dz = -1; dz <= 1; dz++)
            {
                uint start = CellStart[HashCell(cell + int3(dx, dy, dz))];
                uint end   = CellEnd[HashCell(cell + int3(dx, dy, dz))];
                for (uint j = start; j < end; j++)
                {
                    if (j == i) continue;
                    float3 dir = pi - PredictedPositions[j];
                    float3 gradJ = (Mass / RestDensity) * GradWspiky(dir, SmoothingRadius);
                    gradI += gradJ;
                    sumSq += dot(gradJ, gradJ);
                }
            }
    sumSq += dot(gradI, gradI);

    Lambdas[i] = -Ci / (sumSq + Epsilon);
}
```

### 10.3 位置修正

```hlsl
[numthreads(256, 1, 1)]
void ComputePositionDelta(uint3 id : SV_DispatchThreadID)
{
    uint i = id.x;
    if (i >= NumParticles) return;

    float3 pi = PredictedPositions[i];
    float3 delta = float3(0, 0, 0);

    int3 cell = GetCellIndex(pi);
    for (int dx = -1; dx <= 1; dx++)
        for (int dy = -1; dy <= 1; dy++)
            for (int dz = -1; dz <= 1; dz++)
            {
                uint start = CellStart[HashCell(cell + int3(dx, dy, dz))];
                uint end   = CellEnd[HashCell(cell + int3(dx, dy, dz))];
                for (uint j = start; j < end; j++)
                {
                    if (j == i) continue;
                    float3 dir = pi - PredictedPositions[j];
                    float r = length(dir);
                    if (r < 1e-6) continue;

                    float sCorr = -SurfaceTensionK
                        * pow(WPoly6(r, SmoothingRadius)
                              / WPoly6(SurfaceTensionDeltaQ * SmoothingRadius, SmoothingRadius),
                              SurfaceTensionN);

                    delta += (Lambdas[i] + Lambdas[j] + sCorr)
                           * GradWspiky(dir, SmoothingRadius);
                }
            }

    PositionDeltas[i] = delta / RestDensity;
}
```

> 三次 dispatch（密度 → $\lambda$ → 位置修正）构成一次迭代，外层循环 `solverIterations` 次。Niagara 的 GPU 粒子栈与 Compute Shader 管线可承载此流水线，参数体系见&#12298;[UE Niagara 基础参数详解](/knowledge/ue-niagara-parameters/)&#12299;。

---

## 十一、与 SPH 的对比

| 特性 | SPH | PBF |
|------|-----|-----|
| 求解方式 | 基于力，显式积分 | 基于约束，迭代投影 |
| 稳定性 | 条件稳定，受 CFL 限制 | 无条件稳定 |
| 不可压缩性 | WCSPH 弱；IISPH/DFSPH 强 | 迭代近似（迭代次数控制） |
| 时间步长 | 小（~0.0001 s） | 大（~0.016 s） |
| 参数敏感性 | 压力刚度敏感 | 参数鲁棒 |
| 物理精度 | 高（直接求解 NS） | 中（约束近似） |
| 粘度 | 物理粘度力（拉普拉斯） | XSPH 速度平均 |
| 表面张力 | color-field 曲率法 | 人工修正项 $s_{\text{corr}}$ |
| 适用场景 | 科学计算、影视特效 | 游戏、实时交互 |

**核心差异的数学表达**：

SPH（基于力）：

$$
\mathbf{a}_i = -\frac{1}{\rho_i}\nabla p_i + \nu\nabla^2\mathbf{v}_i + \mathbf{g}, \quad \mathbf{v}_i^{n+1} = \mathbf{v}_i^n + \Delta t\,\mathbf{a}_i, \quad \mathbf{x}_i^{n+1} = \mathbf{x}_i^n + \Delta t\,\mathbf{v}_i^{n+1}
$$

PBF（基于约束）：

$$
\mathbf{x}_i^* = \mathbf{x}_i + \Delta t\,\mathbf{v}_i \quad\text{（预测）}
$$

$$
\lambda_i = -\frac{C_i}{\sum_k|\nabla_{\mathbf{p}_k}C_i|^2 + \varepsilon}, \quad \Delta\mathbf{x}_i = \frac{1}{\rho_0}\sum_j(\lambda_i+\lambda_j)\nabla W_{ij} \quad\text{（投影）}
$$

$$
\mathbf{v}_i = \frac{\mathbf{x}_i^* - \mathbf{x}_i}{\Delta t}, \quad \mathbf{x}_i = \mathbf{x}_i^* \quad\text{（更新）}
$$

**选择建议**：

- **选 SPH**：需要物理精度、科学计算、离线渲染，能接受小步长。完整推导见&#12298;[SPH 流体模拟详解](/knowledge/sph-fluid-simulation/)&#12299;。
- **选 PBF**：需要实时性能、游戏应用、交互模拟，可接受近似不可压缩性。

---

## 十二、参考文献

1. Macklin, M., & Müller, M. (2013). *Position Based Fluids*. ACM Transactions on Graphics, 32(4), 104. ——PBF 原始论文。
2. Müller, M., Heidelberger, B., Hennix, M., & Ratcliff, J. (2007). *Position Based Dynamics*. Journal of Visual Communication and Image Representation, 18(2), 109–118. ——PBD 框架。
3. Monaghan, J. J. (1992). *Smoothed Particle Hydrodynamics*. Annual Review of Astronomy and Astrophysics, 30(1), 543–574. ——SPH 理论基础。
4. Macklin, M., & Müller, M. (2013). *Position Based Fluids: Supplementary Material*. ——XSPH 粘度与涡度约束实现细节。
5. Bender, J., Müller, M., & Macklin, M. (2017). *A Survey on Position Based Dynamics*. Eurographics Tutorials. ——PBD/PBF 综述。
6. Macklin, M., Müller, M., & Chentanez, N. (2016). *XPBD: Position-Based Simulation of Compliant Constrained Dynamics*. ——XPBD 刚度控制。
