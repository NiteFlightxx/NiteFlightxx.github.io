---
title: "AircraftLab：动力学、飞控与仿真架构"
excerpt: "沿任务意图到旋翼与物理后端的链路，分析 PID、预测跟踪、ORCA、LOD 与网络边界。"
date: "2026-10-13"
category: "Physics"
subtopic: "FlightController"
tags: ["飞控", "Chaos", "Autopilot", "PID", "MPCC", "ORCA"]
readTime: "阅读约40分钟"
kind: "algorithm"
level: "advanced"
prerequisites: ["quadcopter-basics-interactive", "classical-mechanics", "differential-equations", "iterative-linear-solvers"]
nextArticles: []
pageType: "source-analysis"
aliases: ["AircraftLab","无人机飞控","Flight Controller","MPCC","ORCA","AircraftLab 无人机插件技术详解 — 物理、飞控、自动驾驶、Simulation LOD 与网络同步"]
featured: true
---

AircraftLab 的控制链需要区分任务意图、低频路径规划、周期性预测跟踪和短周期局部避障。本文沿插件实际数据流解释它们如何进入串级飞控、旋翼分配与物理后端，并保留源码证据和工程取舍。推力与姿态的直观关系见[四旋翼原理](/knowledge/quadcopter-basics-interactive/)，不会用参考框架替代插件事实。

## 先给结论

AircraftLab 当前不是一个“目标点直接变成力”的单层控制器，而是把任务意图、可达性、路径进度、预测参考、串级飞控和执行器响应拆成多个有明确所有权的阶段：

```text
AI / Blueprint / Pilot / Navigation Provider
        ↓
FAircraftMovementIntent + Revision
        ↓
FAircraftMotionPlan
  ├─ 空间路径、曲率、速度包络、刹车距离
  └─ TimedTrajectory / Velocity / Hold / Route / Orbit
        ↓
FAircraftTrajectoryRuntime
  ├─ 进度调节、路径投影、走廊校验
  ├─ 导航引导快照（可包含 ORCA 输出）
  └─ FAircraftMpccController
        ↓
轨迹参考 p / v / a / yaw
        ↓
串级飞控
  位置 → 速度 → 加速度 / 姿态 → 角速度 → wrench
        ↓
阻尼伪逆 + 主动集控制分配
        ↓
旋翼指令 → 指令限速 → RPM 一阶响应 → 推力 / 反扭矩
        ↓
Chaos 物理子步施加力和力矩
        ↓
状态、诊断、性能窗口写回 Game Thread
```

最重要的边界有七条：

1. **源码事实**：`FAircraftMpccController` 是有限时域加速度修正器，具备滚动预测、代价梯度、约束投影和时间预算；当前源码不足以称为带路径进度联合决策变量的完整 MPCC。
2. **源码事实**：PID 是位置、速度、姿态参考和角速度的串级结构，具有参考前馈、阻尼前馈、输出限幅、积分限幅、条件积分和跟踪式 Anti-Windup。
3. **源码事实**：控制分配把四维归一化 wrench 映射到任意旋翼拓扑，使用阻尼伪逆法方程和主动集饱和处理；它不是通用二次规划器。
4. **源码事实**：ORCA 求解器是独立的 3D 速度可行域求解器，包含机间相对速度约束、垂直能力面、走廊胶囊和确定性排序。源码搜索未发现它被 `FAircraftSimulationProxy::TickPhysicsThread` 直接调用；通常由导航层生成 `FAircraftNavigationGuidance` 后再交给轨迹运行时。
5. **源码事实**：Flight Controller 在 Chaos 异步物理子步运行；Kinematic 和 PhysicsConstraint 由 `UAircraftComponent` 的 Game Thread 路径执行，三种后端共用轨迹运行时，但执行权限和状态边界不同。
6. **工程取舍**：规划层负责“可达、平滑、能刹住”，内环负责“在当前权限下跟踪”。把两者合并成一个大优化器会增加线程、预算和故障传播成本。
7. **待运行时验证**：网络环境下客户端到底采用服务器复制、客户端默认物理，还是本地 LOD 的组合，取决于场景中 `bAuthoritySimulationOnly`、复制策略和当前 LOD 资产配置，不能只凭这篇文章静态判定最终观感。

本文只写当前插件源码能证明的内容。标记为“工程经验”的段落是调参建议；标记为“待验证”的段落需要在真实场景、指定物理步长和网络配置下测试。

## 学习位置与边界

- 前置：[四旋翼飞行原理：动力学与交互演示](/knowledge/quadcopter-basics-interactive/)
- 数学基础：[经典力学三大体系](/knowledge/classical-mechanics/)、[常微分方程与数值方法](/knowledge/differential-equations/)、[迭代线性求解器](/knowledge/iterative-linear-solvers/)
- 相关：[Jacobian 矩阵](/knowledge/jacobian-matrix/)、[PBD / XPBD](/knowledge/pbd-xpbd-math/)、[VBD / AVBD](/knowledge/vbd-avbd-math/)

本文关注 `E:\UnrealProjects\GASP57\Plugins\AircraftLab` 当前源码，不把真实飞控、适航控制律或完整机器人 MPC 论文直接当成插件已实现能力。无人机的升力、刚体和基础 PID 只引用前置专题，本文把重点放在插件如何组织这些模块、在哪个线程执行、哪些参数互相制约，以及为什么选择当前方案。

## 一、插件解决什么问题

AircraftLab 的核心任务是：在 Unreal 的游戏运行时里，把多种上层输入统一成对旋翼或替代驱动后端可执行的运动表现。输入可以是：

- `Hold`：保持或移动到位置；
- `Velocity`：给定世界系或控制航向系速度；
- `Route`：沿折线或安全走廊飞行；
- `Orbit`：围绕中心生成闭合空间路径；
- `TimedTrajectory`：直接提供带时间、位置、速度、加速度和偏航的轨迹。

这些枚举、速度坐标系、航向模式和到达模式定义在 `AircraftMovementIntent.h:10-42`。请求侧限制包括最大速度、加速度、减速度、jerk、爬升率、下降率和偏航动态，默认值位于 `AircraftMovementIntent.h:72-110`。它们是任务的软限制；物理质量、推力、倾角和有效旋翼权限形成更高优先级的实时硬能力。

插件**不解决**以下问题：

- 它不是全局路径规划器，不会自动为任意静态障碍物搜索世界路径；
- ORCA 只提供速度约束和局部避让原语，不替代导航网格或全局规划；
- 当前 `FAircraftMpccController` 不是带全状态、路径进度和约束乘子的通用非线性 MPCC 框架；
- 控制分配不是带完整不等式约束和权重矩阵的通用 QP；
- 网络复制不会自动让不同客户端的 Chaos 浮点积分逐位确定；
- LOD 切换不会自动解决所有动画、碰撞和网络观感问题。

## 二、从意图到 Chaos 的完整执行链

### 1. 意图提交与 Revision

`UAutopilotComponent` 在 `BeginPlay` 时解析飞行控制器并注册为意图提供者，组件 tick 位于 `TG_PrePhysics`（`AutopilotComponent.cpp:47-63`）。调用 `SubmitIntent` 会检查控制权、结束被替换任务、保存 `ResolvedIntent`，增加 revision，并广播 `Accepted`（`AutopilotComponent.cpp:274-317`）。Actor 目标在 `ResolveActorTargets` 中拷贝为位置快照；目标移动只有超过配置阈值才触发新的 revision（`AutopilotComponent.cpp:384-484`）。

每个物理子步不应重新解释一遍蓝图对象。`UAircraftComponent::TickComponent` 只负责刷新 Provider 并把意图推入 Proxy（`AircraftComponent.cpp:2401-2433`）；Proxy 通过临界区保存待消费意图和 revision（`AircraftSimulationProxy.cpp:725-744`）。因此，**意图 ID、revision、计划 revision 和状态 sequence 必须在跨线程传递时保持一致**。

### 2. 能力快照

物理子步先读取当前 Chaos 刚体的位姿、线速度、角速度、质量、惯量、阻尼和质心，然后基于当前 LOD、旋翼权限和后端限制构造 `FAircraftDynamicCapabilitySnapshot`。Flight Controller 会把总推力权限、最大倾角和正负 Roll/Pitch/Yaw 权限写入能力快照（`AircraftSimulationProxy.cpp:1993-2028`）；旋翼响应时间也会从当前旋翼电机参数聚合（`AircraftSimulationProxy.cpp:2231-2242`）。

这一步的意义是：规划器不会只看到“配置里允许 400 cm/s²”，还会看到当前旋翼失效、质量、倾角或约束力矩是否让这个数真实可达。

### 3. 计划构建与重建

`FAircraftMotionPlan::Build` 先校验 Intent、运行时配置和能力快照，再按类型选择 `BuildHoldPlan`、`BuildSpatialPlan`、`BuildTimedPlan` 或持续速度模式（`AircraftMotionPlan.cpp:709-751`）。空间路径会按采样间距建立样本，结合曲率、推力、倾角、阻力、垂直率和偏航率限制生成速度包络（`AircraftMotionPlan.cpp:280-425`）。Stop 路径还会把旋翼响应延迟和 jerk 建立时间加入最大停止速度计算（`AircraftMotionPlan.cpp:492-520`）。

计划不是只存位置点。每个样本至少包含时间、弧长、位置、速度、加速度、偏航和偏航率；`Evaluate` 在相邻样本间插值，空间计划的加速度由该时间区间的速度斜率得到，而不是简单混合端点加速度（`AircraftMotionPlan.cpp:764-822`）。

### 4. 路径投影与进度

对 Route / Orbit，当前状态会投影到空间路径。`Project` 先调用 `SpatialPath.Project`，再用弧长转时间并恢复切线方向（`AircraftMotionPlan.cpp:844-866`）。MPCC 只允许进度按当前速度和加速度能力推进；若检测到位移超过可达范围，则进行全局恢复并清空旧的修正 horizon（`AircraftMpccController.cpp:718-785`）。这避免传送、重生或物理重建后继续沿用旧优化状态。

### 5. 预测跟踪与轨迹参考

`FAircraftTrajectoryRuntime::UpdateFlightController` 调用 `MpccController.Update`，拿到 nominal / final reference，随后应用导航引导、航向动态和诊断（`AircraftTrajectoryRuntime.cpp:378-432`）。输出参考包含：

```text
PositionCm
VelocityCmPerSec
AccelerationCmPerSecSq
ControlAccelerationCmPerSecSq
DynamicsFeedForwardAccelerationCmPerSecSq
YawDegrees / YawRateDegPerSec
PathProgress / RouteProgress
```

参考不是每个物理子步都重新求解。`FAircraftMpccController::Update` 在上一次 reference 仍新鲜且尚未到下一次 solve 时间时，直接复用 reference；空间计划只更新名义位置、速度、加速度的时间采样（`AircraftMpccController.cpp:1388-1427`）。这是实时预算的重要来源，也是“MPCC 频率”和“物理步频”分离的原因。

### 6. 串级飞控

Flight Controller 后端在每个物理子步依次调用垂直控制、期望姿态、航向设定、期望角速度和机体力矩命令（`AircraftSimulationProxy.cpp:2384-2411`）。自动驾驶参考和手动摇杆共用低层 PID，但输入语义不同：

- 有位置参考时，位置环输出期望速度；
- 有速度参考时，位置环复位，直接进入速度环；
- 速度环输出水平加速度，随后由悬停倾斜关系生成姿态；
- 期望姿态和航向参考生成角速度；
- 角速度环输出归一化轴命令；
- 垂直路径单独使用高度 / 垂直速度环生成总距。

### 7. 控制分配与旋翼执行

`FAircraftControlAllocator::Allocate` 把总距和三个轴命令构造成四维 wrench，先进行倾斜补偿，再求解旋翼推力分数（`ControlAllocator.cpp:224-275`）。分配结果经过饱和、效能和电机逆模型后写入 `CommandBuffer`，Proxy 再更新每个旋翼 runtime state（`AircraftSimulationProxy.cpp:2417-2467`）。

### 8. Chaos 注入与写回

每个旋翼的推力沿机体旋翼轴施加，偏心力矩用真实质心计算，反扭矩用旋向符号施加（`AircraftSimulationProxy.cpp:2469-2499`）。该调用发生在 `TickPhysicsThread`，其 Physics Handle 只在当前子步获取和消费；`AsyncPhysicsTickComponent` 负责把真实 Chaos 异步固定步长转发给 Proxy（`AircraftComponent.cpp:2528-2544`）。最后 Proxy 将状态、参考、分配诊断、旋翼输出和性能窗口写入受保护快照，Game Thread 通过 getter 读取（`AircraftSimulationProxy.cpp:2514-2553`）。

## 三、坐标、单位和动力学边界

### 单位

- Unreal 世界长度使用厘米；运动意图速度是 `cm/s`，加速度是 `cm/s²`，jerk 是 `cm/s³`。
- 旋翼物理参数的推力使用牛顿，力矩使用牛顿米。
- 控制器角速度和角度使用度制；Chaos 原生角速度读取为弧度每秒，然后转换为控制坐标。
- 控制分配构造力矩时把质心力臂从厘米转换为米，见 `ControlAllocator.cpp:38-57`。

### 坐标和航向

`FAircraftMovementIntent` 允许速度在世界系或 `ControlHeading` 系表达（`AircraftMovementIntent.h:20-25`）。控制航向速度不能直接使用实测 yaw，否则姿态扰动会反馈到速度目标；Trajectory Runtime 在存在 yaw reference 时使用 reference yaw 构造规划坐标（`AircraftTrajectoryRuntime.cpp:404-417`）。

航向模式包括保持、固定角、面向速度、面向目标和偏航率；空间计划在速度为零的起点和终点仍从几何切线推导 `FaceVelocity` 航向，避免起步时先保留旧航向、随后突然转向（`AircraftMotionPlan.cpp:427-460`）。

## 四、串级 PID：不是一个大 PID

### 1. 单环离散形式

`FAircraftPidState` 的位置式实现为：

$$
e_k = r_k - y_k
$$

$$
I_k = \operatorname{clamp}\left(I_{k-1} + e_k\Delta t,\,-I_{\max},\,I_{\max}\right)
$$

$$
D_k = \operatorname{LPF}\left(\frac{e_k-e_{k-1}}{\Delta t}\right)
$$

$$
u_k = K_p e_k + K_i I_k + K_d D_k + K_{ff} f_k
$$

这些步骤以及输出限幅、饱和时回退积分增量见 `FlightControlPid.h:7-99`。当使用 `UpdateFromMeasurement` 时，D 项改为：

$$
D_k = \operatorname{LPF}\left(\dot r_k - \frac{y_k-y_{k-1}}{\Delta t}\right)
$$

这样移动轨迹可以提供参考速度，重规划造成的位置设定值跳变不会制造微分冲击；源码见 `FlightControlPid.h:101-149`。

### 2. 水平位置环和速度环

当 `TrajectoryReference.bPositionTrackingEnabled` 为真时，位置环把参考位置转换为期望速度，并使用参考速度作为前馈 / 微分基准；随后速度环把速度误差转换成水平加速度（`FlightControlSolver.cpp:779-832`）。速度环会先合并轨迹加速度和阻力前馈，再施加水平加速度、减速度和最大倾角限制（`FlightControlSolver.cpp:680-744`）。

水平限幅不是两个独立标量限幅后的简单拼接。源码在共享二维向量限幅后，把“请求加速度”和“实际可达加速度”送入 `ApplyTrackingAntiWindup`，防止持续速度误差让两个积分器在倾角圆盘后面继续累积（`FlightControlSolver.cpp:712-737`）。

### 3. 垂直环

自动驾驶路径下，高度环根据参考位置产生垂直速度，垂直速度环产生总距偏移；轨迹自身已经提供动力学补偿时，不再重复计算相同的阻尼前馈（`FlightControlSolver.cpp:227-259`）。手动路径则在松杆后先把速度降到零，再锁定当前高度，避免松杆瞬间冻结旧高度造成反向拉回（`FlightControlSolver.cpp:262-313`）。

### 4. 姿态参考和角速度环

水平加速度通过重力和最大倾角转换成控制世界旋转（`FlightControlSolver.cpp:317-341`）。如果启用姿态参考模型，Roll/Pitch 的倾转动态由 `FAircraftAttitudeReferenceDynamics` 负责；Yaw 由独立的 `FAircraftYawReferenceDynamics` 负责，避免两个有状态 yaw 回路互相追逐（`FlightControlSolver.cpp:443-544`）。

角速度环使用期望角速度和实测机体系角速度的误差，加入角阻尼前馈并输出三个归一化轴命令（`FlightControlSolver.cpp:588-669`）。角速率配置默认 `Kff=0`，阻尼前馈通过外部通道以 `Kff=1` 注入；配置映射见 `FlightControllerRuntimeConfig.h:107-155`。

### 5. Anti-Windup 的两层含义

第一层是单 PID 输出已经饱和时回退本帧积分增量；第二层是下游共享向量限幅或控制分配造成实际输出小于请求时，使用 tracking anti-windup：

$$
\Delta I_{track} = \frac{(u_{achieved}-u_{requested})\,K_{track}\,\Delta t}{K_i}
$$

源码把修正限制在不跨越零积分的方向，并重新应用积分限幅（`FlightControlPid.h:151-181`）。控制分配之后，如果物理受击 / 干扰又削弱了 torque 或 collective，Proxy 还会调用 `ApplyInterferenceAntiWindup` 冻结不能继续增长的外环积分（`AircraftSimulationProxy.cpp:2429-2445`）。

### 6. 前馈不能重复计算

当前有三类前馈：

1. **轨迹运动学前馈**：计划样本的加速度；
2. **动力学前馈**：根据速度、姿态和阻力模型估算抵消阻力所需的加速度；
3. **执行器 / 参考动态前馈**：姿态参考模型和旋翼响应对目标的提前量。

Trajectory Runtime 和 MPCC 会把动力学前馈写入 `DynamicsFeedForwardAccelerationCmPerSecSq`；飞控消费该值时不再重复计算同一份阻尼项（`AircraftTrajectoryRuntime.cpp:609-615`、`FlightControlSolver.cpp:824-831`）。重复加阻力补偿的常见结果是高速段持续过冲、积分反向卸载或终点前制动不足。

## 五、空间路径、时间参数化与安全走廊

### 路径几何

`BuildSpatialPlan` 将 Route 或 Orbit 转换为空间路径。Orbit 当前生成 64 个闭合点（`AircraftMotionPlan.cpp:286-306`）。空间样本根据路径长度和 `SampleSpacingCm` 决定数量；每个点保存切线、曲率、距离和路线距离。

### 速度包络

路径上的速度上限不是固定巡航速度。源码会同时检查：

- 曲率产生的法向加速度；
- 阻力和可用推力；
- 最大倾角；
- 质量与总推力权限；
- 水平速度、爬升率、下降率；
- 偏航率对路径通过速度的约束。

例如曲率约束的基本关系是：

$$
\|a_n\| = \|\kappa\|v^2
$$

源码把该关系与阻力、推力和倾角限制组合后，用二分搜索得到当前路径位置的可行速度（`AircraftMotionPlan.cpp:344-425`）。工程上，这比“先用最大速度规划，再让 PID 自己刹车”更不容易在急转弯或终点发生滑出。

### Stop 与 PassThrough

`PassThrough` 只限制终点速度；`Stop` 需要沿切线把速度降到零。Stop 的速度包络会计算：

$$
d_{stop} = d_{brake}(v,a) + v\,t_{delay}
$$

其中 $t_{delay}$ 包括 jerk 建立和旋翼响应。当前实现通过 `ComputeBrakingDelaySeconds` 与 `ComputeMaximumStoppingSpeedCmPerSec` 进入样本速度上限（`AircraftMotionPlan.cpp:492-520`），之后 MPCC 还会在实际速度已经超过停止包络时增加切向安全制动（`AircraftMpccController.cpp:1190-1261`）。

### 安全走廊

`FAircraftSafeCorridorSegment` 描述轴线起点、终点、半径和沿路径距离（`AircraftMovementIntent.h:219-235`）。走廊不是碰撞检测器，而是规划和预测跟踪的软 / 硬约束参考：MPCC 代价使用走廊修正，最终发布前再次滚动预测并记录 `PredictedCorridorViolationCm`（`AircraftMpccController.cpp:1263-1318`）。实际静态碰撞仍需由项目导航、Sweep 或物理碰撞系统提供。

## 六、MPCC 风格预测跟踪

### 1. 为什么使用预测修正

纯 PID 只看当前误差，无法提前处理旋翼响应延迟、jerk 限制、急停距离和走廊边界。当前实现让计划提供名义加速度，然后在有限 horizon 上寻找较小的修正，使预测位置、速度和走廊误差变小，同时抑制控制变化。

### 2. 预测模型

`RolloutHorizon` 对每个离散步执行：

$$
a_i^{cmd} = \Pi_{cap}\left(\Pi_{limit}(a_i^{ref}+\delta a_i)\right)
$$

$$
a_{i+1}^{real} = (1-\alpha_i)a_i^{real}+\alpha_i a_i^{cmd}
$$

$$
p_{i+1}=p_i+v_i\Delta t+\frac{1}{2}a_{i+1}^{real}\Delta t^2,
\qquad
v_{i+1}=v_i+a_{i+1}^{real}\Delta t
$$

先应用任务和能力加速度投影，再应用 jerk 限制、阻力补偿和总推力 / 倾角投影；$alpha_i$ 根据旋翼上升 / 下降响应时间计算（`AircraftMpccController.cpp:504-545`）。

### 3. 代价函数

当前代价由轮廓误差、切向滞后误差、速度误差、终端误差、修正大小、加速度正则和 jerk 正则构成，可概括为：

$$
J = \sum_i \left(
w_c\|e_{contour,i}\|^2
w_l\|e_{lag,i}\|^2
w_v\|e_{velocity,i}\|^2
w_a\|\delta a_i\|^2
w_r\|a_i\|^2
w_j\|a_i-a_{i-1}\|^2
w_{corr}\|e_{corridor,i}\|^2
\right)
$$

终点位置和速度权重只在 horizon 最后一步加入。源码计算代价见 `AircraftMpccController.cpp:1034-1089`，反向伴随梯度见 `AircraftMpccController.cpp:1107-1144`。

### 4. 求解策略和预算

源码把 `ControlCorrectionHorizon` 作为带 warm start 的修正数组，最多执行 `MaxOptimizationIterations` 次；每次超过 `SolveTimeBudgetMilliseconds` 就退出（`AircraftMpccController.cpp:1017-1052`）。如果新代价变差，恢复上一次修正；如果改善低于相对容差或步长足够小，也提前结束（`AircraftMpccController.cpp:1091-1105`、`1146-1165`）。

因此它的计算预算可以写成：

$$
T_{solve} \leq T_{budget},
\qquad
N_{iter} \leq N_{max}
$$

这保证了实时性，但也意味着一次 solve 可能只完成有限次梯度更新，不能把结果理解为全局最优。

### 5. 为什么称为“MPCC 风格”

源码有以下 MPCC 风格元素：有限预测 horizon、动力学 rollout、轮廓 / 滞后误差、控制修正、jerk 正则和走廊约束。然而当前路径进度主要通过 `Plan.Project`、`EstimatedDistanceCm`、`ProgressScale` 和参考时钟推进；源码没有显示一个与控制序列一起求解的独立 path-progress 优化变量。因此本文称为“MPCC 风格预测跟踪”，而不是完整的非线性 MPCC。这个术语边界是源码事实，不是降低实现价值。

### 6. 参考时钟和推进限幅

非定时空间计划的进度推进受当前沿轨速度和加速度能力限制：

$$
\Delta s_{max}=v_{along}\Delta t+\frac{1}{2}a_{authority}\Delta t^2+\epsilon
$$

源码见 `AircraftMpccController.cpp:787-808`。如果物体发生传送或路径跳跃，控制 horizon、上一参考和终端状态会一起重置（`AircraftMpccController.cpp:763-785`）。

### 7. 终点收敛保护

当 Stop 路径已经满足位置、速度和走廊条件时，控制器切换到临界阻尼式终端参考，并继续使用 jerk 限制生成平滑的停稳轨迹（`AircraftMpccController.cpp:820-917`）。如果沿轨速度和剩余距离不匹配，终端 guard 只覆盖切向分量，横向修正仍由正常路径反馈负责（`AircraftMpccController.cpp:1190-1257`）。

### 8. 失败和复用

当 solve 失败但上一次 reference 仍未过期时，系统会暂时复用旧 reference；连续失败达到配置阈值才报告 `bSolverFailed`（`AircraftMpccController.cpp:1430-1482`）。这比失败后立即输出零参考更平滑，但会引入“参考变旧”的诊断状态，调试时必须同时观察 `bReferenceFresh`、`ConsecutiveFailures` 和 `LastSolveMilliseconds`。

## 七、3D ORCA：局部避让原语

### 1. 接口和职责

`FAircraftOrcaSolver::Solve` 接收自身状态、邻居数组、首选速度、上一帧命令加速度、避让限制以及可选走廊胶囊（`AircraftOrcaSolver.cpp:405-411`）。状态必须包含稳定 ID、位置、速度、命令速度、机体半径和 tracking reserve；限制必须包含时间步、时间视界、分离 padding、水平速度 / 加速度、爬升 / 下降率、jerk、平滑权重和水平平面数（`AircraftOrcaSolver.cpp:373-403`）。

它解决的是：在当前局部邻居集合下，找一个尽可能接近首选速度且满足碰撞预测、能力和走廊约束的目标速度。它不做全局路径搜索，也不直接施加力。

### 2. 邻居风险排序

邻居按当前重叠、有限时间视界内的最近净间距、TCPA 和 `StableId` 排序，保证紧迫对象先构造约束（`AircraftOrcaSolver.cpp:438-496`）。相对位置为 $r$、相对速度为 $v$ 时，时间到最近接近点采用：

$$
t_{cpa}=\operatorname{clamp}\left(-\frac{r\cdot v}{\|v\|^2},0,T_h\right)
$$

源码还使用邻居命令速度与当前速度的差估计加速度，在视界前半段做匀加速外推；但真实重叠判定始终使用当前真实距离，避免把“未来会重叠”误判成“现在已经重叠”（`AircraftOrcaSolver.cpp:501-545`）。

### 3. 互惠速度约束

每个邻居生成一个速度约束平面。源码根据相对速度锥、碰撞时间和合成半径构造修正向量，再按锚定状态和优先级分配责任；锚定对象可以把自身责任设为零，非锚定对象承担避让（`AircraftOrcaSolver.cpp:26-45`、`546-605`）。这保留了 ORCA 的“双方分担速度修正”思想，同时加入了游戏中的优先级和占位机语义。

### 4. 能力平面和 3D 约束

求解器不是只在二维平面避让。`AddCapabilityPlanes` 为水平速度、当前速度加速度边界、水平 jerk、爬升率、下降率、垂直加速度和垂直 jerk 添加平面（`AircraftOrcaSolver.cpp:83-137`）。因此 ORCA 输出必须继续经过飞控能力投影；不能把 `TargetVelocityCmPerSec` 当成物理上必然能实现的速度。

### 5. 目标函数、走廊和 fallback

目标速度是首选速度和当前命令速度的平滑插值：

$$
v^* = (1-\alpha)v_{preferred}+\alpha v_{commanded},
\qquad
\alpha=\frac{w_s}{1+w_s}
$$

无走廊时，求解器寻找满足所有平面、距离目标最近的速度；有多个胶囊时，逐个尝试并选取距离目标最近者（`AircraftOrcaSolver.cpp:623-652`）。无可行解时先进行最小违约投影，再比较走廊违约和目标距离（`AircraftOrcaSolver.cpp:655-695`）。

### 6. 接入边界

导航层可以使用 `AircraftGuidanceTrajectoryBuilder::BuildVelocityGuidance` 把速度目标转换为带时间的引导快照。该 Builder 会校验能力、速度、加速度和 jerk，并生成有限 horizon 样本（`AircraftGuidanceTrajectoryBuilder.cpp:23-123`）。Proxy 通过 Game Thread 发布不可变引导快照，物理执行线程消费并交给 `TrajectoryRuntime`（`AircraftSimulationProxy.cpp:810-835`、`AircraftSimulationProxy.cpp:776-808`）。

源码搜索中未发现 `FAircraftOrcaSolver::Solve` 在 Proxy 内部被直接调用。因此更准确的链路是：

```text
邻居源 / 导航系统
  → FAircraftOrcaSolver::Solve
  → FAircraftGuidanceTrajectoryBuilder
  → FAircraftNavigationGuidance 快照
  → TrajectoryRuntime::ApplyNavigationGuidance
  → 轨迹参考 → PID
```

如果项目需要在每个物理子步直接调用 ORCA，必须额外设计邻居快照的线程安全、revision、过期刹车和预算策略；当前插件源码不能替这个集成决策作假设。

## 八、控制分配：从 wrench 到旋翼

### 1. Jacobian 列

每个旋翼的 Jacobian 列由最大可分配推力、推力轴、质心力臂和反扭矩组成：

$$
J_i = \begin{bmatrix}
F_{up,i} & \tau_{roll,i} & \tau_{pitch,i} & \tau_{yaw,i}
\end{bmatrix}^{T}
$$

力矩使用米制力臂，旋翼反扭矩方向由旋向符号决定，源码见 `ControlAllocator.cpp:34-57`。

### 2. 权限归一化和失效

`RebuildAllocationCache` 先用健康旋翼计算 RowScale，再用每个旋翼的 effectiveness 缩放推力上限和归一化列；这样某个旋翼失效时不会错误地把全机基准权限一起缩小（`ControlAllocator.cpp:103-218`）。`RotorEffectivenessManager` 同步维护有效权限比例和零效能数量（`RotorEffectivenessManager.cpp:15-68`）。

### 3. 阻尼伪逆 + 主动集

对于自由旋翼集合，源码构造：

$$
N=J_fJ_f^T+\lambda^2I
$$

求解：

$$
Ny=r
$$

再用：

$$
u_i=J_i^Ty
$$

如果 $u_i$ 越过 $[0,1]$，就把违反最严重的旋翼锁定到 0 或 1，继续迭代（`ControlAllocator.cpp:295-380`）。最终会计算实际 wrench、残差和饱和方向，供下一次角速度环条件积分使用（`ControlAllocator.cpp:382-416`）。

这套方法的优点是固定维度、小内存、能处理旋翼数量变化和部分失效；代价是它不提供通用 QP 的全局加权最优性，也没有把所有优先级、噪声和约束一次性放入统一二次目标。工程上应优先确保推力轴、质心、旋向和最大推力资产正确，再谈 `AllocationDamping` 的细调。

## 九、旋翼、电机和气动力

### 旋翼电机模型

每个旋翼先做归一化指令限速，再按幂律映射目标 RPM：

$$
\omega_{target}=\omega_{idle}+(\omega_{max}-\omega_{idle})u^{p}
$$

实际 RPM 使用上升 / 下降时间不同的一阶响应：

$$
\omega_{k+1}=\omega_k+\left(\omega_{target}-\omega_k\right)\left(1-e^{-\Delta t/\tau}\right)
$$

推力按转速平方缩放：

$$
T=T_{max}\left(\frac{\omega}{\omega_{max}}\right)^2
$$

对应实现位于 `RotorModel.cpp:3-65`。因此“控制命令瞬时等于推力”是错误模型；MPCC 的响应 alpha、停止包络和飞控前馈都必须考虑这个延迟。

### 显式气动力

当 LOD 开启显式气动力时，Proxy 会把 Chaos 原生线性 / 角阻尼置零，再在物理执行线程计算并施加气动力 wrench（`AircraftSimulationProxy.cpp:746-774`、`1966-1977`）。关闭模拟或进入未解锁时会恢复原生阻尼，避免机体处于“无旋翼、无阻尼、无气动”的真空弹道（`AircraftSimulationProxy.cpp:1743-1774`、`2058-2084`）。

## 十、线程、后端与 Simulation LOD

### 三个执行后端

当前 LOD 的 `DriveMode` 至少区分：

| 后端 | 主要执行位置 | 控制输出 | 适合场景 | 主要代价 |
|---|---|---|---|---|
| `FlightController` | Chaos 异步物理子步 | 旋翼力、偏心力矩、反扭矩 | 近景、可受力、需要真实响应 | CPU 与物理成本最高 |
| `PhysicsConstraint` | Game Thread 驱动约束目标 | 约束线力 / 力矩目标 | 保留物理碰撞但降低旋翼细节 | 约束参数决定观感，非旋翼级模型 |
| `Kinematic` | Game Thread | Sweep / 变换与姿态参考 | 远景、网络代理、低成本 | 不产生完整旋翼物理响应 |

`UAircraftComponent::TickComponent` 处理 Kinematic 更新和 PhysicsConstraint 驱动（`AircraftComponent.cpp:2401-2494`）；`AsyncPhysicsTickComponent` 只把物理句柄交给 Proxy（`AircraftComponent.cpp:2528-2544`）。因此不能把“Proxy 有某个接口”误读成“所有后端都在物理线程执行”。

### LOD 切换

`UAircraftSimulationLODComponent` 是复制组件，服务端切换 `CurrentLODIndex`，客户端通过 `OnRep_CurrentLODIndex` 应用预算（`AircraftSimulationLODComponent.cpp:59-105`）。预算包含 LOD、DriveMode、碰撞模式、是否网络代理、是否启用物理和过渡策略（`AircraftSimulationLODComponent.cpp:205-252`）。

切换策略可以保留运动并创建内部 Hold，也可以重新初始化物理；实际选择由 `EAircraftLODTransitionPolicy` 和调用方预算决定。切换时必须同时考虑：

- 计划 / Intent 是否继续；
- PID、Yaw Reference 和 Kinematic 姿态模型是否重置；
- PhysicsState 是否重建；
- 碰撞预算是否先恢复；
- 网络代理是否应继续模拟物理。

### LOD 与网络

默认网络频率在 LOD 组件构造函数中按 30、15、8、2 Hz 配置，最低 LOD 可以进入 Dormancy（`AircraftSimulationLODComponent.cpp:13-24`）。服务端应用当前 LOD 的 `NetUpdateFrequency`、最小频率和休眠状态（`AircraftSimulationLODComponent.cpp:255-286`）。

网络代理预算由 `bAuthoritySimulationOnly` 和 Actor authority 决定；代理可能只接收默认物理复制，也可能关闭本地控制器执行（`AircraftComponent.cpp:2192-2205`、`AircraftSimulationLODComponent.cpp:219-233`）。这说明 LOD 不只是“少算几次 PID”，它还改变了控制所有权、碰撞和网络更新成本。

## 十一、网络同步：应同步什么

### 服务器权威建议

工程上推荐让服务器拥有：

- MovementIntent、Intent ID 和 revision；
- 当前计划 / 轨迹参考的版本；
- 关键完成状态和失败原因；
- LOD 选择与控制所有权；
- 需要 gameplay 一致的旋翼失效或干扰状态。

客户端根据复制的状态做表现插值或默认物理代理，不要让客户端独立提交会改变任务结果的 Intent。当前源码已经具备 revision 和 sequence 元数据，但最终网络策略需要结合项目 Actor 复制和测试场景验证。

### 确定性边界

即使输入相同，Chaos 子步、浮点舍入、异步调度和不同 LOD 仍可能造成轨迹差异。因此不要把客户端的每个旋翼 RPM 当作权威同步量。更稳妥的网络层级是：

1. 任务层：同步 Intent / revision；
2. 状态层：同步位置、速度、姿态和控制权；
3. 表现层：客户端对旋翼 RPM、尾迹和相机做插值；
4. 纠正层：服务器状态超出误差阈值时重置或平滑拉回。

这是工程经验；当前插件源码只证明了 LOD 网络预算和 Proxy 的快照边界，不能证明项目已经具备完整 rollback 或确定性重演。

## 十二、关键参数按阶段归类

### 数据采集 / 意图阶段

| 参数 | 位置 | 源码默认 / 语义 | 影响 | 调整建议 |
|---|---|---|---|---|
| `MaxHorizontalSpeedCmPerSec` | `FAircraftRequestedMotionLimits` | `0` 表示沿用机体能力 | 限制路径和速度意图水平速度 | 先用机体能力，再按任务降额 |
| `MaxAccelerationCmPerSecSq` / `MaxDecelerationCmPerSecSq` | 同上 | `400` / `400` | 改变可达速度包络和制动距离 | 先根据真实加速度测量，避免只调 PID |
| `MaxJerkCmPerSecCubed` | 同上 | `2000` | 限制参考变化和 MPCC horizon | 太低会迟钝，太高会放大噪声 |
| `MaxClimbRate` / `MaxDescentRate` | 同上 | `300` / `200` | 限制垂直速度 | 分别测爬升和下降，不能共用一个值 |
| `Heading.Mode` | `FAircraftHeadingObjective` | `FaceVelocity` | 决定 yaw 参考 | 急转弯先限制 yaw rate，再提高速度 |
| `Completion.ArrivalMode` | `FAircraftCompletionPolicy` | `Stop` | 是否要求终点停稳 | 过点任务用 `PassThrough`，不要靠放大误差容差替代 |

定义与默认值见 `AircraftMovementIntent.h:72-166`。

### 计划构建阶段

| 参数 | 所属配置 | 影响 | 常见错误 |
|---|---|---|---|
| `Path.SampleSpacingCm` | `FAircraftAutopilotRuntimeConfig.Path` | 路径采样数量、曲率精度、计划构建成本 | 间距太大导致急弯被抹平 |
| `Timing.SampleSpacingCm` | `FAircraftAutopilotRuntimeConfig.Timing` | 轨迹样本数量和时间插值 | 只改时间采样而不改路径采样，造成几何 / 时间不一致 |
| `ThrustReserveFraction` | `Timing` | 给推力留安全余量 | 设为零会让计划贴着饱和边界运行 |
| `CurvatureAccelerationReserveFraction` | `Timing` | 曲率速度上限的保守程度 | 过低导致急转弯时姿态长期饱和 |
| `BrakingReserveFraction` | `Timing` | Stop 包络和 MPCC 终端制动 | 过低会越过终点，过高会明显提前刹车 |
| 安全走廊 `RadiusCm` | Route | 轮廓和走廊误差约束 | 半径小于机体和 tracking reserve 的合成尺寸 |

空间路径、曲率和速度包络实现见 `AircraftMotionPlan.cpp:280-520`。

### 查询 / MPCC 阶段

| 参数 | 所属配置 | 影响 | 推荐顺序 |
|---|---|---|---|
| `Mpcc.UpdateRateHz` | `FAircraftMpccRuntimeConfig` | solve 周期；不是物理步频 | 先保证 reference 新鲜，再谈提高频率 |
| `MaximumReferenceAgeSeconds` | `Mpcc` | 旧 reference 可复用多久 | 必须小于任务可接受的控制延迟 |
| `HorizonSeconds` / `HorizonSteps` | `Mpcc` | 预测距离和成本 | 先覆盖旋翼响应 + 制动时间，再增加长度 |
| `MaxOptimizationIterations` | `Mpcc` | 单次 solve 的最大迭代 | 受 CPU 预算约束，不能无限加 |
| `SolveTimeBudgetMilliseconds` | `Mpcc` | 单次 solve 硬预算 | 先通过性能窗口测量，不要凭感觉设置 |
| `ContourErrorWeight` / `LagErrorWeight` | `Mpcc` | 横向贴路径和沿程追赶权衡 | 转弯不贴线提高 contour；跟不上时间线提高 lag |
| `SpeedTrackingWeight` | `Mpcc` | 跟踪参考速度 | 过大可能牺牲走廊和终点制动 |
| `AccelerationWeight` / `JerkWeight` | `Mpcc` | 抑制修正和控制抖动 | 先加 jerk，再调 acceleration |
| `CorridorViolationWeight` | `Mpcc` | 走廊违约惩罚 | 先保证 corridor 有效，再提高权重 |
| `TerminalPositionWeight` / `TerminalVelocityWeight` | `Mpcc` | horizon 末端误差 | Stop 任务才需要明显提高 |

当前求解循环和代价实现见 `AircraftMpccController.cpp:1000-1165`；这些字段是否在某个 Dataflow 节点暴露，仍应以当前资产配置节点为准。

### PID / 执行阶段

| 参数 | 所属类型 | 影响 | 常见错误 |
|---|---|---|---|
| `Kp / Ki / Kd` | `FAircraftPidGains` | 单环反馈响应 | 同时放大外环和内环，导致串级相互追逐 |
| `Kff` | `FAircraftPidGains` | 参考或动力学前馈 | 在已有 trajectory feed-forward 后再次加同一阻力项 |
| `IntegralLimit` | `FAircraftPidGains` | 积分状态上限 | 设为零并不代表“积分为零”，而是无限幅 |
| `OutputLimit` | `FAircraftPidGains` | 单环输出限幅 | 忽略下游向量限幅，造成积分隐性 windup |
| `DerivativeCutoffHz` | `FAircraftPidGains` | D 项 IIR 低通 | 频率过高把物理差分噪声带入姿态 |
| `MaxTiltAngleDegrees` | `FAircraftMotionRuntimeConfig` | 水平加速度硬上限 | 先确认推力和重力，再调水平 PID |
| `HoverCollectiveCommand` | Flight Controller 配置 | 垂直基准 | 悬停基准错误会让高度环长期积分 |
| `AllocationDamping` | Flight Controller 配置 | 伪逆病态时的阻尼 | 过大造成分配偏软，过小放大拓扑噪声 |
| `MaxCommandSlewPerSecond` | 电机模型 | 指令建立速度 | 与 MPCC 响应时间不一致会产生制动误差 |
| `SpinUpTimeSeconds` / `SpinDownTimeSeconds` | 电机模型 | 一阶 RPM 响应 | 只调 PID 不调电机时间会掩盖真实延迟 |

PID 公式和过滤器见 `FlightControlPid.h:21-197`；飞控级使用见 `FlightControlSolver.cpp:159-669`；旋翼响应见 `RotorModel.cpp:21-65`。

### ORCA / 导航阶段

| 参数 | 所属类型 | 影响 | 注意 |
|---|---|---|---|
| `TimeHorizonSeconds` | `FAircraftAvoidanceLimits` | 提前多久发现冲突 | 过短来不及刹车，过长会过度保守 |
| `DeltaTimeSeconds` | 同上 | 重叠时约束强度和能力面 | 必须与导航快照更新时序一致 |
| `SeparationPaddingCm` | 同上 | 合成安全半径 | 不能小于网络 / tracking 误差余量 |
| `TrackingReserveCm` | Agent State | 为下游跟踪留空间 | 过小会让 ORCA 输出贴着边界 |
| `HorizontalPlaneCount` | Limits | 速度多边形精度 | 源码要求至少 8（`AircraftOrcaSolver.cpp:388-403`） |
| `SmoothingWeight` | Limits | 首选速度与当前命令速度平滑 | 过大反应慢，过小容易抖动 |
| `Priority` / `bAnchored` | Agent State | 责任分配 | 锚定语义必须和游戏占位机一致 |

## 十三、工程取舍

### 为什么不做完整非线性 MPC

当前路线把计划、参考、控制和 Chaos 执行拆开，优点是：

- 每一层都能独立诊断；
- 物理线程只做固定预算的小问题；
- 手动、自动驾驶、Constraint、Kinematic 可以复用参考和 PID；
- 失败时可以复用旧 reference 或进入刹车，而不是让整个系统失控。

代价是：路径进度、姿态、旋翼推力和碰撞约束不是一个统一最优问题；调参需要明确谁拥有哪一部分误差。把它改造成完整 MPC，需要重新定义状态、输入、约束、求解器线程和网络确定性，不能只把 `MaxOptimizationIterations` 调大。

### 为什么不用通用 QP 控制分配

当前四维 wrench、旋翼数量和效能缓存适合定制的 4×4 线性求解。主动集策略能在固定预算内处理推力饱和与部分失效。通用 QP 会带来更强的权重表达能力，但需要额外求解器、内存和失败回退策略；对近景无人机的首要收益未必大于维护成本。

### 为什么不用 DetourCrowd 代替 ORCA

DetourCrowd 的核心抽象是地面导航和二维代理；AircraftLab 需要 3D 爬升 / 下降能力、机体半径、推力和 jerk 约束。当前 ORCA solver 的能力平面、胶囊走廊和确定性排序直接对应这些需求（`AircraftOrcaSolver.cpp:83-137`、`405-695`）。它仍然需要上层静态环境导航配合。

## 十四、常见现象诊断

| 现象 | 可能原因 | 检查项 | 修复方向 |
|---|---|---|---|
| 频繁切换或抖动 | MPCC 参考过期、PID 外环太快、ORCA 快照来回变化 | `bReferenceFresh`、`LastSolveMilliseconds`、`GuidanceBlendAlpha`、PID 输出 | 先降低外环 / ORCA 更新频率，增加 jerk 和平滑权重 |
| 到达目标明显延迟 | 计划速度包络过保守、MPCC 频率低、参考复用太久 | `ProgressScale`、`PathProgress`、reference age | 先确认能力快照，再缩短 reference age 或提高 solve 预算 |
| 脚步式滑行 / 位置滑移 | 旋翼响应时间未纳入、阻力前馈重复或缺失 | `SpinUp/Down`、`DynamicsFeedForward`、实际加速度 | 先校准电机响应和气动，再调速度 PID |
| 急转弯不自然 | 曲率速度包络、偏航率限制和倾角不一致 | `Curvature`、`MaxYawRate`、`MaxTiltAngle` | 降低弯道速度，保证 yaw rate 能跟上路径切线 |
| 停止时越过终点后拉回 | 只按 $v^2/(2a)$ 估计，没有旋翼 / jerk 延迟 | `SignedTerminalDistanceCm`、`bTerminalBrakingActive` | 提高 braking reserve，检查 terminal guard 与速度环方向 |
| 后退时选错方向 | `ControlHeading` 使用实测 yaw 或 FaceVelocity 语义不对 | `ControlRotation`、`YawReferenceState` | 对控制航向速度使用 reference yaw，检查 `ResolveYaw` |
| 轨迹预测方向错误 | 坐标系混用、Body / Control rotation 取反 | `VehicleState.ControlRotation`、`BodyRotation` | 先固定世界 / 控制 / 机体坐标契约，再改增益 |
| 姿态突然跳变 | replan / LOD / guidance 切换时复用了错误 PID 状态 | `RebaseObservationDerivatives`、Yaw / Attitude model reset | 在控制语义切换时重置对应状态，不要全局清零所有状态 |
| ORCA 输出不稳定 | 邻居顺序不稳定、StableId 缺失、走廊无可行解 | `ConstraintPlaneCount`、`MaximumConstraintViolation` | 保证稳定 ID、限制邻居数、提供 corridor fallback |
| CPU 占用高 | MPCC solve 预算过大、LOD 没降、每子步重复重建拓扑 | `MpccSolve`、`PlanBuild`、`RotorAuthorityRefresh` | 复用 plan / reference / allocation cache，按 LOD 降频 |
| 网络两端姿态不一致 | 客户端独立控制、LOD 不同、Chaos 非确定性 | authority、LOD、NetUpdateFrequency、序列号 | 服务器权威 Intent / 状态，客户端只做表现和纠正 |
| Motion Warping 或外部导航与飞控冲突 | 外部 guidance revision 与 Intent 不匹配或过期 | `GuidanceFailureReason`、`SourceIntentId`、`SourceIntentRevision` | 过期 / 不匹配时走 `BuildBrakingReference`，不要继续叠加旧 guidance |

## 十五、推荐调参和验证顺序

1. **验证单位、坐标和骨骼 / 质心**：观察质量、惯量、Up 轴、控制轴和质心。若力矩方向错，立即回退，不调 PID。
2. **验证旋翼资产**：逐旋翼检查位置、推力轴、最大推力、旋向、反扭矩系数和电机时间。确认单独总距能抬升，单轴命令方向正确。
3. **验证后端和固定步长**：先只启用 Flight Controller，检查 `AsyncPhysicsTickComponent`、Physics Handle 和 `BackendUpdate` 计数；再分别验证 Constraint、Kinematic。
4. **验证静态计划**：用 Hold、直线 Route、Orbit 和 TimedTrajectory，检查样本、曲率、速度包络和 Stop 末端速度。
5. **验证串级 PID**：先角速度内环，再姿态，再速度，再位置，最后垂直通道。每加一层都确认上一层没有饱和或 windup。
6. **校准前馈和执行器**：根据真实加速度、阻力和 RPM 响应校准 trajectory / dynamics feed-forward、`SpinUp/Down` 和 `MaxCommandSlewPerSecond`。
7. **启用 MPCC 风格跟踪**：先低 horizon、低迭代和明确预算，观察 contour、lag、progress、terminal brake 和 solver failures，再增加预测长度。
8. **接入安全走廊和导航 guidance**：先验证 revision、时间戳、过期刹车和 corridor violation，再接 ORCA。
9. **验证 ORCA 多机矩阵**：两机迎面、交叉、追尾、垂直交错、锚定代理、失效 guidance 和无可行解。观察最小预测间距和 fallback 违约。
10. **启用 Simulation LOD**：验证每个 LOD 的 DriveMode、碰撞、状态保留和网络频率，确认切换不会继承错误的 PID / yaw 状态。
11. **最后做网络和性能测试**：服务器权威、客户端代理、丢包、延迟、不同物理步长和 50 / 100 / 200 个无人机规模都要分别记录。

推荐调试字段来自 `AutopilotComponent.cpp:782-812`：`PathTrackingState`、`ProgressScale`、`SignedTerminalDistanceCm`、`ContourErrorCm`、`LagErrorCm`、`CorridorViolationCm`、`PredictedCorridorViolationCm`、`LastSolveMilliseconds`、`MpccCorrection`、`TerminalBrake` 和 `GuidanceAlpha`。

## 十六、三套可落地配置思路

### 1. 第三人称普通四旋翼

- **计划**：直线 Route、短 Orbit、Stop 任务；空间采样不要过密。
- **约束**：中等水平速度和加速度，保留 10%～20% 推力余量；偏航率与弯道速度同步限制。
- **PID**：先把角速度环调到不饱和，再提高速度环；位置环只负责低频误差。
- **MPCC**：horizon 覆盖约一个旋翼响应时间加一段制动时间；`ContourErrorWeight` 略高于 `LagErrorWeight`。
- **风险**：把位置环调得过快会和 MPCC 进度互相追赶；Stop 容差过小会让完成状态一直不稳定。

### 2. 高速角色或大型生物

- **计划**：较长 horizon、较大安全走廊、显式气动力和更高的速度采样密度。
- **约束**：以质量、最大总推力、倾角和阻力共同求出可用速度；不要只按角色期望速度设置上限。
- **PID**：降低外环带宽，依赖 trajectory / dynamics feed-forward；角速度内环要留出反扭矩权限。
- **MPCC**：提高 `LagErrorWeight` 和 `JerkWeight`，用终端速度权重控制高速刹车；预算固定后再决定迭代数。
- **风险**：大型机体的碰撞半径、tracking reserve 和网络纠正距离会显著增加；ORCA 可能需要更长时间视界。

### 3. 网络多人游戏角色

- **服务器**：服务器持有 Intent、revision、LOD 和关键完成状态；导航 / ORCA 输出作为带时间戳的 guidance 快照。
- **客户端**：按 LOD 选择 Kinematic 或默认物理代理，旋翼 RPM 和相机效果只做表现插值。
- **同步**：记录 `PhysicsStateSequence`、`ControlSequence`、Intent revision、LOD index 和 authority mode；超出误差阈值时按服务器状态纠正。
- **预算**：远端 LOD 降低 MPCC / guidance 更新频率，最低 LOD 使用 dormancy；近端玩家保留 Flight Controller。
- **风险**：客户端独立 ORCA 会导致不同避让结果；若必须客户端预测，至少把邻居快照排序、StableId 和过期策略固定下来。

## 十七、当前源码已确认与需要验证

### 已确认的事实

- Intent 类型、限制、航向和完成策略定义于 `AircraftMovementIntent.h:10-166`。
- `AutopilotComponent` 在 Game Thread 接收和维护 Intent、目标 Actor、revision 和完成状态，见 `AutopilotComponent.cpp:274-317`、`713-822`。
- MotionPlan 按意图类型构建空间 / 定时计划，并把曲率、推力、倾角、速度率和停止延迟纳入速度包络，见 `AircraftMotionPlan.cpp:280-520`。
- Trajectory Runtime 负责计划时间、路径投影、MPCC 更新、导航引导混合和航向动态，见 `AircraftTrajectoryRuntime.cpp:378-432`、`547-645`、`679-750`。
- MPCC 风格控制器具备 horizon rollout、代价梯度、warm start、时间预算、终端制动和 reference reuse，见 `AircraftMpccController.cpp:504-545`、`1000-1327`、`1350-1507`。
- PID 具备 measurement derivative、低通、积分限幅、条件积分和 tracking anti-windup，见 `FlightControlPid.h:101-197`。
- Flight Controller 是位置 / 速度 / 姿态 / 角速度的串级链路，见 `FlightControlSolver.cpp:227-341`、`443-669`。
- 控制分配使用 Jacobian、阻尼法方程和主动集饱和，见 `ControlAllocator.cpp:34-57`、`295-427`。
- 旋翼执行包含指令 slew、RPM 一阶响应、平方推力和反扭矩，见 `RotorModel.cpp:21-65`。
- Flight Controller 的旋翼力和力矩在 Chaos 异步物理线程施加，见 `AircraftSimulationProxy.cpp:1601-1608`、`2469-2499`。
- Kinematic / Constraint 的 Game Thread 路径与 Flight Controller 的 Physics Thread 路径不同，见 `AircraftComponent.cpp:2401-2544`。
- LOD 组件复制当前 LOD、应用驱动 / 碰撞预算并调整网络频率和 dormancy，见 `AircraftSimulationLODComponent.cpp:59-105`、`205-286`。
- ORCA 具备 3D 能力平面、邻居风险排序、互惠责任、走廊胶囊和 fallback，但源码中未发现其在 SimulationProxy 内直接调用，见 `AircraftOrcaSolver.cpp:83-137`、`405-695`。

### 需要结合运行时验证的内容

- 各项目 Dataflow 资产实际采用的 `UpdateRateHz`、horizon、权重和 PID 增益；源码只证明算法路径，不证明某个资产值。
- 真实 Chaos 固定步长、不同平台浮点误差、异步负载下 MPCC reference 是否经常复用。
- ORCA 在项目导航层的实际调用频率、邻居截断策略、StableId 分配和 guidance revision 发布策略。
- LOD 切换时具体资产是否选择 `PreserveMotionAndHold` 或 `ReinitializePhysics`，以及动画 / 相机 / 碰撞的观感。
- 网络场景中服务器权威、客户端默认物理、Kinematic 代理和 dormancy 的组合是否满足游戏设计。
- 历史诊断中“终端制动 correction 影响后续 solve”的传播是否仍能在最新场景稳定复现；它是诊断假设，不能在静态文章中写成唯一根因。

## 十八、最小可行配置和核心原则

### 最小可行配置

1. 一个有效 `FlightController` LOD；
2. 四个旋翼的推力轴、位置、最大推力、旋向和电机响应时间正确；
3. 一个直线 Route 或 Hold 计划；
4. 位置、速度、角速度三个环先有稳定反馈，垂直环使用可靠悬停基准；
5. `MaxTiltAngle`、总推力和速度 / 加速度限制互相可达；
6. MPCC 使用小 horizon、有限迭代和明确时间预算；
7. 不接 ORCA 时先关闭导航 guidance，确认 nominal reference 能独立完成；
8. 记录 contour、lag、terminal distance、solver time、allocation residual 和 saturated rotor 数量。

### 核心原则（不超过 10 条）

1. 先验证单位、坐标和质心，再调增益。
2. 任务软限制永远服从当前物理能力。
3. 路径速度包络必须包含曲率、推力、倾角、jerk 和执行器延迟。
4. MPCC 只修正参考，PID 仍是最终跟踪责任人。
5. 前馈只能有一个权威来源，不能重复补偿阻力。
6. 控制分配的残差必须反馈到积分器，否则饱和会变成 windup。
7. ORCA 输出是速度目标，不是直接力，更不是全局规划结果。
8. 跨线程传递不可变快照、ID、revision 和 sequence，不传裸 UObject 状态。
9. LOD 切换是控制权、碰撞、网络和状态生命周期的联合切换。
10. 每个优化都要用诊断字段和真实场景验证，不把静态源码结论冒充运行时验收。

### 最重要的调参排序

1. 旋翼拓扑、推力轴、质量、质心和惯量；
2. 最大倾角、总推力和电机响应时间；
3. 角速度内环；
4. 姿态参考和垂直悬停基准；
5. 速度环和前馈；
6. 位置环；
7. 路径速度包络和 Stop 制动余量；
8. MPCC horizon、预算和权重；
9. ORCA 时间视界、半径、tracking reserve 和平滑；
10. LOD / 网络更新频率。

最容易误调的参数是 `MaxDeceleration`、`MaxJerk`、`BrakingReserveFraction`、`SpinUp/DownTimeSeconds`、`DerivativeCutoffHz`、`AllocationDamping`、`TimeHorizonSeconds` 和 `SmoothingWeight`。它们分别影响规划、执行器、过滤、分配和避让，不能只凭单个画面判断。

