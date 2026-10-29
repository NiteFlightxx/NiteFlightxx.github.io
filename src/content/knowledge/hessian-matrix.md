---
title: 二阶近似与 Hessian 矩阵
excerpt: 通过局部二次模型理解曲率、正定性与 Newton 步，以及线性求解的作用。
date: '2026-06-29'
category: Mathematics
subtopic: Calculus
tags:
  - 数学
  - 微积分
  - 最优化
  - 海森矩阵
  - 牛顿法
readTime: 阅读约5分钟
kind: theory
level: intermediate
pageType: guide
aliases:
  - 海森矩阵详解 — 从二阶导数到曲率、极值判定与牛顿法的统一框架
prerequisites:
  - calculus-foundations
  - jacobian-matrix
nextArticles:
  - iterative-linear-solvers
related: []
sources:
  - title: Boyd and Vandenberghe — Convex Optimization
    url: 'https://web.stanford.edu/~boyd/cvxbook/'
---
梯度描述一阶变化，Hessian 描述梯度如何随位置变化。它决定局部二次模型的曲率，却不能单独保证算法从任意初值收敛。本文负责 Hessian、正定性、Newton 与近似曲率的共同语言；[线性迭代](/knowledge/iterative-linear-solvers/)负责子问题求解，[VBD/AVBD](/knowledge/vbd-avbd-math/)负责材料和局部块装配。

## 输入、导数与局部二次模型

设 $f:\mathbb R^n\to\mathbb R$，采用列向量，梯度 $g=\nabla f\in\mathbb R^n$，Hessian 为

$$
H_{ij}=\frac{\partial^2f}{\partial x_i\partial x_j},\qquad
H=J_{\nabla f}.
$$

当二阶偏导连续时，混合偏导可交换，$H=H^T$。非光滑函数在切换处可能不存在普通 Hessian；自动微分返回某个分支的导数，不等于那里已满足光滑假设。

对小扰动 $s$，

$$
f(x+s)=f(x)+g^Ts+\tfrac12s^THs+o(\|s\|^2).
$$

若局部 Hessian 还满足适当 Lipschitz 条件，可进一步给出三阶余项界。二次模型只在相应邻域内近似原函数。

## 同一个二次算例

取

$$
f(x,y)=\tfrac12(4x^2+2xy+3y^2)-9x-8y,
$$

$$
g=\begin{bmatrix}4x+y-9\\x+3y-8\end{bmatrix},\qquad
H=\begin{bmatrix}4&1\\1&3\end{bmatrix}.
$$

$H$ 的特征值为 $(7\pm\sqrt5)/2$，均为正，因此该二次函数有唯一极小点 $(19/11,23/11)$。这与[线性迭代的比较系统](/knowledge/iterative-linear-solvers/)一致。

在这个**精确二次且 SPD** 的例子中，完整 Newton 解 $Hs=-g$ 后取单位步长，从任意初值一步到极小点。一般非线性函数不具有这个一步性质。

## 曲率、驻点与凸性

### 二次型与特征方向

对单位方向 $d$，$d^THd$ 是沿该方向的局部二阶变化率。正定表示各方向曲率为正；负定表示均为负；不定表示同时存在正负曲率。

在驻点 $g=0$：$H\succ0$ 足以说明严格局部极小；$H\prec0$ 足以说明严格局部极大；$H$ 不定说明鞍点。半正定时，仅靠二阶判据通常不能决定，例如 $x^4$ 与 $-x^4$ 在零点的二阶导均为零。

### 局部正定与全域凸性

在凸定义域上，二阶可微函数的凸性可由处处 $H\succeq0$ 刻画；处处 $H\succ0$ 是严格凸的充分条件，但不是必要条件，$x^4$ 就是反例。

严格凸函数至多有一个极小点，却不保证一定取得最小值。例如 $e^x$ 严格凸，在整个实数域上没有达到的极小点。强凸与适当定义域条件能提供更强的存在性和误差控制。

给 Hessian 加 $\mu I$ 会抬高特征值；只有 $\mu$ 足以抵消负曲率时才能保证正定。不能说任意 L2 正则都会把任意非凸函数变成凸函数。

## 梯度下降与步长

梯度下降取 $x_{k+1}=x_k-\eta g_k$。对于 SPD 二次函数，误差传播为

$$
e_{k+1}=(I-\eta H)e_k.
$$

因此收敛要求 $0<\eta<2/\lambda_{\max}(H)$。条件数大时，不同方向尺度差异使固定步长难以同时快速推进。一般函数需要相应梯度光滑性、下界和步长条件，不能从“方向是负梯度”直接推出全局收敛。

这个解释展示 Hessian 的作用，不把所有一阶优化器都归为同一个收敛率。

## Newton：曲率修正与线性子问题

### 方向与局部收敛

令二次模型梯度为零，得到 $Hs=-g$，然后 $x_{k+1}=x_k+s$。实现应解线性系统，而不是先构造完整逆矩阵。

在极小点附近，若 Hessian 非奇异、变化足够规则，且初值和线性子问题精度满足相应条件，Newton 可局部二次收敛。远离该邻域时，单位步长可能增大目标；Hessian 不定时，Newton 方向甚至不一定下降。

### 阻尼、线搜索与信赖域

阻尼 Newton 取 $x_{k+1}=x_k+\alpha s$，用线搜索选 $\alpha$。若 $g^Ts\ge0$，单纯缩短这个方向未必解决问题，应处理曲率或换下降方向。

修改 Hessian 可采用 $H+\mu I$ 或具有明确规则的特征值修正；信赖域则约束局部步长，并根据模型预测与实际下降调整区域。它们改变的是方向或步的接受方式，不是无条件的稳定开关。

### 非精确求解与局部块

大型 Newton 常通过矩阵向量算子近似解线性子问题。内层求解精度影响外层收敛；把内部 CG 固定为一两轮，不能继续声称保持精确 Newton 的收敛性质。

顶点块 Newton 只处理 $H_{ii}$，其他块的耦合由后续迭代传播。即使每个局部块都精确求解，整轮也不等于完整全局 Newton。具体装配见[VBD/AVBD](/knowledge/vbd-avbd-math/)。

## Gauss–Newton 与拟 Newton

### 最小二乘的 Hessian

对 $f(x)=\tfrac12\|r(x)\|^2$，$J=\partial r/\partial x$，

$$
g=J^Tr,\qquad H=J^TJ+\sum_i r_i\nabla^2r_i.
$$

Gauss–Newton 省略残差加权的二阶项，适合残差较小或该项影响较弱的情况。$J^TJ$ 半正定，但列相关时会奇异；阻尼或正则化需要明确尺度。

### BFGS 与 L-BFGS

拟 Newton 用梯度差近似曲率。令 $s_k=x_{k+1}-x_k$、$y_k=g_{k+1}-g_k$，割线条件为 $B_{k+1}s_k=y_k$。BFGS 的 Hessian 近似更新为

$$
B_{k+1}=B_k-\frac{B_ks_ks_k^TB_k}{s_k^TB_ks_k}
 +\frac{y_ky_k^T}{y_k^Ts_k}.
$$

在 $B_k\succ0$ 且 $y_k^Ts_k>0$ 时可保持正定；线搜索、阻尼或跳过不合格更新用于处理曲率条件。L-BFGS 只保存有限组 $(s,y)$，以递推应用逆近似，存储约为 $O(mn)$。

这些是独立的优化方法，不应把 BFGS 简称为“无需条件的 Newton 替代”。本文给出定义和边界，不提供完整优化器实现。

## 物理中的刚度与模态

保守内力为 $f_{int}=-\nabla U$，因此力 Jacobian 为 $\partial f_{int}/\partial x=-\nabla^2U$。若把 $K$ 定义为势能 Hessian，则 $K=\nabla^2U$；某些代码使用相反符号，必须先确认约定。

小振动线性化得到 $M\ddot u+Ku=0$，模态满足 $K\phi=\omega^2M\phi$。频率来自质量加权的广义特征值问题，不能仅将 $K$ 的特征值直接开方而忽略质量与边界。

## 导数检查、量纲与继续阅读

有限差分可用

$$
g_i\approx\frac{f(x+\varepsilon e_i)-f(x-\varepsilon e_i)}{2\varepsilon},\qquad
Hd\approx\frac{g(x+\varepsilon d)-g(x-\varepsilon d)}{2\varepsilon}.
$$

选多个步长区分截断和舍入误差，避开非光滑切换；还要核对 $d^THd$、对称性和代码使用的是力还是梯度。不同单位的变量需要缩放，否则数值条件和正则参数难以解释。

本文不将二次算例的性质推广为任意物理或优化系统的运行保证。导数映射见[Jacobian](/knowledge/jacobian-matrix/)，线性子问题见[迭代求解](/knowledge/iterative-linear-solvers/)，材料与约束的局部导数见[VBD/AVBD](/knowledge/vbd-avbd-math/)。凸性判据可对照 [Boyd 与 Vandenberghe《Convex Optimization》](https://web.stanford.edu/~boyd/cvxbook/)中的二阶条件。
