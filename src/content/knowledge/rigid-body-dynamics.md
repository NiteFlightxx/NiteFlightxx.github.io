---
title: "刚体动力学：从质心运动到三维转动"
excerpt: "从质点系建立质心、力矩、惯性与角动量，再把平移和姿态演化连接为完整运动模型。"
date: "2026-10-23"
category: "Physics"
subtopic: "RigidBodyDynamics"
tags: ["刚体动力学", "质心", "惯性张量", "角动量", "力矩"]
readTime: "阅读约25分钟"
kind: "theory"
level: "foundation"
pageType: "guide"
aliases: ["刚体动力学：状态、质量与受力"]
prerequisites: ["particle-dynamics"]
nextArticles: ["contact-response-and-manifolds"]
related: ["ue-linear-algebra-guide", "classical-mechanics", "contact-response-and-manifolds", "physics_constraints_deep_dive"]
sources:
  - title: "David Baraff — Rigid Body Dynamics"
    url: "https://www.cs.cmu.edu/~baraff/sigcourse/notesd1.pdf"
  - title: "MIT — Rigid Body Dynamics, Chapters 2.1–2.4"
    url: "https://ocw.mit.edu/courses/8-09-classical-mechanics-iii-fall-2014/d9bac33f6c60b304dc0398e99b327102_MIT8_09F14_full.pdf"
---

[质点动力学](/knowledge/particle-dynamics/)已经解释了合力怎样改变平移。同一个箱子，在质心处受推力和在边角处受同样推力，质心都得到相同的线加速度，但后者还可能转动。要解释这个差异，需要保留物体的空间范围和质量分布。

刚体把物体内部各点的相对距离保持不变，用质心运动与整体姿态描述它。接下来依次建立点的位置和速度、合力与力矩、惯性与角动量，最后连接成三维运动方程。全文使用惯性世界系、列向量与右手叉乘约定；具体引擎的坐标和四元数 API 必须另行转换。

## 刚体假设与状态

刚体内部各点的相对距离保持不变，因此一个局部点可以由同一个平移和旋转恢复到世界。自由三维刚体具有三个平移与三个转动自由度；形状顶点再多，也不会因此增加运动自由度。

采用米、千克、秒和弧度。以质心为参考，一组常见状态是

$$
(x,R,v,\omega).
$$

$x$ 是质心位置，$R$ 是物体质量框架到世界的旋转矩阵，$v=\dot x$ 是质心线速度，$\omega$ 是世界角速度。旋转矩阵满足 $R^TR=\mathbf1$、$\det R=1$。

也可以使用单位四元数保存姿态，用线动量与角动量替代速度保存动力状态。这些是表示选择；需要明确互相转换的规则，不能在同一步中让多份状态各自独立更新。

质量、局部惯性、形状、材料和局部质心偏移属于参数。力与冲量属于作用，接触历史属于求解信息。它们有各自的更新时机。

## 质心把平移从内部运动中分离

设刚体由质量不变的质点组成，总质量与质心为

$$
m=\sum_i m_i,\qquad x=\frac1m\sum_i m_i p_i.
$$

对时间求导，得到总线动量 $P=\sum_i m_i\dot p_i=mv$。当内部作用满足相应的成对抵消条件时：

$$
\dot P=F_{\mathrm{ext,total}},\qquad m\dot v=F_{\mathrm{ext,total}}.
$$

这就是上一章的平移方程。无论力施加在箱子的哪个位置，同一个合力对质心平移的贡献相同。施力点的差异进入绕质心的转动。

Actor 原点、可见网格中心、碰撞形状中心与质心可以不同。用几何包围盒中心代替质心，意味着另行近似了质量分布；它不是由刚体假设自动保证的。

## 点、方向与质量框架

### 一个局部点怎样进入世界

以质心为原点的质量框架中，固定局部点 $\rho$ 的世界位置为

$$
p=x+R\rho.
$$

定义世界力臂 $r=R\rho=p-x$。点包含平移，方向只需旋转；后续所有叉乘中的量应在同一空间中表达。

对时间求导，刚体点速度为

$$
v_{\mathrm{point}}=v+\omega\times r.
$$

即使质心速度为零，旋转箱子的边角也可以运动。接触相对速度、偏心阻尼和移动平台都需要这个关系，不能只读取质心线速度。

### 点加速度还包含向心项

令 $\alpha=\dot\omega$，对固定局部点继续求导：

$$
a_{\mathrm{point}}=\dot v+\alpha\times r+
\omega\times(\omega\times r).
$$

最后一项来自力臂本身的旋转。匀速率转动不要求 $\alpha$ 非零，但点仍有向心加速度。这里假定点固定在刚体上；若它还在局部框架内滑动，需要额外项。

需要将这些约定转换到 UE 的矩阵、FTransform 与父子变换时，再查[空间数学](/knowledge/ue-linear-algebra-guide/)。本篇的公式不是对某个 UE API 的乘法顺序说明。

## 受力如何改变运动

### 合力与合力矩

对世界作用点 $p_i$ 上的力 $F_i$，相对质心力臂为 $r_i=p_i-x$。总合力与绕质心合力矩为

$$
F=\sum_iF_i,\qquad
\tau=\sum_i r_i\times F_i+\tau_{\mathrm{couple}}.
$$

$\tau_{\mathrm{couple}}$ 表示独立施加的力偶矩等项。力矩单位是 $\mathrm{N\,m}$；虽然与能量具有相同的基本量纲，它是向量作用量，物理含义不同。

作用线穿过质心的力不产生绕质心力矩。均匀重力场中的总重力可等效作用于质心，因此不产生绕质心的净重力矩；若场随空间显著变化，就需重新评估这一近似。

### 合力为零也能转动

取两力 $F_1=(0,10,0)\,\mathrm N$、$F_2=(0,-10,0)\,\mathrm N$，分别作用在质心相对位置 $(1,0,0)$ 与 $(-1,0,0)\,\mathrm m$。

合力为零，但两个力矩都沿正 $z$ 轴，总力矩为 $20\,\mathrm{N\,m}$。箱子的质心不会因这对力加速，转动却会改变。这是力偶的一个例子。

### 冲量同时改变线动量与角动量

世界冲量 $j$ 作用在力臂 $r$ 处时：

$$
\Delta P=j,\qquad \Delta L=r\times j.
$$

理想瞬时冲量不改变该瞬间的配置，因而可在当前姿态下计算逆惯性。一次冲量会同时改变平移与转动，接触响应沿用的正是这个结构。

## 转动惯量描述质量如何分布

### 从角动量推到惯性张量

绕质心的角动量由各质点相对质心的位置和相对运动构成。刚体转动速度为 $\omega\times r$，因此

$$
L=\int r\times(\omega\times r)\,dm
=\int(\|r\|^2\mathbf1-rr^T)\,dm\;\omega
=I\omega.
$$

$I$ 为绕质心的惯性张量，单位是 $\mathrm{kg\,m^2}$。它把角速度映射到角动量。一般物体中，它不是单个标量，也不保证 $L$ 与 $\omega$ 平行。

对单位转轴 $n$，该方向的惯量为 $n^TIn$。质量分布离该轴越远，通常需要更多角冲量才能产生同样的角速度变化。

### 主轴与长方体

惯性张量是对称的，可以选取正交主轴使其对角化。对于具有三维体积且质量分布非退化的物体，各主惯性为正；理想点或无限细杆等退化模型可能出现零值，需要定义允许自由度，不能直接求普通逆矩阵。

均匀长方体的边长 $a,b,c$ 沿质量框架的轴，绕质心惯性为

$$
I_{\mathrm{body}}=\frac m{12}
\operatorname{diag}(b^2+c^2,\ a^2+c^2,\ a^2+b^2).
$$

质量相同但长宽不同的箱子，绕不同轴的响应会不同。“更重”和“更难绕某轴转动”不能完全互换。

### 改变参考点

若新参考点与质心相差向量 $d$，两套轴平行，平行轴定理给出

$$
I_O=I_C+m(\|d\|^2\mathbf1-dd^T).
$$

这里的平移与旋转框架变换是不同操作。不能只移动原点后仍无条件使用质心惯性，也不能用固定轴公式描述自由刚体的全部运动。

### 世界空间惯性

从质量框架旋转到世界：

$$
I_{\mathrm{world}}=RI_{\mathrm{body}}R^T,\qquad
I_{\mathrm{world}}^{-1}=RI_{\mathrm{body}}^{-1}R^T.
$$

世界角速度、世界力矩要与世界惯性配合。也可以把向量旋回质量框架再计算，但必须整体遵循同一种约定。

姿态改变后，世界惯性通常也改变。球的各向同性惯性是一个简化特例；一般长方体的三个局部主惯性相等并不是默认事实。

## 角动量、角速度与姿态演化

### 从力矩到角速度

在惯性世界系中，绕质心的角动量满足

$$
\dot L=\tau.
$$

由于 $L=I_{\mathrm{world}}\omega$，而世界惯性会随物体旋转，求导后得到

$$
I_{\mathrm{world}}\dot\omega+
\omega\times(I_{\mathrm{world}}\omega)=\tau.
$$

因此一般情况下：

$$
\dot\omega=I_{\mathrm{world}}^{-1}
\bigl(\tau-\omega\times(I_{\mathrm{world}}\omega)\bigr).
$$

叉乘项体现三维转动耦合。没有外力矩时，世界角动量保持不变，但非球形物体的角速度仍可能变化。忽略该项属于模型或数值实现上的简化，需要知道它省去了什么。

如果改用随体角速度 $\omega_b$，则在恒定的局部惯性下写成

$$
I_{\mathrm{body}}\dot\omega_b+
\omega_b\times(I_{\mathrm{body}}\omega_b)=\tau_b.
$$

不能把局部与世界分量混在同一式子中。

### 从角速度到姿态

世界角速度对应的旋转矩阵演化为

$$
\dot R=[\omega]_\times R.
$$

$[\omega]_\times a=\omega\times a$。使用随体角速度时，乘法变为 $\dot R=R[\omega_b]_\times$。左右乘法来自所处空间，不是可任意替换的代码风格。

若采用 Hamilton 乘法、标量在前的单位四元数 $Q=(s,u)$，把向量从物体旋转到世界，则世界角速度满足 $\dot Q=\tfrac12(0,\omega)\otimes Q$。换用其他四元数约定，必须重新核对乘法与符号。

当一步内冻结角速度时，可用轴角 $\Delta\theta=h\omega$ 构造旋转增量，再从世界侧左乘。角速度随时间变化时，这是离散近似；归一化四元数只控制表示误差，不自动保证物理守恒。

### 二维是有条件的简化

平面刚体的姿态为一个角度 $\theta$，角速度为标量，惯性为绕固定法向轴的标量，此时有 $I\dot\omega=\tau$、$\dot\theta=\omega$。

二维中的旋转可以用标量累加，不能据此把三维旋转向量逐分量相加当作一般有限姿态组合。三维旋转顺序通常会影响结果。

## 动能同时包含平移和转动

以质心分解总动能，平移与转动的交叉项消失：

$$
T=\frac12m\|v\|^2+\frac12\omega^TI_{\mathrm{world}}\omega.
$$

外部作用对刚体做功的瞬时功率为

$$
\dot T=F\cdot v+\tau\cdot\omega.
$$

例如合力为零的力偶仍可通过 $\tau\cdot\omega$ 输入动能。只监测质心速度，会漏掉这部分变化。

无外力矩的理想自由刚体保持世界角动量，且没有耗散时保持转动动能。实际离散算法仍可能产生误差，应分别监测，而不是仅凭四元数长度为一判断模拟正确。

## 同一个箱子的两种推动方式

取质量 $2\,\mathrm{kg}$、边长 $(2,1,1)\,\mathrm m$ 的均匀箱子，初始静止并与世界轴对齐：

$$
I=\operatorname{diag}(1/3,\ 5/6,\ 5/6)\,\mathrm{kg\,m^2}.
$$

施加 $F=(0,10,0)\,\mathrm N$。这里单独分析推力贡献，加入重力后应计算合力。

若作用在质心，线加速度为 $(0,5,0)\,\mathrm{m/s^2}$，角加速度为零。若力臂为 $r=(1,0,0)\,\mathrm m$，相同线加速度之外还有 $\tau=(0,0,10)\,\mathrm{N\,m}$。初始角速度为零，耦合项为零，因此初始 $\alpha_z=12\,\mathrm{rad/s^2}$。

<figure class="physics-figure">
  <div class="physics-figure-grid">
    <svg viewBox="0 0 320 235" role="img" aria-label="力的作用线通过质心时没有绕质心力矩">
      <path class="diagram-muted" d="M65 65H235V180H65Z"/>
      <path class="diagram-accent" d="M150 130V30M142 41L150 30L158 41"/>
      <circle cx="150" cy="130" r="5" class="diagram-dot"/>
      <text x="165" y="50">F</text><text x="162" y="149">质心</text>
      <text x="54" y="218">作用线过质心：τ = 0</text>
    </svg>
    <svg viewBox="0 0 320 235" role="img" aria-label="偏心施力的力臂与力产生绕质心力矩">
      <path class="diagram-muted" d="M65 65H235V180H65Z"/>
      <path class="diagram-accent" d="M235 130V30M227 41L235 30L243 41"/>
      <path class="diagram-line" d="M150 130H235" stroke-dasharray="4 4"/>
      <circle cx="150" cy="130" r="5" class="diagram-dot"/>
      <text x="250" y="50">F</text><text x="183" y="148">r</text><text x="104" y="150">质心</text>
      <text x="65" y="218">偏心作用：τ = r × F</text>
    </svg>
  </div>
  <figcaption>相同合力给出相同的质心线加速度；改变作用线，会改变绕质心的转动响应。图为截面示意，力矩方向垂直于图面。</figcaption>
</figure>

取 $h=1/60\,\mathrm s$，按当前变化率做一次速度更新，推力贡献 $\Delta v_y=1/12\,\mathrm{m/s}$、$\Delta\omega_z=0.2\,\mathrm{rad/s}$。这是一步初始斜率近似；后续应使用更新后的状态与空间关系。

若改为同一位置的一次冲量 $j=(0,2,0)\,\mathrm{N\,s}$，则 $\Delta v_y=1\,\mathrm{m/s}$、$\Delta\omega_z=2.4\,\mathrm{rad/s}$。不能再乘一次 $h$。

### 核对非主轴的角速度变化

同一箱子初始取 $\omega=(1,2,0)\,\mathrm{rad/s}$、$\tau=0$。此时

$$
I\omega=(1/3,5/3,0),\quad
\omega\times(I\omega)=(0,0,1),
$$

所以初始 $\dot\omega=(0,0,-1.2)\,\mathrm{rad/s^2}$。无外力矩并不意味着各个世界角速度分量不变。

下面用该箱子的对角初始惯性核对上述局部结果。函数不推进姿态，也不把这组初始世界对角值永久用于后续模拟。

~~~js
// knowledge-rigid-example
export function cross(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
export function response({ mass = 2, sides = [2, 1, 1], omega = [0, 0, 0], arm = [1, 0, 0], force = [0, 10, 0] } = {}) {
  const vectors = [sides, omega, arm, force];
  if (!Number.isFinite(mass) || mass <= 0 || vectors.some(a => a.length !== 3 || !a.every(Number.isFinite)) || sides.some(a => a <= 0)) throw new Error('invalid rigid model');
  const [a, b, c] = sides;
  const inertia = [b*b+c*c, a*a+c*c, a*a+b*b].map(s => mass*s/12);
  const torque = cross(arm, force);
  const angularMomentum = omega.map((w, i) => w*inertia[i]);
  const coupling = cross(omega, angularMomentum);
  return {
    inertia, torque, angularMomentum,
    acceleration: force.map(f => f/mass),
    angularAcceleration: torque.map((t, i) => (t-coupling[i])/inertia[i]),
  };
}
~~~

## 动态、静态与运动学

动态体由动力学方程与约束求出运动；静态体在模拟中固定；运动学体的运动由外部轨迹或目标规定。这是实时引擎中的状态控制方式，不能与“运动学这门运动描述学科”混为同一层概念。

静态体与运动学体在动态冲量求解中的有效逆质量通常设为零，表示反作用不改变它们规定的运动，而非物体具有一个普通的零质量。

运动学平台仍然可以具有非零点速度，必须进入接触相对速度。它也可以通过外部驱动向动态物体输入能量，因此只看动态子系统时，不应要求封闭系统的所有守恒结论成立。

直接写动态体位置相当于绕过正常的受力推进，可能改变接触和约束历史。施力、冲量、运动学目标和瞬移应有不同入口与生命周期。

## 连续模型怎样进入下一章

以世界动量为状态的一种写法是

$$
\dot x=P/m,\quad \dot P=F,\quad
\dot R=[I_{\mathrm{world}}^{-1}L]_\times R,\quad \dot L=\tau.
$$

以速度为状态时则使用前面的线加速度和含耦合项的角加速度。两者都需要一致的姿态、质量框架与受力求值。

[数值积分](/knowledge/numerical-integration-methods/)作为共享工具，说明如何从变化率计算有限时间步。沿刚体分支下一篇[接触响应](/knowledge/contact-response-and-manifolds/)在同样的点速度和角冲量关系上，计算地面怎样改变箱子的运动。软体和流体并不需要先读完这条刚体路线，分别有自己的模型主文。

如果想从广义坐标、能量和变分原理推导同一动力学，可进入[经典力学的不同表述](/knowledge/classical-mechanics/)。本文建立一般连续模型与受控算例，不据此断言某个引擎实现了所有转动项，或已通过运行验收。
