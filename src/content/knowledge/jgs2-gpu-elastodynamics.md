---
title: JGS2：GPU 弹性体迭代求解
excerpt: 围绕论文中的过冲、局部更新和 GPU 并行，分析方法假设与预计算边界。
date: '2026-07-06'
category: Physics
subtopic: ConstraintSolver
tags:
  - JGS2
  - GPU
  - 弹性体
  - 数值优化
  - 迭代求解
  - SIGGRAPH
readTime: 阅读约10分钟
kind: algorithm
level: advanced
pageType: guide
aliases:
  - JGS2 的数学与物理原理详解 — 从雅可比过冲到 GPU 上的近二阶收敛弹性体求解
prerequisites:
  - vbd-avbd-math
  - iterative-linear-solvers
nextArticles: []
related: [deformable-body-dynamics, continuum-mechanics]
sources:
  - title: JGS2 — arXiv v1 full text
    url: 'https://arxiv.org/html/2506.06494v1'
---
JGS2 研究如何让并行局部更新考虑全局弹性耦合，从而减少过冲并改善收敛。本文是论文解析，依据 [arXiv:2506.06494v1](https://arxiv.org/html/2506.06494v1)，不表示 UE 或 GPUPhysicsLab 已实现该方法。线性迭代背景见[迭代求解](/knowledge/iterative-linear-solvers/)，顶点块背景见[VBD/AVBD](/knowledge/vbd-avbd-math/)。

## 原问题与时间步约定

设 $x\in\mathbb R^N$ 为全部位置自由度，$M$ 为质量矩阵，$h$ 为子步长度。隐式 Euler 的变分目标可写成

$$
E(x)=\frac{1}{2h^2}(x-y)^TM(x-y)+W(x),\qquad
y=x^n+hv^n+h^2M^{-1}f_{ext}.
$$

$W$ 是弹性势能，$f_{ext}$ 是本步冻结的外力。预测式中必须使用逆质量，不能以 $h^{-1}f_{ext}$ 代替加速度项。时间步 $n$ 与非线性迭代 $k$ 分别编号。

在迭代点 $x^k$，局部二次模型为

$$
E(x^k+\delta x)\approx E(x^k)+g^T\delta x+\tfrac12\delta x^TH\delta x.
$$

Newton 方向满足 $H\delta x=-g$。二次模型有唯一极小点需要相应正定性；Newton 的局部二次收敛还需要邻域、正则性和足够准确的线性求解，不能只由写出 Hessian 得出。

## 局部更新为什么会过冲

Jacobi 从相同旧状态并行求各局部问题，再归并更新；GS 使用已更新状态，图着色允许互不耦合的局部问题并行。具体局部能量拆分、共享自由度和归并方式决定实际迭代。

局部问题的下降不必等于全局目标下降：它可能没有计入本次更新对其他区域造成的能量变化。论文将过于激进的局部放松称为 overshoot，将不足的局部修正称为 undershoot。全局线搜索可以监测目标变化，却有额外归约和评估成本。

JGS2 的方向是构造材料感知的扰动子空间，让局部模型包含一部分全局响应；它不是给所有局部方向乘一个固定阻尼系数。

## 理想扰动子空间与 Newton 分块

### 单位扰动的传播

把当前 Hessian 的自由度分成局部 $i$ 和互补 $c$，局部维度为 $m$。施加局部单位扰动、令互补部分维持增量平衡：

$$
\begin{bmatrix}H_{ii}&H_{ic}\\H_{ci}&H_{cc}\end{bmatrix}
\begin{bmatrix}I_m\\U_c\end{bmatrix}
=\begin{bmatrix}\delta F_i\\0\end{bmatrix}.
$$

下半行给出

$$
U_c=-H_{cc}^{-1}H_{ci},\qquad
T_i=\begin{bmatrix}I_m\\U_c\end{bmatrix},\qquad
\delta x=T_i\delta x_i.
$$

$U_c\in\mathbb R^{(N-m)\times m}$，$T_i\in\mathbb R^{N\times m}$。单位块在局部自由度处，互补响应在下方，右端上块是所需虚拟力；不能交换单位块与响应块后仍沿用同一公式。

### 与全局 Newton 步的关系

从完整 Newton 方程的互补行消元，

$$
\delta x_c=-H_{cc}^{-1}(g_c+H_{ci}\delta x_i).
$$

代回局部行得

$$
S_i\delta x_i=-g_i+H_{ic}H_{cc}^{-1}g_c,\qquad
S_i=H_{ii}-H_{ic}H_{cc}^{-1}H_{ci}.
$$

这里 $S_i$ 是 Schur 补。对称 Hessian 下，理想基满足

$$
T_i^THT_i=S_i,\qquad
T_i^Tg=g_i-H_{ic}H_{cc}^{-1}g_c.
$$

因此在理想的冻结二次模型中，解这个局部降维系统可以恢复全局 Newton 步的对应分量。这说明了全局信息的作用，不等于任意近似基和并行排程都严格等价于一次 Newton。

### 二阶最优与实际收敛

论文的理想构造依赖当前 Hessian，而当前 Hessian 随形变变化。每次为每个局部问题重新解大型互补系统，会失去局部求解的效率。

“二阶最优”描述理想模型上的更新性质；“近二阶收敛”描述实际近似及论文实验中的行为。两者需要分别陈述，不能从前者推出任何接触、反转或材料情况下都二次收敛。

## 共旋近似与预计算

论文在参考构型建立扰动信息，再用当前局部旋转变换到现构型。对互补响应，可用维度明确的示意式理解：

$$
\widetilde U_c=R_c\widehat U_cR_i^T.
$$

$R_c$ 是互补自由度上的旋转块，$R_i$ 是局部自由度上的旋转块；不能把一个 $N\times N$ 的旋转矩阵同时乘到矩形 $U_c$ 两侧而不核对维度。

共旋近似利用刚体旋转下材料响应的结构，但大应变不只是旋转。材料、网格拓扑、质量、边界、时间步或参考状态变化，都可能改变有效算子，需要核对预计算能否复用。刚体旋转不改变客观材料能量，并不证明所有形变下 Hessian 都由静止 Hessian 旋转得到。

## Cubature 与全坐标预计算

即使基已经可复用，运行时遍历全部互补能量来组装局部响应仍可能昂贵。Cubature 用少量有权重的样本近似整体贡献，降低每个局部问题的装配成本。采样集合、权重拟合和训练状态都属于方法的一部分。

样本减少的是求和成本，不是把原物体物理自由度全部删去。样本数量与误差的关系需要按材料和形变分布衡量，不能把单个实验中的数量当成通用常数。

论文进一步使用 full-coordinate formulation 改善预计算效率。预计算耗时、存储、运行迭代和总体收敛应分别比较；在线步更快并不意味着离线成本可以忽略。

## 接触、并行执行与算法轮廓

论文讨论了与 IPC 的结合。障碍势的非线性、碰撞检测和安全步长仍有独立职责，预计算弹性响应不能替代碰撞可行性维护。

~~~text
离线：固定模型与参数，构建参考扰动信息和采样数据
每个时间步：
  建立惯性预测与初值
  更新当前几何、局部旋转和接触信息
  按论文方案组装近似局部模型
  以 Jacobi 或相应 GS 排程求局部更新
  归并并检查目标、可行性与停止条件
  提交状态并重建速度
~~~

这是职责轮廓，不是论文全部细节或可直接运行的实现。色间依赖、归约、接触搜索、内存访问和预计算数据布局都需要单独设计。

## 论文结果怎样使用

论文报告相对所比较 GPU 方法约 $50$–$100$ 倍的收敛改善；该数值属于论文场景、误差标准、硬件与实现组合，不能直接解释为本项目帧率提升同样倍数。

复现实验至少要固定网格、材料、质量、子步、接触、初值和误差阈值，并记录离线时间、内存、单轮耗时与达到同一误差的总时间。引用表格时应指明原表或原图，而不是重新编造没有测量依据的横向性能表。

本文未运行 JGS2 实现。这里对错误维度、惯性预测和过强收敛表述作了整理，不能据此宣称完成论文数值复现。

## 来源与继续阅读

[论文 v1 全文](https://arxiv.org/html/2506.06494v1)的 §4 对应理想子空间及共旋近似，§5–6 对应 Cubature 和预计算，§7–8 对应接触与实验。Newton 的条件见[Hessian](/knowledge/hessian-matrix/)，局部块方法见[VBD/AVBD](/knowledge/vbd-avbd-math/)。[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)是另一份工程实现分析，不能由本文推断它已经采用 JGS2。
