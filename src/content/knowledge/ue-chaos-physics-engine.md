---
title: Chaos 物理引擎：架构与求解流水线
excerpt: 沿刚体状态和时间步梳理 Chaos 的碰撞、约束、并行调度与结果回写。
date: '2026-07-04'
category: Physics
subtopic: ChaosPhysics
tags:
  - UE5
  - Chaos
  - 物理引擎
  - PBD
  - 约束求解
  - C++
readTime: 阅读约10分钟
kind: source
level: advanced
pageType: source-analysis
aliases:
  - Chaos Physics
  - UE 物理引擎
  - Chaos Solver
  - UE Chaos Physics 引擎详解 — 源码架构、约束求解器与并行流水线
prerequisites:
  - classical-mechanics
  - numerical-integration-methods
  - iterative-linear-solvers
nextArticles:
  - collision-detection-gjk-epa-sat
  - pbd-xpbd-math
  - chaos-kinematic-sync
related: []
topics:
  - id: ue-chaos-physics
    stage: architecture
    role: source
    order: 10
sources: []
featured: true
---
理解 Chaos 应先沿一次物理步追踪状态、碰撞、约束和结果提交，再进入局部算法。本文是刚体源码导航，通用数学分别由[数值积分](/knowledge/numerical-integration-methods/)与[物理约束](/knowledge/physics_constraints_deep_dive/)负责。不能用“Chaos 是 PBD”概括所有接触、关节、速度和投影路径。

## 源码范围与证据口径

本次结构核对基于本地 E:\UnrealEngine\UnrealEngine_Source，HEAD 为 e28561eab454，Build.version 标为 5.9.0，核对日期为 2026-10-23。这是源码树自身版本标识，不代表已发布版本声明。

以下路径相对于 Engine/Source/Runtime/Experimental/Chaos/。本轮直接复读了演化主步、岛组阶段调度、接触位置/速度累加器及形状分派。其他类型与接口保留为同一源码范围下的导航，不宣称逐行重跑了全部引擎。

正文中的“源码事实”是具体文件与函数行为；数学解释不自动代表所有 Chaos 约束采用同一公式；性能、确定性和资产配置需要项目运行证据。本文没有构建或运行 UE。

## 状态分层与所有权

### 游戏侧、物理侧与 Solver Body

组件变换、物理代理、物理粒子和求解临时体承担不同职责。组件提供输入或消费结果，物理侧推进粒子；约束求解常通过 Solver Body 缓存处理质心状态，再写回粒子。

粒子状态可从 Public/Chaos/RigidParticles.h、PBDRigidParticles.h 追踪，求解期缓存可从 Public/Chaos/Evolution/SolverBody.h 与 SolverBodyContainer.h 追踪。不要把某个示意结构中的位置、旋转和速度全部声明为 FVector：实际代码使用各自的向量、四元数和精度类型。

局部主惯性可以按对角形式保存，世界空间逆惯性还需要结合质心旋转变换。Actor 朝向、形状朝向和质量框架不一定相同。

### 预测态与提交态

X/R 与 P/Q 一类字段需要按具体类型核对：步起始状态、预测状态和修正量不应混读。约束迭代修改候选状态，并不表示游戏线程立即看到了它。

运动学目标是已知驱动输入，动态体状态由求解演化。游戏线程镜像与结果回写的详细条件见[运动学同步](/knowledge/chaos-kinematic-sync/)，不在本篇复制第二套判定。

## 一次刚体演化步

主入口是 Private/Chaos/PBDRigidsEvolutionGBF.cpp:532 的 FPBDRigidsEvolutionGBF::AdvanceOneTimeStepImpl。它同时包含回调、碰撞修改、CCD、重演缓存和诊断，下面只保留主依赖顺序：

~~~text
步前处理与回调
  → Integrate：外力、速度与预测位姿
  → ApplyKinematicTargets：应用已知运动目标
  → 更新空间加速与约束位置数据
  → RunBroadPhase / RunNarrowPhase
  → 碰撞修改、惯性条件化与 CCD 相关处理
  → CreateConstraintGraph / CreateIslands
  → BuildGroups / Solve
  → 求解后 CCD 修正、回调与缓存
  → 睡眠、重演记录与粒子位置提交
~~~

这段是执行链摘要，不是可复制编译的引擎代码；实际分支及顺序应查该函数。不能略去中间状态后声称所有接触都是“先求穿透，再一次投影”。

### 积分与子步

同文件 :871 的 Integrate 可继续追踪力、阻力、速度上限和旋转积分。位置预测与约束求解是两个阶段；预测采用速度更新并不决定后续约束只在速度层或位置层执行。

子步由外层时间推进策略决定，同一步内 Position/Velocity/Projection 的迭代由约束求解预算决定。增加迭代不等于重新积分外力和生成新接触，增加子步也不只是把同一组行多算几次。

时间累计、最大步长、最大子步和重演策略要从外层 Solver 与项目设置核对，不能从 Evolution 单函数推出所有项目的默认步进行为。

## 碰撞检测与接触数据

### 宽相、窄相与流形

宽相用空间加速寻找候选对，窄相按形状与配置生成可求解的接触。相关入口包括 CollisionDetector、Private/Chaos/CollisionResolution.cpp 与 Public/Chaos/Collision/ 下的接触构造接口。

本快照的 CollisionResolution.cpp:377–390 中，BoxBoxContactPoint 与 UpdateBoxBoxConstraint 就存在不同分支：启用 one-shot manifold 时调用 ConstructBoxBoxOneShotManifold，否则更新单点查询结果。形状分派还包含 Sphere、Capsule、Convex、TriangleMesh 与 HeightField 的专门构造。

因此不能由一个 GJK 查询函数推断整个窄相统一采用 GJK，也不能仅因某个旧 SAT 入口没有调用就宣称所有 SAT 思路或特化流形代码已废弃。具体距离、margin、退化状态与 EPA 的接口见[Chaos GJK](/knowledge/gjk-collision-detection/)。

### 持久化接触与缓存

一个形状对的接触约束可以包含多个接触点和历史状态。流形刷新要处理特征匹配、法线变化、接触臂、材料及活跃性，缓存的局部位置与世界空间查询结果不能混用。

TInlineAllocator 的模板参数表示内联存储容量，单凭该类型不能推出数组硬上限。若要声明最多几个点，应查生成、归约和求解循环的显式限制。

### CCD 的职责

CCD 处理离散步中高速物体越过几何的问题，约束迭代处理已建立约束的满足程度。主步还存在求解后 ProjectCCD，用于修正约束求解可能导致的 CCD 相关问题。是否启用、哪些对象参与及其代价由配置和路径决定。

## 岛、岛组与求解阶段

### 独立系统与任务组织

CreateConstraintGraph / CreateIslands 根据约束连接组织物体，再由 IslandGroupManager.BuildGroups 形成调度组。Private/Chaos/PBDRigidsEvolutionGBF.cpp 中明确把不同岛组的求解组织为并行工作。

物理岛是耦合关系，岛组是调度粒度，两者不能等同。一个大耦合岛还可能需要容器内部并行；独立小岛之间的并行不能直接解决单个大岛的依赖。

### Position、Velocity、Projection

Private/Chaos/Island/IslandGroupManager.cpp:260–285 的 SolveGroupConstraintsSerial 依次调用

~~~text
PreApplyPositionConstraints → ApplyPositionConstraints
PreApplyVelocityConstraints → ApplyVelocityConstraints
PreApplyProjectionConstraints → ApplyProjectionConstraints
~~~

同文件还存在 ApplyConstraintsParallelTasks 调度路径。这里能确认的是阶段接口和依赖顺序，不是所有约束必须在每一阶段执行相同公式。

位置阶段控制位置层偏差；速度阶段处理相对速度、恢复或摩擦等相应项；投影阶段用于对应容器的额外纠正。具体内容需要进入注册的碰撞、关节或其他容器，不能从阶段名称直接推导能量行为。

## 接触与关节的局部更新

### 接触位置修正与速度冲量

Public/Chaos/Collision/PBDCollisionSolver.h 中存在分开的 NetPushOutNormal 与 NetImpulseNormal 累加器。

CalculatePositionCorrectionNormal（:451 起）根据累计推离量限制本次位置修正；约 :666 起的速度路径对累计法向冲量施加下限并更新 NetImpulseNormal。后续摩擦处理还会使用相应法向支撑估计。

这直接说明：所读接触路径同时包含位置与速度机制。将其描述为“完全取消冲量、仅由位置差反推一切速度”会遗漏实际执行部分。

一般标量有效逆质量为 $W=JM^{-1}J^T$，有效质量为 $1/W$；源码 ContactMassNormal 一类变量应根据其实际乘法关系解释，不能把两者写成同一个量。

### 关节与软约束

关节配置中的 Free/Limited/Locked、驱动和软限制决定实际生成的约束行。可从 Public/Chaos/Joint/JointSolverConstraints.h、.inl 与相应求解器追踪。

柔度、刚度、阻尼、累计乘子和时间步可能以重新缩放的形式进入局部公式。不能只看到 SpringMassScale 或一个 Lambda 字段就把整套关节求解等同于无阻尼标量 XPBD。

具体锁轴、限位、驱动、质量条件化和投影可能走不同路径；调参时先确认当前行是否激活及使用哪一种求解形式。

## 性能与故障如何归因

宽相候选对多，优先检查空间分布与过滤；窄相代价高，检查形状与流形路径；求解代价高，检查活跃约束、耦合岛、迭代和质量比；同步代价高，检查输入、回写和线程等待。

穿透可能来自没有生成接触、CCD 配置、求解预算或错误几何，不能统一归因于 PBD 太软。堆叠抖动需要区分接触历史、目标修正、摩擦与休眠；关节冲突需要检查参考框架、限位和驱动。

确定性需要固定输入、时间步、排序、线程策略与相关代码路径的实测。重演缓存或确定性排序的存在，不足以证明跨硬件完全一致。本文也不保留未绑定场景的引擎性能排名。

## 源码索引与继续阅读

- Private/Chaos/PBDRigidsEvolutionGBF.cpp:532：一次主步；:871：积分。
- Private/Chaos/Island/IslandGroupManager.cpp:260：串行阶段与相邻并行调度入口。
- Public/Chaos/Collision/PBDCollisionSolver.h:451：位置修正；:666 附近：速度冲量。
- Private/Chaos/CollisionResolution.cpp:377：Box 查询与接触流形分支，以及后续形状分派。
- Public/Chaos/Evolution/SolverBody.h：求解临时体；SolverBodyContainer.h：体缓存组织。
- Public/Chaos/Joint/JointSolverConstraints.h 与 .inl：关节行及局部更新。

通用几何见[凸体碰撞](/knowledge/collision-detection-gjk-epa-sat/)，约束推导见[物理约束](/knowledge/physics_constraints_deep_dive/)，接触查询细节见[Chaos GJK](/knowledge/gjk-collision-detection/)，游戏侧镜像见[运动学同步](/knowledge/chaos-kinematic-sync/)。本篇的版本范围和源码定位不等于 UE 编译、运行或性能验收。
