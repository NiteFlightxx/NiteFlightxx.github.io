---
title: "Chaos GJK：距离、容差与退化处理"
excerpt: "对照 Chaos GJK 的距离、相交与穿透接口，关注 margin、终止条件和退化处理。"
date: "2026-07-06"
category: "Physics"
subtopic: "Collision"
tags: ["UE5", "GJK", "EPA", "碰撞检测", "Minkowski", "C++"]
readTime: "阅读约25分钟"
kind: "source"
level: "advanced"
prerequisites: ["collision-detection-gjk-epa-sat"]
nextArticles: ["ue-chaos-physics-engine"]
topics:
  - id: "ue-chaos-physics"
    stage: "collision"
    role: "source"
    order: 10
aliases: ["GJK 碰撞检测算法详解 — 从 support function 到 Chaos 引擎实现"]
---

通用 GJK 的几何解释与 Chaos 中可靠使用查询结果是两个层次。本文只保留必要的数学摘要，重点追踪接口选择、空间、margin、输出有效性与退化分支。SAT、support、Minkowski 差和 simplex 的完整推导统一放在[凸体碰撞检测](/knowledge/collision-detection-gjk-epa-sat/)。

源码范围为 `E:\UnrealEngine\UnrealEngine_Source`，快照 `e28561eab454`，核对日期 2026-10-21。下文以 `Engine/Source/Runtime/Experimental/Chaos/Public/Chaos/` 为公共头文件路径前缀；“源码事实”仅限所列函数，不代表所有形状对都经过同一实现。

<span id="一block-0碰撞检测问题本质" aria-hidden="true"></span>
<span id="11-为什么需要-gjk" aria-hidden="true"></span>
<span id="12-什么是凸体碰撞问题" aria-hidden="true"></span>
<span id="13-为什么不能用简单包围盒解决" aria-hidden="true"></span>
<span id="二block-1support-function最关键基础积木" aria-hidden="true"></span>
<span id="21-什么是-support-point" aria-hidden="true"></span>
<span id="22-为什么最远点能代表形状" aria-hidden="true"></span>
<span id="23-dot-product-在这里的意义" aria-hidden="true"></span>
<span id="24-例子" aria-hidden="true"></span>
<span id="25-三种理解方式" aria-hidden="true"></span>
<span id="三block-2minkowski-difference核心转化" aria-hidden="true"></span>
<span id="31-a--b-的几何意义" aria-hidden="true"></span>
<span id="32-关键定理碰撞--原点在-md-中" aria-hidden="true"></span>
<span id="33-为什么这个转化是关键突破" aria-hidden="true"></span>
<span id="34-为什么凸性是前提揭晓第一节的伏笔" aria-hidden="true"></span>
<span id="四block-3gjk-的核心思想逐步逼近原点" aria-hidden="true"></span>
<span id="41-simplex-是什么" aria-hidden="true"></span>
<span id="42-为什么不断逼近原点" aria-hidden="true"></span>
<span id="43-每一步的直觉" aria-hidden="true"></span>
<span id="44-search-direction-如何更新为什么不会乱跑" aria-hidden="true"></span>
<span id="45-三种理解方式" aria-hidden="true"></span>
<span id="五block-4simplex-更新规则核心算法逻辑" aria-hidden="true"></span>
<span id="51-通用框架" aria-hidden="true"></span>
<span id="52-1-点情况点-simplex" aria-hidden="true"></span>
<span id="53-2-点情况线段" aria-hidden="true"></span>
<span id="54-3-点情况三角形" aria-hidden="true"></span>
<span id="55-4-点情况四面体" aria-hidden="true"></span>
<span id="56-统一的丢点原则" aria-hidden="true"></span>
<span id="57-三种理解方式" aria-hidden="true"></span>
<span id="六block-5终止条件非常重要" aria-hidden="true"></span>
<span id="61-判定无碰撞分离出口" aria-hidden="true"></span>
<span id="62-判定碰撞相交出口" aria-hidden="true"></span>
<span id="63-收敛与精度出口" aria-hidden="true"></span>
<span id="64-为什么收敛可靠" aria-hidden="true"></span>
<span id="七block-6数学本质总结" aria-hidden="true"></span>
<span id="71-gjk-本质是什么问题" aria-hidden="true"></span>
<span id="视角一最近点问题" aria-hidden="true"></span>
<span id="视角二割平面法cutting-plane--优化" aria-hidden="true"></span>
<span id="视角三support-mapping--iterative-optimization" aria-hidden="true"></span>
<span id="72-三个视角的适用场景" aria-hidden="true"></span>

## 1. 几何摘要：查询对象必须一致

对凸集 $A,B$：

$$
C=A-B,\qquad
S_C(\mathbf d)=S_A(\mathbf d)-S_B(-\mathbf d).
$$

距离形式在单纯形上求到原点最近点，再取新的支撑点改进结果。分离时得到距离与见证点；近接触或原点进入 simplex 时，需要另一条输出路径。

只记住三条接口要求即可：支撑点处于约定空间、单纯形点与两侧见证点对应、停止状态决定输出是否可读。普通距离 GJK 的 simplex 是支撑点的凸包，不是若干支撑超平面的交集；不能用“割平面法”类比替代真实的数据结构。

非凸几何的全局 support 只刻画凸包，会丢失凹陷。凸分解、网格查询与宽相不由这条公式自动解决。

<span id="八block-7chaos--unreal-engine-中的-gjk-实现" aria-hidden="true"></span>
<span id="81-chaos-是否直接用-gjk" aria-hidden="true"></span>

## 2. 先选查询，不要统一读取一个 bool

**源码事实**：当前头文件有多种不同契约的入口：

| 接口 | 用途与注意事项 | 源码位置 |
|---|---|---|
| GJKIntersection | 相交查询；不等同于距离/穿透输出 | `GJK.h:189` |
| GJKIntersectionSimd | SIMD 相交入口与重载 | `GJK.h:202–209` |
| GJKDistance | 距离、见证点、法线与三态结果 | `GJK.h:2050–2088` |
| GJKPenetrationWarmStartable | 带 simplex 输入/输出的穿透与分离查询 | `GJK.h:531–561` |
| GJKPenetration | 另一套穿透输出接口，不能直接等同前一项 | `GJK.h:1431` |

WarmStartable 的接口注释明确：穿透为正、分离为负，两侧见证点分别处于各自局部空间；它还特意提示与 GJKPenetration 的输出空间不同。直接替换函数而不改调用方坐标处理，会得到数值正常但位置错误的接触。[源码事实：`GJK.h:531–558`]

这不是无需配置就能从任意游戏对象调用的高层 API。接入形状查询时，还需要满足几何包装、变换、缓存与调用阶段契约；本文不提供未经编译验证的可直接粘贴 UE 代码。

## 3. GJKDistance：状态、空间与输出

### 3.1 入口状态

**源码事实**：`GJK.h:2063–2088` 的注释要求 B 的变换把 B 局部坐标映射到 A 局部空间，计算在 A 空间中进行。InitialV 不是任意世界方向，而应使用相应 Minkowski 集中的初始向量，文件建议从 GJKDistanceInitialVFromDirection 获得。

这里“方向”和“位于集合中的向量”不可随意互换。坏初值可能触发错误提前退出，源码在 `GJK.h:2098–2100` 附近也有直接警告。

### 3.2 距离循环与停止

**源码事实**：`GJK.h:2103–2127` 沿当前分离向量的反方向取支撑，维护距离下界 Mu，并以当前距离与下界的差判断进展；达到 MaxIts 也会进入输出分支。默认 Epsilon 为 1e-3，MaxIts 为 16。[`GJK.h:2088`]

达到迭代预算时，输出可能超过目标误差，甚至不能排除近零情形的近似误判；这是代码注释明确承认的边界。不能把“返回了 Separated/Contact”理解为另有一个逐次收敛证明标志。若需要区分预算终止，应另外添加可观测性并单独验证，而不是从 bool 推断。

### 3.3 三种结果与 margin 回填

**源码事实**：`GJK.h:2050–2060` 区分：

- Separated：分离，输出有效。
- Contact：重叠仍处于净 margin 范围，返回负分离值，输出有效。
- DeepContact：超出该距离查询可提供结果的范围，输出保持原值，不能读取作有效接触。

在正常输出分支，`GJK.h:2140–2168` 用重心权重恢复两侧点，计算：

$$
d_{\mathrm{surface}}=d_{\mathrm{core}}-(m_A+m_B).
$$

随后按法线移动两侧见证点，并把 B 侧点变回 B 局部空间。循环结束后的深接触分支则不设置输出。[`GJK.h:2170–2190`；具体输出分支应连同前后代码阅读]

因此，日志里残留上次的距离或坐标，并不能证明这次深接触结果正确；调用方应先按结果枚举分派。

<span id="82-support-function-的工程化函数指针--margin" aria-hidden="true"></span>
<span id="83-gjk-with-margins稳定接触的关键" aria-hidden="true"></span>

## 4. Support 与 margin：不是所有函数共用同一规则

**源码事实**：FGeomGJKHelper 保存几何指针、支撑函数指针和 margin；转换后的支撑查询先旋转方向，再变换返回的位置。其模板 SupportCore 调到具体几何。[`GJK.h:484–528`]

**源码事实**：CalculateQueryMargins 中，球/胶囊半径与普通形状 sweep margin 分开处理；若没有半径项，仅较小一侧的形状 margin 乘以 SweepMarginScale=0.05，另一侧为零。[`GJK.h:155–180`]

这不是“所有凸体 GJK 默认使用最小边长的 5%”。输入来自几何的 GetMarginf/GetRadiusf，且这是该查询 margin 函数的规则。WarmStartable 直接读取两形状自身 margin，其调用不能未经追踪就套用 sweep 规则。[`GJK.h:593–599`]

**工程建议**：记录 core、外表面、margin、缩放与单位；同时看 OutMaxSupportDelta，而不是将全部偏差统称为浮点精度。margin 的意义是查询几何和表面恢复的一部分，不是给求解器任意加一圈“安全距离”。

<span id="85-warm-start跨帧复用-simplex" aria-hidden="true"></span>

## 5. WarmStartable：缓存怎样进入本次查询

**源码事实**：该函数接收 TGJKSimplexData，在当前 BToATM 下调用 Restore 重建单纯形与分离向量；随后保存 A/B 的原始支撑点，更新重心系数。[`GJK.h:561–630`]

接口注释只在相对变换变化较小时描述更快收敛的预期，并不保证所有形状或运动每帧只需一次迭代。[`GJK.h:546–558`]

**工程建议**：缓存应绑定形状对、几何版本与坐标约定。传送、替换形状或明显拓扑变化时，需要检查缓存是否仍有效；这一建议不代表该头文件替调用方完成了所有生命周期管理。

**源码事实**：当前循环用新距离是否小于 Epsilon 判定进入近接触路径，用未继续减小的距离标记退化；CheckGJKIterationLimit 另有限制。[`GJK.h:600–637`] 这些判据不能简化成“只要没有进展就分离”。

<span id="84-gjk--epa-回退相交后求穿透" aria-hidden="true"></span>

## 6. GJK 接 EPA：按状态决定能用什么

**源码事实**：近接触路径从 simplex 重建两侧支撑点数组，将 B 侧转到 A 空间后调用 EPA。[`GJK.h:648–671`]

随后区分：

| EPA 状态 | 该调用方的处理 | 源码位置 |
|---|---|---|
| Ok | 回填穿透、法线及两侧点 | `GJK.h:678–686` |
| MaxIterations | 采用当前状态，误差未知 | `GJK.h:675–677` |
| BadInitialSimplex | 使用初始化得到的接触方向，并保留 GJK 点继续处理 | `GJK.h:687–693` |
| Degenerate | 不使用无效 EPA 结果，保留 GJK 的近接触信息 | `GJK.h:694–698` |

枚举还包含 NoValidContact，定义位于 `EPA.h:421–427`；不要把某一调用方的 switch 当作所有状态在整个引擎中的统一策略。

**源码事实**：EPA 的该实现迭代上限为 128，并维护上下界和相对容差。[`EPA.h:508–559`] 收敛条件、退化退出与使用近似结果的策略，都是最终误差的一部分。

**需要验证**：项目里何种形状与运动触发哪条分支、误差是否可接受，以及退化后是否仍有稳定流形。这里没有通过 UE 场景测试证明它们。

<span id="86-精度自适应float--double-自动切换" aria-hidden="true"></span>
<span id="88-simd--cpu-优化在哪" aria-hidden="true"></span>

## 7. 数值预算与性能：先定位具体分支

GJKDistance 默认 MaxIts=16；另一个 CheckGJKIterationLimit 帮助函数使用 32 并发出碰撞诊断。[源码事实：`GJK.h:141–149、2088`] 因而“Chaos GJK 统一迭代 32 次”的概括不成立。

默认 Epsilon、EPAEpsilon、几何 margin 和支撑误差是不同量，不能全部调成同一个值。放大容差可能提前停止并改变接触，增加预算也不能修复错误空间或非法形状。

SIMD 入口、模板数值类型和其他精度分支确实存在，但“存在 double 类型”不证明每一次查询都会自动升精度。本文不对所有路径给出统一精度自适应结论，也不从源码静态结构推断实际耗时。

**工程建议**：按查询种类分别记录次数、迭代分布、EPA 调用率、退化状态与支撑调用成本。固定形状、速度、尺度和阈值后再比较优化，避免只看总帧率。

<span id="87-broadphase--narrowphase-关系" aria-hidden="true"></span>
<span id="九block-8常见误解与坑" aria-hidden="true"></span>
<span id="91-为什么-gjk-有时候会卡住" aria-hidden="true"></span>
<span id="92-为什么-precision-会影响结果" aria-hidden="true"></span>
<span id="93-为什么-convex-restriction-很重要" aria-hidden="true"></span>
<span id="94-其他常见坑" aria-hidden="true"></span>
<span id="十全文总结gjk-的思维模型" aria-hidden="true"></span>

## 8. SAT 调用边界与诊断顺序

**源码事实**：`Engine/Source/Runtime/Experimental/Chaos/Private/Chaos/Collision/ConvexTriangleContactPoint.cpp:744–773` 的一个分支使用 GJKDistance，并在 DeepContact 时调用 SATConvexTriangle。这是已确认的调用，而不是“SAT 已被整个 Chaos 弃用”的证据。

本文没有完成全形状对的分派图，不宣称“所有凸对都只走 GJK+EPA”“Box–Box 在所有配置下不走专用方法”或“只有凸三角使用 SAT”。相关结论必须沿真实调用者重新确认。

出现错误时，建议依次检查：

1. 形状是否满足凸性/有效性，缩放与单位是否一致。
2. 方向、InitialV、变换和输出空间是否符合所选接口。
3. 返回状态是否允许读取输出，深接触时是否误用旧值。
4. core/margin 与表面回填是否重复或遗漏。
5. 缓存是否绑定正确形状对，退化和预算出口是否可见。
6. 几何结果正确后，再检查流形持久化与接触约束。

这里 1–6 是排查建议，不是源码已经替调用方保证的事实。接触求解见[物理约束](/knowledge/physics_constraints_deep_dive/)，整体时间步与线程见[Chaos 架构](/knowledge/ue-chaos-physics-engine/)，通用算法公式回到[凸体碰撞检测](/knowledge/collision-detection-gjk-epa-sat/)。
