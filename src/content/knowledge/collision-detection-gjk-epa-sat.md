---
title: "凸体碰撞检测的数学原理详解 - 从 SAT 到 GJK 再到 EPA 的积木式推导"
excerpt: "以虚幻引擎 Chaos 物理引擎为最佳实践参照，像搭积木一样，从分离轴定理(SAT)的投影思想出发，经由 Minkowski 差把碰撞问题转化为'原点是否在凸包内'，再用 GJK 在 Minkowski 差里向原点迭代逼近，最后用 EPA 把单纯形撑成多面体求出精确穿透深度。打通 SAT、GJK、EPA 三者之间的数学血缘。"
date: "2026-07-08"
category: "Physics"
subtopic: "Collision"
tags: ["碰撞检测", "GJK", "EPA", "SAT", "Minkowski差", "凸体", "虚幻引擎", "Chaos"]
readTime: "阅读约40分钟"
---

> 本文以虚幻引擎的 **Chaos 物理引擎**（`Engine/Source/Runtime/Experimental/Chaos`）为最佳实践参照，系统讲解凸体碰撞检测三大算法：**SAT（分离轴定理）**、**GJK（Gilbert-Johnson-Keerthi）**、**EPA（Expanding Polytope Algorithm，膨胀多面体算法）**。
>
> 三者并非并列可选，而是一条层层递进的积木：SAT 给出"投影即分离"的直觉与定理；Minkowski 差把"两体是否相交"统一成"原点是否在一个凸集里"；GJK 在这个凸集里向原点迭代逼近，给出距离或判定相交；EPA 则在 GJK 判定相交后，把 GJK 留下的单纯形撑成多面体，求出精确的穿透深度与接触法线。Chaos 正是把这条链路作为所有凸体对的通用窄相路径。

## 零、我们要解决什么问题

凸体碰撞检测要回答三个层层递进的问题：

1. **是否分离？**（boolean）——两凸体 $A, B \subset \mathbb{R}^3$ 当前有没有重叠。
2. **若相交，穿透多深？**（penetration depth）——把 $A$ 沿什么方向推多远，才能刚好和 $B$ 分离。这个方向叫**接触法线** $\mathbf{n}$，距离叫**最小平移距离（MTD / penetration depth）** $\delta$。
3. **接触点在哪？**（contact point）——碰撞响应该作用在两个物体表面的哪一对点上 $\mathbf{p}_A, \mathbf{p}_B$。

三个问题的难度依次递增。SAT 擅长回答问题 1（顺便给出问题 2 的近似），GJK 优雅地回答问题 1 并给出距离，EPA 在 GJK 判定相交后精确回答问题 2 和 3。

> **关键认知**：这三个问题对凸体而言，都可以归结为**一个凸集与原点的几何关系**问题。SAT 用投影枚举轴来逼近这个关系；GJK 用 Minkowski 差把关系精确化，再用单纯形迭代逼近；EPA 在原点已知"在里面"时，把单纯形扩展成多面体，找到离原点最近的面。下面一层一层搭。

---

## 积木第一层：SAT —— 投影即分离

### 1.1 分离轴定理

**定理（Separating Axis Theorem, SAT）**：两个凸集 $A, B$ 不相交，当且仅当存在一条轴 $\mathbf{n}$（单位向量），使得 $A$ 和 $B$ 在 $\mathbf{n}$ 上的投影区间不重叠。

$$
A \cap B = \emptyset \;\;\Longleftrightarrow\;\; \exists\, \mathbf{n}\neq\mathbf{0}:\; \mathrm{proj}_{\mathbf{n}}(A) \cap \mathrm{proj}_{\mathbf{n}}(B) = \emptyset
$$

这条轴 $\mathbf{n}$ 叫**分离轴**（separating axis），垂直于它的超平面叫**分离面**（separating plane）。

直观理解：如果两个物体在某个方向上的"影子"不重叠，那它们本身一定不重叠。SAT 就是把"找分离面"这个 $\mathbb{R}^3$ 里的几何问题，降维成"找投影不重叠的方向"。

### 1.2 投影区间与重叠判定

对凸体 $A$，沿轴 $\mathbf{n}$（过参考点 $\mathbf{x}_0$）的投影区间是一个闭区间：

$$
I_A(\mathbf{n}) = \left[\min_{\mathbf{a}\in A} \mathbf{n}\cdot(\mathbf{a}-\mathbf{x}_0),\;\; \max_{\mathbf{a}\in A} \mathbf{n}\cdot(\mathbf{a}-\mathbf{x}_0)\right] = [P^A_{\min},\, P^A_{\max}]
$$

对凸多面体，最值在顶点取得，所以只要遍历所有顶点做点积：

$$
P^A_{\min} = \min_{i} \mathbf{n}\cdot(\mathbf{a}_i-\mathbf{x}_0),\qquad P^A_{\max} = \max_{i} \mathbf{n}\cdot(\mathbf{a}_i-\mathbf{x}_0)
$$

两区间 $[P^A_{\min},P^A_{\max}]$ 与 $[P^B_{\min},P^B_{\max}]$ 不重叠，当且仅当：

$$
P^A_{\max} < P^B_{\min} \quad\text{或}\quad P^B_{\max} < P^A_{\min}
$$

只要找到**一个**这样的轴，就判定分离，立即返回"不相交"——这是 SAT 的**早退优势**。

### 1.3 候选轴集合：为什么是面法线 + 边叉积

对任意两个凸多面体，分离轴 $\mathbf{n}$（若存在）一定落在下面三类里之一：

1. **$A$ 的某个面的法线**；
2. **$B$ 的某个面的法线**；
3. **$A$ 的一条边与 $B$ 的一条边的叉积** $\mathbf{e}_A \times \mathbf{e}_B$。

直觉：分离面要么"贴着"某个体的一个面（法线 = 面法线），要么"夹在"两个体的两条边之间（法线同时正交于两条边，即两边的叉积）。这是 SAT 在多面体上的**有限候选集定理**（见 Eberly, Ericson《Real-Time Collision Detection》）。

于是候选轴集合为：

$$
\mathcal{N} = \{\mathbf{n}^A_f\}_{f\in F_A} \;\cup\; \{\mathbf{n}^B_f\}_{f\in F_B} \;\cup\; \{\mathbf{e}^A_i \times \mathbf{e}^B_j\}_{i\in E_A,\, j\in E_B}
$$

**对两个 OBB（有向包围盒）**：每个盒子有 3 个不同的面法线方向（对面共享法线）和 3 条不同方向的边，所以：

$$
|\mathcal{N}_{\text{box}}| = 3 + 3 + 3\times 3 = 15
$$

这就是教科书上著名的 **15 轴 SAT**。

### 1.4 最小平移向量（MTV）

如果所有候选轴上投影都重叠，说明两体相交。此时取**重叠最小**的那个轴，它给出把 $A$ 推出 $B$ 所需的最小平移：

$$
\delta = \min_{\mathbf{n}\in\mathcal{N}} \big(\,\text{overlap}(I_A(\mathbf{n}), I_B(\mathbf{n}))\,\big),\qquad \mathbf{n}^* = \arg\min_{\mathbf{n}\in\mathcal{N}} \text{overlap}(\cdot)
$$

接触法线即 $\mathbf{n}^*$，穿透深度即 $\delta$。**注意**：这是候选轴集合上的最小，未必是全局真正的最小穿透——只在候选集完备时才等于真值（对多面体，上述三类轴确实构成完备集，所以多面体上 MTV 是精确的）。

### 1.5 SAT 的根本局限

SAT 优雅且直观，但有一个致命的工程局限：**候选轴数量随形状复杂度爆炸**。

- 两个盒子：15 轴，可控。
- 两个各 100 个面的凸多面体：$100 + 100 + 100\times100 = \mathbf{10200}$ 轴，每轴还要遍历顶点投影——不可接受。
- 更糟的是，SAT 要求形状是**多面体**（有显式面、边、顶点）。球、胶囊、隐式曲面没有"面"可枚举。

这就引出了下一块积木：能不能不枚举所有轴，而是**迭代地搜索**那个分离方向？Minkowski 差给出了答案。

---

## 积木第二层：Minkowski 差 -- 把碰撞变成"原点在不在凸包里"

### 2.1 Minkowski 差的定义

定义两个集合 $A, B$ 的 **Minkowski 差**（也叫 Configuration Space Obstacle, CSO）：

$$
\mathrm{CSO}(A,B) = A \ominus B = \{\,\mathbf{a} - \mathbf{b} \mid \mathbf{a}\in A,\; \mathbf{b}\in B\,\}
$$

它是把 $B$ 逐点取负后与 $A$ 做 Minkowski 和。关键性质：**若 $A, B$ 都是凸集，则 $\mathrm{CSO}$ 也是凸集**（凸性在 Minkowski 和下保持）。

### 2.2 核心定理：相交 ⟺ 原点在 CSO 里

$$
A \cap B \neq \emptyset \;\;\Longleftrightarrow\;\; \mathbf{0} \in \mathrm{CSO}(A,B)
$$

**证明**：

（$\Rightarrow$）若存在 $\mathbf{a}\in A, \mathbf{b}\in B$ 使 $\mathbf{a}=\mathbf{b}$，则 $\mathbf{a}-\mathbf{b}=\mathbf{0}\in\mathrm{CSO}$。

（$\Leftarrow$）若 $\mathbf{0}\in\mathrm{CSO}$，则存在 $\mathbf{a}\in A, \mathbf{b}\in B$ 使 $\mathbf{a}-\mathbf{b}=\mathbf{0}$，即 $\mathbf{a}=\mathbf{b}\in A\cap B$。

这一步的威力在于：**两体相交的判定，被简化成了"原点是否在一个凸集里"**。SAT 本质上也是在 CSO 上工作--分离轴 $\mathbf{n}$ 就是过原点、把整个 CSO 推到一侧的法线。

### 2.3 距离与穿透深度统一成"原点到 CSO 边界的距离"

更进一步，定义原点到 CSO 的距离：

$$
d = \min_{\mathbf{c}\in\mathrm{CSO}} \|\mathbf{c}\|
$$

- 若 $d > 0$：原点在 CSO 外，两体**分离**，$d$ 即两体最短距离。
- 若 $d = 0$：原点在 CSO 边界上，两体**刚好接触**。
- 若 $d$ 无定义（原点在 CSO 内）：两体**相交**，此时离原点最近的 CSO 边界点给出**穿透深度**与**接触法线**：

$$
\delta = \min_{\mathbf{c}\in\partial\mathrm{CSO}} \|\mathbf{c}\|,\qquad \mathbf{n} = \frac{\mathbf{c}^*}{\|\mathbf{c}^*\|}
$$

把 $\mathbf{c}^* = \mathbf{a}^* - \mathbf{b}^*$ 拆回，$\mathbf{a}^*, \mathbf{b}^*$ 即两体上的接触点。

> **积木拼接点**：现在三个问题全部统一成"在凸集 CSO 上求离原点最近点"。SAT 用枚举轴近似求解；GJK 用迭代逼近精确求解。

### 2.4 支撑函数：不显式构造 CSO 的查询接口

直接构造 CSO 不可行（它有无穷多点）。但我们有一个**只通过两体各自查询就能得到 CSO 上点**的利器--**支撑函数（support function）**。

凸集 $X$ 沿方向 $\mathbf{d}$ 的支撑点：

$$
S_X(\mathbf{d}) = \arg\max_{\mathbf{x}\in X} \mathbf{d}\cdot\mathbf{x}
$$

对多面体，这是在顶点中取点积最大者（线性目标，最值在顶点）。Minkowski 差的支撑函数有一个美妙的分解：

$$
\boxed{\;S_{\mathrm{CSO}}(\mathbf{d}) = S_A(\mathbf{d}) - S_B(-\mathbf{d})\;}
$$

**证明**：$\max_{\mathbf{c}\in\mathrm{CSO}} \mathbf{d}\cdot\mathbf{c} = \max_{\mathbf{a}\in A,\mathbf{b}\in B} \mathbf{d}\cdot(\mathbf{a}-\mathbf{b}) = \max_{\mathbf{a}}\mathbf{d}\cdot\mathbf{a} - \min_{\mathbf{b}}\mathbf{d}\cdot\mathbf{b} = \max_{\mathbf{a}}\mathbf{d}\cdot\mathbf{a} - (-\max_{\mathbf{b}}(-\mathbf{d})\cdot\mathbf{b})$，取到最值的点正是 $S_A(\mathbf{d})$ 与 $S_B(-\mathbf{d})$。

含义：**要查 CSO 沿 $\mathbf{d}$ 方向最远的点，只需分别在 $A$ 上查 $\mathbf{d}$、在 $B$ 上查 $-\mathbf{d}$，再相减。** 我们永远不需要把 CSO 显式构造出来，只需要两体各自暴露一个 `Support(d)` 接口。

> **Chaos 实践**：这正是 Chaos 的 `GJKShape` 抽象的核心。任何凸体只要实现 `SupportCore(Direction)`，就能进入 GJK/EPA 通用管线。在 `GJK.h` 里支撑点组装就是一行 `W = A.SupportFunction(NegV) - B.SupportFunction(...)`，详见第五层。

---

## 积木第三层：GJK -- 在 Minkowski 差里向原点迭代逼近

### 3.1 核心思想

GJK 要在 CSO 上找离原点最近的点。它不枚举所有轴，而是**迭代地构造 CSO 内的一个单纯形 $\mathcal{S}$，让 $\mathcal{S}$ 一步步靠近原点**。

- 单纯形 $\mathcal{S} \subseteq \mathrm{CSO}$ 由至多 4 个支撑点组成（点 / 线段 / 三角形 / 四面体）。
- 每轮迭代，算 $\mathcal{S}$ 离原点最近的点 $\mathbf{v}$，方向取 $-\mathbf{v}$（指向原点）。
- 沿该方向取新支撑点 $\mathbf{w} = S_{\mathrm{CSO}}(-\mathbf{v})$，加入单纯形。
- 若 $\mathbf{w}$ 能让 $\mathcal{S}$ 更靠近原点，继续；否则收敛--$\mathbf{v}$ 已是 CSO 上离原点最近的点。

关键不变量：**单纯形始终是 CSO 的子集**（由支撑点张成），所以它的最近点 $\mathbf{v}$ 永远是真实最近点的上界（$\|\mathbf{v}\| \ge d$）。迭代让这个上界单调下降，逼近真值。

### 3.2 算法骨架

```
输入: 支撑函数 S_A, S_B（CSO 支撑 = S_A(d) - S_B(-d)）, 初始方向 d0
1. v ← S_CSO(d0)        // 初始单纯形 = 单点 {v}
2. 循环:
3.   d ← -v              // 指向原点的方向
4.   w ← S_CSO(d)        // 新支撑点
5.   若 d·w 不够推进 v:  // 见 3.4 收敛判据
6.      返回 dist = ‖v‖, v 即最近点 → 分离
7.   将 w 加入单纯形
8.   在单纯形上求离原点最近点 v，并丢掉对最近点无贡献的顶点  // 见 3.3
9.   若原点在单纯形(四面体)内部:
10.     返回"相交" → 交给 EPA
```

每轮要么单调推进（$\|\mathbf{v}\|$ 减小），要么判定收敛 / 相交，所以迭代有限步终止。

### 3.3 单纯形降维：四种情形求最近点

单纯形顶点数 $k\in\{1,2,3,4\}$。每轮要在 $\mathcal{S}$ 上求离原点最近点，并丢弃冗余顶点。这是 GJK 实现最繁琐的部分，本质都是**点到凸包的最近点投影**，用重心坐标求解：

- **$k=1$（点）**：最近点就是该点本身。
- **$k=2$（线段）**：把原点投影到线段，区间参数 $t\in[0,1]$，越界则退化到端点。
- **$k=3$（三角形）**：把原点投影到三角形所在平面，判断投影落点在哪个重心坐标区域（顶点区 / 边区 / 内部）。落在外部则退化到对应边或顶点。Chaos 用的是 Ericson《RTCD》的 7 区域测试。
- **$k=4$（四面体）**：判断原点是否在四面体内部。方法是算 4 个面相对原点的**符号化体积（子行列式 / cofactor）**：

$$
C_0 = -\mathbf{x}_1\cdot(\mathbf{x}_2\times\mathbf{x}_3),\;\; C_1 = \mathbf{x}_0\cdot(\mathbf{x}_2\times\mathbf{x}_3),\;\; C_2 = -\mathbf{x}_0\cdot(\mathbf{x}_1\times\mathbf{x}_3),\;\; C_3 = \mathbf{x}_0\cdot(\mathbf{x}_1\times\mathbf{x}_2)
$$

$$
\det M = C_0+C_1+C_2+C_3
$$

若 $C_0,C_1,C_2,C_3$ 与 $\det M$ **同号**，原点在四面体内部 → **相交**，移交 EPA。否则原点在某面外侧，退化到那个三角形（$k=3$）继续。

### 3.4 三种终止判据

GJK 同时盯着三个信号：

1. **分离**：新支撑点沿 $\mathbf{v}$ 方向没有推进。判据是 $\mathbf{v}\cdot\mathbf{w} \le (1-\varepsilon)\|\mathbf{v}\|^2$（van den Bergen 收敛准则）。含义是支撑点已经触不到比 $\mathbf{v}$ 更靠近原点的地方，$\mathbf{v}$ 即真最近点，返回距离 $\|\mathbf{v}\|$。
2. **相交**：原点落入四面体内部（$k=4$ 且 4 个 cofactor 同号），直接交 EPA。
3. **接触/退化**：$\|\mathbf{v}\|$ 小于阈值（Chaos 里 `Epsilon=1e-3`），说明原点贴近 CSO 边界，两体几乎接触，也交 EPA 求精确穿透。

> **van den Bergen 收敛准则的妙处**：$\mathbf{v}\cdot\mathbf{w}$ 是当前距离 $\|\mathbf{v}\|$ 的上界（因为 $\mathbf{w}\in\mathrm{CSO}$，$\mathbf{v}$ 是当前最近点的方向，真实最近距离 $d\ge \mathbf{v}\cdot\mathbf{w}/\|\mathbf{v}\|$）。当上界与当前值之差小于容差，就收敛。这是 GJK 数值稳定性的核心。

### 3.5 Chaos 最佳实践：GJK 的工程化实现

Chaos 把 GJK 实现成一个**头文件模板库** `Public/Chaos/GJK.h`（2172 行，header-only），配以 `Simplex.h`（标量）和 `SimplexVectorized.h`（SIMD）两套单纯形降维代码。入口分四类，对应不同查询需求：

| Chaos 入口 | 作用 | 返回 |
|---|---|---|
| `GJKIntersection` | 布尔相交判定 | `bool` |
| `GJKPenetration` / `GJKPenetrationWarmStartable` | 穿透 + 最近点 | 穿透深度、法线、两体接触点 |
| `GJKRaycast2` | 扫掠 / 射线检测 | 命中时间、位置、法线 |
| `GJKDistance` | 纯距离查询 | 距离、最近点 |

其中 `GJKDistance` 的源码注释明确引用 **Gino van den Bergen, "A Fast and Robust GJK Implementation for Collision Detection of Convex Objects," 1999**--Chaos 走的是教科书正脉。

**支撑点组装**（`GJK.h` 内联）：CSO 支撑点永远由两个独立支撑调用拼成：

```cpp
const TVec3<T> NegV = -V;
const TVec3<T> SupportA = A.SupportFunction(NegV, VertexIndexA);
const TVec3<T> SupportB = B.SupportFunction(BToATM, AToBRotation, V, VertexIndexB);
const TVec3<T> W = SupportA - SupportB;   // = S_CSO(V) 的支撑点
```

注意 $B$ 的支撑查询**在 $B$ 的局部空间**进行（先把方向旋到 $B$ 空间，查完再旋回 $A$ 空间），避免把整个 $B$ 变换到 $A$ 空间--这是减少计算的关键技巧。

**类型擦除的支撑接口** `FGeomGJKHelper`：为了不让每种凸体类型都实例化一份 GJK 模板（会膨胀代码体积），Chaos 用函数指针把支撑调用擦除为统一签名。源码注释说这一招省下了约 4MB 的 `.text` 段：

```cpp
struct FGeomGJKHelper {
    typedef FVector(*SupportFunc)(const void* Geom, const FVec3& Dir,
                                   FReal* OutSupportDelta, int32& VertexIndex);
    const void* Geometry;   // 任何实现了 SupportCore 的凸体
    SupportFunc Func;       // 指向特化的 SupportCore<T>
    FRealSingle Margin;     // 厚度膨胀（见 3.6）
};
```

任何凸体只要实现 `SupportCore(Direction, Margin, ...)`，就能套进这个壳子被 GJK 调用--这就是 Chaos "GJK 通用凸体管线"的根基。

**单纯形数据结构** `FSimplex`：用 `NumVerts + int32 Idxs[4]` 的间接索引，丢弃顶点只需改索引、不必移动数组，最后 `ReorderGJKArray` 统一压实。降维主入口 `SimplexFindClosestToOrigin` 按 `NumVerts` 分派到线 / 三角形 / 四面体的最近点求解器。

**四面体内部判定**用上面 3.3 的 cofactor 方法（`Simplex.h` 的 `TetrahedronSimplexFindOrigin`），SIMD 版（`SimplexVectorized.h`）用 `VectorSignMatch` 并行判定 4 个面，容差 `Eps = KindaSmallNumber * (DetM/4)`。

**终止常量**（`GJK.h`）：

| 常量 | 值 | 含义 |
|---|---|---|
| `Epsilon`（交 EPA 阈值） | `1e-3` | $\|\mathbf{v}\|$ 小于此值判定接触，移交 EPA |
| `ConvergenceTolerance` | `1e-4` | van den Bergen 相对收敛容差 |
| 迭代上限 | 32 | 防止病态情况死循环（`GJKDistance` 为 16） |

### 3.6 厚度膨胀与热启动

两个工程细节让 Chaos 的 GJK 在游戏里又快又稳：

**厚度（Margin）**：每个体可以带一个 `Margin`，相当于把凸体沿法线外推一层。这让"几乎接触"也能被 GJK 提前判定为相交，便于连续碰撞检测（CCD）做扫掠。`Inflation = ThA + ThB + Epsilon` 作为分离判据的阈值。

**热启动（Warm Start）**：`GJKPenetrationWarmStartable` 接受上一帧的单纯形顶点索引（`OutClosestVertexIndexA/B`）和初始方向。由于物理时间步里物体只移动一点点，上一帧的单纯形几乎就是这一帧的优良初值，迭代次数大幅下降。这是把 GJK 拉到实时性能的关键。

---

## 积木第四层：EPA -- 把单纯形撑成多面体求穿透深度

### 4.1 GJK 留下的悬案

当 GJK 判定"相交"（原点在四面体单纯形内部）时，它只告诉你"相交了"，**没告诉你穿透多深、法线朝哪**。原因是 GJK 的单纯形只是 CSO 的一个 4 点子集，原点在它内部，并不等于原点在 CSO 的哪个面附近--CSO 边界离原点到底多远，单纯形本身回答不了。

EPA 的任务：以 GJK 的四面体为种子，**不断往 CSO 边界方向扩展多面体**，直到多面体的某个面逼近 CSO 的真实边界，那个面到原点的距离就是穿透深度。

### 4.2 核心思想

EPA 维护一个**凸多面体** $\mathcal{P} \subseteq \mathrm{CSO}$（初始即 GJK 的四面体），它包含原点。每轮：

1. 找 $\mathcal{P}$ 离原点**最近的面** $F$，记其外法线 $\mathbf{n}$、面到原点距离 $d_F = \mathbf{n}\cdot\mathbf{v}_0$（$\mathbf{v}_0$ 为面上一点）。$d_F$ 是穿透深度的**下界**。
2. 沿 $\mathbf{n}$ 取 CSO 支撑点 $\mathbf{w} = S_{\mathrm{CSO}}(\mathbf{n})$。$\mathbf{n}\cdot\mathbf{w}$ 是穿透深度的**上界**（CSO 边界最多到这里）。
3. 若上界与下界足够接近（$\mathbf{n}\cdot\mathbf{w} - d_F < \varepsilon$），收敛--$d_F$ 即穿透深度，$\mathbf{n}$ 即接触法线。
4. 否则，$\mathbf{w}$ 在当前最近面"之外"，说明该面还没贴到 CSO 真实边界。把 $\mathbf{w}$ 加入多面体：删掉所有"看得见 $\mathbf{w}$"的面，用这些面的边界边（**地平线 horizon**）与 $\mathbf{w}$ 连成新面，撑大多面体。回到第 1 步。

直观比喻：原点在气球里，EPA 不断往气球内壁贴新点、把内壁往外撑，直到某块内壁撑不动了（支撑点贴不上更外面），那块内壁就是 CSO 的真实边界。

### 4.3 可见面与地平线

"看得见 $\mathbf{w}$ 的面"指 $\mathbf{w}$ 在该面外法线正侧（$\mathbf{n}\cdot\mathbf{w} > \mathbf{n}\cdot\mathbf{v}_0$）。这些面位于 $\mathbf{w}$ 与多面体之间，必须删除，否则多面体会非凸。

删除后，剩下面的边界形成一圈**地平线**（visibility border / horizon）--一圈封闭边。对每条地平线边 $(\mathbf{a},\mathbf{b})$，新建一个三角形 $(\mathbf{a}, \mathbf{b}, \mathbf{w})$，把这些新三角缝合到 $\mathbf{w}$ 上，形成更大的多面体。这步保证 $\mathcal{P}$ 始终凸且包含原点。

### 4.4 收敛判据的数学

记最近面距离 $L = d_F$（下界），支撑点上界 $U = \mathbf{n}\cdot\mathbf{w}$。EPA 的相对收敛判据：

$$
U \le (1+\varepsilon_{\text{rel}})\,|L|
$$

即上界与下界的相对差小于 $\varepsilon_{\text{rel}}$（Chaos 默认 `1e-2`，即 1%）。这比绝对阈值更稳健，能适应不同尺度的物体。

收敛后：

$$
\delta = L,\qquad \mathbf{n}_{\text{contact}} = \mathbf{n},\qquad \mathbf{p}_A = S_A(\mathbf{n}),\quad \mathbf{p}_B = S_B(-\mathbf{n})
$$

把支撑点拆回两体即得接触点。

### 4.5 为什么 EPA 能收敛

每轮要么上界下降（撑进了更靠近边界的面），要么收敛。多面体顶点数单调增长，但 CSO 是有界的，支撑点不可能无限外推，所以有限步内必然满足相对容差。Chaos 给出 128 次迭代硬上限，超限返回当前最佳估计（标记 `MaxIterations`）。

### 4.6 Chaos 最佳实践：EPA 的工程化实现

Chaos 的 EPA 在 `Public/Chaos/EPA.h`（651 行标量）和 `EPAVectorized.h`（614 行 SIMD），都是 header-only 模板。源码注释引用 **van den Bergen《Collision Detection in Interactive 3D Environments》2004** 和 **Olvang 2010**。入口签名：

```cpp
template <typename T>
EEPAResult EPA(TArray<TVec3<T>>& VertsABuffer, TArray<TVec3<T>>& VertsBBuffer,
               const TFunctionRef<TVector<T,3>(const TVec3<T>&)>& SupportA,
               const TFunctionRef<TVector<T,3>(const TVec3<T>&)>& SupportB,
               T& OutPenetration, TVec3<T>& OutDir,
               TVec3<T>& WitnessA, TVec3<T>& WitnessB,
               const FReal EpsRel = 1.e-2f);
```

注意 `VertsABuffer / VertsBBuffer` 是**入参兼出参**：进来时装着 GJK 的 1–4 个单纯形顶点（A、B 各一份，Minkowski 顶点 = `VertsA[i] - VertsB[i]`），EPA 往里追加新支撑顶点。

**结果枚举** `EEPAResult`：

| 值 | 含义 |
|---|---|
| `Ok` | 收敛到容差内 |
| `MaxIterations` | 达 128 次上限，返回当前最佳（精度未知） |
| `Degenerate` | 命中退化条件（共面 / 重复点 / 地平线 < 3 边） |
| `BadInitialSimplex` | 初始多面体不含原点（其实分离了） |
| `NoValidContact` | 无有效接触 |

**初始化 `InitializeEPA`**：把 GJK 的 1–4 点单纯形补成完整四面体。妙招是 `AddFartherPoint`--同时查 $+\mathbf{d}$ 和 $-\mathbf{d}$ 两个方向的支撑点，保留更远的那个，从而从单点 / 线段也能 bootstrap 出四面体。`case 1/2/3` 分别补到 4 个顶点，`case 4` 直接建四面体。最后做一次**绕序校正**：找距离最大的面，若其距离为负（法线朝内），对所有面调 `SwapWinding` 把法线翻成朝外。

**面数据结构** `TEPAEntry<T>`--每个三角面一条记录，带半边式邻接：

```cpp
struct TEPAEntry {
    int32 IdxBuffer[3];          // 三个顶点索引
    TVec3<T> PlaneNormal;        // 单位外法线
    T Distance;                  // 面到原点有符号距离 = n·v0
    TVector<int32,3> AdjFaces;   // 三条邻接面的索引
    TVector<int32,3> AdjEdges;   // 每条边在邻接面里是第几条边
    bool bObsolete;              // 已被撑掉, 跳过
};
```

邻接表让地平线搜索能在面图上做 BFS。

**主循环**：维护一个候选面队列，按 `Distance` 降序排序后弹出最近的。核心步骤对应 4.2：

```cpp
const TVec3<T> ASupport = SupportA(Entry.PlaneNormal);
const TVec3<T> BSupport = SupportB(-Entry.PlaneNormal);
const TVec3<T> W = ASupport - BSupport;            // CSO 支撑点
const T DistanceToSupportPlane = Dot(Entry.PlaneNormal, W);  // 上界 U
UpperBound = Min(UpperBound, DistanceToSupportPlane);
LowerBound = Entry.Distance;                       // 下界 L

const T UpperBoundTolerance = (1 + EpsRel) * Abs(LowerBound);
if (UpperBound <= UpperBoundTolerance) break;      // 收敛 -> Ok
```

**地平线搜索** `EPAComputeVisibilityBorder`：从最近面出发做栈式 flood fill。面 $G$ "看得见 $\mathbf{w}$" 当且仅当 `G.DistanceToPlane(W) > eps`（$\mathbf{w}$ 在 $G$ 外法线正侧）。看得见就标 `bObsolete` 并把邻居入栈；看不见，则当前边是地平线边，加入 `OutBorderEdges`。然后对每条地平线边建新三角形缝合到 $\mathbf{w}$，并修补邻接指针。

**退化处理**：地平线边数 < 3、或新三角形退化（`Initialize` 返回 false），立即终止返回 `Degenerate`。这是 EPA 数值稳健的关键--宁可放弃也不返回错误结果。

### 4.7 GJK 与 EPA 的衔接

在 Chaos 里这条衔接非常干净（`GJKPenetrationImpl`）：

```cpp
bIsContact = (NewDistance < Epsilon);     // GJK 判定原点贴近 CSO 边界
if (bIsContact) {
    // 把 1~4 个单纯形顶点打包进 VertsA/VertsB (B 已旋到 A 空间)
    EEPAResult R = EPA<T>(VertsA, VertsB, SupportA, SupportB,
                          OutPenetration, OutNormal, WitnessA, WitnessB, EPAEpsilon);
    // 把 EPA 结果旋回各自局部空间, 叠加 margin
}
```

也就是说：**GJK 负责"在不相交时高效求距离"，EPA 负责"在相交时求精确穿透"**。两者共用同一套支撑函数，EPA 直接复用 GJK 留下的单纯形当种子，零浪费。

---

## 积木第五层：SAT 在 Chaos 里的真实位置（重要最佳实践）

> 这一层是踩坑预警。如果你以为"虚幻引擎的盒子碰撞用的是 15 轴 SAT"，那正好踩进最大的误区。

### 5.1 一个反直觉的事实：Chaos 的盒子-盒子不走 SAT

通读 `Experimental/Chaos` 全树后，结论如下：

| 形状对 | Chaos 实际算法 | 入口 |
|---|---|---|
| Box ↔ Box | **GJK + EPA**（不是 SAT） | `BoxBoxContactPoint` → `GJKContactPoint` |
| Convex ↔ Convex（通用） | **GJK + EPA** | `ConstructConvexConvexOneShotManifold` → `GJKPenetrationWarmStartable` |
| Convex ↔ Triangle（三角网格） | GJK 优先，SAT **兜底** | `ConvexTriangleContactPoint` → `SATConvexTriangle`（仅当 GJK 报 `DeepContact`） |
| Capsule ↔ Box / Convex | GJK | `GJKContactPoint` |

也就是说，**经典的 15 轴盒-盒 SAT 在 Chaos 运行时里根本不存在**。Chaos 选择把所有凸体对统一走 GJK+EPA 这一条路。

### 5.2 为什么弃用专用 SAT

这是工程权衡的典范，值得学习：

1. **通用性**。GJK + EPA 只要形状实现 `Support(d)` 就能用--球、胶囊、凸包、盒子、隐式曲面全统一。专用 15 轴 SAT 只对盒子有效，每种形状对都要单独写，代码爆炸。
2. **SIMD 友好**。GJK 的支撑点查询 + 单纯形降维是高度数据并行的，Chaos 有完整 `*Vectorized.h` 的 SIMD 路径；15 轴 SAT 是 15 次串行投影，向量收益有限。
3. **热启动**。GJK 能缓存上一帧单纯形当热启动，时间相干性极好的物理模拟里迭代次数逼近 1~2 次；SAT 每帧从零开始枚举轴。
4. **维护成本**。一套 GJK+EPA 代码服务所有凸对；SAT 要为每种形状对维护一套，bug 难收敛。
5. **穿透精度**。相交时 EPA 给精确穿透与法线；SAT 的 MTV 受候选轴离散性影响（虽然多面体上数学完备，但工程实现里绕序 / 偏置会抖动）。

代价：GJK 在"两个大盒子几乎平行贴合"的退化配置下，单纯形会反复抖动，需要热启动 + 容差补救。Chaos 认为这个代价远小于维护多套专用 SAT。

### 5.3 Chaos 里 SAT 的两份代码

虽然不用于盒-盒，Chaos 仍保留了 SAT 的两份实现：

**`Public/Chaos/SAT.h`（283 行）--通用凸-凸 SAT，已弃用。** 三个入口：

```cpp
FSATResult SATPlaneVertex(Convex1, T1, Convex2, T2, CullDistance);  // B 的面 vs A 的顶点
FSATResult SATEdgeEdge  (Convex1, T1, Convex2, T2, CullDistance);   // 边-边叉积
FSATResult SATPenetration(Convex1, T1, Convex2, T2, CullDistance, Settings); // 综合
```

数学上这就是 1.3 的通用版：`SATPlaneVertex` 跑两遍实现"两体面法线"两类轴，`SATEdgeEdge` 跑"边叉积"类，`SATPenetration` 综合取最小。但全局搜索确认这三个函数**零调用者**--只有头文件被一处 `#include`，是死代码。它存在的意义是给阅读者一个可读的 SAT 参考实现。

**`Public/Chaos/Collision/SATConvexTriangle.h`（280 行）--唯一在运行时生效的 SAT。** 只用于凸体 vs 单个三角形：

```cpp
template<typename ConvexType>
bool SATConvexTriangle(const ConvexType& Convex, const FTriangle& Triangle,
                       const FVec3& TriangleNormal, const FReal CullDistanceSq,
                       Private::FConvexContactPoint& OutContactPoint);
```

为什么三角形要保留 SAT？因为三角网格（trimesh）场景下，GJK 对"凸体恰好贴在三角形平面"会报 `DeepContact`（原点贴近 CSO 边界但数值不稳），此时 SAT 的面-顶点判定更稳，作为兜底返回明确接触。这是"数值稳健性需要多一条路"的典型工程取舍。

### 5.4 SAT.h 里的两个值得学的技巧

即便 `SAT.h` 是死代码，它实现里有两个值得吸收的工程技巧：

**Minkowski 和面剪枝（`IsMinkowskiSumFace`）**：边-边叉积候选轴其实不必全跑 $|E_A|\times|E_B|$ 对。只有当一条边对 $(\mathbf{e}_A, \mathbf{e}_B)$ 在 Minkowski 和表面上时，它们的叉积才可能是分离轴。判定式是看四条相邻面法线 $(A,B,C,D)$（$C,D$ 取负）的符号关系：

$$
\text{是 MS 面} \iff (C\cdot(B\times A))\,(D\cdot(B\times A)) < 0 \;\wedge\; (A\cdot(D\times C))\,(B\cdot(D\times C)) < 0
$$

这把边-边轴从 $O(|E_A||E_B|)$ 降到只测真正可能分离的那一小撮。退化（平行边）用 `NormalizeSafe` 跳过，叉积为零不报错。

**接触特征偏置（`FSATSettings`）**：SAT 的 MTV 在多个轴重叠量接近时会抖动（这一帧选面接触、下一帧选边接触，法线跳变导致物理抖动）。`SATPenetration` 用 `PlaneBias`（偏置面接触优于边接触）和 `ObjectBias`（偏置某一物体当平面拥有者）来稳定特征选择：

```cpp
const bool bUseEdgeResult = (EdgeResult.SignedDistance > MaxPlaneDistance + Settings.PlaneBias);
if (bUseEdgeResult) return EdgeResult;
return PlaneResult1.SignedDistance > PlaneResult2.SignedDistance - Settings.ObjectBias
       ? PlaneResult1 : PlaneResult2;
```

这种"为物理稳定性牺牲一点数学精确性"的偏置，是实时碰撞检测的通用智慧，GJK/EPA 里也有类似手法（容差、厚度）。

---

## 积木第六层：完整窄相流水线

把积木拼起来，一个完整的凸体窄相检测流水线是这样：

```
宽相 (Broadphase: AABB/SAP/BVH)
   │  输出候选对 (A, B)
   ▼
窄相入口 (Narrowphase)
   │
   ├─ GJKPenetration(A, B, 热启动单纯形)
   │     │
   │     ├─ 返回 false ─────────────────► 分离: dist = ‖v‖, 无接触
   │     │
   │     ├─ 收敛且 ‖v‖ > Epsilon ───────► 分离但接近: 返回距离 (可做 CCD)
   │     │
   │     └─ bIsContact (‖v‖ < Epsilon) ─► 相交: 移交 EPA
   │                                          │
   │                                          ▼
   │                                   EPA(初始四面体)
   │                                          │
   │                                          ├─ Ok / MaxIterations
   │                                          │     └─► 穿透深度 δ, 法线 n, 接触点 pA,pB
   │                                          └─ Degenerate / BadInitialSimplex
   │                                                └─► 退化兜底 (回退 SAT 或上一帧接触)
   ▼
接触流形 (Contact Manifold): 把单点接触扩展成多点流形, 送约束求解器
```

**SAT 在哪？** 只有"凸体 vs 三角网格三角形"这一条支路，当 GJK 报 `DeepContact` 时，`SATConvexTriangle` 作为数值兜底介入。其余所有凸对都走 GJK+EPA 这一条主线。

### 为什么这套设计是最佳实践

1. **单一主线**：GJK+EPA 覆盖 99% 凸对，代码路径少、易测试、易 SIMD。
2. **支撑函数为唯一形状接口**：`SupportCore` 是凸体的"通用语"--球给解析支撑点，凸包给顶点 argmax，胶囊给线段 + 半径偏移。所有形状差异被这一个函数吸收。
3. **时间相干性**：热启动把每帧 GJK 迭代压到 1~2 次，是实时性能的命脉。
4. **数值冗余**：GJK 不稳时 EPA 接管；EPA 退化时回退上一帧；凸-三角 GJK 抖动时 SAT 兜底。每条路都有 Plan B。
5. **厚度膨胀**：margin 让 CCD 扫掠与"几乎接触"都能被统一管线处理，不必为"接触"与"穿透"分两套逻辑。

---

## 附录 A：三算法对照表

| 维度 | SAT | GJK | EPA |
|---|---|---|---|
| 回答的问题 | 是否分离 + MTV 近似 | 距离 / 是否相交 | 穿透深度 + 法线 + 接触点 |
| 工作对象 | 原始两体（投影） | CSO（Minkowski 差） | CSO 内多面体 |
| 形状要求 | 多面体（有面/边/顶点） | 任意凸体（仅需 Support） | 任意凸体（仅需 Support） |
| 候选集 | 离散轴枚举（面法线+边叉积） | 迭代搜索 | 迭代扩展 |
| 复杂度（盒子） | 15 轴 × 投影 | 通常 1~4 次迭代（热启动） | 通常 < 10 次 |
| 复杂度（100 面凸包） | 10200 轴 ✗ | 仍只需几次迭代 ✓ | 仍只需几次迭代 ✓ |
| 相交时给深度？ | 给（MTV，候选轴上最小） | 不给（只判相交） | 精确给 |
| Chaos 用途 | 仅凸-三角兜底 | 主线 | 主线（GJK 之后） |

## 附录 B：符号表

| 符号 | 含义 |
|---|---|
| $A, B$ | 两个凸体 |
| $\mathrm{CSO}(A,B) = A\ominus B$ | Minkowski 差 / 配置空间障碍 |
| $S_X(\mathbf{d})$ | 凸集 $X$ 沿 $\mathbf{d}$ 的支撑点 = $\arg\max \mathbf{d}\cdot\mathbf{x}$ |
| $\mathbf{v}$ | 当前单纯形离原点最近点 |
| $\mathcal{S}$ | GJK 单纯形（点/线/三角/四面体） |
| $d, \delta$ | 分离距离 / 穿透深度 |
| $\mathbf{n}$ | 接触法线 |
| $\mathcal{P}$ | EPA 多面体 |
| $F, \mathbf{n}_F, d_F$ | 多面体的一个面、其外法线、面到原点距离 |
| $L, U$ | EPA 下界（最近面距离）/ 上界（支撑点距离） |
| $\varepsilon_{\text{rel}}$ | EPA 相对收敛容差（Chaos 默认 `1e-2`） |

## 附录 C：Chaos 关键 API 速查

| API | 文件 | 作用 |
|---|---|---|
| `GJKIntersection` | `GJK.h:188` | 布尔相交 |
| `GJKPenetration` | `GJK.h:1431` | 穿透 + 接触点（经典） |
| `GJKPenetrationWarmStartable` | `GJK.h:561` | 热启动版（主线） |
| `GJKRaycast2` | `GJK.h:1956` | 扫掠 / 射线 |
| `GJKDistance` | `GJK.h:2088` | 距离查询（van den Bergen 1999） |
| `EPA<T>` | `EPA.h:451` | 膨胀多面体求穿透 |
| `InitializeEPA` | `EPA.h:155` | 单纯形->四面体初始化 |
| `EPAComputeVisibilityBorder` | `EPA.h:334` | 地平线 flood fill |
| `TEPAEntry<T>` | `EPA.h:30` | 三角面 + 半边邻接 |
| `SimplexFindClosestToOrigin` | `Simplex.h:587` | 单纯形降维分派 |
| `FGeomGJKHelper` | `GJK.h:484` | 类型擦除支撑接口 |
| `SATPenetration` | `SAT.h:237` | 通用凸-凸 SAT（**已弃用**） |
| `SATConvexTriangle` | `SATConvexTriangle.h:16` | 凸-三角 SAT（**唯一在用**） |
| `ProjectOntoAxis` | `ConvexContactPointUtilities.h:14` | 顶点投影求区间 |

## 附录 D：参考资料

- Gino van den Bergen, *"A Fast and Robust GJK Implementation for Collision Detection of Convex Objects,"* 1999 -- Chaos `GJKDistance` 直接引用。
- Gino van den Bergen, *Collision Detection in Interactive 3D Environments,* 2004 -- Chaos `EPA.h` 引用。
- Christer Ericson, *Real-Time Collision Detection,* 2005 -- 三角形重心区域测试、SAT 通用框架。
- David Eberly, *Game Physics,* 与 *3D Game Engine Design* -- SAT 候选轴定理与 Minkowski 和面剪枝。
- Gilbert, Johnson, Keerthi, *"A Fast Procedure for Computing the Distance Between Complex Objects in Three-Dimensional Space,"* IEEE RA, 1988 -- GJK 原始论文。
- van den Bergen, *"Proximity Queries and Penetration Depth Computation on 3D Game Objects,"* GDC 2001 -- EPA 的工程化。
- 虚幻引擎 Chaos 源码：`Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/{GJK.h, EPA.h, Simplex.h, SAT.h}` 与 `Collision/SATConvexTriangle.h`。

---

> **积木总览**：SAT 教会我们"投影即分离"的直觉和候选轴定理；Minkowski 差把碰撞统一成"原点在不在凸集里"的几何问题，并用支撑函数搭起无需显式构造 CSO 的查询接口；GJK 在 CSO 里迭代逼近原点，高效回答距离与相交判定；EPA 在相交后把单纯形撑成多面体，精确求出穿透深度与法线。Chaos 选 GJK+EPA 作主线、SAT 作凸-三角兜底，是通用性、SIMD、热启动、数值稳健四者权衡的最佳实践。理解这条链路，就读懂了现代物理引擎窄相的核心架构。
