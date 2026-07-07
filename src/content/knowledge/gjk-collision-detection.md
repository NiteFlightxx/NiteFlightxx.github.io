---
title: "GJK 碰撞检测算法详解 — 从 support function 到 Chaos 引擎实现"
excerpt: "用积木式逐层构建的方式，从碰撞检测问题本质出发，依次搭建 support function、Minkowski 差、simplex 逼近原点、Voronoi 区域更新规则、凸集分离定理终止条件，直到 UE Chaos 的 GJK.h 工程实现（GJK-with-margins、GJK→EPA 回退、warm start 跨帧 simplex、float/double 精度自适应、函数指针分派）。覆盖三种理解视角（几何/优化/算法）、GJK 本质的最近点问题与割平面法解读，以及退化 simplex、浮点精度、非凸体限制等常见坑。与《UE Chaos Physics 引擎详解》《PBD 与 XPBD 详解》互为印证。"
date: "2026-07-06"
category: "Physics"
subtopic: "Collision"
tags: ["UE5", "GJK", "EPA", "碰撞检测", "Minkowski", "C++"]
readTime: "阅读约55分钟"
---

> GJK（Gilbert-Johnson-Keerthi, 1988）是实时物理引擎最常用的凸体碰撞检测算法。它不直接检查两个物体的几何相交，而是把"两个凸体是否相交"转化为"原点是否在一个新形状（Minkowski 差）里"，再用一个至多 4 点的 simplex 逐步逼近原点。整个算法只要求形状能回答一个问题——"沿给定方向，你最远的点在哪"——这一统一接口让它能处理所有凸体。
>
> 本文用积木式逐层搭建：每一块都建立在前一块之上，每一块都解释"为什么需要它"。工程部分全部基于 UE 源码 `Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/GJK.h` 与 `Private/Chaos/CollisionResolution.cpp`，关键处标注 `文件:行号`。Chaos 的整体架构详见本站&#12298;[UE Chaos Physics 引擎详解](/knowledge/ue-chaos-physics-engine/)&#12299;，约束求解的数学背景详见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;与&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

---

## 一、Block 0：碰撞检测问题本质

### 1.1 为什么需要 GJK

先抛开算法，想一个最朴素的问题：**给你两个物体，怎么知道它们有没有相交？**

最直觉的回答：逐边/逐面检查。两个三角形看边有没有互相穿过，两个凸多面体看所有面。这叫**特征检测（feature-based）**。

但这条路有三个致命问题：

1. **复杂度爆炸**。两个凸体各有 $O(n)$ 个面，两两检查是 $O(n^2)$。一个 100 面的凸体对就是 10000 次检查。
2. **数值脆弱**。"边正好贴着面"这种共面/共线情况，浮点误差会让你在"碰了"和"没碰"之间反复横跳。
3. **无法统一**。球、胶囊、凸包、三角网格——每种形状的"相交"几何定义都不同，要为每种组合写一段代码（$N$ 种形状要 $N^2$ 段）。

GJK 的伟大之处在于：**它把"两个任意凸体是否相交"统一成了一个判定**，不关心形状是什么，只要形状能回答一个问题——"沿方向 $\mathbf{d}$ 你最远的点在哪"。这个统一性让 $N^2$ 段代码变成 1 段。

### 1.2 什么是"凸体碰撞问题"

**凸体（convex body）**：体内任意两点连线，整条线段都在体内。直观说就是"没有凹陷"。

| 凸 | 非凸 |
|---|---|
| 球、盒子、胶囊、凸包 | 月牙、马蹄铁、L 形、茶壶 |
| 任意两点连线在内部 | 有"凹进去"的地方 |

为什么凸性是 GJK 的**绝对前提**？这是整篇文章最关键的一句话，第三节会揭晓——它和非凸体在 Minkowski 差下的几何性质有关。**GJK 只能处理凸体**，非凸体必须先分解成凸体块（凸分解），或用其凸包做近似。

### 1.3 为什么不能用简单包围盒解决

包围盒（AABB/OBB）是"先粗判，淘汰明显不碰的"，这是 **Broadphase** 的活。但窄相（Narrowphase）必须精确：

```
两个盒子包围盒重叠 ≠ 物体真的相交
```

两个旋转的胶囊形角色，AABB 可能大范围重叠但实际中间有缝。包围盒是**超集**——它包含物体但不等于物体。要"精确知道碰没碰"，必须回到物体本身的几何。GJK 就是那个"直接对物体几何判定"的算法。

> **直觉总结**：碰撞检测要回答"两个凸体有没有相交"。朴素特征检测太慢太碎太脆弱，GJK 用"只问形状最远点"这一统一接口，把任意凸体对问题归约成一个判定。前提是物体必须凸。

---

## 二、Block 1：Support Function（最关键基础积木）

这是整座 GJK 大厦的第一块砖。理解透这一块，后面全是顺水推舟。

### 2.1 什么是 support point

**定义**：形状 $S$ 沿方向 $\mathbf{d}$ 的 support point，是 $S$ 上让 $\mathbf{d}\cdot\mathbf{p}$ 最大的那个点 $\mathbf{p}$：

$$
\mathbf{s}_S(\mathbf{d}) = \arg\max_{\mathbf{p}\in S}\;(\mathbf{d}\cdot\mathbf{p})
$$

**直觉**：拿一束方向为 $\mathbf{d}$ 的平行光从 $-\mathbf{d}$ 方向照过来，物体投下的影子轮廓上、正对光源"最亮"的那个点——就是 support point。换个说法：站在 $\mathbf{d}$ 方向往回看，物体"最靠前"的那个顶点。

### 2.2 为什么"最远点"能代表形状

这是 GJK 最反直觉、最精妙的一步。一个凸体有无穷多个点，但 support function 告诉你：**对每个方向，整个形状对这个方向的"响应"由唯一一个点决定**。

为什么？因为凸性。凸体上，沿 $\mathbf{d}$ 最远的点一定是**极点**（顶点或边/面，不会是内部点）。而且——这点一旦确定，它就携带了"这个方向上形状能延伸多远"的全部信息：距离 $=\mathbf{d}\cdot\mathbf{s}_S(\mathbf{d})$。

这意味着：**不需要知道形状的全部点，只要能回答"给定方向，最远点在哪"——形状就被这个函数完全刻画了**（对凸体而言）。Support function 是凸体的"指纹"。

### 2.3 dot product 在这里的意义

$\mathbf{d}\cdot\mathbf{p} = \|\mathbf{d}\|\,\|\mathbf{p}\|\cos\theta$，几何上就是 $\mathbf{p}$ 在 $\mathbf{d}$ 方向上的**投影长度**（乘 $\|\mathbf{d}\|$）。

所以 $\arg\max(\mathbf{d}\cdot\mathbf{p})$ 就是"找投影最长的点"——即沿 $\mathbf{d}$ 最远的点。dot product 把"找最远点"这个几何问题变成了一个标量比较，每个点算一个数，取最大。**对凸体的顶点集，这就是线性扫描**。

### 2.4 例子

**三角形**（顶点 $\mathbf{a},\mathbf{b},\mathbf{c}$，方向 $\mathbf{d}$）：

```cpp
vec3 SupportTriangle(vec3 d) {
    float da = dot(d, a), db = dot(d, b), dc = dot(d, c);
    if (da >= db && da >= dc) return a;
    if (db >= dc) return b;
    return c;
}
// 只是 3 次点积 + 比较，O(n) 顶点扫描
```

**盒子（Box）**（中心 $\mathbf{c}$，半边长 $\mathbf{h}$）—— 有解析解，不用扫描顶点：

```cpp
vec3 SupportBox(vec3 d) {
    vec3 p = c;
    p.x += (d.x > 0) ?  h.x : -h.x;
    p.y += (d.y > 0) ?  h.y : -h.y;
    p.z += (d.z > 0) ?  h.z : -h.z;
    return p;
}
// 3 次符号判断，O(1)
```

**球（中心 $\mathbf{c}$，半径 $r$）**：

$$
\mathbf{s}(\mathbf{d}) = \mathbf{c} + r\,\hat{\mathbf{d}}
$$

**凸包**：扫描所有顶点取最大点积，$O(n)$。这就是 GJK 对形状的唯一要求——给它方向，返回最远点。

### 2.5 三种理解方式

> - **几何**：最远点 = 形状在该方向的"前哨"
> - **优化**：$\max_{\mathbf{p}\in S}\mathbf{d}\cdot\mathbf{p}$ 是线性目标在凸集上的最大化，最优解必在极点（凸优化基本定理）
> - **算法**：顶点集上线性扫描，或解析公式（球/盒）
>
> 三种各有适用：几何帮你想通"为什么"、优化告诉你"数学保证"、算法给你"怎么写代码"。后文同类问题都用此三分法。

> **直觉总结**：Support function $\mathbf{s}_S(\mathbf{d})$ 把"形状"压缩成"给方向返回最远点"的函数。凸性保证最远点必是极点，dot product 把它变成线性扫描。这是 GJK 唯一需要的形状接口——所以它能统一所有凸体。

---

## 三、Block 2：Minkowski Difference（核心转化）

### 3.1 A − B 的几何意义

定义两个点集 $A$、$B$ 的 **Minkowski 差（Minkowski Difference, MD）**：

$$
A \ominus B = \{\,\mathbf{a} - \mathbf{b}\;\mid\;\mathbf{a}\in A,\;\mathbf{b}\in B\,\}
$$

**直觉**：把 $B$ 的每个点都翻成 $-\mathbf{b}$，然后和 $A$ 的每个点做 Minkowski 和（所有两两和的集合）。

几何画面：想象 $A$ 固定，把 $B$ 翻转（中心对称）后，让翻转的 $B$ 沿 $A$ 的轮廓"扫"一遍，扫出的区域就是 $A\ominus B$。

### 3.2 关键定理：碰撞 = 原点在 MD 中

**定理**：$A$ 与 $B$ 相交 $\iff$ 原点 $\mathbf{0}\in A\ominus B$。

**为什么？** 一行推导：

$$
\exists\,\mathbf{p}\in A\cap B \iff \exists\,\mathbf{a}\in A,\,\mathbf{b}\in B\;\text{使得}\;\mathbf{a}=\mathbf{b} \iff \exists\,\mathbf{a}-\mathbf{b}=\mathbf{0}\in A\ominus B
$$

两个物体有公共点，等价于"MD 里有一个点恰好是零"。这个转化是 GJK 的**根本突破**：

> **把"两个物体的相交问题"变成了"一个点（原点）是否在一个新形状（MD）里"的问题。**

这是降维打击。两个物体变成一个 MD，相交判定变成"原点在不在里面"。

### 3.3 为什么这个转化是关键突破

光有定理还不够——MD 通常无法显式构造（无穷多点）。真正的突破在于：**MD 的 support function 可以由 A 和 B 的 support function 直接算出来**，不用构造 MD 本身：

$$
\boxed{\quad \mathbf{s}_{A\ominus B}(\mathbf{d}) = \mathbf{s}_A(\mathbf{d}) - \mathbf{s}_B(-\mathbf{d}) \quad}
$$

**为什么这个公式成立？**

$$
\max_{\mathbf{p}\in A\ominus B}(\mathbf{d}\cdot\mathbf{p}) = \max_{\mathbf{a}\in A,\mathbf{b}\in B}(\mathbf{d}\cdot\mathbf{a}-\mathbf{d}\cdot\mathbf{b}) = \max_{\mathbf{a}\in A}(\mathbf{d}\cdot\mathbf{a}) - \min_{\mathbf{b}\in B}(\mathbf{d}\cdot\mathbf{b}) = \max_{\mathbf{a}\in A}(\mathbf{d}\cdot\mathbf{a}) - \bigl(-\max_{\mathbf{b}\in B}((-\mathbf{d})\cdot\mathbf{b})\bigr)
$$

$\max$ 和 $\min$ 可以分离（因为 $\mathbf{a}$、$\mathbf{b}$ 独立），$\min$ 转成对 $-\mathbf{d}$ 求最大——所以 MD 的 support 就是"A 沿 $\mathbf{d}$ 的最远点"减"B 沿 $-\mathbf{d}$ 的最远点"。

**这一行公式是整个 GJK 的引擎**。它意味着：可以在不显式构造 MD 的前提下，向 MD 查询任意方向的 support point——而查询成本只是两次形状 support 调用。

### 3.4 为什么凸性是前提（揭晓第一节的伏笔）

MD $A\ominus B$ 当且仅当 $A$、$B$ 都凸时才凸。

- 凸：MD 是凸的，原点在凸集内的判定可以用 GJK 的"逐步逼近"（每步朝原点走，能走多远走多远，下节讲），因为凸集有"任何方向都只有一个连续前哨"的好性质。
- 非凸：MD 可能是凹的甚至不连通，原点可能在 MD 的"凹坑"里，support function 给的点会跳来跳去，GJK 的迭代不收敛——这是 GJK 不能处理非凸体的根本原因。

> **直觉总结**：Minkowski 差把"两体相交"变成"原点在一个新形状里"。关键突破不是这个定理本身，而是 **MD 的 support = A 的 support − B 的反向 support**，让我们能隐式查询 MD 而不构造它。凸性保证 MD 凸、迭代收敛。

---

## 四、Block 3：GJK 的核心思想（逐步逼近原点）

### 4.1 simplex 是什么

**Simplex（单纯形）**：$n$ 维空间里 $n+1$ 个点张成的最简单凸多胞体。

| 维度 | simplex 形状 | 顶点数 |
|---|---|---|
| 0D | 点 | 1 |
| 1D | 线段 | 2 |
| 2D | 三角形 | 3 |
| 3D | 四面体 | 4 |

GJK 在 MD 中维护一个**至多 4 个点的 simplex**，它是 MD 的一个"子集"。算法的核心：**不断往 simplex 里加新的 MD support point，再裁剪掉离原点远的点，让 simplex 一步步"贴"近原点**。

### 4.2 为什么不断"逼近原点"

回到第三节：要判定原点 $\in$ MD。但 MD 太大，没法整体看。GJK 的策略是**用一个小 simplex 逐步"试探"**：

- 每轮选一个搜索方向 $\mathbf{d}$（指向原点的方向）
- 用 support function 从 MD 取一个新点 $\mathbf{v}=\mathbf{s}_{A\ominus B}(\mathbf{d})$
- 如果 $\mathbf{v}$ 已经"越过"原点（说明原点在这个方向的 support 上），就可能相交
- 否则把 $\mathbf{v}$ 加入 simplex，重新算 simplex 上离原点最近的点，得到新的 $\mathbf{d}$
- 重复，直到 simplex 包住原点（相交）或再也无法靠近原点（分离）

### 4.3 每一步的直觉

想象站在 MD 形状的某个角落，蒙着眼，想知道原点在不在这个形状里。只能摸"沿某方向最远的点"。策略：

1. 朝原点方向摸一个最远点 $\mathbf{v}_1$（一个点 simplex）
2. 看 $\mathbf{v}_1$ 沿这个方向过了原点没——过了说明原点在 $\mathbf{v}_1$ 这侧；没过说明这个方向最远也到不了原点 → **分离**
3. 如果过了，加进 simplex。现在 simplex 是一个点，离原点最近的 simplex 点就是 $\mathbf{v}_1$，新方向朝原点
4. 再摸一个点 $\mathbf{v}_2$，组成线段。找线段上离原点最近点，新方向从该点指向原点
5. 再摸 $\mathbf{v}_3$ → 三角形 → 找最近点 → 新方向
6. 再摸 $\mathbf{v}_4$ → 四面体 → 如果原点在四面体内 → **相交**；否则裁掉最远的点，回退到三角形，继续

### 4.4 search direction 如何更新——为什么不会乱跑

**核心规则**：每轮的搜索方向 $\mathbf{d}$ 始终是 **"当前 simplex 上离原点最近的点 → 原点"** 的方向（即 $-\mathbf{v}_{\text{closest}}$）。

**为什么不会乱跑？** 因为 support function 沿 $\mathbf{d}$ 取的点，一定让 simplex 朝原点方向"延伸"——如果 MD 在 $\mathbf{d}$ 方向上能延伸过原点，原点就有可能在 MD 内；如果连最远点都过不去，原点必在 MD 外（分离）。

这正是 **GJK 的"单调逼近"性质**：每轮 simplex 到原点的距离 $\le$ 上轮距离，永不回退。这保证了算法在有限步内终止（下节严格说）。

### 4.5 三种理解方式

> - **几何**：用小 simplex 试探，逐步包住原点
> - **优化**：GJK 是在 MD 上求"离原点最近的点"——每轮 support 取一个支撑超平面，把可行域（最近点可能位置）越切越小（类似割平面法）
> - **算法**：维护 simplex + 最近点 + 方向三件套，迭代至收敛

> **直觉总结**：GJK 用至多 4 点 simplex 在 MD 里"摸黑逼近原点"。每轮方向 = simplex 最近点指向原点。support function 沿方向取新点加入 simplex，再裁剪。凸性 + support 单调性保证每轮更近、不回退。

---

## 五、Block 4：Simplex 更新规则（核心算法逻辑）

这是 GJK 最容易卡住的地方。关键是想清楚"原点在 simplex 哪一侧"。

### 5.1 通用框架

每轮做三件事：

```
1. support: v = s_MD(d)              // 沿方向 d 取 MD 点
2. 检查能否越过原点: d·v 是否 <= 0     // 过不去 → 分离
3. 加入 simplex, 找 simplex 上离原点最近点
   更新 simplex 只保留"包围原点那一侧"的顶点
   更新 d = -最近点
```

第 3 步是核心。下面按 simplex 顶点数分情况。

### 5.2 1 点情况（点 simplex）

只有点 $\mathbf{v}_1$。最近点就是 $\mathbf{v}_1$，新方向 $\mathbf{d}=-\mathbf{v}_1$（指向原点）。下一轮取 support。

如果下一轮 $\mathbf{d}\cdot\mathbf{v}_2\le 0$，说明沿指向原点方向，MD 最远也到不了原点 → **分离，退出**。

### 5.3 2 点情况（线段）

线段端点 $\mathbf{v}_1,\mathbf{v}_2$。原点可能在三个区域：

```
        v1 ●——————● v2
        区域A | 区域B | 区域C
        v1外侧 线段上  v2外侧
```

- **区域 B（原点投影落在线段上）**：最近点是线段上的垂足，新方向从垂足指向原点。**两个点都保留**（simplex 还是线段）。
- **区域 A（原点在 $\mathbf{v}_1$ 外侧）**：线段上离原点最近的点是 $\mathbf{v}_1$。**丢掉 $\mathbf{v}_2$**——它对逼近原点无用。新方向 $=-\mathbf{v}_1$。
- **区域 C（原点在 $\mathbf{v}_2$ 外侧）**：对称，丢 $\mathbf{v}_1$，方向 $=-\mathbf{v}_2$。

**为什么要丢点**：simplex 只保留"包围原点那一侧"的顶点。丢掉的点对"逼近原点"没有贡献，留着只会让 simplex 朝错误方向延伸。

数学判定用 **Voronoi 区域**：原点落在哪段 Voronoi 区，就保留对应的 simplex 子集。判定用点积符号。

### 5.4 3 点情况（三角形）

三角形 $\mathbf{v}_1,\mathbf{v}_2,\mathbf{v}_3$，法向 $\mathbf{n}$。原点可能在 7 个 Voronoi 区域：3 个顶点区、3 条边区、1 个面区。

**关键判定**：原点是否在三角形**所在平面**上、且在三角形内部？

- **原点在三角形面"正上方"（投影落在三角形内）**：最近点是原点到平面的垂足。**3 点全保留**，方向 = 垂足指向原点。下一轮若取到第 4 个点，就升到四面体。
- **原点在某条边的"外侧"**：退化为该边的 2 点情况，丢掉对面的点。
- **原点在某顶点的外侧**：退化到该点的 1 点情况。

判定技巧：对每条边，用"边向量 $\times$ 法向"得到一个"指向三角形外的"向量 $\mathbf{e}_{\perp}$，看原点在 $\mathbf{e}_{\perp}$ 的哪一侧（点积符号）。负的说明原点在三角形内侧，正的说明在那条边的外侧 → 退化。

### 5.5 4 点情况（四面体）

四面体是 3D simplex 的最大尺寸。原点可能落在：4 顶点区、6 边区、4 面区、内部。

- **原点在四面体内部 → 相交！立即返回 true**（这就是碰撞判定的胜利条件）
- **原点在某面外侧**：丢掉"对面那个顶点"，退化到该面三角形，继续
- **更外的退化**：继续退化到边/点

判定原点是否在四面体内：对每个面，算面法向（指向内部），看原点是否在所有面的"内侧"（4 个点积同号）。

### 5.6 统一的"丢点"原则

| simplex | 原点位置 | 动作 |
|---|---|---|
| 点 | — | 取方向继续 |
| 线段 | 投影在线段上 | 保留两点 |
| 线段 | 投影在外侧 | 退化到近端点 |
| 三角形 | 投影在面内 | 保留三点 |
| 三角形 | 投影在边外 | 退化到该边 |
| 四面体 | 内部 | **碰撞** |
| 四面体 | 某面外 | 退化到该面 |

**为什么这样能逼近原点**：每次更新后，simplex 到原点的距离严格不增；丢点是为了让 simplex 始终"贴"在原点最近的那一侧，下一轮 support 才能朝原点方向有效延伸。

### 5.7 三种理解方式

> - **几何**：Voronoi 区域——原点落在 simplex 哪块 Voronoi 区，就保留对应的子 simplex
> - **优化**：投影——求 simplex（凸包）上离原点最近的点，等价于在 simplex 上做投影，子 simplex 是该最近点的"承载"
> - **算法**：用点积符号判定区域，switch 分支处理，每分支裁剪顶点

> **直觉总结**：simplex 更新 = "找 simplex 上离原点最近的点 + 只保留承载该点的子 simplex"。1→2→3→4 点逐级升级，4 点若包住原点即相交，否则降级。丢点是为了"贴着原点走"。

---

## 六、Block 5：终止条件（非常重要）

GJK 有两个出口，理解它们才能信任 GJK。

### 6.1 判定"无碰撞"——分离出口

**条件**：某轮取到 support 点 $\mathbf{v}$ 后，$\mathbf{d}\cdot\mathbf{v}\le 0$。

**几何含义**：搜索方向 $\mathbf{d}$ 指向原点。如果 MD 沿 $\mathbf{d}$ 方向最远的点都到不了原点（投影 $\le 0$），那 MD 在这个方向上根本够不着原点——一个**分离超平面**已经找到了：过 $\mathbf{v}$、法向 $\mathbf{d}$ 的平面把原点和 MD 隔开。

**为什么可靠**：这是基于凸集分离定理——两个不相交的凸集，必存在一个超平面把它们分开。GJK 一旦找到 $\mathbf{d}\cdot\mathbf{v}\le 0$，就是找到了这个分离超平面，**数学上严格证明分离**，不是"差不多没碰"。

### 6.2 判定"碰撞"——相交出口

**条件**：原点落入当前 simplex 内部（4 点四面体情况，或更一般的"原点到 simplex 距离 $\le \epsilon$"）。

**几何含义**：simplex 是 MD 的子集，原点在 simplex 内 → 原点在 MD 内 → $A$ 与 $B$ 相交。

### 6.3 收敛与精度出口

实际工程中，浮点数不能精确判"原点在不在"。GJK 用两个收敛判据：

1. **$\|\mathbf{v}_{\text{closest}}\| < \epsilon$**：simplex 离原点足够近，认为相交（"接触"）。
2. **$\mathbf{d}\cdot\mathbf{v}$ 不再增长（progress $<\epsilon$）**：再取新点 simplex 也无法更靠近原点——要么真的相切（接触），要么数值精度到顶。

Chaos 源码正是这套判据（`GJK.h:259/264`）：

```cpp
bNearZero = NewDist2 < Inflation2;          // 离原点足够近 → 接触/相交
bMadeProgress = (NewDist2 < OldDist2);      // 还在逼近
bTerminate = bNearZero || !bMadeProgress;    // 终止：接触 或 无法再近
```

`Inflation2`（`GJK.h:231`）$=$ `(ThicknessA + ThicknessB + 1e-6f * EpsilonScale)²`，是个与形状尺寸挂钩的容差。

### 6.4 为什么收敛可靠

GJK 的可靠性建立在三条数学保证上：

1. **单调下降**：每轮 simplex 到原点距离严格不增（support 沿方向取的点至少不比当前近点远）
2. **凸集分离定理**：分离判定找到的就是真正的分离超平面，无假阳性
3. **有限支撑**：3D simplex 至多 4 点，更新规则保证 simplex 顶点数 $\le 4$，不会无限增长

理论上对"有限顶点凸体"，GJK 在有限步（顶点数的量级）内必终止。浮点下，progress 判据保证即使数值到顶也会退出。

> **直觉总结**：GJK 两个出口——分离（找到分离超平面，$\mathbf{d}\cdot\mathbf{v}\le0$）/相交（原点进 simplex 或距离 $<\epsilon$）。可靠性来自凸集分离定理 + 单调下降 + simplex 有界。浮点下用 progress 判据兜底。

---

## 七、Block 6：数学本质总结

### 7.1 GJK 本质是什么问题

三种视角，同一个本质：

#### 视角一：最近点问题

**GJK = 在 MD 上求离原点最近的点。**

- 最近点 $=$ 原点 → 相交（原点在 MD 内）
- 最近点 $\ne$ 原点 → 分离，最近点给出分离方向和距离

GJK 不是"判定器"，而是"求解器"——它顺便给出最近距离、分离法向、（配合 EPA）穿透深度。

#### 视角二：割平面法（Cutting Plane / 优化）

GJK 在解一个凸优化：

$$
\min_{\mathbf{p}\in A\ominus B}\|\mathbf{p}\|^2
$$

每轮的 support 点 $\mathbf{v}$ 给出一个**支撑超平面**（过 $\mathbf{v}$、法向 $\mathbf{d}$），它把 MD "切"掉一半——最近点必在切留下的那半里。simplex 是这些超平面交出的多胞体。GJK 就是**逐次割平面 + 在多胞体上投影**。这与共轭梯度、次梯度法是一脉的优化思想（详见本站&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;的迭代法谱半径理论）。

#### 视角三：support mapping + iterative optimization

GJK 把"形状"抽象成 support mapping $\mathbf{s}_S(\mathbf{d})$，把"相交"抽象成"原点在 MD 内"，把"求解"抽象成"迭代优化"。三件解耦，所以：

- 换形状 = 换 support function（球、盒、凸包各写一个）
- 换判定 = 改终止条件（相交/最近点/穿透）
- 换求解器 = 改迭代策略（GJK / NPA / 其他变体）

这是 GJK 工程可扩展性的根源。

### 7.2 三个视角的适用场景

| 视角 | 何时用 |
|---|---|
| 最近点 | 想理解"为什么 GJK 能顺便给分离距离/法向" |
| 优化 | 想理解"为什么 GJK 收敛、能换成 NPA/Hill Climbing 等变体" |
| 抽象接口 | 想扩展新形状、新判定，或重写引擎 |

> **直觉总结**：GJK 本质 = 在 MD 上求离原点最近的点，用割平面迭代逼近。它是"形状用 support 表示 + 判定用原点位置 + 求解用迭代优化"三件解耦的组合。这解释了它为什么能统一所有凸体、为什么能顺便给距离/法向、为什么有各种变体。

---

## 八、Block 7：Chaos / Unreal Engine 中的 GJK 实现

这一节全部基于源码 `Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/GJK.h` 与 `Private/Chaos/CollisionResolution.cpp`。

### 8.1 Chaos 是否直接用 GJK

**是，而且几乎是唯一手段。** 一个反直觉的发现：Chaos 声明了 SAT（`Public/Chaos/SAT.h` 的 `SATPenetration`），但 `Private/` 下**零调用点**——SAT 是死代码。连 Box-Box 都走 GJK（`CollisionResolution.cpp:377` 的 `BoxBoxContactPoint` 直接调 `GJKContactPoint`）。所有凸-凸对通过 `UpdateGenericConvexConvexConstraint` → GJK。

GJK 三个入口函数（`GJK.h`）：

| 函数 | 行号 | 作用 |
|---|---|---|
| `GJKIntersection` | 189 | 布尔相交测试（只判碰不碰） |
| `GJKIntersectionSimd` | 209 | SIMD 版本，用 `FGeomGJKHelperSIMD` |
| `GJKPenetration` / `GJKPenetrationImpl` | 1431 / 1233 | 求穿透深度 + 最近点 + 法向 |
| `GJKPenetrationWarmStartable` | 561 | 带 warm start 的版本（存 simplex 跨帧） |

迭代上限 **32**（`CheckGJKIterationLimit`，`GJK.h:141`）。

### 8.2 Support function 的工程化：函数指针 + margin

Chaos 的 support 不是简单调 `Geometry->SupportCore(d)`，而是包了一层函数指针（`GJK.h:486`）：

```cpp
typedef FVector(*SupportFunc)(const void* Geom, const FVec3& Direction,
                              FReal* OutSupportDelta, int32& VertexIndex);
```

每个形状实现自己的 `SupportCore`（`GJK.h:523`），带一个 `Margin` 参数和一个 `OutSupportDelta`（输出 support 误差，用于追踪接触点精度）。SIMD 版（`SupportCoreSimd`，`GJK.h:73`）通过函数指针分派，避免模板膨胀。

### 8.3 GJK-with-margins：稳定接触的关键

这是 Chaos 区别于教科书 GJK 的核心工程技巧。

教科书 GJK 在物体外轮廓上取 support。但游戏里物体常常"几乎接触"——GJK 在 $\epsilon$ 边界反复横跳，导致接触点不稳定。Chaos 的解法：**用"圆角核心形状"做 GJK**，给形状加 margin（`CalculateQueryMargins`，`GJK.h:155`）：

- sphere/capsule：margin = 半径
- convex-convex：margin = $0.05\times$ 较小体的最小边距（`SweepMarginScale`，`GJK.h:170`）

加了 margin 后，GJK 求的是"核心形状的距离"，物体表面距离 = 核心距离 − margin 之和。这让接触判定有一个稳定的"软区"，不会在 $\epsilon$ 边界震荡。代价：接触点位置有 margin 量级（厘米级）的误差，对游戏不可见，但精度敏感的仿真要小心。

`InflationReal = ThicknessA + ThicknessB + 1e-6f * EpsilonScale`（`GJK.h:231`）就是这个 margin 总和，决定了"近零"判定阈值。

### 8.4 GJK → EPA 回退：相交后求穿透

GJK 只能告诉你"碰了"和"分离距离/方向"，但**相交时给不出穿透深度和方向**——因为 simplex 退化、原点在 MD 内部，GJK 的"逼近原点"失去了意义。

Chaos 的处理（`GJK.h:648-700`）：当 GJK 检测到 `bIsContact`（simplex 离原点在 $\epsilon$ 内），把 simplex 顶点重建为 `VertsA`/`VertsB` 数组，调用 **EPA**（Expanding Polytope Algorithm）：

```cpp
if (bIsContact)
{
    TArray<TVec3<T>> VertsA, VertsB;       // 从 simplex 重建
    for (int i = 0; i < SimplexIDs.NumVerts; ++i) {
        VertsA.Add(InOutSimplexData.As[i]);
        VertsB.Add(BToATM.TransformPositionNoScale(InOutSimplexData.Bs[i]));
    }
    const EEPAResult EPAResult = EPA<T>(VertsA, VertsB, SupportAFunc,
        SupportBInAFunc, Penetration, MTD, ClosestA, ClosestBInA, EPAEpsilon);
    switch (EPAResult) {
        case Ok:              /* 成功，返回穿透深度+法向+接触点 */
        case MaxIterations:  /* 达上限，容忍使用 */
        case BadInitialSimplex: /* 原点在 simplex 外，相切接触 */
        case Degenerate:      /* 退化，回退到 GJK 近似 */
    }
}
```

EPA 从 GJK 留下的 simplex 出发，不断向外"扩展"多面体，找到原点到 MD 边界的最短穿透方向（MTD, Minimum Translation Direction）。返回值 `EEPAResult`：

- `Ok`：成功，返回穿透深度 + 法向 + 接触点
- `MaxIterations`：达到上限，结果有未知误差（容忍使用）
- `BadInitialSimplex`：原点在 simplex 外（实际是相切接触），用 EPA 设置阶段算的法向
- `Degenerate`：退化 simplex，EPA 失败，回退到 GJK 的近似接触点

源码甚至有个 TODO（`GJK.h` 约第 720 行）："handle the case where EPA hits a degenerate triangle... we could run SAT instead"——EPA 退化时的备选是 SAT，但 SAT 当前没接，所以实际是退化到 GJK 的近似。

### 8.5 Warm start：跨帧复用 simplex

这是 Chaos 性能的关键之一。`TGJKSimplexData`（`GJK.h:380`）存上一帧 GJK 收敛后的 simplex：

```cpp
class TGJKSimplexData {
    static const int32 MaxSimplexVerts = 4;
    TVec3<T> As[MaxSimplexVerts];          // A 上的 simplex 顶点（A 局部空间）
    TVec3<T> Bs[MaxSimplexVerts];          // B 上的 simplex 顶点（B 局部空间）
    TVec3<T> Barycentric[MaxSimplexVerts]; // 重心坐标
    int32 NumVerts;
};
```

下一帧物体只移动了一点点，`Restore`（`GJK.h:405`）用新的相对变换重算 simplex 顶点和分离向量，从上次的 simplex 起步——通常 1-2 次迭代就收敛，而不是从零开始跑满 32 次。**注意一个细节**：`As`/`Bs` 存在各自局部空间，这样跨帧物体移动时 simplex 顶点自动跟随形状，不用重新取 support。

`Restore` 有个保护（`GJK.h:424`）：如果重算后原点落在 simplex 内（说明这一帧物体穿透了），就放弃 warm start，从默认方向重新开始——避免用穿透状态的 simplex 误导迭代。

### 8.6 精度自适应：float / double 自动切换

一个工程细节（`GJK.h:191-198`）：GJK 根据形状大小自动选精度：

```cpp
const T EpsilonScale = FMath::Max<T>(
    A.BoundingBox().Extents().Max(), B.BoundingBox().Extents().Max());
const bool bUseDouble = EpsilonScale > 1.e5;   // 大物体用 double
if (bUseDouble) return GJKIntersectionImpl<T, FReal>(...);
return GJKIntersectionImpl<T, FRealSingle>(...);  // 小物体用 float
```

大物体（如大地形、巨型建筑）相对距离的浮点误差更大，单精度会让 simplex 更新判错区域；切到 double 保精度。小物体用 float 省一半带宽——和 Chaos 求解器的 `FSolverReal = FRealSingle` 思路一致（见本站&#12298;[UE Chaos Physics 引擎详解](/knowledge/ue-chaos-physics-engine/)&#12299;§3.2）。

### 8.7 Broadphase / Narrowphase 关系

```
Broadphase (AABB 树, TAABBTree)
  → 输出可能有接触的"粒子对" (FBroadPhaseOverlap)
     → Narrowphase (CollisionResolution.cpp)
        → switch(EContactShapesType) 按形状对分派
           → 凸-凸: UpdateGenericConvexConvexConstraint → GJK (+EPA)
           → 球-三角网格: GJKImplicitContactPoint
           → ...
              → 生成 FPBDCollisionConstraint (带最多 4 点流形)
                 → 送入 PBD 求解器
```

GJK 在窄相。它的输出（穿透深度、法向、接触点）变成碰撞约束的流形点，进入 Chaos 的 PBD 位置投影求解（见本站&#12298;[UE Chaos Physics 引擎详解](/knowledge/ue-chaos-physics-engine/)&#12299;§3.4）。Broadphase 的 `TAABBTree` 细节见同一篇的碰撞系统章节。

### 8.8 SIMD / CPU 优化在哪

- **Support 函数 SIMD**：`SupportCoreSimd`（`GJK.h:73`），凸体顶点集 4 路并行点积
- **Simplex 最近点 SIMD**：`VectorSimplexFindClosestToOrigin`（`GJK.h:256`），4 顶点同时处理
- **AABB 叶子 4 路 SIMD**（broadphase，`AABBTree.h:326`）
- **函数指针分派**：避免模板为每种形状实例化一份 GJK，减少代码膨胀
- **Warm start**：跨帧复用 simplex，省 90% 迭代
- **margin 系统**：减少震荡，间接减少迭代次数

GJK 本身迭代次数少（典型 $< 10$），不是性能热点；热点在 support function（凸包顶点扫描）和 EPA（多面体扩展）。所以 Chaos 的优化重点在 support 的 SIMD 和 warm start，不在 GJK 主循环。

> **直觉总结**：Chaos 把 GJK 当作窄相的统一凸体判定器，SAT 弃用。工程上做了五件事——函数指针分派形状、margin 稳定接触、GJK→EPA 求穿透、warm start 跨帧复用、float/double 自适应精度。GJK 输出的流形点进入 PBD 求解器。优化重点在 support SIMD 和 warm start，不在主循环。

---

## 九、Block 8：常见误解与坑

### 9.1 为什么 GJK 有时候会"卡住"

**症状**：迭代很多次不收敛，或 simplex 在几个点之间反复跳。

**原因**：

1. **退化 simplex**：三点共线、四点共面，几何上体积为零，Voronoi 区域判定失效。Chaos 的 `EEPAResult::Degenerate` 就是这个。
2. **数值精度**：原点恰好在 simplex 边界上（$\|\mathbf{v}\|\approx\epsilon$），点积符号在 0 附近震荡，区域判定在"边内/边外"反复。
3. **非凸体**：MD 不凸，support 跳到错误的极点，迭代不单调。

**Chaos 的应对**：progress 判据（`bMadeProgress`，`GJK.h:264`）——一旦发现 simplex 不再逼近原点，立刻退出，避免死循环。退化时回退到 GJK 近似结果（接受误差）或（未来）SAT。

### 9.2 为什么 precision 会影响结果

GJK 全程依赖**点积符号**判定原点在 simplex 哪一侧。浮点误差在两种情况下致命：

1. **大物体 + 小距离**：两个 1000 米大的物体相距 0.001 米，单精度下 $1000^2 - 0.001$ 的误差比距离本身还大，符号判错。这就是 Chaos 对 `EpsilonScale > 1e5` 切 double 的原因（`GJK.h:193`）。
2. **共面/共线**：原点恰好落在 simplex 边界，理论上是"接触"，浮点下可能被判到任一侧，导致"碰了/没碰"反复。

**工程对策**：用相对容差（`1e-6 * EpsilonScale`，与物体尺寸挂钩）、大物体切 double、margin 给一个软区缓冲。

### 9.3 为什么 convex restriction 很重要

**GJK 只对凸体收敛**。把 GJK 用到非凸体（如茶壶、马蹄铁）会出三个问题：

1. **MD 不凸**：MD 可能有凹坑甚至不连通，原点可能在凹坑里——support function 取的点不在"朝原点方向"上，迭代乱跳
2. **support 不再充分**：非凸体的 support 仍是某个最远点，但它不再唯一决定形状在该方向的延伸（凹处可能有别的点更近原点）
3. **分离定理失效**：凸集分离定理不成立，找不到可靠的分离超平面

**工程对策**：

- 非凸体先做**凸分解**（convex decomposition，分成若干凸块），每块单独跑 GJK
- 或用**凸包**做近似（快但会漏掉凹处的接触）
- 三角网格/高度场用**逐三角形** GJK（Chaos 的 `GJKImplicitContactPoint`），但代价是 $O(\text{三角形数})$

### 9.4 其他常见坑

| 坑 | 原因 | 对策 |
|---|---|---|
| **GJK 说相交但物体明明没碰** | margin 太大，核心形状相交但表面没碰 | 调小 margin 或用表面距离判定 |
| **GJK 说分离但物体已穿透** | 大时间步一帧跨过，GJK 看不到 | 开 CCD（连续碰撞检测，扫掠求交） |
| **接触点跳动** | simplex 每帧取不同顶点 | warm start 固定 simplex |
| **EPA 穿透方向反了** | 初始 simplex 退化，EPA 起步错 | 检查 BadInitialSimplex，退化时重取 support |

> **直觉总结**：GJK 的坑几乎都来自三处——退化 simplex（几何体积为零）、浮点精度（符号判错）、非凸体（定理前提不成立）。Chaos 用 progress 判据防死循环、float/double 自适应防精度、margin 防震荡、凸分解/逐三角形处理非凸。

---

## 十、全文总结：GJK 的思维模型

把八块积木压成一句话：

> **GJK = 用 support function 隐式查询 Minkowski 差 + 用至多 4 点 simplex 逐步逼近原点 + 用凸集分离定理严格终止。**

每一块积木的不可替代性：

| Block | 解决什么 | 不可省的理由 |
|---|---|---|
| 0 问题本质 | 为什么要 GJK | 朴素特征检测太慢太碎 |
| 1 support | 形状的统一接口 | 这是 GJK 唯一依赖的形状 API |
| 2 Minkowski 差 | 两体 → 一点 | 把相交变成"原点在不在 MD 里" |
| 3 逼近原点 | 不构造 MD 也能判定 | support 隐式查询 + 单调逼近 |
| 4 simplex 更新 | 怎么逼近 | Voronoi 区域 + 丢点 |
| 5 终止条件 | 何时停 | 凸集分离定理保证可靠 |
| 6 数学本质 | 它到底是什么 | 最近点问题 / 割平面优化 |
| 7 Chaos 实现 | 工程怎么落地 | margin / warm start / EPA / 精度 |
| 8 坑 | 为什么会出问题 | 退化 / 精度 / 非凸 |

GJK 的数学优雅在于：它把"两个形状的相交"这一几何问题，通过 Minkowski 差转化为"原点是否在一个凸集内"，再通过 support function 把这个判定转化为"凸优化上求最近点"，最后用 simplex 迭代 + 凸集分离定理给出严格终止。每一步都是前一步的自然推论，没有多余的假设。

而 Chaos 的工程价值在于：它没有止步于教科书 GJK。margin 系统解决了"几乎接触"的边界震荡，GJK→EPA 的衔接解决了"相交后求穿透"，warm start 的局部空间 simplex 存储解决了跨帧性能，float/double 自适应解决了大尺度精度。这四件事把一个 1988 年的理论算法变成了能跑 60FPS 大规模场景的工业实现。

理解了这套积木，就能读懂 Chaos 的 `GJK.h`，能自己实现一个 GJK，能判断什么场景该用 GJK、什么场景该换 SAT 或其他算法，能调参 margin 和迭代次数。GJK 的相邻积木——EPA（GJK 相交后的穿透深度求解）和接触流形生成（GJK 输出如何变成 PBD 约束）——是下一块独立的积木，可单独成文。

想看 GJK 输出如何进入 Chaos 的 PBD 求解器，见本站&#12298;[UE Chaos Physics 引擎详解](/knowledge/ue-chaos-physics-engine/)&#12299;§3.4；想理解 PBD/XPBD 在求解器层面的数学，见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;；想看迭代法收敛性的数学背景（割平面、谱半径、条件数），见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

[Part 1 / Total]
