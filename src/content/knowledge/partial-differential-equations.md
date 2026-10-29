---
title: 偏微分方程：场、边界与空间离散
excerpt: 以热传导、波动和流体方程说明场量、边界条件与有限差分离散。
date: '2026-09-06'
category: Mathematics
subtopic: DifferentialEquations
tags:
  - PDE
  - 有限差分
  - Navier-Stokes
  - 热传导
  - C++
readTime: 阅读约15分钟
kind: theory
level: intermediate
pageType: guide
aliases:
  - 偏微分方程与数值离散详解 — 热传导、波动、Navier-Stokes 与有限差分
prerequisites:
  - calculus-foundations
  - differential-equations
nextArticles: []
related: [continuum-mechanics, deformable-body-dynamics, fluid-dynamics, sph-fluid-simulation, pbf-fluid-simulation]
sources: []
---
当未知量同时分布在空间和时间中，单个位置的状态通常不足以决定演化，还必须描述邻域与边界。本文解释 PDE 如何经过空间离散成为有限维问题；时间推进见[数值积分](/knowledge/numerical-integration-methods/)，粒子流体的具体离散见[SPH](/knowledge/sph-fluid-simulation/)。稳定性条件必须对应具体方程与离散格式，不能只凭一个通用 CFL 数设定所有步长。

> 偏微分方程（PDE）描述涉及多个自变量的物理过程：热扩散、波传播、流体运动。从烟雾扩散到水面波纹，从气流模拟到稳态场，PDE 是连续物理模拟的数学语言。
>
> 本文为教材式总览，微积分基础见《[工程微积分：变化率、累积与局部近似](/knowledge/calculus-foundations/)》，ODE 与数值积分方法见《[常微分方程：状态、初值与动力系统](/knowledge/differential-equations/)》。Navier-Stokes 方程的粒子离散化（SPH/PBF）见《[SPH 流体：核插值、压力与边界](/knowledge/sph-fluid-simulation/)》与《[PBF 流体：密度约束与位置修正](/knowledge/pbf-fluid-simulation/)》。

---

## 偏微分方程基础

### 什么是 PDE

涉及**多个自变量**及其**偏导数**的方程：

$$
F\left(x, y, u, \frac{\partial u}{\partial x}, \frac{\partial u}{\partial y}, \frac{\partial^2 u}{\partial x^2}, \ldots\right) = 0
$$

### 分类

| 类型 | 标准形式 | 物理意义 |
|------|---------|---------|
| 抛物型 | $\frac{\partial u}{\partial t} = \alpha \nabla^2 u$ | 热传导（扩散） |
| 双曲型 | $\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u$ | 波动（传播） |
| 椭圆型 | $\nabla^2 u = 0$ | 稳态（平衡） |

---

## 热传导方程

### 方程形式

描述热量在空间中扩散：

$$
\frac{\partial u}{\partial t} = \alpha \nabla^2 u
$$

其中 $u(x, y, z, t)$ 为温度，$\alpha$ 为热扩散系数，$\nabla^2$ 为拉普拉斯算子。

一维简化：

$$
\frac{\partial u}{\partial t} = \alpha \frac{\partial^2 u}{\partial x^2}
$$

### 有限差分离散

用差分近似偏导数：

$$
\frac{\partial u}{\partial t} \approx \frac{u_i^{n+1} - u_i^n}{\Delta t}
$$

$$
\frac{\partial^2 u}{\partial x^2} \approx \frac{u_{i+1} - 2u_i + u_{i-1}}{\Delta x^2}
$$

代入得显式差分格式：

$$
u_i^{n+1} = u_i^n + \frac{\alpha \Delta t}{\Delta x^2}(u_{i+1} - 2u_i + u_{i-1})
$$

**稳定性条件**：$\Delta t \leq \frac{\Delta x^2}{2\alpha}$

### 应用：烟雾扩散

```cpp
// 1D 热传导/烟雾扩散
void UpdateHeatDiffusion(TArray<float>& Temperature, float DeltaTime, float Alpha, float dx)
{
    int N = Temperature.Num();
    TArray<float> NewTemp = Temperature;
    float Coefficient = Alpha * DeltaTime / (dx * dx);

    for (int i = 1; i < N - 1; ++i)
    {
        float Laplacian = Temperature[i+1] - 2.0f*Temperature[i] + Temperature[i-1];
        NewTemp[i] = Temperature[i] + Coefficient * Laplacian;
    }
    Temperature = NewTemp;
}

// 2D 烟雾密度扩散
void UpdateSmokeDensity(TArray<TArray<float>>& Density, float DeltaTime, float DiffusionRate)
{
    int W = Density.Num(), H = Density[0].Num();
    TArray<TArray<float>> NewDensity = Density;
    float Coeff = DiffusionRate * DeltaTime;

    for (int x = 1; x < W - 1; ++x)
    for (int y = 1; y < H - 1; ++y)
    {
        // 2D 拉普拉斯：四邻居之和减 4 倍中心
        float Laplacian = Density[x+1][y] + Density[x-1][y]
                        + Density[x][y+1] + Density[x][y-1]
                        - 4.0f * Density[x][y];
        NewDensity[x][y] = Density[x][y] + Coeff * Laplacian;
    }
    Density = NewDensity;
}
```

---

## 波动方程

### 方程形式

描述波的传播（声波、水波、弦振动）：

$$
\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u
$$

其中 $c$ 为波速。一维形式：

$$
\frac{\partial^2 u}{\partial t^2} = c^2 \frac{\partial^2 u}{\partial x^2}
$$

### 有限差分离散

时间二阶差分：

$$
\frac{\partial^2 u}{\partial t^2} \approx \frac{u_i^{n+1} - 2u_i^n + u_i^{n-1}}{\Delta t^2}
$$

代入得：

$$
u_i^{n+1} = 2u_i^n - u_i^{n-1} + \frac{c^2 \Delta t^2}{\Delta x^2}(u_{i+1} - 2u_i + u_{i-1})
$$

**稳定性条件**（CFL）：$\Delta t \leq \frac{\Delta x}{c}$

### 应用：水面波动模拟

```cpp
struct WaveSimulation
{
    TArray<TArray<float>> Current;
    TArray<TArray<float>> Previous;
    float WaveSpeed;
    float Damping;
};

void UpdateWave(WaveSimulation& Wave, float DeltaTime, float dx)
{
    int W = Wave.Current.Num(), H = Wave.Current[0].Num();
    TArray<TArray<float>> Next;
    Next.SetNum(W);
    for (int i = 0; i < W; ++i) Next[i].SetNum(H);

    float c2 = Wave.WaveSpeed * Wave.WaveSpeed;
    float Coeff = c2 * DeltaTime * DeltaTime / (dx * dx);

    for (int x = 1; x < W - 1; ++x)
    for (int y = 1; y < H - 1; ++y)
    {
        // 2D 拉普拉斯
        float Laplacian = Wave.Current[x+1][y] + Wave.Current[x-1][y]
                        + Wave.Current[x][y+1] + Wave.Current[x][y-1]
                        - 4.0f * Wave.Current[x][y];

        // u(t+dt) = 2u(t) - u(t-dt) + c²dt²∇²u
        Next[x][y] = 2.0f * Wave.Current[x][y] - Wave.Previous[x][y]
                   + Coeff * Laplacian;
        Next[x][y] *= Wave.Damping; // 阻尼
    }

    Wave.Previous = Wave.Current;
    Wave.Current = Next;
}

void AddRipple(WaveSimulation& Wave, int x, int y, float Strength)
{
    Wave.Current[x][y] += Strength;
}
```

---

## Navier-Stokes 方程

### 方程组

描述流体运动的最重要方程组：

**动量方程**：

$$
\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u} \cdot \nabla)\mathbf{u} = -\frac{1}{\rho}\nabla p + \nu \nabla^2 \mathbf{u} + \mathbf{f}
$$

**连续性方程**（不可压缩）：

$$
\nabla \cdot \mathbf{u} = 0
$$

其中 $\mathbf{u}$ 为速度场，$p$ 为压力，$\rho$ 为密度，$\nu$ 为粘性系数，$\mathbf{f}$ 为外力。

### 各项物理意义

| 项 | 含义 |
|----|------|
| $\frac{\partial \mathbf{u}}{\partial t}$ | 速度随时间变化 |
| $(\mathbf{u} \cdot \nabla)\mathbf{u}$ | 对流项（平流） |
| $-\frac{1}{\rho}\nabla p$ | 压力梯度 |
| $\nu \nabla^2 \mathbf{u}$ | 粘性扩散 |
| $\mathbf{f}$ | 外力（重力等） |

### 网格法数值求解

Stable Fluids 方法（Jos Stam 1999）将求解分为四个步骤：

1. **力添加**：$\mathbf{u} \leftarrow \mathbf{u} + \Delta t \cdot \mathbf{f}$
2. **扩散**：$\mathbf{u} \leftarrow \mathbf{u} + \Delta t \cdot \nu \nabla^2 \mathbf{u}$（Gauss-Seidel 迭代）
3. **平流**：沿速度方向回溯采样（半拉格朗日法）
4. **投影**：求解压力 Poisson 方程保证 $\nabla \cdot \mathbf{u} = 0$

```cpp
// 平流步骤（半拉格朗日法）
void AdvectVelocity(TArray<TArray<FVector2D>>& Velocity, float DeltaTime)
{
    int Size = Velocity.Num();
    TArray<TArray<FVector2D>> NewVel = Velocity;

    for (int x = 1; x < Size - 1; ++x)
    for (int y = 1; y < Size - 1; ++y)
    {
        // 沿速度方向回溯
        FVector2D Vel = Velocity[x][y];
        float BackX = x - DeltaTime * Vel.X;
        float BackY = y - DeltaTime * Vel.Y;

        // 双线性插值
        int x0 = FMath::Floor(BackX), y0 = FMath::Floor(BackY);
        float sx = BackX - x0, sy = BackY - y0;

        if (x0 >= 0 && x0 < Size-1 && y0 >= 0 && y0 < Size-1)
        {
            NewVel[x][y] =
                Velocity[x0][y0]     * (1-sx)*(1-sy) +
                Velocity[x0+1][y0]   * sx*(1-sy) +
                Velocity[x0][y0+1]   * (1-sx)*sy +
                Velocity[x0+1][y0+1] * sx*sy;
        }
    }
    Velocity = NewVel;
}
```

### 与粒子法的关系

Navier-Stokes 方程有两种主要离散化路径：

| 方法 | 离散方式 | 代表 |
|------|---------|------|
| 网格法（Eulerian） | 固定网格上求解 | Stable Fluids、MAC Grid |
| 粒子法（Lagrangian） | 粒子携带物理量 | SPH、PBF |

> Navier-Stokes 方程的粒子离散化是 SPH 流体模拟的理论起点。详见《[SPH 流体：核插值、压力与边界](/knowledge/sph-fluid-simulation/)》（WCSPH/PCISPH/IISPH/DFSPH 均为 NS 方程的不同离散求解策略）与《[PBF 流体：密度约束与位置修正](/knowledge/pbf-fluid-simulation/)》（PBF 以位置基约束保证不可压缩性）。

---

## 拉普拉斯方程

### 方程形式

稳态系统（无时间变化）：

$$
\nabla^2 u = 0
$$

即 $\frac{\partial^2 u}{\partial x^2} + \frac{\partial^2 u}{\partial y^2} + \frac{\partial^2 u}{\partial z^2} = 0$。

### 应用

静电场、稳态热分布、势场导航。

### 迭代求解

拉普拉斯方程的有限差分格式为每个点取四邻居平均：

$$
u_{i,j} = \frac{1}{4}(u_{i+1,j} + u_{i-1,j} + u_{i,j+1} + u_{i,j-1})
$$

通过 Gauss-Seidel 迭代收敛到稳态解：

```cpp
void SolveLaplace(TArray<TArray<float>>& Field, int Iterations)
{
    int W = Field.Num(), H = Field[0].Num();
    for (int Iter = 0; Iter < Iterations; ++Iter)
    for (int x = 1; x < W - 1; ++x)
    for (int y = 1; y < H - 1; ++y)
    {
        Field[x][y] = 0.25f * (Field[x+1][y] + Field[x-1][y]
                              + Field[x][y+1] + Field[x][y-1]);
    }
}
```

---

## 有限差分法总结

### 差分格式

| 导数 | 差分格式 | 精度 |
|------|---------|------|
| 一阶（前向） | $\frac{u(x+h) - u(x)}{h}$ | $O(h)$ |
| 一阶（中心） | $\frac{u(x+h) - u(x-h)}{2h}$ | $O(h^2)$ |
| 二阶（中心） | $\frac{u(x+h) - 2u(x) + u(x-h)}{h^2}$ | $O(h^2)$ |

### 2D 拉普拉斯离散

五点格式：

$$
\nabla^2 u \approx \frac{u_{i+1,j} + u_{i-1,j} + u_{i,j+1} + u_{i,j-1} - 4u_{i,j}}{\Delta x^2}
$$

```cpp
float ComputeLaplacian(TArray<TArray<float>>& Field, int x, int y, float dx)
{
    return (Field[x+1][y] + Field[x-1][y] + Field[x][y+1] + Field[x][y-1]
            - 4.0f * Field[x][y]) / (dx * dx);
}
```

---

## 空间步长、时间步长与稳定性

稳定性依赖方程、空间离散、维数、边界与时间积分组合，不能对所有显式方法套用 $\Delta t\le\Delta x/c$。

### 对流与波传播

对一维线性对流 $u_t+c u_x=0$，一阶迎风空间离散加显式 Euler 的稳定条件为 $|c|\Delta t/\Delta x\le1$。中心空间差分加显式 Euler 则不能只因满足这个比例就认为稳定。

多维格式需要结合各方向传播与模板分析；例如笛卡尔方向耦合常出现各方向 Courant 数之和。CFL 给出数值依赖域与物理传播相容性的要求，满足它不自动保证任意格式稳定。

### 扩散的尺度不同

对热方程 $u_t=\alpha\nabla^2u$，采用等距网格中心差分与显式 Euler，在 $d$ 维均匀网格上需要

$
\Delta t\le\frac{\Delta x^2}{2d\alpha}.
$

非等距笛卡尔网格对应 $\alpha\Delta t\sum_j1/\Delta x_j^2\le1/2$。因此一维的 $\Delta x^2/(2\alpha)$ 不能原样用于二维热扩散示例。

### 隐式求解与实际步长

某些隐式方法放宽特定线性问题的稳定步长限制，但空间误差、时间精度、非线性求解和接触采样仍然限制可用步长。对流速度为零也不意味着扩散、外力或其他约束不再限制时间步。

实际选择应记录最小网格尺度、速度或波速、扩散参数、方法和安全系数，分别计算适用的限制。时间积分的误差与稳定域见[数值积分](/knowledge/numerical-integration-methods/)，粒子离散的邻域与声速还需查[SPH](/knowledge/sph-fluid-simulation/)。

## 参考文献

1. Stam, J. (1999). *Stable Fluids*. ACM SIGGRAPH. ——网格法流体模拟的经典方法。
2. Bridson, R. *Fluid Simulation for Computer Graphics*. ——流体模拟权威教材。
3. LeVeque, R. *Finite Difference Methods for Ordinary and Partial Differential Equations*. ——有限差分方法教材。
4. 《[工程微积分：变化率、累积与局部近似](/knowledge/calculus-foundations/)》 — 拉普拉斯算子、梯度、散度、旋度的理论基础。
5. 《[常微分方程：状态、初值与动力系统](/knowledge/differential-equations/)》 — ODE 数值积分方法。
6. 《[SPH 流体：核插值、压力与边界](/knowledge/sph-fluid-simulation/)》 — Navier-Stokes 的粒子离散化。
7. 《[PBF 流体：密度约束与位置修正](/knowledge/pbf-fluid-simulation/)》 — 位置基不可压缩流体。
