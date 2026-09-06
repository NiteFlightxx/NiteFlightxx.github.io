---
title: "基于位置的弹性杆详解 — Kirchhoff 杆、Darboux 向量与 PBD 约束求解"
excerpt: "系统推导 Position-Based Elastic Rods (PBER)：从 Kirchhoff 杆理论与弹性能量出发，到幽灵点材料坐标系、离散 Darboux 向量的正确迹形式、材料坐标系导数、Darboux 梯度的闭式展开、3×3 系统矩阵求解，以及三种实现方法（PBER/Cosserat/Direct Solver）的对比。修正 Darboux 分母矩阵加法、能量梯度扭转项刚度系数、符号选择公式归属等问题。"
date: "2026-09-06"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["弹性杆", "PBD", "Kirchhoff", "Darboux", "C++"]
readTime: "阅读约40分钟"
---

> **Position-Based Elastic Rods (PBER)** 由 Umetani、Schmidt 与 Stam (2014) 提出，是 Position-Based Dynamics 框架在细长弹性物体（头发、绳索、电缆、植物茎干）模拟中的应用。它通过幽灵点隐式定义材料坐标系，用离散 Darboux 向量捕捉弯曲与扭转，以 PBD 约束投影求解——无条件稳定、适合实时应用。
>
> 本文系统推导 PBER 的数学内核，并修正原工程文档中的若干错误：Darboux 向量分母的矩阵加法（应为迹形式）、能量梯度扭转项的刚度系数（应为 $GJ$ 而非 $EI$）、符号选择公式的归属（幽灵点符号歧义而非四元数双重覆盖）。与&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;、&#12298;[VBD 与 AVBD 详解](/knowledge/vbd-avbd-math/)&#12299;、&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;形成交叉引用。

---

## 一、引言：弹性杆与 PBD

### 1.1 什么是 PBER

弹性杆模拟的核心挑战是在离散表示中同时捕捉三个变形模式：**拉伸**（长度变化）、**弯曲**（曲率变化）与**扭转**（绕切线旋转）。PBER 通过将连续 Kirchhoff 杆理论离散化，把每种变形模式表达为 PBD 约束，以约束投影而非力积分求解。

| 特性 | 说明 |
|------|------|
| 稳定性 | 无条件稳定，可使用大时间步长 |
| 实时性 | 适合游戏和实时应用 |
| 表示方式 | 幽灵点隐式定义材料坐标系，避免显式旋转 |
| 可扩展性 | 易于添加碰撞、摩擦等约束 |

### 1.2 应用场景

头发模拟、绳索/电缆、植物枝藤、医疗导管、工业软管——凡是一维细长弹性物体的动态行为，PBER 都适用。

---

## 二、Kirchhoff 杆理论基础

### 2.1 杆的几何表示

一根连续杆被离散为粒子序列与连接边：

```
粒子:  p₀ ---- p₁ ---- p₂ ---- ... ---- pₙ
边:       e₀      e₁      e₂           eₙ₋₁
```

- **粒子** $\mathbf{p}_i \in \mathbb{R}^3$：中心线上的离散点。
- **边** $\mathbf{e}_i = \mathbf{p}_{i+1} - \mathbf{p}_i$：连接相邻粒子的向量。
- **边长** $l_i = \|\mathbf{e}_i\|$。

### 2.2 Kirchhoff 假设

经典 Kirchhoff 杆理论基于三个假设：

1. **不可拉伸**：中心线长度不变（PBER 中通过拉伸约束软性处理）。
2. **不可剪切**：横截面始终垂直于中心线（材料坐标系 $\mathbf{d}_3$ 沿切线）。
3. **细杆**：直径远小于长度，可忽略横向惯性。

### 2.3 弹性能量

杆的总弹性能量由拉伸、弯曲、扭转三部分组成：

$$
E_{\text{total}} = E_{\text{stretch}} + E_{\text{bend}} + E_{\text{twist}}
$$

$$
E_{\text{stretch}} = \frac{1}{2}\int_0^L EA\left(\frac{\partial s}{\partial S} - 1\right)^2 dS
$$

$$
E_{\text{bend}} = \frac{1}{2}\int_0^L \left(EI_1\,\kappa_1^2 + EI_2\,\kappa_2^2\right) dS
$$

$$
E_{\text{twist}} = \frac{1}{2}\int_0^L GJ\,\tau^2\,dS
$$

其中 $E$ 为杨氏模量，$G$ 为剪切模量，$A$ 为横截面积，$I_1, I_2$ 为两个方向的惯性矩，$J$ 为扭转常数，$\kappa_1, \kappa_2$ 为曲率分量，$\tau$ 为扭转率。

> **注意刚度区分**：弯曲用 $EI_1, EI_2$（杨氏模量 × 惯性矩），扭转用 $GJ$（剪切模量 × 扭转常数）。两者物理来源不同，不能混用。

离散化（中点法则）：

$$
E_{\text{discrete}} = \sum_i \bar{l}_i\left[\frac{1}{2}EA\left(\frac{l_i}{l_{i,0}} - 1\right)^2 + \frac{1}{2}EI_1\,\omega_{1,i}^2 + \frac{1}{2}EI_2\,\omega_{2,i}^2 + \frac{1}{2}GJ\,\omega_{3,i}^2\right]
$$

其中 $\bar{l}_i = \frac{l_{i-1} + l_i}{2}$ 为平均边长，$\omega_{1}, \omega_{2}$ 为离散曲率，$\omega_3$ 为离散扭转。

---

## 三、材料坐标系与幽灵点

### 3.1 材料坐标系

为描述杆的扭转与弯曲，每条边需要一个局部正交坐标系（材料坐标系）：

$$
\mathbf{D}_i = [\mathbf{d}_1^i \quad \mathbf{d}_2^i \quad \mathbf{d}_3^i] \in SO(3)
$$

- $\mathbf{d}_3^i = \frac{\mathbf{e}_i}{\|\mathbf{e}_i\|}$：切向量（沿边方向）。
- $\mathbf{d}_1^i, \mathbf{d}_2^i$：垂直于切向量的两个正交向量，定义了横截面的朝向。

### 3.2 幽灵点构建

PBER 的关键创新是用**幽灵点**（ghost point）隐式定义材料坐标系，避免显式的四元数或旋转矩阵：

```
        g₀   g₁         ← 幽灵点
        |    |
    p₀--+--p₁--+--p₂    ← 中心线粒子
```

给定边 $(\mathbf{p}_0, \mathbf{p}_1)$ 和幽灵点 $\mathbf{g}$，材料坐标系构建为：

$$
\mathbf{d}_3 = \frac{\mathbf{p}_1 - \mathbf{p}_0}{\|\mathbf{p}_1 - \mathbf{p}_0\|}
$$

$$
\mathbf{d}_2 = \frac{\mathbf{d}_3 \times (\mathbf{g} - \mathbf{p}_0)}{\|\mathbf{d}_3 \times (\mathbf{g} - \mathbf{p}_0)\|}
$$

$$
\mathbf{d}_1 = \mathbf{d}_2 \times \mathbf{d}_3
$$

幽灵点位于边的一侧，通过叉积定义 $\mathbf{d}_2$（法向），再由 $\mathbf{d}_2 \times \mathbf{d}_3$ 得到 $\mathbf{d}_1$（副法向）。三个轴正交且单位化。

### 3.3 材料坐标系导数

约束求解需要材料坐标系对粒子位置的导数。设 $[\mathbf{a}]_\times$ 为向量 $\mathbf{a}$ 的叉乘矩阵：

$$
[\mathbf{a}]_\times = \begin{bmatrix} 0 & -a_3 & a_2 \\ a_3 & 0 & -a_1 \\ -a_2 & a_1 & 0 \end{bmatrix}
$$

**$\mathbf{d}_3$ 的导数**（$l = \|\mathbf{p}_1 - \mathbf{p}_0\|$）：

$$
\frac{\partial \mathbf{d}_3}{\partial \mathbf{p}_0} = -\frac{1}{l}(\mathbf{I} - \mathbf{d}_3 \mathbf{d}_3^T), \quad \frac{\partial \mathbf{d}_3}{\partial \mathbf{p}_1} = \frac{1}{l}(\mathbf{I} - \mathbf{d}_3 \mathbf{d}_3^T), \quad \frac{\partial \mathbf{d}_3}{\partial \mathbf{g}} = \mathbf{0}
$$

其中 $\mathbf{I} - \mathbf{d}_3 \mathbf{d}_3^T$ 是向 $\mathbf{d}_3$ 的正交补空间的投影矩阵。

**$\mathbf{d}_2$ 的导数**：设 $\mathbf{v} = \mathbf{d}_3 \times (\mathbf{g} - \mathbf{p}_0)$，$v = \|\mathbf{v}\|$：

$$
\frac{\partial \mathbf{d}_2}{\partial \mathbf{p}_i} = \frac{1}{v}(\mathbf{I} - \mathbf{d}_2 \mathbf{d}_2^T)\frac{\partial \mathbf{v}}{\partial \mathbf{p}_i}
$$

**$\mathbf{d}_1$ 的导数**：

$$
\frac{\partial \mathbf{d}_1}{\partial \mathbf{p}_i} = [\mathbf{d}_2]_\times \frac{\partial \mathbf{d}_3}{\partial \mathbf{p}_i} - [\mathbf{d}_3]_\times \frac{\partial \mathbf{d}_2}{\partial \mathbf{p}_i}
$$

---

## 四、Darboux 向量理论

### 4.1 Darboux 向量定义

**Darboux 向量** $\boldsymbol{\omega}$ 描述相邻两个材料坐标系之间的相对旋转：

$$
\boldsymbol{\omega} = \omega_1 \mathbf{d}_1 + \omega_2 \mathbf{d}_2 + \omega_3 \mathbf{d}_3
$$

- $\omega_1, \omega_2$：两个方向的**曲率**（弯曲）。
- $\omega_3$：**扭转率**（twist）。

### 4.2 离散 Darboux 向量

> **源码错误修正**：原工程文档将分母写为 $1 + \mathbf{D}_A^T \mathbf{D}_B$（矩阵加标量，无意义）。正确形式使用**迹**：$1 + \text{tr}(\mathbf{D}_A^T \mathbf{D}_B)$，这是一个标量。

对于相邻材料坐标系 $\mathbf{D}_A$ 和 $\mathbf{D}_B$，离散 Darboux 向量的第 $i$ 分量为：

$$
\omega_i = \frac{2}{\bar{l}\left(1 + \text{tr}(\mathbf{D}_A^T \mathbf{D}_B)\right)}\left(\mathbf{d}_j^A \cdot \mathbf{d}_k^B - \mathbf{d}_k^A \cdot \mathbf{d}_j^B\right)
$$

其中 $(i, j, k)$ 是 $(1, 2, 3)$ 的循环排列，$\bar{l}$ 是平均边长。

**迹的几何意义**：对于两个旋转矩阵，$\text{tr}(\mathbf{D}_A^T \mathbf{D}_B) = 1 + 2\cos\theta$，其中 $\theta$ 是相对旋转角。因此分母 $1 + \text{tr} = 2(1 + \cos\theta)$，在 $\theta \in (-\pi, \pi)$ 时恒为正，避免除零（仅在 180° 对齐时退化）。

### 4.3 几何意义

**曲率向量**：Darboux 向量的前两个分量构成曲率向量 $\boldsymbol{\kappa} = \omega_1 \mathbf{d}_1 + \omega_2 \mathbf{d}_2$，大小 $\kappa = \sqrt{\omega_1^2 + \omega_2^2}$，方向 $\mathbf{n}_\kappa = \boldsymbol{\kappa}/\kappa$ 指向弯曲方向。

**扭转**：第三分量 $\omega_3$ 表示绕切线的扭转率。

**离散与连续关系**：$\boldsymbol{\omega}_i \approx \bar{l}_i [\kappa_1, \kappa_2, \tau]^T$，是连续 Darboux 向量的有限差分近似。

### 4.4 Frenet-Serret 关系

连续情况下，Darboux 向量与 Frenet-Serret 公式相关：

$$
\frac{d\mathbf{t}}{ds} = \kappa\,\mathbf{n}, \quad \frac{d\mathbf{n}}{ds} = -\kappa\,\mathbf{t} + \tau\,\mathbf{b}, \quad \frac{d\mathbf{b}}{ds} = -\tau\,\mathbf{n}
$$

其中 $\mathbf{t}$（切向量，对应 $\mathbf{d}_3$）、$\mathbf{n}$（主法向）、$\mathbf{b}$（副法向）构成 Frenet 标架，$\kappa$ 为曲率，$\tau$ 为扭率。

---

## 五、约束类型

### 5.1 垂直平分线约束

确保幽灵点位于边的垂直平分面上：

$$
C_\perp(\mathbf{p}_0, \mathbf{p}_1, \mathbf{g}) = \left(\mathbf{g} - \frac{\mathbf{p}_0 + \mathbf{p}_1}{2}\right)^T (\mathbf{p}_1 - \mathbf{p}_0) = 0
$$

**梯度**（$\mathbf{p}_m = \frac{\mathbf{p}_0 + \mathbf{p}_1}{2}$）：

$$
\frac{\partial C_\perp}{\partial \mathbf{p}_0} = -\frac{1}{2}(\mathbf{p}_1 - \mathbf{p}_0) + (\mathbf{g} - \mathbf{p}_m), \quad \frac{\partial C_\perp}{\partial \mathbf{p}_1} = \frac{1}{2}(\mathbf{p}_1 - \mathbf{p}_0) + (\mathbf{g} - \mathbf{p}_m), \quad \frac{\partial C_\perp}{\partial \mathbf{g}} = -(\mathbf{p}_1 - \mathbf{p}_0)
$$

### 5.2 幽灵边距离约束

保持幽灵点到边中点的距离为静止长度：

$$
C_{\text{dist}}(\mathbf{p}_0, \mathbf{p}_1, \mathbf{g}) = \left\|\mathbf{g} - \frac{\mathbf{p}_0 + \mathbf{p}_1}{2}\right\| - L_0 = 0
$$

**梯度**（$\mathbf{n} = \frac{\mathbf{g} - \mathbf{p}_m}{\|\mathbf{g} - \mathbf{p}_m\|}$）：

$$
\frac{\partial C_{\text{dist}}}{\partial \mathbf{p}_0} = -\frac{1}{2}\mathbf{n}, \quad \frac{\partial C_{\text{dist}}}{\partial \mathbf{p}_1} = -\frac{1}{2}\mathbf{n}, \quad \frac{\partial C_{\text{dist}}}{\partial \mathbf{g}} = \mathbf{n}
$$

### 5.3 Darboux 向量约束

核心约束——将 Darboux 向量偏差表达为约束：

$$
\mathbf{C}_{\text{Darboux}} = \mathbf{K} \odot (\boldsymbol{\omega} - \boldsymbol{\omega}_0)
$$

其中 $\odot$ 为逐元素乘法，$\boldsymbol{\omega}_0$ 为静止 Darboux 向量，刚度矩阵 $\mathbf{K} = \text{diag}(k_1, k_2, k_3)$：

$$
k_1 = \frac{EI_1}{\bar{l}}, \quad k_2 = \frac{EI_2}{\bar{l}}, \quad k_3 = \frac{GJ}{\bar{l}}
$$

> **源码错误修正**：原工程文档在能量梯度中将扭转项写为 $EI_k$，暗示三项均用杨氏模量。正确应为：弯曲项用 $EI_1, EI_2$，扭转项用 $GJ$——与上述刚度定义一致。

能量梯度（修正后）：

$$
\frac{\partial E_{\text{Darboux}}}{\partial \mathbf{p}_i} = \bar{l}\left(EI_1\,\omega_1\frac{\partial \omega_1}{\partial \mathbf{p}_i} + EI_2\,\omega_2\frac{\partial \omega_2}{\partial \mathbf{p}_i} + GJ\,\omega_3\frac{\partial \omega_3}{\partial \mathbf{p}_i}\right)
$$

---

## 六、求解器实现

### 6.1 Darboux 梯度的闭式展开

> **源码补全**：原工程文档用 `term1` 和 `term2` 占位，以下展开为完整闭式。

Darboux 向量对粒子 $\mathbf{p}_m$ 的梯度为：

$$
\frac{\partial \omega_i}{\partial \mathbf{p}_m} = X\left(\text{term1}_i - \frac{\bar{l}}{2}\,\omega_i \cdot \text{term2}\right)
$$

其中 $X = \frac{2}{\bar{l}(1 + \text{tr}(\mathbf{D}_A^T \mathbf{D}_B))}$，$(i, j, k)$ 为循环排列。

**term1**（Darboux 分子对位置的导数）：

$$
\text{term1}_i = \left(\frac{\partial \mathbf{d}_j^A}{\partial \mathbf{p}_m}\right)^T \mathbf{d}_k^B - \left(\frac{\partial \mathbf{d}_k^A}{\partial \mathbf{p}_m}\right)^T \mathbf{d}_j^B + (\text{若 } \mathbf{p}_m \in B \text{ 则加 } B \text{ 的导数项})
$$

对端点粒子 $\mathbf{p}_0$（仅属于 $A$）：

$$
\text{term1}_i = \left(\frac{\partial \mathbf{d}_j^A}{\partial \mathbf{p}_0}\right)^T \mathbf{d}_k^B - \left(\frac{\partial \mathbf{d}_k^A}{\partial \mathbf{p}_0}\right)^T \mathbf{d}_j^B
$$

对中间粒子 $\mathbf{p}_1$（同时属于 $A$ 和 $B$）：

$$
\text{term1}_i = \left(\frac{\partial \mathbf{d}_j^A}{\partial \mathbf{p}_1}\right)^T \mathbf{d}_k^B - \left(\frac{\partial \mathbf{d}_k^A}{\partial \mathbf{p}_1}\right)^T \mathbf{d}_j^B - \left(\frac{\partial \mathbf{d}_j^B}{\partial \mathbf{p}_1}\right)^T \mathbf{d}_k^A + \left(\frac{\partial \mathbf{d}_k^B}{\partial \mathbf{p}_1}\right)^T \mathbf{d}_j^A
$$

对端点粒子 $\mathbf{p}_2$（仅属于 $B$）：

$$
\text{term1}_i = -\left(\frac{\partial \mathbf{d}_j^B}{\partial \mathbf{p}_2}\right)^T \mathbf{d}_k^A + \left(\frac{\partial \mathbf{d}_k^B}{\partial \mathbf{p}_2}\right)^T \mathbf{d}_j^A
$$

**term2**（迹对位置的导数）：

$$
\text{term2} = \sum_{n=1}^{3}\left[\left(\frac{\partial \mathbf{d}_n^A}{\partial \mathbf{p}_m}\right)^T \mathbf{d}_n^B + (\text{若 } \mathbf{p}_m \in B \text{ 则加 } \left(\frac{\partial \mathbf{d}_n^B}{\partial \mathbf{p}_m}\right)^T \mathbf{d}_n^A \right)\right]
$$

### 6.2 系统矩阵求解

Darboux 约束涉及 5 个粒子（3 中心线 + 2 幽灵点），约束值为 3 维向量，梯度为 $3 \times 3$ 矩阵。系统矩阵为：

$$
\mathbf{A} = \sum_{i=0}^{4} w_i \left(\frac{\partial \boldsymbol{\omega}}{\partial \mathbf{p}_i}\right)^T \frac{\partial \boldsymbol{\omega}}{\partial \mathbf{p}_i} \quad\in \mathbb{R}^{3\times 3}
$$

其中 $w_i$ 为逆质量。$\mathbf{A}$ 是 $3 \times 3$ 对称正定矩阵，可直接求逆。

**位置修正**：

$$
\Delta\mathbf{p}_i = -w_i \frac{\partial \boldsymbol{\omega}}{\partial \mathbf{p}_i} \mathbf{A}^{-1} \mathbf{C}
$$

```cpp
void SolveDarbouxConstraint(
    Vector3 p0, Vector3 p1, Vector3 p2,
    Vector3 g0, Vector3 g1,
    float w0, float w1, float w2, float wg0, float wg1,
    Vector3 bendTwistK, float midEdgeLength, Vector3 restDarboux,
    out Vector3 corr0, out Vector3 corr1, out Vector3 corr2,
    out Vector3 corr_g0, out Vector3 corr_g1)
{
    // 1. 材料坐标系
    Matrix3 dA = ComputeMaterialFrame(p0, p1, g0);
    Matrix3 dB = ComputeMaterialFrame(p1, p2, g1);

    // 2. Darboux 向量（使用迹形式）
    float trace = dA.Transpose() * dB;  // 取迹
    Vector3 omega = ComputeDarbouxVector(dA, dB, midEdgeLength, trace);

    // 3. 材料坐标系导数 → Darboux 梯度
    Matrix3 gradOmega[5];
    ComputeDarbouxGradients(omega, midEdgeLength, dA, dB, gradOmega);

    // 4. 约束值
    Vector3 C = bendTwistK * (omega - restDarboux);

    // 5. 系统矩阵 A (3×3)
    Matrix3 A = Matrix3::Zero();
    float w[5] = {w0, w1, w2, wg0, wg1};
    for (int i = 0; i < 5; i++)
        A += w[i] * gradOmega[i].Transpose() * gradOmega[i];

    // 6. 求解
    Vector3 lambda = A.Inverse() * C;

    // 7. 位置修正
    corr0   = -w0   * gradOmega[0] * lambda;
    corr1   = -w1   * gradOmega[1] * lambda;
    corr2   = -w2   * gradOmega[2] * lambda;
    corr_g0 = -wg0  * gradOmega[3] * lambda;
    corr_g1 = -wg1  * gradOmega[4] * lambda;
}
```

### 6.3 完整算法流程

```
输入：粒子位置 p^n，速度 v^n，时间步长 h
输出：新位置 p^(n+1)，新速度 v^(n+1)

1. 预测步（显式积分）：
   v* = v + h·g（重力）
   p* = p + h·v*

2. 约束投影迭代（maxIterations 次）：
   a. 垂直平分线约束 → 修正幽灵点
   b. 幽灵边距离约束 → 修正幽灵点
   c. Darboux 向量约束 → 修正中心线粒子和幽灵点
   d. 拉伸约束 → 修正中心线粒子
   e. 碰撞约束（可选）

3. 速度更新：
   v^(n+1) = (p^(n+1) - p^n) / h
```

### 6.4 符号选择

> **源码错误修正**：原工程文档将符号选择归因于"四元数的双重覆盖性"。PBER 使用幽灵点而非四元数，符号歧义来自幽灵点材料坐标系的构造——当幽灵点跨越边时，叉积 $\mathbf{d}_3 \times (\mathbf{g} - \mathbf{p}_0)$ 变号，导致 $\mathbf{d}_1, \mathbf{d}_2$ 整体翻转，Darboux 向量随之改变。需选择与静止状态最接近的表示：

$$
\boldsymbol{\omega}_{\text{correct}} = \begin{cases} \boldsymbol{\omega} & \text{if } \|\boldsymbol{\omega} - \boldsymbol{\omega}_0\| < \|-\boldsymbol{\omega} - \boldsymbol{\omega}_0\| \\ -\boldsymbol{\omega} & \text{otherwise} \end{cases}
$$

> 注：基于四元数的 Cosserat Rod 方法（§7.2）有类似的符号问题，但其来源是四元数双重覆盖（$q$ 与 $-q$ 表示同一旋转），处理方式也不同（取相对四元数的 $w$ 分量符号）。

### 6.5 数值稳定性

**奇异性处理**：当边长趋近零时，切向量归一化不稳定，加小常数保护：

$$
\mathbf{d}_3 = \frac{\mathbf{e}}{\|\mathbf{e}\| + \epsilon}, \quad \epsilon \approx 10^{-6}
$$

**迹退化**：当两材料坐标系接近 180° 对齐时，$\text{tr}(\mathbf{D}_A^T \mathbf{D}_B) \to -1$，分母 $1 + \text{tr} \to 0$。需检测并限制最小分母值。

---

## 七、三种实现方法对比

弹性杆的 PBD 实现有三种主要方法，各有优劣。

### 7.1 PBER（幽灵点法）

**论文**：Umetani, Schmidt & Stam (2014)

- 幽灵点隐式定义材料坐标系，避免显式旋转表示
- 约束：垂直平分线 + 幽灵边距离 + Darboux 向量
- 实现相对简单，适合中等刚度
- 需要额外幽灵点粒子（内存开销）
- 对极刚杆收敛较慢

### 7.2 Position-Based Cosserat Rods（四元数法）

**论文**：Kugelstadt & Schömer (2016)

- 用四元数表示材料坐标系旋转
- 约束更精确：拉伸-剪切约束 $C_{\text{ss}} = \mathbf{K}_{\text{ss}} \odot (\mathbf{R}(\mathbf{q})^T(\mathbf{p}_1 - \mathbf{p}_0) - l_0 \mathbf{e}_3)$ 与弯曲-扭转约束 $C_{\text{bt}} = \mathbf{K}_{\text{bt}} \odot (2(\mathbf{q}_0^* \mathbf{q}_1) - \boldsymbol{\omega}_0)$
- 适合刚性杆
- 需处理四元数约束（归一化、符号选择）

### 7.3 Direct Position-Based Solver（直接法）

**论文**：Deul, Kugelstadt, Weiler & Bender (2018)

- 专为极刚杆设计
- 将所有约束组合为全局线性系统 $\mathbf{H}\,\Delta\mathbf{x} = -\mathbf{b}$
- 树状结构 + $\mathbf{L}\mathbf{D}\mathbf{L}^T$ 因式分解 + 前向-后向替换
- 收敛快，支持树状拓扑
- 实现最复杂，并行性差

### 7.4 对比表

| 特性 | PBER | Cosserat Rods | Direct Solver |
|------|------|---------------|---------------|
| 表示方式 | 幽灵点 | 四元数 | 四元数 |
| 实现难度 | 简单 | 中等 | 困难 |
| 刚度支持 | 中等 | 高 | 极高 |
| 收敛速度 | 慢 | 中等 | 快 |
| 并行性 | 好 | 好 | 差（全局求解） |
| 适用场景 | 头发、绳索 | 一般杆 | 刚性杆、手术模拟 |

---

## 八、UE 实现视角

原工程文档为纯理论与伪代码，本节补充在 UE / Chaos 中承接 PBER 的工程视角。

### 8.1 Chaos 物理资产

UE Chaos 引擎的 `FPhysicsAsset` 与 `FKinematicGeometryCollection` 可承载杆状结构，但 Chaos 原生不直接暴露 PBER 的幽灵点机制。实现路径：

1. **粒子存储**：将中心线粒子和幽灵点存储为 Chaos 的 `FPhysicsParticles` 或自定义 `TArray<FVector>`，逆质量通过 `FParticle::InvMass()` 设置。
2. **约束注册**：将垂直平分线、幽灵边距离、Darboux 约束封装为 `Chaos::FImplicitObject` 衍生约束或 PBD 约束回调，注册到 Chaos 的 `FPBDConstraintContainer`。
3. **求解器集成**：Chaos 的 `FPBDRigidSolver` 已支持顺序约束投影迭代——PBER 的约束只需作为自定义 `FPBDConstraint` 加入容器的 `ApplyConstraints()` 阶段。

### 8.2 插件实现

在 PhysicsInteraction 插件中，可封装为 `UElasticRodComponent`：

```cpp
class UElasticRodComponent : public UActorComponent
{
    TArray<FVector> CenterLineParticles;  // p₀...pₙ
    TArray<FVector> GhostPoints;           // g₀...gₙ₋₁
    TArray<float>  InvMasses;
    TArray<float>  GhostInvMasses;

    // 材料属性
    float YoungModulus;   // E
    float ShearModulus;    // G
    float InertiaI1, InertiaI2;  // EI₁, EI₂
    float TorsionJ;       // GJ

    int32 SolverIterations = 10;

    void SimulateStep(float DeltaTime);
    void SolvePerpendicularBisector();
    void SolveGhostEdgeDistance();
    void SolveDarboux();
    void SolveStretch();
};
```

### 8.3 与 XPBD 的衔接

PBER 使用标准 PBD 约束（刚度系数 $k$ 直接控制，但与时间步长/迭代次数耦合）。若需更可控的刚度行为，可升级为 XPBD——引入柔度参数 $\alpha = 1/(k\,\Delta t^2)$，使刚度与迭代次数解耦。XPBD 的约束求解框架见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;。

---

## 九、参数调优

### 9.1 刚度系数

| 材料 | 杨氏模量 $E$ | 说明 |
|------|-------------|------|
| 头发 | 1–10 GPa | 柔软但有弹性 |
| 橡胶 | 0.01–0.1 GPa | 非常柔软 |
| 钢材 | ~200 GPa | 非常刚性 |

剪切模量与泊松比关系：$G = \frac{E}{2(1+\nu)}$，$\nu \approx 0.3$。

### 9.2 迭代次数

- 柔软杆：5–10 次
- 中等刚度：10–20 次
- 刚性杆：20–50 次，或改用 Direct Solver

### 9.3 时间步长

- 稳定性：$h < 0.01$ s
- 实时应用：$h = 1/60$ 或 $1/30$ s
- 大步长需子步分解

---

## 十、参考文献

1. Umetani, N., Schmidt, R., & Stam, J. (2014). *Position Based Elastic Rods*. ACM SIGGRAPH/Eurographics SCA. ——PBER 原始论文，幽灵点方法。
2. Kugelstadt, T., & Schömer, E. (2016). *Position and Orientation Based Cosserat Rods*. ACM SIGGRAPH/Eurographics SCA. ——四元数 Cosserat 杆。
3. Deul, C., Kugelstadt, T., Weiler, M., & Bender, J. (2018). *Direct Position-Based Solver for Stiff Rods*. Computer Graphics Forum (Eurographics). ——直接求解器。
4. Müller, M., Heidelberger, B., Hennix, M., & Ratcliff, J. (2007). *Position Based Dynamics*. J. Visual Communication and Image Representation. ——PBD 框架。
5. Bergou, M., Wardetzky, M., Robinson, S., Audoly, B., & Grinspun, E. (2008). *Discrete Elastic Rods*. ACM TOG (SIGGRAPH). ——离散弹性杆理论基础。
6. Bergou, M., Audoly, B., Vouga, E., Wardetzky, M., & Grinspun, E. (2010). *Discrete Viscous Threads*. ACM TOG (SIGGRAPH). ——粘性杆扩展。
