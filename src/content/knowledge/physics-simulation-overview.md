---
title: "动力学总览：刚体、软体与流体的共同脉络"
excerpt: "从状态、守恒与连续介质出发，平行展开刚体、可变形体和流体，再连接离散、求解与耦合。"
date: "2026-10-23"
category: "Physics"
subtopic: "DynamicsFoundations"
tags: ["动力学", "刚体", "软体", "流体", "连续介质"]
readTime: "阅读约18分钟"
kind: "theory"
level: "foundation"
pageType: "guide"
aliases: ["实时物理总览：从状态到一整步模拟", "动力学总览：从运动描述到模拟系统"]
prerequisites: []
nextArticles: ["particle-dynamics"]
related: ["continuum-mechanics", "rigid-body-dynamics", "deformable-body-dynamics", "fluid-dynamics", "multiphysics-coupling", "numerical-integration-methods"]
sources:
  - title: "David Baraff — Rigid Body Dynamics"
    url: "https://www.cs.cmu.edu/~baraff/sigcourse/notesd1.pdf"
  - title: "Sifakis — FEM Simulation of 3D Deformable Solids"
    url: "https://www.cs.toronto.edu/~jacobson/seminar/sifakis-course-notes-2012.pdf"
  - title: "Bridson and Müller-Fischer — Fluid Simulation"
    url: "https://www.cs.ubc.ca/~rbridson/fluidsimulation/fluids_notes.pdf"
featured: true
---

把木块、橡胶块和水倒入同一个容器，它们都受到重力，也都传递动量，但表现不同：木块近似保持形状，橡胶内部形变后恢复，水则流动并重新组织表面。完整的模拟知识体系，应当既解释共同规律，也解释这些差异来自哪里。

本知识库以共同的状态、守恒与连续介质为基础，平行展开刚体、可变形体和流体。时间积分、空间离散、约束求解和并行执行作为共享工具接入各分支；当不同物体相遇时，再研究界面与耦合。刚体是一条重要路线，但不构成软体和流体必须先读完的总路线。

## 共同基础连接三类物理模型

先回答“系统记住什么、质量与动量怎样变化”，再根据目标现象决定保留多少内部运动和材料信息。

<figure class="physics-atlas" aria-label="共同基础下刚体可变形体流体三条平行路线及耦合关系">
  <div class="physics-atlas-common"><a href="/knowledge/particle-dynamics/">运动状态、动量与能量</a><span> → </span><a href="/knowledge/continuum-mechanics/">连续介质、应力与材料关系</a></div>
  <div class="physics-atlas-connector" aria-hidden="true">↓</div>
  <div class="physics-atlas-models">
    <a href="/knowledge/rigid-body-dynamics/"><svg viewBox="0 0 140 90" aria-hidden="true"><path d="M35 25H95V70H35ZM35 25L53 12H113V57L95 70M95 25L113 12M95 25V70M53 12V25" fill="none" stroke="currentColor" stroke-width="2"/></svg><strong>刚体</strong><span>整体平移与转动<br/>近似保持内部形状</span></a>
    <a href="/knowledge/deformable-body-dynamics/"><svg viewBox="0 0 140 90" aria-hidden="true"><path d="M23 28Q65 8 111 30L102 70Q55 82 31 63ZM23 28L102 70M31 63L111 30M65 19L66 74" fill="none" stroke="currentColor" stroke-width="2"/></svg><strong>可变形体／软体</strong><span>内部形变与材料恢复<br/>体积、布料、壳与杆</span></a>
    <a href="/knowledge/fluid-dynamics/"><svg viewBox="0 0 140 90" aria-hidden="true"><path d="M25 20V73H115V20M25 40Q40 27 55 40T85 40T115 40M42 57H94M86 51L94 57L86 63" fill="none" stroke="currentColor" stroke-width="2"/></svg><strong>流体</strong><span>流动、压力与黏性<br/>液体、烟气与自由表面</span></a>
  </div>
  <div class="physics-atlas-connector" aria-hidden="true">↓</div>
  <a class="physics-atlas-coupling" href="/knowledge/multiphysics-coupling/">界面相遇：接触、流固作用与双向耦合</a>
  <figcaption>三类模型平行展开；共同基础与数值工具贯穿其中。箭头表示知识依赖与作用连接，不是强制阅读顺序。</figcaption>
</figure>

对初次系统阅读，可以先读[质点动力学](/knowledge/particle-dynamics/)建立受力与运动的基本关系，再读[连续介质](/knowledge/continuum-mechanics/)认识场、形变和应力。随后按物理对象选择分支，遇到具体计算问题再深入共享方法。

## 状态与守恒是共同语言

位置不足以决定下一刻：同一位置的物体可能静止，也可能高速运动。最基本的状态包括位置与速度；刚体加入姿态与角速度，软体加入内部自由度与材料历史，流体通常需要速度、密度、压力和边界信息。

恒质量质点在惯性系中的方程为

$$
\dot x=v,\qquad \dot P=F,\qquad P=mv.
$$

这解释了平移。将许多材料点组合起来，质量与动量守恒仍然成立；内部作用通过材料和接触关系传递。对于合适的封闭系统，内部作用不会凭空创造总线动量。

能量提供另一种观察角度：弹性可以储能并释放，黏性与摩擦可以耗散，外部驱动可以输入能量。不能只检查“没有爆炸”，还应区分物理耗散、数值耗散与错误注能。

[质点动力学](/knowledge/particle-dynamics/)用自由落体与弹簧阻尼完整展开这些概念。它是共同基础的一种简化模型，不要求所有流体或软体都被解释为独立质点的集合。

## 连续介质解释内部作用与材料差异

对一块连续材料，令 $X$ 为参考材料坐标，当前位置为 $x=\varphi(X,t)$。形变梯度 $F=\partial x/\partial X$ 描述局部运动，$J=\det F$ 描述保持朝向时的局部体积比。

没有质量源汇时，$\rho J=\rho_0$。同一份材料的体积缩小，密度就相应增加；不可压缩模型则限制材料体积变化。

应力 $\sigma$ 描述相邻材料如何通过切面传递作用，动量平衡写为

$$
\rho\frac{Dv}{Dt}=\nabla\cdot\sigma+\rho b.
$$

这里并没有指定材料。弹性固体根据形变产生恢复应力，牛顿流体根据压力与变形速率传递作用，塑性和黏弹性还会引入历史变量。共同方程加上材料关系，才定义了具体模型。

[连续介质力学](/knowledge/continuum-mechanics/)负责这层完整解释。它将刚体、软体与流体连接起来，也说明为什么“使用粒子”或“使用网格”不足以判断模拟的材料种类。

## 刚体分支限制内部形变

刚体把运动限制为整体平移和转动，可用 $x=c+RX$ 恢复局部点。需要保存质心、姿态、动量或速度、质量与惯性，但不逐个求内部伸缩。

这一分支先理解[质心、力矩与惯性](/knowledge/rigid-body-dynamics/)，再进入[撞击、支撑与摩擦](/knowledge/contact-response-and-manifolds/)，最后用[2D 引擎实现](/knowledge/2d-physics-engine/)串联完整时间步。

关节与多接触会产生耦合；[共同约束语言](/knowledge/physics_constraints_deep_dive/)说明 Jacobian、有效质量与累计投影。它也服务于软体和位置方法，而不是只属于刚体。

## 可变形体分支保留内部自由度

可变形体需要解释相邻材料点的距离与方向如何改变，以及材料如何恢复、耗散或产生永久变化。刚度低与求解不足可能看起来都“软”，但属于不同问题。

[可变形体动力学](/knowledge/deformable-body-dynamics/)从形变与应变能进入内部力，再区分：

- 体积软体：三维弹性、近不可压缩、塑性与损伤。
- 布料与壳：面内拉伸、剪切与面外弯曲。
- 绳索与杆：中心线、弯曲、截面方向与扭转。

FEM 提供一类空间离散，MPM 使用材料点与背景网格；PBD/XPBD、隐式 Newton 或 VBD 进一步决定怎样求离散运动。材料与算法需要分别说明。

[Chaos Cloth](/knowledge/chaos-cloth/)、[弹性杆](/knowledge/position-based-elastic-rods/)与[JGS2](/knowledge/jgs2-gpu-elastodynamics/)分别是具体模型、实现或求解分支，不能拿一篇高级算法解析代替软体基础。

## 流体分支研究流动压力与边界

普通流体可以持续剪切变形。它的状态与内力并不围绕一个固定参考形状的恢复来组织。定密度不可压缩流体还需要使速度满足 $\nabla\cdot v=0$。

[流体动力学](/knowledge/fluid-dynamics/)先解释平流、压力、黏性、边界与自由表面，再进入三类数值路线：

- 网格：在空间场上计算运输、压力与黏性。
- 粒子：SPH 等方法用移动采样点和邻域近似场；PBF 用粒子密度约束组织修正。
- 粒子与网格混合：PIC/FLIP 等方法在两种表示间传递数据；MPM 还可承载不同材料状态。

液体与烟气也有不同建模选择。低速烟雾可用不可压缩流场加浓度运输近似，高速可压缩气体则需要密度与能量方程。流体路线因此不能被直接改名为“粒子流体”后就算完整。

本轮给出流体共同主文，SPH/PBF 保留具体深入推导；网格与混合路线在主文中给出原理和边界，不把尚未写出的独立专题当成已有正文。

## 模型相遇时需要界面与双向作用

水推动木块，木块位移又改变水流；软片受压弯曲，弯曲后又改变通道。独立模型之外，还要规定边界运动、作用与反作用、冲量与时间尺度。

[多物理耦合](/knowledge/multiphysics-coupling/)说明单向驱动、双向反馈、分区推进与共同求解。刚体接触、软体自碰撞和流固作用共享一些界面原则，但并不自动具有同一套离散算法。

把所有物体画在同一画面，或把计算放到同一个 GPU，并不能证明反作用已经正确交换。接口也需要守恒、符号与时间语义的验证。

## 物理模型离散与求解必须分层

一个方法首先应被放回它回答的问题中：

- 物理模型定义自由度与材料关系：刚体、弹性、黏性、塑性等。
- 理论表述组织坐标和方程：牛顿、拉格朗日、哈密顿。
- 空间离散把场变成有限未知量：FEM、有限体积、有限差分、SPH、MPM 等。
- 时间离散从当前状态构造下一步：Euler、Verlet、RK、隐式方法等。
- 数值求解降低离散方程或约束残差：Jacobi、GS、CG、Newton、块更新等。
- 工程实现安排碰撞、缓存、并行依赖和结果发布。

这些层次可以组合。例如，弹性材料可以使用四面体 FEM、隐式时间步和局部块求解；不可压缩液体可以使用网格、压力投影和线性迭代。不能把 FEM 与 CG 或 MPM 与“流体”排成同一种分类。

## 按问题选择深入路线

从零建立整体认识时，沿“总览 → 质点的状态与守恒 → 连续介质”阅读，然后选择刚体、软体或流体。各分支都有实际主文，后续细分由明确的物理问题驱动。

共享数学工具放在[数学参考](/knowledge/ue-linear-algebra-guide/)及相应文档中：变化率查[微积分](/knowledge/calculus-foundations/)，场与边界查[PDE](/knowledge/partial-differential-equations/)，离散推进查[时间积分](/knowledge/numerical-integration-methods/)，耦合方程查[迭代求解](/knowledge/iterative-linear-solvers/)。

已有引擎源码在模型和方法之后查阅，不能用某个引擎的实现覆盖一般物理规律。全文检索保留在[全部文档](/knowledge/library/)。本知识脉络首先覆盖经典机械模拟；热传递、电磁等其他物理场需要各自的状态与守恒方程，当前不把它们包装成已经完成的章节。
