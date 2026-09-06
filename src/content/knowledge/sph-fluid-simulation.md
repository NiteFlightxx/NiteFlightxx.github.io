---
title: "SPH 流体模拟详解 — 从核函数插值到 Navier-Stokes 离散与不可压缩变体"
excerpt: "系统剖析光滑粒子流体动力学（SPH）：从拉格朗日插值原理与 Navier-Stokes 方程离散，到 Poly6/Spiky/Viscosity/Cubic Spline 核函数及其梯度与拉普拉斯的完整推导与实现、对称压力力的动量守恒推导、表面张力 color-field 方法、CFL 稳定性条件，以及 PCISPH/IISPH/DFSPH 不可压缩变体的压力 Poisson 方程要点。"
date: "2026-09-06"
category: "Physics"
subtopic: "Fluid"
tags: ["SPH", "流体模拟", "Navier-Stokes", "核函数", "C++"]
readTime: "阅读约50分钟"
---

> **光滑粒子流体动力学（Smoothed Particle Hydrodynamics, SPH）** 是一种无网格拉格朗日粒子方法，由 Lucy (1977) 与 Gingold & Monaghan (1977) 为天体物理模拟独立提出，后经 Müller 等人 (2003) 引入计算机图形学。它将连续流体场离散为携带物理属性的粒子，通过核函数插值近似连续场，再把 Navier-Stokes 方程中的微分算子转化为粒子求和。
>
> 本文系统推导 SPH 的理论内核——核函数插值、微分算子离散、对称压力力的动量守恒推导、表面张力 color-field 方法，并补全原工程文档中缺失的 `LaplacianWpoly6` 与 Cubic Spline 核的代码实现。不可压缩变体（PCISPH/IISPH/DFSPH）部分补充了压力 Poisson 方程的关键要点。文末与&#12298;[PBF 流体模拟详解](/knowledge/pbf-fluid-simulation/)&#12299;（位置基约束视角）、&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;（时间积分与 XPBD）形成交叉引用。

---

## 一、引言：无网格拉格朗日方法

### 1.1 拉格朗日视角与连续介质假设

流体力学有两种等价的描述方式：

| 视角 | 描述 | 特点 |
|------|------|------|
| **欧拉（Eulerian）** | 固定空间点观察流体流过 | 依赖网格，适合有限体积/有限差分法 |
| **拉格朗日（Lagrangian）** | 跟随流体质点运动 | 无网格，SPH 采用此方式 |

SPH 采用拉格朗日视角：每个粒子代表一小块流体，携带质量 $m$、速度 $\mathbf{v}$、密度 $\rho$ 等属性，随流体一起运动。这带来三个天然优势——无需追踪自由表面（粒子边界即流体边界）、自然处理大变形、易于并行。

SPH 基于连续介质力学假设，流体可用场函数描述：密度场 $\rho(\mathbf{r},t)$、速度场 $\mathbf{v}(\mathbf{r},t)$、压力场 $p(\mathbf{r},t)$。

### 1.2 SPH 插值原理

SPH 的核心思想是：任意物理量 $A$ 在位置 $\mathbf{r}$ 处的值，可通过核函数加权求和来近似。

连续形式的插值积分：

$$
A(\mathbf{r}) = \int_{\Omega} A(\mathbf{r}') W(\mathbf{r} - \mathbf{r}', h) \, d\mathbf{r}'
$$

离散化为粒子求和：

$$
A_i = \sum_j \frac{m_j}{\rho_j} A_j W(\mathbf{r}_i - \mathbf{r}_j, h)
$$

其中 $W$ 是核函数（光滑核），$h$ 是光滑长度（支撑半径），$\frac{m_j}{\rho_j}$ 是粒子 $j$ 的体积元，起积分权重的作用。物理意义是：每个粒子对周围空间的贡献由核函数加权，距离越近贡献越大。

### 1.3 微分算子的 SPH 离散

SPH 的强大之处在于可将微分算子直接转化为粒子求和。设 $W_{ij} = W(\mathbf{r}_i - \mathbf{r}_j, h)$：

**梯度**（一阶导数）：

$$
\nabla A_i = \sum_j \frac{m_j}{\rho_j} A_j \nabla W_{ij}
$$

**散度**：

$$
\nabla \cdot \mathbf{A}_i = \sum_j \frac{m_j}{\rho_j} \mathbf{A}_j \cdot \nabla W_{ij}
$$

**拉普拉斯**（二阶导数）：

$$
\nabla^2 A_i = \sum_j \frac{m_j}{\rho_j} (A_j - A_i) \nabla^2 W_{ij}
$$

注意拉普拉斯算子使用差分形式 $(A_j - A_i)$ 而非直接 $\nabla^2 W_{ij}$ 乘 $A_j$，这使得常数场的拉普拉斯严格为零，避免数值噪声。

---

## 二、Navier-Stokes 方程与状态方程

### 2.1 质量守恒与动量守恒

SPH 模拟的目标是求解描述粘性流体运动的 Navier-Stokes 方程。

**质量守恒（连续性方程）**：

$$
\frac{D\rho}{Dt} + \rho \nabla \cdot \mathbf{v} = 0
$$

**动量守恒**：

$$
\rho \frac{D\mathbf{v}}{Dt} = -\nabla p + \mu \nabla^2 \mathbf{v} + \mathbf{f}
$$

其中 $\frac{D}{Dt} = \frac{\partial}{\partial t} + \mathbf{v}\cdot\nabla$ 是物质导数（拉格朗日导数），$\rho$ 为密度，$\mathbf{v}$ 为速度，$p$ 为压力，$\mu$ 为动力粘度，$\mathbf{f}$ 为外力（如重力）。

### 2.2 力的分解

将动量方程改写为单位质量的加速度形式：

$$
\frac{D\mathbf{v}}{Dt} = -\frac{1}{\rho}\nabla p + \nu \nabla^2 \mathbf{v} + \frac{\mathbf{f}}{\rho}
$$

其中 $\nu = \mu/\rho$ 是运动粘度。等号右侧三项分别对应：

1. **压力项** $\mathbf{f}^{\text{pressure}} = -\nabla p$——驱动流体从高压区流向低压区，维持不可压缩性。
2. **粘度项** $\mathbf{f}^{\text{viscosity}} = \mu \nabla^2 \mathbf{v}$——使速度场趋于均匀，模拟流体内摩擦。
3. **外力项** $\mathbf{f}^{\text{external}}$——重力、用户交互力等。

### 2.3 状态方程

对于**弱可压缩 SPH（WCSPH）**，压力不由 Poisson 方程求解，而是通过状态方程从密度直接计算。

**Tait 状态方程**（常用于水）：

$$
p = B\left[\left(\frac{\rho}{\rho_0}\right)^{\gamma} - 1\right]
$$

其中 $B = \frac{\rho_0 c_s^2}{\gamma}$ 为压力刚度系数，$\rho_0$ 为静止密度，$\gamma$ 通常取 7，$c_s$ 为人工声速。

**线性状态方程**（简化形式，常用于实时应用）：

$$
p = k(\rho - \rho_0)
$$

其中 $k$ 为压力刚度。线性形式计算量更小、参数更易调，但非线性区精度不如 Tait 方程。

---

## 三、核函数详解

核函数是 SPH 的核心，决定了粒子间的影响范围和权重分布。一个有效的核函数须满足归一化、紧支撑、对称、正定、单调递减等性质，并在 $h\to 0$ 时收敛到 Dirac delta 函数。

### 3.1 核函数基本性质

| 性质 | 数学表述 | 意义 |
|------|----------|------|
| 归一化 | $\int_{\Omega} W(\mathbf{r},h)\,d\mathbf{r} = 1$ | 守恒常量场 |
| 紧支撑 | $W(\mathbf{r},h) = 0$ 当 $|\mathbf{r}| > h$ | 有限邻域，可计算 |
| 对称性 | $W(\mathbf{r},h) = W(|\mathbf{r}|,h)$ | 各向同性 |
| 正定性 | $W(\mathbf{r},h) \ge 0$ | 物理合理 |
| Delta 极限 | $\lim_{h\to 0} W(\mathbf{r},h) = \delta(\mathbf{r})$ | 收敛到连续场 |
| 单调递减 | $W(r_1,h) > W(r_2,h)$ 当 $r_1 < r_2$ | 近邻权重大 |

### 3.2 Poly6 核函数

**用途**：密度计算、颜色场（表面张力）。

$$
W_{\text{poly6}}(r, h) = \begin{cases} \dfrac{315}{64\pi h^9}(h^2 - r^2)^3 & 0 \le r \le h \\ 0 & \text{otherwise} \end{cases}
$$

**梯度**（向量形式，$\mathbf{r}$ 为粒子位置差向量）：

$$
\nabla W_{\text{poly6}}(r, h) = -\dfrac{945}{32\pi h^9}(h^2 - r^2)^2 \, \mathbf{r}
$$

**拉普拉斯**：

$$
\nabla^2 W_{\text{poly6}}(r, h) = -\dfrac{945}{32\pi h^9}(h^2 - r^2)(3h^2 - 7r^2)
$$

> **为什么 Poly6 不适合压力计算**：在 $r = 0$ 处梯度为零，意味着当两个粒子非常接近时压力梯度力趋近于零，无法将它们推开，导致粒子聚集（clustering）。因此 Poly6 仅用于密度与颜色场，压力梯度改用 Spiky 核。

**C++ 实现**（含梯度与拉普拉斯）：

```cpp
// Poly6 核函数值
float Wpoly6(float r, float h)
{
    if (r > h) return 0.0f;

    float h2 = h * h;
    float diff = h2 - r * r;

    // 315 / (64 * PI * h^9)
    float coeff = 315.0f / (64.0f * PI * FMath::Pow(h, 9));
    return coeff * diff * diff * diff;
}

// Poly6 梯度（向量形式，r 为粒子位置差 pi - pj）
FVector GradWpoly6(const FVector& r, float h)
{
    float rLen = r.Size();
    if (rLen > h || rLen < SMALL_NUMBER) return FVector::ZeroVector;

    float h2 = h * h;
    float diff = h2 - rLen * rLen;

    // -945 / (32 * PI * h^9)
    float coeff = -945.0f / (32.0f * PI * FMath::Pow(h, 9));
    return coeff * diff * diff * r;
}

// Poly6 拉普拉斯（标量形式）
// 原文档此处缺失实现，补全：用于表面张力颜色场曲率计算
float LaplacianWpoly6(float r, float h)
{
    if (r > h) return 0.0f;

    float h2 = h * h;
    float r2 = r * r;
    float diff = h2 - r2;

    // -945 / (32 * PI * h^9) * (h^2 - r^2) * (3h^2 - 7r^2)
    float coeff = -945.0f / (32.0f * PI * FMath::Pow(h, 9));
    return coeff * diff * (3.0f * h2 - 7.0f * r2);
}
```

### 3.3 Spiky 核函数

**用途**：压力梯度计算。

$$
W_{\text{spiky}}(r, h) = \begin{cases} \dfrac{15}{\pi h^6}(h - r)^3 & 0 \le r \le h \\ 0 & \text{otherwise} \end{cases}
$$

**梯度**：

$$
\nabla W_{\text{spiky}}(\mathbf{r}, h) = \begin{cases} -\dfrac{45}{\pi h^6}(h - r)^2 \dfrac{\mathbf{r}}{|\mathbf{r}|} & 0 < r \le h \\ \mathbf{0} & \text{otherwise} \end{cases}
$$

**特点**：在 $r \to 0$ 时梯度不为零且达到最大值，能有效防止粒子聚集。Spiky 核是专门为压力计算设计的核函数。

**C++ 实现**：

```cpp
float Wspiky(float r, float h)
{
    if (r > h) return 0.0f;

    float diff = h - r;
    // 15 / (PI * h^6)
    float coeff = 15.0f / (PI * FMath::Pow(h, 6));
    return coeff * diff * diff * diff;
}

FVector GradWspiky(const FVector& r, float h)
{
    float rLen = r.Size();
    if (rLen > h || rLen < SMALL_NUMBER) return FVector::ZeroVector;

    float diff = h - rLen;
    // -45 / (PI * h^6)
    float coeff = -45.0f / (PI * FMath::Pow(h, 6));
    return coeff * diff * diff * (r / rLen);
}
```

### 3.4 Viscosity 核函数

**用途**：粘度拉普拉斯计算。

$$
W_{\text{viscosity}}(r, h) = \begin{cases} \dfrac{15}{2\pi h^3}\left(-\dfrac{r^3}{2h^3} + \dfrac{r^2}{h^2} + \dfrac{h}{2r} - 1\right) & 0 < r \le h \\ 0 & \text{otherwise} \end{cases}
$$

**拉普拉斯**：

$$
\nabla^2 W_{\text{viscosity}}(r, h) = \begin{cases} \dfrac{45}{\pi h^6}(h - r) & 0 \le r \le h \\ 0 & \text{otherwise} \end{cases}
$$

**特点**：拉普拉斯始终为正，保证粘度力方向正确——减速较快的粒子、加速较慢的粒子。Poly6 和 Spiky 的拉普拉斯在某些区域为负，会导致粘度力方向错误（加速而非减速），因此粘度项需要专门的 Viscosity 核。

**C++ 实现**：

```cpp
float LaplacianWviscosity(float r, float h)
{
    if (r > h) return 0.0f;

    // 45 / (PI * h^6) * (h - r)
    float coeff = 45.0f / (PI * FMath::Pow(h, 6));
    return coeff * (h - r);
}
```

### 3.5 Cubic Spline 核函数

**用途**：通用核函数，广泛用于科学计算，是 Monaghan 提出的标准样条核。

以 $q = r/h$ 为归一化距离：

$$
W_{\text{cubic}}(q) = \sigma \begin{cases} 1 - \dfrac{3}{2}q^2 + \dfrac{3}{4}q^3 & 0 \le q < 1 \\ \dfrac{1}{4}(2 - q)^3 & 1 \le q < 2 \\ 0 & q \ge 2 \end{cases}
$$

归一化常数 $\sigma$ 依维度不同：

| 维度 | $\sigma$ |
|------|----------|
| 1D | $\dfrac{2}{3h}$ |
| 2D | $\dfrac{10}{7\pi h^2}$ |
| 3D | $\dfrac{1}{\pi h^3}$ |

**梯度**（对 $q$ 求导后乘 $\sigma/h$，方向沿 $\mathbf{r}/|\mathbf{r}|$）：

$$
\nabla W_{\text{cubic}}(\mathbf{r}, h) = \frac{\sigma}{h} \begin{cases} \left(-3q + \dfrac{9}{4}q^2\right)\dfrac{\mathbf{r}}{|\mathbf{r}|} & 0 \le q < 1 \\ -\dfrac{3}{4}(2-q)^2 \dfrac{\mathbf{r}}{|\mathbf{r}|} & 1 \le q < 2 \\ \mathbf{0} & q \ge 2 \end{cases}
$$

**特点**：

- 支撑半径为 $2h$（注意：使用 Cubic Spline 时邻域搜索半径须翻倍）。
- 二阶连续可微（$C^2$），数值稳定性优于 Poly6。
- 在科学计算 SPH 中是标准选择；图形学中因 Poly6/Spiky/Viscosity 的分工更细而常被替代。

**C++ 实现**（3D，含梯度）：

```cpp
// Cubic Spline 核函数值（3D，sigma = 1/(PI*h^3)），支撑半径 2h
float WCubicSpline(float r, float h)
{
    if (r >= 2.0f * h) return 0.0f;

    float q = r / h;
    float sigma = 1.0f / (PI * FMath::Pow(h, 3));

    if (q < 1.0f)
    {
        return sigma * (1.0f - 1.5f * q * q + 0.75f * q * q * q);
    }
    else
    {
        float tmp = 2.0f - q;
        return sigma * 0.25f * tmp * tmp * tmp;
    }
}

// Cubic Spline 梯度（3D，向量形式）
FVector GradWCubicSpline(const FVector& r, float h)
{
    float rLen = r.Size();
    if (rLen >= 2.0f * h || rLen < SMALL_NUMBER) return FVector::ZeroVector;

    float q = rLen / h;
    float sigmaOverH = 1.0f / (PI * FMath::Pow(h, 4)); // sigma / h
    float dq;

    if (q < 1.0f)
    {
        dq = -3.0f * q + 2.25f * q * q; // -3q + (9/4)q^2
    }
    else
    {
        float tmp = 2.0f - q;
        dq = -0.75f * tmp * tmp; // -3/4 * (2-q)^2
    }

    return sigmaOverH * dq * (r / rLen);
}
```

### 3.6 核函数选择总结

| 核函数 | 用途 | 关键性质 | 支撑半径 |
|--------|------|----------|----------|
| **Poly6** | 密度、颜色场 | $r=0$ 处梯度为零，平滑稳定 | $h$ |
| **Spiky** | 压力梯度 | $r\to 0$ 时梯度最大，防聚集 | $h$ |
| **Viscosity** | 粘度拉普拉斯 | 拉普拉斯恒正，力方向正确 | $h$ |
| **Cubic Spline** | 通用 | $C^2$ 连续，科学计算标准 | $2h$ |

---

## 四、力的计算

每个粒子受到的总力为各项之和：

$$
\mathbf{F}_i = \mathbf{F}_i^{\text{pressure}} + \mathbf{F}_i^{\text{viscosity}} + \mathbf{F}_i^{\text{external}} + \mathbf{F}_i^{\text{surface}}
$$

### 4.1 压力力与对称性推导

压力梯度的 SPH 离散化需要特殊处理以保证对称性（牛顿第三定律），否则动量不守恒。

**原始（不对称）形式**直接离散 $-\frac{1}{\rho}\nabla p$ 会导致不满足 $\mathbf{F}_{ij} = -\mathbf{F}_{ji}$。利用恒等式：

$$
\frac{\nabla p}{\rho} = \nabla\left(\frac{p}{\rho}\right) + \frac{p}{\rho^2}\nabla\rho
$$

对每一项做 SPH 离散后取对称平均，得到**对称压力力**：

$$
\mathbf{F}_i^{\text{pressure}} = -m_i \sum_j m_j \left(\frac{p_i}{\rho_i^2} + \frac{p_j}{\rho_j^2}\right) \nabla W_{\text{spiky}}(\mathbf{r}_i - \mathbf{r}_j, h)
$$

**推导要点**：由于 $\nabla_i W_{ij} = -\nabla_j W_{ji}$（核函数对称、梯度反对称），对换 $i, j$ 后 $\mathbf{F}_j$ 中来自 $i$ 的项恰好与 $\mathbf{F}_i$ 中来自 $j$ 的项等大反向，从而满足牛顿第三定律，保证系统动量守恒。

**C++ 实现**：

```cpp
FVector CalculatePressureForce(int32 i)
{
    FVector force = FVector::ZeroVector;
    const FSPHParticle& Pi = Particles[i];

    for (int32 j : Pi.Neighbors)
    {
        if (i == j) continue;

        const FSPHParticle& Pj = Particles[j];
        // 对称压力项
        float pressureTerm = Pi.Pressure / (Pi.Density * Pi.Density)
                          + Pj.Pressure / (Pj.Density * Pj.Density);

        FVector gradW = GradWspiky(Pi.Position - Pj.Position, SmoothingRadius);
        force -= ParticleMass * ParticleMass * pressureTerm * gradW;
    }

    return force;
}
```

### 4.2 粘度力

粘度项 $\mu \nabla^2 \mathbf{v}$ 的 SPH 离散化采用速度差形式以保证伽利略不变性：

$$
\mathbf{F}_i^{\text{viscosity}} = \mu \, m_i \sum_j \frac{m_j}{\rho_j}(\mathbf{v}_j - \mathbf{v}_i)\,\nabla^2 W_{\text{viscosity}}(|\mathbf{r}_i - \mathbf{r}_j|, h)
$$

**为什么使用速度差** $(\mathbf{v}_j - \mathbf{v}_i)$：

- 直接使用 $\nabla^2 \mathbf{v}$ 的离散形式不满足伽利略不变性（整体平移会引入误差）。
- 使用相对速度保证粘度力只依赖于粒子间的相对运动，整体刚体平移时粘度力为零。
- Viscosity 核的拉普拉斯恒正，配合速度差使粘度力总是减速相对运动较快的粒子、加速较慢的粒子。

**C++ 实现**：

```cpp
FVector CalculateViscosityForce(int32 i)
{
    FVector force = FVector::ZeroVector;
    const FSPHParticle& Pi = Particles[i];

    for (int32 j : Pi.Neighbors)
    {
        if (i == j) continue;

        const FSPHParticle& Pj = Particles[j];
        FVector velocityDiff = Pj.Velocity - Pi.Velocity;
        float r = FVector::Distance(Pi.Position, Pj.Position);
        float laplacianW = LaplacianWviscosity(r, SmoothingRadius);

        force += Viscosity * ParticleMass * (velocityDiff / Pj.Density) * laplacianW;
    }

    return force;
}
```

### 4.3 表面张力（color-field 方法）

表面张力使流体表面趋于最小化，产生水滴、毛细管等效果。Müller (2003) 的 color-field 方法通过颜色场的梯度与拉普拉斯来检测表面并计算曲率。

定义颜色场（流体内部为 1，外部为 0）的 SPH 插值：

$$
c_i = \sum_j \frac{m_j}{\rho_j} W(\mathbf{r}_i - \mathbf{r}_j, h)
$$

在流体内部，邻居对称分布，$c_i$ 趋于常数；在表面附近，外侧缺失邻居，$c_i$ 出现梯度。

**表面法向量**（颜色场梯度）：

$$
\mathbf{n}_i = \nabla c_i = \sum_j \frac{m_j}{\rho_j} \nabla W(\mathbf{r}_i - \mathbf{r}_j, h)
$$

**曲率**（颜色场拉普拉斯与法向量模长之比）：

$$
\kappa_i = -\frac{\nabla^2 c_i}{|\mathbf{n}_i|}
$$

**表面张力**：

$$
\mathbf{F}_i^{\text{surface}} = \sigma \, \kappa_i \, \mathbf{n}_i
$$

其中 $\sigma$ 是表面张力系数。当 $|\mathbf{n}_i|$ 小于阈值时（粒子处于流体内部深处），表面张力为零。

**C++ 实现**：

```cpp
FVector CalculateSurfaceTension(int32 i)
{
    const FSPHParticle& Pi = Particles[i];
    FVector normal = FVector::ZeroVector;
    float colorLaplacian = 0.0f;

    for (int32 j : Pi.Neighbors)
    {
        const FSPHParticle& Pj = Particles[j];
        FVector r = Pi.Position - Pj.Position;
        float rLen = r.Size();

        float factor = ParticleMass / Pj.Density;
        normal += factor * GradWpoly6(r, SmoothingRadius);
        colorLaplacian += factor * LaplacianWpoly6(rLen, SmoothingRadius);
    }

    float normalLength = normal.Size();
    if (normalLength < SurfaceThreshold) return FVector::ZeroVector;

    float curvature = -colorLaplacian / normalLength;
    return SurfaceTension * curvature * normal;
}
```

> 此处 `LaplacianWpoly6` 的实现见 §3.2，是原工程文档中缺失的部分——表面张力函数调用了它但未给出定义。

### 4.4 外力

外力直接作用于粒子（以重力为例）：

$$
\mathbf{F}_i^{\text{external}} = m_i \mathbf{g} + \mathbf{F}_{\text{user}}
$$

```cpp
FVector externalForce = ParticleMass * Gravity; // Gravity = FVector(0, 0, -980.0f)
```

---

## 五、密度与压力的计算

### 5.1 密度

每个粒子的密度通过邻居粒子加权求和：

$$
\rho_i = \sum_j m_j W_{\text{poly6}}(\mathbf{r}_i - \mathbf{r}_j, h)
$$

求和包含粒子 $i$ 自身（$j = i$ 时 $W(0, h) \ne 0$）。

```cpp
void ComputeDensityPressure()
{
    ParallelFor(Particles.Num(), [&](int32 i)
    {
        FSPHParticle& Pi = Particles[i];
        float density = 0.0f;

        for (int32 j : Pi.Neighbors)
        {
            const FSPHParticle& Pj = Particles[j];
            float r = FVector::Distance(Pi.Position, Pj.Position);
            density += ParticleMass * Wpoly6(r, SmoothingRadius);
        }
        // 自身贡献已在 Neighbors 中包含 j == i；若邻居列表不含自身，需额外加 ParticleMass * Wpoly6(0, h)

        Pi.Density = density;
        Pi.Pressure = PressureStiffness * (Pi.Density - RestDensity);
    });
}
```

### 5.2 压力

通过状态方程从密度计算压力（见 §2.3）：

```cpp
float CalculatePressure(float density)
{
    // 线性状态方程
    return PressureStiffness * (density - RestDensity);

    // 或 Tait 状态方程：
    // float ratio = density / RestDensity;
    // return PressureStiffness * (FMath::Pow(ratio, 7.0f) - 1.0f);
}
```

---

## 六、算法流程与时间积分

### 6.1 标准 SPH 算法步骤

```
初始化:
    设置粒子位置、速度、质量
    计算初始密度和压力

for each time step:
    1. 邻域搜索（空间哈希或均匀网格）
    2. 计算密度  ρᵢ = Σⱼ mⱼ W_poly6(rᵢ - rⱼ, h)
    3. 计算压力  pᵢ = k(ρᵢ - ρ₀)  或  pᵢ = B[(ρᵢ/ρ₀)^γ - 1]
    4. 计算力    Fᵢ = F_pressure + F_viscosity + F_external + F_surface
    5. 时间积分  vᵢ ← vᵢ + Δt·(Fᵢ/mᵢ),  xᵢ ← xᵢ + Δt·vᵢ
    6. 边界处理
```

### 6.2 时间积分方案

最常用的是**半隐式欧拉（Symplectic Euler）**——先更新速度再更新位置，对耗散系统稳定且保辛：

$$
\mathbf{v}_i^{n+1} = \mathbf{v}_i^n + \Delta t \,\frac{\mathbf{F}_i}{m_i}
$$

$$
\mathbf{x}_i^{n+1} = \mathbf{x}_i^n + \Delta t \,\mathbf{v}_i^{n+1}
$$

```cpp
void Integrate()
{
    for (auto& Particle : Particles)
    {
        Particle.Velocity += DeltaTime * Particle.Acceleration;
        Particle.Position += DeltaTime * Particle.Velocity;
    }
}
```

> 对积分器精度与稳定性的系统分析——显式/隐式/半隐式欧拉、Verlet、RK4 的稳定性域与精度阶——见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。SPH 因 CFL 条件限制（见 §8.1）通常采用半隐式欧拉或 leapfrog；对于碰撞/约束耦合场景，可结合 XPBD 的 predict-correct 流水线。

### 6.3 完整模拟步骤

```cpp
struct FSPHParticle
{
    FVector Position;
    FVector Velocity;
    FVector Acceleration;
    float   Density;
    float   Pressure;
    float   Mass;
    TArray<int32> Neighbors;
};

void SimulationStep()
{
    FindNeighbors();
    ComputeDensityPressure();
    ComputeForces();
    Integrate();
    HandleBoundaries();
}
```

---

## 七、边界处理

边界处理是 SPH 的难点：处理不当会导致粒子穿透或不自然行为，且边界附近因缺失邻居使密度计算偏低、压力不足。

### 7.1 简单反弹边界

检测越界并反弹，沿法向施加恢复系数、沿切向施加摩擦：

```cpp
void SimpleBoundary(FVector& Position, FVector& Velocity,
                    const FVector& Min, const FVector& Max,
                    float Restitution, float Friction)
{
    for (int32 axis = 0; axis < 3; axis++)
    {
        if (Position[axis] < Min[axis])
        {
            Position[axis] = Min[axis];
            Velocity[axis] *= -Restitution;
            // 切向摩擦（对另外两轴）
            for (int32 t = 0; t < 3; t++)
                if (t != axis) Velocity[t] *= (1.0f - Friction);
        }
        else if (Position[axis] > Max[axis])
        {
            Position[axis] = Max[axis];
            Velocity[axis] *= -Restitution;
            for (int32 t = 0; t < 3; t++)
                if (t != axis) Velocity[t] *= (1.0f - Friction);
        }
    }
}
```

**缺点**：边界附近密度计算不准确（缺少外部邻居），导致压力偏低、粒子易穿透。

### 7.2 虚拟边界粒子（Ghost Particles）

在边界外放置多层虚拟粒子，参与密度与力的计算但不移动，模拟被"切掉"的邻居：

```cpp
void CreateBoundaryParticles()
{
    float Spacing = SmoothingRadius / 2.0f;
    int32 Layers = 3;

    for (int32 Layer = 0; Layer < Layers; Layer++)
    {
        float Offset = (Layer + 1) * Spacing;
        // 底部边界：在 z = BoundsMin.Z - Offset 处铺设粒子层
        for (float x = BoundsMin.X; x <= BoundsMax.X; x += Spacing)
        {
            for (float y = BoundsMin.Y; y <= BoundsMax.Y; y += Spacing)
            {
                FVector Pos(x, y, BoundsMin.Z - Offset);
                BoundaryParticles.Add(FSPHParticle{Pos, FVector::ZeroVector});
            }
        }
        // 其他五个边界类似...
    }
}
```

**优点**：边界附近密度计算更准确，压力自然形成排斥。**缺点**：增加计算量与内存。

### 7.3 边界力方法

使用 Lennard-Jones 型势能产生排斥力，当粒子接近边界时施加方向力：

$$
\mathbf{F}_{\text{boundary}} = D\left[\left(\frac{r_0}{d}\right)^{n_1} - \left(\frac{r_0}{d}\right)^{n_2}\right] \mathbf{n}
$$

其中 $d$ 为粒子到边界的距离，$r_0$ 为截断距离，$D$ 为力强度，$\mathbf{n}$ 为边界法向，$n_1, n_2$ 通常取 12 和 6。

### 7.4 密度校正（Shepard 滤波）

在边界或自由表面附近，核函数积分不再归一化（邻居不完整），可用 Shepard 校正因子补偿：

$$
\gamma_i = \sum_j \frac{m_j}{\rho_j} W_{ij}
$$

$$
\rho_i^{\text{corrected}} = \frac{\rho_i}{\gamma_i}
$$

当邻居完整时 $\gamma_i \approx 1$；当邻居缺失时 $\gamma_i < 1$，校正后密度更接近真实值。

---

## 八、不可压缩 SPH 变体

标准 WCSPH 是弱可压缩的：需要很高的压力刚度才能近似不可压缩，而高刚度导致声速 $c_s = \sqrt{k/\rho_0}$ 增大、CFL 时间步长急剧缩小。以下三种变体用不同策略实现强不可压缩。

### 8.1 WCSPH 的局限

WCSPH 的密度压缩率 $\Delta\rho/\rho_0$ 由状态方程刚度决定。要使密度波动小于 1%，需要 $c_s$ 远大于最大流速 $v_{\max}$（通常 $c_s \ge 10\,v_{\max}$），而 CFL 条件 $\Delta t \le \lambda h / (c_s + v_{\max})$ 使时间步长受限。这就是 PCISPH/IISPH/DFSPH 的改进动机。

### 8.2 PCISPH（Predictive-Corrective Incompressible SPH）

**核心思想**：预测-校正迭代。先在不考虑压力的情况下预测位置与密度，再迭代调整压力直到密度误差低于阈值。

**算法流程**：

```
1. 预测位置和速度（暂不计压力力）
2. while (maxDensityError > threshold):
       计算预测密度 ρ* 与误差 ρ_err = ρ* - ρ₀
       更新压力  pᵢ^(l+1) = pᵢ^(l) + δ · ρ_err,i
       由压力力校正速度和位置
3. 更新最终状态
```

**压力更新公式**：

$$
p_i^{(l+1)} = p_i^{(l)} + \delta \cdot \rho_{\text{err},i}
$$

其中 $\delta$ 是预计算的缩放因子，由核函数与粒子间距推导得到，使得一步校正恰好消除密度误差的线性主部。PCISPH 允许比 WCSPH 大一到两个数量级的时间步长。

### 8.3 IISPH（Implicit Incompressible SPH）

**核心思想**：隐式求解压力 Poisson 方程，而非显式状态方程。

**压力 Poisson 方程**：

$$
\nabla^2 p = \frac{\rho_0 - \rho^*}{\Delta t^2}
$$

其中 $\rho^*$ 是预测密度（无压力预测后由连续性方程算出）。此方程离散后形成一个线性系统 $\mathbf{A}\mathbf{p} = \mathbf{b}$，矩阵 $\mathbf{A}$ 的元素由核函数梯度与粒子体积构成，通常用 Jacobi 或 CG 迭代求解。

**优点**：

- 时间步长可达 WCSPH 的 10–100 倍。
- 不可压缩性强（密度波动可控制在 0.1% 以内）。
- 适合需要精确不可压缩性的离线模拟。

**代价**：每步需解线性系统，单步成本高，但总时间步数大幅减少。

### 8.4 DFSPH（Divergence-Free SPH）

**核心思想**：同时满足两个约束——密度不变 $\frac{D\rho}{Dt} = 0$（密度不变型）和速度散度为零 $\nabla \cdot \mathbf{v} = 0$（散度自由型），可分别或联合求解。

**两个约束**：

$$
\frac{D\rho}{Dt} = 0 \quad\text{（密度不变）}
$$

$$
\nabla \cdot \mathbf{v} = 0 \quad\text{（散度自由）}
$$

**算法流程**：

```
1. 预测速度（无压力）
2. 迭代校正速度散度 → 解  ∇²p = ρ/Δt · ∇·v*（散度自由步）
3. 更新位置
4. 迭代校正密度误差 → 解  ∇²p = (ρ₀ - ρ*)/Δt²（密度不变步）
```

两个 Poisson 方程形式类似 IISPH 但物理含义不同：散度自由步约束速度场，密度不变步约束位置场。DFSPH 结合二者可获得极高质量的不可压缩性与数值稳定性，是当前最高质量的 SPH 变体之一。

### 8.5 变体对比

| 方法 | 时间步长 | 不可压缩性 | 单步成本 | 适用场景 |
|------|----------|------------|----------|----------|
| **WCSPH** | 小（受 CFL 限制） | 弱（1–5% 压缩） | 低 | 简单场景、原型验证 |
| **PCISPH** | 中 | 强（< 1%） | 中 | 一般交互应用 |
| **IISPH** | 大 | 强（< 0.1%） | 高（解线性系统） | 精确离线模拟 |
| **DFSPH** | 大 | 很强（双重约束） | 高 | 高质量渲染、影视 |

---

## 九、稳定性与参数调优

### 9.1 CFL 条件

SPH 的显式时间积分稳定性要求时间步长满足 CFL 条件：

$$
\Delta t \le \lambda \,\frac{h}{c_s + v_{\max}}
$$

其中 $\lambda \approx 0.4$ 为安全系数，$c_s = \sqrt{k/\rho_0}$ 为声速，$v_{\max}$ 为最大粒子速度。物理含义是：信息传播距离（$\Delta t \cdot (c_s + v_{\max})$）不应超过光滑长度 $h$。

**自适应时间步长**：

```cpp
float CalculateTimeStep()
{
    float maxVelocity = 0.0f;
    for (const auto& Particle : Particles)
        maxVelocity = FMath::Max(maxVelocity, Particle.Velocity.Size());

    float soundSpeed = FMath::Sqrt(PressureStiffness / RestDensity);
    float cflTimeStep = 0.4f * SmoothingRadius / (soundSpeed + maxVelocity + SMALL_NUMBER);

    return FMath::Min(MaxDeltaTime, cflTimeStep);
}
```

### 9.2 基础参数

| 参数 | 符号 | 推荐范围 | 说明 |
|------|------|----------|------|
| 光滑半径 | $h$ | 粒子间距的 2–4 倍 | 影响邻域大小与精度 |
| 静止密度 | $\rho_0$ | 1000（水） | 参考密度 |
| 压力刚度 | $k$ | 1000–10000 | 越大越不可压缩，但 CFL 步长越小 |
| 粘度系数 | $\mu$ | 0.001–1.0 | 越大流体越粘稠 |
| 粒子质量 | $m$ | $\rho_0 \cdot d^3$ | $d$ 为粒子间距 |
| 时间步长 | $\Delta t$ | 0.0001–0.001 | 须满足 CFL |

**光滑半径与粒子质量**：

$$
h = \alpha \cdot d, \quad \alpha \in [2, 4]
$$

$$
m = \rho_0 \cdot d^3 \quad\text{（3D）}
$$

$h$ 太小则邻居不足、计算失真；太大则计算量增加、细节模糊。$k$ 越大流体越不可压缩，但声速增大导致 CFL 步长缩小——这是 WCSPH 的核心矛盾。

### 9.3 调优建议

1. **从保守参数开始**：小时间步长（0.0001 s）、中等压力刚度（1000）、适中光滑半径（3 倍间距）。
2. **逐步调整**：流体太"软"则增 $k$；太"粘"则减 $\mu$；不稳定则减 $\Delta t$。
3. **观察密度波动**：正常应小于 5%，过大则增 $k$ 或减 $\Delta t$，或改用 PCISPH/IISPH。

---

## 十、优化与并行

### 10.1 空间哈希加速

邻域搜索是 SPH 最耗时的部分。暴力搜索为 $O(n^2)$，均匀网格与空间哈希降至 $O(n)$ 平均。

```cpp
class USPHGrid
{
public:
    float CellSize; // 通常等于光滑半径 h
    TMap<int32, TArray<int32>> Cells;

    int32 HashPosition(const FVector& Position)
    {
        int32 x = FMath::FloorToInt(Position.X / CellSize);
        int32 y = FMath::FloorToInt(Position.Y / CellSize);
        int32 z = FMath::FloorToInt(Position.Z / CellSize);
        return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
    }

    void Insert(int32 Index, const FVector& Position)
    {
        Cells.FindOrAdd(HashPosition(Position)).Add(Index);
    }

    void FindNeighbors(const FVector& Position, float Radius, TArray<int32>& Out)
    {
        int32 CellRadius = FMath::CeilToInt(Radius / CellSize);
        for (int32 dx = -CellRadius; dx <= CellRadius; dx++)
            for (int32 dy = -CellRadius; dy <= CellRadius; dy++)
                for (int32 dz = -CellRadius; dz <= CellRadius; dz++)
                {
                    FVector P = Position + FVector(dx, dy, dz) * CellSize;
                    if (TArray<int32>* Cell = Cells.Find(HashPosition(P)))
                        Out.Append(*Cell);
                }
    }
};
```

| 方法 | 时间复杂度 | 空间复杂度 |
|------|------------|------------|
| 暴力搜索 | $O(n^2)$ | $O(1)$ |
| 均匀网格 | $O(n)$ | $O(n)$ |
| 空间哈希 | $O(n)$ 平均 | $O(n)$ |
| KD 树 | $O(n\log n)$ | $O(n)$ |

### 10.2 并行计算

SPH 的密度、力、积分计算对每个粒子独立，适合 `ParallelFor`：

```cpp
ParallelFor(Particles.Num(), [&](int32 i)
{
    Particles[i].Density = CalculateDensity(i);
});
ParallelFor(Particles.Num(), [&](int32 i)
{
    Particles[i].Acceleration = CalculateAcceleration(i);
});
```

注意：邻域搜索阶段需串行建表，查询阶段可并行。

### 10.3 核函数查找表

预计算核函数值，避免每步重复计算高次幂与除法：

```cpp
class UKernelLUT
{
public:
    TArray<float> Wpoly6Table;
    TArray<float> GradWspikyTable;
    TArray<float> LaplacianWviscTable;
    int32 TableSize = 1000;
    float SmoothingRadius;

    void Precompute(float h)
    {
        SmoothingRadius = h;
        Wpoly6Table.SetNum(TableSize);
        GradWspikyTable.SetNum(TableSize);
        LaplacianWviscTable.SetNum(TableSize);

        for (int32 i = 0; i < TableSize; i++)
        {
            float r = (float(i) / TableSize) * h;
            Wpoly6Table[i] = Wpoly6(r, h);
            GradWspikyTable[i] = GradWspikyMagnitude(r, h);
            LaplacianWviscTable[i] = LaplacianWviscosity(r, h);
        }
    }

    float LookupWpoly6(float r)
    {
        if (r >= SmoothingRadius) return 0.0f;
        int32 idx = FMath::Clamp(int32((r / SmoothingRadius) * TableSize), 0, TableSize - 1);
        return Wpoly6Table[idx];
    }
};
```

### 10.4 GPU Compute Shader

对于大规模模拟（万级以上粒子），使用 GPU 计算。以下为密度计算的 HLSL 示例，采用均匀网格邻域结构（`CellStart`/`CellEnd` 数组由排序 pass 预构建）：

```hlsl
// 粒子密度计算 Compute Shader
[numthreads(256, 1, 1)]
void ComputeDensity(uint3 id : SV_DispatchThreadID)
{
    uint i = id.x;
    if (i >= NumParticles) return;

    float3 pi = Positions[i];
    float density = 0.0;

    int3 cellIndex = GetCellIndex(pi);
    for (int dx = -1; dx <= 1; dx++)
    {
        for (int dy = -1; dy <= 1; dy++)
        {
            for (int dz = -1; dz <= 1; dz++)
            {
                int3 neighborCell = cellIndex + int3(dx, dy, dz);
                uint cellHash = HashCell(neighborCell);
                uint start = CellStart[cellHash];
                uint end   = CellEnd[cellHash];

                for (uint j = start; j < end; j++)
                {
                    float3 pj = Positions[j];
                    float r = length(pi - pj);
                    density += Mass * Wpoly6(r, SmoothingRadius);
                }
            }
        }
    }

    Densities[i] = density;
}
```

> Niagara GPU 粒子系统常承载此类 GPU 流体模拟。Niagara 的参数体系与 Compute Shader 管线见&#12298;[UE Niagara 基础参数详解](/knowledge/ue-niagara-parameters/)&#12299;。

### 10.5 子步长（Sub-stepping）

对于高速运动，单步 CFL 可能远小于帧时间，需在一个帧内做多个子步：

```cpp
void SimulationStep(float FrameTime)
{
    float maxVelocity = GetMaxVelocity();
    float soundSpeed = FMath::Sqrt(PressureStiffness / RestDensity);
    float cflStep = 0.4f * SmoothingRadius / (soundSpeed + maxVelocity);
    int32 numSubSteps = FMath::Clamp(FMath::CeilToInt(FrameTime / cflStep), 1, MaxSubSteps);

    float subDt = FrameTime / numSubSteps;
    for (int32 s = 0; s < numSubSteps; s++)
        SingleStep(subDt);
}
```

---

## 十一、高级主题

### 11.1 多相流模拟

模拟不同密度的流体（如油与水）需修正压力力以处理密度跳跃：

$$
\mathbf{F}_i^{\text{pressure}} = -m_i \sum_j m_j \frac{p_i + p_j}{2\rho_i\rho_j} \nabla W_{ij}
$$

在相界面处需添加额外的界面张力，其物理机制与单相表面张力类似但方向沿两相法线。

### 11.2 流固耦合

SPH 流体与刚体或可变形体的交互：

- 用边界粒子表示刚体表面，参与密度计算但不移动。
- 累积流体粒子对边界粒子的压力，作为流体对刚体的力施加到刚体：

```cpp
FVector fluidForce = FVector::ZeroVector;
for (int32 i : BoundaryParticles)
    for (int32 j : FluidNeighbors[i])
        fluidForce += CalculatePressureForce(i, j);

RigidBody->AddForce(fluidForce);
```

### 11.3 热传导

模拟温度变化与热对流，热传导方程 $\frac{DT}{Dt} = \kappa \nabla^2 T$ 的 SPH 离散：

$$
\frac{DT_i}{Dt} = \kappa \sum_j \frac{m_j}{\rho_j}(T_j - T_i)\,\nabla^2 W_{ij}
$$

```cpp
float CalculateTemperatureChange(int32 i)
{
    float dT = 0.0f;
    for (int32 j : Particles[i].Neighbors)
    {
        float tempDiff = Particles[j].Temperature - Particles[i].Temperature;
        float lapW = LaplacianWviscosity(Distance(i, j), SmoothingRadius);
        dT += (ParticleMass / Particles[j].Density) * tempDiff * lapW;
    }
    return ThermalDiffusivity * dT;
}
```

### 11.4 自适应分辨率

在需要细节的区域使用更多粒子：粒子进入高细节区域时分裂（split），离开时合并（merge），以平衡精度与计算量。

---

## 十二、与 PBF 的对比

SPH 与 PBF（Position-Based Fluids）是流体模拟的两条主流路线，前者基于力与显式积分，后者基于约束与迭代求解。

| 特性 | SPH | PBF |
|------|-----|-----|
| 求解方式 | 基于力，显式积分 | 基于约束，迭代求解 |
| 稳定性 | 条件稳定，受 CFL 限制 | 无条件稳定 |
| 不可压缩性 | WCSPH 弱可压；IISPH/DFSPH 强 | 迭代保证密度约束 |
| 时间步长 | 小（~0.0001 s，WCSPH） | 大（~0.01 s） |
| 参数敏感性 | 压力刚度敏感 | 参数鲁棒 |
| 物理精度 | 高（直接求解 NS 方程） | 中（约束近似） |
| 适用场景 | 科学计算、影视特效 | 游戏、实时应用 |

**核心差异的数学表达**：

SPH（基于力）——先算力再积分：

$$
\mathbf{a}_i = -\frac{1}{\rho_i}\nabla p_i + \nu\nabla^2\mathbf{v}_i + \mathbf{g}
$$

$$
\mathbf{v}_i^{n+1} = \mathbf{v}_i^n + \Delta t\,\mathbf{a}_i, \quad \mathbf{x}_i^{n+1} = \mathbf{x}_i^n + \Delta t\,\mathbf{v}_i^{n+1}
$$

PBF（基于约束）——先预测再投影：

$$
\mathbf{x}_i^* = \mathbf{x}_i + \Delta t\,\mathbf{v}_i \quad\text{（预测）}
$$

$$
\Delta\mathbf{x}_i = f(\lambda_i, \nabla C_i), \quad \mathbf{x}_i^* \leftarrow \mathbf{x}_i^* + \Delta\mathbf{x}_i \quad\text{（迭代投影）}
$$

$$
\mathbf{v}_i = \frac{\mathbf{x}_i^* - \mathbf{x}_i}{\Delta t}, \quad \mathbf{x}_i = \mathbf{x}_i^*
$$

PBF 继承了 PBD（Position-Based Dynamics）的约束投影框架——将物理定律表达为位置约束 $C(\mathbf{x}) = 0$ 并迭代求解位置修正，而非通过力积分。这使其无条件稳定、可使用大步长。PBD/XPBD 的约束求解原理与刚度控制见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;的 XPBD 章节，PBF 的完整推导见&#12298;[PBF 流体模拟详解](/knowledge/pbf-fluid-simulation/)&#12299;。

**选择建议**：

- **选 SPH**：需要物理精度、科学计算、离线渲染，且能接受小时间步长。
- **选 PBF**：需要实时性能、游戏应用、交互式模拟，且可接受近似不可压缩性。

---

## 十三、实现注意事项

### 13.1 数值稳定性

避免除零、限制最大速度与加速度：

```cpp
float SafeDivide(float a, float b, float eps = 1e-6f)
{
    return a / FMath::Max(b, eps);
}

void ClampVelocity(FVector& v, float maxSpeed)
{
    float speed = v.Size();
    if (speed > maxSpeed) v = v.GetSafeNormal() * maxSpeed;
}
```

### 13.2 粒子初始化

规则网格初始化并加小扰动以避免完美对称导致的数值奇异性：

```cpp
void InitializeParticles(const FVector& Origin, const FVector& Size, float Spacing)
{
    int32 nx = FMath::CeilToInt(Size.X / Spacing);
    int32 ny = FMath::CeilToInt(Size.Y / Spacing);
    int32 nz = FMath::CeilToInt(Size.Z / Spacing);

    for (int32 x = 0; x < nx; x++)
        for (int32 y = 0; y < ny; y++)
            for (int32 z = 0; z < nz; z++)
            {
                FVector pos = Origin + FVector(x, y, z) * Spacing;
                pos += FVector(FMath::RandRange(-0.1f, 0.1f),
                               FMath::RandRange(-0.1f, 0.1f),
                               FMath::RandRange(-0.1f, 0.1f)) * Spacing * 0.1f;

                FSPHParticle p;
                p.Position = pos;
                p.Velocity = FVector::ZeroVector;
                p.Mass = RestDensity * Spacing * Spacing * Spacing;
                Particles.Add(p);
            }
}
```

### 13.3 调试技巧

可视化密度偏差与速度向量，监控统计信息：

```cpp
FLinearColor GetDensityColor(float density)
{
    float ratio = density / RestDensity;
    if (ratio < 0.9f)  return FLinearColor::Blue;   // 低密度（边界/空洞）
    if (ratio > 1.1f)  return FLinearColor::Red;    // 高密度（压缩）
    return FLinearColor::Green;                      // 正常
}

void PrintStatistics()
{
    float minRho = MAX_FLT, maxRho = -MAX_FLT, avgRho = 0.0f, maxVel = 0.0f;
    for (const auto& p : Particles)
    {
        minRho = FMath::Min(minRho, p.Density);
        maxRho = FMath::Max(maxRho, p.Density);
        avgRho += p.Density;
        maxVel = FMath::Max(maxVel, p.Velocity.Size());
    }
    avgRho /= Particles.Num();
    UE_LOG(LogSPH, Log, TEXT("ρ: min=%.2f max=%.2f avg=%.2f | v_max=%.2f"),
           minRho, maxRho, avgRho, maxVel);
}
```

---

## 十四、参考文献

1. Monaghan, J. J. (1992). *Smoothed Particle Hydrodynamics*. Annual Review of Astronomy and Astrophysics, 30(1), 543–574. ——SPH 的奠基性综述。
2. Müller, M., Charypar, D., & Gross, M. (2003). *Particle-Based Fluid Simulation for Interactive Applications*. Eurographics/SIGGRAPH Symposium on Computer Animation. ——将 SPH 引入计算机图形学，定义 Poly6/Spiky/Viscosity 核与 color-field 表面张力。
3. Becker, M., & Teschner, M. (2007). *Weakly Compressible SPH for Free Surface Flows*. SCA. ——WCSPH 与 Tait 状态方程。
4. Solenthaler, B., & Pajarola, R. (2009). *Predictive-Corrective Incompressible SPH*. ACM TOG (SIGGRAPH). ——PCISPH。
5. Ihmsen, M., Cornelis, J., Solenthaler, B., Horvath, C., & Teschner, M. (2014). *Implicit Incompressible SPH*. IEEE TVCG. ——IISPH 与压力 Poisson 方程。
6. Bender, J., & Koschier, D. (2015). *Divergence-Free Smoothed Particle Hydrodynamics*. SCA. ——DFSPH。
7. Koschier, D., Bender, J., Solenthaler, B., & Teschner, M. (2019). *Smoothed Particle Hydrodynamics Techniques for the Physics Based Simulation of Fluids and Solids*. Eurographics Tutorial. ——SPH 综述教程。
8. Price, D. J. (2012). *Smoothed Particle Hydrodynamics and Magnetohydrodynamics*. Journal of Computational Physics, 231(3), 759–794. ——SPH 理论深入分析。
