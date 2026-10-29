---
title: "连续介质力学：从质点到固体与流体"
excerpt: "用运动映射、质量守恒、应力和材料关系，连接刚体、可变形固体与流体。"
date: "2026-10-24"
category: "Physics"
subtopic: "ContinuumMechanics"
tags: ["连续介质", "守恒律", "形变梯度", "应力", "材料模型"]
readTime: "阅读约20分钟"
kind: "theory"
level: "intermediate"
pageType: "guide"
prerequisites: ["particle-dynamics"]
nextArticles: []
related: ["rigid-body-dynamics", "deformable-body-dynamics", "fluid-dynamics", "numerical-integration-methods", "partial-differential-equations"]
sources:
  - title: "Sifakis — FEM Simulation of 3D Deformable Solids, Part One"
    url: "https://www.cs.toronto.edu/~jacobson/seminar/sifakis-course-notes-2012.pdf"
  - title: "Bridson and Müller-Fischer — Fluid Simulation Course Notes"
    url: "https://www.cs.ubc.ca/~rbridson/fluidsimulation/fluids_notes.pdf"
---

[质点动力学](/knowledge/particle-dynamics/)把一个物体的平移写成质量、速度与合力的关系。现在把木块、橡胶块和一团水放在同一环境中：它们都具有质量、动量并受到重力，但木块近似保持形状，橡胶会恢复形状，水会流动并重新组织表面。

区别不在牛顿定律是否适用，而在内部自由度与内部作用如何建模。连续介质把物质近似成连续分布的场，用共同守恒规律组织运动，再通过材料关系区分固体与流体。本篇建立这层共同语言；弹性和流体的具体方程分别在后续分支完整展开。

## 连续近似描述的是一个尺度

连续介质不逐个追踪真实分子，而是在所关心的尺度上，用密度、速度、应力等平滑场描述材料。场量是在小体积上的平均，其适用性依赖观察尺度和材料结构。

模拟中的粒子可以代表一小块连续材料，网格节点可以代表场的自由度，它们通常都不是单个真实分子。离散颗粒法中的砂粒则可能直接代表有接触的颗粒；“使用粒子”本身不足以确定物理模型。

刚体是对内部运动的强限制；弹性体允许形变并提供恢复作用；流体允许持续剪切变形。它们可以共享守恒关系，但保留的状态和材料闭合不同。

## 运动映射让材料点具有身份

用 $X$ 标记参考状态中的材料点，用

$$
x=\varphi(X,t)
$$

给出它在当前时刻的位置。$\varphi$ 称为运动或形变映射。刚体中它被限制为 $x=c(t)+R(t)X$；一般可变形体的不同位置可以具有不同局部运动。

位移 $u(X,t)=\varphi(X,t)-X$ 与速度不同：前者比较当前和参考配置，后者是同一个材料点随时间的位置变化率。参考配置还可以是某个建模状态，不必永远等于材料无应力的自然状态。

### 拉格朗日与欧拉描述

拉格朗日描述跟随材料点，速度写为 $V(X,t)=\partial_t\varphi(X,t)$。欧拉描述固定空间位置，速度写为 $v(x,t)$，观察物质流经该处。

两者描述的物理运动可以相同。拉格朗日描述也能使用网格，例如随材料运动的有限元网格；欧拉描述也不等于某一种固定差分格式。观察方式、离散载体和求解器是不同选择。

<figure class="physics-figure">
  <div class="physics-figure-grid">
    <svg viewBox="0 0 320 230" role="img" aria-label="参考配置中的材料网格与被标记的材料点">
      <path class="diagram-line" d="M55 50H235V170H55ZM115 50V170M175 50V170M55 90H235M55 130H235"/>
      <circle cx="115" cy="90" r="6" class="diagram-dot"/>
      <text x="126" y="80">材料点 X</text><text x="90" y="207">参考配置</text>
    </svg>
    <svg viewBox="0 0 320 230" role="img" aria-label="同一材料点经过运动映射后的位置与改变的网格">
      <path class="diagram-accent" d="M55 170L91 74H283L247 170ZM119 170L155 74M183 170L219 74M67 138H259M79 106H271"/>
      <circle cx="143" cy="106" r="6" class="diagram-dot"/>
      <text x="153" y="99">x = φ(X,t)</text><text x="90" y="207">当前配置</text>
    </svg>
  </div>
  <figcaption>标记点具有同一个材料身份，网格随运动映射改变。这个图说明材料坐标与当前位置的联系，不代表所有流体都使用随体网格。</figcaption>
</figure>

### 物质导数包含平流

沿材料轨迹观察一个欧拉场 $a(x,t)$：

$$
\frac{Da}{Dt}=\frac{\partial a}{\partial t}+v\cdot\nabla a.
$$

因此材料加速度为 $Dv/Dt$。即使固定位置的速度场不随时间变化，流动材料经过不同位置时仍可能加速。流体方程中的平流项由这条链式法则产生。

## 形变梯度描述局部长度与体积

形变梯度定义为

$$
F=\frac{\partial\varphi}{\partial X}.
$$

对很小的材料向量 $dX$，当前向量近似为 $dx=F\,dX$。它同时包含局部旋转和伸缩，不能把 $F-I$ 的所有分量都直接解释为纯形变。

在三维、映射光滑且保持朝向的区域内，令 $J=\det F>0$，则体积元满足 $dv=J\,dV$。这里 $J$ 是体积比，不是约束 Jacobian；不同文章中同一字母可能有不同含义。

例如 $F=\operatorname{diag}(2,1,1)$ 使体积变为两倍；$F=\operatorname{diag}(2,1/2,1)$ 保持体积，却明显改变形状。保持体积不等于保持刚体形状。

## 质量守恒连接密度与运动

没有质量源汇时，一个材料体积携带的质量不变：

$$
\rho(x,t)J(X,t)=\rho_0(X).
$$

对初始密度 $1000\,\mathrm{kg/m^3}$ 的均匀材料，局部体积比为 $1.1$ 时，当前密度为 $1000/1.1\approx909.091\,\mathrm{kg/m^3}$。这是质量守恒的结果，不说明需要多少力才能产生这次变形。

相应的欧拉形式为

$$
\frac{\partial\rho}{\partial t}+\nabla\cdot(\rho v)=0,
\qquad
\frac{D\rho}{Dt}+\rho\nabla\cdot v=0.
$$

不可压缩运动要求材料体积保持不变，通常写为 $\nabla\cdot v=0$。均匀材料的密度沿轨迹保持不变；具有密度差异的不可压缩混合模型，不必在全域具有同一个密度值。

## 应力把内部作用写成局部关系

质点只接受一个合力。连续材料内部的相邻部分还会通过切面传递作用。对当前配置中单位法线为 $n$ 的切面，单位面积作用力称为牵引：

$$
t(n)=\sigma n.
$$

$\sigma$ 是 Cauchy 应力，单位为 $\mathrm{Pa}=\mathrm{N/m^2}$。它将切面方向映射到面力方向。常规无独立偶应力的连续介质中，角动量平衡要求应力对称。

内部力不是把各点独立拉回初始位置。它应在相邻材料之间成对传递，并在合适的边界和离散条件下保持整体动量关系。只有材料相互作用和边界条件都明确，才形成完整系统。

### 动量平衡仍然是质量乘加速度

在当前配置中，动量方程为

$$
\rho\frac{Dv}{Dt}=\nabla\cdot\sigma+\rho b.
$$

$b$ 是单位质量体力，例如重力加速度；$\nabla\cdot\sigma$ 为单位体积内力，单位是 $\mathrm{N/m^3}$。不要把表面应力、体积力和节点力当成同一个量直接相加。

这个方程可以用于弹性固体和流体，但尚未说明如何计算应力。材料关系正是缺少的下一层。

## 材料关系决定物体怎样响应

弹性固体的应力与当前形变和参考材料结构有关。超弹性模型可从应变能密度 $\Psi(F)$ 求出应力；橡胶、金属、织物又有不同的各向同性、各向异性、塑性和耗散假设。

简单牛顿流体的应力可以分为

$$
\sigma=-pI+\tau,\qquad
\tau=2\mu D,\qquad D=\tfrac12(\nabla v+\nabla v^T)
$$

这里采用不可压缩、各向同性、常规牛顿黏性关系，$p$ 为压力，$\mu$ 为动力黏度。流体黏性剪切与变形速率有关；弹性固体可以在静止变形后仍保持剪切应力。这是两种典型材料响应的差别。

真实材料还可能黏弹、塑性或具有屈服行为。雪、沙、泥浆不能仅凭外观被归入“非常软的弹簧”或“很黏的水”。需要明确内变量、屈服与流动关系。

## 从能量到力需要一致的配置

对超弹性固体，若能量按参考体积积分：

$$
U=\int_{\Omega_0}\Psi(F)\,dV,
$$

则第一 Piola–Kirchhoff 应力为 $P=\partial\Psi/\partial F$，它和 Cauchy 应力的关系是 $\sigma=J^{-1}PF^T$。这说明参考配置与当前配置的应力不是可随意互换的矩阵。

黏性耗散通常不能只由同一份位置势能完整表达。对于涉及温度、可压缩气体或显著热效应的模型，还需要能量或热力学方程及相应材料关系。

主线首先建立等温机械模型，但不会因此把所有材料都声称为同一个位置能量问题。

## 空间离散之后还要选择时间算法

连续场具有无限多自由度。有限元用形函数描述材料内部位移，有限体积对控制体积守恒，有限差分近似微分算子，SPH 用粒子邻域近似场，MPM 在材料点和背景网格之间传递信息。

空间离散后，一些固体系统可以写为 $M\ddot q=f_{\mathrm{int}}+f_{\mathrm{ext}}$；不可压缩流体还需要同时满足速度与压力的约束。这里的 $q$ 是离散自由度，并不必然是一组刚体姿态。

随后才选择[时间积分](/knowledge/numerical-integration-methods/)、线性/非线性迭代与执行排程。FEM、SPH、MPM 与 Jacobi、CG、Newton、VBD 不是同一层的互斥选项。

## 用体积变化核对质量

下例针对正的对角伸缩，直接核对体积比与密度；它不计算材料应力，也不判断这次变形是否满足边界条件。

~~~js
// knowledge-continuum-example
export function materialVolume(rho0, referenceVolume, stretches) {
  if (!Number.isFinite(rho0) || rho0 <= 0 || !Number.isFinite(referenceVolume) || referenceVolume <= 0 ||
      stretches.length !== 3 || !stretches.every(s => Number.isFinite(s) && s > 0)) throw new Error('invalid material');
  const J = stretches.reduce((a,b) => a*b, 1);
  const volume = referenceVolume*J;
  const density = rho0/J;
  return { J, volume, density, mass: density*volume };
}
~~~

## 从共同基础进入三条模型路线

要研究保持形状的整体运动，进入[刚体动力学](/knowledge/rigid-body-dynamics/)；要解释内部变形与恢复，进入[可变形体动力学](/knowledge/deformable-body-dynamics/)；要解释流动、压力和不可压缩，进入[流体动力学](/knowledge/fluid-dynamics/)。

它们平行共享守恒与建模思想，而非需要按刚体、软体、流体顺序逐一读完。最后，[多物理耦合](/knowledge/multiphysics-coupling/)说明不同模型的边界作用、动量交换与时间推进怎样协调。
