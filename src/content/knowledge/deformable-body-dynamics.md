---
title: "可变形体动力学：从形变与材料到软体模拟"
excerpt: "连接应变、弹性、塑性、薄结构和空间离散，区分软体模型与具体求解方法。"
date: "2026-10-24"
category: "Physics"
subtopic: "DeformableDynamics"
tags: ["软体", "弹性体", "形变", "FEM", "MPM"]
readTime: "阅读约22分钟"
kind: "theory"
level: "intermediate"
pageType: "guide"
prerequisites: ["continuum-mechanics"]
nextArticles: []
related: ["chaos-cloth", "position-based-elastic-rods", "jgs2-gpu-elastodynamics", "pbd-xpbd-math", "vbd-avbd-math", "multiphysics-coupling"]
sources:
  - title: "Sifakis — FEM Simulation of 3D Deformable Solids"
    url: "https://www.cs.toronto.edu/~jacobson/seminar/sifakis-course-notes-2012.pdf"
  - title: "Stomakhin et al. — A Material Point Method for Snow Simulation"
    url: "https://disneyanimation.com/publications/a-material-point-method-for-snow-simulation/"
---

橡胶块被压扁后回弹，布料容易弯折却难以沿纱线拉长，绳索可以弯曲和扭转。它们都需要内部自由度，但不能仅靠把刚体质量调小或把求解器叫作“软体”来解释。

[连续介质](/knowledge/continuum-mechanics/)已经给出运动映射、守恒与应力。本篇进一步回答：什么算材料形变，怎样从形变得到恢复作用，怎样把体积、布料和杆离散为可计算系统。FEM、MPM、PBD 和 VBD 将在这个问题背景下出现。

## 软体增加的是内部运动自由度

刚体用一个质心和一个姿态恢复所有局部点；可变形体允许相邻材料点之间的距离和夹角改变。离散状态可以是节点位置与速度，也可以包含材料标架、形变梯度、塑性变量和接触历史。

可见表面的顶点不必就是模拟自由度。体积四面体网格可以驱动高分辨率表面，低维杆模型可以驱动绳索外观。模拟网格、碰撞表面和渲染表面之间需要明确映射。

“软”通常表示某些变形方向的材料刚度较低。刚度、质量、阻尼、网格分辨率、时间步与迭代误差都影响观感，应分别理解。

## 先把刚体运动与真实形变分开

沿用 $x=\varphi(X,t)$、$F=\partial x/\partial X$。纯平移给出 $F=I$，纯转动给出 $F=R$，它们都不应使各向同性、无预应力的物体凭空产生弹性能。

Green–Lagrange 应变定义为

$$
E=\tfrac12(F^TF-I).
$$

因为 $R^TR=I$，纯旋转的 $E=0$。对沿一轴伸长 $10\%$ 的 $F=\operatorname{diag}(1.1,1,1)$，则 $E_{11}=0.105$。它与工程应变 $0.1$ 使用不同定义，不能混用系数。

<figure class="physics-figure">
  <div class="physics-figure-grid">
    <svg viewBox="0 0 320 230" role="img" aria-label="纯旋转保持内部距离不变">
      <path class="diagram-muted" d="M75 70H175V170H75Z" stroke-dasharray="5 5"/>
      <path class="diagram-accent" d="M125 48L196 119L125 190L54 119Z"/>
      <circle cx="125" cy="119" r="3" fill="currentColor"/>
      <path class="diagram-line" d="M214 90Q252 119 218 151"/>
      <text x="226" y="126">旋转</text><text x="60" y="216">F = R，E = 0</text>
    </svg>
    <svg viewBox="0 0 320 230" role="img" aria-label="拉伸改变材料内部距离">
      <path class="diagram-muted" d="M55 70H155V170H55Z" stroke-dasharray="5 5"/>
      <path class="diagram-accent" d="M55 70H245V170H55Z"/>
      <path class="diagram-line" d="M65 120H235M225 113L235 120L225 127"/>
      <text x="111" y="105">内部距离增大</text><text x="65" y="216">拉伸产生非零应变</text>
    </svg>
  </div>
  <figcaption>虚线是参考形状，实线是当前形状。纯旋转改变朝向，拉伸才改变这里所示的材料距离；右图为示意，比例不对应上面的 10% 算例。</figcaption>
</figure>

小变形线性应变 $\varepsilon=\tfrac12(\nabla u+\nabla u^T)$ 是常用近似，但对大转动可能给出非零假应变。共旋方法将局部旋转与剩余形变分开处理；“线性材料”与“全局小转动”需要区分。

## 材料能量怎样产生内部力

超弹性用单位参考体积的应变能密度 $\Psi(F)$ 描述可恢复的材料作用：

$$
U(x)=\int_{\Omega_0}\Psi(F)\,dV,\qquad
f_{\mathrm{int}}=-\frac{\partial U}{\partial x}.
$$

离散后，导数对模拟自由度求取。位移梯度、形变梯度、应力与节点力是通过这条链联系起来的量，不是互相替代的名字。

一个说明旋转不变性的简单模型是 St. Venant–Kirchhoff 能量：

$$
\Psi(F)=\mu\,\operatorname{tr}(E^TE)
+\tfrac{\lambda}{2}(\operatorname{tr}E)^2.
$$

$\mu,\lambda$ 是 Lamé 参数，单位是压力。这个模型便于从应变理解能量，但它在大压缩、翻转等情况下有局限，不能因使用有限应变就称其对所有大变形都可靠。Neo-Hookean、共旋及其他模型各有适用条件。

### 刚度参数为什么要随定义解释

三维各向同性线弹性中，杨氏模量 $Y$、泊松比 $\nu$ 与 Lamé 参数满足

$$
\mu=\frac{Y}{2(1+\nu)},\qquad
\lambda=\frac{Y\nu}{(1+\nu)(1-2\nu)}.
$$

正定弹性通常要求 $Y>0$、$-1<\nu<1/2$。当 $\nu$ 接近 $1/2$，材料近似不可压缩，体积与剪切刚度尺度分离；简单提高体积惩罚会让系统难解，并可能产生离散锁死。

不可压缩橡胶仍可以保持形状记忆和剪切恢复。不可压缩性并不能单独把材料变成流体。

## 用一根杆连接连续参数与弹簧

均匀直杆长 $L$、截面积 $A$，在小轴向应变、均匀拉伸的近似下：

$$
\epsilon=\frac{\Delta L}{L},\qquad
f=YA\epsilon,\qquad
k_{\mathrm{equiv}}=\frac{YA}{L}.
$$

取 $Y=100000\,\mathrm{Pa}$、$A=0.001\,\mathrm{m^2}$、$L=1\,\mathrm m$，则等效刚度为 $100\,\mathrm{N/m}$。伸长 $0.1\,\mathrm m$ 时，在该线性模型中拉力为 $10\,\mathrm N$，储能为 $0.5\,\mathrm J$。

长度减半但截面和材料不变时，单段轴向刚度变为两倍。这说明网格细分后机械参数不能总按原边弹簧值照搬；目标是近似同一连续材料，而不是仅保持数字相同。

## 体积软体布料与杆需要不同离散

### 三维体积材料

四面体 FEM 在单元内插值位移。线性四面体的形变梯度可写为

$$
F=D_sD_m^{-1},
$$

$D_m$ 由参考顶点的三条边组成，$D_s$ 由当前对应边组成。退化参考单元没有普通逆，当前单元翻转也需要专门处理。

材料能量按参考单元体积累积，再对节点位置求力与切线。自由度通常是节点位移，FEM 既不意味着“显式求解”，也不意味着“一定使用 Newton”。

### 布料与壳

布料是薄结构：面内拉伸、剪切与面外弯曲具有不同尺度。用一组边长约束可以建立简单模型，但边长约束本身不自动提供所需弯曲、纱线方向性或完整壳理论。

布料与自身碰撞、厚度、缝合和外部物体接触也很关键。[Chaos Cloth](/knowledge/chaos-cloth/)是具体引擎实现分支，应在认识材料与几何职责之后阅读。

### 绳索与弹性杆

一串中心线位置可以表达弯曲形状，却通常不足以表达完整扭转；材料标架为截面方向提供额外状态。Kirchhoff、Cosserat 和纯距离链具有不同自由度与假设。

[弹性杆](/knowledge/position-based-elastic-rods/)进一步推导弯曲与扭转。它不是体积软体完成后必须依次阅读的下一章，而是一条薄结构分支。

## 弹性塑性与损伤扩展材料状态

弹性主要描述卸载后恢复的部分；塑性引入永久变化及内变量。常见有限塑性模型使用 $F=F_eF_p$，分别追踪弹性与塑性贡献，但还必须给出屈服、硬化与更新规则。

损伤和断裂还会改变承载能力或拓扑，不能只把恢复刚度降低就声称模拟了完整断裂。雪和颗粒材料还涉及压实、屈服与摩擦等特性。

MPM 让材料点携带质量、形变和历史，在背景网格上计算动量更新，再回传材料点。它能承载不同材料模型；MPM 本身既不是一种特定雪模型，也不专属于流体。[雪模拟原始工作](https://disneyanimation.com/publications/a-material-point-method-for-snow-simulation/)展示了弹塑性与这种离散方式的结合。

## 时间积分与求解方法属于下一层

离散弹性系统可写为 $M\ddot q=f_{\mathrm{ext}}-\nabla U(q)$，加入阻尼或接触后再扩充。显式时间推进的稳定步长受材料波速与单元尺寸限制；隐式方法则需要处理非线性与求解残差。

[PBD/XPBD](/knowledge/pbd-xpbd-math/)从约束与柔度组织修正，[VBD/AVBD](/knowledge/vbd-avbd-math/)从离散目标和局部块组织更新。两者都需要说明约束/能量代表什么材料，不能由求解器名称推出材料类型。

要理解弹性求解器的并行迭代，可进入[JGS2](/knowledge/jgs2-gpu-elastodynamics/)；先在本篇识别出自由度、能量与时间离散，才知道它在改进哪个计算环节。

## 核对能量与刚体旋转

下面实现上述 St. Venant–Kirchhoff 能量，只用于三个均匀配置的受控检查，不是完整 FEM 求解器。

~~~js
// knowledge-deformable-example
export function elasticEnergy(F, { mu = 1000, lambda = 1000, volume = 0.001 } = {}) {
  if (F.length !== 3 || F.some(r => r.length !== 3 || !r.every(Number.isFinite)) ||
      ![mu, lambda, volume].every(Number.isFinite) || mu <= 0 || lambda < 0 || volume <= 0) throw new Error('invalid elasticity');
  const E = F.map((row,i) => row.map((_,j) =>
    0.5 * (F.reduce((sum,r) => sum+r[i]*r[j],0) - (i === j ? 1 : 0))));
  const trace = E[0][0]+E[1][1]+E[2][2];
  const density = mu*E.flat().reduce((sum,e) => sum+e*e,0) + 0.5*lambda*trace*trace;
  return { strain: E, density, energy: volume*density };
}
~~~

单位配置与纯旋转应给出零能量；$F=\operatorname{diag}(1.1,1,1)$ 在默认参数下给出 $16.5375\,\mathrm{J/m^3}$ 与总能量 $0.0165375\,\mathrm J$。这检查的是能量定义，不包含接触、塑性、单元翻转或稳定性验证。

## 接回共同知识脉络

可变形体与[流体](/knowledge/fluid-dynamics/)共享守恒与应力语言，却通过材料关系描述不同响应。它与[刚体](/knowledge/rigid-body-dynamics/)共享整体动量和接触原则，却保留内部自由度。

当软体落在刚体上、布料受水流推动时，再进入[耦合](/knowledge/multiphysics-coupling/)讨论反作用、边界条件与统一时间尺度。需要数学推导时按问题进入[PDE](/knowledge/partial-differential-equations/)和[数值积分](/knowledge/numerical-integration-methods/)，而非先把整个刚体引擎当作软体入门条件。
