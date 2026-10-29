---
title: 变分物理求解：VBD 与 AVBD
excerpt: 从离散时间步的优化目标理解分块下降，再分析增广拉格朗日与原对偶更新。
date: '2026-06-30'
category: Physics
subtopic: ConstraintSolver
tags:
  - 物理
  - VBD
  - AVBD
  - 约束求解
  - 变分积分
  - 增广拉格朗日
readTime: 阅读约10分钟
kind: algorithm
level: advanced
pageType: guide
aliases:
  - VBD 与 AVBD 详解 — 从变分隐式积分到块坐标下降与增广拉格朗日的统一框架
prerequisites:
  - pbd-xpbd-math
  - physics_constraints_deep_dive
  - iterative-linear-solvers
nextArticles:
  - avbd-demo3d-implementation
  - position-based-elastic-rods
related: ["pbd-xpbd-vbd-avbd-comparison"]
topics:
  - id: ue-chaos-physics
    stage: constraint
    role: algorithm
    order: 30
sources:
  - title: Vertex Block Descent — author project
    url: 'https://ankachan.github.io/Projects/VertexBlockDescent/index.html'
  - title: Augmented Vertex Block Descent — Utah Graphics
    url: 'https://graphics.cs.utah.edu/research/projects/avbd/'
---
VBD 将隐式时间步写成能量最小化，再按顶点分块更新；AVBD 引入增广拉格朗日机制，改善硬约束及大刚度比下的求解。本文解释目标、导数、局部块和乘子，具体刚体实现见[avbd-demo3d](/knowledge/avbd-demo3d-implementation/)，GPU 排程见[three-avbd](/knowledge/three-avbd-gpu-solver/)与[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)。

与 PBD、XPBD 的统一符号、同参数算例、乘子生命周期及选型区别，统一见[四种位置求解方法对比](/knowledge/pbd-xpbd-vbd-avbd-comparison/)。

## 时间步、模型与符号

设 $x\in\mathbb R^{3N}$ 为粒子位置，$M$ 为常量质量矩阵，$h>0$ 为子步长度，$n$ 是时间步编号，$k$ 是步内迭代编号。对在本步冻结的外力定义惯性预测

$$
y=x^n+hv^n+h^2M^{-1}f_{ext}.
$$

若内力由势能 $U(x)$ 给出，隐式 Euler 的位置平衡为

$$
\frac{M}{h^2}(x-y)+\nabla U(x)=0.
$$

它对应目标

$$
\Phi(x)=\frac{1}{2h^2}(x-y)^TM(x-y)+U(x).
$$

惯性项与势能均具有能量量纲。已经进入 $y$ 的恒定重力不能再次作为势能加入 $U$；也可以令 $y=x^n+hv^n$ 并在 $U$ 中包含重力势，但两种约定不能重复使用。一般速度相关或非保守力需要另外离散，不能直接声称都存在同一位置势能。

## VBD 的顶点块与局部步

### 块的归属

一个标准粒子 VBD 块是**一个顶点的三个位置自由度**。更新顶点 $i$ 时，固定其他顶点，收集所有涉及 $i$ 的能量项。一个弹簧可能贡献给两个不同的顶点块，但弹簧本身不是标准 VBD 的更新块。

若 $U=\sum_eU_e$，局部梯度和 Hessian 为

$$
g_i=\frac{m_i}{h^2}(x_i-y_i)+\sum_{e\ni i}\nabla_iU_e,
$$

$$
H_{ii}=\frac{m_i}{h^2}I+\sum_{e\ni i}\nabla_i^2U_e.
$$

一个 Newton 候选方向通过解 $H_{ii}\Delta x_i=-g_i$ 得到。实现通常采用小矩阵分解，而不是先显式求逆。

### 顺序更新、着色与下降

逐顶点立即写回形成非线性块 GS。图着色将不存在能量耦合的顶点放进同一颜色，色内并行、色间顺序。图必须覆盖实际能量连接；碰撞生成新耦合时需要更新相关排程。

精确最小化一个块会使目标不增，但“一次 Newton 候选”并不自动等于精确块最小化。非正定 Hessian、步长过大和非线性接触都可能破坏下降，需要与具体算法一致的曲率处理、步长控制或回退。

惯性正对角项能改善局部系统，却不能保证任意大负材料曲率下的 Hessian 始终正定。所谓稳定性必须带有材料、步长、局部求解与能量处理的假设。

## 能量项的梯度与 Hessian

### 标量罚约束

对 $U_e=\tfrac12\kappa C(x)^2$，

$$
\nabla_iU_e=\kappa C\nabla_iC,
$$

$$
\nabla_i^2U_e=\kappa\left(\nabla_iC\nabla_iC^T+C\nabla_i^2C\right).
$$

第一项是 Gauss–Newton 型外积，第二项是几何曲率。省略第二项会改变局部模型，可能改善正定性，但不能再标作精确 Hessian。

### 距离弹簧

取 $d=x_i-x_j,\ell=\|d\|,n=d/\ell,C=\ell-\ell_0$，则

$$
\nabla_iU_e=\kappa(\ell-\ell_0)n,
$$

$$
H_{ii}^{e}=\kappa\left[nn^T+\frac{\ell-\ell_0}{\ell}(I-nn^T)\right].
$$

拉伸时切向曲率为正，压缩时可能为负。$\ell=0$ 时方向不可定义，必须处理退化。力为负梯度，组装时不能把力符号直接当成梯度符号。

### 体积、弯曲与有限元

距离和体积约束的几何梯度见[PBD/XPBD](/knowledge/pbd-xpbd-math/)。在 VBD 中，需要进一步按能量链式法则组装导数，不能只把投影公式换成矩阵求逆。

有限元常以单元形变梯度 $F=D_sD_m^{-1}$ 和 $U_e=V_0\psi(F)$ 建模，再通过 $F$ 对顶点的导数计算局部块。静止体积、材料参数、单元定向、压缩或反转时的本构定义都参与数值行为；顶点局部求解不能替代这些模型约定。

## 一次 VBD 子步

~~~text
建立惯性预测 y，并初始化候选位置 x
准备质量、单元邻接和有效着色
对每轮块迭代：
  对每种颜色：
    并行遍历该色顶点 i
    组装惯性项和所有相邻能量项的 g_i、H_ii
    以声明的曲率与退化策略解局部系统
    检查并接受局部更新
根据当前步目标或残差判断停止
提交位置，并按时间离散重建速度
~~~

初值可以采用预测位置、上一状态或经过分析的外推。初值改变求解路径和迭代成本，但不能把未收敛结果自动解释为同一隐式 Euler 解。

速度重建 $v^{n+1}=(x^{n+1}-x^n)/h$ 后，阻尼、接触速度级处理与额外力必须保持明确顺序。

## AVBD 的增广拉格朗日机制

### 硬约束为什么不宜只放大罚参数

用 $\kappa C^2/2$ 逼近硬约束时，较小 $\kappa$ 允许明显偏差；无限增大 $\kappa$ 会放大尺度差异，使局部传播与全局收敛恶化。硬约束 $C=0$ 与一个非常硬但有限的材料项不是同一个模型。

为解释 AVBD 的机制，考虑等式约束的增广目标

$$
\mathcal L_\rho(x,\lambda)=\Phi_0(x)+\sum_j\lambda_jC_j(x)
 +\frac12\sum_j\rho_jC_j(x)^2.
$$

$\Phi_0$ 含惯性和非约束能量，$\lambda$ 为对偶变量，$\rho$ 为有限罚参数。这里使用能量形式的乘子；它与 XPBD 位置层乘子的单位和缩放约定不同。

### 原问题与对偶更新

固定 $\lambda,\rho$，先按顶点或刚体块近似最小化原问题。约束对当前块贡献

$$
g_i^C=(\lambda+\rho C)\nabla_iC,
$$

$$
H_{ii}^C=\rho\nabla_iC\nabla_iC^T+(\lambda+\rho C)\nabla_i^2C.
$$

等式约束的基本对偶递推为

$$
\lambda\leftarrow\lambda+\rho C(x).
$$

乘子累积承担持续约束反力，避免仅靠无限罚刚度维持平衡。实际 AVBD 的松弛、罚参数增长、热启动衰减和边界处理必须对照论文或具体实现；上式解释机制，不冒充任意实现的逐行代码。

### 单边接触

若用 $c=-g\le0$ 表示非穿透条件，取 $\lambda\ge0$，基本投影式为

$$
\lambda_{new}=\max(0,\lambda+\rho c).
$$

对应的投影增广能量可写成

$$
\Psi(c)=\frac{\max(0,\lambda+\rho c)^2-\lambda^2}{2\rho}.
$$

在活跃区间，其导数与候选接触反力一致；分离且候选反力为零时不产生吸引。摩擦锥、接触基、缓存身份和多点流形仍需要独立规则，不能仅由法向投影自动获得。

## 粒子顶点与六自由度刚体块

论文中的 vertex block 与刚体示例中的 body block需要分别描述。刚体局部增量常为 $[\Delta x,\Delta\theta]\in\mathbb R^6$，同时涉及质量、惯性、旋转参数化和接触臂。

局部线性系统因此由 $3\times3$ 变为 $6\times6$，但不是把四元数的四个存储分量作为四个独立转动自由度。角向更新、惯性目标和几何刚度必须与源码采用的旋转约定一致。详见[原生刚体实现](/knowledge/avbd-demo3d-implementation/)和[WebGPU 流水线](/knowledge/three-avbd-gpu-solver/)。

## 与 XPBD、Newton 和动量加速的关系

PBD/XPBD 主要按约束更新位置乘子与修正；VBD 按顶点块直接处理惯性与局部能量；AVBD 进一步维护原对偶约束状态。它们可以共享材料目标，但块划分、局部近似和停止方式不同。

全局 Newton 求解完整线性化系统；VBD 局部 Newton 忽略或迭代传播块间耦合，因此不能直接继承全局 Newton 的局部二次收敛结论。

AVBD 的 A 是 **Augmented**，指增广拉格朗日，不是 Nesterov 或 heavy-ball 动量。动量属于优化加速策略，需要另外的步长与收敛分析。不能把某类光滑凸函数的一阶收敛率套给接触、非凸材料或有限预算的 AVBD。

## 成本、检查与边界

每轮成本包括邻接遍历、导数组装、局部求解和颜色间同步。固定局部块大小不代表整个算法总成本与耦合强度无关；接触生成、CSR、染色、内存访问与失败恢复也应单独统计。

检查导数时可用有限差分对照梯度与 Hessian；检查局部步时比较目标变化和线性系统残差；检查完整子步时分别观察约束残差、站立支撑、质量比、能量变化及重启后的历史状态。

本文完成模型与导数整理，不提供通用生产求解器，也不把论文性能数字当作本项目实测。GPU 接触容量不足、错误资源依赖和丢失提交属于工程故障，增加局部迭代不能修复它们。

## 原始资料与实现入口

[VBD 项目与论文](https://ankachan.github.io/Projects/VertexBlockDescent/index.html)定义顶点块下降；[AVBD 项目与论文](https://graphics.cs.utah.edu/research/projects/avbd/)介绍增广机制及刚体、关节和接触扩展。材料导数背景见[Hessian](/knowledge/hessian-matrix/)，具体调度与状态生命周期分别见[avbd-demo3d](/knowledge/avbd-demo3d-implementation/)、[three-avbd](/knowledge/three-avbd-gpu-solver/)和[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)。
