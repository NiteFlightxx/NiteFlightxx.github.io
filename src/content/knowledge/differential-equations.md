---
title: 常微分方程：状态、初值与动力系统
excerpt: 把受力、衰减和弹簧写成状态方程，区分物理模型、初始条件与数值推进。
date: '2026-09-06'
category: Mathematics
subtopic: DifferentialEquations
tags:
  - ODE
  - 数值积分
  - 欧拉法
  - Verlet
  - RK4
  - C++
readTime: 阅读约10分钟
kind: theory
level: foundation
pageType: guide
aliases:
  - 常微分方程与数值方法详解 — 从牛顿运动方程到欧拉、Verlet 与龙格-库塔
prerequisites:
  - calculus-foundations
nextArticles:
  - numerical-integration-methods
  - partial-differential-equations
related: []
topics:
  - id: ue-chaos-physics
    stage: foundation
    role: theory
    order: 40
sources:
  - title: MIT ES.1803：ODE 与初值
    url: 'https://ocw.mit.edu/courses/es-1803-differential-equations-spring-2024/mites_1803_s24_topic_full.pdf'
---
给定位置还不能预测运动：同一位置上的物体可能静止，也可能高速穿过。常微分方程负责描述状态如何连续变化，初始条件选定其中一条轨迹；数值积分只是推进这条轨迹的离散方法。把这三件事分开，才能判断问题来自模型、输入还是计算。

本文只维护模型与初值的解释。Euler、Verlet 和 Runge–Kutta 的完整更新及稳定性比较见[数值积分](/knowledge/numerical-integration-methods/)，空间差分与 CFL 条件见[PDE](/knowledge/partial-differential-equations/)。

<span id="学习位置" aria-hidden="true"></span>
<span id="一微分方程基础" aria-hidden="true"></span>
<span id="11-什么是微分方程" aria-hidden="true"></span>
<span id="12-分类" aria-hidden="true"></span>
<span id="13-游戏中的例子" aria-hidden="true"></span>

## 状态方程描述什么

一般的一阶初值问题写成：

$$
\dot{\mathbf y}(t)=\mathbf f(t,\mathbf y(t);\boldsymbol\theta,\mathbf u(t)),
\qquad \mathbf y(t_0)=\mathbf y_0.
$$

这里的量不能混用：

- $\mathbf y$ 是状态：继续计算所需的当前信息，例如位置和速度。
- $\mathbf u$ 是外部输入：例如给定的推力或控制命令。
- $\boldsymbol\theta$ 是模型参数：例如质量、弹簧刚度和阻尼。
- $\mathbf f$ 是变化率，不是下一帧状态。
- $\mathbf y_0$ 是初始条件，不是目标值。
- $t_0$ 是起始时间；离散步长不属于连续方程本身。

“状态足够完整”以模型假设为前提。若力还取决于未记录的执行器转速、温度或迟滞历史，就需要把它们纳入状态，或明确采用简化模型。不要用更高阶积分器掩盖缺少状态的问题。

线性系统可以写为：

$$
\dot{\mathbf y}=\mathbf A(t)\mathbf y+\mathbf b(t).
$$

当 $\mathbf A$ 不依赖时间时称为常系数线性系统；当 $\mathbf f$ 不显含时间时称为自治系统。线性、自治、一阶是不同维度的分类，不是同一个概念。

<span id="二牛顿运动方程" aria-hidden="true"></span>
<span id="21-微分形式" aria-hidden="true"></span>
<span id="22-转化为一阶-ode-组" aria-hidden="true"></span>

## 从受力方程变成一阶系统

对质量恒定且大于零的质点，牛顿方程是：

$$
m\ddot{\mathbf x}=\mathbf F(t,\mathbf x,\dot{\mathbf x}).
$$

定义速度并拼接状态：

$$
\mathbf v=\dot{\mathbf x},\qquad
\mathbf y=
\begin{bmatrix}\mathbf x\\\mathbf v\end{bmatrix},
\qquad
\dot{\mathbf y}=
\begin{bmatrix}
\mathbf v\\
m^{-1}\mathbf F(t,\mathbf x,\mathbf v)
\end{bmatrix}.
$$

这不是降低物理复杂度，而是把二阶方程改写成统一的一阶形式。位置与速度都必须有初值。三维质点有六个状态分量；完整刚体还需要旋转和角运动状态，不能把这个质点模型直接当作刚体求解器。

量纲也提供了直接检查：

$$
[\mathbf x]=\mathrm m,\quad
[\mathbf v]=\mathrm{m\,s^{-1}},\quad
[\mathbf F/m]=\mathrm{m\,s^{-2}}.
$$

若工程中使用厘米，长度、速度、加速度及派生参数必须一致转换，而不是只把重力常数改成另一个数字。UE 的具体单位/API 用法需要对照相应实现，本文公式采用 SI 单位。

<span id="三解析解与数值解" aria-hidden="true"></span>
<span id="31-解析解" aria-hidden="true"></span>
<span id="32-数值解" aria-hidden="true"></span>
<span id="九ue-实战应用" aria-hidden="true"></span>
<span id="91-弹簧-阻尼系统" aria-hidden="true"></span>
<span id="92-指数衰减平滑" aria-hidden="true"></span>
<span id="93-pid-控制器" aria-hidden="true"></span>
<span id="94-碰撞冲量" aria-hidden="true"></span>

## 三个可以直接核对的模型

### 恒定加速度：初值决定轨迹

取起始时刻为零：

$$
\dot{\mathbf x}=\mathbf v,\qquad \dot{\mathbf v}=\mathbf a,
$$

连续解为：

$$
\mathbf v(t)=\mathbf v_0+\mathbf a t,\qquad
\mathbf x(t)=\mathbf x_0+\mathbf v_0t+\frac12\mathbf a t^2.
$$

当 $\mathbf x_0=\mathbf 0$、$\mathbf v_0=\mathbf 0$、$\mathbf a=(0,0,-9.81)\,\mathrm{m\,s^{-2}}$ 时，一秒后速度为 $(0,0,-9.81)\,\mathrm{m\,s^{-1}}$，位置为 $(0,0,-4.905)\,\mathrm m$。

这个解适合检查积分误差和单位，不代表带阻力、碰撞或变化推力的轨迹也能使用同一公式。

### 指数衰减：参数、时间常数与半衰期

对固定目标 $r$：

$$
\dot{x}=-\lambda(x-r),\qquad \lambda>0.
$$

令误差 $e=x-r$，则：

$$
e(t)=e_0e^{-\lambda t},\qquad
\tau=\lambda^{-1},\qquad
t_{1/2}=\frac{\ln 2}{\lambda}.
$$

因此，固定目标在一步中的精确更新是：

$$
x(t+h)=r+(x(t)-r)e^{-\lambda h}.
$$

同一固定目标下，分两步与合成一步得到相同结果，因为指数因子相乘。若目标在步内变化，这个公式只对“该步内把目标冻结”的近似问题精确；不能笼统称为任何移动目标下都帧率无关。

### 弹簧阻尼：平衡点与时间尺度

一维固定平衡点 $r$ 的模型为：

$$
m\ddot{x}+c\dot{x}+k(x-r)=0,\qquad m>0,\ k>0,\ c\geq0.
$$

令 $q=x-r$、$v=\dot x$：

$$
\frac{d}{dt}
\begin{bmatrix}q\\v\end{bmatrix}
=
\begin{bmatrix}
0&1\\-k/m&-c/m
\end{bmatrix}
\begin{bmatrix}q\\v\end{bmatrix}.
$$

自然频率、阻尼比与特征根分别为：

$$
\omega_0=\sqrt{k/m},\qquad
\zeta=\frac{c}{2\sqrt{km}},\qquad
s_{\pm}=-\zeta\omega_0\pm\omega_0\sqrt{\zeta^2-1}.
$$

无阻尼时，初值解是：

$$
q(t)=q_0\cos(\omega_0t)+\frac{v_0}{\omega_0}\sin(\omega_0t).
$$

临界阻尼对应 $\zeta=1$，但“最快且无超调”必须限定初始条件、响应指标及这个线性模型；任意初速度仍可能越过目标。目标移动时还要说明阻尼相对世界速度还是目标相对速度，两种模型并不相同。

## 解存在，不代表永远存在或容易计算

对 $\dot{\mathbf y}=\mathbf f(t,\mathbf y)$，连续性与关于状态的局部 Lipschitz 条件是常用的局部存在唯一性充分条件。这是局部结论，不保证轨迹永远有界，也不保证闭式解。

例如：

$$
\dot y=y^2,\qquad y(0)=1
\quad\Longrightarrow\quad
y(t)=\frac1{1-t}.
$$

它在 $t=1$ 发散。此时结果变大可能来自模型本身，不一定是积分器失稳。相反，一个稳定衰减的连续模型也可能因错误步长而数值发散。局部存在与唯一性的条件可查 [MIT ODE notes §10.5](https://ocw.mit.edu/courses/es-1803-differential-equations-spring-2024/mites_1803_s24_topic_full.pdf)。

## 解析解、数值解与刚性不是一回事

解析解给出连续时间的表达式；数值解在离散时刻近似状态：

$$
\mathbf y_{n+1}=\Phi_h(t_n,\mathbf y_n).
$$

$\Phi_h$ 来自选定的方法。更换它不会改变连续模型参数，却会改变误差、稳定性和计算代价。

以多时间尺度系统为例：

$$
\dot y_1=-y_1,\qquad \dot y_2=-1000y_2.
$$

即使主要关注缓慢变化的第一分量，快速衰减分量也可能强迫某些显式方法使用很小步长。这体现了刚性问题的典型困难，但“刚性”不能简单等同于弹簧参数很大：还要看时间尺度、观察区间和离散方法。隐式方法为何可能有用，见[稳定性分析](/knowledge/numerical-integration-methods/#7-用测试方程比较稳定域)。

<span id="七有限差分" aria-hidden="true"></span>
<span id="八cfl-稳定性条件" aria-hidden="true"></span>

## 碰撞、约束和控制如何接到模型上

光滑 ODE 不是所有模拟现象的完整描述。

接触冲量可在一个事件时刻造成速度跃变：

$$
\mathbf v^+=\mathbf v^-+\mathbf M^{-1}\mathbf J^{\mathsf T}\boldsymbol\Lambda.
$$

这里 $\mathbf J$ 是约束 Jacobian，$\boldsymbol\Lambda$ 是冲量乘子。它不能简单当成有限大小的平滑力，再假定高阶 RK 会自动准确处理。事件、约束修正和速度回算见[物理约束](/knowledge/physics_constraints_deep_dive/)。

闭环控制把输入变成状态或误差的函数；PID 中的积分状态、执行器限幅和离散更新也有自己的状态与时序。实际串级飞控、预测跟踪与局部避障如何组合，见[AircraftLab](/knowledge/quadcopter-flight-control-math/)，这里不再维护一份缺少抗饱和和异常步长处理的“通用 PID”。

当未知量是空间场时，问题转入[PDE 与空间离散](/knowledge/partial-differential-equations/)。CFL 限制属于特定方程、网格和格式的分析，不是所有 ODE 的统一步长公式。

<span id="四欧拉法" aria-hidden="true"></span>
<span id="41-显式欧拉" aria-hidden="true"></span>
<span id="42-半隐式欧拉" aria-hidden="true"></span>
<span id="五verlet-积分" aria-hidden="true"></span>
<span id="51-标准-verlet" aria-hidden="true"></span>
<span id="52-速度-verlet" aria-hidden="true"></span>
<span id="六龙格-库塔法" aria-hidden="true"></span>
<span id="61-rk2中点法" aria-hidden="true"></span>
<span id="62-rk4四阶龙格-库塔" aria-hidden="true"></span>
<span id="63-精度对比" aria-hidden="true"></span>
<span id="十方法选择指南" aria-hidden="true"></span>
<span id="十一参考文献" aria-hidden="true"></span>

## 从模型继续到实现

先确定状态、单位、输入和初值，再选离散方法。若结果不符，先比较一个具有解析解的简化情形，分别检查模型误差、时间离散误差与求解残差，不用额外阻尼把三者一起盖住。

- 时间步、误差、Euler/Verlet/RK：见[数值积分](/knowledge/numerical-integration-methods/)。
- 力、能量与广义坐标：见[经典力学](/knowledge/classical-mechanics/)。
- 约束修正与接触：见[物理约束](/knowledge/physics_constraints_deep_dive/)。
- 场量、边界与空间差分：见[PDE](/knowledge/partial-differential-equations/)。

本文给出一般数学模型和独立推导，不声称某一 UE 模块正在按上述简化系统运行。
