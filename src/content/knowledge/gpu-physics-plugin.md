---
title: "GPUPhysicsLab 插件详解 — three-avbd 的 Unreal RDG 移植、GPU AVBD 与工程扩展"
excerpt: "基于 three-avbd-rewrite 当前源码，追踪 WorldSubsystem、GT/RT 所有权、RDG 碰撞与拓扑、六维 AVBD、接受状态和 Niagara 发布，并区分原生 SAT、曲面 GJK/EPA、单体动力属性与弹簧质点布料的实际实现及验证边界。"
date: "2026-10-18"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["GPUPhysicsLab", "AVBD", "Unreal Engine", "RDG", "碰撞检测", "源码精读"]
readTime: "阅读约60分钟"
kind: "source"
level: "advanced"
pageType: "source-analysis"
aliases: ["GPU Physics", "three-avbd UE 移植", "GPUPhysicsLab AVBD"]
prerequisites: ["three-avbd-gpu-solver", "vbd-avbd-math", "ue-chaos-physics-engine"]
nextArticles: []
related: ["avbd-demo3d-implementation", "collision-detection-gjk-epa-sat", "jacobian-matrix", "numerical-integration-methods"]
topics:
  - id: "ue-chaos-physics"
    stage: "parallel"
    role: "source"
    order: 40
sources:
  - title: "GPUPhysicsLab 参考版本与移植范围"
    url: "https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/REFERENCE.lock.json"
  - title: "GPUPhysicsLab RDG 求解主链路"
    url: "https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp"
  - title: "GPUPhysicsLab 版本发布与失败恢复"
    url: "https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp"
  - title: "GPUPhysicsLab 历史验收范围"
    url: "https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P32_RESULTS.json"
featured: false
---

## 学习位置

- **难度**：高级。
- **本文职责**：解释 three-avbd 的 GPU 物理流水线如何进入 Unreal Engine，以及宿主适配、独立扩展和当前验证边界。
- **前置阅读**：[three-avbd GPU 求解器](/knowledge/three-avbd-gpu-solver/)、[VBD 与 AVBD](/knowledge/vbd-avbd-math/)、[Chaos 物理引擎总览](/knowledge/ue-chaos-physics-engine/)。
- **分工**：基础公式和参考算法在前置文章展开；本文保留理解移植差异所必需的公式、实际源码与工程取舍。

## 一、先给结论：这不是旧 PBD 插件的换名介绍

当前 GPUPhysicsLab 是以锁定 three-avbd 三维 GPU 实现为基础、使用 UE C++、HLSL、RDG/RHI 重写的独立物理运行时。核心是**按刚体分块的六维 AVBD 原对偶求解**，不是旧版文章所描述的“十五个 Compute Shader 的 PBD 系统”。[参考锁:1–36](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/REFERENCE.lock.json#L1-L36) [求解调度:141–242](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L141-L242)

其主要价值可以概括为三层：

1. **参考数值内核**：两级哈希、Box/Hull SAT、接触历史、CSR、JP 染色、多 lane 原问题、对偶更新和速度重建。
2. **UE 宿主适配**：WorldSubsystem、GT/RT 分离、持久 GPU 资源、RDG 调度、代际句柄、异步观察、接受版本与 Niagara 发布。
3. **独立扩展**：圆柱/胶囊几何、单体动力属性、GPU 弹簧质点布料。这些不能冒充锁定参考已有的功能。

还需要先明确五个边界：

- 它没有接管所有 Chaos 刚体，也不是自动替换项目物理后端；公开入口推进自己 World 会话中的 GPU 物体。[World:24–98](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/World/GPUPhysicsLabWorldSubsystem.cpp#L24-L98)
- 当前正式 shader 准入要求真实 **SM6 RHI**，不能继承旧文章的“ES3.1/Metal A12 已兼容”结论。[求解调度:84–139](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L84-L139)
- 原生 Box/Hull 仍是 SAT；只在曲面扩展中看到有界 GJK/EPA，不能说所有窄相都走 GJK/EPA。[接触历史:44–65](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L44-L65)
- 布料实际是弹簧力、罚接触与速度—位置积分；尚不是计划中与刚体统一的 AVBD CSR/染色迭代。[布料弹簧:10–49](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplySprings.usf#L10-L49) [布料积分:11–38](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/IntegrateParticles.usf#L11-L38)
- 课程和局部测试有明确未验收项。源码存在、单项通过、完整产品可用、长期稳定和性能达标，是不同层级。

### 1.1 本文版本与证据口径

分析目录为 E:\UnrealProjects\GASP57\Plugins\GPUPhysicsLab，读取分支为 three-avbd-rewrite，基线 HEAD：

~~~text
779b2e09cc531d39d8d2ad7d5813823cc5c26bd6
~~~

插件锁定的参考：

~~~text
three-avbd 0.3.0
2bb1a318e9aad03640b4bce5b5d222484f0925f7
~~~

分析开始时，World 的参考场景/布料配置、显示和示例存在未提交修改；分析期间这些增量已形成新提交。本文最终冻结到以上提交，并补读了新增的 30×30 布料场景与验收摘要。核心求解文件与此前读本一致；本文没有修改插件。后续新提交不自动属于本文结论。

以下文件路径均相对于插件根目录；正文引用给出文件别名与行号，文末映射到完整路径。远端链接需要该提交已推送且读者有访问权限，不能用远端可访问性代替本地源码证据。

本文明确区分：

- **源码事实**：本轮读到的实际函数、分支与数据流。
- **工程判断**：由实现推导出的成本、限制和建议。
- **历史证据**：仓库记录的测试结果，本轮没有重新运行 UE。
- **待验证**：真实场景、长时间运行、跨 GPU、Cook/Shipping 与视觉验收。

## 二、它具体借鉴了 three-avbd 的什么

### 2.1 继承的是数据契约和执行模型，不只是 AVBD 名词

参考锁明确列出 solver.ts、layout.ts、wgsl-solve、wgsl-collision、wgsl-hull，以及共享 topology/scan 等来源。Body、Joint、Manifold、Contact 的字段尺寸与标志位也被固定。[参考锁:8–36](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/REFERENCE.lock.json#L8-L36)

这意味着忠实移植要同时对齐：

- 碰撞发生在什么时刻。
- 一对物体如何生成及排列。
- 约束按什么顺序被累加。
- 接触锚点、特征和乘子如何继承。
- 颜色间位姿写入何时对后续颜色可见。
- 小角度四元数、主元下限、罚参数与默认值。

如果只复制能量公式，却改成先预测再碰撞、每轮重新生成接触、或统一 Jacobi，就已经改变执行模型。

### 2.2 参考算子到 UE 文件的对应

最重要的几个映射是：

- GpuSolver3D.step → AddSolverStep 与 RenderState::SubmitSteps_RenderThread。
- warmStartBodies → IntegrateBodies.usf。
- accumulate / finishBody → PrimalSolve.usf、GPUPhysicsLabRigidBlock.ush。
- warmStartJoints / dualJoint → InitializeSolver.usf、GPUPhysicsLabWarmStart.ush、DualUpdate.usf。
- 碰撞与缓存 → GenerateCandidatePairs.usf、GPUPhysicsLabContactHistory.ush。
- 共享 topology/scan → BuildCSR.usf、BuildColors.usf、SequencePasses。
- World / queries / contacts → Simulation、WorldSubsystem 与查询/事件 shader。

对应入口见 [求解调度:44–242](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L44-L242)、[帧提交:386–493](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L386-L493)。详细理论不再重复，参考 [three-avbd 全流水线](/knowledge/three-avbd-gpu-solver/)。

### 2.3 哪些属于 UE 自己增加的设计

three-avbd 的 JavaScript World 不等于 UE 的 Game Thread/Render Thread。下面这些是宿主工程，不是参考公式：

- UObject/UHT/Blueprint 接口。
- 世界初始化、BeginPlay、EndPlay 和引擎退出。
- ENQUEUE_RENDER_COMMAND、线程安全共享所有者与 fence。
- FRDGPooledBuffer 的持久所有权及 RDG 内注册。
- GPU 接受版本、回滚快照、显示租约。
- Niagara Data Interface 与 Actor 示例。

这些适配可以不改变成功步数值，但会改变内存、命令数、延迟和集成方式，必须独立验收。

## 三、模块与线程：谁拥有世界，谁拥有数值

### 3.1 当前模块

GPUPhysicsLab.uplugin 声明两个 Runtime 模块：GPUPhysicsLab 在 PostConfigInit 加载，GPUPhysicsLabExamples 在 Default 加载，并依赖 Niagara。不是旧文中的 GPUPhysics/GPUPhysicsTests 组合。[插件描述:1–35](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/GPUPhysicsLab.uplugin#L1-L35)

核心模块依赖 Engine、RenderCore、RHI、Niagara 等；Editor 构建才额外依赖 UnrealEd。[Build.cs:4–19](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/GPUPhysicsLab.Build.cs#L4-L19)

### 3.2 Game Thread

UGPUPhysicsLabWorldSubsystem：

1. Initialize 创建唯一 Simulation 并绑定回调。
2. OnWorldBeginPlay 启动。
3. Tick 调用 Advance。
4. Faulted 会话只 Poll，不继续推进。
5. EndPlay/Deinitialize/PreExit 统一关闭。

仅支持 Game/PIE 世界，不是编辑器所有预览 World 自动运行。[World:19–98](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/World/GPUPhysicsLabWorldSubsystem.cpp#L19-L98)

GT 持有作者配置、句柄和命令队列；它们不能被当作每步最新 GPU 位姿。运动学目标从当前 GPU 姿态计算速度，而不是把延迟 CPU 缓存写回物理。[Simulation:1181–1233](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1181-L1233)

### 3.3 Render Thread

RenderState 持有 GPU pooled buffer、回读对象、接触缓冲 parity、状态及显示发布对象。它创建 RDG 图、注册外部资源并调度 shader，不把物理接触逐点交给 GT 求解。[Simulation:88–204、386–493](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L88-L493)

FRDGBufferRef 只属于当前图；跨帧保存的是 pooled buffer。把一个旧图的 FRDGBufferRef 缓存在 UObject 中供下一帧使用，违背这里的资源模型。

### 3.4 GPU

GPU 保存并更新真正位姿、速度、乘子、接触、邻接和颜色。CPU 只做作者准备、调度与异步观察，不存在正常运行时 CPU 窄相回退。[求解调度:29–43、141–168](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L29-L168)

### 3.5 关闭阶段可以等待，正常步进不应全量等待

Shutdown 排队 Release，并通过 FRenderCommandFence 等待 RT 退休后释放共享所有者。它解决对象退出和 GPU 资源生命周期，不是每步调用 FlushRenderingCommands 强制同步。[Simulation:1554–1575](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1554-L1575)

## 四、单位、坐标和形状标签：最容易移植错的一层

### 4.1 内核 SI，作者位置厘米

常规位置和尺寸从厘米乘 $0.01$，惯量若以 $\mathrm{kg\cdot cm^2}$ 给出则乘 $10^{-4}$。角速度保持 $\mathrm{rad/s}$，不是再做长度换算。[数学边界:78–114](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Math/GPUPhysicsLabQuaternionMath.h#L78-L114)

Y-up 求解坐标的换基为：

$$
(x,y,z)_{\mathrm{UE}}\longmapsto(x,z,-y)_{\mathrm{solver}}
$$

其行列式为正；尺寸、主惯量等局部轴标量只置换轴，不应用向量方向的负号。四元数也需对应换基，不能只改位置。[数学边界:62–76、115–129](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Math/GPUPhysicsLabQuaternionMath.h#L62-L129)

### 4.2 公共施力接口已经是 SI

ApplyRuntimeBodyForce 的参数是 ForceN，Impulse 是 Ns，Torque 是 Nm；AddPush 对这些量换基而不乘 $0.01$，作用点 PointCm 才转换为米。[Simulation:1771–1815](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1771-L1815)

因此不能看到某个底层 TryToSolverForce helper，就断言所有公开施力 API 都接收 UE 的厘米量纲。**必须沿实际调用者核对单位。**

### 4.3 公开形状枚举不等于 GPU 标签

公开枚举依次为 Sphere、Capsule、Box、Cylinder、ConvexHull、Sail；内部参考标签为 Box=0、Sphere=1、Sail=2、Hull=3+offset，扩展 Capsule=-1、Cylinder=-2。[作者类型:15–27](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h#L15-L27) [内核常量:16–21](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabLimits.h#L16-L21)

负标签避免覆盖凸包 atlas 的偏移空间。直接把公开 enum cast 成 GPU shape 会错判几何。

圆柱/胶囊的作者轴是局部 X；Cylinder 长度为平盖间全高，Capsule 长度为中间直段，完整长度还要加两倍半径。不要按 Unreal 某些默认胶囊组件的局部轴习惯直接套用。[作者类型:97–116](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h#L97-L116)

## 五、ABI：保留参考记录，用旁路结构扩展

核心记录仍是：

- Body：160 字节，十个 float4。
- Joint：160 字节，另有 16 字节 JointInfo。
- Manifold：32 字节。
- Contact：64 字节。
- StepParams：192 字节。
- BodyDynamics：新增 48 字节旁路记录。

Body/Step 具有 sizeof、alignof、offsetof 和 trivially-copyable 静态断言；不是靠“C++ 看起来有相同字段”来猜 HLSL stride。[Body 数据:7–45](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabBodyData.h#L7-L45) [Step 数据:7–84](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabStepData.h#L7-L84) [常量:10–29](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabLimits.h#L10-L29)

Body 仍保存当前/初始/惯性位姿和速度；一些 w 通道是整数位打包，如参考位姿变更步号和形状标签。数值有限性检查不能将所有位打包通道当作普通 float。[速度更新:26–34](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf#L26-L34)

### 5.1 为什么新增 BodyDynamics 而不改 Body160

质心、重力倍率、阻尼、静动摩擦和恢复系数进入单独结构，不挤占旧接触历史字段，不破坏既有渲染步长。[Body 数据:34–45](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabBodyData.h#L34-L45)

代价是每体额外缓冲与读取；收益是参考记录保持稳定、默认值可以明确退回原运算。旁路结构也不能自行形成第二个物理世界。

## 六、完整执行链：从 UE Tick 到接受的 GPU 姿态

当前真实链路如下，布料只在启用时进入：

~~~text
WorldSubsystem.Tick（GT）
  → Simulation.Advance / 固定步计划
  → 捕获运动学目标、力与冲量
  → ENQUEUE_RENDER_COMMAND
  → RenderState.SubmitSteps_RenderThread（RT）
      → RegisterExternalBuffer
      → 备份本步开始前 GPU 状态
      → [布料 Attachment → Spring Force → Rigid Contact/Reaction → Integrate]
      → PushBodies
      → AddSolverStep
          → BeginCollisionFrame / UpdateRefs / HashInsert
          → Grid Count → Scan → Scatter → Candidate Pairs
          → Native Narrowphase → [Surface Narrowphase / SurfaceStatus]
          → CSR → JP Coloring → Buckets / Indirect Args
          → WarmStartJoints → WarmStartBodies
          → iterations × [逐色 Primal → Dual]
          → UpdateVelocity → FinalizeStep
      → [Contact Events]
      → 准备不可变显示副本 / 异步状态读取
      → Graph.Execute
  → Poll：检查版本与错误
      → 成功：接受状态、发布显示
      → 失败：撤销发布、恢复备份、进入 Faulted
~~~

证据：[帧提交:386–493](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L386-L493) [求解调度:44–73、141–242](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L44-L242) [状态轮询:1491–1551](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1491-L1551)。

注意三点：

- 刚体碰撞仍在本步 WarmStartBodies 预测之前，不在每轮 primal 中重建。
- 布料当前在刚体 AVBD 前单独推进，不在每轮中与刚体共同收敛。
- Graph.Execute 返回不等于 CPU 已拿到最新物理状态；异步回读有自己的完成时机。

## 七、固定步与外部输入

### 7.1 时间预算

默认固定步为 $1/60$ 秒，MaximumSubsteps=4，Iterations=10。PlanUpdate 累加非负输入，最多执行预算内子步，最后将欠账限制到一个 dt。[Simulation:2067–2082](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L2067-L2082) [作者设置:191–209](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h#L191-L209)

这保持参考 World.update 的时间策略。长帧不会无限追赶，也不能声称真实时间永不丢失。增加 iterations 不能替代增加时间子步。

### 7.2 一次性冲量与持续力

GT 为每子步准备合并的 push：

$$
\mathbf J_{\mathrm{step}}=
\mathbf J_{\mathrm{once}}+\mathbf Fh
$$

一次性冲量只在计划批次第一步使用，随后清除；Force 保留直到显式 Clear。偏心作用通过作用点与合力矩进入同一 pusher。[Simulation:1203–1221、1771–1815](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1203-L1815)

**工程取舍**：CPU 合并同体输入，使 GPU 由单一线程更新该体速度，减少共享写入；但会话何时捕获输入、批量子步之间是否允许 BeforeStep 回调，属于宿主时序，不由 AVBD 公式决定。

### 7.3 运动学不是“每帧强改动态体位置”

目标移动以当前 GPU 位姿、目标和计划时长生成运动学速度，旋转使用短半球差。StepFixed 若有待处理运动学目标，会禁止整体流形复用。[Simulation:1169–1201](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1169-L1201)

Static、Kinematic、Simulated 是作者运动类型；底层固定/运动学仍沿参考质量零和速度通道表达，公开类型不能直接等同于一个质量字段。

## 八、RDG 适配：把资源依赖写对，本身就是算法的一部分

### 8.1 持久与临时资源

RenderState 将 BodyStorage 等 pooled buffer 注册进当前图；scan 的块和 scratch 则由当前图分配。需要跨帧的显示快照通过 QueueBufferExtraction 取得 pooled 所有权。[帧提交:398–423](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L398-L423) [扫描调度:9–29](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSequencePasses.cpp#L9-L29) [显示发布:16–42](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Display/GPUPhysicsLabPosePublication.cpp#L16-L42)

### 8.2 每个 pass 独立参数块

ColoringPasses 为每个 pass 分配独立参数，声明 SRV/UAV/IndirectArgs。RDG 才能看见颜色、计数器、位姿和派发参数之间的读写关系。[染色调度:22–65](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabColoringPasses.cpp#L22-L65)

“我在 C++ 先后调用两个函数”不等于资源依赖已经完整；不能省掉 shader 参数声明，指望裸 RHI buffer 地址自动进入 RDG 追踪。

### 8.3 矩阵与浮点语义适配

WGSL 的列索引与 HLSL 数学行矩阵表示不同。GPUPhysicsLabRigidBlock 明确交叉块的角/线索引，并按真实元素取值展开 LDLᵀ。[局部块:8–39](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabRigidBlock.ush#L8-L39)

源码大量使用 precise 控制特定中间表达式，但接触热启动乘子还特意保留非 precise 表达式，记录了 DXC/driver 组合折叠可能改变全步差分。[约束数学:161–171](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabRigidConstraint.ush#L161-L171)

结论不是“给所有变量加 precise 更正确”，而是需要对照具体表达式、归约树和参考比较契约。

## 九、宽相：两级网格、配对所有权与分层筛选

CPU PlanBroadphase 对半径使用 Wirth selection，得到 coarse/fine 网格与 large 列表；动态粗体标记决定是否需要补充固定体探测。[宽相调度:46–76](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabBroadphasePasses.cpp#L46-L76)

GPU 随后执行：

1. 清网格计数/写入指针。
2. gridCount。
3. exclusive scan。
4. gridScatter。
5. 动态体探测相邻格。
6. 必要时 findFixedLarge 补齐跨级/大体配对。
7. 写候选数与下一阶段 indirect args。

入口：[宽相调度:15–38、84–100](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabBroadphasePasses.cpp#L15-L100)。它不是旧内核的 LBVH。

候选还经过固定—固定剔除、双向 groups/mask、包围球、世界 AABB、面轴和禁碰撞配对筛选，避免把所有桶内对象直接送进窄相。具体见 [候选 shader:53–107](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Broadphase/Pairs/GenerateCandidatePairs.usf#L53-L107)。实现责任与参考相同，见文末源码索引。

### 9.1 scan 如何进入 UE

一个工作组扫描 512 项，线程数 256；组和递归到更高层，再向下添加偏移。SequencePasses 为每层创建独立 scratch 和 pass，避免层间错误别名。[扫描调度:9–29](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSequencePasses.cpp#L9-L29) [扫描 shader:1–24](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Broadphase/Sort/ScanBlocks.usf#L1-L24)

基础推导见 [three-avbd 前缀和章节](/knowledge/three-avbd-gpu-solver/)。这里新增的是 RDG 生命周期与显式绑定。

## 十、原生窄相与接触缓存

### 10.1 保留 SAT 与多点流形

原生接触根据形状路由：

- sphere–sphere / sphere–box：解析路径。
- 涉及 Hull：真实凸多面体 SAT/裁剪。
- box / sail：OBB SAT，Sail 碰撞仍按盒。
- 含负标签曲面：交给扩展 permutation，不在原生路径重复生成。

入口：[接触历史:44–65](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L44-L65)。Box 的十五轴、faceBias 和最多八点裁剪分别落在 [SAT:35–53](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabConvexSAT.ush#L35-L53) 与 [裁剪:6–36](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabPolyhedronClipping.ush#L6-L36)。这些机制的意义已在 [参考专题](/knowledge/three-avbd-gpu-solver/) 详细解释。

### 10.2 Pair 哈希与原子语义

HashInsert 使用 InterlockedExchange 携带被交换旧值继续线性探测，对应 WGSL atomicExchange。读取 atomic u32 则用 InterlockedOr(...,0) 表达原子读，不仅是普通 UAV load。[流形入口:5–8](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Narrowphase/Manifold/UpdateManifolds.usf#L5-L8) [接触历史:19–27](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L19-L27)

这是跨语言移植中非常具体的差异：类型都叫 uint，不代表原子访问语义相同。

### 10.3 匹配、粘着与两种复用

接触继承保留参考的 feature 优先、nearest 补救、stick 锚点与乘子/罚参数衰减。reuseContacts 根据参考位姿变更步号判断；reuseManifolds 则沿用整个旧集合。[接触历史:29–42、66 起](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L29-L66)

两者不能混淆：

- reuseContacts 仍需要本步找到该配对。
- reuseManifolds 可以绕过整个 grid/narrowphase，但不会发现旧集合以外的新接触。
- 位姿、过滤、拓扑和资源变更必须使整体复用失效。
- 完整历史验收的 P20 问题仍单列，不因局部公式正确而消失。

## 十一、CSR 与 Jones–Plassmann 染色

CSR 把每个动态体连接的 Joint 与 Manifold 放进紧凑邻接行。Degree→Scan→Fill→Sort 的顺序保持参考；容量区间按 body capacity 分配，而 scan 只覆盖 live bodyCount+1，二者不能混用。[拓扑调度:32–93](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabTopologyPasses.cpp#L32-L93)

JP 染色继续采用 compact、mark、AB/BA 轮次、稳定颜色桶与 GPU 间接派发。[染色调度:33–65](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabColoringPasses.cpp#L33-L65)

图顶点是动态刚体，边来自两动态端点约束；共同接触固定地板不会强迫所有箱子异色。这不是显式连通分量/睡眠岛系统。

### 11.1 染色冲突并不会自动变安全 Jacobi

shader 在待处理状态上增加 clashes；adapt 之后可以增加轮数或颜色容量。冲突尚未解决时，同色相邻体的就地读写前提不成立，不能把这种状态命名为“安全并行回退”。[染色 shader:149–165](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Coloring/BuildColors.usf#L149-L165) [自适应:7–22](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabAdaptation.h#L7-L22)

这是物理正确性约束，不只是性能指标。零 clashes 也是必要诊断项之一，而非整个引擎正确的充分条件。

## 十二、原问题：保留每刚体六维局部系统

每体更新平移和小角度旋转：

$$
\Delta\mathbf q_i=
\begin{bmatrix}\Delta\mathbf x_i\\\Delta\boldsymbol\theta_i\end{bmatrix},
\qquad
\mathbf H_i\Delta\mathbf q_i=\mathbf g_i
$$

惯性项加上本体 CSR 约束行；单行按下式累加：

$$
\mathbf H_i\mathrel{+}=k\mathbf J\mathbf J^\mathsf T,
\qquad
\mathbf g_i\mathrel{+}=\mathbf J(kC+\lambda)
$$

Acc 保存线、角、交叉块和右端，不建立全场景大矩阵。[局部块:9–24](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabRigidBlock.ush#L9-L24) [Primal:29–110](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Primal/PrimalSolve.usf#L29-L110)

### 12.1 多 lane 并行的是邻接项

1/2/4/8 lane 按颜色桶大小选择，分摊每体 CSR 项；一个流形内部遍历多个点，之后共享内存归约，由 lane 0 解方程和写位姿。[Primal:21–110](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Primal/PrimalSolve.usf#L21-L110)

默认打包阈值仍是 $2^{31}$、$2^{15}$、$2^{12}$，不是所有常见规模下一体一线程。[Step 默认:90–100](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabStepData.h#L90-L100)

### 12.2 LDLᵀ 与四元数

六维 LDLᵀ 手工展开，第二至第六 pivot 下限为：

$$
D_k\leftarrow\max(D_k,10^{-5}H_{kk}),\qquad k=2,\ldots,6
$$

随后位置减去线性解，旋转用负角增量 qadd 更新。没有选主元/线搜索的新算法。[局部块:32–88](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabRigidBlock.ush#L32-L88)

qadd 是小角度一阶积分后归一化，qsub 是 $2\operatorname{vec}(ab^{-1})$，不是精确 log/exp。[数学边界:27–37](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Math/GPUPhysicsLabQuaternionMath.h#L27-L37)

### 12.3 初值不等于惯性目标

默认无额外动力属性时：

$$
\mathbf y=\mathbf x_n+h\mathbf v_n+h^2\mathbf g
$$

没有 $1/2$。startAtRest 仅让慢体从步初位姿开始迭代，目标仍包含重力；它不是睡眠或清零速度。[刚体积分:47–81](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/IntegrateBodies.usf#L47-L81)

## 十三、接触行与对偶：真正共享的求解数学

### 13.1 接触误差不是每轮重新算几何穿透

接触行沿参考 Taylor 形式：

$$
C^*=(1-\alpha)C_0+
\mathbf l\cdot(\Delta\mathbf x_A-\Delta\mathbf x_B)
+(\mathbf r_A\times\mathbf l)\cdot\Delta\boldsymbol\theta_A
+(\mathbf r_B\times(-\mathbf l))\cdot\Delta\boldsymbol\theta_B
$$

球与扩展曲面特征域使用 initial rotation 的力臂，Box/Hull 保持当前旋转规则。这样避免滚动旋转在法向线性化中制造虚假分离。[约束数学:91–135](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabRigidConstraint.ush#L91-L135)

### 13.2 法向与摩擦

$$
\mathbf F=\mathbf k\odot\mathbf C^*+\boldsymbol\lambda,\qquad
F_n\leftarrow\min(F_n,0),\qquad
\|\mathbf F_t\|\le\mu|F_n|
$$

负法向数值表示本实现约定下的承载分支，不是吸力。摩擦是二维向量整体圆锥约束，不是两条轴分别裁成方框。[约束数学:108–126](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabRigidConstraint.ush#L108-L126)

Primal 和 Dual 共用 EvaluateBodyContact，保证单体扩展的摩擦与恢复项在两个阶段使用同一评价函数。[Primal:84–87](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Primal/PrimalSolve.usf#L84-L87) [Dual:15–28](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Dual/DualUpdate.usf#L15-L28)

### 13.3 暖启动、罚参数与材料刚度

跨步乘子乘 $\alpha\gamma$，罚参数乘 $\gamma$ 后夹在数值范围与材料刚度内。硬关节乘子累积，有限刚度与弹簧有自己的分支；不能用一个硬约束公式覆盖全部类型。[关节暖启动:16–77](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabWarmStart.ush#L16-L77)

接触法向实际承载时才增加对应罚参数，切向未超过摩擦边界时才继续加强。massPenalty 从较轻动态质量除以 $h^2$ 给出法向初值下限。[约束数学:137–171](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabRigidConstraint.ush#L137-L171)

### 13.4 塑性、断裂与事件时机

yield 使角向力受限并迁移 rest，breakBend 比较初始 restStart 与当前 rest 的净偏转，fracture 将刚度/乘子归零。它不是累计疲劳或裂纹扩展。[关节暖启动:29–76](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabWarmStart.ush#L29-L76)

GPU 失效约束后，JavaScript/C++ 层回调尚未到达是正常异步现象。不能把“没有收到回调”直接判为“GPU 仍在施加这条关节”。

## 十四、速度、Finalize 与接受版本

### 14.1 从位姿差重建速度

默认质心零时：

$$
\mathbf v_{n+1}=\frac{\mathbf x_{n+1}-\mathbf x_n}{h},
\qquad
\boldsymbol\omega_{n+1}=\frac{\operatorname{qsub}(q_{n+1},q_n)}{h}
$$

质心偏移非零时，代码还加入旋转质心位移对线速度的贡献。vel.w 保存沿 up 的历史速度。[速度更新:7–25](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf#L7-L25)

### 14.2 非有限值检查不修改物理解

UpdateVelocity 检查位姿、惯性目标、速度与四元数有效性；发现非法后用 CAS 记录首错，而不是清速度、强行归零位置或自动重试。[速度更新:26–35](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf#L26-L35)

独立 FinalizeCS 在后续 dispatch 才写 Completed/Accepted 版本；不能让速度 kernel 的线程 0 在其他工作组未结束时宣称整步成功。[速度更新:37–46](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf#L37-L46)

### 14.3 三个版本不应混为一谈

- SubmittedSteps：GT 已提交的步数。
- CompletedSteps：异步状态中确认完成的步数。
- StepStatus[4]：GPU 接受步号。

GT Poll 验证这些数的单调性与范围。显示发布还要把快照版本与状态、Epoch 对齐，而不是只看“GPU buffer 还活着”。[Simulation:1517–1551](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1517-L1551) [发布:43–55](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Display/GPUPhysicsLabPosePublication.cpp#L43-L55)

## 十五、接受状态与失败恢复：必须覆盖的不只是 Body

### 15.1 GPU 备份

每个提交子步开始前，RenderState 在 GPU 内复制当前状态到备份：

- Body、Reference、Status。
- Joint、Grid、Pairs、Hash、Counters、CSR、Colors、Args。
- Contact/Manifold 两代及 ContactWatch 集合/事件。
- 启用时的 Cloth Particle/Spring/Contact/Attachment。

接触 parity、整体流形有效标记和事件 flip 也需要保持一致。[Simulation:400–423](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L400-L423)

只备份 Body、失败后继续使用新 Contact lambda，不能称为同一物理状态的恢复。

### 15.2 失败后先撤销发布，再恢复

Poll 发现传输、版本或 GPU error 后，清观察快照，Revoke 显示并排队 RestoreAccepted；fence 完成后进入 Faulted。当前路径不在原会话中自动改 dt/增迭代重试。[Simulation:1491–1545](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1491-L1545)

工程收益是错误不会被悄悄修值后混入后续正常步；成本是额外 GPU 存储与每步复制。不能将它描述成 three-avbd 原版不存在成本的“免费回滚”。

### 15.3 不能笼统承诺所有错误都已进入拒绝事务

这里要区分代码实际做了什么：

- 曲面 GJK/EPA 失败会设置 $0x100$，SurfaceStatus 将它转换为 StepStatus error=3。[曲面状态:1–10](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Narrowphase/Manifold/SurfaceStatus.usf#L1-L10)
- 非有限刚体结果会进入 StepStatus。[速度更新:26–35](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf#L26-L35)
- 普通 pair/contact/manifold 容量溢出与 coloring clashes，当前读到的链路仍主要写 Counters，并由异步 adapt 处理；Finalize 本身没有统一读取这些计数。[接触历史:29–34](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L29-L34) [自适应:7–22](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabAdaptation.h#L7-L22) [Simulation:2149–2167](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L2149-L2167)

**因此不能把计划里的“所有溢出与冲突均整步拒绝”当成已经逐项证实的运行时保证。** 溢出当步是否丢接触、冲突当步是否破坏并行前提，需要独立失败注入；后续扩容不等于回滚并重算了该步。

同样，多子步批量提交的备份推进、失败步身份与通用版本校验兼容性，都应按真实失败路径验证。局部 rollback 测试不能替代任意阶段、任意批次的事务证明。

## 十六、运行时身份、删除、Reset 与容量

### 16.1 句柄是会话、槽位、代际三元组

Body/Shape/Joint Handle 都包含 Simulation GUID、Slot 和 Generation。删除再复用槽位，不会让旧句柄复活；跨 World 句柄也不能通用。[作者类型:29–94](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h#L29-L94) [Simulation:1578–1619](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1578-L1619)

公共 IsValid 只能检查结构形式；是否仍是当前活对象，还要经过 Simulation 的代际/会话检查。

### 16.2 Body 固定容量与接触容量增长是两回事

CreateRuntimeBody 从 FreeRuntimeBodies 取预留槽，耗尽便拒绝，不自动增长 BodyStorage。Shape 可以共享，但一个 Body 仍只有一个 Shape，不是 Compound 追加接口。[Simulation:1622–1659](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L1622-L1659)

Pair/Contact/Manifold 容量可通过 RequestSceneCapacityGrowth 与 adapt 增长，需重建相关资源和 bind 关系，迁移两代历史并使整体流形缓存失效。[Simulation:500–546、1137–1153、2149–2167](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L500-L2167)

“接触能扩容”不表示“运行时刚体无限增加”。

### 16.3 拓扑编辑不是普通数组修改

删除 Body 会影响关节、形状引用、过滤、历史、显示身份和查询结果。Reset 也不只是将位置数组复制回初始值：旧句柄、事件、已排队回读和 display epoch 都需要失效。

当前代码有相应寿命入口，但历史 P28 明确只验收有界预分配事务；任意动态编辑同时扩容、Hull registry 增长和全部失败注入仍有限制。[P28 验收:1–31](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P28_RESULTS.json#L1-L31)

## 十七、查询与异步读回

### 17.1 CPU 快照只能观察，不能反向驱动物理

诊断、Body、Joint、Raycast、Contact Events 各有请求、RT 回读和 GT 校验流程。它们必须带上请求时身份与版本，防止槽位复用后把旧结果解释成新物体。[Simulation:663–807、1299–1490](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L663-L1490)

读回延迟不能通过每步全量拷回再上传来“修复”，否则会失去 GPU 权威状态并引入旧帧覆盖新帧。

### 17.2 射线不是完整空间查询系统

当前有 Raycast.usf 与最近命中选择/结果阶段；大批量查询是否足够高效、是否覆盖所有混合形状，仍需按具体入口验收。不能从“存在宽相网格”推导“射线已自动沿网格/BVH 加速”。[查询 shader:1 起](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Queries/Raycast.usf#L1)

### 17.3 事件不是同步逐点回调

ContactEvents 对比配对集合给出 begin/end，关节状态回读后解码断裂等结果。通知有缓冲容量、watch 配置和异步延迟，不适合作为每轮 primal 的 CPU 反馈控制环。

## 十八、Niagara 发布：GPU 直读不等于整条链零拷贝

### 18.1 当前发布是不可变快照租约

PosePublication::Prepare：

1. 检查订阅/请求和待处理数量上限。
2. 将 Body 拷贝到不可变 GPU buffer。
3. 提取 pooled buffer；附带活槽索引和 Generation 表。
4. 布料启用时也复制粒子状态。
5. 异步读回 32 字节 status 验证发布版本。

Poll 只有在 error=0、completed=step、accepted=step 且 Epoch 相符时才替换 Accepted。[发布:16–55](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Display/GPUPhysicsLabPosePublication.cpp#L16-L55)

所以它避免了 CPU 中转全部位姿，但**并非像 three-avbd BodyMesh 那样直接把持续改写的仿真 buffer 裸露给显示**。这里确实有 GPU→GPU 全体记录复制和保留多个快照的成本。

### 18.2 为什么值得这个成本

Niagara 可能在不同渲染阶段消费数据；可变 BodyStorage、在途编辑与旧身份若直接组合，容易出现错槽、闪烁或过期资源。不可变 lease 用 Epoch、Step、Slot、Generation 固定一次可观察视图。

**工程取舍**：版本一致性与渲染生命周期安全，交换显存、复制带宽和异步发布延迟。不是简单的“GPU 一定比 CPU 数组显示快”。

### 18.3 不把接口检查当作最终画面验收

GPU DI、CPU 数组显示与用户 Niagara System 资产是三层。函数编译通过、buffer 验证通过，不证明 Burst 数、mesh 轴向、材质、遮挡和实际 PIE 画面都正确。新增只读 Epoch 函数已进入本文冻结提交，但编译/验证通过仍不能替代用户 Niagara 资产的最终画面验收。

## 十九、圆柱与胶囊：独立扩展，不是旧内核复活

### 19.1 两套几何路由，共用一套物理状态

原生 permutation 只处理非曲面对；Surface permutation 只处理至少含一个曲面的 pair，共同输出同一 Manifold/Contact，之后进入同一 CSR/JP/Primal/Dual。[接触历史:44–65](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L44-L65)

没有第二个 SurfaceWorld，也没有 CPU 先生成接触供生产求解的后门。

### 19.2 解析支撑与有界 GJK/EPA

曲面支持函数直接表达有限圆柱和胶囊；解析 sphere、轴线/侧壁、poly 接触分支优先，剩余进入 GJK/EPA。[曲面几何:6–28、184–286、292–338](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush#L6-L338)

进入通用路径前将两体平移到 pair-local origin，降低大世界坐标相减的精度压力。它仍是 f32，不是任意尺度精确计算。[曲面几何:292–315](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush#L292-L315)

当前预算为：

- GJK 最多 64 轮。
- EPA 最多 96 轮。
- 顶点 100、面 196、horizon 边 196。
- 每个 pair 由独占工作组处理自己的共享工作区。

不是旧文档中另一套 EPA 容量。[曲面几何:86–153、317–338](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush#L86-L338) [流形入口:10–19](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Narrowphase/Manifold/UpdateManifolds.usf#L10-L19)

### 19.3 为什么曲面使用单线程工作组

普通原生窄相是 64 线程工作组，每线程一对；Surface permutation 则 numthreads(1,1,1)，用二维 groups 覆盖候选容量，保障一对独占 groupshared EPA arena。[流形入口:10–19](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Narrowphase/Manifold/UpdateManifolds.usf#L10-L19) [窄相调度:51–54](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabUpdateManifoldsCS.cpp#L51-L54)

它不是 64 个 pair 并发写同一个共享多面体。代价是大规模复杂曲面的占用率、共享内存和调度成本必须单独测量。

### 19.4 接触见证与支撑覆盖

EPA 共面面可能由多个三角形组成，投影点未必落在第一个三角形内部；代码寻找真正包含投影点的面，而不是用负重心权重外推表面点。[曲面几何:108–133](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush#L108-L133)

曲面/poly 的 cap 或侧线还会补真实支撑特征点，以免圆柱只凭偏心单点站立。[曲面几何:155–182、330–335](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush#L155-L335)

工程判断：几何相交正确、接触点真实、支撑覆盖充分、跨帧历史稳定是四个层次；多点存在也不能直接证明薄盘长期堆叠已稳定。

## 二十、单体动力属性：默认参考路径之外的明确扩展

### 20.1 质量、主惯量、重力与阻尼

公开 Dynamics 包含 MassKg、InertiaTensorScale、CenterOfMassOffsetCm、Linear/AngularDamping、GravityScale、Restitution 与独立摩擦。[作者类型:118–161](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h#L118-L161)

质量覆盖和主惯量缩放是作者阶段；GPU 使用旁路数据改变惯性项、积分及材料评价。阻尼为：

$$
\mathbf v\leftarrow e^{-dh}\mathbf v
$$

默认 $d=0$，不会暗中加入全局阻尼来稳定参考场景。[刚体积分:47–57](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/IntegrateBodies.usf#L47-L57)

### 20.2 质心偏移不是移动碰撞几何

几何原点仍为 $\mathbf x$，质心为：

$$
\mathbf x_{\mathrm{COM}}=\mathbf x+\mathbf R\mathbf c
$$

线性惯性能量需使用质心运动，因此 Jacobian 带有旋转力臂，线角交叉块不能省略。BodyInertia 增加角向和平移耦合，Integrate/UpdateVelocity 也补质心位移。[动力属性:25–45](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabBodyDynamics.ush#L25-L45) [刚体积分:60–73](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/IntegrateBodies.usf#L60-L73) [速度更新:16–21](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf#L16-L21)

只改一个 COM 展示点，而不改惯性能量、冲量力臂和速度定义，会让这些环节互相矛盾。

### 20.3 静/动摩擦与恢复系数

启用独立摩擦后，两体静/动摩擦分别取几何平均；先检查静摩擦边界，滑动时按动摩擦幅值裁切。恢复系数取双方最大值，法向接近速度超过阈值才加入恢复目标。[材料评价:7–39](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabBodyMaterial.ush#L7-L39)

恢复目标依赖步开始速度，而不是从每轮位姿变化反推新的冲击速度，避免随迭代反复注入回弹。Primal/Dual 必须调用同一材料函数。

**边界**：这不是 three-avbd 原版双摩擦/恢复模型；也不是任意完整非对角惯性张量、轴锁定或 Compound 的实现。

## 二十一、布料：必须按当前 shader 讲，不按计划图讲

### 21.1 实际解法是弹簧质点

ApplySprings 每线程独占一个粒子，遍历全部 Spring，累加自己相连弹簧的力：

$$
\mathbf f_A=
-\left[k(\ell-\ell_0)+d(\mathbf v_A-\mathbf v_B)\cdot\mathbf n\right]\mathbf n
$$

然后 IntegrateParticles 先更新速度，再更新位置：

$$
\mathbf v_{n+1}=\mathbf v_n+h(\mathbf g+m^{-1}\mathbf f),\qquad
\mathbf x_{n+1}=\mathbf x_n+h\mathbf v_{n+1}
$$

这是力基半隐式 Euler 形式；不是逐粒子 $3\times3$ AVBD、不是 XPBD lambda，也没有在刚体 iterations 中反复解这些弹簧。[布料弹簧:10–49](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplySprings.usf#L10-L49) [布料积分:11–38](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/IntegrateParticles.usf#L11-L38)

因此计划中“统一 CSR/JP/Primal/Dual”只能作为后续方向，不能作为现状架构图。

### 21.2 当前接触与反作用

布料粒子扫描所有 Body，只处理内部标签为 Box/Sphere 的形状，选最小 gap 的一体，施加法向罚力和阻尼。厚度进入几何 gap，但没有在此看到布料摩擦锥或多接触集合。[布料接触:26–92](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplyRigidContacts.usf#L26-L92)

反作用 pass 每个动态刚体扫描所有粒子接触，累加反向力与力矩，再更新刚体速度。[布料反作用:18–44](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplyRigidReaction.usf#L18-L44)

这实现了最小双向作用，但不能外推为通用精确动量/角动量守恒：当前接触相对速度使用粒子速度减刚体线速度，角向更新直接除主惯量；复杂旋转刚体、偏移质心与各向异性惯量的兼容性需要单独验证。

### 21.3 附件与生命周期

ApplyAttachments 将粒子放在刚体局部锚点并设置为固定，提供锚点速度。当前这条路径没有反向写刚体；**附件反作用不同于碰撞反作用，不能混称已完成。**[布料附件:10–21](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplyAttachments.usf#L10-L21)

粒子、弹簧、接触与附件已有独立缓冲和 accepted 备份，但其寿命与刚体共用一个 Simulation；关闭布料不产生另一个物理后端。[帧提交:409–442](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L409-L442)

### 21.4 当前复杂度与稳定性限制

设粒子数 $N_p$、弹簧数 $N_s$、刚体数 $N_b$：

- 弹簧力累加约为 $O(N_pN_s)$。
- 粒子—刚体检测约为 $O(N_pN_b)$。
- 刚体反作用收集也约为 $O(N_pN_b)$。

这规避了共享端点浮点原子写入，代价是全扫描。大规模优先优化邻接/候选，而不是只增加线程数。

弹簧积分还受到 $h\sqrt{k/m}$ 等无量纲尺度影响；同一 dt 下无限加大刚度不能获得隐式 AVBD 的稳定性。当前代码也未给出布料自碰撞、撕裂、通用曲面碰撞、连续碰撞或网格布料高规模性能保证。

### 21.5 新增的 30×30 布料场景是什么

冻结提交已增加 cloth/Grid 30x30：900 个粒子、30 点固定边、间距 10cm、跨度 $290\times290$ cm；5102 根弹簧由结构 1740、剪切 1682、隔点距离弯曲 1680 组成。[场景构建:39–73](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLabExamples/Private/Scenes/GPUPhysicsLabReferenceScenes.cpp#L39-L73)

Bending 在这里是隔点距离弹簧，不是二面角能量。该预设没有刚体障碍、没有自碰撞，也未自动生成连续布料网格表面；显示先消费粒子位置。[场景指南:7–18](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/CLOTH_GRID_SCENE.md#L7-L18)

记录的双配置各 7/7 覆盖 120 个 GPU 步、固定边、自由边下落、重启与刚体/布料场景切换；明确没有用户 Niagara 资产、网格表面和最终视觉验收，不构成长时间稳定或规模性能结论。[网格验收:32–71](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/CLOTH_GRID_RESULTS.json#L32-L71)

这比“存在一个布料计划”更进一步，但仍不能写成已交付通用布料引擎。

## 二十二、优化手段与成本：哪些继承，哪些是 UE 新账单

### 22.1 继承参考的主要优化

- 两级网格与 large 旁路降低混合尺度候选压力。
- 动态体负责探测，避免固定体重复遍历。
- 哈希历史、feature/nearest 与局部复用减少冷启动。
- CSR + 稳定邻接降低散乱遍历。
- 增量 JP 与稳定颜色桶保持局部就地求解的并行前提。
- 多 lane 缩短小颜色桶中高 degree 刚体的串行累加链。
- GPU indirect args 避免每阶段 CPU 回读数量。

这些分别位于 [宽相调度:15–100](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabBroadphasePasses.cpp#L15-L100)、[接触历史:19–42](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush#L19-L42)、[拓扑调度:32–93](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabTopologyPasses.cpp#L32-L93)、[染色调度:33–65](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabColoringPasses.cpp#L33-L65)、[Primal:21–110](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Primal/PrimalSolve.usf#L21-L110)。

### 22.2 UE 引入的额外成本

当前每步 GPU 备份不仅有 Body，还包括较大的碰撞/拓扑工作区；启用显示时又生成不可变快照。因此不能将参考 WebGPU 的 solver 毫秒直接乘比例，推算 UE 最终帧耗时。[Simulation:400–423](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp#L400-L423) [发布:16–42](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Display/GPUPhysicsLabPosePublication.cpp#L16-L42)

显存至少拆成：

$$
M_{\mathrm{total}}=
M_{\mathrm{live}}+
M_{\mathrm{backup}}+
M_{\mathrm{display}}+
M_{\mathrm{scratch}}+
M_{\mathrm{readback}}
$$

对比时需报告实际分配容量、快照保留数与扩容峰值，而不是只乘活跃 Body 数。

### 22.3 默认资源绑定也会产生压力

SolverPasses 使用 RDG Blackboard 为一个图复用一份默认 BodyDynamics SRV，避免按迭代/颜色重复创建相同默认资源。[求解调度:22–43](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L22-L43)

这说明 GPU 物理瓶颈可能包含 descriptor、参数块、pass 编码与资源重建，不全是碰撞乘加次数。

### 22.4 稀疏颜色融合是实验性路径

开启后，主循环先做前 16 色，再一次 SparseCS 处理尾部；shader 用共享内存屏障与 DeviceMemoryBarrierWithGroupSync 保证同工作组内后色看到前色 UAV 写入。[求解调度:191–230](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp#L191-L230) [Primal:113–139](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Primal/PrimalSolve.usf#L113-L139)

原版已有真实破坏场景长回放分歧，默认关闭。UE 修正过重复求解尾部与遗漏 UAV 可见性的移植错误，专项通过不能消除参考自身已知风险。[忠实性复核末节][p44] [参考风险说明](/knowledge/three-avbd-gpu-solver/)。

不要为了减少 dispatch 默认打开它，更不能将 groupshared barrier 当作所有 storage/UAV 可见性的替代。

### 22.5 优先优化建议

以下是工程建议，不代表本轮已经改代码：

1. 先确保 overflow=0、clashes=0、几何与版本有效。
2. 分开测宽相、窄相、CSR、染色、Primal/Dual、备份与显示复制。
3. 对高 degree 体观察长尾，不只看平均邻接度。
4. 对布料先替换全扫描数据访问，之后再调线程与共享内存。
5. 对曲面单独测 EPA 轮数、共享内存和失败率，不沿用 Box 的容量/性能结论。
6. 对宿主减少重复 SRV、空 pass、重复快照和无必要回读，但不能牺牲身份与版本保护。
7. 每个优化同时比较物理误差、长期回放、资源峰值与 GPU 时间。

## 二十三、关键参数与调参顺序

### 23.1 先统一入口默认

DefaultStepParams 的基础值为：

- dt=$1/60$，gravity=$-10$。
- alpha=$0.99$，gamma=$0.999$。
- betaLin=$10000$，betaAng=$100$。
- 五个参考策略 matchNearest/faceBias/reuseContacts/startAtRest/massPenalty 开启。
- sparse colors 与整体流形复用默认不在开启位中。
- up 为 Y；reference 播种与 UE 作者边界再显式选坐标框架。

DefaultStepParams 本身没有填全容量，不能直接拿零容量参数派发。[Step 默认:90–100](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabStepData.h#L90-L100)

公开 FreeBodySettings 默认 gravity=-1000 $\mathrm{cm/s^2}$，对应 $-10\ \mathrm{m/s^2}$；不要混入 three-avbd JavaScript World 的 $-9.81$ 默认。[作者设置:191–209](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h#L191-L209)

### 23.2 先调时间和尺度，再调稳定参数

推荐顺序：

1. 验证单位、轴、尺寸、质量/主惯量及运动类型。
2. 固定 dt、substep budget、iterations。
3. 验证候选、法向、点覆盖和接触连续性。
4. 清除容量截断与染色冲突。
5. 在默认 startAtRest、massPenalty 下观察堆叠与质量比。
6. 再调整 alpha/gamma/beta，而不是一开始全部改。
7. 最后调多 lane、颜色轮次、复用策略和可视化频率。

alpha 同时进入稳定化误差和暖启动；gamma 控制跨步历史衰减；beta 控制违反量对应的罚参数增长。它们不是互不相关的三个“硬度滑块”。

### 23.3 编译期常量不是现成编辑器属性

当前常量含：

$$
\mathrm{margin}=0.01\ \mathrm m,\quad
\mathrm{reuseLin}=0.002\ \mathrm m,\quad
\mathrm{reuseAng}=0.002\ \mathrm{rad}
$$

以及 penaltyMin=1、penaltyMax=$10^{10}$、pivotFloor=$10^{-5}$、restSpeed=0.1、nearestFraction=0.05。[内核常量:27–29](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabLimits.h#L27-L29)

这些必须结合运行时入口、shader 构造与 C++ 一致性理解，不能写成它们全已暴露为 WorldSubsystem 的 Blueprint 可调字段。

### 23.4 曲面和布料单独调参

曲面几何 tolerance、EPA 容量/轮数不是 AVBD 的 iterations。增加后者不能解决 EPA 未取得有效见证；增大几何 tolerance 也不能当作稳定性优化。

布料弹簧刚度、接触 stiffness/damping、粒子质量和 dt 属于另一种离散模型。它们不应套用 rigid beta/penaltyMin 的解释。

## 二十四、验证状态：不要把几种清单相互替代

以下全部是本轮读取到的仓库记录，不是重新编译/运行的结果。

### 24.1 P32 的 53 项

P32_RESULTS 记录 Development/DebugGame 各 53/53，通过状态为 ACCEPTED_WITH_LIMITS。清单明确排除 P20，保留 Niagara/Blueprint 人工检查、密集碰撞/跨 GPU 性能等限制。[P32 结果:1–54](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P32_RESULTS.json#L1-L54)

它证明的是那次精确清单，不是“整个插件所有能力全部通过”。

### 24.2 原始 75 项覆盖仍为 66/75

ORIGINAL_GPU_COVERAGE 记录 66 ACCEPTED、9 PORT_REQUIRED。剩余 case index 为 6、33、36、40、47、50、54、60、70。[原始覆盖:1 起](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/ORIGINAL_GPU_COVERAGE.json#L1)

Actor 目录已有 75 个入口，不代表 75 个原断言都完成。60 个可见场景也不能替代逐项算法/API 验证。

### 24.3 217 项扩展回归

BODY_DYNAMICS_RESULTS 记录 2026-10-17 的双配置各 217/217，由原 209 项、两项独立创建和六项动力属性测试组成，记录实际选中 RTX 5060、D3D12/SM6 与报告/二进制指纹。[动力属性结果:1–65、229–233](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/BODY_DYNAMICS_RESULTS.json#L1-L233)

同文件仍明确保留 P20 和原始 75 项剩余九项。217 大于 75，不代表两个集合存在覆盖包含关系。

### 24.4 P20 仍未验收

ReferenceContactHistory 的完整 D3D12 运行记录包含 DXGI_ERROR_DEVICE_REMOVED；按既有决定暂缓，但状态仍为 NOT_ACCEPTED。局部 Hash/匹配检查通过，不能改写为完整历史已稳定。[P20 讲义:57–85](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/Lessons/PORT_LESSON_20.md#L57-L85)

设备移除的根因不能仅从最后出现的 shader 名推断。本文没有新现场，不将它归咎于某个缓存分支，也不以普通场景能运行否定该失败。

### 24.5 布料 rollback 与规模测试的边界

CLOTH07 仅验证独立布料存储在一次注入错误后的恢复，不关闭附件反作用、自碰撞、长时间稳定或规模问题。[布料验收:1–19](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/CLOTH07_RESULTS.json#L1-L19)

P31 测量范围为 free-body/no-collision，只有有限规模与短长期检查，不能外推成密集接触的 RTX 性能预算。[P31 结果:1–21、38–45](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P31_RESULTS.json#L1-L45)

## 二十五、面向项目的诊断顺序

### 25.1 不动：先看入口，不先改求解系数

确认 World 类型为 Game/PIE、BeginPlay 启动成功、配置发生在允许阶段、会话不是 Faulted、Body 是 Simulated、没有误用无碰撞 ConfigureFreeBodies。[World:19–98、134–150](https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/World/GPUPhysicsLabWorldSubsystem.cpp#L19-L150)

再看 submitted/completed/accepted 是否前进；只看 Actor Transform 不一定是在看 GPU 权威位置。

### 25.2 有几何但不碰撞

检查公开形状到内部 tag、曲面 permutation、groups/mask、候选计数和容量。检查 native Hull 是否真的有 atlas 数据，而不是仅在 public enum 选了 ConvexHull。

若 pair 根本没生成，增大 iterations 无效；若 EPA 失败，则属于几何分支，不该用清速度掩盖。

### 25.3 抖动、滑动与穿透

依次检查：

1. overflow / clashes。
2. 法向与 signed gap。
3. 支撑点覆盖与 feature 连续性。
4. stick 锚点和暖启动历史。
5. startAtRest / massPenalty。
6. 时间步、质量比、迭代预算。
7. 非默认 COM、恢复、独立摩擦是否改变模型。

不要在这些没分清前同时增加阻尼、缩小 margin、放宽容差和增迭代。

### 25.4 显示闪烁或槽位错乱

看 Epoch、Slot、Generation、Step 与 accepted lease 是否一致；检查 Reset/删除后的订阅是否撤销，Niagara mesh 轴与 FullSize/Radius 语义是否正确。

GPU 正在模拟不代表显示已消费最新接受版本；CPU 数组延迟也不能当作 GPU 求解错误。

### 25.5 GPU 时间变长或设备错误

先隔离曲面、布料、查询、复制和渲染负载，再分阶段计时。密集曲面 EPA、布料全扫描、颜色小桶长尾、descriptor 压力和显示快照都有不同证据路径。

保留原始 device removed、DRED/验证日志与首次非法状态，不能通过提高 TDR、忽略错误或缩小失败清单制造通过。

## 二十六、最小可落地使用方式

### 26.1 验证最小刚体场景

- 使用同 World 的公开 WorldSubsystem。
- BeginPlay 前配置一个固定 Box 地面与一个动态 Box/Sphere，并预留 Body 容量。
- 使用碰撞会话，而不是 FreeBodies。
- 保留默认时间、AVBD、复用与材料参数。
- 先用只读诊断确认位姿/接触，再接 Niagara。
- 再测试冲量、偏心力、运动学平台、删除/复用、Reset 和重复 Play/Stop。

不要一开始混入曲面、布料、COM 偏移和稀疏融合，否则首次异常难以归因。

### 26.2 在基线成立后扩展

按以下顺序增加：

1. Joint/Spring 与塑性断裂。
2. 原生 Hull 的真实导入数据。
3. Cylinder/Capsule，验证局部轴与真实尺寸。
4. 非默认 Dynamics。
5. 布料最小粒子/弹簧/Box-Sphere 接触。
6. 目标规模、回放、资源生命周期和显示资产验收。

这些步骤是工程建议，不代表本文替用户完成了 UE 运行验证。

## 二十七、总结：哪些可确认，哪些仍开放

### 27.1 当前可以确认

- 唯一 World/Simulation/RenderState，而非并排保留旧后端。
- 刚体核心继承锁定 three-avbd GPU 数值路径。
- Body160、Joint160、Manifold32、Contact64、Params192。
- 两级哈希、原生 SAT/解析几何与接触历史。
- CSR、JP、逐色局部六维原问题和对偶。
- GT 作者输入、RT 资源所有权、GPU 权威物理。
- GPU 接受状态、异步观察与不可变 Niagara 发布。
- 圆柱/胶囊、单体 Dynamics、弹簧质点布料属于明确扩展。

### 27.2 不能据此宣称

- 所有原始 API/算法测试已完全移植。
- 所有 overflow/clashes 都统一整步拒绝。
- P20 设备问题已经关闭。
- 任意曲面、尺度、薄盘密集堆叠长期稳定。
- 布料已采用统一 AVBD、完整摩擦/自碰撞或通用曲面接触。
- Chaos 自动双向耦合、网络复制、跨设备确定性。
- ES3.1、所有 Metal 设备、Cook/Shipping 全面兼容。
- GPU 显示完全零拷贝、目标大规模性能已经达标。

### 27.3 最重要的工程原则

**参考算法、宿主适配和新增物理域必须分别解释、分别测试。**

一个几何夹具通过，不等于完整步正确；完整步正确，不等于身份/资源生命周期正确；版本发布正确，不等于长期稳定或性能达标。GPUPhysicsLab 的学习价值，恰好在于可以沿着这些边界逐层检查，而不是把“借鉴 three-avbd”写成一个无法验证的标签。

## 源码索引与固定版本

路径相对于 E:\UnrealProjects\GASP57\Plugins\GPUPhysicsLab。正文行号属于本次读取版本，固定链接指向本文标注 HEAD；分析期间产生的新提交已单独复核，后续增量不作为这些链接的证明。课程 JSON 是历史证据，不是本轮测试输出。

- P00：[GPUPhysicsLab.uplugin][p00] — 模块与插件依赖。
- P01：[Doc/Porting/REFERENCE.lock.json][p01] — 参考提交、范围和默认。
- P02：[Source/GPUPhysicsLab/Private/World/GPUPhysicsLabWorldSubsystem.cpp][p02] — World 生命周期与配置。
- P03：[Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp][p03] — 提交、输入、状态、回滚、寿命。
- P04：[Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp][p04] — 完整 RDG 求解主链。
- P05：[Source/GPUPhysicsLab/Private/Math/GPUPhysicsLabQuaternionMath.h][p05] — 单位、换基、四元数。
- P06：[Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h][p06] — 公开形状、身份、动力属性与设置。
- P07：[Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabLimits.h][p07] — ABI 常量与内核标签。
- P08：[Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabBodyData.h][p08] — Body 与 Dynamics 布局。
- P09：[Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabStepData.h][p09] — Step 布局与默认。
- P10：[Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabBroadphasePasses.cpp][p10] — 网格和候选调度。
- P11：[Shaders/Private/Narrowphase/Manifold/UpdateManifolds.usf][p11] — 哈希与两类窄相入口。
- P12：[Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush][p12] — 接触历史及几何路由。
- P13：[Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSequencePasses.cpp][p13] — RDG scan。
- P14：[Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabColoringPasses.cpp][p14] — 颜色与间接参数调度。
- P15：[Shaders/Private/Common/Solver/GPUPhysicsLabRigidConstraint.ush][p15] — 关节与接触数学。
- P16：[Shaders/Private/Common/Geometry/GPUPhysicsLabRigidBlock.ush][p16] — 六维块与 LDLᵀ。
- P17：[Shaders/Private/Simulation/Integration/UpdateVelocity.usf][p17] — 速度与 Finalize。
- P18：[Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabTopologyPasses.cpp][p18] — CSR 调度。
- P19：[Shaders/Private/Solver/Coloring/BuildColors.usf][p19] — JP 与颜色桶。
- P20：[Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabAdaptation.h][p20] — 计数自适应。
- P21：[Source/GPUPhysicsLab/Private/Display/GPUPhysicsLabPosePublication.cpp][p21] — 不可变显示版本。
- P22：[Shaders/Private/Solver/Primal/PrimalSolve.usf][p22] — 多 lane 与稀疏尾部。
- P23：[Shaders/Private/Simulation/Integration/IntegrateBodies.usf][p23] — 惯性目标与初值。
- P24：[Shaders/Private/Cloth/ApplySprings.usf][p24] — 布料弹簧力。
- P25：[Shaders/Private/Cloth/IntegrateParticles.usf][p25] — 布料积分。
- P26：[Shaders/Private/Cloth/ApplyRigidContacts.usf][p26] — 布料法向接触。
- P27：[Shaders/Private/Cloth/ApplyRigidReaction.usf][p27] — 布料反作用。
- P28：[Shaders/Private/Common/Solver/GPUPhysicsLabWarmStart.ush][p28] — 关节暖启动、对偶与塑性。
- P29：[Shaders/Private/Solver/Dual/DualUpdate.usf][p29] — 统一刚体约束对偶派发。
- P30：[Source/GPUPhysicsLab/GPUPhysicsLab.Build.cs][p30] — 模块依赖。
- P31：[Shaders/Private/Broadphase/Sort/ScanBlocks.usf][p31] — 分块前缀和。
- P32：[Shaders/Private/Narrowphase/Manifold/SurfaceStatus.usf][p32] — 曲面失败状态。
- P33：[Shaders/Private/Queries/Raycast.usf][p33] — 射线查询。
- P34：[Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush][p34] — 曲面解析支撑与 GJK/EPA。
- P35：[Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabUpdateManifoldsCS.cpp][p35] — 原生和曲面窄相调度。
- P36：[Shaders/Private/Common/Solver/GPUPhysicsLabBodyDynamics.ush][p36] — 质心耦合与默认动力属性。
- P37：[Doc/Porting/P28_RESULTS.json][p37] — 有界事务历史验收。
- P38：[Shaders/Private/Common/Solver/GPUPhysicsLabBodyMaterial.ush][p38] — 静动摩擦和恢复。
- P39：[Shaders/Private/Cloth/ApplyAttachments.usf][p39] — 布料附件。
- P40：[Doc/Porting/P32_RESULTS.json][p40] — P32 验收范围。
- P41：[Doc/Porting/BODY_DYNAMICS_RESULTS.json][p41] — 217 项历史记录与限制。
- P42：[Doc/Porting/ORIGINAL_GPU_COVERAGE.json][p42] — 原始75项覆盖。
- P43：[Doc/Porting/Lessons/PORT_LESSON_20.md][p43] — P20未验收。
- P44：[Doc/Porting/P02_P32_FIDELITY_AUDIT_20261017.md][p44] — 忠实性复核与后续纠正。
- P45：[Doc/Porting/CLOTH07_RESULTS.json][p45] — 布料错误回滚验收范围。
- P46：[Doc/Porting/P31_RESULTS.json][p46] — 性能记录与范围。
- P47：[Doc/Porting/CLOTH_GRID_RESULTS.json][p47] — 30×30 网格历史验收。
- P48：[Source/GPUPhysicsLabExamples/Private/Scenes/GPUPhysicsLabReferenceScenes.cpp][p48] — 900 粒子与5102弹簧构建。
- P49：[Doc/Porting/CLOTH_GRID_SCENE.md][p49] — 布料显示与使用边界。
- P50：[Shaders/Private/Broadphase/Pairs/GenerateCandidatePairs.usf][p50] — 网格探测与候选过滤。
- P51：[Shaders/Private/Common/Geometry/GPUPhysicsLabConvexSAT.ush][p51] — 原生 Box/Hull SAT。
- P52：[Shaders/Private/Common/Contact/GPUPhysicsLabPolyhedronClipping.ush][p52] — 多点裁剪与边接触。

[p00]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/GPUPhysicsLab.uplugin
[p01]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/REFERENCE.lock.json
[p02]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/World/GPUPhysicsLabWorldSubsystem.cpp
[p03]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabSimulation.cpp
[p04]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSolverPasses.cpp
[p05]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Math/GPUPhysicsLabQuaternionMath.h
[p06]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Public/Bodies/GPUPhysicsLabBodyDefinition.h
[p07]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabLimits.h
[p08]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabBodyData.h
[p09]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/GPUData/GPUPhysicsLabStepData.h
[p10]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabBroadphasePasses.cpp
[p11]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Narrowphase/Manifold/UpdateManifolds.usf
[p12]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabContactHistory.ush
[p13]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabSequencePasses.cpp
[p14]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabColoringPasses.cpp
[p15]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabRigidConstraint.ush
[p16]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabRigidBlock.ush
[p17]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/UpdateVelocity.usf
[p18]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabTopologyPasses.cpp
[p19]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Coloring/BuildColors.usf
[p20]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Simulation/GPUPhysicsLabAdaptation.h
[p21]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/Display/GPUPhysicsLabPosePublication.cpp
[p22]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Primal/PrimalSolve.usf
[p23]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Simulation/Integration/IntegrateBodies.usf
[p24]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplySprings.usf
[p25]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/IntegrateParticles.usf
[p26]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplyRigidContacts.usf
[p27]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplyRigidReaction.usf
[p28]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabWarmStart.ush
[p29]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Solver/Dual/DualUpdate.usf
[p30]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/GPUPhysicsLab.Build.cs
[p31]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Broadphase/Sort/ScanBlocks.usf
[p32]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Narrowphase/Manifold/SurfaceStatus.usf
[p33]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Queries/Raycast.usf
[p34]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabSurfaceCollision.ush
[p35]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLab/Private/CSDispatch/GPUPhysicsLabUpdateManifoldsCS.cpp
[p36]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabBodyDynamics.ush
[p37]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P28_RESULTS.json
[p38]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Solver/GPUPhysicsLabBodyMaterial.ush
[p39]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Cloth/ApplyAttachments.usf
[p40]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P32_RESULTS.json
[p41]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/BODY_DYNAMICS_RESULTS.json
[p42]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/ORIGINAL_GPU_COVERAGE.json
[p43]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/Lessons/PORT_LESSON_20.md
[p44]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P02_P32_FIDELITY_AUDIT_20261017.md
[p45]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/CLOTH07_RESULTS.json
[p46]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/P31_RESULTS.json
[p47]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/CLOTH_GRID_RESULTS.json
[p48]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Source/GPUPhysicsLabExamples/Private/Scenes/GPUPhysicsLabReferenceScenes.cpp
[p49]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Doc/Porting/CLOTH_GRID_SCENE.md
[p50]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Broadphase/Pairs/GenerateCandidatePairs.usf
[p51]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Geometry/GPUPhysicsLabConvexSAT.ush
[p52]: https://github.com/NiteFlightxx/GPUPhysicsLab/blob/779b2e09cc531d39d8d2ad7d5813823cc5c26bd6/Shaders/Private/Common/Contact/GPUPhysicsLabPolyhedronClipping.ush
