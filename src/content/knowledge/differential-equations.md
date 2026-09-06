---
title: "常微分方程与数值方法详解 — 从牛顿运动方程到欧拉、Verlet 与龙格-库塔"
excerpt: "系统讲解常微分方程（ODE）在游戏物理中的应用：ODE 定义与分类、牛顿运动方程的二阶 ODE 转化、解析解与数值解的对比、四种数值积分方法（显式欧拉、半隐式欧拉、Verlet、龙格-库塔 RK4）的原理与精度对比、有限差分与 CFL 稳定性条件，以及 UE 实战（弹簧阻尼系统、指数衰减平滑、PID 控制器）。"
date: "2026-09-06"
category: "Mathematics"
subtopic: "DifferentialEquations"
tags: ["ODE", "数值积分", "欧拉法", "Verlet", "RK4", "C++"]
readTime: "阅读约30分钟"
---

> 常微分方程（ODE）是游戏物理模拟的核心数学工具：所有运动、力学、动画系统都基于 ODE。从自由落体到弹簧系统，从粒子模拟到刚体动力学，ODE 无处不在。
>
> 本文为教材式总览，微积分基础见&#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299;，PDE 与有限差分离散见&#12298;[偏微分方程与数值离散详解](/knowledge/partial-differential-equations/)&#12299;。本站另有&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;提供数值积分的深拆视角，两文互补。

---

## 一、微分方程基础

### 1.1 什么是微分方程

微分方程是包含**未知函数及其导数**的方程，描述函数如何随时间（或其他变量）变化。

**一阶 ODE**：

$$
\frac{dy}{dt} = f(t, y)
$$

**二阶 ODE**：

$$
\frac{d^2y}{dt^2} = f\left(t, y, \frac{dy}{dt}\right)
$$

### 1.2 分类

| 类型 | 定义 | 例子 |
|------|------|------|
| 线性 | 未知函数及导数均为一次 | $\frac{dy}{dt} + ay = 0$ |
| 非线性 | 含高次项或复杂函数 | $\frac{dy}{dt} = y^2$ |
| 齐次 | 方程右侧为 0 | $\frac{d^2y}{dt^2} + y = 0$ |
| 非齐次 | 方程右侧不为 0 | $\frac{d^2y}{dt^2} + y = \sin t$ |

### 1.3 游戏中的例子

| 力类型 | ODE | 游戏应用 |
|--------|-----|---------|
| 重力 | $\frac{d^2\mathbf{s}}{dt^2} = \mathbf{g}$ | 自由落体、抛物线 |
| 摩擦 | $\frac{dv}{dt} = -kv$ | 指数衰减 |
| 弹簧 | $m\frac{d^2x}{dt^2} = -kx$ | 弹性碰撞、弹簧动画 |
| 阻尼 | $m\frac{d^2x}{dt^2} = -kx - c\frac{dx}{dt}$ | 弹簧-阻尼系统 |

---

## 二、牛顿运动方程

### 2.1 微分形式

物理学中最重要的微分方程——牛顿第二定律：

$$
m\frac{d^2\mathbf{s}}{dt^2} = \mathbf{F}(\mathbf{s}, \mathbf{v}, t)
$$

其中 $\mathbf{s}$ 为位置，$\mathbf{v} = d\mathbf{s}/dt$ 为速度，$\mathbf{a} = d\mathbf{v}/dt$ 为加速度，$\mathbf{F}$ 为力，$m$ 为质量。

### 2.2 转化为一阶 ODE 组

二阶 ODE 太复杂，数值求解时转化为两个一阶 ODE：

$$
\begin{cases}
\frac{d\mathbf{s}}{dt} = \mathbf{v} \\
\frac{d\mathbf{v}}{dt} = \frac{\mathbf{F}(\mathbf{s}, \mathbf{v}, t)}{m}
\end{cases}
$$

这是**所有游戏物理引擎**的数学基础。状态向量为 $(\mathbf{s}, \mathbf{v})$，力函数决定状态如何演化。

---

## 三、解析解与数值解

### 3.1 解析解

能写出精确公式的解。例如自由落体 $\frac{d^2y}{dt^2} = -g$ 的解析解：

$$
y(t) = y_0 + v_0 t - \frac{1}{2}gt^2
$$

```cpp
FVector FreeFallPosition(FVector InitialPos, FVector InitialVel, float Time, float Gravity = 980.0f)
{
    FVector Result = InitialPos + InitialVel * Time;
    Result.Z -= 0.5f * Gravity * Time * Time;
    return Result;
}
```

### 3.2 数值解

大多数微分方程（特别是非线性方程）没有解析解，需要数值方法逐步计算。游戏物理模拟几乎全部依赖数值方法。

---

## 四、欧拉法

### 4.1 显式欧拉

最简单的数值积分方法：

$$
y_{n+1} = y_n + h \cdot f(t_n, y_n)
$$

对于物理系统：

$$
\begin{cases}
\mathbf{s}_{n+1} = \mathbf{s}_n + \Delta t \cdot \mathbf{v}_n \\
\mathbf{v}_{n+1} = \mathbf{v}_n + \Delta t \cdot \mathbf{a}_n
\end{cases}
$$

```cpp
struct PhysicsState { FVector Position; FVector Velocity; };

PhysicsState EulerStep(const PhysicsState& State, float DeltaTime, FVector Acceleration)
{
    PhysicsState NewState;
    NewState.Position = State.Position + State.Velocity * DeltaTime;
    NewState.Velocity = State.Velocity + Acceleration * DeltaTime;
    return NewState;
}
```

**缺点**：数值不稳定（能量会增加）、需要很小的时间步长、误差累积快。不推荐用于游戏物理。

### 4.2 半隐式欧拉

**游戏物理引擎的标准选择**。也称 Symplectic Euler 或 Euler-Cromer 方法。

核心区别：用**新速度**更新位置，而非旧速度：

$$
\begin{cases}
\mathbf{v}_{n+1} = \mathbf{v}_n + \Delta t \cdot \mathbf{a}_n \\
\mathbf{s}_{n+1} = \mathbf{s}_n + \Delta t \cdot \mathbf{v}_{n+1}
\end{cases}
$$

```cpp
PhysicsState SemiImplicitEuler(const PhysicsState& State, float DeltaTime, FVector Acceleration)
{
    PhysicsState NewState;
    NewState.Velocity = State.Velocity + Acceleration * DeltaTime;
    NewState.Position = State.Position + NewState.Velocity * DeltaTime;
    return NewState;
}
```

| 特性 | 显式欧拉 | 半隐式欧拉 |
|------|---------|-----------|
| 能量守恒 | 能量增加 | 能量守恒 |
| 稳定性 | 不稳定 | 稳定 |
| 精度 | $O(h)$ | $O(h)$ |
| 适用场景 | 不推荐 | 游戏物理标准 |

**为什么游戏都用半隐式欧拉**：简单（只需改变几行代码）、快速（每帧只计算一次）、稳定（不会爆炸）、精度对游戏物理足够。

---

## 五、Verlet 积分

用于粒子系统、布料、绳索模拟，不需要显式存储速度。

### 5.1 标准 Verlet

$$
\mathbf{x}_{n+1} = 2\mathbf{x}_n - \mathbf{x}_{n-1} + \mathbf{a}_n \Delta t^2
$$

速度隐含在位置差中：$\mathbf{v} \approx (\mathbf{x}_n - \mathbf{x}_{n-1}) / \Delta t$。

### 5.2 速度 Verlet

$$
\begin{cases}
\mathbf{x}_{n+1} = \mathbf{x}_n + \mathbf{v}_n \Delta t + \frac{1}{2}\mathbf{a}_n \Delta t^2 \\
\mathbf{v}_{n+1} = \mathbf{v}_n + \frac{\mathbf{a}_n + \mathbf{a}_{n+1}}{2}\Delta t
\end{cases}
$$

```cpp
struct VerletParticle { FVector Position; FVector OldPosition; };

void UpdateVerletParticle(VerletParticle& P, FVector Acceleration, float DeltaTime)
{
    FVector Temp = P.Position;
    FVector Velocity = P.Position - P.OldPosition;
    P.Position = P.Position + Velocity + Acceleration * DeltaTime * DeltaTime;
    P.OldPosition = Temp;
}
```

---

## 六、龙格-库塔法

高精度数值积分方法，通过多次函数评估提高精度。

### 6.1 RK2（中点法）

$$
\begin{cases}
k_1 = f(t_n, y_n) \\
k_2 = f(t_n + \frac{h}{2}, y_n + \frac{h}{2}k_1) \\
y_{n+1} = y_n + h \cdot k_2
\end{cases}
$$

### 6.2 RK4（四阶龙格-库塔）

最常用的高精度方法：

$$
\begin{cases}
k_1 = f(t_n, y_n) \\
k_2 = f(t_n + \frac{h}{2}, y_n + \frac{h}{2}k_1) \\
k_3 = f(t_n + \frac{h}{2}, y_n + \frac{h}{2}k_2) \\
k_4 = f(t_n + h, y_n + hk_3) \\
y_{n+1} = y_n + \frac{h}{6}(k_1 + 2k_2 + 2k_3 + k_4)
\end{cases}
$$

```cpp
PhysicsState RK4Step(const PhysicsState& State, float DeltaTime,
                     TFunction<FVector(const PhysicsState&)> AccelFunc)
{
    FVector a1 = AccelFunc(State);
    FVector v1 = State.Velocity;

    PhysicsState S2;
    S2.Position = State.Position + v1 * (DeltaTime * 0.5f);
    S2.Velocity = State.Velocity + a1 * (DeltaTime * 0.5f);
    FVector a2 = AccelFunc(S2);
    FVector v2 = S2.Velocity;

    PhysicsState S3;
    S3.Position = State.Position + v2 * (DeltaTime * 0.5f);
    S3.Velocity = State.Velocity + a2 * (DeltaTime * 0.5f);
    FVector a3 = AccelFunc(S3);
    FVector v3 = S3.Velocity;

    PhysicsState S4;
    S4.Position = State.Position + v3 * DeltaTime;
    S4.Velocity = State.Velocity + a3 * DeltaTime;
    FVector a4 = AccelFunc(S4);
    FVector v4 = S4.Velocity;

    PhysicsState NewState;
    NewState.Velocity = State.Velocity + (DeltaTime / 6.0f) * (a1 + 2*a2 + 2*a3 + a4);
    NewState.Position = State.Position + (DeltaTime / 6.0f) * (v1 + 2*v2 + 2*v3 + v4);
    return NewState;
}
```

### 6.3 精度对比

| 方法 | 局部误差 | 全局误差 | 适用场景 |
|------|---------|---------|---------|
| 显式欧拉 | $O(h^2)$ | $O(h)$ | 不推荐 |
| 半隐式欧拉 | $O(h^2)$ | $O(h)$ | 游戏物理 |
| Verlet | $O(h^4)$ | $O(h^2)$ | 粒子/布料 |
| RK4 | $O(h^5)$ | $O(h^4)$ | 高精度模拟 |

> 更多数值积分方法的对比分析（包括稳定性区域、辛积分器、隐式方法等），见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。

---

## 七、有限差分

用差分近似导数：

**一阶导数**（中心差分）：

$$
\frac{\partial u}{\partial x} \approx \frac{u(x+h) - u(x-h)}{2h}
$$

**二阶导数**：

$$
\frac{\partial^2 u}{\partial x^2} \approx \frac{u(x+h) - 2u(x) + u(x-h)}{h^2}
$$

```cpp
FVector2D ComputeGradient(TArray<TArray<float>>& Field, int x, int y, float dx)
{
    float dfdx = (Field[x+1][y] - Field[x-1][y]) / (2.0f * dx);
    float dfdy = (Field[x][y+1] - Field[x][y-1]) / (2.0f * dx);
    return FVector2D(dfdx, dfdy);
}
```

---

## 八、CFL 稳定性条件

**Courant-Friedrichs-Lewy 条件**是显式时间积分的稳定性要求：

$$
\Delta t \leq \frac{\Delta x}{c}
$$

其中 $c$ 是波/信息传播速度。违反 CFL 条件会导致数值不稳定（解发散）。

```cpp
float CalculateStableTimeStep(float dx, float MaxVelocity)
{
    float CFLNumber = 0.5f; // 安全系数（通常 < 1）
    return CFLNumber * dx / MaxVelocity;
}

void AdaptiveTimeStep(float dx, float MaxVel, float& DeltaTime)
{
    float StableDT = CalculateStableTimeStep(dx, MaxVel);
    DeltaTime = FMath::Min(DeltaTime, StableDT);
}
```

---

## 九、UE 实战应用

### 9.1 弹簧-阻尼系统

弹簧阻尼系统的 ODE：

$$
m\frac{d^2x}{dt^2} = -kx - c\frac{dx}{dt}
$$

```cpp
void UpdateSpring(float DeltaTime)
{
    FVector Displacement = CurrentPosition - TargetPosition;
    FVector SpringForce = -SpringConstant * Displacement;
    FVector DampingForce = -DampingCoefficient * CurrentVelocity;
    FVector Acceleration = (SpringForce + DampingForce) / Mass;

    // 半隐式欧拉
    CurrentVelocity += Acceleration * DeltaTime;
    CurrentPosition += CurrentVelocity * DeltaTime;
}

// 临界阻尼：最快无超调响应
float GetCriticalDamping(float SpringConstant, float Mass)
{
    return 2.0f * FMath::Sqrt(SpringConstant * Mass); // c = 2√(km)
}
```

### 9.2 指数衰减平滑

ODE $\frac{dx}{dt} = -\lambda x$ 的解析解 $x(t) = x_0 e^{-\lambda t}$，用于帧率无关的平滑插值：

```cpp
FVector VExponentialDecay(FVector Current, FVector Target, float Lambda, float DeltaTime)
{
    FVector Difference = Current - Target;
    return Target + Difference * FMath::Exp(-Lambda * DeltaTime);
}
```

### 9.3 PID 控制器

PID 控制器综合了比例、积分、微分三种控制：

$$
u(t) = K_p e(t) + K_i \int_0^t e(\tau)\,d\tau + K_d \frac{de(t)}{dt}
$$

```cpp
class FPIDController
{
public:
    float Kp = 1.0f, Ki = 0.1f, Kd = 0.5f;
private:
    float IntegralError = 0.0f, PreviousError = 0.0f;
public:
    float Update(float Current, float Target, float DeltaTime)
    {
        float Error = Target - Current;
        IntegralError += Error * DeltaTime;
        float ErrorDerivative = (Error - PreviousError) / DeltaTime;
        PreviousError = Error;
        return Kp * Error + Ki * IntegralError + Kd * ErrorDerivative;
    }
};
```

### 9.4 碰撞冲量

线性冲量 $J = \int F\,dt = m\Delta v$：

```cpp
void ApplyCollisionImpulse(UPrimitiveComponent* C1, UPrimitiveComponent* C2,
                           FVector HitNormal, FVector RelativeVelocity)
{
    float Mass1 = C1->GetMass(), Mass2 = C2->GetMass();
    float Restitution = 0.5f;
    float VelAlongNormal = FVector::DotProduct(RelativeVelocity, HitNormal);
    if (VelAlongNormal > 0) return; // 正在分离

    float J = -(1.0f + Restitution) * VelAlongNormal / (1.0f/Mass1 + 1.0f/Mass2);
    FVector Impulse = J * HitNormal;
    C1->AddImpulse(-Impulse);
    C2->AddImpulse(Impulse);
}
```

---

## 十、方法选择指南

| 场景 | 推荐方法 | 理由 |
|------|---------|------|
| 游戏物理（刚体） | 半隐式欧拉 | 快速、稳定、足够精确 |
| 粒子/布料 | Verlet | 不需存储速度、约束求解友好 |
| 高精度模拟 | RK4 | 误差小但计算量大 |
| 实时性能 | 自适应步长 + 简单方法 | 平衡精度与性能 |

**保证数值稳定性的要点**：

1. 使用半隐式方法而非显式方法
2. 遵守 CFL 条件限制时间步长
3. 添加适当的阻尼
4. 使用约束求解（如 Verlet + PBD）

---

## 十一、参考文献

1. Hairer, E., Nørsett, S. P., & Wanner, G. *Solving Ordinary Differential Equations I*. ——ODE 数值方法权威教材。
2. Millington, I. *Game Physics Engine Development*. ——游戏物理引擎开发。
3. &#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299; — 导数与积分的理论基础。
4. &#12298;[偏微分方程与数值离散详解](/knowledge/partial-differential-equations/)&#12299; — PDE 与有限差分。
5. &#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299; — 数值积分深拆（稳定性区域、辛积分器等）。
6. &#12298;[2D 物理引擎详解](/knowledge/2d-physics-engine/)&#12299; — RK4 在 2D 刚体中的应用。
7. &#12298;[PBF 流体模拟详解](/knowledge/pbf-fluid-simulation/)&#12299; — Verlet/XSPH 在流体中的应用。
