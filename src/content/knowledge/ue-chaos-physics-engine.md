---
title: "UE Chaos Physics 引擎详解 — 源码架构、约束求解器与并行流水线"
excerpt: "基于 UE 5 源码工程级拆解 Chaos 物理引擎：从 GBF 特征时间 PBD 模型、AdvanceOneTimeStepImpl 六阶段流水线、SoA 刚体状态、三阶段求解器（Position/Velocity/Projection）、双层并行（Island 分组 + 64 位位掩码图染色），到 GJK+EPA 窄相、Split-Impulse、Shock Propagation、Rewind 确定性。覆盖数学推导、求解器本质 J·M⁻¹·Jᵀλ=−C、稳定性与抖动/堆叠/爆炸的工程原因，以及重写 Chaos 的架构设计。与《PBD 与 XPBD 详解》《线性方程组迭代求解详解》《物理模拟数值积分方法详解》互为印证。"
date: "2026-07-04"
category: "Physics"
subtopic: "ChaosPhysics"
tags: ["UE5", "Chaos", "物理引擎", "PBD", "约束求解", "C++"]
readTime: "阅读约70分钟"
---

> Chaos 是 Unreal Engine 5 的默认刚体物理引擎，取代了 UE4 时代的 PhysX。它不是一个"换了名字的 PhysX"，而是一次从求解器内核开始的重新设计：以 **PBD（Position-Based Dynamics）** 作为刚体约束的核心范式，用"预测位置 → 投影约束 → 反推速度"的循环取代了传统基于力/冲量的 Sequential Impulse 主循环。
>
> 本文所有工程结论均来自 UE 源码 `Engine/Source/Runtime/Experimental/Chaos/` 的逐文件分析，关键处标注 `文件:行号`，可对照查阅。Chaos 的 PBD/XPBD 数学推导详见本站&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;，雅可比/高斯-赛德尔/PGS 的数值线性代数背景详见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;，积分方法背景详见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;——本文不重复这些推导，只讲 Chaos 怎么把它们组装成一台能跑 60FPS 的引擎。

---

## 一、概述：Chaos 是什么、为什么是这样

### 1.1 Chaos 解决的问题

游戏物理引擎的核心矛盾是**"稳定"与"实时"不可兼得**：

- 基于**力**的方法（显式弹簧、隐式欧拉）在刚性约束（不可穿透、不可拉伸）下要么数值爆炸（显式），要么每帧要解一个大规模线性系统（隐式），都难压进 16ms 预算；
- 基于**冲量**的方法（Sequential Impulse / PGS）稳定但刚度由迭代次数决定，且堆叠、铰链在低迭代下抖动严重。

Chaos 的取舍是：**绕过力层面，直接在位置空间投影约束**（PBD），用"迭代次数"换"刚度近似"，再以 XPBD 的柔度参数把刚度与迭代次数解耦。这放弃了严格的能量守恒和物理精确性，换来大时间步下的无条件稳定（不爆炸）和可控的材料手感——正是实时游戏最需要的两个性质。

### 1.2 与 Havok / PhysX 的核心区别

| 维度 | PhysX (UE4) | Havok | Chaos (UE5) |
|---|---|---|---|
| **核心范式** | Sequential Impulse（基于冲量/速度） | 基于 SOP/SAT 的约束求解 | **PBD（基于位置投影）** |
| **刚体求解主循环** | 速度冲量迭代 | 速度冲量迭代 | 预测位置 → 投影 → 反推速度 |
| **刚度模型** | 迭代次数 + 软约束参数 | 迭代次数 + 软约束 | XPBD compliance $\tilde\alpha=\alpha/h^2$ |
| **碰撞 narrowphase** | SAT + GJK | GJK + EPA | **GJK + EPA（SAT 代码已废弃）** |
| **并行模型** | CPU 任务图 + GPU (PhysX 3.4) | CPU 高度优化 | **Island 分组 + 图染色** |
| **确定性** | 弱 | 强（专为同步设计） | Rewind 数据回滚 + 确定性排序 |

最根本的差异在**求解器**：PhysX/Havok 求解的是"速度冲量"$\Delta\mathbf{v}$，Chaos 求解的是"位置修正"$\Delta\mathbf{x}$。这一个选择贯穿了 Chaos 的全部架构。

### 1.3 设计哲学：PBD-first

Chaos 的设计哲学可以浓缩为三条：

1. **位置优先**：所有约束先在位置空间投影，再由位置差反推速度。优点是天然不爆炸（位置投影是有界的），缺点是引入非物理阻尼（对游戏常是优点）。
2. **可扩展的迭代**：求解器是迭代式的，迭代次数是可调旋钮，精度与性能可线性交换。三阶段分离（Position / Velocity / Projection）让不同约束类型各取所需。
3. **数据导向并行**：刚体状态是 SoA（结构体数组），约束按 Island 分组、按颜色染色，两级并行适配从单核到多核到 GPU 的不同硬件。

源码里有一处关键事实印证了"GBF = 位置投影范式"：默认的演化类 `FPBDRigidsEvolution` 实际就是 `FPBDRigidsEvolutionGBF` 的别名（`PBDRigidsEvolutionFwd.h:11` 注释 "The default evolution used by unreal"），而 "GBF" 指的是碰撞约束的特征时间 PBD 公式（GBF 论文 Sec 8.1），见 `PBDCollisionConstraint.cpp:1306` 注释 `// D\tau is the chacteristic time (as in GBF paper Sec 8.1)`。也就是说，"GBF"不是"图基前沿"，而是位置投影范式本身的名字。

---

## 二、数学与物理基础：从牛顿到 PBD 投影

### 2.1 牛顿第二定律到离散时间

刚体运动的连续方程：

$$
\dot{\mathbf{x}} = \mathbf{v}, \quad \dot{\mathbf{R}} = [\boldsymbol\omega]_\times \mathbf{R}, \quad m\dot{\mathbf{v}} = \mathbf{F}, \quad \mathbf{I}\dot{\boldsymbol\omega} = \boldsymbol\tau - \boldsymbol\omega\times(\mathbf{I}\boldsymbol\omega)
$$

其中 $\mathbf{R}$ 是旋转矩阵（Chaos 实际用四元数 $\mathbf{q}$），$\boldsymbol\omega$ 是角速度，$\mathbf{I}$ 是世界空间惯性张量，$[\boldsymbol\omega]_\times$ 是叉积矩阵。**实时物理必须离散化**：连续微分无法在有限时间步内求解，必须把 $t$ 切成 $h$ 的小步，每步用有限差分近似。

### 2.2 积分方法：为什么实时物理几乎只能用半隐式

| 方法 | 更新公式 | 稳定性 | 能量 |
|---|---|---|---|
| 显式欧拉 | $\mathbf{v}^{n+1}=\mathbf{v}^n+h\mathbf{a}(\mathbf{x}^n)$，$\mathbf{x}^{n+1}=\mathbf{x}^n+h\mathbf{v}^n$ | 条件稳定 $h<2/\omega$ | 能量发散（爆炸） |
| **半隐式（Symplectic）** | $\mathbf{v}^{n+1}=\mathbf{v}^n+h\mathbf{a}(\mathbf{x}^n)$，$\mathbf{x}^{n+1}=\mathbf{x}^n+h\mathbf{v}^{n+1}$ | 条件稳定但更宽 | 能量近似守恒（微弱阻尼） |
| 隐式欧拉 | $\mathbf{v}^{n+1}=\mathbf{v}^n+h\mathbf{a}(\mathbf{x}^{n+1})$ | 无条件稳定 | 强人工阻尼，每帧解线性系统 |
| Verlet | $\mathbf{x}^{n+1}=2\mathbf{x}^n-\mathbf{x}^{n-1}+h^2\mathbf{a}$ | 时间可逆 | 守恒 |

显式欧拉在刚性弹簧（特征频率 $\omega\propto\sqrt{k/m}$）下要求 $h\to 0$，游戏帧率（$h=1/60$）根本不够。半隐式欧拉用一个微小的时间偏移（用新速度更新位置）换取近似的辛性质，能量不发散——这是**所有实时物理引擎的积分器起点**。Chaos 在 `Integrate` 阶段正是半隐式欧拉：先施加重力更新速度，再用新速度预测位置。

### 2.3 数值稳定性的三个来源

实时物理的"不稳定"几乎都来自三处：

1. **高频刚性**：$k$ 大 → $\omega$ 大 → 显式积分爆炸。**PBD 的解法**：绕过力，直接投影位置，不积分刚性力。
2. **过约束（over-constraint）**：同时要求不可穿透 + 不可拉伸 + 体积守恒，约束方程彼此冲突，迭代不收敛。**Chaos 的解法**：三阶段求解 + 质量条件化（mass conditioning）+ 投影阶段。
3. **大时间步穿透**：高速物体在一个时间步内跨过薄墙。**Chaos 的解法**：CCD（连续碰撞检测）扫掠求交。

理解了这三处，就理解了 Chaos 为什么是现在这个架构。详细推导见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。

---

## 三、Chaos 核心架构拆解

### 3.1 Simulation Pipeline：六阶段流水线

Chaos 的一个物理 tick 由 `FPBDRigidsEvolutionGBF::AdvanceOneTimeStepImpl` 驱动（`Private/Chaos/PBDRigidsEvolutionGBF.cpp:532`），这是整个引擎的"主循环"。它的六阶段顺序是：

```
1. PRE-INTEGRATE   预积分：施加外力、半隐式欧拉预测位置 P/Q
2. COLLISION       碰撞：Broadphase(AABB树) → Narrowphase(GJK+EPA) → 生成碰撞约束
3. ISLAND          岛生成：并查集合并连通分量 → 按约束数装箱分组
4. SOLVE           求解：每岛组三阶段迭代(Position→Velocity→Projection)
5. SLEEP           睡眠/禁用：低速阈值判定 → 整岛睡眠
6. COMMIT          提交：捕获 Rewind 数据 → P→X, Q→R 回写 → 清理临时岛
```

关键源码片段（`PBDRigidsEvolutionGBF.cpp:532-869`，简化）：

```cpp
// 1. 预积分：半隐式欧拉预测位置
PreIntegrateCallback(Dt);
Integrate(Dt);                          // V += h*g; P = X + h*V
ApplyKinematicTargets(Dt, SubStepInfo.PseudoFraction);
UpdateConstraintPositionBasedData(Dt);   // 各容器更新位置相关数据

// 2. 碰撞检测
CollisionDetector.RunBroadPhase(Dt, ResimCache);
CollisionDetector.RunNarrowPhase(Dt, ResimCache);  // 生成碰撞约束

// 3. 岛生成（约束图）
CreateConstraintGraph();   // IslandManager.UpdateParticles() + 各容器 AddConstraintsToGraph()
CreateIslands();           // 并查集合并 → 分配 Level（BFS 到 kinematic 距离）

// 4. 求解（并行，每岛组一个任务）
IslandGroupManager.BuildGroups(bIsResim);
IslandGroupManager.Solve(Dt);

// 5. 睡眠
GetIslandManager().UpdateSleep(Dt);

// 6. 提交
CaptureRewindData(Particles.GetDirtyParticlesView());
ParticleUpdatePosition(Particles.GetDirtyParticlesView(), Dt);  // P→X, Q→R
```

**Substep 机制**是两层封顶的（不是动态误差自适应）：外层 `FPhysicsSolverBase::AdvanceAndDispatch_External`（`PhysicsSolverBase.cpp:585`）按 `MaxDeltaTime` 把帧时间切成 `NumSteps = ceil(Dt/MaxDeltaTime)`，但封顶于 `MaxSubSteps`（默认 `1`，即不子步）。每个子步内，`AdvanceOneTimeStepTask::DoWork`（`PBDRigidsSolver.cpp:489`）还有一个内层安全循环，当 `bSolverSubstepped=false` 时最多再跑 `MaxSubSteps` 次。子步间速度/位置在粒子上持续，流形通过 `BeginFrame()`/`EndTick()` 持续。**注意：超过 `MaxSubSteps` 会丢时间**（源码显式 log "energy loss"）。

### 3.2 Rigid Body System：SoA 状态表示

Chaos 的刚体粒子是**结构体数组（SoA）**，不是数组结构体。每个字段是一条独立的 `TArrayCollectionArray`，按粒子索引列存储。这有两个工程理由：① 同字段连续内存，缓存友好；② 求解器只读它需要的几列，不必把整个粒子 struct 拉进缓存。

`TPBDRigidParticles<FReal,3>`（`Public/Chaos/PBDRigidParticles.h`）的 PBD 专属列：

```cpp
TArrayCollectionArray<TVector<T,d>>             MP;     // 预测位置 P（积分后、求解前）
TArrayCollectionArray<TRotation<FRealSingle,d>> MQ;     // 预测旋转 Q（四元数，单精度！）
TArrayCollectionArray<TVector<FRealSingle,d>>   MPreV;  // 睡眠前线速度
TArrayCollectionArray<TVector<FRealSingle,d>>   MPreW;  // 睡眠前角速度
TArrayCollectionArray<int32>                     MSolverBodyIndex; // 求解期映射到 FSolverBody
```

基类 `TRigidParticles`（`RigidParticles.h:407-432`）提供质量与惯性：

```cpp
TArrayCollectionArray<T>                MM;        // 质量
TArrayCollectionArray<T>                MInvM;      // 逆质量
TArrayCollectionArray<TVec3<FRealSingle>> MI;       // 局部惯性张量（对角！3 个分量）
TArrayCollectionArray<TVec3<FRealSingle>> MInvI;    // 局部逆惯性张量（对角）
TArrayCollectionArray<TVector<T,d>>     MCenterOfMass;     // 质心偏移
TArrayCollectionArray<TRotation<T,d>>   MRotationOfMass;   // 质心旋转
```

三个**工程级关键决策**值得强调：

**① 旋转用四元数，不用欧拉角或旋转矩阵。** 四元数 4 分量、无万向锁、归一化即恢复正交性。位置 `X` 用双精度 `TVector<T,d>`，但预测旋转 `MQ`、预测速度 `MPreV/MPreW` 用**单精度** `FRealSingle`——这是刻意的内存/缓存优化，旋转和预测态在求解期高频读写，单精度省一半带宽，精度损失对游戏物理不可见。

**② 惯性张量只存对角（3 分量），不存完整 3×3。** 这假设刚体的局部惯性在主轴系下对角（物理上对任何刚体都成立——任何惯性张量都能对角化）。存储从历史 3×3 迁移到 vec3 的痕迹仍在（`RigidParticles.h:325` 的 `ChaosInertiaConvertedToVec3` 序列化版本）。每帧求解时再旋转到世界空间：

$$
\mathbf{I}_{\text{world}} = \mathbf{R}\,\mathbf{I}_{\text{local}}\,\mathbf{R}^{\mathsf T}
$$

源码 `Utilities.h:327` 的 `ComputeWorldSpaceInertia` 即此，旋转用的是**质心旋转** $\mathbf{R}_{\text{CoM}} = \mathbf{R}\cdot\mathbf{R}_{\text{RotationOfMass}}$，不是 actor 旋转。

**③ 求解期不直接操作粒子，而用 `FSolverBody` 中转。** `FSolverBody`（`Public/Chaos/Evolution/SolverBody.h:98`）是质心居中的临时缓存，每帧每岛组每个粒子一份。求解器约束只读写 `FSolverBody`，最后 scatter 回粒子。这避免了求解期对 SoA 粒子的随机访问（cache miss），也让并行任务间无共享数据。`FSolverBody` 的核心字段：

```cpp
// SolverBody.h 的 FState（简化）
FVec3 X, R;           // 步起始质心位置/旋转（Q 为四元数，这里示意）
FVec3 P, Q;            // 预测质心位置/旋转
FVec3 V, W;            // 线/角速度
FVec3 DP, DQ;          // 累积位置/旋转修正（引入速度）
FVec3 CP, CQ;          // 仅修正项（Split-Impulse，不引入速度）
float InvM;            // 逆质量
FVec3 InvILocal;       // 局部对角逆惯性（3 分量）
FSolverMatrix33 InvI;  // 世界空间逆惯性（3×3，求解期缓存）
```

`UpdateRotationDependentState()`（`SolverBody.cpp:10`）在每次旋转变化后重算 `InvI`，保证世界空间逆惯性始终同步。

### 3.3 Constraint System：一统的 Joint，混合的求解

#### 3.3.1 架构重组的真相

⚠️ 一个常见误区：很多资料引用 `PBDConstraintRule`/`PBDConstraintGraph`/`PBDConstraintColor` 作为 Chaos 约束系统核心。但读源码会发现这三个头文件都标注了废弃：

```cpp
// Public/Chaos/PBDConstraintRule.h:5
// TO BE REMOVED
// Public/Chaos/PBDConstraintGraph.h:8
// DEPRECATED - to be removed
// Public/Chaos/PBDConstraintColor.h:5
// TO BE DELETED
```

它们的 `.cpp` 只剩 include + 注释。**真正的约束系统已重组到三个目录**：`Public/Chaos/Evolution/`（求解框架）、`Public/Chaos/Joint/`（铰链求解器）、`Public/Chaos/Collision/`（接触求解器）。唯一存活的是 `PBDConstraintContainer`（约束容器基类）。

#### 3.3.2 一个 Joint 类配置所有铰链类型

Chaos **没有** Ball/Hinge/Slider 各自的类。一个 `FPBDJoint` 通过 `LinearMotionTypes`/`AngularMotionTypes`（每轴 `Free`/`Limited`/`Locked`，`PBDJointConstraintTypes.h:22-27`）配置出所有铰链：Hinge = 锁两个 Swing + 自由/受限 Twist；Ball = 两个 Swing 自由；Slider = 全锁角 + 自由轴向线。求解器把 joint 分解成最多 6 个"行"（3 线性 + 3 角度），每行类型见 `Joint/JointSolverConstraints.h:15-38` 的 `EJointSolverConstraintUpdateType`（`Linear_Point`、`Angular_Twist`、`Angular_Cone`、`Angular_SLerpDrive` 等）。

#### 3.3.3 混合求解：Joint 用 XPBD，Contact 用 PBD+冲量

这是 Chaos 最关键的工程决策之一——**不同约束用不同求解形式**：

**Joint（铰链）**：软限制/驱动用 XPBD（compliance + $\lambda$ 累积），硬限制用纯 PBD。判定在 `FJointSolverConstraintRowData::bIsSoft`（`JointSolverConstraints.h:174`）。软路径的 XPBD 增量乘子（`JointSolverConstraints.inl:546-567`）：

```cpp
const FReal S = SpringMassScale * RowData.Stiffness * Dt * Dt;  // compliance 项
const FReal D = SpringMassScale * RowData.Damping   * Dt;       // 阻尼项
const FReal Multiplier = (FReal)1 / ((S + D) * II + (FReal)1);
const FReal DLambda = Multiplier * (S * RowState.Error - D * VelDt - RowState.Lambda);
// 应用 ΔP = Δλ · InvM · Axis，累积 λ += Δλ
```

这正是 XPBD 标准式 $\Delta\lambda = -\dfrac{C+\tilde\alpha\lambda}{\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}+\tilde\alpha}$ 的工程化重写（$S\sim\tilde\alpha^{-1}$，$II\sim\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$）。硬路径则退化为 $\Delta\mathbf{x} = \text{Stiffness}\cdot\text{Error}/II$ 的纯 PBD。

**Contact（接触）**：**不是经典 XPBD，也不是经典 Sequential Impulse，而是 PBD 位置投影 + 冲量速度求解的混合**。它有两个独立累加器——`NetPushOut`（位置修正，PBD 风格）和 `NetImpulse`（速度冲量，SI 风格）。位置阶段（`Collision/PBDCollisionSolver.h:451`）：

```cpp
// CalculatePositionCorrectionNormal
const FSolverReal PushOutNormal = -Stiffness * ContactDeltaNormal * ContactMassNormal;
if ((NetPushOutNormal + PushOutNormal) > FSolverReal(0))   // 单边：净冲量不允许负
    OutPushOutNormal = PushOutNormal;
else
    OutPushOutNormal = -NetPushOutNormal;                  // 钳到 ≥0
```

速度阶段（`:666`）是 Sequential Impulse 形式带钳制。`ContactMassNormal = 1/[(\mathbf{r}\times\hat{\mathbf n})^{\mathsf T}\mathbf{I}^{-1}(\mathbf{r}\times\hat{\mathbf n}) + M^{-1}]` 就是约束的有效质量 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ 的对角元。这种"位置投影保稳定 + 冲量保速度正确"的混合，是 Chaos 区别于纯 SI 引擎（Box2D/PhysX）的根本。

> **为什么这样设计？** 纯 SI（速度冲量）在堆叠时需要很多次迭代才能消除穿透，因为冲量要传导到所有接触；纯 PBD 位置投影能快速消除穿透但速度由位置差反推，弹性/摩擦手感差。Chaos 用位置投影保稳定（PBD 的强项），用冲量阶段保速度正确（SI 的强项），各取所长。代价是两套累加器 + split-impulse 的实现复杂度。

#### 3.3.4 还有一个 Jacobi 接触变体

Chaos 同时实现了一个 `FPBDCollisionSolverJacobi`（`Collision/PBDCollisionSolverJacobi.h:16`）——同色批内并行累加、批量应用，而非默认 `FPBDCollisionSolver` 的 Gauss-Seidel 顺序更新。这是为 GPU/高度并行场景预留的路径（详见第六章）。当前默认走 Gauss-Seidel。

### 3.4 Collision System：AABB 树 + GJK/EPA

#### 3.4.1 Broadphase：动态 AABB 树（BVH 变体）

`TAABBTree`（`Public/Chaos/AABBTree.h:784`）是二叉 BVH，每个内部节点存两个子 AABB + 子索引，叶子最多 `DefaultMaxChildrenInLeaf=12` 个对象。两种模式：

- **静态树**（默认）：自顶向下构建，支持时间片异步重建（`ProgressAsyncTimeSlicing`）+ dirty grid 增量更新；
- **动态树**：基于表面积启发式（SAH）的兄弟节点搜索 + 树旋转（`RotateNode`），叶子 AABB 加 padding 减少更新频率。

叶子层重叠检测是 **SIMD 4 路**（`VectorRegister4Double`，`AABBTree.h:326`）。驱动器是 `FSpatialAccelerationBroadPhase`（`Collision/SpatialAccelerationBroadPhase.h:320`），它对每个活动动态粒子用其 `WorldSpaceInflatedBounds` 查 AABB 树，产出 `FBroadPhaseOverlap` 粒子对。

> ⚠️ 还有一个独立模块 `ChaosSpatialPartitions`（`Engine/Source/Runtime/Experimental/ChaosSpatialPartitions/`，UE 5.8 实验性），提供 `FDynamicAabbTree`/`FStaticAabbTree`/`FNSquaredAabb`，但**当前并未接入物理 broadphase**——live 求解器仍用 Chaos 内部的 `TAABBTree`。这是未来的重构方向。

#### 3.4.2 Narrowphase：GJK + EPA，SAT 已废弃

**关键发现**：`Public/Chaos/SAT.h` 声明了 `SATPenetration`，但全代码库 `Private/` 下**零调用点**——SAT 是死代码。Box-Box 也走 GJK（`CollisionResolution.cpp:377` 的 `BoxBoxContactPoint` 直接调 `GJKContactPoint`）。

GJK 实现（`Public/Chaos/GJK.h`）：`GJKIntersection`（布尔）、`GJKPenetration`（穿透深度+最近点+法向）、`GJKPenetrationWarmStartable`（跨帧 warm start，存 simplex 顶点 `TGJKSimplexData`，最多 4 个）。当 simplex 距原点在 $\epsilon$ 内（`bIsContact`），回退到 **EPA** 求 MTD（`GJK.h:648-700`），EPA 返回 `Ok/MaxIterations/BadInitialSimplex/Degenerate`。GJK 迭代上限 32。

按形状对分派的 `switch` 在 `Private/Chaos/CollisionResolution.cpp:922` 的 `UpdateConstraintFromGeometryImpl`，枚举 `EContactShapesType`（`CollisionResolutionTypes.h:54`）共 23 对（SphereSphere、SphereBox、BoxBox、BoxConvex、ConvexConvex、ConvexTriMesh、LevelSetLevelSet...）。凸-凸统一走 `UpdateGenericConvexConvexConstraint` → GJK。

**GJK-with-margins** 是 Chaos 接触稳定的关键技巧：用"圆角核心形状"（sphere/capsule 取半径，convex 取 $0.05\times$ 最小边距）做 GJK，而不是裸外轮廓。`CalculateQueryMargins`（`GJK.h:154`）选取每对的 margin，这让接触点更稳定、可 warm start，代价是接触位置有 margin 量级误差（对游戏不可见）。

#### 3.4.3 Contact Manifold：最多 4 点

每个 `FPBDCollisionConstraint`（一对形状）持有一个流形，**硬上限 4 个接触点**（`TInlineAllocator<4>`，`PBDCollisionConstraint.h:1034`）。`FManifoldPoint`（`ContactPoint.h:101`）字段：

```cpp
FContactPointf ContactPoint;
FFlags Flags;                       // bDisabled, bHasStaticFrictionAnchor, ...
FRealSingle TargetPhi;             // 目标穿透（Baumgarte/位置校正驱动）
FRealSingle InitialPhi;            // 初始穿透（限 depenetration 速度）
FVec3f ShapeAnchorPoints[2];       // 静摩擦锚点（跨帧 warm start）
```

one-shot 流形构造（`CollisionOneShotManifolds.cpp:820`）：先 GJK 求最深穿透点，再用凸面平面构建多点流形。

---

## 四、求解器深度解析：J·M⁻¹·Jᵀλ = −C 的工程化

### 4.1 约束求解的统一数学形式

所有约束求解——PBD、XPBD、Sequential Impulse、PGS——最终都在解同一个线性系统（推导见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;第十一章、&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;）：

$$
\boxed{\quad \underbrace{\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}}_{\mathbf{W}\text{（有效质量矩阵）}}\,\boldsymbol\lambda = -\frac{\mathbf{C}}{\Delta t^2} \quad}
$$

其中 $\mathbf{J}$ 是约束雅可比（约束对位置的偏导），$\mathbf{M}$ 是质量矩阵，$\mathbf{C}$ 是约束违反量，$\boldsymbol\lambda$ 是拉格朗日乘子（位置修正形式下）/冲量（速度形式下）。位置修正 $\Delta\mathbf{x} = \mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\boldsymbol\lambda$。

- **PBD**：单约束标量特例，$\lambda = -C/(\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C)$，每轮从零投影；
- **XPBD**：增量乘子 $\Delta\lambda = -(C+\tilde\alpha\lambda)/(\mathbf{W}+\tilde\alpha)$，跨迭代累积，柔度 $\tilde\alpha=\alpha/h^2$；
- **Sequential Impulse / PGS**：把 $\boldsymbol\lambda$ 换成冲量 $\mathbf{p}=\boldsymbol\lambda/\Delta t$，每步后投影到可行域（$\lambda_n\ge 0$、摩擦锥）。

**三种方法解的是同一个方程，区别只在"用乘子还是冲量""每轮是否累积""是否投影不等式"。** Chaos 把三者混用：位置阶段用 PBD/XPBD，速度阶段用 SI。

### 4.2 Jacobi vs Gauss-Seidel：为什么 GPU 适合 Jacobi、CPU 适合 GS

这部分的数值线性代数详见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;第三章/第四章，这里只讲物理引擎的取舍：

| 策略 | 更新方式 | 收敛 | 并行性 |
|---|---|---|---|
| **Gauss-Seidel** | 逐约束更新，立即写回，后续用新值 | 快（信息当轮传播） | 难——有 RAW 数据依赖 |
| **Jacobi** | 全部基于旧值算，最后批量累加 | 慢（通常需阻尼） | 易——约束间无依赖 |

**为什么 GPU 更适合 Jacobi**：GPU 的核心优势是数千线程同步骤、SIMT 执行，但它假设线程间无数据依赖。Gauss-Seidel 的"立即写回"要求严格顺序，在 GPU 上要么退化成串行（浪费并行度），要么用图染色（染色本身在 CPU 预处理）。Jacobi 天然无依赖，每个线程独立算一个约束的修正，最后 reduce 累加——完美匹配 GPU 编程模型。代价是收敛慢约 2 倍、需阻尼防震荡，但 GPU 的吞吐量足以用更多迭代补回。

**为什么 Gauss-Seidel 更稳定但难并行**：GS 的"当轮传播"让信息快速扩散，堆叠 10 层箱子只需少量迭代就能让底层支撑传导到顶层；Jacobi 要 10 轮才传一层。但 GS 的顺序依赖在多核 CPU 上也要靠图染色打破（详见 6.2），染色后的"块内 GS + 块间 Jacobi"是 CPU 实时物理的主流折中。

**Chaos 的选择**：默认接触/铰链求解器走 Gauss-Seidel（染色后并行），同时保留 Jacobi 接触变体（`FPBDCollisionSolverJacobi`）供未来 GPU 路径。在色间是严格 GS（等上一色完成），在色内是并行（同色无共享 body）。

### 4.3 三阶段迭代：Position / Velocity / Projection

`FPBDConstraintGroupSolver`（`Evolution/ConstraintGroupSolver.h:22`）每岛组跑三阶段（`ConstraintGroupSolver.cpp:428/505/586`），默认迭代 **8 / 2 / 1**（`PBDRigidsEvolutionGBF.h:62-64`）：

```cpp
// 阶段 1：Position（默认 8 次）
for (int32 It = 0; It < NumPositionIterations; ++It)
    for (Container : PrioritizedConstraintContainerSolvers)
        Container->ApplyPositionConstraints(Dt, It, NumIts);

// 阶段 2：Velocity（默认 2 次）—— 修正速度、施加摩擦/弹性
for (int32 It = 0; It < NumVelocityIterations; ++It) ...

// 阶段 3：Projection（默认 1 次）—— 父级无穷质量，硬锁定
for (int32 It = 0; It < NumProjectionIterations; ++It) ...
```

容器按优先级排序（`SortSolverContainers`，低优先级先解）。三阶段的设计动机：

- **Position 阶段**：消除穿透、满足距离/铰链约束。PBD 位置投影，迭代多（8）保证堆叠不塌。
- **Velocity 阶段**：修正速度以满足摩擦、弹性、铰链速度限制。用冲量形式（SI），迭代少（2）因为速度约束通常较软。
- **Projection 阶段**：把铰链"硬锁"——以父级无穷质量重解一次（`PBDJointSolverGaussSeidel.h:184` 注释 "a position solve where the parent has infinite mass"）。这处理锁定的铰链在低迭代下的残余漂移。

### 4.4 Split-Impulse：位置与速度解耦

`FSolverBody` 同时存 `DP/DQ`（完整修正，引入速度）和 `CP/CQ`（仅修正，不引入速度）。位置阶段算出的修正可分流：

```cpp
// SolverBody.h:351
inline void ApplyPositionDelta(const FSolverVec3& DP) { State.DP += DP; }
inline void ApplyPositionCorrectionDelta(const FSolverVec3& DP) {
    State.DP += DP;        // 也进 DP，影响位置
    State.CP += DP;         // 但单独记 CP，反推速度时扣掉
}
```

位置阶段结束后，`SetImplicitVelocity`（`SolverBody.h:142`）由位置差反推速度，但**扣掉 CP/CQ**：

```cpp
SetV(State.V + FVec3((State.DP - State.CP) * InvDt));   // 位置校正不变成速度
SetW(State.W + FVec3((State.DQ - State.CQ) * InvDt));
```

这就是 Box2D/PhysX 的 Split-Impulse 思想：位置校正（消除穿透）不应该给物体假速度。不做 split-impulse 时，推一个箱子出穿透会让它获得向外的速度（"弹"），堆叠会震荡；做了之后位置归位但速度不变，堆叠稳定。Chaos 用 CVar `p.Chaos.Solver.SplitImpulseMode` 控制。

### 4.5 Warm Start：四种跨帧/跨迭代复用

Chaos 的 warm start 有四种机制，针对不同约束：

1. **Joint XPBD $\lambda$ 累积（tick 内）**：`FJointSolverConstraintRowState::Lambda` 跨迭代累积，每 tick 开头 `TickReset()` 清零，但 `IterationReset()` **不清零**（`JointSolverConstraints.inl:150`，注释 "Lambda is not reset here, it accumulates over the whole timestep"）。这是标准 XPBD warm start。
2. **Joint `LinearHardLambda`/`AngularHardLambda`（跨子步）**：`FPBDJointSolver` 持有（`PBDJointSolverGaussSeidel.h:749`），跨子步持续，用于圆柱/角速度约束。
3. **Contact 静摩擦锚点（跨帧）**：最强复用。`FManifoldPoint::ShapeAnchorPoints[2]` + `Flags.bHasStaticFrictionAnchor` 跨 tick 持续（`PBDCollisionContainerSolver.cpp:150`），用上一帧的形状空间锚点算静摩擦目标。锚点在新流形点匹配旧流形点时设置（`PBDCollisionConstraint.cpp:1288`）。
4. **GJK simplex warm start（跨帧）**：`FGJKSimplexData GJKWarmStartData`（`PBDCollisionConstraint.h:1024`）存上一帧 simplex 顶点，加速 GJK 收敛。

> ⚠️ 注意：Contact 的 `NetPushOut`/`NetImpulse` **每 tick 清零**（`PBDCollisionSolver.h:1039`），所以接触冲量**不跨帧 warm start**——这与 Bullet/PhysX 不同。Chaos 跨帧复用的是几何锚点而非冲量。

### 4.6 收敛性与迭代权衡

迭代次数是 Chaos 的核心旋钮。太少 → 约束"软"（堆叠塌、铰链松）；太多 → 性能超预算。默认 8/2/1 是经验平衡。影响因素：

- **质量比悬殊**（重物压轻物）→ 有效质量矩阵条件数 $\kappa$ 大 → 收敛慢 → 需更多迭代或 shock propagation；
- **堆叠层数** → 约束图深度大 → 信息传播层数多 → 需更多迭代；
- **过约束** → 迭代不收敛到精确解，只能逼近。

Chaos 的应对：质量条件化（`ConditionInverseMassAndInertia`，防小质量父级主导）、Shock Propagation（最后几次迭代把父级 InvM 缩小，`PBDJointContainerSolver.cpp:36`）、迭代刚度爬坡（`GetJointIterationStiffness` 从 `MinSolverStiffness` 线性升到 `MaxSolverStiffness`，`PBDJointContainerSolver.cpp:50`，经典的 PBD 稳定化）。

---

## 五、时间积分与稳定性

### 5.1 Substep vs Iteration：本质不同

这是最容易混淆的两个概念：

| | Substep（子步） | Iteration（迭代） |
|---|---|---|
| **做什么** | 把一个 $h$ 切成 $N$ 个 $\Delta t=h/N$，每个 $\Delta t$ 完整跑一遍积分+碰撞+求解 | 在**同一个** $\Delta t$ 内，把约束求解重复 $K$ 次 |
| **影响什么** | 积分精度、碰撞检测精度、约束初始违反量 | 约束收敛程度（刚度近似） |
| **成本** | 线性增长（$N$ 倍全流程） | 仅约束求解 $K$ 倍 |
| **何时加** | 高速运动（CCD）、大时间步、刚性约束 | 约束软/堆叠不稳 |

**关键区别**：子步让每步的约束初始违反更小（位置还没漂太远），迭代让每步内的约束收敛更彻底。子步比迭代"贵得多"（要重跑碰撞），但对稳定性贡献更大。Chaos 默认 `MaxSubSteps=1`（不子步），靠 8 次位置迭代 + shock propagation 撑稳定性；只有在高速/刚性场景才开子步。

### 5.2 Constraint Drift：为什么约束会漂移

PBD 位置投影是**一阶线性化** $C(\mathbf{p}+\Delta\mathbf{p})\approx C+\nabla C^{\mathsf T}\Delta\mathbf{p}=0$。当约束曲率大（如旋转铰链在大角度下）或迭代不足时，一阶近似误差累积，约束逐步漂离 $C=0$——这就是 **drift**。两个工程对策：

1. **Baumgarte 稳定化**：在速度阶段给一个小的"回拉"目标速度，主动消除残余穿透：

$$
\mathbf{v}_{\text{target}} = -\frac{\beta}{\Delta t}\,C_{\text{residual}}, \quad \beta\in[0,1]
$$

Chaos 的对应是 `TargetPhi`（`FManifoldPoint::TargetPhi`）——位置阶段把穿透驱动到目标 $\phi$，而非严格 0。$\beta$ 太小漂移累积，太大震荡。

2. **XPBD compliance**：用柔度 $\tilde\alpha$ 让约束在有限迭代下收敛到正确刚度，而非靠迭代硬凑（见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;§3）。

### 5.3 能量爆炸的四个原因

"刚体爆炸"几乎总是以下之一：

1. **NaN 传播**：除零（如 `Dist<1e-7` 未保护）产生 NaN，NaN 写回位置后扩散。Chaos 的防护：梯度归一化加 $\epsilon$、`if (W1+W2==0) return` 跳过两端固定的约束。
2. **过约束冲突**：同时要不可穿透+不可压缩，约束方程无解，乘子 $\lambda$ 越积越大。Chaos 的防护：质量条件化 + 投影阶段。
3. **大时间步穿透**：物体一帧跨过薄墙。Chaos 的防护：CCD（连续碰撞检测，`FCCDManager::ApplyCCD`）。
4. **负有效质量**：惯性张量配置错误（如零惯性动态体）导致 $W=\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\le 0$，$\lambda=-C/W$ 反号爆炸。Chaos 的防护：`InvI` 为零时跳过（`PBDRigidParticles.h:170` 的 `IsNearlyZero` 检查）。

---

## 六、Chaos 并行化架构

### 6.1 Task Graph：三层并行

Chaos 用 UE 的任务系统，三层：

1. **`PhysicsParallelFor`**——Chaos 对 UE `ParallelFor` 的封装，用于 gather/scatter/solve 的批量 pass；
2. **`UE::Tasks::Launch` / `UE::Tasks::FTask`**——显式任务 DAG，在 `SolveParallelTasks`（`IslandGroupManager.cpp:511`）构建依赖图；
3. **`FTaskGraphInterface`**——查询 worker 线程数（`GetNumWorkerThreads()`）。

线程模式在构造时定（`PBDRigidsSolver.cpp:691`）：`Single` 单线程 / `TaskGraph` 多线程。`bSingleWorkerPhysics`/`bIsSingleThreaded` 强制串行路径。

### 6.2 两级并行：Island 分组 + 图染色

这是 Chaos 并行架构的核心。**两级独立、可叠加**：

#### 第一级：Island 分组（粗粒度，总是开启）

`FPBDIslandManager`（`Island/IslandManager.h:454`）用**并查集**（union-find）合并连通分量——两个刚体若被约束连接就在同一岛。岛内刚体必须串行求解（它们互相影响），岛间完全独立可并行。

数据结构（`IslandManager.h`）：

- `FPBDIslandParticle`（节点，line 40）——包裹 `FGeometryParticleHandle*`，存 `Island*`、`Edges`、`Level`（到 kinematic 的 BFS 距离）；
- `FPBDIslandConstraint`（边，line 150）——存 `Nodes[2]`、`Level`、`LevelSortKey`；
- `FPBDIsland`（line 232）——`Nodes`（仅动态，kinematic 不存）、`ContainerEdges`、睡眠计数器；
- `FPBDIslandMergeSet`（line 418）——本 tick 的合并集。

构建（`PBDRigidsEvolution.h:931/949`）：`CreateConstraintGraph`（各容器 `AddConstraintsToGraph`）→ `CreateIslands`（`UpdateIslands` → `ProcessMerges`/`ProcessSplits`/`AssignLevels`，BFS 分配 Level 用于 shock propagation 排序）。

装箱：`FPBDIslandGroupManager::BuildGroups`（`IslandGroupManager.cpp:121`）把岛按约束数降序，**贪心装箱**到固定数量的 `IslandGroup`（目标 `TargetNumConstraintsPerTask = NumAllConstraints/MaxGroups`），每个 group 配独立的 `FSolverBodyContainer` + 每 container 的 `FConstraintContainerSolver`（缓存友好）。

#### 第二级：图染色（细粒度，可选）

在 Island 组内，约束还可能共享 body（一个 body 多个接触）。直接并行会数据竞争。`SolverPartitionManager`（`Evolution/SolverPartitionManager.h`）做**贪心图染色**，染色对象是约束（不是 body）。

算法（`SolverPartitionManager.cpp:124-137`）用 **64 位位掩码**——每个 body 存一个 64 位"已用颜色"掩码：

```cpp
const uint64 UsedColorsMask = (BodyColors0 ? *BodyColors0 : 0) | (BodyColors1 ? *BodyColors1 : 0);
const uint64 FreeColorsMask = ~UsedColorsMask;
const int32 ColorIndex = FreeColorsMask != 0
    ? (int32)FPlatformMath::CountTrailingZeros64(FreeColorsMask)  // 最低空闲位
    : MaxColors;                                                   // 64 色→溢出到串行批
*BodyColors0 |= (1ULL << ColorIndex);
*BodyColors1 |= (1ULL << ColorIndex);
```

`MaxColors=64`（`SolverPartitionManager.h:117`）。约束数 < 1000 时跳过染色（`Chaos_SolverPartitionManager_MinConstraintsForColoring`，开销不划算）。染色后按色计数排序（`SortArrayByPartitionIndex`），同色批内并行、色间串行——**色间 Gauss-Seidel，色内并行**。

任务派发（`ConstraintGroupSolver.cpp:282` 的 `DispatchApplyConstraints`）构建 `UE::Tasks::FTask` DAG：每个色是一层串行（`SerialIndex`），每层内拆多个并行任务（`ParallelIndex`），后一色等前一色所有任务完成（`ConstraintSolvePrerequisites.Add(...)`）。依赖模型见 `ConstraintGroupSolver.cpp:609`。

#### 为什么 constraint ordering 重要

Gauss-Seidel 的收敛率 $\rho(\mathbf{B}_{GS})$ 依赖变量更新顺序（详见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;§6.3）。Chaos 在多处排序约束：

- **Island Level 排序**：BFS 到 kinematic 的距离，让"被支撑"的约束先解（shock propagation 自下而上）；
- **约束方向**：`GetConstraintDirection`（`PBDCollisionConstraint.cpp:1300`）按重力方向判定谁压谁，先解底层；
- **容器优先级**：`SortSolverContainers`，低优先级先解（如接触先于铰链）。

排好序能让信息沿物理因果链传播，收敛快且稳。这是 Chaos 区别于朴素 PBD 实现的工程功夫。

### 6.3 三种 Solve 模式

`FPBDIslandGroupManager::Solve`（`IslandGroupManager.cpp:663`）按 CVar `p.Chaos.Solver.IslandGroups.ParallelMode`（默认 `2`）选：

```cpp
const int32 ParallelMode = bSingleThreaded ? 0 : CVars::GIslandGroupsParallelMode;
switch (ParallelMode) {
case 0: SolveSerial(Dt);          break;  // 串行
case 1: SolveParallelFor(Dt);     break;  // ParallelFor
case 2: SolveParallelTasks(Dt);   break;  // UE::Tasks DAG（默认）
}
```

源码注释（`:665`）："Remove SolveParallelFor when SolveParallelTasks has been thoroughly tested"——**Tasks 模式是未来方向，ParallelFor 正在被淘汰**。`SolveParallelTasks`（`:511`）构建完整任务图：每 group → `GatherBodyTasks` → (`GatherConstraintTasks` ‖) → `SolveTask` → (`ScatterConstraintTasks` → `ScatterBodyTasks`)，用 `DispatchBatchedTasks` 派发。

### 6.4 GPU solver 思路

Chaos 当前**没有**生产级 GPU 刚体求解器（布料有 ChaosCloth 的 GPU 路径，刚体没有）。但架构已为 GPU 预留：

- **Jacobi 接触变体**（`FPBDCollisionSolverJacobi`）——天然并行，无色间依赖；
- **SoA 数据布局**——可直接映射到 GPU buffer；
- **Island 分组**——岛间天然并行，适合 GPU 多流。

GPU 物理的难点不在算法而在**确定性**（GPU 浮点顺序不保证）和**数据搬运**（CPU↔GPU 传输是瓶颈）。本站的&#12298;[GPU 物理插件](/knowledge/gpu-physics-plugin/)&#12299;有相关讨论。

---

## 七、性能优化策略

### 7.1 Warm Start

见 §4.5。四种机制减少重复计算。最有效的是静摩擦锚点跨帧复用——避免每帧重新估计摩擦目标。

### 7.2 Sleep System

`IslandManager::UpdateSleep`（每 tick 末）判定整岛睡眠：岛内所有刚体速度低于阈值且持续若干帧 → 整岛标记 `bIsSleeping`，下 tick 跳过该岛求解。醒来由外部事件（被撞、kinematic 移动）触发。`MPreV`/`MPreW`（`PBDRigidParticles.h`）存睡眠前速度用于平滑过渡。Sleep 是性能第一杠杆——静止场景 90% 刚体应睡眠。

### 7.3 Constraint Pruning

- **CullDistance**：每对碰撞约束有 `CullDistance`（`PBDCollisionConstraint.h:997`），分离超过即剔除流形；
- **`PruneExpiredItems`**（`PBDRigidsEvolutionGBF.cpp` 的 island 阶段后）清除过期分配；
- **Initial overlap 限速**：`MaxDepenetrationVelocity * Dt` 限制单帧穿透修正量（`PBDCollisionContainerSolver.cpp:243`），防止新流形点"弹出"。

### 7.4 SIMD / 精度分层

- **求解器单精度**：`FSolverReal = FRealSingle`（`CHAOS_CONSTRAINTSOLVER_LOWPRECISION=1`，`SolverBody.h:15`），不论引擎 `FReal` 是 double 还是 float。求解期高频计算用单精度省一半带宽；
- **AABB 叶子 4 路 SIMD**（`AABBTree.h:326`）；
- **GJK SIMD 变体** `GJKIntersectionSimd`（`GJK.h:209`）。

### 7.5 Iteration vs Accuracy

迭代次数是线性可调的。8 次位置迭代对大多数游戏够用；高质量堆叠可拉到 16+；竞技/VR 需要更强稳定性时开子步。**用 substep 比加 iteration 有效但更贵**——见 §5.1。

---

## 八、典型工程问题与真实现象解释

### 8.1 为什么约束会抖动

**数学原因**：PBD 每轮从近似位置投影，迭代不足时约束在 $C=0$ 两侧震荡（over-shoot 后回拉又 under-shoot）。Gauss-Seidel 的顺序依赖让不同约束轮流"赢"，位置在帧间跳变。

**工程原因**：① 迭代太少；② 质量比悬殊（重物压轻物，轻物被反复推）；③ 静摩擦锚点未跨帧 warm start，每帧重新估计摩擦目标。

**解决方案**：增加位置迭代；开 split-impulse（位置校正不引入速度）；确保静摩擦锚点启用；质量条件化缓解质量比。

### 8.2 为什么堆叠不稳定

**数学原因**：堆叠 N 层的约束图深度 N，信息自下而上传播需 N 次迭代。默认 8 次迭代只能稳定 ~8 层。超出的层因底层支撑未充分传导而下沉。

**工程原因**：① shock propagation 未启用或层数不足；② Position 迭代少；③ 接触流形点不稳定（GJK 每帧给不同点）。

**解决方案**：开 shock propagation（最后几次迭代把上层 InvM 缩小，让底层先稳）；增加 `NumPositionIterations`；用 one-shot manifold 稳定接触点；子步。

### 8.3 为什么高速穿透发生

**数学原因**：离散时间步 $h$ 内，物体位移 $\Delta x = vh$。若 $v h > \text{墙厚}$，一帧跨过墙，碰撞检测（基于离散位置）看不到。

**工程原因**：CCD 未启用；Broadphase 的 inflated bounds 不足。

**解决方案**：开 CCD（`FCCDManager::ApplyCCD`，扫掠求交）；增大 AABB inflation；子步减小 $h$。

### 8.4 为什么刚体会"爆炸"

见 §5.3。最常见的两个：NaN 传播（除零未保护）和过约束冲突。**调试技巧**：在 `FSolverBody::ApplyPositionDelta` 加 clamp，$\|\Delta\mathbf{p}\|>\text{threshold}$ 时 log + 钳制，能定位是哪个约束产生异常修正。

---

## 九、Chaos vs Havok vs PhysX 对比

| 维度 | Chaos (UE5) | Havok | PhysX (UE4) |
|---|---|---|---|
| **solver 范式** | PBD 位置投影 + SI 速度混合 | 冲量速度求解（SOP） | Sequential Impulse（PGS） |
| **稳定性** | 强（位置投影有界，不爆炸） | 强（工业级调优） | 中（堆叠需多迭代） |
| **性能（CPU）** | 中上（SoA + Island 并行） | 极高（十几年单核优化） | 高（成熟 SIMD） |
| **确定性** | Rewind 回滚 + 确定性排序 | 强（专为同步设计） | 弱 |
| **GPU 支持** | 架构预留，未生产化 | 无（纯 CPU） | PhysX 3.4 有 GPU |
| **刚度可控** | XPBD compliance（与 $h$、迭代解耦） | 软约束参数 | 软约束参数 |
| **铰链** | 统一 Joint + MotionTypes | 多类型类 | 多类型类 |
| **碰撞 narrowphase** | GJK + EPA | GJK + EPA | SAT + GJK |
| **可扩展性** | 高（模块化、容器化） | 低（闭源黑盒） | 中 |

**一句话**：Chaos 牺牲了 Havok 的极致单核性能和 PhysX 的 GPU 成熟度，换来了 PBD 范式的稳定性优势 + 完全开源可改 + 与 UE 任务系统/ChaosVisualDebugger 的深度集成。对 UE 项目，Chaos 的工程整合价值大于纯性能差异。

---

## 十、如果重写 Chaos，应该怎么设计

基于源码分析的反思，给出推荐设计。

### 10.1 模块划分（推荐）

```
Core/
  Math/            向量、四元数、惯性张量工具（无依赖）
  Particle/        SoA 粒子存储 + 视图
  SolverBody/      求解期中转缓存（质心居中）
Collision/
  Broadphase/      动态 AABB 树（可插拔：AABB/网格/均匀）
  Narrowphase/     GJK+EPA（shape-pair 分派表）
  Manifold/        流形点 + 静摩擦锚点
Constraint/
  Container/       约束容器基类（AoS 存储）
  Joint/           统一 Joint + MotionTypes
  Contact/         PBD 位置 + SI 速度混合
Solver/
  Island/          并查集岛 + 装箱分组
  Coloring/        64 位位掩码染色
  Phases/          Position/Velocity/Projection 三阶段
Parallel/
  TaskGraph/       UE::Tasks 封装
  GpuBackend/      Jacobi 变体（预留）
```

### 10.2 数据结构设计

**关键原则**：① 粒子 SoA，求解期 `SolverBody` 中转；② 惯性对角存储（3 分量），世界空间按需旋转缓存；③ 旋转四元数单精度、位置双精度分层；④ 约束 AoS（设置/粒子/状态平行数组），求解期扁平化。

```cpp
// 推荐的 SolverBody 核心（合并 DP/CP 到 split-impulse 设计）
struct SolverBody {
    Vec3 P;              // 预测位置
    Quat Q;              // 预测旋转
    Vec3 V, W;           // 速度
    Vec3 DP, DQ;         // 完整修正（引入速度）
    Vec3 CP, CQ;         // 仅修正（split-impulse）
    float InvM;
    Vec3 InvILocal;      // 局部对角
    Mat3 InvI;           // 世界空间（旋转变化时重算）
    uint64 ColorMask;    // 染色用位掩码
};
```

### 10.3 Solver 选择

- **默认 CPU**：Gauss-Seidel + 图染色（色间 GS、色内并行），三阶段 8/2/1；
- **GPU 路径**：Jacobi 接触变体 + Island 间并行，用更多迭代补收敛；
- **刚性场景**：子步 + shock propagation + 投影阶段。

### 10.4 CPU vs GPU 分工（推荐）

| 阶段 | CPU | GPU |
|---|---|---|
| Broadphase | AABB 树构建/查询（异步） | — |
| Narrowphase (GJK) | ✓（依赖分支，GPU 不友好） | — |
| Island 生成 | ✓（并查集） | — |
| 约束求解 | 默认（GS 染色） | 大规模同质约束（Jacobi） |
| Sleep/Commit | ✓ | — |

GJK 因其分支密集（早退、退化处理）不适合 GPU；并查集的串行合并也不适合。约束求解是 GPU 的最佳靶子——同质、数据并行、可 Jacobi。推荐：**CPU 负责 GJK/Island/Sleep，GPU 负责大规模约束求解（布料、流体、大量刚体堆叠）**。

### 10.5 三条更优设计建议

1. **接触冲量跨帧 warm start**：Chaos 当前每 tick 清零 `NetPushOut`/`NetImpulse`，这是相对 Bullet/PhysX 的退步。跨帧复用冲量能显著减少堆叠所需迭代。理由：上一帧的支撑冲量本帧大概率仍需。代价：要处理流形点匹配（Chaos 已有锚点匹配机制，可复用）。
2. **接触用纯 XPBD**：当前 Position(PBD)+Velocity(SI) 混合虽稳但实现复杂（两套累加器 + split-impulse）。纯 XPBD 用 compliance 统一位置和速度，代码更简、参数更直观。理由：XPBD 的 $\tilde\alpha$ 已证明能在有限迭代下给正确刚度，不需要 SI 补速度。代价：弹性/摩擦手感需重新调参。
3. **确定性排序下沉到 Island Level**：当前确定性靠 `ApplyDeterminism` + Rewind。更彻底的方案是把约束排序规则（Level、方向、容器优先级）固化成确定性的稳定排序键，让多核上的约束顺序天然一致，减少 Rewind 开销。

---

## 结语

Chaos 的工程价值不在于它发明了什么新物理，而在于它**把 PBD/XPBD 的位置投影范式坚持到底地用到了刚体上**，并用 Island 分组 + 图染色 + 三阶段求解的工程组合，让这套范式能在 60FPS 下跑大规模场景。理解 Chaos 的钥匙是这一个等式：

$$
\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\boldsymbol\lambda = -\mathbf{C}
$$

PBD 解它的标量特例，XPBD 加 compliance 解耦刚度，Sequential Impulse 把 $\boldsymbol\lambda$ 换成冲量，PGS 加投影处理不等式——Chaos 在位置阶段用 PBD/XPBD、速度阶段用 SI、投影阶段硬锁，是这四种解法的工程化组合。再向上，Island 分组把大规模问题切成独立子问题，图染色把串行 GS 改造成并行，SoA + SolverBody 让数据布局适配缓存与并行——这些是让数学能在实时预算内跑起来的系统设计。

读源码时的三条捷径：① 主循环看 `PBDRigidsEvolutionGBF::AdvanceOneTimeStepImpl`（`PBDRigidsEvolutionGBF.cpp:532`）；② 求解器看 `ConstraintGroupSolver.cpp:428/505/586` 三阶段；③ 并行看 `IslandGroupManager.cpp:511`（Tasks DAG）和 `SolverPartitionManager.cpp:124`（位掩码染色）。这三个文件是 Chaos 的脊柱。

想继续深入 PBD/XPBD 的数学推导，见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;；想理解雅可比/有效质量 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ 的来源，见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;；想把 Jacobi/GS/PGS 的收敛性彻底打通，见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;；积分方法（显式/半隐式/隐式/Verlet）的对比见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。Chaos 的布料子系统和 GPU 物理另有&#12298;[Chaos 布料](/knowledge/chaos-cloth/)&#12299;和&#12298;[GPU 物理插件](/knowledge/gpu-physics-plugin/)&#12299;。

[Part 1 / Total]
