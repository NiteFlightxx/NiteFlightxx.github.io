---
title: "流体动力学：从守恒与压力到网格和粒子"
excerpt: "先理解平流、压力、黏性和边界，再选择网格、SPH、PBF 或粒子网格混合方法。"
date: "2026-10-24"
category: "Physics"
subtopic: "Fluid"
tags: ["流体力学", "不可压缩", "压力投影", "SPH", "FLIP"]
readTime: "阅读约22分钟"
kind: "theory"
level: "intermediate"
pageType: "guide"
prerequisites: ["continuum-mechanics"]
nextArticles: ["sph-fluid-simulation"]
related: ["pbf-fluid-simulation", "deformable-body-dynamics", "partial-differential-equations", "multiphysics-coupling"]
sources:
  - title: "Bridson and Müller-Fischer — Fluid Simulation"
    url: "https://www.cs.ubc.ca/~rbridson/fluidsimulation/fluids_notes.pdf"
  - title: "Macklin and Müller — Position Based Fluids"
    url: "https://mmacklin.com/pbf_sig_preprint.pdf"
  - title: "Stomakhin et al. — A Material Point Method for Snow Simulation"
    url: "https://disneyanimation.com/publications/a-material-point-method-for-snow-simulation/"
---

水可以保持近似体积，却持续改变形状；烟雾会被流场搬运、形成旋涡并与周围空气混合。流体模拟必须同时说明物质怎样移动、内部怎样传递作用、边界怎样阻挡或驱动运动。

本篇接续[连续介质](/knowledge/continuum-mechanics/)，先建立常见不可压缩牛顿流体的共同模型，再说明网格、粒子和混合方法分别承担什么职责。SPH 和 PBF 是随后深入的具体路线，流体知识本身不被限定为粒子算法。

## 流体与软固体在哪里不同

弹性固体可以在静止形变后保持剪切恢复；普通流体在持续剪切作用下会继续流动，其黏性作用与变形速率有关。不可压缩橡胶与水都能近似保持体积，但前者仍有弹性形状记忆。

典型状态包括速度场 $v(x,t)$、密度 $\rho$、压力 $p$、自由表面与边界信息。可压缩或热流体还需要温度、能量与状态方程；这里先用定密度、等温的不可压缩模型。

可视烟雾浓度通常是被流动搬运的标量，不能直接等同于机械方程中的质量密度。液体可见表面的重建也不是求解流体运动的替代。

## 质量与动量方程先于算法

对不可压缩、定密度、定黏度的牛顿流体：

$$
\nabla\cdot v=0,
$$

$$
\frac{\partial v}{\partial t}+(v\cdot\nabla)v
=-\frac1\rho\nabla p+\nu\nabla^2v+g,\qquad \nu=\mu/\rho.
$$

这里 $\mu$ 为动力黏度，$\nu$ 为运动黏度，单位分别是 $\mathrm{Pa\,s}$ 与 $\mathrm{m^2/s}$。方程还需要初值和边界条件。

左边是沿材料轨迹的加速度：流动中的小块材料，既可能遇到随时间改变的速度场，也会因经过不同位置而改变速度。右边分别是压力梯度、黏性与体力加速度。

变密度、可压缩、非牛顿材料与相变需要重新列项。不能把这组简化方程直接当成所有液体、气体和泥浆的完整模型。

## 平流是量随流动搬运

对没有源汇和扩散的被动标量 $a$：

$$
\frac{\partial a}{\partial t}+v\cdot\nabla a=0.
$$

网格方法需要显式处理物质跨网格的运输；跟随材料的粒子则通过位置更新自然携带属性。数值上仍可能产生扩散、振荡或传递误差，并非使用粒子后就没有误差。

半拉格朗日方法通过回溯位置采样旧场，可以缓解一些平流步长限制，但不自动保证质量、动量或能量严格守恒，也不解除整个流体求解的所有步长条件。

## 压力协调局部运动与体积条件

压力产生法向应力，空间梯度改变流体动量。在不可压缩模型中，压力常作为满足体积约束所需的未知量求出；弱可压缩模型则可以通过密度与状态方程得到压力。二者闭合方式不同。

一次压力投影常先得到未满足不可压缩条件的速度 $v^*$，再求

$$
v^{n+1}=v^*-\frac h\rho\nabla p.
$$

要求 $\nabla\cdot v^{n+1}=0$，在上述常密度条件下得到

$$
\nabla^2p=\frac\rho h\nabla\cdot v^*.
$$

这是压力 Poisson 问题。墙面、自由表面、入流与出流决定边界条件。只写一个 Laplacian 迭代而不说明边界，尚未定义完整的压力求解。

### 用两个封闭单元理解压力梯度

考虑一维两个等长单元，两端墙面速度为零，中间面候选速度向右。左单元因此流出，右单元流入。压力修正需要消除这次相互挤压。

<figure class="physics-figure">
  <div class="physics-figure-grid">
    <svg viewBox="0 0 320 225" role="img" aria-label="投影前内部面向右流动使左单元流出右单元流入">
      <path class="diagram-line" d="M30 62V158M290 62V158M30 62H290M30 158H290"/>
      <path class="diagram-muted" d="M160 62V158" stroke-dasharray="4 4"/>
      <path class="diagram-accent" d="M112 110H208M197 101L208 110L197 119"/>
      <text x="39" y="45">左墙：0</text><text x="212" y="45">右墙：0</text>
      <text x="42" y="189">流出</text><text x="209" y="189">流入</text><text x="108" y="215">投影前：q ≠ 0</text>
    </svg>
    <svg viewBox="0 0 320 225" role="img" aria-label="压力梯度反向修正内部面速度至零">
      <path class="diagram-line" d="M30 62V158M290 62V158M30 62H290M30 158H290"/>
      <path class="diagram-muted" d="M160 62V158" stroke-dasharray="4 4"/>
      <path class="diagram-accent" d="M210 110H112M123 101L112 110L123 119"/>
      <text x="56" y="88">p₀</text><text x="203" y="88">p₁ &gt; p₀</text>
      <text x="66" y="189">压力梯度产生向左修正</text><text x="105" y="215">投影后：q = 0</text>
    </svg>
  </div>
  <figcaption>箭头分别表示候选通量方向与压力修正方向；这是封闭一维最小问题，不是所有流动都必须静止。</figcaption>
</figure>

取单元长度 $\Delta x$，固定压力常数自由度 $p_0=0$，令 $p_1=\rho\Delta x\,q/h$，就使内部速度 $q-h(p_1-p_0)/(\rho\Delta x)=0$。一般多维流场仍允许无散度的非零运动。

## 黏性与静水压力提供独立基准

黏性扩散速度差，简单剪切流 $v_x=\dot\gamma y$ 的剪切应力为 $\tau_{xy}=\mu\dot\gamma$。它不应被简单描述为“每步把所有速度乘以同一常数”；运动边界与速度梯度同样重要。

静止、均匀密度、水平自由表面的液体中，以向上为 $y$，有 $\partial p/\partial y=-\rho g$。表面下深度 $H$ 处的表压为 $p=\rho gH$。取 $\rho=1000$、$H=0.5\,\mathrm m$，得到 $4900\,\mathrm{Pa}$。

静水压力平衡重力，黏性控制相对剪切，二者检验不同物理项。对静水池增加黏度并不能修复错误的压力边界或丢失的重力项。

## 边界也是方程的一部分

固定不可穿透墙要求流体法向速度与墙一致；移动墙要使用边界速度。无滑移进一步约束切向速度，自由滑移则有不同切向条件。

自由表面通常涉及外部压力和表面张力；封闭容器的压力可能有一个常数自由度，需要固定规范并满足通量兼容条件。入流和出流也不能被一律当作零速度墙。

物体应感受到流体的压力与剪切反作用。若只让流体绕开固体而不给固体反馈，是单向边界驱动；[双向耦合](/knowledge/multiphysics-coupling/)还需把界面作用传回。

## 网格粒子与混合方法怎样选择

### 网格流体

固定网格常用于烟雾和液体的欧拉场。交错 MAC 网格把压力和速度分量放在不同位置，便于构造相容的散度与梯度。有限体积、有限差分和有限元是进一步的离散选择。

自由表面还可以用 level set、VOF 或粒子辅助追踪。描述界面的方式与如何计算压力和黏性可以组合，不是一种方法包办全部阶段。

### SPH 与 PBF

[SPH](/knowledge/sph-fluid-simulation/)用移动粒子和核函数近似场，便于跟随材料与自由边界，但密度、梯度、邻域不足和固体边界仍需仔细处理。

[PBF](/knowledge/pbf-fluid-simulation/)把粒子密度误差组织为位置约束迭代。它复用粒子邻域，但改变了不可压缩条件的求解方式。压力型 SPH 与 PBF 不能简单按“有压力/完全无压力”划分，位置乘子也有对应的物理解释与离散尺度。

### PIC FLIP 与 MPM

PIC/FLIP 等混合方法让粒子携带材料信息，在网格上完成部分场求解，再回传。PIC 回传插值速度，FLIP 侧重传递网格速度增量；耗散、噪声与插值一致性因此不同。

MPM 同样使用材料点与网格，但材料点还可携带形变和本构历史，用于固体、雪、颗粒或流体等。它不是另一种材料分类，也不是 FLIP 的通用别名。

## 气体颗粒与复杂材料如何接入

烟雾常用低速不可压缩流动加浓度与浮力近似；高速气体、冲击波和显著密度变化则需要可压缩模型与能量闭合。

颗粒可以逐粒建接触，也可以在选定尺度上用摩擦塑性连续模型近似。泡沫、多相流、非牛顿流体和泥沙混合还要加入各自的界面或材料状态。它们从守恒、材料关系、离散与边界逐层扩展，而不是再堆一组脱离模型的缩写。

## 核对最小压力问题

~~~js
// knowledge-fluid-example
export function projectClosedPair(q, rho, dx, dt) {
  if (![q,rho,dx,dt].every(Number.isFinite) || rho <= 0 || dx <= 0 || dt <= 0) throw new Error('invalid projection');
  const pressure = [0, rho*dx*q/dt];
  const corrected = q-dt*(pressure[1]-pressure[0])/(rho*dx);
  return { pressure, faces: [0,corrected,0], divergence: [corrected/dx,-corrected/dx] };
}
export function hydrostaticPressure(rho, gravity, depth) {
  if (![rho,gravity,depth].every(Number.isFinite) || rho <= 0 || gravity < 0 || depth < 0) throw new Error('invalid hydrostatic state');
  return rho*gravity*depth;
}
~~~

这些函数核对符号、单位和边界约定，没有实现完整平流、黏性、自由表面或 Navier–Stokes 求解。进一步读 SPH/PBF 时，应把每个公式放回这些职责，而非仅凭流体粒子的外观判断正确性。
