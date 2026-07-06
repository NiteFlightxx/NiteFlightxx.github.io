---
title: "JGS2 的数学与物理原理详解 — 从雅可比过冲到 GPU 上的近二阶收敛弹性体求解"
excerpt: "基于 Lan et al. 2025 (SIGGRAPH) 的 JGS2 论文，像搭积木一样，从 Jacobi/Gauss-Seidel 的并行难题出发，揭示'过冲(overshoot)'这一被忽视的收敛杀手，推导出二阶最优的局部更新公式，再用共旋子空间与 Cubature 采样把它变成可预计算的 GPU 算法。打通'并行性 vs 收敛性'这一对历史矛盾。"
date: "2026-07-06"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["JGS2", "GPU", "弹性体", "数值优化", "迭代求解", "SIGGRAPH"]
readTime: "阅读约45分钟"
---

> 本文基于论文 **JGS2: Near Second-order Converging Jacobi/Gauss-Seidel for GPU Elastodynamics**（Lei Lan, Zixuan Lu, Chun Yuan, Weiwei Xu, Hao Su, Huamin Wang, Chenfanfu Jiang, Yin Yang；ACM Transactions on Graphics, 2025；arXiv:2506.06494）整理。该工作是 SIGGRAPH 2025 的 GPU 弹性体求解器，核心贡献是让"像 Jacobi 一样并行"和"像 Newton 一样快收敛"这两个长期矛盾的目标首次同时成立。
>
> 阅读前建议先看 [线性方程组迭代求解的数学原理详解](/knowledge/iterative-linear-solvers/)——本文是它的直接延伸：在那篇里我们讲清了 Jacobi、Gauss-Seidel、CG 的收敛性，这里我们把镜头推到 GPU 上，看一个被所有人忽视的收敛杀手，以及如何用二阶最优解消灭它。

---

## 一、为什么 GPU 弹性体模拟是个难题

弹性体模拟在每个时间步要解一个**变分优化问题**。隐式欧拉积分下，它长这样：

$$
\arg\min_{x} \; E(x) = \underbrace{\frac{1}{2}(x - y)^T M h^{-2} (x - y)}_{E_{\text{inertia}}} + \underbrace{W(x)}_{E_{\text{elastic}}}
$$

其中 $x \in \mathbb{R}^n$ 是所有顶点坐标的拼接（系统规模 $n$ 通常上百万），$E_{\text{inertia}}$ 是惯性势能（惩罚加速度），$W(x)$ 是弹性能（惩罚形变）。这里 $y = x^k + v^k h + h^{-1} f_{\text{ext}} h^2$ 是由上一帧位置 $x^k$、速度 $v^k$、外力 $f_{\text{ext}}$ 和时间步 $h$ 决定的已知向量，$M$ 是质量矩阵。

**关键事实**：$E_{\text{inertia}}$ 是 $x$ 的二次函数，而 $W(x)$ 是非线性的（取决于材料本构，如 StVK、Neo-Hookean）。所以我们面对的是一个百万维的非线性优化。

### 两条经典路线

**全局 Newton 法**（CPU 上的"一锤定音"解法）：对 $E(x)$ 在当前猜测 $x^k$ 处做二阶泰勒展开：

$$
E(x^k + \Delta x) \approx E(x^k) + g^T \Delta x + \frac{1}{2} \Delta x^T H \Delta x
$$

其中 $g = \nabla E(x^k) \in \mathbb{R}^n$ 是梯度，$H = \nabla^2 E(x^k) \in \mathbb{R}^{n \times n}$ 是 Hessian。对 $\Delta x$ 求导置零，得到**全局 Newton 步**：

$$
\Delta x = -H^{-1} g \tag{Newton}
$$

它有**二阶（二次）收敛**——误差每步平方级缩小。代价是：每步要分解一个百万维稀疏矩阵 $H$，这是 $O(n^{1.5})$ 量级的重活，GPU 上极不友好（直接因子化难以并行）。

**局部 Jacobi / Gauss-Seidel**（GPU 上的"蚂蚁搬家"解法）：把全局问题切成成千上万个**小子问题** $E_i$（比如每个顶点一个，$m=3$），每个子问题只含少量 DOF。每个子问题独立求解（Jacobi）或按顺序求解（GS），一轮一轮迭代。每个子问题小到能在单个 GPU 线程上解析求解，**并行性极好**。代价是：收敛慢，通常只是一阶（线性）收敛，甚至对刚性材料发散。

**历史共识**：并行性和收敛性是鱼和熊掌——你想并行就得把子问题切小，切小就丢失全局信息，丢失信息就收敛慢。论文原话："It is believed that one can not achieve the best parallelization and convergence at the same time."

JGS2 要打破的就是这个共识。

---

## 二、积木第一层：Jacobi 与 Gauss-Seidel 的并行困境

> 这一层是基础，复习一下两种经典迭代的并行特性差异。详见 [迭代求解数学原理](/knowledge/iterative-linear-solvers/)。

把全局 $\min E(x)$ 切成子问题 $E_i(x_i)$（$x_i \in \mathbb{R}^m$ 是第 $i$ 个子问题的局部 DOF）。

- **Jacobi**：所有子问题**同时**用上一轮的全局 $x^k$ 求解，得到 $\hat{x}_i$，再把共享 DOF 的多个副本**平均**回去得到 $x^{k+1}$。完全并行——所有子问题一轮搞定。但每个子问题只看到局部信息，不知道自己的解会怎么影响全局。
- **Gauss-Seidel (GS)**：子问题**按顺序**求解，新解出的 $\hat{x}_i$ 立刻更新到全局 $x$，供后续子问题使用。信息流动更顺，收敛更快。代价是串行依赖。GPU 上靠**图着色**把不共享 DOF 的子问题分组并行，但着色会引入额外开销，且组数随网格复杂度增长。

GPU 实践中两者的差异常被描述为：Jacobi 更并行但更慢收敛，GS 稍快但着色麻烦。但论文指出一个被所有人忽视的更深层问题——**两者都饱受过冲之苦**，只是没人系统地量化过。

---

## 三、积木第二层：过冲——被忽视的收敛杀手

> 这是整篇论文的"啊哈"洞察。理解过冲，就理解了 JGS2 为什么要这么做。

### 3.1 局部最优不等于全局最优

设 $x_i^\star$ 是子问题 $E_i$ 的局部最优解，$x^\star$ 是全局 $E$ 的最优解。一个朴素想法是：解出每个 $x_i^\star$，拼起来就接近 $x^\star$。

**但这是错的。** 根本原因是：

$$
\arg\min E_i \;\neq\; \arg\min E
$$

完全最小化 $E_i$ 会让局部能量降下来，但**这个局部更新会改变其它区域的能量**。如果局部更新太激进，它降低的 $E_i$ 抵消不了它引起的全局 $E$ 上升——这就是**过冲**。

### 3.2 过冲与欠冲的精确定义

论文给出两种病态：

- **欠冲**：局部更新 $\Delta x_i$ 不足以降低 $E_i$，$E$ 下降缓慢。可用带 Wolfe 条件的局部线搜索缓解。
- **过冲**：完全松弛 $E_i$（取 $x_i^\star$）后，$E_i$ 的下降**无法抵消**全局 $E$ 的上升。即局部最优反而让全局目标变差。

过冲只能靠**全局线搜索**监控，而全局线搜索极昂贵、不能频繁调用。过冲的本质是：**局部求解器只用了局部信息，不知道自己的更新会如何波及全局**。

### 3.3 为什么过冲被忽视

过冲的隐蔽性在于：它不会让模拟"崩"，只是让收敛**慢得反常**。工程师看到 Jacobi 迭代 200 次还不收敛，会归咎于"Jacobi 本来就慢"或"材料太硬"，而不会想到"我的局部求解器其实**过头了**——它解得太好，反而害了全局"。论文 Fig.2 用一条悬臂梁的实验量化了这一点：XPBD、PD、VBD 迭代 20 次后误差几乎不动，而 JGS2 三次迭代就到 $10^{-3}$。

---

## 四、积木第三层：二阶最优——让局部更新等于全局 Newton 步

> 这是数学核心。JGS2 的目标是：让每个局部子问题的更新 $\Delta x_i$ **恰好等于**全局 Newton 法在该子问题上的更新。

### 4.1 全局 Newton 步的二阶最优性

回到全局 Newton 步 $\Delta x = -H^{-1} g$。它的二阶最优性意味着：在当前二阶泰勒近似下，$\Delta x$ 是**精确**让 $E(x^k + \Delta x)$ 最小的更新。如果二阶近似足够好（即 $E$ 接近二次），Newton 一步就到最优。

**JGS2 的目标**：如果每个局部子问题的更新 $\Delta x_i$ 都等于"全局 Newton 在该子问题上的投影"，那么一轮并行迭代就近似一步全局 Newton——获得二阶收敛。

### 4.2 朴素补救方案及其死胡同

最直接的补救是改写局部子问题，让它考虑全局能量：

$$
\min_{x_i} \; E_i(x_i) + E_c(x_c) \tag{4}
$$

其中 $E_c$ 是"互补 DOF"（即除 $x_i$ 外的所有 DOF）的能量。但 $E_c$ 依赖全局 $x$，而我们要优化的只是局部 $x_i$——如果真把未知量换成全局 $x$，就退化回全局问题，**放弃了并行**。

### 4.3 关键跳跃：引入扰动传播函数 $\Phi$

论文的核心洞察：我们不需要真的求 $E_c$，只需要知道**局部更新 $\Delta x_i$ 会怎样传播到全局**。设这个传播关系为 $\Delta x_c = \Phi(\Delta x_i)$。那么子问题变成：

$$
\min_{\Delta x_i} \; E_i(\Delta x_i) + E_c(\Phi(\Delta x_i)) \tag{5}
$$

用 Newton 法解这个局部问题，更新公式是（论文 Eq.6）：

$$
\Delta x_i = -\left( \nabla^2 E_i + \Phi^T \nabla^2 E_c \, \Phi \right)^{-1} \left( \nabla E_i + \Phi^T \nabla E_c \right) \tag{6}
$$

这里 $\Phi = \frac{\partial x_c}{\partial x_i} \in \mathbb{R}^{n_c \times m}$ 是**扰动传播雅可比**，描述"给局部 DOF 一个单位扰动，互补 DOF 会怎么变"。

**直觉**：$\Phi$ 让局部求解器"看见"自己的更新会怎样波及全局。多出来的项 $\Phi^T \nabla^2 E_c \, \Phi$ 是一个**阻尼 Hessian**——它阻止局部求解器冲到自己的局部最优（从而避免过冲），让它停在"对全局最优"的位置。

### 4.4 证明：这个局部更新就是全局 Newton 步

论文 §4.2 给出了关键定理：用 Eq.(6) 的更新，得到的 $\Delta x_i$ **数学上等价于**全局 Newton 解 $\Delta x = -H^{-1} g$ 在该子问题上的投影。证明思路是：

1. 把全局系统 DOF 重排为 $x = [x_i^T, x_c^T]^T$，写出分块增量平衡方程：

$$
\begin{bmatrix} H_{ii} & H_{ic} \\ H_{ci} & H_{cc} \end{bmatrix}
\begin{bmatrix} \Phi \\ I \end{bmatrix} = \begin{bmatrix} I \\ 0 \end{bmatrix} \tag{7}
$$

2. 第二行展开得到 $\Phi$ 的显式构造：

$$
\Phi = -H_{cc}^{-1} H_{ci} \tag{8}
$$

3. 任何局部更新 $\Delta x_i$ 触发的全局扰动是 $\Delta x_c = \Phi \Delta x_i$，于是构造出 $\Phi$ 为基的**扰动子空间**。

4. 把 $\Phi$ 代回，得到的局部 Hessian $\nabla^2 E_i + \Phi^T \nabla^2 E_c \, \Phi$ 恰好等于全局 Schur 补 $H_{ii} - H_{ic} H_{cc}^{-1} H_{ci}$——这正是全局 Newton 步在该子问题上的**精确投影**。

**结论**：用这个 $\Phi$，局部求解 $\Delta x_i = \Delta x_i^\star$，即**二阶最优**。一轮并行迭代 ≈ 一步全局 Newton。

### 4.5 好消息与坏消息

**好消息**：理论上，只要能算出 $\Phi$，并行 Jacobi 风格的迭代就能获得 Newton 级收敛。

**坏消息**：$\Phi = -H_{cc}^{-1} H_{ci}$ 需要当前 Hessian $H(x)$ 的逆，而 $H$ 在每帧都变（依赖当前形变）。对百万维系统，每帧分解 $H_{cc}$ 是不可能的——这正是全局 Newton 法一开始被放弃的原因。我们似乎绕回了原点。

---

## 五、积木第四层：共旋子空间——让 $\Phi$ 可预计算

> 这一层把"不可计算的 $\Phi$"变成"可预计算的 $\tilde{\Phi}$"。是工程落地的关键一跳。

### 5.1 关键松动：我们不需要 $\Phi$ 精确

注意 Eq.(6) 里 $\Phi$ 的角色：它出现在阻尼项 $\Phi^T \nabla^2 E_c \, \Phi$ 里，**目的是估计一个合理的阻尼 Hessian 防止过冲**，而不是精确求 $E_c$ 的最小值。

精确 $\Phi$ 保证 $\tilde{\Phi}(x)$ 严格匹配 $\Phi(x)$；但反过来不成立——**即使 $\tilde{\Phi}(x)$ 与 $\Phi(x)$ 不完全对齐，只要 $\tilde{\Phi}^T \nabla^2 E_c \, \tilde{\Phi}$ 合理逼近真阻尼，过冲就被有效抑制**。这给了我们构造替代子空间函数 $\tilde{\Phi}$ 的自由度。

### 5.2 共旋框架

弹性体的一个基本性质：**刚体旋转不改变弹性能**。这意味着我们可以把当前形变"旋回"静止姿态，在静止姿态下预计算 Hessian，再"旋出去"。

具体地，在每个顶点 $j$ 提取局部旋转 $R_j$（对形变梯度做极分解得到）。构造共旋子空间（论文 Eq.14）：

$$
\tilde{\Phi} = R \, \hat{\Phi} \, R^T \tag{14}
$$

其中 $R = \text{diag}(R_1, \dots, R_n)$ 是分块对角的逐顶点旋转矩阵，$\hat{\Phi} = -\hat{H}_{cc}^{-1} \hat{H}_{ci}$ 是用**静止形态 Hessian** $\hat{H}$ 算出的扰动基。

**为什么这可行**：
- $\hat{H}$ 是常量（只依赖网格拓扑和静止形态），$\hat{H}_{cc}^{-1} \hat{H}_{ci}$ 可以**预计算一次**。
- 在每个 Newton 线性化点，$R$ 和 $R^T$ 是当前常量（取决于当前形变），但只是逐顶点的 $3\times3$ 旋转，开销极小。
- 因此 $\tilde{\Phi}$ 在每个 Newton 步都是"线性化的"——可以高效构造，且最贵的部分已预计算。

### 5.3 共旋的物理直觉

共旋的本质是：**材料的"扰动如何传播"主要由其静止拓扑和本构决定，与具体形变姿态关系较弱**。一个刚性材料的局部扰动会传得远、传得全局；一个柔软材料的扰动则更局部、更区域。$\hat{\Phi}$ 捕捉的就是这种材料感知的传播模式，而 $R$ 只是把这种模式"贴"到当前朝向上。

论文强调：几何插值方案（RBF、Green 坐标、样条、球谐）也能做传播，但它们是**几何驱动**的，不反映材料属性；而 $\Phi$ 是**材料感知的形状函数**——这正是它能达到二阶最优、而几何方法不能的原因。

---

## 六、积木第五层：Cubature 采样——让稠密矩阵变稀疏

> 即使用共旋把 $\hat{\Phi}$ 预计算了，运行时构造 $\tilde{\Phi}^T \nabla^2 E_c \, \tilde{\Phi}$ 仍要遍历所有互补 DOF，复杂度 $O(n \cdot m^2)$，对百万维系统仍是灾难。Cubature 是把这步变快的关键。

### 6.1 稠密矩阵的瓶颈

把 $\tilde{\Phi}$ 代入 Eq.(6)，得到局部系统（论文 Eq.15）：

$$
\left( \nabla^2 E_i + \tilde{H}_r \right) \Delta x_i = -\tilde{g}_r \tag{15}
$$

其中约化 Hessian 和梯度力是：

$$
\tilde{H}_r = \tilde{\Phi}^T \nabla^2 E_c \, \tilde{\Phi}, \quad \tilde{g}_r = \tilde{\Phi}^T \nabla E_c \tag{16}
$$

Eq.(15) 是低维（$m \times m$，比如 $3\times3$）的，单个 GPU 线程能解析求解。**但组装它不是**——$\tilde{\Phi}$ 是稠密的，要精确构造 $\tilde{H}_r$ 得遍历所有互补 DOF 并投影 Hessian，复杂度 $O(n \cdot m^2)$，对百万维系统要几天。

### 6.2 Cubature：少量样本逼近全量

Cubature（求积采样）是 [An et al. 2008] 提出的经典技术：预选一小撮**采样元素** $S$ 及其非负权重，用样本的加权和逼近全量约化量（论文 Eq.17）：

$$
\tilde{H}_r \approx \sum_{e \in S} w_e \, \Phi_e^T \nabla^2 E_e \, \Phi_e, \quad \tilde{g}_r \approx \sum_{e \in S} w_e \, \Phi_e^T \nabla E_e
$$

其中 $\Phi_e$ 是元素 $e$ 的子空间矩阵（抽取 $\Phi$ 对应行），$w_e \geq 0$ 是非负权重。

### 6.3 为什么 JGS2 里 Cubature 特别轻

经典降维模拟里 Cubature 训练极贵（NNLS 求解超多项式增长，样本数随子空间规模增长）。但 JGS2 有三重有利条件：

1. **子空间规模小**：每个子问题 $m=3$（一个顶点），所以 $|S| \propto m$——只需**4 到 6 个** Cubature 元素（残差 $<1\%$）。
2. **训练姿态简单**：因为 $\tilde{\Phi}$ 描述的是**扰动**而非大形变，训练姿态只需静止 Hessian $\hat{H}$ 的低频特征向量。
3. **精度要求宽松**：目标是估计合理阻尼防过冲，而非精确最小化 $E_c$。Cubature 梯度的精度不那么关键——稀疏 Cubature 在此"高度有效"。

### 6.4 权重训练

给定训练姿态集 $T$、对应的约化梯度 $\tilde{g}_r^{(1)}, \dots, \tilde{g}_r^{(|T|)}$ 和 Cubature 集 $S$，权重 $w$ 通过 NNLS 求解（论文 Eq.18）：

$$
\min_w \; \left\| \begin{bmatrix} \Phi_{e_1}^{(1)} & \dots & \Phi_{e_{|S|}}^{(1)} \\ \vdots & & \vdots \\ \Phi_{e_1}^{(|T|)} & \dots & \Phi_{e_{|S|}}^{(|T|)} \end{bmatrix} w - \begin{bmatrix} \tilde{g}_r^{(1)} \\ \vdots \\ \tilde{g}_r^{(|T|)} \end{bmatrix} \right\|, \quad w \geq 0
$$

贪心地从非 Cubature 元素里随机候选，挑残差下降最大的加入 $S$，直到达标。这是 [An et al. 2008] 的标准流程。

---

## 七、积木第六层：全坐标预计算——把"几天"压到"几十分钟"

> 上一层的 Cubature 训练本身要为每个子问题分解 $\hat{H}_{cc}$（一个近全规模的矩阵），对百万维系统要几天。这一层把这个瓶颈压三个数量级。

### 7.1 瓶颈定位

预计算 $\hat{\Phi} = -\hat{H}_{cc}^{-1} \hat{H}_{ci}$ 时，$\hat{H}_{cc}$ 是 $(n-m) \times (n-m)$ 的——几乎和全局 $\hat{H}$ 同等规模。对每个子问题都要做一次这样的分解，所有子问题加起来极慢。

### 7.2 观察：$\hat{H}_{cc}$ 大量重叠

虽然 $\hat{H}_{cc}$ 因子（即去掉第 $i$ 个子问题对应的行列）在不同子问题间不同，但**大部分是重叠的**。逐子问题分解是浪费。

### 7.3 全坐标重构

论文把 Eq.(7) 的增量平衡改写成**位置约束**形式（论文 Eq.19-20），用 Lagrange 乘子求解：

$$
\begin{bmatrix} \hat{H} & J^T \\ J & 0 \end{bmatrix}
\begin{bmatrix} \delta \\ \lambda \end{bmatrix} =
\begin{bmatrix} 0 \\ e_i \end{bmatrix} \tag{20}
$$

其中 $e_i$ 是单位向量（第 $i$ 个分量为 1），$J$ 是约束 Jacobian，$\lambda$ 是乘子。

**关键**：左上块 $\hat{H}$ 对所有子问题**不变**。用分块矩阵求逆（论文 Eq.21-22），$\hat{H}$ 只需分解**一次**，被所有子问题复用。$\hat{H}^{-1}$ 通过 Schur 补 $S = -J \hat{H}^{-1} J^T$（小矩阵）一次算出。

### 7.4 收益

预计算一个子问题现在只需 $\hat{H}$ 的 2 次前代/回代，对所有子问题可平凡并行。**预计算时间从"几天"降到"几十分钟"**——三个数量级的提升。这是让 JGS2 在工业级网格（数百万单元）上可行的工程关键。

---

## 八、积木第七层：与碰撞处理的兼容——IPC

> 弹性体不能不碰东西。JGS2 要和主流碰撞方法兼容。

### 8.1 IPC 简介

增量势接触（Incremental Potential Contact, IPC, [Li et al. 2020]）是内点法的原始实现，在每个表面图元对 $(a, \bar{a})$ 上注入对数障碍能（论文 Eq.24）：

$$
B(d, \hat{d}) = -\kappa (d - \hat{d})^2 \log\frac{d}{\hat{d}}, \quad 0 < d < \hat{d}
$$

$\hat{d}$ 是容差，$d\to0$ 时 $B\to+\infty$，把碰撞对推开。IPC 提供非线性惩罚，是当前最鲁棒的无穿透方法之一。

### 8.2 JGS2 如何接入

JGS2 从**优化视角**改进收敛，只要碰撞解析能写成无约束优化形式就能接入。关键适配：当模型 $A$ 上顶点 $v$ 与模型 $B$ 接触时，$v$ 不仅关乎 $A$ 的总能，也影响 $B$ 的能——$A$ 与 $B$ 通过接触点双向耦合。

子空间基在 $v$ 处的值已预计算。$B$ 上的 $\Phi$ 值通过假设"$B$ 上所有碰撞顶点与 $v$ 有相同扰动"来近似——这假设 IPC/接触罚函数远比弹性刚度刚，子问题内扰动变化可忽略。

**结果**：JGS2 与 IPC 和隐式罚函数都兼容，对刚性和软性材料都达二阶收敛（见实验）。

---

## 九、积木第八层：算法全貌与并行实现

> 把前七层拼起来，看 JGS2 的完整流程和 GPU 实现。

### 9.1 完整流程

1. **预计算（离线，一次性）**
   - 分解静止 Hessian $\hat{H}$（一次）。
   - 对每个子问题，用全坐标公式（Eq.20-22）算 $\hat{\Phi}$——只需 $\hat{H}$ 的前代/回代，并行。
   - Cubature 训练：选训练姿态（$\hat{H}$ 低频特征向量），NNLS 求权重，每子问题 4-6 个样本。

2. **每帧运行时**
   - 对每个顶点子问题（并行）：提取局部旋转 $R_j$，构造共旋 $\tilde{\Phi} = R \hat{\Phi} R^T$。
   - 用 Cubature 样本组装约化 Hessian $\tilde{H}_r$ 和梯度 $\tilde{g}_r$（Eq.17）。
   - 解 $3\times3$ 局部系统 $(\nabla^2 E_i + \tilde{H}_r)\Delta x_i = -(\nabla E_i + \tilde{g}_r)$（解析）。
   - Jacobi：所有子问题一轮解完即一轮迭代。GS：图着色分组，组内并行。

### 9.2 并行实现要点

- **子问题=顶点**：$m=3$，局部 Newton 系统是 $3\times3$，可**解析求解**（无需数值分解）。
- **正定性无忧**：局部系统被 $\tilde{H}_r$ 正则化（Cubature 在多个远程元素采样），实践中**总是良态**。
- **Jacobi vs GS 差异可忽略**：因为局部解已近二阶最优，放大子问题不再明显改善收敛——选更轻的 Jacobi 即可。GS 时把组内所有子问题当广义子问题，预计算 $\tilde{\Phi}$，组内 Hessian 分块对角，预计算开销和 Jacobi 一样轻。
- **收敛判据**：归一化到单位立方体，用相邻迭代位置变化 $\|x^{k+1} - x^k\|$ 作统一度量。

---

## 十、实验：50× 到 100× 的收敛提速

> 论文在 11 个场景上验证，从柔软到极刚、从单一弹性体到含 IPC 碰撞的复杂交互。所有弹性体实验用 Stable Neo-Hookean [Smith et al. 2018]；布料用 StVK + 二次弯曲。

### 10.1 过冲量化（Fig.2）

悬臂梁一端固定、重力下垂，$h=1/100$，全局 Newton 解作参考。比较 XPBD、PD、VBD、2nd SD、JGS2 的相对误差 $\|x - x^\star\|$ 随迭代数变化：

| 方法 | 20 次迭代后误差 | 达 $10^{-3}$ 所需迭代 |
|---|---|---|
| XPBD / PD / VBD | 几乎不动 | $>500$ |
| 2nd SD | 略好 | 显著但仍慢 |
| **JGS2** | 已近 $10^{-3}$ | **3** |

JGS2 三次迭代抵得上其它方法 500 次。单次迭代因 Cubature 额外计算略贵于 VBD/XPBD，但总体仍**快 50×**。

### 10.2 大规模场景统计（Table 1）

| 场景 | 单元数 | DOF | Cubature | 时间步 | 并行 | 碰撞 | 迭代数 | 预计算 | 单步 | 加速比 |
|---|---|---|---|---|---|---|---|---|---|---|
| 河豚球（Fig.1） | 3.5M | 4.4M | 4 | 1/120 | GS | 罚 | 55 | 37 min | 855 ms | 122× |
| 坠落阿玛迪罗（Fig.4） | 6M | 3.6M | 4 | 1/150 | Jacobi | 罚 | 58 | 52 min | 883 ms | 78× |
| 纸牌屋（Fig.5） | 394K | 372K | 4 | 1/50 | Jacobi | IPC | 23 | 1 min | 31 ms | 120× |
| 龙（Fig.6） | 100K | 80K | 6 | 1/100 | Jacobi | 罚 | 9 | 7 min | 7.3 ms | 32× |
| 字母软（Fig.7） | 2.1M | 1.7M | 6 | 1/120 | GS | 罚 | 27 | 37 min | 176 ms | 43× |
| 野蛮人船（Fig.8） | 2.5M | 2.1M | 4 | 1/120 | Jacobi | 罚 | 34 | 45 min | 333 ms | 153× |
| 杰克南瓜（Fig.9） | 6.7M | 5.7M | 4 | 1/120 | GS | 罚 | 32 | 4 min | 753 ms | 40× |
| 挤压河豚（Fig.10） | 1.3M | 0.9M | 6 | 1/150 | Jacobi | 罚 | 69 | 67 min | 290 ms | 173× |
| 仙人掌（Fig.11） | 1.2M | 1M | 4 | 1/150 | Jacobi | IPC | 40 | 18 min | 171 ms | 82× |
| 动物穿行（Fig.12） | 4.8M | 4.5M | 4 | 1/150 | GS | IPC | 43 | 10 min | 684 ms | 136× |
| 布料（Fig.13） | 2M | 3M | 4 | 1/120 | Jacobi | IPC | 42 | 48 min | 469 ms | 103× |

**观察**：
- 加速比 32×–173×，河豚球软体场景达 122×（VBD 在该时间步直接不收敛）。
- 刚性材料优势更显著：河豚球挤压场景 173×，野蛮人船 153×——刚性场景过冲更严重，JGS2 收益更大。
- 单步迭代数 9–69，与全局 Newton（34 次/步）同量级，远低于 VBD（2264 次/步）。
- 预计算 1–67 分钟，最大规模 6.7M 单元仅 4 分钟——全坐标公式让预计算工业可接受。

### 10.3 与 Projected Newton 的对比（Fig.4）

6M 单元、3.6M DOF 的阿玛迪罗坠落：Projected Newton 平均 34 次/步，JGS2 58 次/步（略多）。但 JGS2 单步仅 883 ms（Projected Newton 远高于此），整体**快约一个数量级**。这是"每步略多迭代 + 单步极廉价"的典型并行优势。

### 10.4 实时模拟

对 100K 单元的龙场景，$h=1/100$，9 次/步，每步 7.3 ms——**实时可行**。

---

## 十一、局限与未来工作

JGS2 的二阶收敛依赖全局 $E$ 的二次近似质量（即 Newton 近似 Eq.2 是否合适）。当优化涉及**高度非线性项**（如 IPC 障碍函数接近 $d\to0$ 时），二次近似失效，JGS2 不再二次收敛，需引入线搜索。好在线搜索可并行化（论文有讨论）。

主要工程局限是共旋基的 Cubature 预计算仍偏慢，对极大模型不便。未来可探索更快的子空间训练或在线学习。

---

## 十二、总结：积木如何拼成 JGS2

回顾我们从第一层到第八层搭起的整座大厦：

1. **基础**（§1-2）：GPU 弹性体要解百万维非线性优化。全局 Newton 二阶收敛但无法并行；Jacobi/GS 可并行但一阶收敛且饱受过冲。
2. **问题诊断**（§3）：过冲——局部最优反害全局。被忽视的收敛杀手。
3. **理论解**（§4）：引入扰动传播 $\Phi$，让局部更新 = 全局 Newton 投影，达二阶最优。但 $\Phi$ 需当前 Hessian 逆，不可计算。
4. **工程解一**（§5）：共旋子空间 $\tilde{\Phi} = R\hat{\Phi}R^T$，把不可计算变成可预计算。
5. **工程解二**（§6）：Cubature 采样，把稠密组装变稀疏，每子问题 4-6 样本。
6. **工程解三**（§7）：全坐标预计算，$\hat{H}$ 分解一次复用，预计算时间降三个数量级。
7. **碰撞兼容**（§8）：与 IPC/罚函数兼容，刚软材料皆二阶收敛。
8. **完整算法**（§9）：预计算 + 每帧共旋 + Cubature 组装 + $3\times3$ 解析局部解，Jacobi/GS 任选。
9. **验证**（§10）：50×–100× 加速，刚性场景 173×，6.7M 单元实时。

**JGS2 的哲学**：并行性和收敛性不是天然对立的——对立的根源是"局部求解器缺乏全局信息"。一旦用扰动子空间 $\Phi$ 把全局信息注入局部解，并行 Jacobi 的结构就能承载 Newton 级的收敛。这是"分治"与"全局最优"和解的范式。

---

## 附：关键符号速查

| 符号 | 含义 |
|---|---|
| $x \in \mathbb{R}^n$ | 全局顶点坐标拼接，$n$ 为系统规模 |
| $E(x) = E_{\text{inertia}} + W(x)$ | 变分能量：惯性势 + 弹性势 |
| $y$ | 惯性项的已知向量（由上一帧位置/速度/外力决定） |
| $g = \nabla E$ | 能量梯度 |
| $H = \nabla^2 E$ | 能量 Hessian |
| $x_i \in \mathbb{R}^m$ | 第 $i$ 个子问题的局部 DOF（实现中 $m=3$，一顶点） |
| $x_c$ | 互补 DOF（除 $x_i$ 外所有 DOF） |
| $\Phi = \partial x_c / \partial x_i$ | 扰动传播雅可比 |
| $\hat{\Phi} = -\hat{H}_{cc}^{-1}\hat{H}_{ci}$ | 静止形态下的扰动基 |
| $\tilde{\Phi} = R\hat{\Phi}R^T$ | 共旋扰动子空间 |
| $\tilde{H}_r, \tilde{g}_r$ | 约化 Hessian / 梯度力（Cubature 逼近） |
| $S$ | Cubature 样本集，$|S| \approx 4\text{-}6$ |
| $R_j$ | 顶点 $j$ 的局部旋转（极分解） |
| $\hat{H}$ | 静止形态 Hessian（常量，预计算） |
| $\Delta x_i^\star$ | 二阶最优局部更新（= 全局 Newton 投影） |

---

## 参考资料

- 论文：Lei Lan, Zixuan Lu, Chun Yuan, Weiwei Xu, Hao Su, Huamin Wang, Chenfanfu Jiang, Yin Yang. *JGS2: Near Second-order Converging Jacobi/Gauss-Seidel for GPU Elastodynamics*. ACM Transactions on Graphics, 2025. arXiv:2506.06494.
- Cubature 方法：An, S. S., Kim, T., & James, D. L. (2008). *Optimizing Cubature for efficient decomposition of large deformation simulation*. SCA.
- IPC：Li, M., et al. (2020). *Incremental Potential Contact: Intersection-and Inversion-free Large-deformation Dynamics*. ACM TOG (SIGGRAPH).
- 共旋材料 / Stiffness Warping：Müller, M., et al. (2002). *Stable real-time deformations*. SCA.
- Stable Neo-Hookean：Smith, B., et al. (2018). *Stable Neo-Hookean Flesh Simulation*. ACM TOG.
- 迭代求解基础：[本站：线性方程组迭代求解的数学原理详解](/knowledge/iterative-linear-solvers/)
