---
title: "物理约束深度整理：从约束函数到实时物理求解器"
excerpt: "系统梳理实时物理约束求解器的完整知识链：从约束函数 C(q)、Jacobian、Lagrange 乘子 λ 与有效质量 JM⁻¹Jᵀ 出发，逐一回答等式与不等式约束、互补条件、LCP/NCP/KKT、速度级与位置级约束、Baumgarte 稳定化、Impulse/Sequential Impulse 求解、Jacobi 与 Gauss-Seidel 迭代、求解器迭代与刚度的关系、PBD/XPBD 推导与柔度、约束电机、自由度锁定、Maximal 与 Generalized Coordinates、旋转约束、摩擦统一、方程与优化两种视角、XPBD/VBD/AVBD 思想差异、高刚度数值病态与 Warm Starting，最后给出工业级 Constraint Solver 的完整求解链与统一理解框架。面向已具备 Unreal Engine / Chaos / PBD / XPBD / 刚体动力学基础的工程师。"
date: "2026-09-06"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["物理", "约束求解", "Constraint Solver", "PBD", "XPBD", "Jacobian", "Lagrange 乘子"]
readTime: "阅读约50分钟"
---

> 面向已经具备 Unreal Engine / Chaos / PBD / XPBD / 刚体动力学基础，希望进一步理解工业级 Constraint Solver 的工程师。

---

## 1. 阅读前的统一符号

本文主要讨论刚体系统。常用符号如下：

- $q$：广义位置。对单个刚体，可理解为位置 $x$ 和旋转 $R$ 或四元数 $Q$ 的组合。
- $v$：广义速度。对单个刚体，通常包含线速度 $\mathbf v$ 与角速度 $\boldsymbol\omega$。
- $M$：质量矩阵。刚体中包含质量 $m$ 与转动惯量 $I$。
- $M^{-1}$：逆质量矩阵。
- $C(q)$：约束函数。
- $J = \frac{\partial C}{\partial q}$：约束 Jacobian。
- $\lambda$：Lagrange Multiplier，约束空间中的乘子；在离散求解器里常与约束力或约束冲量直接相关。
- $h$ 或 $\Delta t$：时间步长。
- $K = J M^{-1}J^T$：约束空间有效质量矩阵，也常被称为 Schur Complement、Constraint Mass Matrix 或 Effective Mass Matrix。

最值得记住的一条主线是：

$$
\boxed{
C(q)
\rightarrow J
\rightarrow M^{-1}
\rightarrow JM^{-1}J^T
\rightarrow \lambda
\rightarrow J^T\lambda
\rightarrow \Delta v\;\text{或}\;\Delta q
}
$$

大部分实时刚体约束求解器，本质上都可以在这条链上定位。

---

## 2. 物理约束的本质是什么

### 问题

- Constraint 在数学上究竟是什么？
- 为什么常写成 $C(q)=0$？
- $q$ 是什么？
- 一个几何关系为什么能够转化成对刚体运动的限制？

### 答案

物理约束本质上是：**限制系统自由度的一组条件**。

一个刚体在三维空间有 6 个自由度：

- 3 个平移自由度；
- 3 个旋转自由度。

两个互不关联的刚体一共有 12 个自由度。如果添加一个 Ball Socket Joint，使两个局部锚点在世界空间重合，那么它实际上加入了 3 个标量约束：

$$
C(q)=x_A + R_A r_A - x_B - R_B r_B = 0
$$

因为这是一个三维向量方程，所以等价于 3 条标量方程。

每增加一条独立约束，理论上就减少一个自由度。

例如一个完全固定的刚体，需要限制：

$$
x=x_0
$$

以及

$$
R=R_0
$$

总计相当于约束 6 个自由度。

### 为什么使用 $C(q)$

因为它允许把大量不同的物理关系统一成数学条件。

#### 距离约束

$$
C(q)=\|x_A-x_B\|-L=0
$$

#### 平面接触

$$
C(q)=n\cdot(x-x_{plane})\ge 0
$$

#### 关节角限制

$$
\theta_{min}\le\theta(q)\le\theta_{max}
$$

因此所谓 Joint、Contact、Limit，首先都只是不同形式的约束函数。

真正复杂的是：**如何让动力学系统在每一个离散时间步中尽可能满足这些条件。**

---

## 3. 等式约束和不等式约束有什么区别

### Equality Constraint

等式约束：

$$
C(q)=0
$$

表示条件必须持续成立。

典型例子：

- Fixed Joint；
- Ball Socket；
- Distance Constraint；
- Hinge 中被锁住的自由度。

这种约束通常称为 **bilateral constraint（双边约束）**，因为它可以沿两个方向施加约束反力。

例如两个锚点必须重合：如果 A 在 B 左边，可以往右推；如果 A 在 B 右边，也可以往左推。

### Inequality Constraint

不等式约束：

$$
C(q)\ge0
$$

表示系统只允许位于可行域的一侧。

最典型的是接触：

$$
C(q)=d(q)\ge0
$$

其中 $d$ 是两个物体的 signed distance。

- $d>0$：分离；
- $d=0$：接触；
- $d<0$：穿透。

接触力只能推开物体，不能把两个物体“吸”在一起，因此还有：

$$
\lambda\ge0
$$

这种约束称为 **unilateral constraint（单边约束）**。

### Joint Limit

Joint Limit 通常也是不等式约束。

例如：

$$
\theta \le \theta_{max}
$$

可写成：

$$
C(q)=\theta_{max}-\theta(q)\ge0
$$

只要角度没有到极限，约束不需要提供反力；达到极限后才开始工作。

---

## 4. 约束中的 Jacobian 到底是什么

### 定义

$$
J=\frac{\partial C}{\partial q}
$$

Jacobian 描述：**广义坐标发生一个小变化时，约束值会变化多少。**

局部线性化：

$$
C(q+\Delta q)\approx C(q)+J\Delta q
$$

所以 Jacobian 是从“刚体自由度空间”映射到“约束空间”的线性变换。

### 速度层含义

对约束：

$$
C(q)=0
$$

对时间求导：

$$
\dot C = \frac{\partial C}{\partial q}\dot q
$$

因此：

$$
\dot C=Jv
$$

如果一个理想约束要求约束值保持不变，则：

$$
Jv=0
$$

这就是速度级约束。

### 例子：两质点距离约束

$$
C=\|x_A-x_B\|-L
$$

令：

$$
n=\frac{x_A-x_B}{\|x_A-x_B\|}
$$

那么：

$$
\frac{\partial C}{\partial x_A}=n^T
$$

$$
\frac{\partial C}{\partial x_B}=-n^T
$$

所以：

$$
J=[n^T,-n^T]
$$

这意味着该约束只关心两物体沿连接方向 $n$ 的相对运动。

### 对刚体为什么还有 Angular Jacobian

如果约束点不在质心：

$$
p=x+Rr
$$

刚体角速度会产生锚点线速度：

$$
v_p=v+\omega\times r
$$

因此约束不仅对线速度敏感，也对角速度敏感。

一个典型接触约束 Jacobian 可以写成：

$$
J=
\begin{bmatrix}
-n^T & -(r_A\times n)^T & n^T & (r_B\times n)^T
\end{bmatrix}
$$

这就是为什么碰撞点不在质心时，冲量会同时改变线速度和角速度。

---

## 5. Lagrange Multiplier λ 在物理约束中到底是什么

Lagrange Multiplier 最初是约束优化里的数学变量。

对于：

$$
\min f(q)
$$

subject to

$$
C(q)=0
$$

构造：

$$
L(q,\lambda)=f(q)+\lambda^TC(q)
$$

在机械系统中，约束产生的广义力满足：

$$
Q_c=J^T\lambda
$$

因此：

- $\lambda$ 位于约束空间；
- $J^T\lambda$ 把它转换回刚体自由度空间。

### λ 是力还是冲量

取决于离散方式。

连续动力学中，$\lambda$ 常可解释为约束力大小。

Impulse Solver 中通常直接求：

$$
\Lambda
$$

它更接近约束冲量：

$$
\Delta v=M^{-1}J^T\Lambda
$$

XPBD 中累计的 $\lambda$ 又是一种离散乘子，其量纲和物理意义受到时间离散方式影响。

因此最安全的理解是：

> $\lambda$ 是约束空间中的响应强度；经过 $J^T$ 后转化为刚体真正受到的约束力、冲量或位置修正。

---

## 6. 为什么会出现 Effective Mass

设约束冲量为：

$$
P=J^T\lambda
$$

它导致速度变化：

$$
\Delta v=M^{-1}J^T\lambda
$$

约束空间里的速度变化为：

$$
J\Delta v
=JM^{-1}J^T\lambda
$$

于是自然出现：

$$
K=JM^{-1}J^T
$$

它描述：**施加单位约束冲量后，约束空间速度会变化多少。**

若是单标量约束，常写：

$$
k=JM^{-1}J^T
$$

它的倒数：

$$
m_{eff}=\frac1k
$$

被称为 Effective Mass。

### 为什么不是实际质量

因为一个约束方向上的“运动难度”不仅取决于物体质量，还取决于：

- 冲量方向；
- 锚点相对质心的位置；
- 转动惯量；
- 两个刚体的逆质量；
- 约束耦合。

例如同一个箱子：

- 从质心推，主要产生平移；
- 从角落推，同时产生旋转。

因此对于同一个接触法线，系统表现出的“有效质量”不同。

---

## 7. 为什么物理引擎里的硬约束实际上“锁不死”

这是实时物理里极其重要的问题。

理论上的理想约束要求：

$$
C(q)=0
$$

在任何时刻严格成立。

但实时引擎必须面对：

1. 有限时间步长；
2. 有限 Solver Iteration；
3. 有限浮点精度；
4. 非线性约束局部线性化误差；
5. 强约束之间的耦合；
6. 碰撞、摩擦、Joint 等共同竞争；
7. 冲量或力的上限；
8. 并行 Solver 带来的 stale state。

因此所谓 Hard Constraint，工程上更准确地说是：

> Compliance 接近 0、允许误差非常小、求解器尽可能强地满足的约束。

并不代表“数学意义上的绝对不违反”。

### 为什么冲击能把锁死约束打出偏差

如果一帧内外力导致很大的预测位移：

$$
x^*=x_n+h v_n + h^2M^{-1}f
$$

约束 Solver 只能在有限迭代中把预测状态拉回可行流形。

如果误差非常大，而每次迭代只修正一部分，就会留下 residual：

$$
C(q_{final})\neq0
$$

### 两个高刚度约束冲突

例如：

- Constraint A 要求物体在 $x=0$；
- Constraint B 要求物体在 $x=1$。

不存在同时满足两者的解。

此时 Solver 只能根据：

- 顺序；
- 权重；
- compliance；
- 迭代；
- warm start；
- 质量比；

得到某种近似折中。

---

## 8. 多个约束互相冲突时到底发生了什么

完整约束系统可写成：

$$
Jv=b
$$

约束动力学经常得到：

$$
JM^{-1}J^T\lambda=b'
$$

注意这里 $J$ 是所有约束行组成的大矩阵：

$$
J=
\begin{bmatrix}
J_1\\
J_2\\
\vdots\\
J_m
\end{bmatrix}
$$

所以一个约束的 $\lambda_i$ 会通过共享刚体改变其他约束对应的速度。

这叫 **constraint coupling**。

如果把矩阵完整求逆，理论上可以同时求得耦合解，但实时引擎很少对大型系统直接做 dense solve。

更多使用：

- PGS / Sequential Impulse；
- Jacobi；
- Block Gauss-Seidel；
- TGS；
- XPBD projection；
- graph coloring；
- island decomposition。

因此“约束之间互相抢刚体”并不是异常，而是整个 Solver 的核心问题。

---

## 9. 物理约束中有没有 Active Set

有，而且 Contact 和 Joint Limit 可以非常自然地用 Active Set 理解。

对于不等式：

$$
C_i(q)\ge0
$$

如果当前：

$$
C_i(q)>0
$$

并且没有即将违反约束，那么它可以处于 inactive 状态。

当：

$$
C_i(q)=0
$$

并且继续运动会导致：

$$
C_i(q)<0
$$

则约束需要进入 active set。

### Contact

- 物体明显分离：inactive；
- 接触或预测即将穿透：active。

### Joint Limit

- 当前角度位于范围内部：inactive；
- 到达上限且仍试图向外转：upper-limit active；
- 到达下限且仍试图向外转：lower-limit active。

工业实时 Solver 未必显式实现教科书式 Active Set 算法，但从数学行为上，它们确实是在做相近的事情：

> 每一帧动态决定哪些 unilateral constraints 当前需要参与求解。

---

## 10. Contact 为什么需要 Complementarity

设接触间隙：

$$
C(q)\ge0
$$

接触法向力不能吸引：

$$
\lambda\ge0
$$

同时我们希望：

- 分离时没有接触力；
- 有接触力时物体正好位于边界。

这可写成：

$$
C(q)\lambda=0
$$

合起来：

$$
C(q)\ge0
$$

$$
\lambda\ge0
$$

$$
C(q)\lambda=0
$$

这叫 **complementarity condition（互补条件）**。

物理意义非常直观：

#### 情况 1：分离

$$
C>0
$$

则必须：

$$
\lambda=0
$$

#### 情况 2：接触受力

$$
\lambda>0
$$

则必须：

$$
C=0
$$

这就是为什么接触不是普通 equality constraint。

---

## 11. LCP / NCP / KKT 和物理约束是什么关系

上一节讲到接触约束的互补条件：分离时力为零，接触时穿透为零。这组条件在数学优化理论中有精确的对应物——KKT 条件。当动力学方程被线性化后，求解接触力的问题就变成 LCP；若保留非线性，则变成 NCP。三者构成一条从”一般优化理论”到”刚体接触求解”的递进链路。

### 11.1 KKT 条件是什么

KKT（Karush-Kuhn-Tucker conditions）是**约束优化**领域的核心定理，由 Karush（1939）和 Kuhn-Tucker（1951）独立提出。它给出了一般约束优化问题取得最优解的**必要条件**——类似于无约束优化中”导数为零”的角色，但推广到了带不等式约束的情形。

考虑优化问题：

$$
\min_{x} f(x)
$$

subject to

$$
g_i(x) \ge 0 \quad (i = 1, \ldots, m)
$$

其中 $f(x)$ 是目标函数，$g_i(x) \ge 0$ 是不等式约束。为每个约束引入 Lagrange 乘子 $\lambda_i$，构造 Lagrangian：

$$
\mathcal{L}(x, \lambda) = f(x) - \sum_{i=1}^{m} \lambda_i g_i(x)
$$

KKT 条件包含四组条件，每组的含义如下：

#### 条件 1：Stationarity（平稳性）

$$
\nabla_x \mathcal{L} = 0 \quad \Longleftrightarrow \quad \nabla f(x) = \sum_{i=1}^{m} \lambda_i \nabla g_i(x)
$$

含义：在最优点处，目标函数的下降方向被约束梯度完全抵消——不存在既能减小目标又不违反约束的”自由方向”。这相当于把无约束优化中的 $\nabla f = 0$ 推广到了约束情形：目标梯度被各约束梯度的线性组合平衡。

#### 条件 2：Primal feasibility（原始可行性）

$$
g_i(x) \ge 0 \quad (i = 1, \ldots, m)
$$

含义：最优解必须满足原始约束——这是最基本的”解必须在可行域内”。

#### 条件 3：Dual feasibility（对偶可行性）

$$
\lambda_i \ge 0 \quad (i = 1, \ldots, m)
$$

含义：每个不等式约束对应的 Lagrange 乘子非负。直觉上，$\lambda_i$ 衡量约束 $g_i$ 对目标函数的”压力”或”影子价格”——约束越紧，乘子越大；但乘子不能为负，否则意味着”放松约束反而让目标更差”，这违背优化方向。

#### 条件 4：Complementarity（互补松弛条件）

$$
\lambda_i \, g_i(x) = 0 \quad (i = 1, \ldots, m)
$$

含义：对每个约束，要么约束处于**活跃**状态（$g_i(x) = 0$，恰好取等号），此时乘子可以大于零；要么约束**不活跃**（$g_i(x) > 0$，严格满足），此时乘子必须为零。两者不能同时非零——这就是”互补”的含义。直观理解：如果一个约束对最优解没有限制作用（约束松弛），那么它对目标也没有贡献（乘子为零）；反之，如果约束在积极限制解（取等号），那么它才允许产生非零乘子。

#### KKT 与接触约束的对应

将 KKT 条件映射到物理接触：

| KKT 条件 | 数学形式 | 物理含义 |
|---------|---------|---------|
| Primal feasibility | $C(q) \ge 0$ | 物体不互相穿透（分离或恰好接触） |
| Dual feasibility | $\lambda \ge 0$ | 接触力只能推不能拉（法向力非负） |
| Complementarity | $C(q) \cdot \lambda = 0$ | 分离时无力，接触时无穿透（§10 的互补条件） |
| Stationarity | $\nabla \mathcal{L} = 0$ | 接触力与运动方程平衡（牛顿第二定律成立） |

可见，**接触约束的互补条件正是 KKT 条件中互补松弛和双重可行性的物理体现**。KKT 理论告诉我们：接触力的求解本质上是求解一个约束优化问题的 KKT 条件，而不是凭空发明的物理规则。

> [!NOTE]
> KKT 是**必要条件**而非充分条件。对于凸优化问题（目标函数凸、约束凸），KKT 条件同时也是充分条件——满足 KKT 的点必是全局最优解。但刚体接触通常不满足凸性（摩擦锥非凸、多接触组合可能非凸），因此 KKT 只提供”候选最优解”而非保证。

### 11.2 LCP 是什么

LCP（Linear Complementarity Problem，线性互补问题）是一类特殊的数学问题：给定矩阵 $\mathbf{A}$ 和向量 $\vec{b}$，求向量 $\vec{w}$ 和 $\vec{\lambda}$ 使得：

$$
\vec{w} = \mathbf{A}\vec{\lambda} + \vec{b}
$$

$$
\vec{w} \ge 0, \quad \vec{\lambda} \ge 0, \quad \vec{w}^T \vec{\lambda} = 0
$$

三个条件同时成立：

- $\vec{w} \ge 0$：辅助变量非负
- $\vec{\lambda} \ge 0$：未知量（乘子/力）非负
- $\vec{w}^T \vec{\lambda} = 0$：互补条件——$\vec{w}$ 和 $\vec{\lambda}$ 的各分量逐对不能同时非零

#### LCP 怎么从刚体接触中产生

将刚体动力学在接触点处离散化并线性化后，加速度与接触力的关系为：

$$
\vec{a} = \mathbf{M}^{-1}(\mathbf{J}^T \vec{\lambda} + \vec{F}_{\text{ext}})
$$

其中 $\mathbf{J}$ 是接触约束的 Jacobian，$\vec{\lambda}$ 是接触力（法向冲量/力），$\mathbf{M}$ 是质量矩阵。对加速度施加互补条件（分离时加速度不指向穿透方向，接触时加速度为零），令 $\vec{w} = \vec{a}$（法向加速度），整理得：

$$
\vec{w} = \underbrace{\mathbf{J} \mathbf{M}^{-1} \mathbf{J}^T}_{\mathbf{A}} \vec{\lambda} + \underbrace{\mathbf{J} \mathbf{M}^{-1} \vec{F}_{\text{ext}} + \vec{b}_{\text{bias}}}_{\vec{b}}
$$

其中 $\mathbf{A} = \mathbf{J} \mathbf{M}^{-1} \mathbf{J}^T$ 正是有效质量矩阵（§6），$\vec{b}$ 包含外力产生的加速度和偏置项（如 Baumgarte 稳定化）。互补条件变为：

$$
\vec{w} \ge 0 \quad \text{（不加速穿透）}
$$

$$
\vec{\lambda} \ge 0 \quad \text{（接触力非负）}
$$

$$
\vec{w}^T \vec{\lambda} = 0 \quad \text{（分离时无力，接触时无穿透加速度）}
$$

这正是标准 LCP 形式。因此，**线性化后的刚体接触求解在数学上等价于求解一个 LCP**。

#### 一个具体例子：球在地板上

一个球静止在地板上，只有一个接触点。设球质量 $m$，重力加速度 $g$，法向接触力 $\lambda$。法向加速度 $w = -g + \lambda/m$。LCP 条件：

$$
w = \frac{\lambda}{m} - g \ge 0
$$

$$
\lambda \ge 0
$$

$$
w \cdot \lambda = 0
$$

两种情况：

- 若球被支撑住（$\lambda > 0$），则 $w = 0$，即 $\lambda = mg$（接触力等于重力）。
- 若球悬空（$\lambda = 0$），则 $w = -g < 0$，不满足 $w \ge 0$，故此情况不成立。

解为 $\lambda = mg$，符合物理直觉。

#### LCP 的求解方法

LCP 有多种经典解法：

- **Lemke 算法**：基于单纯形法的推广，能保证在有限步内求解，但实现复杂，对稀疏问题不友好。
- **Projected Gauss-Seidel（PGS）**：迭代投影法，每次更新一个分量并投影到非负象限——这正是游戏引擎中 Sequential Impulse 求解器的基础（§15）。
- **Projected Gradient / Splitting 方法**：适用于大规模稀疏问题，可结合 Warm Starting。

### 11.3 NCP 是什么

NCP（Nonlinear Complementarity Problem，非线性互补问题）是 LCP 的推广：当 $\vec{w}$ 与 $\vec{\lambda}$ 的关系是非线性的，即：

$$
\vec{w} = \mathbf{F}(\vec{\lambda})
$$

其中 $\mathbf{F}$ 是非线性函数，互补条件为：

$$
\vec{w} \ge 0, \quad \vec{\lambda} \ge 0, \quad \vec{w}^T \vec{\lambda} = 0
$$

#### NCP 在什么情况下产生

LCP 假设动力学可线性化为 $\vec{w} = \mathbf{A}\vec{\lambda} + \vec{b}$。但以下情形会引入非线性：

- **Coulomb 摩擦锥**：摩擦力的大小被限制在 $\mu \lambda_n$ 以内（$\mu$ 为摩擦系数），法向和切向力通过摩擦锥耦合。摩擦锥是圆锥约束，无法写成线性形式，使整体问题变为 NCP。
- **大变形接触**：接触点的 Jacobian 随位置变化，$\mathbf{J}$ 本身依赖于 $\vec{\lambda}$，无法预先固定。
- **非线性约束函数**：如距离约束 $|\vec{p}_1 - \vec{p}_2| = d$ 对位置非线性，其二阶导数（加速度层）含有非线性项。
- **有限旋转**：旋转矩阵或四元数的约束在全局坐标下是非线性的。

因此，**包含 Coulomb 摩擦的完整刚体接触问题本质上是 NCP**，而非 LCP。许多物理引擎在实践中将摩擦锥线性化为多边形锥（pyramid approximation），从而将 NCP 近似为 LCP——这是精度与计算成本的工程权衡。

> [!NOTE]
> LCP 与 NCP 的区分不在于约束本身是否非线性，而在于**整个互补系统的关系是否线性**。即使约束函数 $C(q)$ 是非线性的，只要在当前时刻线性化后 $\vec{w} = \mathbf{A}\vec{\lambda} + \vec{b}$ 成立（$\mathbf{A}$ 可在当前位形处固定），仍是 LCP。NCP 出现在 $\mathbf{A}$ 或 $\vec{b}$ 依赖于 $\vec{\lambda}$ 本身时。

### 11.4 为什么现代游戏引擎不直接”精确解 LCP”

理论上 LCP 有精确解法（如 Lemke 算法），但实时物理引擎几乎不用，原因如下：

| 原因 | 说明 |
|------|------|
| **接触数目大** | 单帧可有数百到数千个接触点，构造的 $\mathbf{A}$ 矩阵虽稀疏，但精确解的复杂度随规模增长 |
| **摩擦使问题变为 NCP** | Coulomb 摩擦锥是非线性的，精确解 NCP 比解 LCP 困难得多 |
| **稠密直接解成本高** | Lemke 等方法本质上是稠密算法，不利用稀疏结构，内存和计算量在 $O(n^3)$ 量级 |
| **每帧拓扑变化** | 接触图每帧都在变，无法预分解（如 LU 分解）；而迭代法天然适应变化的结构 |
| **需要 Warm Start 和并行** | 迭代法（PGS/SI）可利用上一帧的 $\lambda$ 作初值，且每行约束可并行处理；精确解难以并行 |
| **游戏偏好稳定可控** | 游戏需要确定的时间预算和可预测的行为，而非数学上严格最优但耗时不可控的解 |

因此，实时引擎普遍采用**迭代投影**方法（Sequential Impulse / PGS）来近似满足互补条件：每轮迭代将违反约束的冲量投影回去，多轮后收敛。这牺牲了数学精确性，换取了速度、稳定性和可控性——正是 §15 详述的 Jacobi / Gauss-Seidel 求解思路。

---

## 12. 速度级约束和位置级约束有什么区别

### Position Level

$$
C(q)=0
$$

描述几何条件。

### Velocity Level

对时间求导：

$$
\dot C=Jv=0
$$

描述“不能继续沿违反约束的方向运动”。

### Acceleration Level

再求导：

$$
J\dot v + \dot J v=0
$$

经典约束动力学往往从这一层推导约束力。

### 为什么传统刚体 Solver 爱在速度层求解

因为碰撞天然表现为冲量导致速度瞬时变化：

$$
v^+=v^-+M^{-1}J^T\lambda
$$

速度层也便于处理：

- restitution；
- friction；
- collision impulse。

### PBD 为什么直接操作位置

PBD 先预测位置，再直接投影：

$$
q^*=q_n+h v_n
$$

然后：

$$
q^*\leftarrow q^*+\Delta q
$$

最后从位置反推速度：

$$
v_{n+1}=\frac{q_{n+1}-q_n}{h}
$$

它用“几何修正”替代了显式约束力求解，因此非常稳定、容易控制，但传统 PBD 的刚度会依赖时间步和迭代次数。

---

## 13. 位置误差应该怎么修正

即使速度层满足：

$$
Jv=0
$$

由于离散误差，位置仍可能逐渐漂移：

$$
C(q)\neq0
$$

这叫 **constraint drift**。

### Baumgarte Stabilization

把位置误差转换成一个希望消除的速度：

$$
Jv = -\frac{\beta}{h}C(q)
$$

其中 $\beta$ 是稳定化系数。

如果 $C>0$ 或 $C<0$，Solver 会产生额外速度去修正它。

#### 优点

- 简单；
- 可集成到速度 Solver。

#### 缺点

- 参数敏感；
- 可能注入能量；
- 太强会震荡。

### Position Projection / Split Impulse

另一类思路：

- 正常速度 Solver 处理动力学；
- 单独位置修正阶段处理穿透和 drift。

这样可减少将位置误差直接转化为真实动能的问题。

PBD/XPBD 则更进一步，把约束求解本身就放到位置层。

---

## 14. Impulse-based Constraint Solver 是怎么工作的

假设当前广义速度：

$$
v
$$

希望施加约束冲量：

$$
P=J^T\lambda
$$

于是：

$$
v'=v+M^{-1}J^T\lambda
$$

希望约束后的速度满足：

$$
Jv'=b
$$

代入：

$$
J(v+M^{-1}J^T\lambda)=b
$$

得到：

$$
JM^{-1}J^T\lambda=b-Jv
$$

因此：

$$
\lambda=(JM^{-1}J^T)^{-1}(b-Jv)
$$

对于单行约束：

$$
\lambda=\frac{b-Jv}{JM^{-1}J^T}
$$

然后更新：

$$
v\leftarrow v+M^{-1}J^T\lambda
$$

这就是 Sequential Impulse / PGS 的核心单约束更新形式。

### Contact 中的 Clamp

法向接触要求：

$$
\lambda_n\ge0
$$

因此累计冲量需要：

$$
\lambda_n^{new}=\max(0,\lambda_n^{old}+\Delta\lambda)
$$

再用真正增加的部分更新速度。

这一步实际上就是在迭代地近似求解 complementarity。

---

## 15. Jacobi 和 Gauss-Seidel 解约束有什么区别

### Jacobi

一轮中所有约束都读取旧状态：

$$
x_i^{k+1}=F_i(x^k)
$$

所有更新计算结束后一起写回。

#### 优点

- 高度并行；
- GPU 友好；
- 数据竞争少。

#### 缺点

- 使用 stale state；
- 通常收敛慢；
- 强耦合系统表现较差。

### Gauss-Seidel

约束逐个更新，并立即把新状态暴露给后续约束：

$$
x_i^{k+1}=F_i(x_1^{k+1},...,x_{i-1}^{k+1},x_i^k,...)
$$

#### 优点

- 收敛通常更快；
- 约束响应传播更直接。

#### 缺点

- 顺序依赖；
- 难并行；
- 非确定性风险更高。

### Sequential Impulse

可以理解为对约束行做 PGS。

每处理一个约束，就立即修改参与刚体的速度，因此后面的约束看到的是最新状态。

### GPU Solver

通常会采用：

- Jacobi；
- graph coloring 后分组 GS；
- block-Jacobi；
- hybrid methods。

目标是平衡并行度和收敛速度。

---

## 16. 为什么 Solver Iteration 会影响约束刚度

一个迭代求解器通常不会一次把误差完全消掉，而是逐步逼近。

例如每次只修正：

$$
\Delta x=-\alpha C
$$

如果 $0<\alpha<1$，则多次迭代后误差逐渐衰减。

因此：

- 1 iteration：看起来软；
- 10 iterations：更硬；
- 100 iterations：更接近理想约束。

传统 PBD 尤其明显。

如果每轮 projection 使用 stiffness $k$，最终效果大致与：

$$
1-(1-k)^N
$$

有关，其中 $N$ 是 iteration count。

所以同一个 stiffness，在 4 次和 20 次迭代时完全不是同一种材料行为。

这正是 XPBD 想改善的问题之一。

---

## 17. PBD 约束到底是怎么解出来的

PBD 希望修正位置：

$$
q\leftarrow q+\Delta q
$$

使：

$$
C(q+\Delta q)=0
$$

一阶展开：

$$
C(q)+\nabla C^T\Delta q\approx0
$$

设位置修正沿约束梯度方向：

$$
\Delta q=M^{-1}\nabla C\lambda
$$

代入：

$$
C+\nabla C^TM^{-1}\nabla C\lambda=0
$$

得到：

$$
\lambda=
-\frac{C}{\nabla C^TM^{-1}\nabla C}
$$

因此：

$$
\Delta q=
-M^{-1}\nabla C
\frac{C}{\nabla C^TM^{-1}\nabla C}
$$

对于多个粒子：

$$
\Delta x_i=w_i\nabla_{x_i}C\lambda
$$

$$
\lambda=-\frac{C}
{\sum_i w_i\|\nabla_{x_i}C\|^2}
$$

这里 $w_i=1/m_i$。

### 本质

PBD 不是随便“把点拉回去”，而是在一阶线性化下，按 inverse mass 加权进行最小位置修正。

---

## 18. XPBD 相比 PBD 到底改变了什么

XPBD 引入 compliance：

$$
\alpha=\frac1k
$$

并离散成：

$$
\tilde\alpha=\frac{\alpha}{h^2}
$$

单约束更新常写为：

$$
\Delta\lambda=
\frac{-C(q)-\tilde\alpha\lambda}
{\nabla C^TM^{-1}\nabla C+\tilde\alpha}
$$

然后：

$$
\Delta q=M^{-1}\nabla C\Delta\lambda
$$

并累计：

$$
\lambda\leftarrow\lambda+\Delta\lambda
$$

### 与 PBD 的关键区别

#### 1. 引入物理可解释的 Compliance

$$
\alpha=0
$$

趋近刚性约束。

$$
\alpha>0
$$

允许形变。

#### 2. 引入时间步缩放

$$
\tilde\alpha=\frac{\alpha}{h^2}
$$

使刚度不再简单地随时间步变化。

#### 3. 累计 Lagrange Multiplier

这使 XPBD 更接近约束力的离散积分，而不是每轮独立做纯几何投影。

### 为什么 XPBD 仍然不是完全 iteration-independent

理论性质明显改善，但实际多约束、非线性系统中：

- 迭代次数仍影响收敛误差；
- 约束顺序仍有影响；
- 大质量比和强耦合仍困难。

因此更准确地说：

> XPBD 显著降低了 material stiffness 对 timestep 和 iteration 的直接依赖，但不会消除有限迭代造成的求解误差。

---

## 19. XPBD 中的 λ 为什么需要累计

在普通 PBD 中，每次 projection 常可看成独立地计算一个位置修正量。

XPBD 中：

$$
\lambda^{k+1}=\lambda^k+\Delta\lambda
$$

这是因为其推导对应于离散化后的约束势能 / Lagrange multiplier 系统。

公式中：

$$
-C(q)-\tilde\alpha\lambda
$$

第二项意味着此前已经建立的约束响应会影响下一次更新。

### 直观理解

把一个软弹簧约束压缩后，它已经“积累”了约束力。

下一轮不应该忘掉前面已经建立的约束反力，再重新从 0 开始求。

### 与 Warm Start 不完全相同

- XPBD 的 $\lambda$ accumulation：同一个 timestep 内的数学状态；
- Warm Start：把上一 timestep 的解作为当前 timestep 初始猜测。

两者都在“保留历史乘子”，但角色不同。

---

## 20. Compliance、Stiffness、Soft Constraint 到底是什么关系

理想线性弹簧：

$$
F=-kx
$$

其中 $k$ 是 stiffness。

Compliance 定义为：

$$
\alpha=\frac1k
$$

因此：

- $k\to\infty$ 时，$\alpha\to0$；
- $k$ 小时，$\alpha$ 大。

### Soft Constraint 是否等价于 Spring

不一定。

Soft Constraint 是更广泛概念：允许 Constraint Error 在有限负载下存在。

它可以通过：

- spring-damper；
- ERP/CFM；
- compliance；
- regularization；

实现。

### Constraint Force Mixing

一些速度级 Solver 会把系统：

$$
JM^{-1}J^T\lambda=b
$$

修改成：

$$
(JM^{-1}J^T+\epsilon I)\lambda=b
$$

其中 $\epsilon$ 相当于给刚性约束加入 softness / regularization。

这样还能改善病态矩阵条件数。

---

## 21. Constraint Motor / Drive 本质上是什么

Motor 并不是必须“跳出 Solver 直接 AddTorque”。

它完全可以被表达成一个目标约束。

### Velocity Motor

希望相对角速度达到：

$$
\omega_{rel}=\omega_{target}
$$

写成：

$$
Jv=b
$$

其中：

$$
b=\omega_{target}
$$

Solver 求一个 $\lambda$，产生所需扭矩/冲量。

### Position Drive

希望：

$$
C(q)=q-q_{target}=0
$$

可以通过：

- Baumgarte target velocity；
- PD；
- soft constraint；
- XPBD compliance；

转成 Solver 目标。

### Motor 的关键属性

Motor 往往需要 force/impulse limit：

$$
\lambda_{min}\le\lambda\le\lambda_{max}
$$

否则一个位置 Motor 就可能退化成“无限大刚度的硬约束”。

因此工业 Joint Solver 中，Motor、Limit、Lock 往往只是不同 target 与 bounds 的 constraint row。

---

## 22. 锁定平移/旋转实际上约束了几个自由度

单刚体 6 DoF：

$$
[x,y,z,\theta_x,\theta_y,\theta_z]
$$

虽然实际旋转不会真的使用欧拉角作为积分变量，但自由度计数上可以这样理解。

### Linear Lock

锁 X：1 个约束。

锁 Y：1 个约束。

锁 Z：1 个约束。

三轴全锁：3 个约束。

### Angular Lock

锁一个旋转自由度：1 个约束。

三轴全锁：3 个约束。

### Fixed Joint

两个刚体相对位姿完全固定：

- 3 linear；
- 3 angular。

合计 6 条独立约束。

### Hinge

理想 Hinge 只允许 1 个角自由度，因此相对 6 DoF 中要约束 5 个：

- 3 个平移；
- 2 个旋转。

剩下绕 hinge axis 的旋转自由。

如果再加 Angular Limit，只有到达 limit 时才临时激活第 6 个方向的 unilateral constraint。

---

## 23. Maximal Coordinates 和 Generalized Coordinates 对约束有什么影响

### Maximal Coordinates

每个刚体始终拥有完整 6 DoF：

$$
q_i=(x_i,R_i)
$$

Joint 通过显式约束连接它们。

例如 10 节链条：

- 每个刚体 6 DoF；
- 总共 60 个坐标；
- Hinge Joint 再通过约束削减自由度。

#### 优点

- 适合碰撞和断裂；
- 拓扑变化简单；
- 任意刚体可以独立存在；
- 游戏场景灵活。

#### 缺点

- 需要大量约束；
- 约束系统可能病态；
- 大质量比、长链条难收敛。

### Reduced / Generalized Coordinates

直接用真正的关节自由度描述系统。

例如一条 10 关节机械臂，每个关节 1 DoF，则只需要约 10 个广义坐标。

Joint Constraint 被结构本身自动满足。

#### 优点

- 少自由度；
- 关节链精确；
- 机器人动力学效率高。

#### 缺点

- 拓扑变化困难；
- 接触和断裂处理复杂；
- 需要 articulated-body algorithms。

### 为什么游戏物理大量使用 Maximal

因为游戏世界具有：

- 任意碰撞；
- 破坏；
- 拾取；
- 动态 Joint；
- 复杂接触网络。

Maximal Coordinates 更通用。

---

## 24. 刚体旋转约束为什么比位置约束难

位置属于欧氏空间：

$$
x\in\mathbb R^3
$$

可以直接：

$$
\Delta x=x_{target}-x
$$

旋转属于：

$$
SO(3)
$$

不是普通线性空间。

不能简单把两个 rotation matrix 相减作为角误差。

### Quaternion Error

当前姿态：

$$
Q
$$

目标姿态：

$$
Q_d
$$

误差：

$$
Q_e=Q_dQ^{-1}
$$

然后转换成 axis-angle：

$$
Q_e\rightarrow(n,\theta)
$$

局部小角度误差可以写：

$$
e_R=\theta n
$$

再构造 angular constraint。

### 为什么惯量更复杂

线性方向：

$$
\Delta v=\frac{1}{m}P
$$

角向：

$$
\Delta\omega=I^{-1}\tau
$$

其中世界空间惯量：

$$
I_{world}=R I_{body}R^T
$$

所以旋转约束的有效质量随姿态变化。

这也是 angular constraint 比纯 distance constraint 更复杂的重要原因。

---

## 25. 摩擦为什么也是约束

接触法线约束阻止穿透。

摩擦则限制接触切线方向的相对运动。

设切向冲量：

$$
\lambda_t
$$

Coulomb friction 要求：

$$
\|\lambda_t\|\le \mu\lambda_n
$$

其中：

- $\mu$：摩擦系数；
- $\lambda_n$：法向冲量。

### Friction Cone

二维切线空间中：

$$
\sqrt{\lambda_{t1}^2+\lambda_{t2}^2}
\le\mu\lambda_n
$$

这是一个圆锥可行域。

### Friction Pyramid

为便于求解，可以用多个线性方向近似圆锥。

### Sequential Impulse 常见实现

先求法向：

$$
\lambda_n\ge0
$$

再求切向：

$$
\lambda_t^{new}=Clamp(
\lambda_t^{old}+\Delta\lambda_t,
-\mu\lambda_n,
\mu\lambda_n)
$$

因此摩擦也可以看作带 bounds 的 constraint row。

---

## 26. Contact、Joint、Limit、Motor、Friction 能不能统一

可以，而且这是理解工业 Solver 最重要的抽象之一。

一个典型约束行可以抽象成：

$$
Jv=b
$$

以及乘子范围：

$$
\lambda_{min}\le\lambda\le\lambda_{max}
$$

不同功能只是参数不同。

### Joint Lock

$$
b=\text{bias from position error}
$$

$$
\lambda\in(-\infty,+\infty)
$$

### Contact Normal

$$
\lambda\in[0,+\infty)
$$

### Motor

$$
b=v_{target}
$$

$$
\lambda\in[-\lambda_{max},+\lambda_{max}]
$$

### Friction

$$
b=-v_t
$$

$$
\lambda_t\in[-\mu\lambda_n,+\mu\lambda_n]
$$

### Limit

只在 limit active 时生成 row，并使用单边 bounds。

所以从 Solver 数据结构看，很多复杂 Gameplay 概念最终可能都被压成：

- Jacobian；
- RHS / target velocity；
- effective mass；
- accumulated lambda；
- lower bound；
- upper bound；
- compliance / softness。

---

## 27. 约束到底是在“解方程”还是“做优化”

答案是：**两种视角都成立。**

### 方程视角

速度级约束：

$$
JM^{-1}J^T\lambda=b
$$

看起来就是求线性方程组。

### 优化视角

可以把约束冲量理解为：寻找一个最小修改，使新速度进入可行空间。

例如：

$$
\min_{v'}
\frac12(v'-v)^TM(v'-v)
$$

subject to

$$
Jv'=b
$$

其 Lagrange multiplier 解自然产生：

$$
v'=v+M^{-1}J^T\lambda
$$

以及：

$$
JM^{-1}J^T\lambda=b-Jv
$$

因此所谓 Effective Mass 矩阵，本质上就是约束优化问题消元后出现的 Schur Complement。

### Energy View

对于弹性或软体问题，还常写成：

$$
\min_q E(q)
$$

其中能量由：

- inertia；
- elasticity；
- constraints；
- external potential；

共同构成。

VBD / AVBD 的思想尤其适合从这个方向理解。

---

## 28. XPBD、VBD、AVBD 的约束思想有什么区别

这一节重点不做论文级完整推导，而是建立统一认知。

### XPBD

核心思想：

> 把 constraints 写成 position-level constraints，通过带 compliance 的 Lagrange multiplier projection 迭代修正位置。

典型更新：

$$
\Delta\lambda=
\frac{-C-\tilde\alpha\lambda}
{\nabla C^TM^{-1}\nabla C+\tilde\alpha}
$$

适合：

- cloth；
- rope；
- deformable；
- 位置约束驱动系统。

优点：

- 稳定；
- 易实现；
- constraint-centric；
- 容易控制 stiffness。

### VBD

Vertex Block Descent 更偏向对隐式时间积分后的能量目标进行 block coordinate optimization。

每次选一个 vertex / block，局部求解其自由度，使全局目标能量下降。

它不只是“投影一个约束”，而更偏：

> 对离散动力学能量做局部非线性优化。

### AVBD

AVBD 可理解为将类似 block descent / variational optimization 思想扩展到 articulated / rigid-body block。

刚体一个 block 不再只有一个 $x$，而包含：

- translation；
- rotation；

即一个 6 DoF block。

局部求解通常要面对：

- 6×6 block Hessian；
- rotation manifold；
- joint/contact energy coupling。

### 三者关系

可以粗略理解为：

- XPBD：constraint projection 视角最强；
- VBD：energy minimization + block coordinate descent；
- AVBD：把 block optimization 推向刚体 / articulated 系统。

它们都不是脱离约束理论的另一套宇宙，而是在离散动力学、约束、能量、优化之间选择不同的主视角。

---

## 29. 高刚度约束为什么容易产生数值问题

刚度高意味着系统希望：

$$
C(q)\approx0
$$

误差稍微存在，就需要非常大的 restoring force / multiplier。

### 线性系统角度

例如：

$$
A\lambda=b
$$

若不同约束尺度差异巨大，$A$ 的 condition number 会变差。

于是迭代求解器：

- 收敛慢；
- 对误差敏感；
- 对顺序敏感。

### 高质量比

一个 1 kg 刚体通过 Joint 连着 10000 kg 刚体。

逆质量差异：

$$
1:0.0001
$$

轻物体容易被快速修正，而重物体几乎不动，导致约束误差沿链传播非常慢。

这也是 ragdoll、机器人链条、车辆 suspension 等系统常见困难。

### 解决手段

工程上可能采用：

- more iterations；
- substepping；
- mass scaling；
- shock propagation；
- block solve；
- preconditioning；
- compliance / regularization；
- articulation solver；
- TGS；
- direct solve for small blocks。

所以“更硬”绝不是免费属性。

---

## 30. Warm Starting 为什么能改善约束求解

相邻物理帧通常非常相似。

例如一个箱子静止在地面：

上一帧的接触法向冲量大致用于抵消重力：

$$
\lambda_n\approx mgh
$$

下一帧如果从：

$$
\lambda=0
$$

重新开始迭代，需要多轮才能恢复到相似解。

Warm Start 直接使用上一帧缓存：

$$
\lambda_0=\lambda_{prev}
$$

并先把该冲量施加到速度上，然后继续迭代修正。

### 优点

#### 1. 更快收敛

初值已经接近真实解。

#### 2. 提高堆叠稳定性

Box stack 中约束力能跨帧保持连续。

#### 3. 减少 jitter

避免每帧从 0 开始重新建立支撑力。

### 风险

接触拓扑变化时旧 $\lambda$ 可能不再有效。

所以需要：

- contact persistence；
- manifold matching；
- feature ID；
- impulse decay / reset。

---

## 31. 物理约束真正的完整求解链是什么

下面把整个过程串起来。

### Step 1：定义刚体状态

对于刚体 $i$：

$$
q_i=(x_i,R_i)
$$

$$
v_i=(\mathbf v_i,\boldsymbol\omega_i)
$$

### Step 2：外力积分 / Prediction

例如半隐式 Euler：

$$
v^*=v_n+hM^{-1}f_{ext}
$$

然后：

$$
q^*=Integrate(q_n,v^*,h)
$$

### Step 3：碰撞检测 / Joint Evaluation

生成约束：

$$
C_j(q)
$$

包括：

- Contact；
- Joint；
- Limit；
- Motor；
- Friction。

### Step 4：计算 Jacobian

$$
J_j=\frac{\partial C_j}{\partial q}
$$

或者直接从几何关系构造 velocity Jacobian。

### Step 5：构造 Effective Mass

$$
K_j=J_jM^{-1}J_j^T
$$

单约束：

$$
m_{eff}=K_j^{-1}
$$

### Step 6：构造 RHS

可能包含：

- 当前相对速度；
- restitution；
- penetration bias；
- motor target；
- softness；
- compliance。

例如：

$$
b=v_{target}-Jv
$$

### Step 7：求增量 λ

$$
\Delta\lambda=K^{-1}b
$$

然后根据约束类型 clamp：

$$
\lambda_{new}=Clamp(
\lambda_{old}+\Delta\lambda,
\lambda_{min},
\lambda_{max})
$$

### Step 8：把 λ 映射回刚体

$$
\Delta v=M^{-1}J^T
(\lambda_{new}-\lambda_{old})
$$

更新参与刚体：

$$
v\leftarrow v+\Delta v
$$

### Step 9：迭代

对所有约束重复：

$$
1...N\;iterations
$$

直到预算耗尽或误差足够小。

### Step 10：位置更新 / Stabilization

使用最终速度推进位置，或者进行 position correction。

### Step 11：缓存 λ

用于下一帧 Warm Start。

---

## 32. 统一理解框架

如果以后再看到新的约束系统，可以先问下面 8 个问题。

### 1. 它的约束函数是什么？

$$
C(q)=?
$$

### 2. 它是 Equality 还是 Inequality？

$$
C=0
$$

还是：

$$
C\ge0
$$

### 3. Jacobian 是什么？

$$
J=\frac{\partial C}{\partial q}
$$

### 4. Constraint Space Mass 是什么？

$$
K=JM^{-1}J^T
$$

### 5. λ 的 bounds 是什么？

例如 Contact：

$$
\lambda\ge0
$$

Motor：

$$
|\lambda|\le\lambda_{max}
$$

### 6. 它工作在哪个层级？

- position；
- velocity；
- acceleration；
- energy minimization。

### 7. Solver 是什么？

- Direct；
- Jacobi；
- PGS / SI；
- TGS；
- PBD；
- XPBD；
- Newton；
- VBD / AVBD。

### 8. 如何处理数值稳定性？

- Baumgarte；
- split impulse；
- compliance；
- regularization；
- warm start；
- substep；
- preconditioner；
- block solve。

如果这 8 个问题能够答清楚，基本就已经理解了一个 Constraint Solver 的核心。

---

## 33. 推荐学习顺序

如果目标是继续研究 Chaos、XPBD、AVBD 或自研刚体 Solver，推荐按以下顺序深入。

### 第一阶段：约束的数学语言

1. 自由度与广义坐标；
2. $C(q)=0$；
3. Equality / Inequality；
4. Jacobian；
5. Lagrange Multiplier；
6. Effective Mass。

目标：能独立推导 Distance Constraint 和 Point-to-Point Constraint。

### 第二阶段：经典刚体 Solver

1. Impulse Dynamics；
2. Contact Jacobian；
3. Sequential Impulse / PGS；
4. Friction；
5. Restitution；
6. Baumgarte；
7. Warm Starting；
8. Joint Row abstraction。

目标：自己写出简单的 Ball Socket + Contact Solver。

### 第三阶段：不等式与优化

1. KKT；
2. Complementarity；
3. LCP / NCP；
4. Active Set；
5. Projected Iterative Solver。

目标：从优化角度重新理解 Contact 和 Limit。

### 第四阶段：PBD / XPBD

1. Position Projection；
2. Constraint Gradient；
3. Mass-weighted correction；
4. XPBD Compliance；
5. λ accumulation；
6. timestep / iteration dependence。

目标：能够从头推导 XPBD distance constraint，并扩展到 rigid body constraint。

### 第五阶段：高级 Solver

1. Block Solver；
2. Schur Complement；
3. Preconditioning；
4. Graph Coloring；
5. Island；
6. SIMD / SIMT；
7. Newton Solver；
8. VBD；
9. AVBD。

目标：开始从“单约束算法”上升到“工业级 Solver Architecture”。

---

## 最终总结

物理约束真正值得掌握的不是某个 Joint API，而是一条统一链路：

$$
\boxed{
\text{Geometry}
\rightarrow C(q)
\rightarrow J
\rightarrow M^{-1}
\rightarrow K=JM^{-1}J^T
\rightarrow \lambda
\rightarrow J^T\lambda
\rightarrow \Delta v/\Delta q
}
$$

在这条主线上：

- **Joint** 是 equality constraint；
- **Contact** 是 unilateral inequality constraint；
- **Limit** 是条件激活的不等式 constraint；
- **Motor** 是带 target 和 force bounds 的 constraint；
- **Friction** 是依赖 normal impulse 的 bounded tangential constraint；
- **PBD / XPBD** 主要改变的是约束被离散和求解的方式；
- **VBD / AVBD** 则进一步把问题放到 energy minimization 与 block optimization 的框架中理解。

当你看到 Chaos、PhysX、Bullet、MuJoCo、XPBD、AVBD 的 Constraint Solver 时，真正应该追踪的不是“这个类叫什么”，而是：

1. 它如何定义 constraint error；
2. 它如何构造 Jacobian；
3. 它如何形成 effective mass / Hessian；
4. 它如何求 multiplier 或 correction；
5. 它如何处理 bounds、complementarity 和 friction；
6. 它如何通过迭代、warm start、substep、block solve 保持稳定。

理解到这里，才算真正从“使用物理约束”进入“理解 Constraint Solver”。
