---
title: 经典力学：牛顿、拉格朗日与哈密顿
excerpt: 用同一摆模型比较力、广义坐标和相空间，并说明三种表述的适用条件。
date: '2026-07-02'
category: Physics
subtopic: DynamicsFoundations
tags:
  - 经典力学
  - 牛顿力学
  - 拉格朗日力学
  - 哈密顿力学
  - 变分原理
  - 分析力学
readTime: 阅读约10分钟
kind: theory
level: foundation
pageType: guide
aliases:
  - 经典力学三大体系详解 — 牛顿、拉格朗日与哈密顿的等价框架与工程映射
prerequisites:
  - particle-dynamics
nextArticles: []
related: [rigid-body-dynamics, calculus-foundations, differential-equations, numerical-integration-methods, physics_constraints_deep_dive]
topics:
  - id: ue-chaos-physics
    stage: foundation
    role: theory
    order: 30
sources:
  - title: MIT 8.09：分析力学与约束
    url: >-
      https://ocw.mit.edu/courses/8-09-classical-mechanics-iii-fall-2014/d9bac33f6c60b304dc0398e99b327102_MIT8_09F14_full.pdf
---
[质点动力学](/knowledge/particle-dynamics/)从受力、动量与能量建立了运动方程。如果一个物体被杆连接到固定点，直接使用所有笛卡尔坐标就需要同时求约束反力；如果改用摆角，约束可以部分融入坐标。这引出了动力学的另一条深入方向：怎样用坐标、能量和变分结构组织同一物理问题。

牛顿、拉格朗日和哈密顿是描述动力学的不同语言。本文用同一个单摆比较它们，再说明守恒量、约束和数值方法的关系。它们在相应假设下可以描述同一运动，但选用哪种表述，并不自动决定积分器或长期能量行为。此篇是主线之后的理论表述分支；要先完成刚体与接触模型，可回到[动力学主线](/knowledge/physics-simulation-overview/)。

<span id="学习位置" aria-hidden="true"></span>
<span id="一为什么需要三种力学体系" aria-hidden="true"></span>
<span id="11-发展脉络" aria-hidden="true"></span>
<span id="12-核心思想对比" aria-hidden="true"></span>
<span id="13-各自的痛点与优势" aria-hidden="true"></span>

## 先分清模型、坐标与算法

同一个系统可以使用笛卡尔位置、关节角或其他广义坐标。坐标决定方程怎样写；模型决定质量、受力与约束；算法决定怎样离散并求解。

以下推导采用经典、非相对论模型，质量恒定，在惯性系中讨论运动。单摆为固定支点、无质量刚杆与末端质点，不考虑空气阻力和接触。超出这些条件时，应重新列出对应项，而不是套用结论。

| 表述 | 常用状态 | 核心关系 | 本文关注 |
|---|---|---|---|
| 牛顿 | 位置与速度 | 合力与动量变化 | 力、力矩、约束反力 |
| 拉格朗日 | 广义坐标与广义速度 | Euler–Lagrange 方程 | 坐标与能量建模 |
| 哈密顿 | 正则坐标与正则动量 | 正则方程 | 相空间与守恒结构 |

<span id="二牛顿力学力与加速度的矢量力学" aria-hidden="true"></span>
<span id="21-牛顿三定律" aria-hidden="true"></span>
<span id="第一定律惯性定律" aria-hidden="true"></span>
<span id="第二定律加速度定律-核心" aria-hidden="true"></span>
<span id="第三定律作用反作用定律" aria-hidden="true"></span>
<span id="22-质点系运动方程" aria-hidden="true"></span>
<span id="23-常见力的形式" aria-hidden="true"></span>
<span id="24-守恒定律" aria-hidden="true"></span>
<span id="动量守恒" aria-hidden="true"></span>
<span id="角动量守恒" aria-hidden="true"></span>
<span id="机械能守恒" aria-hidden="true"></span>
<span id="25-经典示例简谐振子" aria-hidden="true"></span>
<span id="26-牛顿力学的局限" aria-hidden="true"></span>

## 牛顿表述：先画清受力和参考系

对于恒定质量质点：

$$
m\ddot{\mathbf x}=\mathbf F_{\mathrm{ext}}+\mathbf F_{\mathrm{constraint}}.
$$

将它改写成位置、速度的一阶系统后，既可以用显式也可以用隐式方法。牛顿表述没有“只能显式积分”的限制。

动量、角动量与能量分别检查不同的物理条件：

$$
\mathbf P=\sum_i m_i\mathbf v_i,\qquad
\dot{\mathbf P}=\mathbf F_{\mathrm{ext,total}},
$$

$$
\mathbf L_O=\sum_i\mathbf r_i\times m_i\mathbf v_i,\qquad
\dot{\mathbf L}_O=\boldsymbol\tau_{\mathrm{ext},O}.
$$

后一式以固定惯性原点为基准，并要求内力矩相互抵消等相应条件。不能只凭线动量守恒就自动得到角动量守恒。

对于不显含时间的势能，若力分为保守力和非保守力：

$$
\mathbf F=-\nabla V+\mathbf F_{\mathrm{nc}},\qquad
\frac{d}{dt}(T+V)=\sum_i\mathbf F_{\mathrm{nc},i}\cdot\mathbf v_i.
$$

无耗散、无外部做功时才得到机械能守恒；阻尼、驱动、移动支点和碰撞可能改变它。变量质量的开放系统还要处理质量流的动量通量，不能把火箭直接当作一个封闭质点套用 $\mathbf F=d(m\mathbf v)/dt$。

### 单摆的切向方程

令角度 $\theta$ 从竖直向下方向量起，摆长为 $\ell$：

$$
x=\ell\sin\theta,\qquad y=-\ell\cos\theta.
$$

张力沿径向，固定杆的理想约束下不贡献切向分量，因此：

$$
m\ell\ddot\theta=-mg\sin\theta
\quad\Longrightarrow\quad
\ddot\theta+\frac g\ell\sin\theta=0.
$$

若想知道杆的张力，还需径向方程。消掉反力方便求运动，但不会自动得到反力大小。

<span id="31-广义坐标" aria-hidden="true"></span>
<span id="32-拉格朗日量" aria-hidden="true"></span>
<span id="33-欧拉-拉格朗日方程--核心" aria-hidden="true"></span>
<span id="推导最小作用量原理" aria-hidden="true"></span>
<span id="34-经典示例单摆拉格朗日方法" aria-hidden="true"></span>
<span id="35-广义动量与循环坐标" aria-hidden="true"></span>
<span id="广义动量" aria-hidden="true"></span>
<span id="循环坐标与守恒律" aria-hidden="true"></span>
<span id="36-拉格朗日力学的优势" aria-hidden="true"></span>

## 广义坐标：减少冗余，不是取消所有约束

将质点位置写成：

$$
\mathbf r_a=\mathbf r_a(\mathbf q,t).
$$

速度必须包含显式时间项：

$$
\dot{\mathbf r}_a=
\sum_i\frac{\partial\mathbf r_a}{\partial q_i}\dot q_i+
\frac{\partial\mathbf r_a}{\partial t}.
$$

所以一般动能为：

$$
T=\frac12\sum_a m_a
\left\|
\sum_i\frac{\partial\mathbf r_a}{\partial q_i}\dot q_i+
\frac{\partial\mathbf r_a}{\partial t}
\right\|^2.
$$

只有当坐标映射不显含时间时，才可直接写成纯二次型：

$$
T=\frac12\dot{\mathbf q}^{\mathsf T}\mathbf M(\mathbf q)\dot{\mathbf q}.
$$

对局部独立、正则的完整约束，若原坐标有 $d$ 维、约束 Jacobian 秩为 $r$，局部自由度为 $d-r$。不能把约束条数直接相减而忽略冗余、奇异位形或非完整速度约束。

单摆使用一个角度，已经满足固定长度；多刚体接触、闭环或可变约束往往仍需显式求解，广义坐标不是“自动解决所有约束”。

<span id="三拉格朗日力学能量与变分的分析力学" aria-hidden="true"></span>

## 拉格朗日表述：从作用量到运动方程

对本文的自然力学系统，取：

$$
L(\mathbf q,\dot{\mathbf q},t)=T-V.
$$

这是这里采用的模型形式，不是所有广义系统只能如此定义。加入非保守广义力 $Q_i$ 时：

$$
\frac{d}{dt}\frac{\partial L}{\partial\dot q_i}
-\frac{\partial L}{\partial q_i}=Q_i.
$$

例如转动阻尼可写成 $Q_\theta=-b\dot\theta$，电机力矩也可进入 $Q_\theta$。它们不是任意添加到势能中的位置函数。

### 为什么是驻值，而不一定是最小值

无非保守力时，固定端点的作用量：

$$
S[\mathbf q]=\int_{t_0}^{t_1}L(\mathbf q,\dot{\mathbf q},t)\,dt.
$$

对满足端点为零的扰动 $\delta q_i$：

$$
\delta S=
\left[\sum_i\frac{\partial L}{\partial\dot q_i}\delta q_i\right]_{t_0}^{t_1}
+\int_{t_0}^{t_1}\sum_i
\left(\frac{\partial L}{\partial q_i}
-\frac{d}{dt}\frac{\partial L}{\partial\dot q_i}\right)\delta q_i\,dt.
$$

边界项消失，任意扰动下 $\delta S=0$ 得到 Euler–Lagrange 方程。这里只要求一阶变分为零，不能据此声称它是全局最小值。驻作用量与约束的基础可查 [MIT mechanics notes §1.2、§1.4–1.5](https://ocw.mit.edu/courses/8-09-classical-mechanics-iii-fall-2014/d9bac33f6c60b304dc0398e99b327102_MIT8_09F14_full.pdf)。

### 同一个单摆

取最低点势能为零：

$$
T=\frac12m\ell^2\dot\theta^2,\qquad
V=mg\ell(1-\cos\theta).
$$

于是：

$$
\frac{d}{dt}\frac{\partial L}{\partial\dot\theta}
=m\ell^2\ddot\theta,\qquad
\frac{\partial L}{\partial\theta}=-mg\ell\sin\theta.
$$

代入后：

$$
m\ell^2\ddot\theta+mg\ell\sin\theta=0.
$$

与切向牛顿方程相同。得到同一方程，源于同一模型与坐标约定，而不是某种写法天然更准确。

<span id="四哈密顿力学相空间与辛几何" aria-hidden="true"></span>
<span id="41-哈密顿量" aria-hidden="true"></span>
<span id="42-哈密顿正则方程--核心" aria-hidden="true"></span>
<span id="推导" aria-hidden="true"></span>
<span id="43-经典示例简谐振子" aria-hidden="true"></span>
<span id="44-相空间" aria-hidden="true"></span>
<span id="45-刘维尔定理" aria-hidden="true"></span>
<span id="46-泊松括号" aria-hidden="true"></span>
<span id="47-正则变换与辛结构" aria-hidden="true"></span>
<span id="48-哈密顿-雅可比理论" aria-hidden="true"></span>
<span id="五三大体系的等价性" aria-hidden="true"></span>
<span id="51-牛顿--拉格朗日" aria-hidden="true"></span>
<span id="52-拉格朗日--哈密顿" aria-hidden="true"></span>
<span id="53-哈密顿--牛顿" aria-hidden="true"></span>
<span id="54-对比总表" aria-hidden="true"></span>

## 哈密顿表述：动量不是永远等于质量乘速度

定义正则动量：

$$
p_i=\frac{\partial L}{\partial\dot q_i}.
$$

若速度 Hessian 可逆，局部可从 $(\mathbf q,\mathbf p,t)$ 解出 $\dot{\mathbf q}$，进而作 Legendre 变换：

$$
H(\mathbf q,\mathbf p,t)=
\mathbf p^{\mathsf T}\dot{\mathbf q}-L(\mathbf q,\dot{\mathbf q},t).
$$

若该变换奇异，不能直接照搬下面的无约束正则形式。对于无非保守力的正则系统，取全微分并使用 Euler–Lagrange 方程：

$$
dH=\sum_i\dot q_i\,dp_i-\sum_i\dot p_i\,dq_i
-\frac{\partial L}{\partial t}\,dt.
$$

比较系数得到：

$$
\dot q_i=\frac{\partial H}{\partial p_i},\qquad
\dot p_i=-\frac{\partial H}{\partial q_i}.
$$

当坐标映射不显含时间、动能为速度二次齐次型、势能不依赖速度时，$H=T+V$。一般情况下不要把 Hamilton 量、机械能和“守恒量”无条件等同。

### 单摆与简谐振子的核对

对单摆：

$$
p_\theta=m\ell^2\dot\theta,\qquad
H=\frac{p_\theta^2}{2m\ell^2}+mg\ell(1-\cos\theta),
$$

$$
\dot\theta=\frac{p_\theta}{m\ell^2},\qquad
\dot p_\theta=-mg\ell\sin\theta.
$$

对第一式求时间导数，再代入第二式，得到相同的单摆方程。质量与长度的因子不能省略。

对一维弹簧：

$$
H=\frac{p^2}{2m}+\frac12kx^2,\qquad
\dot x=p/m,\quad \dot p=-kx.
$$

因此：

$$
\ddot x=\dot p/m=-kx/m.
$$

这是回到牛顿方程的直接路径；不是对力方程再多求一次导数。

<span id="六诺特定理" aria-hidden="true"></span>

## 守恒量与相空间结构

若无非保守广义力，且 $L$ 不显含某坐标 $q_i$，则相应 $p_i$ 守恒。这是循环坐标的实用判据。若 $L$ 不显含时间，则：

$$
\frac{d}{dt}
\left(\sum_i\dot q_i\frac{\partial L}{\partial\dot q_i}-L\right)=0.
$$

对称性与守恒量的关系由 Noether 定理系统描述；使用时要检查模型、外力和边界是否仍保留相应对称性。

在正则相空间中，定义：

$$
\{f,g\}=\sum_i
\left(
\frac{\partial f}{\partial q_i}\frac{\partial g}{\partial p_i}
-\frac{\partial f}{\partial p_i}\frac{\partial g}{\partial q_i}
\right).
$$

由正则方程直接得到：

$$
\frac{df}{dt}=\{f,H\}+\frac{\partial f}{\partial t}.
$$

对 $f=H$，有 $dH/dt=\partial H/\partial t$；只有不显含时间时，才能据此得到 Hamilton 量守恒。

连续 Hamilton 流保持辛形式与相空间体积，但保持体积不等于每条轨迹稳定，保辛离散也不等于逐步精确保留原能量。固定步长振子的具体反例见[数值积分的能量分析](/knowledge/numerical-integration-methods/#8-振子说明有界保辛与能量守恒的区别)。

Hamilton–Jacobi 方法进一步寻找生成函数 $S(\mathbf q,t)$，满足：

$$
\frac{\partial S}{\partial t}
+H\left(\mathbf q,\frac{\partial S}{\partial\mathbf q},t\right)=0.
$$

这里它是理论联系的补充，不是本文推荐的实时刚体执行流程。

<span id="七工程映射三大体系与实时物理模拟" aria-hidden="true"></span>
<span id="71-牛顿力学--质点弹簧系统与显式积分" aria-hidden="true"></span>
<span id="72-拉格朗日力学--约束求解与变分积分器" aria-hidden="true"></span>
<span id="73-哈密顿力学--辛积分器" aria-hidden="true"></span>
<span id="74-工程映射总表" aria-hidden="true"></span>

## 与实时物理求解器的关系

以下是方法层次的区分，不是对某个引擎当前实现的断言：

- **连续模型**：质量、受力、能量、材料与约束。
- **坐标选择**：最大坐标刚体、关节坐标或其他参数化。
- **时间离散**：显式、隐式、分裂或离散作用量等。
- **代数求解**：线性迭代、Newton、位置投影、分块下降等。
- **工程执行**：碰撞、接触缓存、并行、状态发布与网络。

隐式 Euler 的某些位置步可以重写成一个能量最小化问题；这不意味着它自动成为由离散作用量推导、保持辛结构的变分积分器。“变分”一词的出现不能替代推导。对应目标、原对偶变量和块定义见[VBD 与 AVBD](/knowledge/vbd-avbd-math/)。

保留最大坐标与约束力，并不比使用广义坐标更“不物理”；选择通常取决于拓扑变化、接触、装配复杂度、数值条件和性能。约束反力、有效质量与迭代生命周期见[物理约束](/knowledge/physics_constraints_deep_dive/)。

<span id="八参考文献" aria-hidden="true"></span>
<span id="经典教材" aria-hidden="true"></span>
<span id="物理模拟参考" aria-hidden="true"></span>

## 继续阅读与边界

本文解释通用力学，不提供“牛顿等于显式、拉格朗日等于 PBD、哈密顿等于不耗能”的一一对应表，也不据此推断 UE 的运行分支。

运动模型如何形成初值问题，见[ODE](/knowledge/differential-equations/)；离散误差与稳定性见[数值积分](/knowledge/numerical-integration-methods/)；引擎数据和调度见[Chaos](/knowledge/ue-chaos-physics-engine/)。具体源码结论应在各实现专题中按版本与行号查证。
