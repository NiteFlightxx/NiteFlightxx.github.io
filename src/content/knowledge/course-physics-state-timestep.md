---
title: "状态与时间步：从速度到位置"
excerpt: "用匀速运动解释状态更新、单位与固定步长，区分模拟时间和渲染帧。"
date: "2026-10-21"
category: "Physics"
subtopic: "RigidBodyDynamics"
tags: ["刚体物理", "时间步", "状态更新"]
readTime: "阅读约12分钟"
contentRole: "lesson"
kind: "theory"
level: "foundation"
prerequisites: []
nextArticles: []
pageType: "guide"
aliases: ["把运动写成一次时间步：位置为什么要乘以时间？"]
---
运动模拟首先需要回答两个问题：保存什么状态，以及这次推进了多长时间。下面从匀速运动说明位置更新，再用固定步长累积器区分渲染帧和模拟步；受力、误差与稳定性分别转到[ODE](/knowledge/differential-equations/)和[数值积分](/knowledge/numerical-integration-methods/)。

## 给模拟定义状态

取一个固定坐标轴，向右为正。物体初始位置与恒定速度为：

$$
x_0=0\,\mathrm m,\qquad v=2\,\mathrm{m/s}.
$$

位置表示当前在哪里，速度表示每秒改变多少位置。时间间隔记为 $h$。在速度保持不变的前提下：

$$
\Delta x=vh,\qquad x_{n+1}=x_n+vh.
$$

为什么要乘时间？因为单位必须成立：

$$
\frac{\mathrm m}{\mathrm s}\cdot\mathrm s=\mathrm m.
$$

把速度直接加到位置，不仅语义错误，也会让运动依赖每秒执行多少次更新。

这里的状态可以只记录位置与速度。步长是推进参数；它不是另一个位置，也不是固定必须等于显示器刷新间隔。

## 手算四次推进

令 $h=0.25\,\mathrm s$，每次位移都是 $0.5\,\mathrm m$。四次更新后：

$$
x_1=0.5\,\mathrm m,\quad
x_2=1\,\mathrm m,\quad
x_3=1.5\,\mathrm m,\quad
x_4=2\,\mathrm m.
$$

对应模拟时间为：

$$
t_4=4h=1\,\mathrm s.
$$

改用 $h=0.1\,\mathrm s$ 推进十次，同一时刻仍得到 $2\,\mathrm m$。比较不同步长时，要比较**相同模拟时间**，不能比较相同步数。

## 可操作的小实验

<div data-demo="course-timestep">无 JavaScript 时：速度取每秒 2 米，分别用 0.25 秒推进 4 步、用 0.1 秒推进 10 步。两者在模拟时间 1 秒都应到达 2 米。</div>

实验只验证恒定速度模型。若代码里每步只做“位置加速度”，缩小步长反而会增加一秒内的位移，这是检查丢失时间因子的直接方法。

## 从模型写到代码

以下是本文程的示例代码，不是 Chaos 源码，也没有调用浏览器帧时钟：

~~~js
function step(state, h) {
  return {
    x: state.x + state.v * h,
    v: state.v,
  };
}

let state = { x: 0, v: 2 }; // 米、米每秒
for (let i = 0; i < 4; i++) state = step(state, 0.25);
console.assert(Math.abs(state.x - 2) < 1e-12);
~~~

这里没有重力，所以速度不需要变化。以后加入力时，必须为速度建立更新规则，不能把本文的准确性直接推广到任意积分器。

## 一帧渲染，不一定只有一次物理更新

渲染帧间隔与模拟步长是两个概念。固定步长累积器把渲染经过的时间存起来，只在足够推进完整一步时执行模拟：

~~~js
accumulator += frameDelta;
while (accumulator >= h) {
  state = step(state, h);
  accumulator -= h;
  simulationTime += h;
}
~~~

取固定步长 $h=0.02\,\mathrm s$，初始剩余时间为零：

- 第一帧经过 $0.018\,\mathrm s$：不足一步，不推进，剩余 $0.018\,\mathrm s$。
- 第二帧经过 $0.034\,\mathrm s$：累计 $0.052\,\mathrm s$，推进两步，剩余 $0.012\,\mathrm s$。

第二帧结束时：

$$
t_{\mathrm{wall}}=0.052\,\mathrm s,\qquad
t_{\mathrm{sim}}=0.04\,\mathrm s,\qquad
a=0.012\,\mathrm s.
$$

物理状态的位置为 $0.08\,\mathrm m$，不能把它当作墙钟时刻的解析位置 $0.104\,\mathrm m$。前者对应较早的模拟时间。

**工程建议**：生产代码还要处理单帧追赶预算、暂停、超长帧与渲染插值。限制子步数后，是保留积压时间还是丢弃，属于明确的时间策略取舍。本例故意不加入这些策略，以免掩盖时间的账目。

## 固定步长解决了什么，没解决什么？

对于本文的恒定速度，任意一组正步长只要总和相同，数学上就有：

$$
x_N=x_0+v\sum_{n=0}^{N-1}h_n.
$$

因此不能笼统地说“变步长一定不稳定”。固定步长主要让一般模拟的离散条件、求解预算与测试条件更可控；它本身不保证碰撞正确、约束收敛或跨平台确定性。

还要分开三类问题：

- **模型问题**：假设恒速，但实际物体受力。
- **数值问题**：模型成立，但离散更新或浮点计算带来误差。
- **呈现问题**：模拟与渲染时间不同，画面缺少恰当插值。

不能用增加阻尼或清空速度来“修复”时间账目错误。

## 对照结果时先对齐模拟时间

速度为 $3\,\mathrm{m/s}$、步长为 $0.1\,\mathrm s$ 时，一步的位移是 $0.3\,\mathrm m$。改变步长后，应在相同模拟时刻比较位置，而不是在相同步数后比较。

上面的两帧例子只消费了 $0.04\,\mathrm s$ 的模拟时间，因此还不能把物理状态当作墙钟 $0.052\,\mathrm s$ 的结果。这个时间差与积分误差是不同的问题。

恒速模型的结果正确，也不能证明加入重力后的积分器稳定；需要针对新的模型与误差机制重新验证。

## 深入参考与证据边界

本文是通用简化模型与自编代码，不声称它就是 UE 的实际调度方式，也不包含 UE 运行时验收。之后需要比较积分方法时，查阅[数值积分方法](/knowledge/numerical-integration-methods/)；需要完整力学模型时，查阅[经典力学](/knowledge/classical-mechanics/)。
