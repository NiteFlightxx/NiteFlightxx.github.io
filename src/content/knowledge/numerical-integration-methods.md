---
title: 数值积分：方法、误差与稳定性
excerpt: 比较 Euler、Verlet 与 Runge–Kutta 的离散更新，区分精度、稳定性和能量行为。
date: '2026-06-25'
category: Physics
subtopic: RigidBodyDynamics
tags:
  - 物理
  - 数值积分
  - ODE
  - 辛积分器
  - PBD
  - C++
readTime: 阅读约15分钟
kind: algorithm
level: intermediate
pageType: guide
aliases:
  - 物理模拟数值积分方法详解 — 从欧拉到 RK4 与 XPBD
prerequisites:
  - particle-dynamics
nextArticles: []
related: [differential-equations, rigid-body-dynamics, deformable-body-dynamics, fluid-dynamics, pbd-xpbd-math, iterative-linear-solvers]
topics:
  - id: ue-chaos-physics
    stage: foundation
    role: theory
    order: 50
sources:
  - title: Hairer：几何积分导论
    url: 'https://www.unige.ch/~hairer/poly_geoint/intro.pdf'
  - title: Baraff：隐式积分
    url: 'https://www.cs.cmu.edu/~baraff/sigcourse/notese.pdf'
---
[质点动力学](/knowledge/particle-dynamics/)给出自由落体和弹簧阻尼的连续模型及解析基准，刚体、软体与流体则保留不同自由度。它们共享一个计算问题：已知当前状态和变化率，怎样求有限时间后的近似状态？积分器决定连续模型怎样变成一次离散更新，但不负责定义材料、生成接触或保证全部约束收敛。

这里从已知的 $\dot{\mathbf y}=\mathbf f(t,\mathbf y)$ 开始，比较更新方法、误差和稳定性。沿主线阅读时，先理解更新契约、Euler 家族、振子与子步；RK 阶段、稳定域和几何积分的深入分析则按问题继续。需要初值问题的一般语言时，可查[常微分方程](/knowledge/differential-equations/)。

<span id="1-引言" aria-hidden="true"></span>
<span id="11-什么是数值积分" aria-hidden="true"></span>
<span id="12-为什么需要数值积分" aria-hidden="true"></span>
<span id="13-物理模拟的基本流程" aria-hidden="true"></span>
<span id="2-基本概念" aria-hidden="true"></span>
<span id="21-状态向量" aria-hidden="true"></span>
<span id="22-微分方程" aria-hidden="true"></span>
<span id="23-初值问题ivp" aria-hidden="true"></span>
<span id="24-离散化" aria-hidden="true"></span>
<span id="3-常微分方程ode" aria-hidden="true"></span>
<span id="31-一般形式" aria-hidden="true"></span>
<span id="32-物理系统的ode形式" aria-hidden="true"></span>
<span id="33-二阶ode降阶" aria-hidden="true"></span>

## 一次更新的契约

继续使用质量 $2\,\mathrm{kg}$、半径 $0.5\,\mathrm m$、初始高度 $2\,\mathrm m$ 的球。取 $h=1/60\,\mathrm s$，速度优先更新得到 $v^*=-9.8/60$、$y^*=2+h v^*=1.997277\ldots$。这一步只计算自由运动；当间隙 $y^*-0.5$ 接近零时，还需交给接触阶段处理。步长和方法的差异，正是本篇要解释的问题。

给定状态 $\mathbf y_n$ 和正步长 $h$：

$$
t_{n+1}=t_n+h,\qquad
\mathbf y_{n+1}=\Phi_h(t_n,\mathbf y_n).
$$

对质量恒定的平动系统：

$$
\mathbf y=\begin{bmatrix}\mathbf x\\\mathbf v\end{bmatrix},
\qquad
\mathbf f=\begin{bmatrix}\mathbf v\\\mathbf a(t,\mathbf x,\mathbf v)\end{bmatrix}.
$$

一次函数求值必须使用同一个阶段的时间、位置和速度。若位置取中间状态、速度却还取步初值，得到的就不是声明的 RK 方法。输入若在步内变化，也应说明插值或冻结规则。

下文误差阶数假定解与右端足够光滑、区间固定、步长趋零且方法处于适用的稳定范围；碰撞瞬间、夹断或非光滑摩擦不能直接套用同一结论。

<span id="4-欧拉方法家族" aria-hidden="true"></span>
<span id="41-显式欧拉法explicit-euler--forward-euler" aria-hidden="true"></span>
<span id="411-基本思想" aria-hidden="true"></span>
<span id="412-迭代公式" aria-hidden="true"></span>
<span id="413-物理系统应用" aria-hidden="true"></span>
<span id="414-推导过程" aria-hidden="true"></span>
<span id="415-优点与缺点" aria-hidden="true"></span>
<span id="416-稳定性问题" aria-hidden="true"></span>
<span id="417-代码实现" aria-hidden="true"></span>
<span id="42-隐式欧拉法implicit-euler--backward-euler" aria-hidden="true"></span>
<span id="421-基本思想" aria-hidden="true"></span>
<span id="422-迭代公式" aria-hidden="true"></span>
<span id="423-物理系统应用" aria-hidden="true"></span>
<span id="424-求解方法" aria-hidden="true"></span>
<span id="425-优点与缺点" aria-hidden="true"></span>
<span id="426-稳定性优势" aria-hidden="true"></span>
<span id="427-代码实现" aria-hidden="true"></span>
<span id="43-半隐式欧拉法semi-implicit-euler--symplectic-euler" aria-hidden="true"></span>
<span id="431-基本思想" aria-hidden="true"></span>
<span id="432-迭代公式" aria-hidden="true"></span>
<span id="433-别名" aria-hidden="true"></span>
<span id="434-辛性质symplectic-property" aria-hidden="true"></span>
<span id="435-优点与缺点" aria-hidden="true"></span>
<span id="436-为什么这么有效" aria-hidden="true"></span>
<span id="437-代码实现" aria-hidden="true"></span>
<span id="438-物理意义" aria-hidden="true"></span>
<span id="439-实际表现" aria-hidden="true"></span>

## Euler 家族：更新顺序与隐式求解

### 显式 Euler

由一步 Taylor 展开保留一阶项：

$$
\mathbf y(t_n+h)=\mathbf y(t_n)+h\mathbf f(t_n,\mathbf y(t_n))+O(h^2).
$$

离散为：

$$
\mathbf x_{n+1}=\mathbf x_n+h\mathbf v_n,\qquad
\mathbf v_{n+1}=\mathbf v_n+h\mathbf a(t_n,\mathbf x_n,\mathbf v_n).
$$

两项都读旧状态。一次右端求值、无需联立解方程；它适合建立基线，但对无阻尼振子会持续增加能量。不能从这个例子推出它对所有方程都不稳定。

### 隐式 Euler

$$
\mathbf y_{n+1}=\mathbf y_n+h\mathbf f(t_{n+1},\mathbf y_{n+1}).
$$

未知量同时出现在两侧。设残差：

$$
\mathbf R(\mathbf z)=\mathbf z-\mathbf y_n-h\mathbf f(t_{n+1},\mathbf z).
$$

Newton 更新需要解：

$$
\left(\mathbf I-h\frac{\partial\mathbf f}{\partial\mathbf y}\right)
\Delta\mathbf z=-\mathbf R(\mathbf z),\qquad
\mathbf z\leftarrow\mathbf z+\Delta\mathbf z.
$$

这引入 Jacobian、线性求解与收敛容差。固定点迭代只是其中一种求法，不能因为公式叫隐式，就假定任意少量迭代也有精确隐式格式的稳定性。[Baraff 的隐式积分讲义](https://www.cs.cmu.edu/~baraff/sigcourse/notese.pdf)讨论了这一类更新与线性化。

隐式 Euler 在衰减问题上有很大的稳定域，却也有数值耗散；“没有爆炸”和“轨迹准确”不是一回事。

### 速度优先的半隐式 Euler

当加速度只依赖位置、质量矩阵恒定时：

$$
\mathbf v_{n+1}=\mathbf v_n+h\mathbf a(\mathbf x_n),\qquad
\mathbf x_{n+1}=\mathbf x_n+h\mathbf v_{n+1}.
$$

它仍然是一阶方法，常称 symplectic Euler 的 kick–drift 形式。对可分离 Hamilton 系统，这种拆分保持辛结构；若加速度含速度阻尼、额外投影或控制夹断，不能仅因代码“先速度后位置”就宣称整个算法仍是辛积分器。

它也不是完全隐式 Euler：位置力仍在旧位置求值。方法简单、成本低是工程优势，但不保证任意步长稳定，更不精确保留原机械能。

<span id="44-梯形法trapezoidal-rule--heuns-method" aria-hidden="true"></span>
<span id="441-基本思想" aria-hidden="true"></span>
<span id="442-迭代公式" aria-hidden="true"></span>
<span id="443-预测-校正形式" aria-hidden="true"></span>
<span id="444-物理系统应用" aria-hidden="true"></span>
<span id="445-精度" aria-hidden="true"></span>
<span id="446-优点与缺点" aria-hidden="true"></span>
<span id="447-代码实现" aria-hidden="true"></span>
<span id="45-欧拉方法对比" aria-hidden="true"></span>
<span id="52-二阶龙格-库塔rk2" aria-hidden="true"></span>
<span id="521-中点法midpoint-method" aria-hidden="true"></span>
<span id="522-几何意义" aria-hidden="true"></span>
<span id="53-四阶龙格-库塔rk4" aria-hidden="true"></span>
<span id="531-标准rk4公式" aria-hidden="true"></span>
<span id="532-物理意义" aria-hidden="true"></span>
<span id="533-物理系统的rk4" aria-hidden="true"></span>
<span id="534-恒定加速度的简化" aria-hidden="true"></span>
<span id="535-精度" aria-hidden="true"></span>
<span id="536-优点与缺点" aria-hidden="true"></span>
<span id="537-代码实现" aria-hidden="true"></span>
<span id="538-非恒定力的完整实现" aria-hidden="true"></span>

## 二阶方法：不要混淆 Heun 与隐式梯形

### 显式中点 RK2

$$
\mathbf k_1=\mathbf f(t_n,\mathbf y_n),\qquad
\mathbf k_2=\mathbf f\left(t_n+\frac h2,\mathbf y_n+\frac h2\mathbf k_1\right),
\qquad
\mathbf y_{n+1}=\mathbf y_n+h\mathbf k_2.
$$

在预测的中点求斜率，两次右端求值。在光滑问题上，全局误差二阶。

### Heun：显式预测后平均斜率

$$
\mathbf y^*=\mathbf y_n+h\mathbf f(t_n,\mathbf y_n),
$$

$$
\mathbf y_{n+1}=\mathbf y_n+\frac h2
\left[\mathbf f(t_n,\mathbf y_n)+\mathbf f(t_{n+1},\mathbf y^*)\right].
$$

这也是二阶显式方法，但它使用预测值，不是在求解隐式方程。

### 隐式梯形法

$$
\mathbf y_{n+1}=\mathbf y_n+\frac h2
\left[\mathbf f(t_n,\mathbf y_n)+\mathbf f(t_{n+1},\mathbf y_{n+1})\right].
$$

最终状态出现在右侧，必须求解。用一次显式预测替代它就变成 Heun，稳定域也随之改变。对非常快的衰减模态，隐式梯形可能出现符号交替且衰减不足；A 稳定不等于强数值阻尼。

## Verlet：二阶位置推进的假设

对于位置力 $\mathbf a(\mathbf x)$ 和固定步长，Taylor 展开前后时刻并相加：

$$
\mathbf x(t+h)+\mathbf x(t-h)
=2\mathbf x(t)+h^2\mathbf a(t)+O(h^4).
$$

得到位置 Verlet：

$$
\mathbf x_{n+1}=2\mathbf x_n-\mathbf x_{n-1}+h^2\mathbf a(\mathbf x_n).
$$

必须从初始速度正确构造前一步位置，不能默认复制当前位置：

$$
\mathbf x_{-1}=\mathbf x_0-h\mathbf v_0+\frac12h^2\mathbf a(\mathbf x_0)+O(h^3).
$$

位置差的前向/后向速度与中心速度不在同一时刻；切换步长或外部修正位置时，也要重新明确历史状态的含义。

速度 Verlet 显式保留速度：

$$
\begin{aligned}
\mathbf x_{n+1}&=\mathbf x_n+h\mathbf v_n+\frac12h^2\mathbf a_n,\\
\mathbf a_{n+1}&=\mathbf a(\mathbf x_{n+1}),\\
\mathbf v_{n+1}&=\mathbf v_n+\frac h2(\mathbf a_n+\mathbf a_{n+1}).
\end{aligned}
$$

新旧加速度可以缓存复用。若力依赖速度，上式不再直接闭合，需专门处理而不是套用同一显式公式。PBD 中的位置修正与速度回算也不是单纯的无约束 Verlet。

<span id="5-龙格-库塔方法" aria-hidden="true"></span>
<span id="51-龙格-库塔方法概述" aria-hidden="true"></span>

## RK4：每个阶段都推进完整状态

$$
\begin{aligned}
\mathbf k_1&=\mathbf f(t_n,\mathbf y_n),\\
\mathbf k_2&=\mathbf f(t_n+h/2,\mathbf y_n+h\mathbf k_1/2),\\
\mathbf k_3&=\mathbf f(t_n+h/2,\mathbf y_n+h\mathbf k_2/2),\\
\mathbf k_4&=\mathbf f(t_n+h,\mathbf y_n+h\mathbf k_3),\\
\mathbf y_{n+1}&=\mathbf y_n+\frac h6
(\mathbf k_1+2\mathbf k_2+2\mathbf k_3+\mathbf k_4).
\end{aligned}
$$

每个 $\mathbf k_i$ 同时包含位置和速度的导数。四次力求值可能比四次简单加法昂贵得多：若力依赖邻域、姿态或碰撞，阶段状态和派生数据也需一致更新。

RK4 对光滑初值问题有四阶全局精度，但不是一般意义上的辛方法，也不是无条件稳定。碰撞或约束在步末才处理时，不能声称整条受约束流水线因此拥有四阶精度。

<span id="11-实际代码实现" aria-hidden="true"></span>
<span id="111-通用积分器接口" aria-hidden="true"></span>
<span id="112-粒子系统" aria-hidden="true"></span>
<span id="113-弹簧链" aria-hidden="true"></span>
<span id="114-性能优化版本" aria-hidden="true"></span>

## 用同一段代码比较方法

下面是一维独立数学示例，不是 UE 生产积分器。状态只含位置和速度；所有方法都经过同一加速度函数。Verlet 的加速度函数不得依赖速度，半隐式方法的辛性质也只在前述假设下讨论。

~~~js
// knowledge-numerics-example
const add = (s, k, h) => ({ x: s.x + h * k.x, v: s.v + h * k.v });
export function step(method, s, t, h, acceleration) {
  if (!(Number.isFinite(h) && h > 0)) throw new Error("invalid step");
  const f = (z, time) => ({ x: z.v, v: acceleration(z.x, z.v, time) });
  const k1 = f(s, t);
  if (method === "euler") return add(s, k1, h);
  if (method === "symplectic") {
    const v = s.v + h * k1.v;
    return { x: s.x + h * v, v };
  }
  if (method === "verlet") {
    const x = s.x + h * s.v + 0.5 * h * h * k1.v;
    const a1 = acceleration(x, s.v, t + h); // position-only force
    return { x, v: s.v + 0.5 * h * (k1.v + a1) };
  }
  const k2 = f(add(s, k1, h / 2), t + h / 2);
  if (method === "midpoint") return add(s, k2, h);
  if (method !== "rk4") throw new Error("unknown method");
  const k3 = f(add(s, k2, h / 2), t + h / 2);
  const k4 = f(add(s, k3, h), t + h);
  return {
    x: s.x + h * (k1.x + 2*k2.x + 2*k3.x + k4.x) / 6,
    v: s.v + h * (k1.v + 2*k2.v + 2*k3.v + k4.v) / 6,
  };
}
export function advance(method, initial, duration, count, acceleration) {
  if (!(Number.isInteger(count) && count > 0 && duration > 0)) {
    throw new Error("invalid interval");
  }
  const h = duration / count;
  let state = { ...initial };
  for (let n = 0; n < count; n++) {
    state = step(method, state, n * h, h, acceleration);
  }
  return state;
}
export const harmonicEnergy = (s, omega = 1) =>
  0.5 * (s.v * s.v + omega * omega * s.x * s.x);
~~~

先看恒定加速度 $a=-1$、初值 $x_0=v_0=0$，总时长 $T=1$，分十步。解析位置为 $-0.5$：

| 方法 | 最终位置 | 最终速度 |
|---|---:|---:|
| 显式 Euler | $-0.45$ | $-1$ |
| 速度优先半隐式 Euler | $-0.55$ | $-1$ |
| 速度 Verlet / 中点 RK2 / RK4 | $-0.5$ | $-1$ |

恒加速度太简单，不能据此判断复杂问题上的精度。换成非恒定力 $\ddot x=-x$、初值 $(1,0)$，解析解为 $(\cos t,-\sin t)$，才能检验阶段状态的耦合是否正确。仓库的数值审计直接提取并执行上面这段代码，而不是维护另一份同名算法。

<span id="6-稳定性分析" aria-hidden="true"></span>
<span id="61-什么是数值稳定性" aria-hidden="true"></span>
<span id="62-测试方程" aria-hidden="true"></span>
<span id="63-稳定域" aria-hidden="true"></span>
<span id="631-显式欧拉" aria-hidden="true"></span>
<span id="632-隐式欧拉" aria-hidden="true"></span>
<span id="633-rk4" aria-hidden="true"></span>

## 用测试方程比较稳定域

考虑衰减测试方程：

$$
\dot y=\lambda y,\qquad \operatorname{Re}\lambda<0,\qquad z=h\lambda.
$$

某方法给出 $y_{n+1}=R(z)y_n$；绝对稳定域满足 $|R(z)|\leq1$。

| 方法 | 放大因子 |
|---|---|
| 显式 Euler | $R(z)=1+z$ |
| 隐式 Euler | $R(z)=(1-z)^{-1}$ |
| 中点 RK2 / Heun | $R(z)=1+z+z^2/2$ |
| 隐式梯形 | $R(z)=(1+z/2)/(1-z/2)$ |
| RK4 | $R(z)=1+z+z^2/2+z^3/6+z^4/24$ |

对实负 $\lambda$，显式 Euler 的渐近衰减要求：

$$
0<h|\lambda|<2.
$$

取 $\lambda=-10$、$h=0.3$，其放大因子为 $-2$，会交替放大；同一步隐式 Euler 的因子是 $0.25$。连续系统都在衰减，数值结果却可能完全不同。

隐式 Euler 在整个左半平面绝对稳定，即 A 稳定；但这不保证任意非线性、接触和未收敛求解都可靠。刚性、碰撞漏检、约束残差和容量溢出是不同问题。

<span id="64-物理系统的稳定性" aria-hidden="true"></span>
<span id="641-简谐振子" aria-hidden="true"></span>
<span id="642-刚性问题stiff-problems" aria-hidden="true"></span>
<span id="101-辛积分器symplectic-integrators" aria-hidden="true"></span>
<span id="1011-什么是辛积分" aria-hidden="true"></span>
<span id="1012-为什么重要" aria-hidden="true"></span>
<span id="1013-常见辛积分器" aria-hidden="true"></span>
<span id="1014-velocity-verlet实现" aria-hidden="true"></span>
<span id="102-多步法multi-step-methods" aria-hidden="true"></span>
<span id="1021-adams-bashforth方法" aria-hidden="true"></span>
<span id="1022-优点与缺点" aria-hidden="true"></span>
<span id="103-预测-校正方法" aria-hidden="true"></span>
<span id="1031-基本思想" aria-hidden="true"></span>
<span id="1032-adams-bashforth-moulton" aria-hidden="true"></span>
<span id="104-子步进sub-stepping" aria-hidden="true"></span>
<span id="1041-基本思想" aria-hidden="true"></span>
<span id="1042-实现" aria-hidden="true"></span>
<span id="1043-优点" aria-hidden="true"></span>
<span id="105-固定时间步-vs-可变时间步" aria-hidden="true"></span>
<span id="1051-固定时间步" aria-hidden="true"></span>
<span id="1052-可变时间步" aria-hidden="true"></span>
<span id="106-误差控制" aria-hidden="true"></span>
<span id="1061-局部误差估计" aria-hidden="true"></span>
<span id="1062-自适应步长" aria-hidden="true"></span>

## 振子说明：有界、保辛与能量守恒的区别

对 $\ddot x=-\omega^2x$，定义 $u=\omega x$、$r=h\omega$。速度优先半隐式 Euler 为：

$$
\begin{bmatrix}u_{n+1}\\v_{n+1}\end{bmatrix}
=
\underbrace{\begin{bmatrix}1-r^2&r\\-r&1\end{bmatrix}}_{\mathbf A}
\begin{bmatrix}u_n\\v_n\end{bmatrix}.
$$

$\det\mathbf A=1$、$\operatorname{tr}\mathbf A=2-r^2$。当 $0<r<2$ 时，两个不同的特征值在单位圆上，状态有界；当 $r>2$ 时出现模长大于一的特征值。端点 $r=2$ 通常出现非平凡 Jordan 块，不能作为有界稳定的安全取值。

原机械能（单位质量）是：

$$
E_n=\frac12(v_n^2+\omega^2x_n^2).
$$

取 $\omega=1$、$h=0.1$、$(x_0,v_0)=(1,0)$，半隐式一步得到 $(0.99,-0.1)$：

$$
E_0=0.5,\qquad E_1=0.49505.
$$

因此“半隐式 Euler 精确能量守恒”是错误的。对这个固定步长线性振子，它保留的是另一个二次型：

$$
\widetilde E_n=
\frac12\left(v_n^2+\omega^2x_n^2-h\omega^2x_nv_n\right).
$$

它在 $0<h\omega<2$ 内正定，因此可解释状态有界；这不能推广成任意非线性系统的精确修正能量。一般保辛方法的长时间行为与修正 Hamilton 量可参考 [Hairer 的几何积分导论](https://www.unige.ch/~hairer/poly_geoint/intro.pdf)。

同一振子上，显式 Euler 每步原能量乘以 $1+r^2$，隐式 Euler 则除以 $1+r^2$。三者分别体现数值增能、数值耗散和有条件的有界振荡，不能用同一个“稳定”标签代替。

<span id="7-精度分析" aria-hidden="true"></span>
<span id="71-误差类型" aria-hidden="true"></span>
<span id="711-局部截断误差lte" aria-hidden="true"></span>
<span id="712-全局截断误差gte" aria-hidden="true"></span>
<span id="713-关系" aria-hidden="true"></span>
<span id="72-精度阶数" aria-hidden="true"></span>
<span id="73-收敛性测试" aria-hidden="true"></span>
<span id="731-方法" aria-hidden="true"></span>
<span id="732-收敛率" aria-hidden="true"></span>

## 误差怎样测，成本怎样算

设方法阶数为 $p$。这里把“一步误差”定义为从精确状态出发，一步末端的状态差：

$$
\|\mathbf y(t_n+h)-\Phi_h(t_n,\mathbf y(t_n))\|=O(h^{p+1}).
$$

在固定有限区间和合适稳定条件下，全局误差为 $O(h^p)$。某些教材将局部截断误差再除以步长，此时其阶数写成 $O(h^p)$；比较文献时先看定义。

- 显式、隐式和上述半隐式 Euler：通常一阶。
- 中点、Heun、隐式梯形和速度 Verlet：满足各自假设时二阶。
- 经典 RK4：光滑问题上四阶。

用解析解或可靠的高精度参考，在相同总时长下比较步长 $h$ 和 $h/2$：

$$
p_{\mathrm{obs}}\approx
\log_2\frac{e(h)}{e(h/2)}.
$$

位置与速度单位不同，应分别报告或用有量纲的尺度归一化。只看终点能量可能漏掉相位误差，复杂场景只看画面也可能漏掉约束残差。

总成本不只是右端调用次数：

$$
T_{\mathrm{step}}=
T_{\mathrm{force}}+T_{\mathrm{collision}}+T_{\mathrm{constraints}}
+T_{\mathrm{linear}}+T_{\mathrm{transfer}}.
$$

一次隐式步可能包含多次 Newton 与线性迭代。一次 GPU 右端求值也可能需要多个 pass、同步与临时缓冲。性能结论必须在同样误差、接触条件和帧预算下测量。

<span id="54-自适应步长rk45" aria-hidden="true"></span>
<span id="541-基本思想" aria-hidden="true"></span>
<span id="542-步长控制" aria-hidden="true"></span>
<span id="543-dormand-prince方法dopri5" aria-hidden="true"></span>
<span id="544-优点" aria-hidden="true"></span>
<span id="10-高级主题" aria-hidden="true"></span>

## 多步、自适应与子步：它们改变什么

### 多步方法复用历史

例如固定步长二阶 Adams–Bashforth：

$$
\mathbf y_{n+1}=\mathbf y_n+\frac h2
\left(3\mathbf f_n-\mathbf f_{n-1}\right).
$$

它减少重复求值，但需要启动方法与历史缓存。碰撞、重置、传送或步长变化后，旧历史可能不再适用。预测–校正方法也需区分预测值、修正次数与真正求解到收敛的隐式格式。

### 自适应 RK 控制估计误差

嵌入式 RK 对用两组权重得到不同阶数的近似，利用差值估计误差。按状态尺度归一化：

$$
e=\max_i\frac{|y_i^{(a)}-y_i^{(b)}|}
{\mathrm{atol}_i+\mathrm{rtol}_i\max(|y_{n,i}|,|y_i^{(a)}|)}.
$$

若误差估计随步长呈 $h^{q+1}$，一种基本控制律是：

$$
h_{\mathrm{new}}=h\,
\operatorname{clamp}\left(s\,e^{-1/(q+1)},f_{\min},f_{\max}\right).
$$

这是控制器示意，不是所有 RK45 实现的完整规则；需要拒步、最小/最大步长、异常处理和事件定位。每帧不可预测的拒步次数也未必适合实时帧预算。可变步长还会改变某些几何积分与历史缓存的性质。

### 子步不是“增加同一位置的迭代”

把一帧分成 $N$ 个子步，会让积分、碰撞和约束在新的时间位置上重复执行。只在一个预测位置增加约束迭代，则主要减少当前离散系统的求解残差；两者不能互相等价。

固定步长累积器属于时间调度层，不是积分器本身。处理过载时必须声明是减慢模拟、限制追帧还是采取其他策略，不能静默丢弃时间再宣称实时正确。

<span id="8-物理模拟中的应用" aria-hidden="true"></span>
<span id="81-粒子系统" aria-hidden="true"></span>
<span id="811-基本粒子" aria-hidden="true"></span>
<span id="812-多粒子系统" aria-hidden="true"></span>
<span id="82-弹簧系统" aria-hidden="true"></span>
<span id="821-胡克定律" aria-hidden="true"></span>
<span id="822-代码实现" aria-hidden="true"></span>
<span id="823-阻尼弹簧" aria-hidden="true"></span>
<span id="83-刚体动力学" aria-hidden="true"></span>
<span id="831-状态向量" aria-hidden="true"></span>
<span id="832-运动方程" aria-hidden="true"></span>
<span id="833-代码框架" aria-hidden="true"></span>
<span id="84-流体模拟sphpbf" aria-hidden="true"></span>
<span id="841-sph基本流程" aria-hidden="true"></span>
<span id="85-约束系统pbd" aria-hidden="true"></span>
<span id="851-position-based-dynamics" aria-hidden="true"></span>
<span id="13-补充数值积分与约束求解的工程结合" aria-hidden="true"></span>
<span id="131-真实引擎不是只积分不约束" aria-hidden="true"></span>
<span id="132-xpbd让-pbd-拥有可控的物理刚度" aria-hidden="true"></span>
<span id="133-三条线索的统一" aria-hidden="true"></span>

## 与约束、旋转和场模拟的接口

接触求解会改变状态，通常需要协调预测、检测、约束、速度更新与输出。PBD/XPBD 属于约束处理框架，不是与 Euler、RK4 同一层级的无约束积分器替换选项，详见[位置约束](/knowledge/pbd-xpbd-math/)。

旋转状态不属于普通欧氏向量，四元数需要满足单位长度，角速度也要区分世界/本体空间。不能把这里的一维代码逐分量套用到旋转并宣称完成刚体积分；空间约定见[UE 空间数学](/knowledge/ue-linear-algebra-guide/)，工程链路见[刚体 AVBD 实现](/knowledge/avbd-demo3d-implementation/)。

空间离散后的 PDE 也能得到 ODE 系统，但特征时间尺度取决于网格、材料与离散算子。CFL 等条件需单独推导，见[PDE](/knowledge/partial-differential-equations/)与[SPH](/knowledge/sph-fluid-simulation/)。

<span id="学习位置" aria-hidden="true"></span>
<span id="本文模块" aria-hidden="true"></span>
<span id="9-方法对比与选择" aria-hidden="true"></span>
<span id="91-综合对比表" aria-hidden="true"></span>
<span id="92-应用场景推荐" aria-hidden="true"></span>
<span id="921-游戏实时模拟" aria-hidden="true"></span>
<span id="922-精确科学模拟" aria-hidden="true"></span>
<span id="923-刚性系统" aria-hidden="true"></span>
<span id="924-约束系统" aria-hidden="true"></span>
<span id="93-决策流程图" aria-hidden="true"></span>
<span id="94-性能考量" aria-hidden="true"></span>
<span id="941-每帧计算次数" aria-hidden="true"></span>
<span id="942-内存占用" aria-hidden="true"></span>
<span id="12-最佳实践" aria-hidden="true"></span>
<span id="121-选择积分器的黄金法则" aria-hidden="true"></span>
<span id="122-时间步长建议" aria-hidden="true"></span>
<span id="123-常见陷阱" aria-hidden="true"></span>
<span id="1231--错误使用显式欧拉" aria-hidden="true"></span>
<span id="1232--正确使用半隐式欧拉" aria-hidden="true"></span>
<span id="1233--错误大时间步长" aria-hidden="true"></span>
<span id="1234--正确子步进" aria-hidden="true"></span>
<span id="124-调试技巧" aria-hidden="true"></span>
<span id="1241-能量监控" aria-hidden="true"></span>
<span id="1242-稳定性检查" aria-hidden="true"></span>
<span id="125-性能优化清单" aria-hidden="true"></span>
<span id="126-数值稳定性清单" aria-hidden="true"></span>
<span id="参考文献" aria-hidden="true"></span>
<span id="总结" aria-hidden="true"></span>
<span id="核心要点" aria-hidden="true"></span>
<span id="快速查询表" aria-hidden="true"></span>

## 工程选择与证据边界

以下是选择方向，不是引擎的统一默认值：

- 低成本交互基线：从固定步长、简单更新开始，用误差和频率检查是否足够。
- 光滑且更关注有限时长精度：比较 RK2/RK4 与步长减半的收益。
- 快速衰减模态限制显式步长：评估隐式方法，计入求解残差与数值耗散。
- 长时间保守运动：评估几何积分、相位和能量误差，不等同于要求逐步精确能量。
- 接触密集、强约束：先分析完整流水线，再决定子步与约束预算；不靠积分阶数单独解决穿透和抖动。

本文的公式与代码是独立数值模型；不据此判断 Chaos、PhysX 或插件当前使用哪种积分器。真实执行链分别查[Chaos](/knowledge/ue-chaos-physics-engine/)、[three-avbd](/knowledge/three-avbd-gpu-solver/)和[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)，运行性能需在对应工程中测量。

针对刚体，可以继续到[接触响应](/knowledge/contact-response-and-manifolds/)；针对软体，回到[形变与材料](/knowledge/deformable-body-dynamics/)；针对流体，回到[压力与边界](/knowledge/fluid-dynamics/)。时间积分是共享计算工具，不能单独决定材料响应和全部约束条件。
