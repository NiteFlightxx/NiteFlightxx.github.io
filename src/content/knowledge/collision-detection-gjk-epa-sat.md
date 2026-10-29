---
title: 凸体碰撞检测：SAT、GJK 与 EPA
excerpt: 从投影与支撑映射推导凸体相交、距离和穿透查询，明确退化、容差与输出边界。
date: '2026-07-08'
category: Physics
subtopic: Collision
tags:
  - 碰撞检测
  - GJK
  - EPA
  - SAT
  - Minkowski差
  - Chaos
readTime: 阅读约15分钟
kind: algorithm
level: intermediate
pageType: guide
aliases:
  - 凸体碰撞检测详解 — 从 SAT 到 GJK 再到 EPA 的积木式推导
prerequisites:
  - ue-linear-algebra-guide
nextArticles:
  - gjk-collision-detection
related: []
topics:
  - id: ue-chaos-physics
    stage: collision
    role: algorithm
    order: 20
sources:
  - title: Eberly：分离轴方法
    url: 'https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf'
---
SAT、GJK 和 EPA 不是按“旧算法到新算法”排列的替代品。SAT 用投影判断分离，GJK 用支撑映射求距离或相交，EPA 在满足初始化条件时近似求穿透。它们都不直接完成摩擦、碰撞响应或持久接触流形。

本文拥有通用凸体几何的推导；Chaos 查询的 margin、容差与实现分支继续见[Chaos GJK](/knowledge/gjk-collision-detection/)。只需要向量、点积、叉积与坐标变换，不要求先读完整力学和积分。

<span id="学习位置" aria-hidden="true"></span>
<span id="零我们要解决什么问题" aria-hidden="true"></span>
<span id="附录-b符号表" aria-hidden="true"></span>

## 查询问题与符号约定

先假设 $A,B$ 是同一空间内、非空且紧致的凸集。有限顶点凸包满足这些条件；非凸网格需要分解、层级或其他处理，不能直接用一个 support 函数保留凹陷。

需要区分四种输出：

1. **相交**：两集合是否共有点；是否把接触算相交要明确。
2. **分离距离**：不相交时最近距离与两侧见证点。
3. **穿透**：固定朝向下，使两体达到不穿透所需的最短平移及方向。
4. **流形**：供后续求解使用的一组接触、特征与持续身份。

本文法线 $\mathbf n$ 规定为“将 $B$ 向外推的方向”，与许多接口所谓从 A 指向 B 的接触法线一致，但在深包含时不能只靠质心连线定义。见证点的有符号间隙写作：

$$
\phi=(\mathbf p_B-\mathbf p_A)\cdot\mathbf n.
$$

分离时 $\phi>0$，接触时近零，穿透时 $\phi<0$。换成 $B-A$ 的 Minkowski 约定或交换物体顺序时，需要整体检查符号，而不是只翻转其中一个向量。

<span id="积木第一层sat--投影即分离" aria-hidden="true"></span>
<span id="11-分离轴定理" aria-hidden="true"></span>
<span id="12-投影区间与重叠判定" aria-hidden="true"></span>
<span id="13-候选轴集合为什么是面法线--边叉积" aria-hidden="true"></span>
<span id="14-最小平移向量mtv" aria-hidden="true"></span>
<span id="15-sat-的根本局限" aria-hidden="true"></span>

## SAT：一个分离投影就足够

对单位轴 $\mathbf n$，投影区间为：

$$
I_A(\mathbf n)=[a_{\min},a_{\max}]
=\left[\min_{\mathbf a\in A}\mathbf n\cdot\mathbf a,\;
\max_{\mathbf a\in A}\mathbf n\cdot\mathbf a\right].
$$

若：

$$
a_{\max}<b_{\min}
\quad\text{或}\quad
b_{\max}<a_{\min},
$$

该轴就是分离证据。相等时是接触；浮点实现需要单独定义几何容差和接触厚度。

对凸多边形，检查两体各边法线即可；对有体积的三维凸多面体，需要两体面法线和非平行边对的叉积轴。OBB 的常见候选是 $3+3+9=15$ 个，平行轴与重复轴需要处理。这个有限候选集不能原封不动用于球、胶囊或任意曲面。候选轴的几何依据见 [Eberly：Method of Separating Axes `2–4](https://www.geometrictools.com/Documentation/MethodOfSeparatingAxes.pdf)。

### 包含情形：交集长度不是推出距离

在已经重叠的单位轴上，若只移动 $B$：

$$
d_+=a_{\max}-b_{\min},\qquad
d_-=b_{\max}-a_{\min}.
$$

向正轴移动 $d_+$ 或向负轴移动 $d_-$ 才达到刚好接触。选择较短方向，而不是一律取区间交集长度。

例如：

$$
I_A=[0,10],\quad I_B=[4,6].
$$

交集长度为 $2$，但把 $B$ 推到 $A$ 外需要沿任一方向移动 $6$。这正是深包含场景中“算了 overlap 却仍穿透”的常见原因。

下面是单轴示例，不是完整 SAT。距离单位来自投影轴，因此调用前必须归一化；实际多面体还要枚举完整候选集。

~~~js
// knowledge-sat-example
export function axisEscape(aMin, aMax, bMin, bMax) {
  if (![aMin, aMax, bMin, bMax].every(Number.isFinite) ||
      aMin > aMax || bMin > bMax) throw new Error("invalid interval");
  if (aMax < bMin || bMax < aMin) return { separated: true };
  const plus = aMax - bMin;
  const minus = bMax - aMin;
  return plus <= minus
    ? { separated: false, depth: plus, sign: 1 }
    : { separated: false, depth: minus, sign: -1 };
}
~~~

对于完整凸多面体与完整轴集，精确算术下可通过候选平面比较得到平移穿透解；工程中的轴退化、容差、特征偏置和裁剪仍会影响输出。SAT 不是天然“只有粗糙近似”，也不是自动给出稳定多点接触。

<span id="积木第二层minkowski-差----把碰撞变成原点在不在凸包里" aria-hidden="true"></span>
<span id="21-minkowski-差的定义" aria-hidden="true"></span>
<span id="22-核心定理相交--原点在-cso-里" aria-hidden="true"></span>
<span id="23-距离与穿透深度统一成原点到-cso-边界的距离" aria-hidden="true"></span>
<span id="24-支撑函数不显式构造-cso-的查询接口" aria-hidden="true"></span>

## Minkowski 差与支撑映射

定义：

$$
C=A-B=\{\mathbf a-\mathbf b\mid \mathbf a\in A,\ \mathbf b\in B\}.
$$

若两体相交，存在相同的 $\mathbf a=\mathbf b$，因此原点属于 $C$；反过来也成立：

$$
A\cap B\ne\varnothing\quad\Longleftrightarrow\quad\mathbf0\in C.
$$

若分离：

$$
\operatorname{dist}(A,B)=\min_{\mathbf c\in C}\|\mathbf c\|.
$$

若原点处于有体积 $C$ 的内部，则固定朝向的平移穿透问题与原点到 $C$ 边界的最短距离相关。不能把分离时到集合的距离与内部时到边界的距离混写：内部到集合的距离本来就是零。

定义支撑点和支撑函数：

$$
S_A(\mathbf d)\in\arg\max_{\mathbf a\in A}\mathbf d\cdot\mathbf a,
\qquad
h_A(\mathbf d)=\max_{\mathbf a\in A}\mathbf d\cdot\mathbf a.
$$

支撑点是向量，支撑函数是标量；极值处可能有多个合法支撑点。Minkowski 差满足：

$$
S_C(\mathbf d)=S_A(\mathbf d)-S_B(-\mathbf d).
$$

所以不用显式构造所有顶点差。每次查询应同时保留两侧原始支撑点，之后才能恢复见证点。

### 形状变换与 margin

一般仿射变换 $\mathbf x_W=\mathbf L\mathbf x_L+\mathbf t$ 下：

$$
S_W(\mathbf d)=\mathbf L S_L(\mathbf L^{\mathsf T}\mathbf d)+\mathbf t.
$$

方向查询与返回位置不是同一种变换；刚性变换只是其中的特殊情况。

如果 margin 表示在当前欧氏空间与半径为 $r$ 的球作 Minkowski 和，则对非零方向：

$$
S_{A\oplus\mathbb B_r}(\mathbf d)
=S_A(\mathbf d)+r\frac{\mathbf d}{\|\mathbf d\|}.
$$

非均匀缩放后的球不再是同一半径的球，不能仍加一个统一标量 margin。core shape、实际表面与接触厚度也必须分开，否则法线正确仍可能出现表面位置偏差。

<span id="积木第三层gjk----在-minkowski-差里向原点迭代逼近" aria-hidden="true"></span>
<span id="31-这一层在完整管线中的职责" aria-hidden="true"></span>
<span id="32-需要记住的工程不变量" aria-hidden="true"></span>
<span id="35-chaos-最佳实践gjk-的工程化实现" aria-hidden="true"></span>
<span id="36-厚度膨胀与热启动" aria-hidden="true"></span>

## GJK：在小单纯形上求最近点

距离形式可视为求解：

$$
\min_{\mathbf c\in C}\frac12\|\mathbf c\|^2.
$$

GJK 维护一个来自 $C$ 的小单纯形 $\mathcal S$。三维中最多需要点、线段、三角形或四面体来表达相关凸组合；求当前凸包到原点的最近点，并按重心权重移除不活跃顶点。

设该最近点为 $\mathbf v$，搜索方向取 $-\mathbf v$：

$$
\mathbf w=S_C(-\mathbf v).
$$

若当前单纯形已在容差意义下包围原点，进入相交/穿透处理；否则把新支撑点加入，再更新最近点。关键不是“每次都加一个点”，而是正确求最近特征、保留对应两侧见证点并处理退化。

### 距离收敛与相交判定不要混用

对非零 $\mathbf v$，可以从支撑查询构造：

$$
g=\|\mathbf v\|^2-\mathbf v\cdot\mathbf w.
$$

在精确支撑与合法最近点条件下：

$$
d_{\mathrm{upper}}=\|\mathbf v\|,\qquad
d_{\mathrm{lower}}=
\max\left(0,\frac{\mathbf v\cdot\mathbf w}{\|\mathbf v\|}\right).
$$

二者夹住真实分离距离。用上下界差或相应相对/绝对容差停止，比不加说明地比较两个不同量纲的数更清楚。

布尔形式中，若某非零方向上的支撑满足 $\mathbf d\cdot S_C(\mathbf d)<0$，则有严格分离证据。但迭代达到上限、重复支撑或进展不足本身不是“确定分离”，也不能把距离在容差内近零直接当作确定深穿透。

### 见证点与退化状态

若最近单纯形点的重心权重为 $\alpha_i$：

$$
\mathbf p_A=\sum_i\alpha_i\mathbf a_i,\qquad
\mathbf p_B=\sum_i\alpha_i\mathbf b_i,\qquad
\mathbf v=\mathbf p_A-\mathbf p_B.
$$

分离时本文法线为 $(\mathbf p_B-\mathbf p_A)/\|\mathbf p_B-\mathbf p_A\|$。接近零距离时不能继续直接归一化，应进入相应接触分支。

实现至少要区分：已证明分离、距离收敛、相交/近接触以及未确定。退化线段、共线/共面点、重复顶点、迭代上限和非法数值都应有明确处理，不应伪造成功。

<span id="积木第四层epa----把单纯形撑成多面体求穿透深度" aria-hidden="true"></span>
<span id="41-gjk-留下的悬案" aria-hidden="true"></span>
<span id="42-核心思想" aria-hidden="true"></span>
<span id="43-可见面与地平线" aria-hidden="true"></span>
<span id="44-收敛判据的数学" aria-hidden="true"></span>
<span id="45-为什么-epa-能收敛" aria-hidden="true"></span>
<span id="46-chaos-最佳实践epa-的工程化实现" aria-hidden="true"></span>
<span id="47-gjk-与-epa-的衔接" aria-hidden="true"></span>

## EPA：扩展包围原点的多面体

EPA 的常见三维输入是一个有效、非退化且包围原点的初始多面体，并保留两体支撑点。GJK 返回的 simplex 可能退化或只在边界接触，不能假定任何输入都可直接进入扩展循环。

选取当前内接多面体上最近的有效面，其单位外法线为 $\mathbf n_F$，面距为 $d_F$；沿法线取新支撑：

$$
\mathbf w=S_C(\mathbf n_F),\qquad
U=\mathbf n_F\cdot\mathbf w,\qquad
L=d_F.
$$

在有效内接多面体与正确最近边界选择的前提下，二者可作为穿透距离的界。一般收敛形式可写为：

$$
U-L\leq\varepsilon_{\mathrm{abs}}
+\varepsilon_{\mathrm{rel}}\max(|U|,|L|).
$$

这是通用说明，不是下文 Chaos 实现的逐字条件。不同实现可能维护全局上界，并有不同容差和退化分支。

未收敛时，删除新点可见的面，找到地平线边界，再连接新三角面。要保持面朝向、邻接和凸包有效性；翻转面、零面积面或破损地平线可能直接破坏结果。

收敛面上的重心坐标可用来恢复两体见证点。取本文的法线约定，穿透时近似有：

$$
\mathbf p_A-\mathbf p_B\approx\delta\mathbf n,\qquad
\phi\approx-\delta.
$$

EPA 的精度受容差、迭代预算、支撑误差和初始几何影响。它不保证机器精度下的精确穿透，不自动生成稳定流形，也不单独解决 CCD。

<span id="积木第六层完整窄相流水线" aria-hidden="true"></span>
<span id="为什么这套设计是最佳实践" aria-hidden="true"></span>

## 从窄相结果到可求解接触

一种通用设计示意是：

~~~text
宽相候选
  → 形状对分派
  → 专用几何 / SAT / GJK
  → 必要时穿透求解与退化处理
  → 表面点与法线校验
  → 接触裁剪、约简和持久化
  → 接触/摩擦约束
~~~

它不是所有引擎共享的固定调用链。GJK/EPA 输出一个接触方向或见证点后，还需要特征匹配、裁剪、多点选择和跨帧缓存。直接把单点当成完整盒面支撑，容易产生力矩不稳。

热启动利用时间相干性，但缓存的 simplex、特征与局部坐标必须跟随几何/变换版本更新；并非永久有效。迭代次数与形状复杂度、退化程度、margin、容差和运动都有关，不能承诺“每帧一到两次”。

连续碰撞还需要时间信息、扫掠或保守推进等流程；两个离散时刻都没有重叠，不代表中间没有穿过。响应与摩擦见[物理约束](/knowledge/physics_constraints_deep_dive/)。

<span id="积木第五层sat-在-chaos-里的真实位置重要最佳实践" aria-hidden="true"></span>
<span id="51-一个反直觉的事实chaos-的盒子-盒子不走-sat" aria-hidden="true"></span>
<span id="52-为什么弃用专用-sat" aria-hidden="true"></span>
<span id="53-chaos-里-sat-的两份代码" aria-hidden="true"></span>
<span id="54-sath-里的两个值得学的技巧" aria-hidden="true"></span>
<span id="附录-cchaos-关键-api-速查" aria-hidden="true"></span>

## 当前 Chaos 源码可以确认什么

本节核对根目录 `E:\UnrealEngine\UnrealEngine_Source`，Git 快照 `e28561eab454`，核对日期 2026-10-21。以下只陈述已读函数与直接调用，不把“找到某个定义”当成全引擎分派结论。

路径前缀均为 `Engine/Source/Runtime/Experimental/Chaos/`。

### 查询接口与输出有效性

- **源码事实**：`Public/Chaos/GJK.h:189` 定义 `GJKIntersection`；`GJK.h:2088` 的 `GJKDistance` 默认 `Epsilon=1e-3`、`MaxIts=16`。这些是该函数声明默认值，不是所有调用者都使用的全局参数。
- **源码事实**：`GJK.h:2050–2088` 的枚举与接口注释区分 `Separated`、`Contact`、`DeepContact`；深接触时输出不被填写，且 `InitialV` 必须来自/位于相应 Minkowski 集中。调用方不能只检查输出距离是否很小。
- **源码事实**：`GJK.h:561` 定义带 simplex 状态的 `GJKPenetrationWarmStartable`，默认 EPA 容差参数为 `1e-2`；`GJK.h:671–698` 实际调用 EPA 并按返回状态处理。`MaxIterations` 会采用当前 EPA 结果，但误差未知；退化时不能使用 EPA 的无效结果。

### EPA 并不把所有终止都视为准确成功

- **源码事实**：`Public/Chaos/EPA.h:421–427` 的状态包含 `Ok`、`MaxIterations`、`Degenerate`、`BadInitialSimplex` 与 `NoValidContact`，注释明确区分准确性与有效性。
- **源码事实**：`EPA.h:508–510` 的该实现迭代上限为 128；`EPA.h:541–559` 维护支撑上界，并使用含相对容差的界比较。不能把前面的通用绝对/相对混合判据当作它的原始代码。
- **需要验证**：这些默认值在项目实际尺度、形状和浮点路径下的误差与耗时；本文没有运行 UE 场景测试。

### 可以确认 SAT 调用，但不宣称“仅此一条”

**源码事实**：`Private/Chaos/Collision/ConvexTriangleContactPoint.cpp:744–773` 在启用相应 GJK/SAT 分支时先调用 GJKDistance，若返回 DeepContact，直接调用 SATConvexTriangle。对应定义在 `Public/Chaos/Collision/SATConvexTriangle.h:16`。

**源码事实**：`Public/Chaos/SAT.h:237` 存在通用 SATPenetration；`SAT.h:268–275` 按 PlaneBias、ObjectBias 比较结果。这证明代码结构与选择偏置存在，不能单凭定义确认其全部运行时调用范围。

本次没有重建所有形状对的完整分派，也没有证明 SAT 在其他路径中不存在。因此移除旧文的“所有凸对统一 GJK+EPA”“SAT 唯一运行时用途”“99% 覆盖”“固定一两次迭代”等绝对结论。具体调用链继续在[Chaos GJK 专题](/knowledge/gjk-collision-detection/)中按函数核对，不以通用原理替代版本证据。

<span id="附录-a三算法对照表" aria-hidden="true"></span>
<span id="附录-d参考资料" aria-hidden="true"></span>

## 工程取舍与继续阅读

SAT 适合候选轴清楚、需要显式特征的多面体查询；GJK 提供统一的凸体支撑接口；EPA补足某些相交状态下的穿透估计。选型要考虑形状、接触质量、退化处理与整体成本，不应仅凭某算法名字认定更现代或更稳定。

若出现法线翻转、穿透深度异常或接触漂移，先核查形状空间、缩放、物体顺序、margin、单位与输出状态，再测容差和迭代。不要先把求解器阻尼调大。

下一层分别是[Chaos 的数值与接口](/knowledge/gjk-collision-detection/)、[接触约束](/knowledge/physics_constraints_deep_dive/)、[2D 引擎串联实现](/knowledge/2d-physics-engine/)。GPU 碰撞的排程与容量约束见[three-avbd](/knowledge/three-avbd-gpu-solver/)，不能从本文推断其用了哪种窄相。
