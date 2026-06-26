---
title: "物理模拟数值积分方法的数学与物理原理详解 — 从欧拉到 RK4 与 XPBD"
excerpt: "从常微分方程出发，系统剖析物理模拟中的数值积分方法：欧拉家族（显式/隐式/半隐式/梯形）、龙格-库塔（RK2/RK4/RK45自适应）、稳定性与精度分析，以及在粒子、弹簧、刚体、流体、PBD 中的应用。补充数值积分与约束求解在真实引擎（Chaos/PhysX）中的工程结合，以及 XPBD 这一现代 PBD 演进。"
date: "2026-06-25"
category: "Physics"
subtopic: "RigidBodyDynamics"
tags: ["物理", "数值积分", "ODE", "辛积分器", "PBD", "C++"]
readTime: "阅读约55分钟"
---

> 物理模拟的核心循环只有一句话：**已知当前状态与受力，求下一刻的状态**。这句话的答案就是数值积分。本文从常微分方程的离散化出发，逐一拆解显式/隐式/半隐式欧拉、梯形法、龙格-库塔家族的迭代公式、稳定性与精度，并落到粒子、弹簧、刚体、流体与 PBD 的工程实现。
>
> 原始文档已相当完整，本文在其基础上补充了一节关键内容（§13）：真实游戏引擎并非"只积分、不约束"，而是把**半隐式欧拉预测**与**约束投影**（sequential impulse，有效质量矩阵 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$）编织成一条 predict-correct 流水线，并用 **XPBD** 取代原始 PBD 实现可控刚度的软约束。这与本站《雅可比矩阵》一文的约束求解器内核互为印证。

---

## 1. 引言

### 1.1 什么是数值积分

**数值积分（Numerical Integration）**是求解常微分方程（ODE）的数值方法，在物理模拟中用于计算物体随时间变化的状态。

### 1.2 为什么需要数值积分

在物理模拟中，我们通常知道：
- **当前状态**：位置 $\mathbf{x}(t)$、速度 $\mathbf{v}(t)$
- **运动规律**：加速度 $\mathbf{a}(t) = \frac{d\mathbf{v}}{dt}$

但我们需要知道：
- **未来状态**：$\mathbf{x}(t+\Delta t)$、$\mathbf{v}(t+\Delta t)$

大多数物理系统的解析解（精确解）无法获得，因此需要数值方法**近似求解**。

### 1.3 物理模拟的基本流程

```
初始状态 (t₀) → 数值积分 → 状态 (t₁) → 数值积分 → 状态 (t₂) → ...
    ↓                           ↓                           ↓
(x₀, v₀)                    (x₁, v₁)                    (x₂, v₂)
```

---

## 2. 基本概念

### 2.1 状态向量

物理系统的**状态（State）**通常包含：

$$
\mathbf{s}(t) = \begin{bmatrix} \mathbf{x}(t) \\ \mathbf{v}(t) \end{bmatrix}
$$

其中：
- $\mathbf{x}(t)$ - 位置向量
- $\mathbf{v}(t)$ - 速度向量

### 2.2 微分方程

物理系统的演化遵循**牛顿第二定律**：

$$
\mathbf{F} = m\mathbf{a}
$$

可以写成一阶常微分方程组：

$$
\begin{cases}
\frac{d\mathbf{x}}{dt} = \mathbf{v}(t) \\
\frac{d\mathbf{v}}{dt} = \mathbf{a}(t) = \frac{\mathbf{F}(\mathbf{x}, \mathbf{v}, t)}{m}
\end{cases}
$$

### 2.3 初值问题（IVP）

给定：
- **初始条件**：$\mathbf{x}(0) = \mathbf{x}_0$，$\mathbf{v}(0) = \mathbf{v}_0$
- **微分方程**：$\frac{d\mathbf{s}}{dt} = f(\mathbf{s}, t)$

求解：在 $t > 0$ 时刻的状态 $\mathbf{s}(t)$

### 2.4 离散化

将连续时间离散化：

$$
t_n = t_0 + n\Delta t, \quad n = 0, 1, 2, \ldots
$$

其中 $\Delta t$ 是**时间步长（Time Step）**。

---

## 3. 常微分方程（ODE）

### 3.1 一般形式

一阶常微分方程的标准形式：

$$
\frac{dy}{dt} = f(y, t)
$$

初始条件：$y(t_0) = y_0$

### 3.2 物理系统的ODE形式

对于位置-速度系统：

$$
\frac{d}{dt}\begin{bmatrix} \mathbf{x} \\ \mathbf{v} \end{bmatrix} = \begin{bmatrix} \mathbf{v} \\ \mathbf{a}(\mathbf{x}, \mathbf{v}, t) \end{bmatrix}
$$

这是一个**耦合的一阶ODE系统**。

### 3.3 二阶ODE降阶

原始的牛顿方程是**二阶ODE**：

$$
\frac{d^2\mathbf{x}}{dt^2} = \mathbf{a}(t)
$$

通过引入速度变量 $\mathbf{v} = \frac{d\mathbf{x}}{dt}$，降阶为**一阶ODE系统**：

$$
\begin{cases}
\frac{d\mathbf{x}}{dt} = \mathbf{v} \\
\frac{d\mathbf{v}}{dt} = \mathbf{a}
\end{cases}
$$

---

## 4. 欧拉方法家族

### 4.1 显式欧拉法（Explicit Euler / Forward Euler）

#### 4.1.1 基本思想

使用**前向差分**近似导数：

$$
\frac{dy}{dt} \approx \frac{y(t+\Delta t) - y(t)}{\Delta t}
$$

#### 4.1.2 迭代公式

$$
y_{n+1} = y_n + \Delta t \cdot f(y_n, t_n)
$$

#### 4.1.3 物理系统应用

对于位置-速度系统：

$$
\begin{cases}
\mathbf{v}_{n+1} = \mathbf{v}_n + \Delta t \cdot \mathbf{a}_n \\
\mathbf{x}_{n+1} = \mathbf{x}_n + \Delta t \cdot \mathbf{v}_n
\end{cases}
$$

**注意顺序**：先更新速度，但位置使用**旧速度**！

#### 4.1.4 推导过程

从泰勒展开：

$$
y(t+\Delta t) = y(t) + \Delta t \cdot y'(t) + \frac{(\Delta t)^2}{2}y''(t) + O(\Delta t^3)
$$

忽略 $O(\Delta t^2)$ 及以上项：

$$
y(t+\Delta t) \approx y(t) + \Delta t \cdot y'(t) = y(t) + \Delta t \cdot f(y, t)
$$

#### 4.1.5 优点与缺点

**优点：**
- ✅ 实现简单
- ✅ 计算快速
- ✅ 每步只需计算一次导数

**缺点：**
- ❌ **数值不稳定**（容易发散）
- ❌ 精度低（一阶精度）
- ❌ 能量不守恒（物理系统会增加能量）
- ❌ 需要非常小的时间步长

#### 4.1.6 稳定性问题

对于弹簧系统 $\ddot{x} = -kx$，显式欧拉会导致：
- 振幅**指数增长**
- 能量**不断增加**
- 系统**发散**

#### 4.1.7 代码实现

```cpp
void ExplicitEuler(float DeltaTime, const FVector& Acceleration, 
                   FVector& Position, FVector& Velocity)
{
    // 先更新位置（使用旧速度）
    Position += Velocity * DeltaTime;
    
    // 再更新速度
    Velocity += Acceleration * DeltaTime;
}
```

---

### 4.2 隐式欧拉法（Implicit Euler / Backward Euler）

#### 4.2.1 基本思想

使用**后向差分**近似导数：

$$
\frac{dy}{dt} \approx \frac{y(t+\Delta t) - y(t)}{\Delta t}
$$

但在 $t + \Delta t$ 时刻评估导数！

#### 4.2.2 迭代公式

$$
y_{n+1} = y_n + \Delta t \cdot f(y_{n+1}, t_{n+1})
$$

注意右侧包含 $y_{n+1}$，这是一个**隐式方程**！

#### 4.2.3 物理系统应用

对于简单的恒定加速度：

$$
\begin{cases}
\mathbf{v}_{n+1} = \mathbf{v}_n + \Delta t \cdot \mathbf{a}_{n+1} \\
\mathbf{x}_{n+1} = \mathbf{x}_n + \Delta t \cdot \mathbf{v}_{n+1}
\end{cases}
$$

**关键区别**：位置使用**新速度**！

#### 4.2.4 求解方法

由于是隐式方程，通常需要：
1. **迭代求解**（牛顿法）
2. **简化近似**（对于简单力）
3. **线性化**

对于**恒定加速度**或**不依赖速度的力**，可以简化为显式计算。

#### 4.2.5 优点与缺点

**优点：**
- ✅ **数值稳定**（unconditionally stable）
- ✅ 可以使用大时间步长
- ✅ 能量耗散（适合阻尼系统）

**缺点：**
- ❌ 需要求解隐式方程（计算复杂）
- ❌ 能量耗散（物理系统会损失能量）
- ❌ 精度仍然是一阶

#### 4.2.6 稳定性优势

对于弹簧系统，隐式欧拉会导致：
- 振幅**逐渐衰减**
- 能量**逐渐减少**
- 系统**稳定**

#### 4.2.7 代码实现

```cpp
void ImplicitEuler(float DeltaTime, const FVector& Acceleration, 
                   FVector& Position, FVector& Velocity)
{
    // 先更新速度
    Velocity += Acceleration * DeltaTime;
    
    // 再更新位置（使用新速度）
    Position += Velocity * DeltaTime;
}
```

**注意**：这是简化版本，适用于恒定或简单加速度。对于复杂力场，需要迭代求解。

---

### 4.3 半隐式欧拉法（Semi-Implicit Euler / Symplectic Euler）

#### 4.3.1 基本思想

结合显式和隐式欧拉的优点：
- **速度更新**：显式（使用当前加速度）
- **位置更新**：隐式（使用新速度）

#### 4.3.2 迭代公式

$$
\begin{cases}
\mathbf{v}_{n+1} = \mathbf{v}_n + \Delta t \cdot \mathbf{a}(\mathbf{x}_n, \mathbf{v}_n, t_n) \\
\mathbf{x}_{n+1} = \mathbf{x}_n + \Delta t \cdot \mathbf{v}_{n+1}
\end{cases}
$$

#### 4.3.3 别名

- **Symplectic Euler**（辛欧拉）
- **Semi-implicit Euler**（半隐式欧拉）
- **Euler-Cromer Method**
- **Newton-Størmer-Verlet（单步形式）**

#### 4.3.4 辛性质（Symplectic Property）

半隐式欧拉是**辛积分器（Symplectic Integrator）**，具有重要性质：
- **近似守恒能量**（长期误差有界）
- **保持相空间体积**
- **适合哈密顿系统**

#### 4.3.5 优点与缺点

**优点：**
- ✅ **比显式欧拉稳定得多**
- ✅ 计算简单（无需迭代）
- ✅ **能量近似守恒**（最重要！）
- ✅ 适合游戏和实时模拟

**缺点：**
- ❌ 仍然是一阶精度
- ❌ 长期会有小的能量漂移

#### 4.3.6 为什么这么有效？

对于哈密顿系统（保守系统），半隐式欧拉具有**辛性质**：

$$
\text{能量误差} = O(\Delta t) \text{ 每步}, \quad \text{总误差} = O(\Delta t) \text{ 长期有界}
$$

而显式欧拉：

$$
\text{能量误差} = O(\Delta t) \text{ 每步}, \quad \text{总误差} \to \infty \text{ 指数增长}
$$

#### 4.3.7 代码实现

```cpp
void SemiImplicitEuler(float DeltaTime, const FVector& Acceleration, 
                       FVector& Position, FVector& Velocity)
{
    // 1. 先更新速度（显式步骤）
    Velocity += Acceleration * DeltaTime;
    
    // 2. 再更新位置，使用新速度（隐式步骤）
    Position += Velocity * DeltaTime;
}
```

#### 4.3.8 物理意义

半隐式欧拉的更新顺序符合**物理直觉**：
1. 力作用 → 速度变化
2. 速度变化 → 位置变化

#### 4.3.9 实际表现

对于简单弹簧振子 $\ddot{x} = -kx$：

| 方法 | 能量变化 | 振幅 | 周期 |
|------|----------|------|------|
| 显式欧拉 | ↑↑↑ 指数增长 | 增大 | 增大 |
| 隐式欧拉 | ↓↓↓ 指数衰减 | 减小 | 减小 |
| **半隐式欧拉** | **≈ 微小振荡** | **基本不变** | **略有误差** |

---

### 4.4 梯形法（Trapezoidal Rule / Heun's Method）

#### 4.4.1 基本思想

使用**梯形公式**近似积分：

$$
\int_{t_n}^{t_{n+1}} f(y, t) dt \approx \frac{\Delta t}{2} [f(y_n, t_n) + f(y_{n+1}, t_{n+1})]
$$

取区间两端点的**平均值**。

#### 4.4.2 迭代公式

$$
y_{n+1} = y_n + \frac{\Delta t}{2}[f(y_n, t_n) + f(y_{n+1}, t_{n+1})]
$$

#### 4.4.3 预测-校正形式

由于右侧包含 $y_{n+1}$，使用**两步法**：

**预测步（Predictor）**：
$$
\tilde{y}_{n+1} = y_n + \Delta t \cdot f(y_n, t_n) \quad \text{(显式欧拉)}
$$

**校正步（Corrector）**：
$$
y_{n+1} = y_n + \frac{\Delta t}{2}[f(y_n, t_n) + f(\tilde{y}_{n+1}, t_{n+1})]
$$

#### 4.4.4 物理系统应用

```
预测步：
    v_pred = v_n + Δt · a_n
    x_pred = x_n + Δt · v_n

校正步：
    v_{n+1} = v_n + Δt · a_n  (不变)
    x_{n+1} = x_n + Δt · (v_n + v_{n+1}) / 2
```

#### 4.4.5 精度

梯形法是**二阶精度**：局部误差 $O(\Delta t^3)$，全局误差 $O(\Delta t^2)$

#### 4.4.6 优点与缺点

**优点：**
- ✅ 二阶精度（比欧拉法精确）
- ✅ 数值稳定
- ✅ 相对简单

**缺点：**
- ❌ 需要计算两次导数（成本加倍）
- ❌ 实现稍复杂
- ❌ 不如RK4精确

#### 4.4.7 代码实现

```cpp
void TrapezoidalRule(float DeltaTime, const FVector& Acceleration, 
                     FVector& Position, FVector& Velocity)
{
    // 保存旧速度
    const FVector OldVelocity = Velocity;
    
    // 更新速度
    Velocity += Acceleration * DeltaTime;
    
    // 更新位置：使用旧速度和新速度的平均值
    Position += 0.5f * (OldVelocity + Velocity) * DeltaTime;
}
```

---

### 4.5 欧拉方法对比

| 方法 | 速度更新 | 位置更新 | 稳定性 | 能量 | 精度 | 推荐度 |
|------|----------|----------|--------|------|------|--------|
| **显式欧拉** | $v_{n+1} = v_n + a_n \Delta t$ | $x_{n+1} = x_n + v_n \Delta t$ | ❌ 差 | 增加 | 一阶 | ⭐ |
| **隐式欧拉** | $v_{n+1} = v_n + a_{n+1} \Delta t$ | $x_{n+1} = x_n + v_{n+1} \Delta t$ | ✅ 好 | 减少 | 一阶 | ⭐⭐ |
| **半隐式欧拉** | $v_{n+1} = v_n + a_n \Delta t$ | $x_{n+1} = x_n + v_{n+1} \Delta t$ | ✅ 很好 | **守恒** | 一阶 | ⭐⭐⭐⭐⭐ |
| **梯形法** | $v_{n+1} = v_n + a_n \Delta t$ | $x_{n+1} = x_n + \frac{v_n+v_{n+1}}{2} \Delta t$ | ✅ 好 | 近似守恒 | 二阶 | ⭐⭐⭐⭐ |

---

## 5. 龙格-库塔方法

### 5.1 龙格-库塔方法概述

**龙格-库塔（Runge-Kutta）方法**是一类高精度的单步显式方法。核心思想：
- 在时间步内多次**采样**导数
- 使用**加权平均**来提高精度

### 5.2 二阶龙格-库塔（RK2）

#### 5.2.1 中点法（Midpoint Method）

$$
\begin{aligned}
k_1 &= f(y_n, t_n) \\
k_2 &= f(y_n + \frac{\Delta t}{2}k_1, t_n + \frac{\Delta t}{2}) \\
y_{n+1} &= y_n + \Delta t \cdot k_2
\end{aligned}
$$

在**半步位置**评估导数，然后用此导数完成整步。

#### 5.2.2 几何意义

```
t_n          t_n+Δt/2         t_n+Δt
 •----------- • -------------- •
y_n       (预测)            y_{n+1}
              ↓
         用中点斜率
```

### 5.3 四阶龙格-库塔（RK4）

#### 5.3.1 标准RK4公式

$$
\begin{aligned}
k_1 &= f(y_n, t_n) \\
k_2 &= f(y_n + \frac{\Delta t}{2}k_1, t_n + \frac{\Delta t}{2}) \\
k_3 &= f(y_n + \frac{\Delta t}{2}k_2, t_n + \frac{\Delta t}{2}) \\
k_4 &= f(y_n + \Delta t \cdot k_3, t_n + \Delta t) \\
y_{n+1} &= y_n + \frac{\Delta t}{6}(k_1 + 2k_2 + 2k_3 + k_4)
\end{aligned}
$$

#### 5.3.2 物理意义

- $k_1$：时间步**起点**的斜率
- $k_2$：时间步**中点**的斜率（基于 $k_1$ 预测）
- $k_3$：时间步**中点**的斜率（基于 $k_2$ 预测）
- $k_4$：时间步**终点**的斜率（基于 $k_3$ 预测）

**加权平均**：中点的权重（4/6）大于端点（2/6）

#### 5.3.3 物理系统的RK4

对于位置-速度系统，$\mathbf{s} = [\mathbf{x}, \mathbf{v}]^T$：

$$
f(\mathbf{s}) = \begin{bmatrix} \mathbf{v} \\ \mathbf{a}(\mathbf{x}, \mathbf{v}) \end{bmatrix}
$$

展开RK4：

```cpp
// k1：起点
k1_v = a(x_n, v_n)
k1_x = v_n

// k2：中点（基于k1）
k2_v = a(x_n + 0.5*Δt*k1_x, v_n + 0.5*Δt*k1_v)
k2_x = v_n + 0.5*Δt*k1_v

// k3：中点（基于k2）
k3_v = a(x_n + 0.5*Δt*k2_x, v_n + 0.5*Δt*k2_v)
k3_x = v_n + 0.5*Δt*k2_v

// k4：终点（基于k3）
k4_v = a(x_n + Δt*k3_x, v_n + Δt*k3_v)
k4_x = v_n + Δt*k3_v

// 加权平均
v_{n+1} = v_n + (Δt/6)(k1_v + 2*k2_v + 2*k3_v + k4_v)
x_{n+1} = x_n + (Δt/6)(k1_x + 2*k2_x + 2*k3_x + k4_x)
```

#### 5.3.4 恒定加速度的简化

如果加速度**恒定**（如重力），则：

$$
k_1 = k_2 = k_3 = k_4 = \mathbf{a}
$$

简化为：

$$
\begin{aligned}
\mathbf{v}_{n+1} &= \mathbf{v}_n + \Delta t \cdot \mathbf{a} \\
\mathbf{x}_{n+1} &= \mathbf{x}_n + \frac{\Delta t}{6}(\mathbf{v}_n + 2\mathbf{v}_{\text{mid1}} + 2\mathbf{v}_{\text{mid2}} + \mathbf{v}_{n+1})
\end{aligned}
$$

其中：
- $\mathbf{v}_{\text{mid1}} = \mathbf{v}_n + 0.5\Delta t \cdot \mathbf{a}$
- $\mathbf{v}_{\text{mid2}} = \mathbf{v}_n + 0.5\Delta t \cdot \mathbf{a}$

#### 5.3.5 精度

RK4是**四阶精度**：
- 局部截断误差：$O(\Delta t^5)$
- 全局截断误差：$O(\Delta t^4)$

这意味着时间步长减半，误差减少到 $1/16$！

#### 5.3.6 优点与缺点

**优点：**
- ✅ **高精度**（四阶）
- ✅ 单步法（无需历史）
- ✅ 自启动
- ✅ 适合变步长

**缺点：**
- ❌ **计算成本高**（每步4次力计算）
- ❌ 不保证能量守恒
- ❌ 对刚性问题（stiff problems）效果差

#### 5.3.7 代码实现

```cpp
void RK4Integration(float DeltaTime, const FVector& Gravity, 
                    FVector& Position, FVector& Velocity)
{
    // 对于恒定加速度（重力）
    const FVector a = Gravity;
    
    // RK4 for velocity（恒定加速度简化）
    const FVector k1_v = a;
    const FVector k2_v = a;
    const FVector k3_v = a;
    const FVector k4_v = a;
    
    // RK4 for position
    const FVector k1_x = Velocity;
    const FVector k2_x = Velocity + 0.5f * DeltaTime * k1_v;
    const FVector k3_x = Velocity + 0.5f * DeltaTime * k2_v;
    const FVector k4_x = Velocity + DeltaTime * k3_v;
    
    // 更新速度
    Velocity += (DeltaTime / 6.f) * (k1_v + 2.f*k2_v + 2.f*k3_v + k4_v);
    
    // 更新位置
    Position += (DeltaTime / 6.f) * (k1_x + 2.f*k2_x + 2.f*k3_x + k4_x);
}
```

#### 5.3.8 非恒定力的完整实现

```cpp
// 力函数接口
using ForceFunction = std::function<FVector(const FVector&, const FVector&, float)>;

void RK4IntegrationGeneral(float DeltaTime, ForceFunction ComputeForce, float Mass,
                           FVector& Position, FVector& Velocity, float Time)
{
    // k1: 在起点评估
    FVector k1_v = ComputeForce(Position, Velocity, Time) / Mass;
    FVector k1_x = Velocity;
    
    // k2: 在中点评估（基于k1）
    FVector pos_mid1 = Position + 0.5f * DeltaTime * k1_x;
    FVector vel_mid1 = Velocity + 0.5f * DeltaTime * k1_v;
    FVector k2_v = ComputeForce(pos_mid1, vel_mid1, Time + 0.5f*DeltaTime) / Mass;
    FVector k2_x = vel_mid1;
    
    // k3: 在中点评估（基于k2）
    FVector pos_mid2 = Position + 0.5f * DeltaTime * k2_x;
    FVector vel_mid2 = Velocity + 0.5f * DeltaTime * k2_v;
    FVector k3_v = ComputeForce(pos_mid2, vel_mid2, Time + 0.5f*DeltaTime) / Mass;
    FVector k3_x = vel_mid2;
    
    // k4: 在终点评估（基于k3）
    FVector pos_end = Position + DeltaTime * k3_x;
    FVector vel_end = Velocity + DeltaTime * k3_v;
    FVector k4_v = ComputeForce(pos_end, vel_end, Time + DeltaTime) / Mass;
    FVector k4_x = vel_end;
    
    // 加权平均更新
    Velocity += (DeltaTime / 6.f) * (k1_v + 2.f*k2_v + 2.f*k3_v + k4_v);
    Position += (DeltaTime / 6.f) * (k1_x + 2.f*k2_x + 2.f*k3_x + k4_x);
}
```

### 5.4 自适应步长RK45

#### 5.4.1 基本思想

使用**两种不同阶数**的方法：
- RK4（4阶）
- RK5（5阶）

比较两者的结果，估计**局部误差**：

$$
\text{误差估计} = |y_{\text{RK5}} - y_{\text{RK4}}|
$$

#### 5.4.2 步长控制

根据误差自动调整步长：

$$
\Delta t_{\text{new}} = \Delta t_{\text{old}} \cdot \left(\frac{\epsilon}{\text{误差}}\right)^{1/5}
$$

- 如果误差太大 → 减小步长，重新计算
- 如果误差太小 → 增大步长（下一步）

#### 5.4.3 Dormand-Prince方法（DOPRI5）

**最流行的RK45方法**，特点：
- 使用**7次**函数评估
- 同时得到4阶和5阶结果
- **FSAL（First Same As Last）**：第一步的 $k_1$ 等于上一步的 $k_7$

#### 5.4.4 优点

- ✅ 自动控制误差
- ✅ 效率高（大步长区域）
- ✅ 精确（小步长区域）

---

## 6. 稳定性分析

### 6.1 什么是数值稳定性

**数值稳定性（Numerical Stability）**：
- 数值误差**不会无限增长**
- 解保持**有界**

### 6.2 测试方程

使用**Dahlquist测试方程**分析稳定性：

$$
\frac{dy}{dt} = \lambda y, \quad y(0) = 1
$$

解析解：$y(t) = e^{\lambda t}$

- 如果 $\text{Re}(\lambda) < 0$，真解 $\to 0$（稳定）
- 数值解也应该 $\to 0$

### 6.3 稳定域

#### 6.3.1 显式欧拉

迭代公式：

$$
y_{n+1} = y_n + \Delta t \cdot \lambda y_n = (1 + \lambda \Delta t) y_n
$$

稳定条件：

$$
|1 + \lambda \Delta t| < 1
$$

对于 $\lambda = -\omega^2$（如弹簧），稳定条件：

$$
\Delta t < \frac{2}{\omega}
$$

**结论**：稳定域很小，需要非常小的时间步长。

#### 6.3.2 隐式欧拉

迭代公式：

$$
y_{n+1} = y_n + \Delta t \cdot \lambda y_{n+1}
$$

求解：

$$
y_{n+1} = \frac{y_n}{1 - \lambda \Delta t}
$$

稳定条件：

$$
\left|\frac{1}{1 - \lambda \Delta t}\right| < 1
$$

**结论**：对于 $\text{Re}(\lambda) < 0$，总是稳定（**无条件稳定**）！

#### 6.3.3 RK4

RK4的稳定函数：

$$
y_{n+1} = R(\lambda \Delta t) y_n
$$

其中：

$$
R(z) = 1 + z + \frac{z^2}{2} + \frac{z^3}{6} + \frac{z^4}{24}
$$

稳定域：$|R(z)| < 1$

稳定域更大，但仍然是**条件稳定**。

### 6.4 物理系统的稳定性

#### 6.4.1 简谐振子

对于弹簧系统 $\ddot{x} = -\omega^2 x$：

| 方法 | 稳定条件 | 能量变化 |
|------|----------|----------|
| 显式欧拉 | $\Delta t < 2/\omega$ | 增加 |
| 隐式欧拉 | 无条件稳定 | 减少 |
| 半隐式欧拉 | 无条件稳定 | **近似守恒** |
| RK4 | $\Delta t < 2.8/\omega$ | 小幅振荡 |

#### 6.4.2 刚性问题（Stiff Problems）

**刚性系统**特征：
- 包含**多个时间尺度**
- 某些分量变化很快（$\omega$ 很大）

例如：弹簧 + 阻尼

$$
\ddot{x} + 2\zeta\omega\dot{x} + \omega^2 x = 0
$$

如果 $\omega$ 很大（刚性弹簧），显式方法需要极小的步长。

**解决方案**：
- 使用隐式方法
- 使用辛算法
- 特殊的刚性求解器

---

## 7. 精度分析

### 7.1 误差类型

#### 7.1.1 局部截断误差（LTE）

单步的误差：

$$
\text{LTE} = y(t_{n+1}) - y_{n+1}
$$

#### 7.1.2 全局截断误差（GTE）

累积的总误差：

$$
\text{GTE} = y(t_N) - y_N
$$

#### 7.1.3 关系

如果 $\text{LTE} = O(\Delta t^{p+1})$，则 $\text{GTE} = O(\Delta t^p)$

### 7.2 精度阶数

| 方法 | 局部误差 | 全局误差 | 阶数 |
|------|----------|----------|------|
| 显式欧拉 | $O(\Delta t^2)$ | $O(\Delta t)$ | 1阶 |
| 隐式欧拉 | $O(\Delta t^2)$ | $O(\Delta t)$ | 1阶 |
| 半隐式欧拉 | $O(\Delta t^2)$ | $O(\Delta t)$ | 1阶 |
| 梯形法 | $O(\Delta t^3)$ | $O(\Delta t^2)$ | 2阶 |
| RK2 | $O(\Delta t^3)$ | $O(\Delta t^2)$ | 2阶 |
| RK4 | $O(\Delta t^5)$ | $O(\Delta t^4)$ | 4阶 |

### 7.3 收敛性测试

#### 7.3.1 方法

使用已知解析解的问题，测试不同步长下的误差：

```
Δt = 0.1  → 误差 E₁
Δt = 0.05 → 误差 E₂
Δt = 0.025 → 误差 E₃
```

#### 7.3.2 收敛率

$$
p = \frac{\log(E_1/E_2)}{\log(2)}
$$

- 1阶方法：步长减半 → 误差减半
- 2阶方法：步长减半 → 误差减至1/4
- 4阶方法：步长减半 → 误差减至1/16

---

## 8. 物理模拟中的应用

### 8.1 粒子系统

#### 8.1.1 基本粒子

最简单的例子：自由落体

```cpp
struct Particle
{
    FVector Position;
    FVector Velocity;
    float Mass;
};

void UpdateParticle(Particle& P, float DeltaTime, const FVector& Gravity)
{
    FVector Acceleration = Gravity;  // a = F/m = mg/m = g
    
    // 半隐式欧拉
    P.Velocity += Acceleration * DeltaTime;
    P.Position += P.Velocity * DeltaTime;
}
```

#### 8.1.2 多粒子系统

```cpp
void UpdateParticles(TArray<Particle>& Particles, float DeltaTime, const FVector& Gravity)
{
    for (Particle& P : Particles)
    {
        FVector Force = P.Mass * Gravity;
        FVector Acceleration = Force / P.Mass;
        
        // 半隐式欧拉
        P.Velocity += Acceleration * DeltaTime;
        P.Position += P.Velocity * DeltaTime;
    }
}
```

### 8.2 弹簧系统

#### 8.2.1 胡克定律

$$
\mathbf{F} = -k(\|\mathbf{x}\| - L_0)\frac{\mathbf{x}}{\|\mathbf{x}\|}
$$

其中：
- $k$ - 弹簧刚度
- $L_0$ - 静止长度
- $\mathbf{x}$ - 位移向量

#### 8.2.2 代码实现

```cpp
FVector ComputeSpringForce(const FVector& Pos1, const FVector& Pos2, 
                           float SpringConstant, float RestLength)
{
    FVector Delta = Pos2 - Pos1;
    float CurrentLength = Delta.Size();
    
    if (CurrentLength < KINDA_SMALL_NUMBER)
        return FVector::ZeroVector;
    
    FVector Direction = Delta / CurrentLength;
    float Extension = CurrentLength - RestLength;
    
    return SpringConstant * Extension * Direction;
}
```

#### 8.2.3 阻尼弹簧

添加阻尼：

$$
\mathbf{F} = -k(\|\mathbf{x}\| - L_0)\frac{\mathbf{x}}{\|\mathbf{x}\|} - c\mathbf{v}
$$

```cpp
FVector ComputeDampedSpringForce(const FVector& Pos1, const FVector& Pos2,
                                 const FVector& Vel1, const FVector& Vel2,
                                 float K, float Damping, float RestLength)
{
    FVector Delta = Pos2 - Pos1;
    float CurrentLength = Delta.Size();
    
    if (CurrentLength < KINDA_SMALL_NUMBER)
        return FVector::ZeroVector;
    
    FVector Direction = Delta / CurrentLength;
    float Extension = CurrentLength - RestLength;
    
    // 弹簧力
    FVector SpringForce = K * Extension * Direction;
    
    // 阻尼力（沿弹簧方向的相对速度）
    FVector RelativeVelocity = Vel2 - Vel1;
    float VelocityAlongSpring = FVector::DotProduct(RelativeVelocity, Direction);
    FVector DampingForce = Damping * VelocityAlongSpring * Direction;
    
    return SpringForce + DampingForce;
}
```

### 8.3 刚体动力学

#### 8.3.1 状态向量

刚体的状态包含：

$$
\mathbf{s} = \begin{bmatrix} 
\mathbf{x} \\ 
\mathbf{v} \\ 
\mathbf{q} \\ 
\boldsymbol{\omega} 
\end{bmatrix}
$$

- $\mathbf{x}$ - 质心位置
- $\mathbf{v}$ - 线速度
- $\mathbf{q}$ - 方向（四元数）
- $\boldsymbol{\omega}$ - 角速度

#### 8.3.2 运动方程

$$
\begin{cases}
\frac{d\mathbf{x}}{dt} = \mathbf{v} \\
\frac{d\mathbf{v}}{dt} = \mathbf{F}/m \\
\frac{d\mathbf{q}}{dt} = \frac{1}{2}\boldsymbol{\omega} \mathbf{q} \\
\frac{d\boldsymbol{\omega}}{dt} = \mathbf{I}^{-1}(\boldsymbol{\tau} - \boldsymbol{\omega} \times \mathbf{I}\boldsymbol{\omega})
\end{cases}
$$

#### 8.3.3 代码框架

```cpp
struct RigidBody
{
    // 线性
    FVector Position;
    FVector Velocity;
    float Mass;
    
    // 旋转
    FQuat Orientation;
    FVector AngularVelocity;
    FMatrix InertiaTensor;
};

void UpdateRigidBody(RigidBody& Body, float DeltaTime, 
                     const FVector& Force, const FVector& Torque)
{
    // 线性运动
    FVector LinearAccel = Force / Body.Mass;
    Body.Velocity += LinearAccel * DeltaTime;
    Body.Position += Body.Velocity * DeltaTime;
    
    // 角运动
    FVector AngularAccel = Body.InertiaTensor.InverseTransformVector(Torque);
    Body.AngularVelocity += AngularAccel * DeltaTime;
    
    // 四元数更新
    FQuat OmegaQuat(Body.AngularVelocity.X, Body.AngularVelocity.Y, 
                    Body.AngularVelocity.Z, 0.0f);
    FQuat DeltaQuat = OmegaQuat * Body.Orientation;
    Body.Orientation += DeltaQuat * (0.5f * DeltaTime);
    Body.Orientation.Normalize();
}
```

### 8.4 流体模拟（SPH/PBF）

#### 8.4.1 SPH基本流程

```cpp
void UpdateSPH(TArray<Particle>& Particles, float DeltaTime)
{
    // 1. 计算密度和压力
    ComputeDensityPressure(Particles);
    
    // 2. 计算力
    for (Particle& P : Particles)
    {
        FVector Force = FVector::ZeroVector;
        Force += ComputePressureForce(P, Particles);
        Force += ComputeViscosityForce(P, Particles);
        Force += Gravity * P.Mass;
        
        P.Acceleration = Force / P.Mass;
    }
    
    // 3. 数值积分
    for (Particle& P : Particles)
    {
        // 半隐式欧拉
        P.Velocity += P.Acceleration * DeltaTime;
        P.Position += P.Velocity * DeltaTime;
    }
    
    // 4. 边界碰撞
    HandleCollisions(Particles);
}
```

### 8.5 约束系统（PBD）

#### 8.5.1 Position Based Dynamics

PBD不直接使用数值积分，而是：

```cpp
void UpdatePBD(TArray<Particle>& Particles, float DeltaTime)
{
    // 1. 预测位置（显式欧拉）
    for (Particle& P : Particles)
    {
        P.Velocity += Gravity * DeltaTime;
        P.PredictedPosition = P.Position + P.Velocity * DeltaTime;
    }
    
    // 2. 迭代求解约束
    for (int i = 0; i < NumIterations; ++i)
    {
        SolveConstraints(Particles);
    }
    
    // 3. 更新速度和位置
    for (Particle& P : Particles)
    {
        P.Velocity = (P.PredictedPosition - P.Position) / DeltaTime;
        P.Position = P.PredictedPosition;
    }
}
```

---

## 9. 方法对比与选择

### 9.1 综合对比表

| 方法 | 精度 | 稳定性 | 能量守恒 | 计算成本 | 实现难度 | 适用场景 |
|------|------|--------|----------|----------|----------|----------|
| **显式欧拉** | ⭐ | ⭐ | ❌ | ⭐ | ⭐ | 教学演示 |
| **隐式欧拉** | ⭐ | ⭐⭐⭐⭐⭐ | ❌ | ⭐⭐⭐ | ⭐⭐⭐ | 刚性系统 |
| **半隐式欧拉** | ⭐ | ⭐⭐⭐⭐ | ✅ | ⭐ | ⭐ | **游戏/实时模拟** |
| **梯形法** | ⭐⭐ | ⭐⭐⭐⭐ | ✅ | ⭐⭐ | ⭐⭐ | 平衡需求 |
| **RK4** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 精确模拟 |
| **RK45自适应** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | 科学计算 |

### 9.2 应用场景推荐

#### 9.2.1 游戏/实时模拟

**推荐：半隐式欧拉**

**理由：**
- ✅ 计算快速
- ✅ 稳定性好
- ✅ 能量近似守恒
- ✅ 实现简单
- ✅ 视觉效果自然

**示例：**
- 粒子系统
- 布料模拟
- 软体物理
- 简单刚体

#### 9.2.2 精确科学模拟

**推荐：RK4或RK45**

**理由：**
- ✅ 高精度
- ✅ 误差可控
- ✅ 自适应步长

**示例：**
- 天体轨道
- 飞行器模拟
- 机器人动力学
- 精密工程

#### 9.2.3 刚性系统

**推荐：隐式方法**

**理由：**
- ✅ 无条件稳定
- ✅ 可用大步长

**示例：**
- 刚性弹簧
- 化学反应
- 电路模拟

#### 9.2.4 约束系统

**推荐：Position Based Dynamics**

**理由：**
- ✅ 直接求解约束
- ✅ 稳定可控
- ✅ 适合交互

**示例：**
- 布料
- 绳索
- 头发
- 流体（PBF）

### 9.3 决策流程图

```
需要高精度？
├─ 是 → RK4/RK45
└─ 否 → 需要稳定性？
         ├─ 是 → 有约束？
         │        ├─ 是 → PBD
         │        └─ 否 → 半隐式欧拉
         └─ 否 → 教学演示？
                  ├─ 是 → 显式欧拉
                  └─ 否 → 半隐式欧拉
```

### 9.4 性能考量

#### 9.4.1 每帧计算次数

假设目标60 FPS（16.67ms/帧）：

| 方法 | 力计算次数/步 | 适合的时间步长 | 每帧子步数 | 总计算量 |
|------|---------------|----------------|-----------|----------|
| 半隐式欧拉 | 1 | 1/60 s | 1 | 1× |
| 梯形法 | 2 | 1/60 s | 1 | 2× |
| RK4 | 4 | 1/60 s | 1 | 4× |
| 半隐式欧拉 | 1 | 1/360 s | 6 | 6× |

**结论**：在固定精度下，半隐式欧拉通常更高效。

#### 9.4.2 内存占用

| 方法 | 额外存储需求 |
|------|-------------|
| 欧拉系列 | 无 |
| RK4 | 4个中间状态（临时） |
| 多步法 | 多个历史状态 |

---

## 10. 高级主题

### 10.1 辛积分器（Symplectic Integrators）

#### 10.1.1 什么是辛积分

**辛积分器**是保持哈密顿系统辛结构的积分方法。

**核心性质**：
- 相空间体积守恒（刘维尔定理）
- 能量近似守恒（长期有界）

#### 10.1.2 为什么重要

对于保守系统（无阻尼），辛积分器能：
- **长期稳定**
- **能量误差有界**
- **不会发散或衰减**

#### 10.1.3 常见辛积分器

**1. 半隐式欧拉（最简单的辛积分器）**

$$
\begin{cases}
\mathbf{v}_{n+1} = \mathbf{v}_n + \Delta t \cdot \mathbf{a}(\mathbf{x}_n) \\
\mathbf{x}_{n+1} = \mathbf{x}_n + \Delta t \cdot \mathbf{v}_{n+1}
\end{cases}
$$

**2. Verlet算法**

$$
\mathbf{x}_{n+1} = 2\mathbf{x}_n - \mathbf{x}_{n-1} + (\Delta t)^2 \mathbf{a}_n
$$

**3. Velocity Verlet**

$$
\begin{aligned}
\mathbf{x}_{n+1} &= \mathbf{x}_n + \Delta t \cdot \mathbf{v}_n + \frac{(\Delta t)^2}{2}\mathbf{a}_n \\
\mathbf{v}_{n+1} &= \mathbf{v}_n + \frac{\Delta t}{2}(\mathbf{a}_n + \mathbf{a}_{n+1})
\end{aligned}
$$

#### 10.1.4 Velocity Verlet实现

```cpp
void VelocityVerlet(float DeltaTime, FVector& Position, FVector& Velocity,
                    std::function<FVector(const FVector&)> ComputeAcceleration)
{
    // 当前加速度
    FVector AccelCurrent = ComputeAcceleration(Position);
    
    // 更新位置
    Position += Velocity * DeltaTime + 0.5f * AccelCurrent * DeltaTime * DeltaTime;
    
    // 新位置的加速度
    FVector AccelNext = ComputeAcceleration(Position);
    
    // 更新速度（使用平均加速度）
    Velocity += 0.5f * (AccelCurrent + AccelNext) * DeltaTime;
}
```

### 10.2 多步法（Multi-Step Methods）

#### 10.2.1 Adams-Bashforth方法

使用**多个历史点**的信息：

**2步AB方法**：

$$
y_{n+1} = y_n + \frac{\Delta t}{2}(3f_n - f_{n-1})
$$

**4步AB方法**：

$$
y_{n+1} = y_n + \frac{\Delta t}{24}(55f_n - 59f_{n-1} + 37f_{n-2} - 9f_{n-3})
$$

#### 10.2.2 优点与缺点

**优点：**
- ✅ 每步只需计算一次导数
- ✅ 高阶精度

**缺点：**
- ❌ 需要存储历史
- ❌ 不能自启动
- ❌ 变步长困难

### 10.3 预测-校正方法

#### 10.3.1 基本思想

结合显式（预测）和隐式（校正）：

**预测步**（显式方法）：

$$
\tilde{y}_{n+1} = y_n + \Delta t \cdot f(y_n, t_n)
$$

**校正步**（隐式方法）：

$$
y_{n+1} = y_n + \frac{\Delta t}{2}[f(y_n, t_n) + f(\tilde{y}_{n+1}, t_{n+1})]
$$

#### 10.3.2 Adams-Bashforth-Moulton

**预测**（Adams-Bashforth）：

$$
\tilde{y}_{n+1} = y_n + \frac{\Delta t}{2}(3f_n - f_{n-1})
$$

**校正**（Adams-Moulton）：

$$
y_{n+1} = y_n + \frac{\Delta t}{2}(f_{n+1} + f_n)
$$

### 10.4 子步进（Sub-stepping）

#### 10.4.1 基本思想

将一个大时间步分成多个小步：

$$
\Delta t_{\text{frame}} = N \times \Delta t_{\text{physics}}
$$

#### 10.4.2 实现

```cpp
void UpdatePhysicsWithSubstepping(TArray<Particle>& Particles, 
                                   float FrameDeltaTime, int NumSubsteps)
{
    float PhysicsDeltaTime = FrameDeltaTime / NumSubsteps;
    
    for (int i = 0; i < NumSubsteps; ++i)
    {
        // 计算力
        ComputeForces(Particles);
        
        // 积分
        for (Particle& P : Particles)
        {
            FVector Accel = P.Force / P.Mass;
            P.Velocity += Accel * PhysicsDeltaTime;
            P.Position += P.Velocity * PhysicsDeltaTime;
        }
        
        // 碰撞检测和响应
        HandleCollisions(Particles);
    }
}
```

#### 10.4.3 优点

- ✅ 提高稳定性
- ✅ 提高精度
- ✅ 避免穿透

### 10.5 固定时间步 vs 可变时间步

#### 10.5.1 固定时间步

```cpp
float AccumulatedTime = 0.0f;
const float FixedDeltaTime = 1.0f / 60.0f;

void Tick(float FrameDeltaTime)
{
    AccumulatedTime += FrameDeltaTime;
    
    while (AccumulatedTime >= FixedDeltaTime)
    {
        UpdatePhysics(FixedDeltaTime);
        AccumulatedTime -= FixedDeltaTime;
    }
}
```

**优点：**
- ✅ 可重复性（确定性）
- ✅ 稳定性好
- ✅ 适合网络同步

#### 10.5.2 可变时间步

```cpp
void Tick(float FrameDeltaTime)
{
    UpdatePhysics(FrameDeltaTime);
}
```

**优点：**
- ✅ 实现简单
- ✅ 不会累积延迟

**缺点：**
- ❌ 不可重复
- ❌ 可能不稳定

### 10.6 误差控制

#### 10.6.1 局部误差估计

使用不同阶数方法的差异：

$$
\text{Error} \approx |y_{\text{high}} - y_{\text{low}}|
$$

#### 10.6.2 自适应步长

```cpp
float AdaptiveStep(float CurrentDeltaTime, float Error, float Tolerance)
{
    const float SafetyFactor = 0.9f;
    const float MinScale = 0.2f;
    const float MaxScale = 5.0f;
    
    float Scale = SafetyFactor * pow(Tolerance / Error, 0.2f);
    Scale = FMath::Clamp(Scale, MinScale, MaxScale);
    
    return CurrentDeltaTime * Scale;
}
```

---

## 11. 实际代码实现

### 11.1 通用积分器接口

```cpp
// 积分器接口
class IIntegrator
{
public:
    virtual ~IIntegrator() = default;
    
    virtual void Step(FVector& Position, FVector& Velocity, 
                     const FVector& Acceleration, float DeltaTime) = 0;
};

// 半隐式欧拉
class SemiImplicitEulerIntegrator : public IIntegrator
{
public:
    void Step(FVector& Position, FVector& Velocity, 
              const FVector& Acceleration, float DeltaTime) override
    {
        Velocity += Acceleration * DeltaTime;
        Position += Velocity * DeltaTime;
    }
};

// RK4
class RK4Integrator : public IIntegrator
{
public:
    void Step(FVector& Position, FVector& Velocity, 
              const FVector& Acceleration, float DeltaTime) override
    {
        // 简化版（恒定加速度）
        const FVector k1_v = Acceleration;
        const FVector k1_x = Velocity;
        const FVector k2_x = Velocity + 0.5f * DeltaTime * k1_v;
        const FVector k3_x = Velocity + 0.5f * DeltaTime * k1_v;
        const FVector k4_x = Velocity + DeltaTime * k1_v;
        
        Velocity += DeltaTime * Acceleration;
        Position += (DeltaTime / 6.0f) * (k1_x + 2.0f*k2_x + 2.0f*k3_x + k4_x);
    }
};
```

### 11.2 粒子系统

```cpp
USTRUCT(BlueprintType)
struct FPhysicsParticle
{
    GENERATED_BODY()
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Position = FVector::ZeroVector;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    FVector Velocity = FVector::ZeroVector;
    
    UPROPERTY(EditAnywhere, BlueprintReadWrite)
    float Mass = 1.0f;
    
    FVector Force = FVector::ZeroVector;
};

UCLASS()
class UParticleSystemComponent : public UActorComponent
{
    GENERATED_BODY()
    
public:
    UPROPERTY(EditAnywhere)
    TArray<FPhysicsParticle> Particles;
    
    UPROPERTY(EditAnywhere)
    FVector Gravity = FVector(0, 0, -980.0f);
    
    UPROPERTY(EditAnywhere)
    int32 NumSubsteps = 1;
    
    virtual void TickComponent(float DeltaTime, 
                              ELevelTick TickType,
                              FActorComponentTickFunction* ThisTickFunction) override;
    
private:
    void IntegrateParticles(float DeltaTime);
    void ComputeForces();
};

void UParticleSystemComponent::TickComponent(float DeltaTime, ...)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    
    float SubDeltaTime = DeltaTime / NumSubsteps;
    
    for (int32 i = 0; i < NumSubsteps; ++i)
    {
        ComputeForces();
        IntegrateParticles(SubDeltaTime);
    }
}

void UParticleSystemComponent::ComputeForces()
{
    for (FPhysicsParticle& P : Particles)
    {
        // 重力
        P.Force = Gravity * P.Mass;
        
        // 可以添加其他力：空气阻力、弹簧力等
    }
}

void UParticleSystemComponent::IntegrateParticles(float DeltaTime)
{
    for (FPhysicsParticle& P : Particles)
    {
        FVector Acceleration = P.Force / P.Mass;
        
        // 半隐式欧拉
        P.Velocity += Acceleration * DeltaTime;
        P.Position += P.Velocity * DeltaTime;
    }
}
```

### 11.3 弹簧链

```cpp
UCLASS()
class USpringChainComponent : public UActorComponent
{
    GENERATED_BODY()
    
public:
    UPROPERTY(EditAnywhere)
    TArray<FPhysicsParticle> Particles;
    
    UPROPERTY(EditAnywhere)
    float SpringConstant = 1000.0f;
    
    UPROPERTY(EditAnywhere)
    float DampingConstant = 10.0f;
    
    UPROPERTY(EditAnywhere)
    float RestLength = 100.0f;
    
private:
    void ComputeSpringForces();
};

void USpringChainComponent::ComputeSpringForces()
{
    // 初始化力
    for (FPhysicsParticle& P : Particles)
    {
        P.Force = Gravity * P.Mass;
    }
    
    // 弹簧力（连接相邻粒子）
    for (int32 i = 0; i < Particles.Num() - 1; ++i)
    {
        FPhysicsParticle& P1 = Particles[i];
        FPhysicsParticle& P2 = Particles[i + 1];
        
        FVector Delta = P2.Position - P1.Position;
        float CurrentLength = Delta.Size();
        
        if (CurrentLength > KINDA_SMALL_NUMBER)
        {
            FVector Direction = Delta / CurrentLength;
            
            // 弹簧力
            float Extension = CurrentLength - RestLength;
            FVector SpringForce = SpringConstant * Extension * Direction;
            
            // 阻尼力
            FVector RelativeVelocity = P2.Velocity - P1.Velocity;
            float VelAlongSpring = FVector::DotProduct(RelativeVelocity, Direction);
            FVector DampingForce = DampingConstant * VelAlongSpring * Direction;
            
            FVector TotalForce = SpringForce + DampingForce;
            
            P1.Force += TotalForce;
            P2.Force -= TotalForce;  // 牛顿第三定律
        }
    }
}
```

### 11.4 性能优化版本

```cpp
// 使用SIMD优化的批量更新
void IntegrateParticlesBatch(TArray<FPhysicsParticle>& Particles, 
                             const FVector& Gravity, float DeltaTime)
{
    const int32 NumParticles = Particles.Num();
    
    // 使用并行for循环
    ParallelFor(NumParticles, [&](int32 Index)
    {
        FPhysicsParticle& P = Particles[Index];
        FVector Acceleration = P.Force / P.Mass + Gravity;
        
        P.Velocity += Acceleration * DeltaTime;
        P.Position += P.Velocity * DeltaTime;
    });
}
```

---

## 12. 最佳实践

### 12.1 选择积分器的黄金法则

```
1. 游戏/实时 → 半隐式欧拉 + 子步进
2. 需要精度 → RK4
3. 刚性系统 → 隐式方法
4. 约束系统 → PBD
5. 保守系统 → 辛积分器
```

### 12.2 时间步长建议

| 应用 | 推荐步长 | 最大步长 |
|------|----------|----------|
| 游戏粒子 | 1/60 s | 1/30 s |
| 刚体 | 1/60 s | 1/60 s |
| 柔体/布料 | 1/360 s | 1/120 s |
| 流体（SPH） | 1/1000 s | 1/500 s |
| 精密模拟 | 自适应 | 取决于误差 |

### 12.3 常见陷阱

#### 12.3.1 ❌ 错误：使用显式欧拉

```cpp
// 不稳定！
Position += Velocity * DeltaTime;  // 先更新位置
Velocity += Acceleration * DeltaTime;  // 后更新速度
```

#### 12.3.2 ✅ 正确：使用半隐式欧拉

```cpp
// 稳定！
Velocity += Acceleration * DeltaTime;  // 先更新速度
Position += Velocity * DeltaTime;  // 后更新位置（用新速度）
```

#### 12.3.3 ❌ 错误：大时间步长

```cpp
// 可能穿透和爆炸！
UpdatePhysics(GetWorld()->GetDeltaSeconds());  // 可能 > 0.1s
```

#### 12.3.4 ✅ 正确：子步进

```cpp
// 稳定且精确
float FrameDT = GetWorld()->GetDeltaSeconds();
float PhysicsDT = 1.0f / 60.0f;
int NumSteps = FMath::CeilToInt(FrameDT / PhysicsDT);
float SubDT = FrameDT / NumSteps;

for (int i = 0; i < NumSteps; ++i)
{
    UpdatePhysics(SubDT);
}
```

### 12.4 调试技巧

#### 12.4.1 能量监控

```cpp
float ComputeTotalEnergy(const TArray<FPhysicsParticle>& Particles, 
                         const FVector& Gravity)
{
    float TotalEnergy = 0.0f;
    
    for (const FPhysicsParticle& P : Particles)
    {
        // 动能 = 0.5 * m * v²
        float KineticEnergy = 0.5f * P.Mass * P.Velocity.SizeSquared();
        
        // 势能 = m * g * h
        float PotentialEnergy = -P.Mass * FVector::DotProduct(Gravity, P.Position);
        
        TotalEnergy += KineticEnergy + PotentialEnergy;
    }
    
    return TotalEnergy;
}
```

#### 12.4.2 稳定性检查

```cpp
bool IsSimulationStable(const TArray<FPhysicsParticle>& Particles, 
                        float MaxVelocity = 10000.0f)
{
    for (const FPhysicsParticle& P : Particles)
    {
        if (P.Velocity.SizeSquared() > MaxVelocity * MaxVelocity)
        {
            UE_LOG(LogPhysics, Error, TEXT("Particle velocity exploded: %s"), 
                   *P.Velocity.ToString());
            return false;
        }
        
        if (!FMath::IsFinite(P.Position.X) || 
            !FMath::IsFinite(P.Velocity.X))
        {
            UE_LOG(LogPhysics, Error, TEXT("NaN or Inf detected!"));
            return false;
        }
    }
    
    return true;
}
```

### 12.5 性能优化清单

- [ ] 使用半隐式欧拉而非RK4（除非需要高精度）
- [ ] 使用固定时间步长
- [ ] 限制子步进次数（≤ 10）
- [ ] 使用空间分区加速力计算（如Grid、BVH）
- [ ] 并行化粒子更新
- [ ] 使用SIMD优化向量运算
- [ ] 缓存中间结果
- [ ] 使用对象池避免内存分配

### 12.6 数值稳定性清单

- [ ] 使用半隐式或隐式方法
- [ ] 限制最大时间步长
- [ ] 使用子步进
- [ ] 添加数值阻尼（少量）
- [ ] 检测和处理退化情况（如零长度弹簧）
- [ ] 使用适当的精度（float vs double）
- [ ] 避免除以小数
- [ ] 归一化累积误差（如四元数）

---

## 13. 补充：数值积分与约束求解的工程结合

> 前面 12 节把"数值积分"当作一个孤立问题来讲：给定受力，把状态推进一步。但真实游戏引擎里，刚体之间还挂着铰链、距离约束、接触约束——这些约束会**修改**积分的结果。本节补上这条关键链路：真实引擎如何把半隐式欧拉与约束投影编织成一条 predict-correct 流水线，以及 XPBD 如何让 PBD 获得可控的物理刚度。这部分与本站《[雅可比矩阵](/knowledge/jacobian-matrix/)》一文的第八章（约束雅可比）互为印证。

### 13.1 真实引擎不是"只积分、不约束"

§8.5 的 PBD 把约束求解当成积分的替代品（直接改位置再反推速度）。但 Chaos、PhysX 这类工业刚体引擎走的是另一条路：**先用半隐式欧拉预测一个"自由飞行"的状态，再用约束投影把它拉回合法状态**。这条流水线叫 **predict-correct**，每帧执行：

**第 1 步：预测（半隐式欧拉，§4.3）**

$$
\mathbf{v}^* = \mathbf{v}_n + \Delta t\,\mathbf{M}^{-1}\mathbf{F}_{\text{ext}}, \qquad \mathbf{x}^* = \mathbf{x}_n + \Delta t\,\mathbf{v}^*
$$

这是"如果没有任何约束，物体会飞到哪里"。

**第 2 步：约束投影（sequential impulse / 序列冲量）**

但物体不能穿透地面、铰链不能断开。每个约束 $C$ 产生一个约束冲量，把 $\mathbf{v}^*$ 拉回满足约束的速度。约束冲量的求解依赖**有效质量矩阵**（详见《雅可比矩阵》§8）：

$$
\mathbf{K} = \mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}, \qquad
\boldsymbol{\lambda} = \mathbf{K}^{-1}\bigl(-\mathbf{J}\mathbf{v}^* - \text{bias}\bigr)
$$

$$
\mathbf{v}_{n+1} = \mathbf{v}^* + \mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}
$$

**第 3 步：位置积分**

$$
\mathbf{x}_{n+1} = \mathbf{x}_n + \Delta t\,\mathbf{v}_{n+1}
$$

关键洞察：**约束求解夹在两次半隐式欧拉之间**——先用欧拉算出"无视约束的速度"，再用约束修正这个速度，最后才积分位置。这正是 §4.3 的辛性质得以保留的原因：约束力做的是"速度层面的瞬时修正"，没有破坏辛结构。Chaos 的 PBGS（投影高斯-赛德尔）和 PhysX 的 Sequential Impulse 都是这个模式。

> 这也解释了为什么游戏引擎几乎清一色用半隐式欧拉而非 RK4：约束求解每帧要迭代多次（通常 4–10 次高斯-赛德尔），RK4 的 4 次力评估会被乘以约束迭代次数，代价不可接受；而半隐式欧拉的 1 次评估 + 辛性质，配合约束投影，刚好在稳定性、能量守恒、性能三者间取得最佳平衡。

### 13.2 XPBD：让 PBD 拥有可控的物理刚度

§8.5 的原始 PBD 有个致命缺陷：**刚度取决于迭代次数**——迭代越多越硬，但永远到不了"真正刚性"，而且无法把"弹簧刚度 $k$"这种物理参数直接映射到求解器。**XPBD（Extended PBD，Macklin 等 2016）** 通过引入**柔度（compliance）**参数解决了这个问题。

XPBD 的约束位置修正量不再是硬投影，而是带柔度的：

$$
\Delta\boldsymbol{\lambda} = \frac{-C - \tilde{\alpha}\,\boldsymbol{\lambda}_{\text{prev}}}{\|\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\| + \tilde{\alpha}}, \qquad \tilde{\alpha} = \frac{\alpha}{(\Delta t)^2}
$$

其中 $\alpha$ 是**柔度（compliance）**，单位是 $\text{m/N}$（或逆刚度）。它的物理意义极其直观：

- $\alpha = 0$ → 完全刚性（原始 PBD 的硬约束）
- $\alpha > 0$ → 软约束，$\alpha$ 越大越软
- $\alpha$ 与弹簧刚度 $k$ 的关系：$\alpha = 1/k$

于是"弹簧有多硬"第一次有了直接的物理对应——把 $k$ 写进 $\alpha$，XPBD 就能在**任何迭代次数**下收敛到正确的刚度，不再依赖迭代次数作弊。这正是 Chaos 物理引擎布料、柔体、距离约束的现代实现基础。

XPBD 的更新仍然嵌在 §13.1 的 predict-correct 框架里——只是把第 2 步的硬投影换成了带柔度的 $\Delta\boldsymbol{\lambda}$。可以说：**XPBD = 半隐式欧拉预测 + 柔度化约束投影 + 位置积分**，三者拼成了一条完整的、物理可解释的模拟流水线。

### 13.3 三条线索的统一

把本文的三块内容与知识库的其它文章串起来看，会发现它们其实是同一套数学的三种切面：

| 切面 | 本文 | 关联文章 |
|---|---|---|
| 状态如何推进 | 半隐式欧拉（§4.3）、辛积分器（§10.1） | 《雅可比矩阵》§7 动力学雅可比 $\mathbf{A}=\partial f/\partial\mathbf{x}$ |
| 约束如何修正 | PBD（§8.5）、XPBD（§13.2） | 《雅可比矩阵》§8 约束雅可比 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ |
| 控制如何稳定 | 阻尼、子步进（§10.4） | 《四轴无人机飞控》级联 PID + 低通滤波 |

理解了"积分推进状态、约束修正状态、控制驱动状态"这三层，就掌握了游戏物理引擎从受力到渲染的完整数学骨架。

---

## 参考文献

1. **Hairer, E., Lubich, C., & Wanner, G.** (2006). *Geometric Numerical Integration: Structure-Preserving Algorithms for Ordinary Differential Equations*. Springer.

2. **Press, W. H., et al.** (2007). *Numerical Recipes: The Art of Scientific Computing* (3rd ed.). Cambridge University Press.

3. **Bridson, R., & Müller-Fischer, M.** (2007). "Fluid Simulation." SIGGRAPH Course Notes.

4. **Witkin, A., & Baraff, D.** (2001). "Physically Based Modeling: Principles and Practice." SIGGRAPH Course Notes.

5. **Müller, M., et al.** (2007). "Position Based Dynamics." *Journal of Visual Communication and Image Representation*, 18(2), 109-118.

6. **Leimkuhler, B., & Reich, S.** (2004). *Simulating Hamiltonian Dynamics*. Cambridge University Press.

---

## 总结

### 核心要点

1. **半隐式欧拉是游戏物理的最佳选择**
   - 简单、快速、稳定、能量守恒

2. **精度不等于质量**
   - 一阶的半隐式欧拉通常优于四阶的RK4（对于实时应用）

3. **稳定性至上**
   - 宁可牺牲精度也要保证稳定

4. **时间步长是关键**
   - 太大 → 不稳定
   - 太小 → 性能差
   - 使用子步进平衡

5. **理解物理**
   - 数值方法只是工具
   - 物理直觉指导选择

### 快速查询表

**我应该用什么方法？**

| 你的需求 | 推荐方法 |
|---------|---------|
| 游戏粒子系统 | 半隐式欧拉 |
| 实时布料 | 半隐式欧拉 + PBD |
| 刚体物理 | 半隐式欧拉 |
| 流体模拟 | 半隐式欧拉 + SPH/PBF |
| 科学可视化 | RK4 |
| 轨道计算 | RK45自适应 |
| 刚性弹簧 | 隐式方法 |
| VR/高帧率 | 半隐式欧拉 + 固定步长 |

---

*Happy Simulating.*