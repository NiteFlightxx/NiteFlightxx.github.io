---
title: "质点动力学：从运动描述到动量与能量"
excerpt: "在同一套参考系和状态约定下，解释力、冲量、功、能量以及弹簧阻尼怎样决定运动。"
date: "2026-10-24"
category: "Physics"
subtopic: "ParticleDynamics"
tags: ["质点动力学", "运动学", "动量", "能量", "弹簧阻尼"]
readTime: "阅读约25分钟"
kind: "theory"
level: "foundation"
pageType: "guide"
prerequisites: ["physics-simulation-overview"]
nextArticles: ["continuum-mechanics"]
related: ["calculus-foundations", "differential-equations", "classical-mechanics", "numerical-integration-methods"]
sources:
  - title: "OpenStax — Newton's Second Law"
    url: "https://openstax.org/books/university-physics-volume-1/pages/5-3-newtons-second-law"
  - title: "OpenStax — Conservative and Non-Conservative Forces"
    url: "https://openstax.org/books/university-physics-volume-1/pages/8-2-conservative-and-non-conservative-forces"
  - title: "OpenStax — Simple Harmonic Motion"
    url: "https://openstax.org/books/university-physics-volume-1/pages/15-1-simple-harmonic-motion"
  - title: "OpenStax — Damped Oscillations"
    url: "https://openstax.org/books/university-physics-volume-1/pages/15-5-damped-oscillations"
---

一个箱子可以下落、被推进、连接弹簧，也可以受到空气阻力。如果暂时只关心它整体的位置，不关心朝向和内部变形，就可以先用质点描述它。质点模型把问题压缩到平移，便于看清“状态决定受力，受力改变运动”的关系。

本篇采用质量恒定、经典非相对论的模型，从惯性系中的位置和速度开始。先得到连续运动方程和可以核对的解析结果，再在[数值积分](/knowledge/numerical-integration-methods/)中讨论计算方法。随后[连续介质](/knowledge/continuum-mechanics/)将守恒推广到材料场；姿态与惯性则在[刚体分支](/knowledge/rigid-body-dynamics/)中展开。

## 质点模型保留什么

质点不是断言物体真的没有体积，而是为当前问题忽略其转动与内部结构。质量集中到一个运动位置，状态通常写作

$$
y(t)=(x(t),v(t)),
$$

其中 $x\in\mathbb R^3$ 是位置，$v\in\mathbb R^3$ 是速度。主线使用米、秒和千克；对应的加速度、力和能量单位分别是 $\mathrm{m/s^2}$、$\mathrm N$ 和 $\mathrm J$。

质量 $m$ 是参数，外部控制输入可记为 $u(t)$，形状半径可以另外参与几何查询，但它不会自动给这个质点增加转动自由度。用一个球形碰撞体表示粒子，也不表示已经建立了球的滚动动力学。

若只关心自由落体时的质心，质点足够；若要解释偏心推力、滚动或翻倒，就需要刚体。若要解释弯曲、拉伸和内部振动，还需要更多状态。

## 位置速度与加速度

### 从位移到瞬时变化率

时间间隔 $\Delta t$ 内的平均速度为

$$
\bar v=\frac{x(t+\Delta t)-x(t)}{\Delta t}.
$$

瞬时速度是它在间隔趋零时的极限，加速度是速度的变化率：

$$
v=\dot x,\qquad a=\dot v=\ddot x.
$$

这里的点表示对时间求导。速度是向量，速率 $\|v\|$ 是标量。物体沿圆周匀速率运动时，速度方向持续改变，所以加速度并不为零。

位置、速度与加速度的关系属于运动学，还没有说明改变速度的原因。知道 $x(t)$ 可以求出 $v(t)$ 与 $a(t)$；想预测另一组初态下的轨迹，则需要动力学规律。

### 初值为何不能省略

给定加速度，不等于已经确定轨迹。对于恒定向量加速度 $a_0$：

$$
v(t)=v_0+a_0t,\qquad
x(t)=x_0+v_0t+\frac12a_0t^2.
$$

相同重力下，不同初速度分别产生落下、上抛或斜抛。初值 $x_0,v_0$ 是解的一部分，不是可随意丢弃的实现细节。

这些公式要求加速度恒定。对于依赖位置的弹簧力，不能在一整段运动中冻结初始加速度后仍称其为解析解。

## 参考系决定方程怎样使用

选定参考系后，位置、速度和受力都必须在相容的坐标中表达。这里先采用近似惯性系，牛顿方程不需要额外的惯性力。

以恒定速度 $U$ 平移、轴方向不变的另一个惯性系满足

$$
x'=x-Ut,\qquad v'=v-U,\qquad a'=a.
$$

两个系中的速度可以不同，但加速度相同。若参考原点还有加速度 $a_O$，轴仍不旋转，则 $a'=a-a_O$；想保持同样的方程形式，需要加入 $-ma_O$。

旋转参考系还会出现与角速度相关的项。本篇不在尚未定义三维转动时直接套用它们。UE 的局部/世界变换用于表达向量和点，也不自动完成非惯性系动力学的推导。

## 牛顿方程决定速度怎样变化

在恒定质量、惯性系的范围内，

$$
P=mv,\qquad \dot P=F_{\mathrm{net}},\qquad
\dot x=v,\quad \dot v=\frac{F_{\mathrm{net}}(x,v,t,u)}m.
$$

$P$ 是线动量，$F_{\mathrm{net}}$ 是作用在当前物体上的合力。公式中的自变量说明，力可以来自位置、速度、时间和控制输入。

力改变的是动量与速度，不是直接提供一个位置。合力为零意味着速度不再改变，物体可以保持匀速直线运动；“静止”和“没有加速度”需要区分。

对于变质量开放系统，不能省略进出系统的动量通量后直接使用同一组式子。本篇的质量固定。

### 先选系统再判断内外力

只观察物体 A 时，B 对它的弹簧力是外力；把 A、B 与连接作用一起纳入系统时，这对力可以作为内力讨论。内力不是“没有作用”，它可以改变各自运动，只是在合适模型下对总动量的贡献抵消。

普通理想弹簧对两端施加大小相等、方向相反的力。两个端点都能运动时，不需要再把每端的力除以二；它们各自按自己的质量响应。

仅有等大反向还不足以在任意模型中保证总内力矩为零，作用线与参考点也要相容。角动量将在刚体篇进一步说明。

## 从重力到依赖状态的力

### 均匀重力和固定推力

均匀重力写为 $F_g=mg$，所以 $\dot v=g$。本篇取竖直向上为正，$g_y=-9.8\,\mathrm{m/s^2}$。质量改变时，重力与惯性质量按同一比例改变，落体加速度保持不变。

固定推力 $F_{\mathrm{push}}$ 则产生 $F_{\mathrm{push}}/m$。因此给不同质量物体相同的推力，通常得到不同的速度变化。

### 弹簧把位移变成恢复力

对沿单轴运动、相对于固定平衡点的位移 $q=x-x_{\mathrm{eq}}$，线性弹簧力为

$$
F_s=-kq,\qquad k>0.
$$

负号表示朝向平衡点。刚度 $k$ 的单位为 $\mathrm{N/m}$。它描述模型中的恢复强度，并不是数值求解器的迭代次数。

在三维两点弹簧中，还需用当前连接方向把长度误差转为向量。若长度为零，方向没有唯一值，不能靠除以一个极小数就声称模型已经确定。

### 阻尼依赖相对速度

单轴线性阻尼可以写作 $F_d=-cv$，$c\ge0$、单位为 $\mathrm{kg/s}$。若阻尼元件连接两个运动端点，应使用它们的相对速度；只沿连接轴耗散的元件还需要投影到该方向。

线性阻尼、空气阻力和接触摩擦是不同模型。空气阻力还可能近似与速率平方相关；库仑摩擦受法向支撑限制，不能把它统一替换成 $-cv$。

## 冲量连接有限作用时间与速度跳变

将动量方程在一段时间内积分：

$$
j=\int_{t^-}^{t^+}F\,dt,\qquad
P^+=P^-+j,\qquad v^+=v^-+\frac jm.
$$

$j$ 为冲量，单位是 $\mathrm{N\,s}=\mathrm{kg\,m/s}$。质量 $2\,\mathrm{kg}$ 的质点受到向右 $6\,\mathrm{N\,s}$ 的冲量，速度立即增加 $3\,\mathrm{m/s}$。

同一物体受到 $6\,\mathrm N$ 的恒力，持续 $0.5\,\mathrm s$，则只得到 $3\,\mathrm{N\,s}$ 冲量，速度增加 $1.5\,\mathrm{m/s}$。数值相同的“力”和“冲量”不能直接互换。

理想瞬时冲量使速度跳变，位置在该瞬间连续。现实接触可以在短时间内变形并积累冲量；把碰撞理想化为瞬时事件，是模型选择。

程序中，持续力应随子步长度积累；一次性冲量应消费一次。把同一次冲量在每个子步重复施加，会改变问题本身。

## 功与能量提供另一条推导路径

### 从牛顿方程得到功动能关系

将 $m\dot v=F$ 与速度点乘，有

$$
F\cdot v=m\dot v\cdot v
=\frac{d}{dt}\left(\frac12m\|v\|^2\right).
$$

定义动能 $T=\tfrac12m\|v\|^2$，可得 $\dot T=F\cdot v$，也就是功率。沿轨迹积分后：

$$
\Delta T=W=\int F\cdot dx.
$$

与位移垂直的力可以改变运动方向，却在该瞬间不改变动能。能量是标量，通常不能单独恢复完整速度方向。

### 势能与机械能

若力可以写为 $F_c=-\nabla V(x)$，且势能不显含时间，则

$$
\frac{d}{dt}(T+V)=F_{\mathrm{nc}}\cdot v.
$$

均匀重力的势能可写为 $V=mgy$，这里 $g=9.8$ 是正的重力大小；线性弹簧势能为 $V=\tfrac12kq^2$。势能加一个常数不会改变力。

只有在相应条件下机械能才守恒。对线性阻尼 $F_{\mathrm{nc}}=-cv$，有 $\dot E=-c\|v\|^2\le0$。受控推进器可以输入机械能；运动边界或显含时间的势能也需要额外项。

## 用落体同时核对运动与能量

质量为 $2\,\mathrm{kg}$ 的物体，其质心从 $y_0=2\,\mathrm m$ 静止释放。忽略转动、阻力和接触，解析轨迹为

$$
y(t)=2-4.9t^2,\qquad v_y(t)=-9.8t.
$$

在 $t=0.5\,\mathrm s$ 时，$y=0.775\,\mathrm m$，$v_y=-4.9\,\mathrm{m/s}$。此时动能为 $24.01\,\mathrm J$、势能为 $15.19\,\mathrm J$，总和仍为初始的 $39.2\,\mathrm J$。

如果再为碰撞查询指定半径 $0.5\,\mathrm m$，接触平面前的终点是质心高度 $0.5$，不是零。相触时间为 $\sqrt{3/9.8}\approx0.553283\,\mathrm s$。接触之后自由落体公式不再描述完整运动，需要加入响应。

这个算例把假设、初值、连续解和终止条件连接起来，也为数值积分提供一个独立基准。

## 弹簧阻尼把状态反馈连起来

围绕固定平衡点的单轴系统满足

$$
m\ddot q+c\dot q+kq=f(t).
$$

无外驱动、无阻尼时，固有角频率为 $\omega_n=\sqrt{k/m}$，一般解可写为

$$
q(t)=q_0\cos(\omega_nt)+\frac{v_0}{\omega_n}\sin(\omega_nt).
$$

例如 $m=2\,\mathrm{kg}$、$k=8\,\mathrm{N/m}$，则 $\omega_n=2\,\mathrm{rad/s}$，周期为 $\pi\,\mathrm s$。取 $q_0=0.5\,\mathrm m$、$v_0=0$，有 $q(t)=0.5\cos(2t)$、$v(t)=-\sin(2t)$，机械能恒为 $1\,\mathrm J$。

当 $k>0$ 时，阻尼比定义为

$$
\zeta=\frac{c}{2\sqrt{mk}}.
$$

在该线性无外驱动模型中，$0<\zeta<1$ 为欠阻尼，$\zeta=1$ 为临界阻尼，$\zeta>1$ 为过阻尼。它们描述围绕固定平衡点的自然响应；不能据此保证任意驱动输入下都不越过目标。

这个例子的临界阻尼为 $c=8\,\mathrm{kg/s}$。取同样初态时，临界阻尼解为 $q(t)=0.5(1+2t)e^{-2t}$、$v(t)=-2t e^{-2t}$。它连续耗散能量；数值算法造成的额外衰减，应与真实阻尼区分。

## 用可执行算例核对连续模型

下面代码只求上面已给出的解析结果，不承担时间积分。后续比较不同积分器时，可以用这些结果检查误差。

~~~js
// knowledge-particle-example
export function fall(t, { mass = 2, height = 2, velocity = 0, gravity = -9.8 } = {}) {
  if (![t, mass, height, velocity, gravity].every(Number.isFinite) || t < 0 || mass <= 0) throw new Error('invalid model');
  const x = height + velocity * t + 0.5 * gravity * t * t;
  const v = velocity + gravity * t;
  return { x, v, kinetic: 0.5 * mass * v * v, potential: -mass * gravity * x };
}
export function oscillator(t, { mass = 2, stiffness = 8, x0 = 0.5, v0 = 0, critical = false } = {}) {
  if (![t, mass, stiffness, x0, v0].every(Number.isFinite) || t < 0 || mass <= 0 || stiffness <= 0) throw new Error('invalid model');
  const w = Math.sqrt(stiffness / mass);
  let x, v;
  if (critical) {
    const b = v0 + w * x0;
    const decay = Math.exp(-w * t);
    x = (x0 + b * t) * decay;
    v = (v0 - w * b * t) * decay;
  } else {
    x = x0 * Math.cos(w * t) + v0 / w * Math.sin(w * t);
    v = -w * x0 * Math.sin(w * t) + v0 * Math.cos(w * t);
  }
  return { x, v, energy: 0.5 * mass * v * v + 0.5 * stiffness * x * x };
}
~~~

自由落体函数没有地面，超过接触时刻后仍继续返回自由解，不能把它误当成完整落地模拟。无阻尼振子与临界阻尼振子也分别对应不同的物理参数。

## 从一个质点走向刚体与约束

若系统包含多个质点，总线动量满足 $\dot P_{\mathrm{total}}=F_{\mathrm{ext,total}}$，前提是内力成对抵消。总动量守恒不代表每个质点的动量不变，内部相互作用仍可重新分配运动。

一个刚体的质心也遵循这样的平移方程，但物体还可以整体转动；软体与流体则保留不同程度的内部运动。下一篇[连续介质](/knowledge/continuum-mechanics/)从材料场、应力与守恒建立三类模型的共同语言。若当前只关心整体转动，也可以直接进入[刚体分支](/knowledge/rigid-body-dynamics/)。

约束进一步规定哪些相对运动允许发生；分析力学则研究怎样用其他坐标和能量组织同一组方程。它们分别在[物理约束](/knowledge/physics_constraints_deep_dive/)和[经典力学表述](/knowledge/classical-mechanics/)中深入。此时先保留已经建立的因果链：状态决定受力，合力改变动量，运动方程与初值共同决定轨迹。
