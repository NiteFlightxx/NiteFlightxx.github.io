---
title: "PBD、XPBD、VBD 与 AVBD：模型、迭代与工程取舍"
excerpt: "用统一符号和可复算例子比较四种方法的求解目标、更新块、乘子、收敛条件及 CPU/GPU 工程代价。"
date: "2026-10-29"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["PBD", "XPBD", "VBD", "AVBD", "约束求解", "数值优化"]
readTime: "阅读约55分钟"
kind: "comparison"
level: "advanced"
pageType: "guide"
aliases: ["PBD XPBD VBD AVBD 对比", "位置投影与顶点块下降", "位置求解器选型"]
prerequisites: ["numerical-integration-methods", "physics_constraints_deep_dive"]
nextArticles: []
related: ["pbd-xpbd-math", "vbd-avbd-math", "iterative-linear-solvers", "hessian-matrix", "avbd-demo3d-implementation", "three-avbd-gpu-solver", "gpu-physics-plugin"]
sources:
  - title: "Müller et al. — Position Based Dynamics"
    url: "https://matthias-research.github.io/pages/publications/posBasedDyn.pdf"
  - title: "Macklin et al. 2016 — XPBD"
    url: "https://mmacklin.com/xpbd.pdf"
  - title: "Chen et al. 2024 — Vertex Block Descent, arXiv v4"
    url: "https://arxiv.org/html/2403.06321v4"
  - title: "Giles et al. 2025 — Augmented Vertex Block Descent"
    url: "https://graphics.cs.utah.edu/research/projects/avbd/Augmented_VBD-SIGGRAPH25.pdf"
  - title: "Macklin et al. 2019 — Small Steps in Physics Simulation"
    url: "https://mmacklin.com/smallsteps.pdf"
---

PBD、XPBD、VBD、AVBD 都能通过修改位置推进物理，但它们不是四个可互换的“位置积分公式”。真正决定结果的是：本步要满足什么方程、每次更新谁、使用什么导数、保留哪些历史，以及预算耗尽时留下哪一种误差。

本文以同一套粒子模型推导差异，再扩展到刚体、材料与接触。它是一篇**跨方法比较主文**；约束几何和有效质量详见[物理约束](/knowledge/physics_constraints_deep_dive/)，具体约束导数见[PBD/XPBD](/knowledge/pbd-xpbd-math/)，能量及局部块装配见[VBD/AVBD](/knowledge/vbd-avbd-math/)，不再重复所有距离、体积和弯曲约束的完整实现。

导数、偏导数与梯度的基础推导见[微分基础](/knowledge/calculus-foundations/)；其中的[双粒子弹簧](/knowledge/calculus-foundations/#物理中的约束梯度能量梯度与力)串起了约束误差、能量梯度与力的符号和单位。

## 先给结论

- **PBD**：从预测位置逐约束投影，适合低成本几何控制；传统投影强度不等于有单位的材料刚度。
- **XPBD**：加入柔度和步内累计乘子，使软约束具有明确的材料目标；参数不再依靠迭代数定义，但有限预算的结果仍会改变。
- **VBD**：围绕隐式 Euler 的位置目标，按顶点块组装相邻能量的梯度与局部 Hessian；它不是给 XPBD 多加一个矩阵。
- **AVBD**：在块下降上增加硬约束的原对偶机制，同时配套有限刚度渐进、曲率近似、历史误差处理与热启动；A 是 Augmented，不是 Accelerated。
- **没有无条件的性能排名**。同样五轮迭代，不代表同样工作量；静止不爆炸，也不代表接触、材料、动量与轨迹正确。

| 比较对象 | PBD | XPBD | VBD | AVBD |
|---|---|---|---|---|
| 主要组织对象 | 单个几何约束 | 单个柔性/硬约束 | 单个顶点或广义块 | 单个原变量块，加约束状态更新 |
| 核心计算 | 质量加权投影 | 累计乘子增量与位置修正 | 局部能量的 Newton/近似 Newton 步 | 增广原问题块更新与对偶更新 |
| 主要持久状态 | 位置、速度；可有其他接触缓存 | 另加步内乘子 | 位置、速度、邻接；可有初值/加速历史 | 另加约束对偶、罚参数、接触历史 |
| 有限弹性 | 传统强度参数间接控制 | 柔度对应能量；注意离散误差 | 直接定义材料能量 | 原论文对有限刚度采用渐进至目标刚度 |
| 一般硬耦合约束 | 投影，有限轮仍可能有误差 | 可令柔度为零 | 单靠有限罚能量不能精确表达 | 有限罚参数加对偶，迭代消除误差 |
| 主要难点 | 强度与步长/迭代耦合 | 非线性近似、耦合传播、乘子生命周期 | 非凸曲率、块间传播、刚度比 | 状态更复杂，需稳定的投影和历史策略 |

“VBD 不能处理硬约束”在这里特指**用有限二次罚能量表达任意耦合硬约束**的局限。固定顶点、局部子空间消元等特殊硬限制可以直接处理，不能一概说它无法固定物体。

## 比较之前，先对齐问题

### 模型、离散与求解是三个层次

同一块布可以选择质点弹簧、应变约束或有限元；这些是模型与空间离散。把一个时间区间变成离散方程，是时间离散。再用什么顺序和局部近似求该方程，才是迭代求解。

因此不能把“PBD vs FEM”“XPBD vs 隐式 Euler”“VBD vs GPU”写成三个同层级二选一：

- FEM 可以提供能量及导数，供不同求解路线使用。
- XPBD 从隐式位置方程出发，但基础更新用了近似。
- VBD 是求隐式位置目标的一种块迭代；GPU 是执行后端。
- AVBD 是整套求解组织，不包含所有碰撞几何、资产、同步与渲染功能。

### 统一符号与力的正负号

用 $n$ 表示时间步，$k$ 表示步内迭代，$h>0$ 表示子步长度。粒子状态是 $x^n,v^n$，本步候选位置仍写作 $x$，质量矩阵 $M$ 对动态自由度正定。固定自由度直接剔除或作已知量。

把本步冻结的外力放进惯性预测：

$$
y=x^n+hv^n+h^2M^{-1}f_{\mathrm{ext}}.
$$

重力已经放进 $y$，就不要在后续势能中再加同一份重力。一般速度相关或非保守力需另外定义离散，不能自动塞进一个位置势能。

对标量等式约束 $C_j(x)=0$，采用**行 Jacobian**：

$$
J_j=\frac{\partial C_j}{\partial x},\qquad
W_j=J_jM^{-1}J_j^{\mathsf T}.
$$

$W_j$ 是有效逆质量；$W_j^{-1}$ 才是相应有效质量。约束不独立、梯度为零或所有关联自由度都固定时，分母可能退化。

为避免两篇论文都使用 lambda 造成混淆，本文区分：

| 符号 | 含义 | 当约束误差为长度时的单位 |
|---|---|---|
| $s_j$ | PBD 每次投影的强度 | 无量纲 |
| $\kappa_j$ | 弹簧/罚能量的物理刚度 | $\mathrm{N/m}$ |
| $\alpha_j$ | XPBD 柔度，距离弹簧中等于 $1/\kappa_j$ | $\mathrm{m/N}$ |
| $\widetilde\alpha_j=\alpha_j/h^2$ | 时间缩放后的柔度 | $\mathrm{kg^{-1}}$ |
| $\lambda_j^X$ | XPBD 的位置层累计乘子 | $\mathrm{N\,s^2}$ |
| $\Lambda_j$ | 本文增广能量形式的对偶变量 | $\mathrm N$ |
| $\rho_j$ | AVBD 硬约束的有限罚参数 | $\mathrm{N/m}$ |
| $\eta$ | AVBD 的历史误差保留系数，论文另记作 alpha | 无量纲 |

若 $C$ 是体积、角度或应变，上述单位随约束定义变化。不能把同一柔度数字跨约束复制。

## PBD：投影的是当前几何误差

### 一次投影怎样得到

对当前约束线性化：

$$
C(x+\Delta x)\approx C(x)+J\Delta x.
$$

寻找满足线性化约束、且质量加权位移最小的修正：

$$
\min_{\Delta x}\frac12\Delta x^{\mathsf T}M\Delta x,
\qquad C+J\Delta x=0.
$$

消元得到：

$$
\Delta\lambda=-\frac{C}{JM^{-1}J^{\mathsf T}},
\qquad
\Delta x=sM^{-1}J^{\mathsf T}\Delta\lambda,\quad 0\le s\le1.
$$

这解释了轻物体移动多、重物体移动少。它没有将一个具体弹性模量自动转换为 $s$，也没有通过一次线性化求出所有非线性约束的共同解。

基础流程是预测、生成接触、若干轮约束修正、位置提交与速度重建：

$$
v^{n+1}=\frac{x^{n+1}-x^n}{h}.
$$

原始 PBD 的算法及投影见[原论文的 Position Based Simulation](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)，其在线性化基础上逐约束更新。本文接下来的强度分析是对单个标量例子的独立计算，不是复杂场景保证。

### 为什么迭代次数会改变“硬度”

假设一个线性约束，其他约束不干扰它，每次消掉当前误差的 $s$ 比例，则：

$$
C^{k+1}=(1-s)C^k,\qquad
C^K=(1-s)^KC^0.
$$

取 $s=0.5$，一轮剩一半误差，四轮剩十六分之一。若把外观硬度定义成残留伸长，增加迭代自然改变外观。

可用 $s_{\mathrm{iter}}=1-(1-s_{\mathrm{total}})^{1/K}$ 对这个理想收缩模型作补偿；但真实约束会互相破坏，步长也改变预测误差，所以它不是材料本构。

### PBD 的价值与边界

它适合直接施加几何限制、快速原型和对物理定量要求较低的次级效果。迭代廉价、约束清楚，并不等于可以省略碰撞、摩擦与速度级处理。

硬投影在一次约束中可以消掉线性误差，但一条长链仍需要传播。不可满足约束、退化梯度和高速漏检不会因为使用 PBD 自动消失。

## XPBD：改变的是柔性约束方程

### 从能量到离散平衡

对柔度 $\alpha>0$，取约束能量：

$$
U(x)=\frac{1}{2\alpha}C(x)^2.
$$

包含惯性的目标是：

$$
\Phi(x)=\frac{1}{2h^2}(x-y)^{\mathsf T}M(x-y)+U(x).
$$

令 $\lambda^X=-C/\widetilde\alpha$，离散平衡可以写成：

$$
r_x=M(x-y)-J^{\mathsf T}\lambda^X=0,
\qquad
r_c=C+\widetilde\alpha\lambda^X=0.
$$

对多约束使用向量形式；$J$ 的每一行对应一个约束，柔度矩阵也可包含局部块，而不必全是标量。

基础 XPBD 更新为：

$$
\Delta\lambda_j^X=
\frac{-C_j-\widetilde\alpha_j\lambda_j^X}
{W_j+\widetilde\alpha_j},
$$

$$
\lambda_j^X\leftarrow\lambda_j^X+\Delta\lambda_j^X,\qquad
x\leftarrow x+M^{-1}J_j^{\mathsf T}\Delta\lambda_j^X.
$$

分子中的累计项与分母中的柔度必须同时存在；只给 PBD 分母加 epsilon，不会得到 XPBD。公式与初始化来源为 [XPBD 2016，Algorithm 1、Eq. (8)–(18)](https://mmacklin.com/xpbd.pdf)。

### 柔度独立，不是结果独立

$\alpha$ 定义软约束的目标响应；$h$ 通过 $\widetilde\alpha=\alpha/h^2$ 进入离散。改变迭代数不再像传统 PBD 那样重新定义同一个材料参数，但仍会改变离该目标有多远。

需要同时区分：

- **材料参数**：同一份柔度在不同求解预算下含义一致。
- **求解误差**：有限轮产生的状态、接触与相位不同。
- **时间离散误差**：即便每步完全收敛，改变 $h$ 仍改变离散轨迹。

所以“XPBD 一轮与一百轮完全相同”“不同帧率一定同轨迹”都不成立。线性单约束一步精确只是特殊情况，后面的例子会明确展示。

### 为什么不能保证等于完整隐式 Euler

这点不是单纯“没有 Hessian，所以精度较低”。更关键的是更新时维护了什么残差。

完整线性化会用到：

$$
K=M-\sum_j\lambda_j^X\nabla^2C_j.
$$

XPBD 的基础推导以 $M$ 近似 $K$，并将当前 $r_x$ 近似为零，从而获得廉价的约束更新。[原论文 Eq. (12)–(17)](https://mmacklin.com/xpbd.pdf)明确列出这两个简化。

在常量 Jacobian 情况，若从 $x=y,\lambda^X=0$ 开始，位置与累计乘子的一致关系能保留；但非线性约束的梯度会改变。新位置包含的是多次旧方向的修正，不一定等于最终 Jacobian 与最终乘子的乘积：

$$
M(x-y)=\sum_{\text{历史更新}}J_{\text{当时}}^{\mathsf T}\Delta\lambda^X,
$$

$$
\sum_{\text{历史更新}}J_{\text{当时}}^{\mathsf T}\Delta\lambda^X
\ne J(x)^{\mathsf T}\lambda^X.
$$

因此仅观察 $r_c$ 变小，不能证明 $r_x$ 也消失。增加迭代可以减小某些误差，但不能把一个未显式纠正的平衡残差当作已经验证。更完整的非线性/残差修正变体需要单独命名和分析。

### 乘子什么时候清零

基础算法在**每个新子步**从零初始化乘子，在子步内迭代累计；每次投影都清零会丢掉 total multiplier 的意义。

跨步热启动是额外策略。若希望保留同一物理力估计，在同一约束定义、相近几何与相近状态下，形式上需要：

$$
\lambda_{\mathrm{new}}^X
\approx\lambda_{\mathrm{old}}^X
\left(\frac{h_{\mathrm{new}}}{h_{\mathrm{old}}}\right)^2.
$$

这只是力尺度换算，不保证新问题的解，也不能只复制乘子而忽略位置初始化和 $r_x$ 一致性。接触身份、方向翻转、拓扑与固定状态变化，都可能使缓存失效。

在本文符号下，力估计和冲量估计分别是：

$$
f_C\approx J^{\mathsf T}\frac{\lambda^X}{h^2},
\qquad
I_C\approx J^{\mathsf T}\frac{\lambda^X}{h}.
$$

它们不是同一个单位，也不是任意框架都可直接读出的精确约束力。

## VBD：一次更新聚合一个顶点周围的能量

### 与 XPBD 最根本的组织差异

设内能是 $U(x)=\sum_eU_e(x)$。VBD 固定其他顶点，只更新 $x_i$，收集所有涉及该顶点的能量：

$$
\Phi_i(x_i)=\frac{m_i}{2h^2}\|x_i-y_i\|^2+\sum_{e\ni i}U_e(x).
$$

局部梯度与 Hessian 为：

$$
g_i=\frac{m_i}{h^2}(x_i-y_i)+\sum_{e\ni i}\nabla_iU_e,
$$

$$
H_{ii}=\frac{m_i}{h^2}I+\sum_{e\ni i}\nabla_i^2U_e,
\qquad H_{ii}\Delta x_i=-g_i.
$$

同一个弹簧在两个顶点的局部求解中都会出现，但不是在全局能量中计算两份。由于每次只移动一个块，局部能量变化正好等于这次全局目标变化。

标准粒子块有三个自由度；“每个顶点一个块”不等于“每个约束一个块”。方法的定义见 [VBD 2024 v4，Global Optimization 与 Local System Solver](https://arxiv.org/html/2403.06321v4#S3.SS1)。

<figure style="max-width:100%;overflow-x:auto">
  <img src="/images/knowledge/solver-update-blocks.svg" alt="左侧按约束更新关联粒子，右侧按顶点聚合相邻项" width="900" height="420" loading="lazy" style="min-width:760px;width:100%;height:auto" />
  <figcaption>约束更新与顶点更新的读写范围。窄屏可横向滚动查看标签。</figcaption>
</figure>

图中每一项都耦合两个端点。左侧一次写入一个约束关联的位置；右侧一次只写一个顶点，但读取其全部邻接。颜色仅用来区分更新对象，不代表实际 GPU 染色结果。

### 二阶信息增加了什么

对 $U_j=\kappa_jC_j^2/2$：

$$
\nabla_iU_j=\kappa_jC_j\nabla_iC_j,
$$

$$
\nabla_i^2U_j=
\kappa_j\nabla_iC_j\nabla_iC_j^{\mathsf T}
+\kappa_jC_j\nabla_i^2C_j.
$$

外积项描述沿约束梯度方向的变化，后一项包含几何曲率。压缩弹簧或非凸材料可能产生负曲率；只保留外积属于 Gauss–Newton 型近似，不是精确 Hessian。

局部块虽然使用二阶导数，但没有一次解完所有块间耦合。非对角块的影响靠后续迭代传播，因此它不能自动获得全局 Newton 的二次收敛率。

### 能量下降、稳定与守恒不要混用

如果每个局部更新都降低 $\Phi_i$，就能推出该次更新降低全局 $\Phi$。但这并不证明任意一记完整 Newton 步都满足前提。

原论文讨论过非正定与近奇异 Hessian，也明确区分可采用的局部线搜索和实验中的实际选项；不能把“一次裸 Newton 更新保证下降”当成论文定理。[VBD，Local System Solver](https://arxiv.org/html/2403.06321v4#S3.SS2)

工程上可以采用步长接受、曲率近似或退化处理，但必须声明具体策略。能量下降中的能量是本步的**惯性势加材料势的优化目标**，不是断言机械能严格守恒；隐式 Euler 本身具有数值耗散。

## AVBD：不是单独添加一行乘子

### 硬约束需要的反力不等于罚刚度

为说明机制，先取硬等式约束，增广目标为：

$$
\mathcal L(x,\Lambda,\rho)=
\Phi_0(x)+\sum_j
\left[\Lambda_jC_j(x)+\frac12\rho_jC_j(x)^2\right].
$$

$\Phi_0$ 包含惯性与其他有限能量。固定 $\Lambda,\rho$ 进行块更新，其约束贡献是：

$$
g_i^C=(\Lambda_j+\rho_jC_j)\nabla_iC_j,
$$

$$
H_{ii}^C=
\rho_j\nabla_iC_j\nabla_iC_j^{\mathsf T}
+(\Lambda_j+\rho_jC_j)\nabla_i^2C_j.
$$

在一轮原变量 sweep 后，用新的候选位置更新：

$$
\Lambda_j^{k+1}=\Lambda_j^k+\rho_j^kC_j(x^{k+1}).
$$

即便最终 $C=0$，非零 $\Lambda$ 仍可提供反力；因此不需要依赖无限罚参数。原始 AVBD 的硬约束、受限对偶与整轮调度见[论文 Eq. (8)–(14)、Algorithm 1](https://graphics.cs.utah.edu/research/projects/avbd/Augmented_VBD-SIGGRAPH25.pdf)。

注意负梯度才是力。在当前约定下，AVBD 原问题中的有效力是：

$$
f_C=-J^{\mathsf T}(\Lambda+\rho C).
$$

不能只读旧 $\Lambda$ 就宣称拿到了当前原问题用的全部反力。若与 XPBD 表示的是同一约束和同一最终力，在一致极限下才有：

$$
\Lambda+\rho C\approx-\lambda^X/h^2.
$$

硬约束精确满足后 $C=0$，才进一步简化为两个乘子的直接换算。符号差来自能量写法，不代表一个方法在拉、另一个在推。

### 罚参数增长与有限刚度是两条规则

对硬约束，论文使用误差驱动的有限罚参数增长，本文改记作：

$$
\rho_j^{k+1}=\rho_j^k+\beta|C_j(x^{k+1})|.
$$

它是求解路径的参数，不是材料刚度。单独固定 $\rho>0$ 也可以构成增广拉格朗日迭代，增长只是影响收敛与数值尺度。

对于**有限物理刚度** $\kappa_j^\star$，原论文的处理不是把同样的硬约束对偶一直累计，而是让工作刚度渐进到物理上限：

$$
\kappa_j^{k+1}=
\min\!\left(\kappa_j^\star,\kappa_j^k+\beta|C_j(x^{k+1})|\right).
$$

有限项仍使用 $\kappa_j^kC_j^2/2$，不加该硬约束的对偶项。达到目标刚度并消除求解残差之前，不能宣称当前结果等于原材料的完全收敛解。参见[AVBD High Stiffness Ratios，Eq. (16)](https://graphics.cs.utah.edu/research/projects/avbd/Augmented_VBD-SIGGRAPH25.pdf)。

如果对本应柔软的弹簧也无限累计硬约束乘子，会逐渐把它推向 $C=0$，改变材料模型。另一类“柔性 ALM”可以有自己的更新，但需要重新推导，不应冒充上述原论文规则。

### 曲率处理不是可忽略的细节

令 $G_{ij}=(\Lambda_j+\rho_jC_j)\nabla_i^2C_j$。原论文使用列范数构成的非负对角近似：

$$
\widetilde G_{ij}=
\operatorname{diag}\left(
\|G_{ij,:,1}\|_2,\ldots,\|G_{ij,:,d_i}\|_2
\right).
$$

配合外积项与正质量的惯性项，可构造便于分解的局部近似系统。这里只是准 Newton 曲率，不是原目标的精确 Hessian；有界力的情况下还有专门的工作刚度重缩放。参见[AVBD Approximate Hessians，Eq. (17)](https://graphics.cs.utah.edu/research/projects/avbd/Augmented_VBD-SIGGRAPH25.pdf)。

从线性代数上说，单个标量约束的外积通常只是半正定、甚至秩一；保证局部正定还要依靠动态自由度上的正质量等条件。不能仅凭“加了一个外积”认定所有块总可逆。

### 历史误差与热启动

有限预算下，上一步可能已经违反硬约束。若下一步突然完整消掉误差，位置回算速度会注入很大的动量。论文把用于求解的约束改为：

$$
\overline C_j(x)=C_j^\star(x)-\eta C_j^\star(x^n),
\qquad 0\le\eta\le1.
$$

这里 $\eta$ 对应原文 Eq. (18) 的 alpha，**不是 XPBD 柔度**。若本步将 $\overline C=0$，原几何误差会变为 $\eta C^\star(x^n)$：$\eta=0$ 要求全部纠正，$\eta=1$ 则不纠正已有误差。它改变了本步修正目标，不能用正则化残差为零掩盖原始穿透。

热启动还可以衰减上一时刻的工作罚参数与对偶：

$$
\rho^{(0)}=\max(\gamma\rho_{\mathrm{prev}},\rho_{\mathrm{start}}),
\qquad
\Lambda^{(0)}=\eta\gamma\Lambda_{\mathrm{prev}}.
$$

这是论文对应规则的本文记号。[AVBD Eq. (18)–(19)](https://graphics.cs.utah.edu/research/projects/avbd/Augmented_VBD-SIGGRAPH25.pdf)应连同约束类型和界限阅读；有限刚度项还要服从自己的物理上限。具体项目的衰减、限幅和执行顺序可能不同，不能照抄参数名推断一致。

这两条规则说明：AVBD 的有效状态不只是当前的位置。接触缓存失效却保留旧 $\Lambda$、旋转法线后未变换摩擦对偶、重置后遗留罚参数，都可能生成“没有原因的力”。

## 同一条弹簧：材料误差与求解误差

### 固定相同物理参数

取两个一维动态粒子，质量均为 $1\,\mathrm{kg}$，$h=0.1\,\mathrm s$，本步惯性预测 $y=(0,2)\,\mathrm m$。初速度为零且本步无外力，静止长度 $L=1\,\mathrm m$。为保证全例线性，定义有向伸长：

$$
C=x_2-x_1-L,\qquad J=(-1,1).
$$

这不是完整三维距离弹簧；它避免翻转和方向变化，用于隔离求解差异。取物理刚度 $\kappa=100\,\mathrm{N/m}$，隐式目标是：

$$
\Phi=\frac{100}{2}\left[x_1^2+(x_2-2)^2\right]
+\frac{100}{2}(x_2-x_1-1)^2.
$$

求导得到唯一参考解：

$$
\begin{bmatrix}200&-100\\-100&200\end{bmatrix}
\begin{bmatrix}x_1\\x_2\end{bmatrix}
=\begin{bmatrix}-100\\300\end{bmatrix},
\qquad
x^\star=\left(\frac13,\frac53\right).
$$

其弹性伸长 $C^\star=1/3$，不应被误判为没有收敛。它正是在惯性与有限弹性之间的平衡。

### XPBD 为什么一轮就能得到这个解

$\alpha=0.01\,\mathrm{m/N}$、$\widetilde\alpha=1\,\mathrm{kg^{-1}}$、$W=2\,\mathrm{kg^{-1}}$，从 $\lambda^X=0$ 出发：

$$
\Delta\lambda^X=-\frac1{2+1}=-\frac13,\qquad
\Delta x=\left(\frac13,-\frac13\right).
$$

这一步恰好等于参考解。原因是本例只有一个**线性约束**，并且一次更新同时移动两个关联自由度；不是 XPBD 对任意场景都能一轮精确求解。

若将柔度误置为零，就会得到硬约束解 $(0.5,1.5)$，它不是“更准的软弹簧”，而是另一个问题。

### VBD 为什么需要多轮

按 $x_1$、$x_2$ 顺序更新：

$$
x_1\leftarrow\frac{x_2-1}{2},
\qquad
x_2\leftarrow\frac32+\frac{x_1}{2}.
$$

| 完整 sweep 数 | $x_1$ | $x_2$ | 相对参考解的最大位置误差 |
|---|---:|---:|---:|
| $1$ | $0.5$ | $1.75$ | $1/6$ |
| $2$ | $0.375$ | $1.6875$ | $1/24$ |
| $3$ | $0.34375$ | $1.671875$ | $1/96$ |
| $4$ | $0.3359375$ | $1.66796875$ | $1/384$ |
| 收敛 | $1/3$ | $5/3$ | $0$ |

这里每次只调整一个自由度，因此块间耦合需要迭代传播。有限 sweep 时质心也不必与最终解一致，不能因最终解对称就假定每一步迭代都精确保动量。

这个例子有意让 XPBD 一轮领先，说明“VBD 使用 Hessian，所以任何问题都更快”是错误的推论；真实多约束、非线性和 GPU 成本必须另测。

### PBD 与 AVBD 在这组参数中该如何比较

PBD 没有自动对应 $\kappa=100$ 的强度。$s=1$ 一轮得到 $(0.5,1.5)$；$s=0.5$ 一轮得到 $(0.25,1.75)$，增加投影会继续接近硬约束，而不是自动停在上述弹性参考解。

AVBD 若把该项作为**有限刚度**，工作刚度已经等于目标刚度、又没有启用额外策略，那么这组线性顶点更新可退化成上述 VBD sweep。若从较小刚度开始渐进，需报告实际工作刚度与总成本，不能给它凭空增加一个硬约束对偶后仍声称在比较同一个材料。

## 硬约束算例：有限罚参数为何可以不留永久伸长

改用一个质量为 $1\,\mathrm{kg}$ 的自由度，目标位置 $L=1\,\mathrm m$，惯性预测 $y=2\,\mathrm m$，$h=0.1\,\mathrm s$，记 $a=m/h^2=100\,\mathrm{N/m}$。

### 有限罚能量的残留

只使用 $\rho(x-L)^2/2$ 时：

$$
x_{\mathrm{penalty}}=\frac{ay+\rho L}{a+\rho},
\qquad
x_{\mathrm{penalty}}-L=\frac{a(y-L)}{a+\rho}.
$$

取 $\rho=100\,\mathrm{N/m}$，即便完全求解，也得到 $x=1.5\,\mathrm m$。这个误差属于有限罚模型，不是多做几次 VBD 局部迭代就能消除。

### 增广机制的独立化简

为了只看对偶作用，取固定 $\rho$、不热启动、不正则化，也不增长罚参数。原问题只有一个标量，直接精确解：

$$
x^{k+1}=\frac{ay+\rho L-\Lambda^k}{a+\rho},
\qquad
\Lambda^{k+1}=\Lambda^k+\rho(x^{k+1}-L).
$$

这是 AVBD 所用硬约束 ALM 机制的**最简算例**，不是原论文全部策略的性能复现。由两式可得：

$$
x^{k+1}-L=\frac{a}{a+\rho}(x^k-L),
$$

其中第一步从 $\Lambda^0=0$ 开始单独计算。取 $a=\rho=100$：

| 原对偶轮数 | 位置 | 累计对偶 |
|---|---:|---:|
| $1$ | $1.5\,\mathrm m$ | $50\,\mathrm N$ |
| $2$ | $1.25\,\mathrm m$ | $75\,\mathrm N$ |
| $3$ | $1.125\,\mathrm m$ | $87.5\,\mathrm N$ |
| $4$ | $1.0625\,\mathrm m$ | $93.75\,\mathrm N$ |
| 极限 | $1\,\mathrm m$ | $100\,\mathrm N$ |

对偶吸收了最终反力，误差逐步消失，不需要把 $\rho$ 取成无限大。不过 PBD 硬投影与 $\alpha=0$ 的 XPBD 在这个单约束例子中可以一步到 $1$；本例证明的是“有限罚参数加乘子可消除残差”，不是 AVBD 普遍迭代更少。

## 可运行的同参数对照

下面只执行上述一维线性问题，不包含真实碰撞、材料非线性、三维旋转、罚参数增长或 GPU 并行。代码输出与表格共用相同参数，仓库审计直接提取本段执行。

~~~js
// knowledge-solver-comparison-example
const positive = values => {
  if (!values.every(v => Number.isFinite(v) && v > 0)) {
    throw new Error("invalid positive parameter");
  }
};
const validCount = count => {
  if (!Number.isInteger(count) || count < 1) throw new Error("invalid count");
};
export function springComparison({
  h = 0.1, mass = 1, stiffness = 100, sweeps = 4, strength = 0.5
} = {}) {
  positive([h, mass, stiffness]); validCount(sweeps);
  if (!(Number.isFinite(strength) && strength >= 0 && strength <= 1)) {
    throw new Error("invalid strength");
  }
  const a = mass / (h*h), w = 1/mass;
  const alphaT = 1 / (stiffness*h*h);
  const exact = [stiffness/(a + 2*stiffness), 2-stiffness/(a + 2*stiffness)];
  let pbd = [0, 2], xpbd = [0, 2], vbd = [0, 2], lambda = 0;
  const history = [];
  const energy = x => a/2*(x[0]**2 + (x[1]-2)**2)
    + stiffness/2*(x[1]-x[0]-1)**2;
  const residual = x => {
    const force = stiffness*(x[1]-x[0]-1);
    return Math.max(Math.abs(a*x[0]-force), Math.abs(a*(x[1]-2)+force));
  };
  for (let k = 0; k < sweeps; k++) {
    const dlP = -strength*(pbd[1]-pbd[0]-1)/(2*w);
    pbd = [pbd[0]-w*dlP, pbd[1]+w*dlP];
    const dlX = (-(xpbd[1]-xpbd[0]-1)-alphaT*lambda)/(2*w+alphaT);
    xpbd = [xpbd[0]-w*dlX, xpbd[1]+w*dlX]; lambda += dlX;
    vbd[0] = stiffness*(vbd[1]-1)/(a+stiffness);
    vbd[1] = (2*a+stiffness*(vbd[0]+1))/(a+stiffness);
    history.push({
      pbd: [...pbd], xpbd: [...xpbd], vbd: [...vbd],
      energy: energy(vbd), residual: residual(vbd)
    });
  }
  return { exact, history, lambda, alphaT };
}
export function hardConstraint({ h = 0.1, mass = 1, penalty = 100, rounds = 4 } = {}) {
  positive([h, mass, penalty]); validCount(rounds);
  const a = mass/(h*h), y = 2, target = 1;
  const penaltyOnly = (a*y+penalty*target)/(a+penalty);
  let dual = 0;
  const history = [];
  for (let k = 0; k < rounds; k++) {
    const x = (a*y+penalty*target-dual)/(a+penalty);
    dual += penalty*(x-target);
    history.push({ x, dual });
  }
  return { penaltyOnly, history };
}
~~~

这里的“AVBD 对照”是可证明的硬约束机制化简；没有伪造一个缺少受限对偶、正则化和接触历史的完整 AVBD 实现。数值例子也不是网站中 three-avbd 或 UE 插件的运行验收。

### 一个非线性 XPBD 的平衡残差反例

为了检验前面关于两类残差的区别，再构造一个**无量纲数学例子**：单个二维点，$M=I$、$h=1$、惯性预测 $y=(1.6,0.8)$，约束与时间缩放柔度为：

$$
C_1=x_1^2+x_2^2-1,\qquad C_2=x_1-0.5,
\qquad \widetilde\alpha_1=0.02,\quad\widetilde\alpha_2=0.03.
$$

这只是“圆形软约束加直线软约束”，不模拟碰撞；从零乘子、预测位置开始，依次更新 $C_1,C_2$。由于第二项使方向偏转，第一项的 Jacobian 不再一直指向同一个方向。

下面直接实现基础 XPBD 式，不夹断位置、不加阻尼，也不通过提高容差制造收敛：

~~~js
// knowledge-xpbd-nonlinear-residual-example
export function nonlinearResidual(rounds = 1000) {
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error("invalid count");
  const y = [1.6, 0.8], x = [...y], lambda = [0, 0], alphaT = [0.02, 0.03];
  for (let k = 0; k < rounds; k++) {
    for (let j = 0; j < 2; j++) {
      const c = j === 0 ? x[0]*x[0]+x[1]*x[1]-1 : x[0]-0.5;
      const gradient = j === 0 ? [2*x[0], 2*x[1]] : [1, 0];
      const w = gradient[0]**2 + gradient[1]**2;
      const dl = (-c-alphaT[j]*lambda[j])/(w+alphaT[j]);
      x[0] += gradient[0]*dl; x[1] += gradient[1]*dl;
      lambda[j] += dl;
    }
  }
  const c = [x[0]*x[0]+x[1]*x[1]-1, x[0]-0.5];
  const rc = c.map((value, j) => value+alphaT[j]*lambda[j]);
  const rx = [
    x[0]-y[0]-2*x[0]*lambda[0]-lambda[1],
    x[1]-y[1]-2*x[1]*lambda[0]
  ];
  return { x, lambda, rc, rx };
}
~~~

一千轮后，数值约为：

$$
x=(0.524429,0.850204),\qquad
\lambda^X=(0.106421,-0.814289),
$$

$$
\|r_c\|_\infty<10^{-12},\qquad
r_x\approx(-0.372903,-0.130756).
$$

这是一个约束关系几乎不再变化、但完整位置平衡残差仍明显非零的具体结果。它反驳“基础 XPBD 只要轮数够多就必然等于完整非线性隐式 Euler”的泛化，并不证明所有 XPBD 场景都有这么大误差，也不评价已经加入其他残差修正的变体。

对照前面的线性弹簧：同样基础更新在常 Jacobian 例子中可以精确；本例的问题来自非线性和残差处理，而不只是“它使用的公式比较短”。

## 接触与摩擦：四种方法都还需要正确几何

### 非穿透的原始条件

定义间隙 $g(x)\ge0$，接触反力幅值 $p\ge0$，理想互补条件：

$$
g\ge0,\qquad p\ge0,\qquad pg=0.
$$

PBD 可以只在穿透时投影；XPBD 可对累计法向乘子作可行域投影；VBD 可以使用穿透罚能量、其他接触势或专门约束处理；AVBD 可通过受限对偶组织接触。

这些路线的共同前提是接触法线、间隙、见证点和可用自由度正确。不存在的接触不会因迭代更多被发现；错误法线可能使所有方法都把物体推向错误方向。

### 受限对偶与符号

用 $c=-g\le0$ 表示违规量，则本文增广约定的法向候选为：

$$
p_{\mathrm{trial}}=\max(0,\Lambda+\rho c).
$$

若在完全活跃的等式区间，可以使用前面的局部式；但一般不应把未投影的 $\Lambda+\rho c$ 直接当作力，否则会产生吸引。

一种相应投影增广势的表达为：

$$
\Psi(c)=\frac{\max(0,\Lambda+\rho c)^2-\Lambda^2}{2\rho}.
$$

它解释投影后的力来自哪里，不代表任意实现都精确使用该势的 Hessian。原 AVBD 还对受限力的局部曲率采取近似，实际代码需按实现核对。

### 摩擦不仅是把切向量钳住

库仑可行域为：

$$
\|p_t\|_2\le\mu p_n.
$$

三维切向量应在切平面内按圆盘/摩擦锥投影。若分别按两个轴限制到同样区间，通常得到方形可行域，斜向摩擦大小就不同；有些实现会有意采用多面体近似，但应明确。

静摩擦还依赖切向锚点、当前接触身份和法线旋转后的基变换。恢复系数、碰撞事件、速度级冲量与位置消穿透也有不同职责；不能把一次位置修正全部解释为真实弹性碰撞。

接触几何与流形详见[接触响应](/knowledge/contact-response-and-manifolds/)，这里不重复完整窄相和流形生成。

## 状态与执行顺序决定你实际实现了什么

### 一次子步的共同外壳

~~~text
读取已提交的 x、v 与本步输入
  → 构造惯性预测，固定端单独处理
  → 生成/刷新接触和邻接，校验容量与缓存
  → 初始化候选及方法特有状态
  → 执行位置层迭代
  → 检查残差、非法数值与有效性
  → 重建速度，执行声明的速度级处理
  → 提交状态并发布给渲染/宿主
~~~

这只是职责示意，不是四篇论文或全部引擎共享的逐行流水线。尤其接触可能需要在预测后或迭代中刷新，不能将一张过期接触列表永久使用。

### 方法特有的读写

| 方法 | 一次局部操作读什么 | 写什么 | 一轮结束后还做什么 |
|---|---|---|---|
| PBD | 当前约束位置、逆质量、强度 | 关联位置 | 继续投影或结束 |
| XPBD | 上述位置、柔度、本步该约束累计乘子 | 位置和该乘子 | 检查约束及平衡误差 |
| VBD | 当前顶点及邻居、惯性目标、所有邻接能量 | 当前块的位置 | 继续颜色/sweep，更新接触等 |
| AVBD | 上述邻接，加对偶、工作罚参数、投影界 | 原变量块 | 在一致位置上更新各约束状态 |

如果在每个顶点局部操作后都对同一约束累计一次对偶，约束两端可能重复更新；如果对偶 pass 在原问题写入完成前就读取，又产生执行竞争。这些都不是简单更改迭代次数。

### 重置、传送与缓存失效

新子步、整场 Reset、传送、拓扑改变、固定/动态切换、改变质量和切换步长是不同事件，应有不同的历史处理。

PBD/XPBD 的低状态量不等于完全无缓存，VBD 也可能保存预测、加速和接触状态。AVBD 通常更依赖约束身份持续性；未建立身份映射时，不应盲目复用旧对偶。

项目中的状态 Pending → Accepted/Committed、GPU 容量及失败恢复，见[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)。本文没有重新核查插件当前分支，不能把通用伪代码冒充该插件执行事实。

## CPU 与 GPU：更新图不同，成本也不同

### 约束染色与顶点染色

顺序 XPBD 中，一个约束常写多个顶点。要并行处理约束，需避免同色约束写同一自由度，或使用另行定义的 Jacobi 累积方案。

VBD 每块只写自身，但读取邻居；同色块不能共享会产生耦合的能量关系，否则就不再保持同样的 GS 语义。AVBD 在原变量颜色之间还有约束状态更新阶段。

通常可以这样理解：

- 约束图：两个约束共享写入自由度就可能冲突。
- 顶点图：一个能量项涉及多个顶点，就在对应块之间建立依赖。
- 接触会动态增加边，原来的静态着色未必继续合法。

高阶单元或同顶点多类约束可能让约束图更密，但不能推导出所有网格都“VBD 固定更少颜色”。颜色数也不是唯一指标，还要看每色工作分布和内存访问。

### 总成本怎样报告

设一个约束最多关联 $r$ 个块，有 $N_c$ 个约束、$N_v$ 个顶点；在固定局部维度下，一轮 PBD/XPBD 的局部工作与约束访问量相关，VBD/AVBD 的装配与邻接总量及小矩阵求解相关。

比较时应记录：

$$
T_{\mathrm{step}}=
T_{\mathrm{collision}}+T_{\mathrm{topology}}
+T_{\mathrm{assembly}}+T_{\mathrm{solve}}
+T_{\mathrm{sync}}+T_{\mathrm{publication}}.
$$

XPBD 可能每约束只算梯度；VBD 要更多导数，但可以按顶点聚合并利用局部并行。AVBD 多了约束状态读写，也可能因更好的有限预算结果而减少所需轮数。只有实际工作负载能决定哪种权衡更好。

只比较 GPU dispatch 的提交耗时会漏掉实际执行；CPU 端只看总帧率也无法区分碰撞和求解。必须报告设备、精度、参数、残差、接触数量与同步范围。

## 刚体、软体与流体分别改变什么

### 刚体不是七维线性顶点

刚体通常以平移加三维旋转增量构成六自由度局部块。四元数有四个存储数，不代表四个独立旋转自由度。

接触梯度要包含力臂，例如接触点位置：

$$
r=p+Rr_{\mathrm{local}},
\qquad
\delta r=\delta p+\delta\theta\times(Rr_{\mathrm{local}}).
$$

XPBD 可使用广义逆质量与惯性，VBD/AVBD 需构造相应局部角向模型。旋转更新、世界/本体角速度与速度重建都必须一致；不能仅把三维矩阵扩成六维对角阵。

具体原生刚体 AVBD 见[avbd-demo3d](/knowledge/avbd-demo3d-implementation/)，它是实现资料，不与本文的一维例子混为同一验证范围。

### 布料与体弹性

PBD 可以通过几何拉伸、弯曲等控制外观；XPBD 可以给这些约束指定柔度，也可以从材料能量构造约束。VBD 更直接对能量单元求导，但要维护参考面积/体积、材料稳定性和非凸状态的定义。

比较之前，应核对是否真的在使用相同的膜、壳、体积与弯曲能量。若一个版本用距离弹簧，另一个用各向异性 FEM，再得到不同褶皱，不能全部归功于求解器名字。

弹性模型见[可变形体动力学](/knowledge/deformable-body-dynamics/)，杆的取向自由度见[弹性杆](/knowledge/position-based-elastic-rods/)。

### 流体不是换一个块就完成

PBF 将粒子密度约束用于位置修正，但不可压缩流体还涉及邻域、边界、压力、黏性和速度处理。把 VBD/AVBD 用到流体也要先给出合适的目标与离散，不能单凭“都是粒子”继承固体结论。

流体主线见[流体动力学](/knowledge/fluid-dynamics/)；PBF 的算法见[密度约束](/knowledge/pbf-fluid-simulation/)。

## 怎样公平比较收敛、稳定性与精度

### 先给残差，而不只看位移变化

有限弹性问题可检查：

$$
r_{\mathrm{IE}}=\frac{M}{h^2}(x-y)+\nabla U(x).
$$

XPBD 还应同时看 $r_c$ 与 $r_x$；硬约束 ALM 则看原变量平衡、原始约束违规、互补与摩擦可行性。使用历史误差正则化时，同时记录 $\overline C$ 和 $C^\star$。

例如归一化的力平衡误差可写：

$$
\varepsilon_f=
\frac{\|r_{\mathrm{IE}}\|_\infty}
{F_{\mathrm{scale}}+\varepsilon_0},
$$

其中 $F_{\mathrm{scale}}$ 是明确选择的力尺度，$\varepsilon_0$ 也有力单位。不同单位的残差不要直接相加。

只看 $\|x^{k+1}-x^k\|$ 很小可能误判：局部步被夹断、刚度很大、矩阵退化或根本未更新，都能让位移很小但残差很大。

### 四类问题不能混成一个“稳定”

| 检查对象 | 典型问题 | 合适的观察 |
|---|---|---|
| 连续模型 | 材料、接触或输入定义不对 | 与解析/实验模型对照 |
| 时间离散 | 大步长改变相位、耗散与碰撞时机 | 步长减半、相同模拟时刻比较 |
| 代数求解 | 长链传播慢、非线性平衡未满足 | 残差随时间/轮数的曲线 |
| 工程执行 | 过期接触、越界、竞争、未提交状态 | 容量、依赖、版本与异常日志 |

“数值有界”“目标下降”“约束可行”“能量合理”“几何不穿透”是不同的判据。论文中的稳定性描述也有模型和实现条件，不代表任意接触组合、错误代码或矛盾约束永不失败。

### 迭代、子步与加速

同一子步增加 sweep 主要减少当前离散问题的求解误差；拆成更多子步会重新计算惯性预测、可能刷新碰撞，并改变时间离散误差。两者既不等价，也不一定同成本。

[Small Steps 2019](https://mmacklin.com/smallsteps.pdf)研究过小子步与少量 XPBD 迭代的效果；它支持在对应实验中比较两种预算分配，不是“任何场景都应该一子步一轮”的通用定律。

Jacobi/GS 是更新顺序，Chebyshev、动量、层次方法和预条件是其他策略。VBD 原论文已经讨论动量加速，所以不能将 AVBD 的 A 解释为“第一次加入加速”，更不能说这四种方法天然有统一线性或二次收敛率。

## 调参时哪些参数不能互相代替

| 参数 | 所在层 | 主要改变 | 常见误用 |
|---|---|---|---|
| $h$ 与子步数 | 时间离散 | 惯性尺度、碰撞采样、离散轨迹 | 用增加代数迭代替代所有子步 |
| sweep 数/预算 | 代数求解 | 当前问题的残差 | 把未收敛当作材料更软 |
| PBD $s$ | 投影规则 | 每次消除的误差比例 | 当成有单位的弹性刚度 |
| XPBD $\alpha$ | 材料/柔性约束 | 力与违规量的关系 | 忘记按 $h^2$ 缩放或每投影清乘子 |
| $\kappa^\star$ | 有限能量 | 目标材料 | 为消穿透无限调大所有材料刚度 |
| AVBD $\rho$ | 硬约束求解 | 原问题条件和对偶增长速度 | 当作最终材料刚度 |
| $\beta$ | 工作刚度调度 | 误差驱动增长 | 不看约束量纲照抄论文数值 |
| $\eta$ | 历史误差处理 | 本步纠正多少旧误差 | 与 XPBD 柔度混淆 |
| $\gamma$ | 热启动 | 上一步状态继承程度 | 用旧接触反力驱动新接触 |
| 曲率近似/步长接受 | 局部求解 | 方向、稳健性和单轮成本 | 声称所有变体仍是精确 Newton |

约束归一化也会改变数字意义。若把同一个约束改写成 $C'=sC$，为了保持相同有限能量，应有：

$$
\kappa'=\frac{\kappa}{s^2},\qquad
\alpha'=s^2\alpha.
$$

对应位置层乘子和增广对偶分别按 $1/s$ 缩放，罚参数按 $1/s^2$ 缩放。目标相同仍不保证有限预算的所有策略等价；增长阈值、容差和限幅也需重新量纲化。

## 工程选型与迁移

### 哪些情况下先用哪一条路线

以下是工程建议，不是项目已实测的排名：

- 主要需要几何控制、固定预算和快速实现：PBD 可以作为起点，但明确它的强度不是材料标定。
- 希望复用约束体系并引入明确软硬参数：先评估 XPBD，重点检查子步、累计乘子、非线性与接触。
- 已有材料能量和可靠导数，希望围绕隐式目标聚合顶点邻接：评估 VBD，验证非凸曲率和块传播。
- 硬关节、堆叠摩擦、软硬混合和高刚度比成为瓶颈：评估 AVBD 的完整状态机制，不只复制硬约束公式。
- 高精度或严格约束需求：还应评估更全局的 Newton/KKT、直接消元、接触方法与误差控制，不将四种方法视为全部选择。

### 迁移不能只改一个名字

PBD → XPBD，需要柔度、累计乘子、正确步长缩放与有效力约定。

XPBD → VBD，需要从每约束的投影访问转成每块的能量装配，增加导数、邻接和曲率策略；不是简单把 lambda 删掉。

VBD → AVBD，需要区分有限材料项与硬约束项，增加对偶、工作刚度、受限投影、历史误差、缓存与原对偶顺序。每项都会影响状态重置和并行依赖。

CPU → GPU 还需要数据所有权、资源容量、同步和有效状态发布；论文公式不会替工程完成这些职责。

### 应该保留的对照场景

至少同时观察线性单弹簧、带不同质量的长链、相差很大的材料刚度、布料/体弹性压缩、静止堆叠、斜面摩擦、高速接触、初始穿透、重置和拓扑改变。

每个场景分别报告误差和成本。不能用额外阻尼、清空速度或忽略失败来制造“更稳定”的比较；也不能将本文一维算例通过包装成完整求解器验收。

## 资料边界与站内阅读

本文使用 PBD 原始论文、XPBD 2016、VBD 2024 arXiv v4、AVBD SIGGRAPH 2025 和 Small Steps 2019 的各自定义。文中独立推导与化简算例都明确限定了模型，不把四种方法串成“每一代完全替代上一代”的单线升级关系。

原论文落点：

- [PBD：Position Based Simulation 与 Constraint Projection](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)。
- [XPBD：Eq. (8)–(18)、Algorithm 1 与 Damping](https://mmacklin.com/xpbd.pdf)。
- [VBD：Global Optimization、Local System Solver、Parallelization](https://arxiv.org/html/2403.06321v4#S3)。
- [AVBD：Eq. (8)–(19)、Algorithm 1、Implementation Details](https://graphics.cs.utah.edu/research/projects/avbd/Augmented_VBD-SIGGRAPH25.pdf)。
- [Small Steps：子步与迭代预算实验](https://mmacklin.com/smallsteps.pdf)。

继续看通用推导时，分别进入[PBD/XPBD](/knowledge/pbd-xpbd-math/)与[VBD/AVBD](/knowledge/vbd-avbd-math/)；看 GS、Jacobi 与线性残差，进入[迭代求解](/knowledge/iterative-linear-solvers/)；看真实状态和执行顺序，进入[原生 AVBD](/knowledge/avbd-demo3d-implementation/)、[three-avbd](/knowledge/three-avbd-gpu-solver/)与[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)。
