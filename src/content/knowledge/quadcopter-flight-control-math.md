---
title: "AircraftLab 无人机插件技术详解 — 物理、飞控、自动驾驶、Simulation LOD 与网络同步"
excerpt: "基于当前 AircraftLab 源码，系统说明多旋翼刚体与旋翼模型、级联飞控、控制分配、自动驾驶轨迹管线、Simulation LOD、服务器权威网络同步、参数资产和工程调试方法。"
date: "2026-07-15"
category: "Physics"
subtopic: "FlightController"
tags: ["无人机", "飞控", "Chaos", "Autopilot", "Simulation LOD", "网络同步"]
readTime: "阅读约55分钟"
---

> 本文以当前 `AircraftLab` 插件源码为唯一事实来源，面向需要维护、扩展和调试该系统的程序同事。文中的“当前实现”特指本文日期对应的代码版本，而不是通用飞控理论的理想形态。
>
> 当前插件服务于以服务器控制的 NPC 无人机为主、4 人以下联机 PVE 的场景。无人机由 Chaos 刚体真实受力驱动；客户端默认只接收服务器物理状态并做预测插值。玩家直接控制无人机属于预留玩法，尚未接入 `UNetworkPhysicsComponent` 的输入预测与重模拟链路。

---

## 1. 系统定位与当前边界

AircraftLab 是一个基于 Unreal Engine 5 Chaos 的多旋翼飞行仿真插件。它没有自己积分刚体方程，而是计算每个旋翼在当前控制周期应产生的推力和反扭矩，再把力与力矩施加到 Chaos 刚体，由 Chaos 完成碰撞、约束和运动积分。

从上到下，系统可以划分为六层：

1. **玩法/AI 决策层**：决定巡逻、追击、攻击、撤退等行为，并提交一个移动命令。
2. **Autopilot 层**：把“去哪里、沿什么路径、以多快速度、机头朝哪里”转换为连续且物理可达的 P/V/A/Yaw 设定值。
3. **Flight Controller 层**：用位置、速度、姿态、角速度级联控制，把设定值转换为总距和三轴力矩请求。
4. **Control Allocation 层**：根据任意数量旋翼的位置、推力方向、旋向和健康度，把四维控制请求分配成每桨推力。
5. **Airscrew/Actuator 层**：模拟指令斜率、电机一阶响应、转速平方推力和反扭矩。
6. **Chaos 刚体层**：处理质量、惯量、阻尼、重力、碰撞、约束以及最终位姿。

这套分层有两个重要工程含义：

- AI 不应该直接改 PID 或电机转速；它只提交移动意图。
- Autopilot 不直接施力；它生成设定值。唯一接触 Chaos 刚体句柄并施力的是飞控/旋翼物理边界。

### 1.1 当前已经实现

- 四旋翼以及 N 旋翼通用布局。
- 每个 Chaos 异步物理步运行一次飞控。
- 位置/速度、姿态/角速度、垂直速度级联控制。
- 二阶姿态参考模型和四元数姿态误差。
- 线性阻尼、垂直阻尼和角阻尼前馈。
- 阻尼伪逆与主动集旋翼推力分配。
- 单桨/多桨失效、部分降效和剩余控制权限评估。
- MoveTo、FollowPath、Velocity、Orbit、CircleArc、Hold 命令。
- 分段直线、Bezier、Minimum Snap、圆弧和持续环绕轨迹。
- Pure Pursuit、Vector Field、Direct 三种路径制导模式。
- 加速度、减速度、Jerk、偏航速率/加速度/Jerk 运动整形。
- 数据驱动的四级 Simulation LOD。
- 服务器权威的 UE 刚体移动复制和 `PredictiveInterpolation`。

### 1.2 当前没有实现或没有接线

- 没有真实 IMU/GPS/气压计传感器链和状态估计器；飞控直接读取 Chaos 真值。
- 没有 `UNetworkPhysicsComponent`、客户端输入历史或物理重模拟。
- 没有为 Autopilot 命令提供内建 Server RPC；联网游戏必须由服务器提交命令。
- 没有单独复制 Autopilot 意图、每桨 RPM、旋翼健康数组和 PID 状态。
- `FDroneMassProperties`、`FDroneAerodynamicsConfig`、传感器配置、`FDroneEstimatorConfig`、`FDroneFailsafeConfig` 等结构仍是未来数据契约，不是当前运行链路的配置源。
- `FDroneControlAllocationConfig::AxisWeights` 当前保留，但没有参与求解器计算；调整它不会改变飞行结果。

---

## 2. 模块架构与依赖方向

插件被拆分为三个 Runtime 模块：

```text
AircraftCore
├─ 公共数据契约
├─ FlightController 接口
├─ Autopilot Provider 接口
└─ Simulation LOD 类型与 Consumer 接口

AircraftAutopilot -> AircraftCore
├─ 移动命令与意图执行
├─ 轨迹生成/路径制导/Motion Profile
├─ 前馈、协调转弯、悬停推力估计
└─ 不依赖 AircraftLab 的具体飞控类

AircraftLab -> AircraftCore + AircraftAutopilot
├─ AAircraftPawn
├─ UFlightControllerComponent
├─ UAirscrewComponent
├─ UAircraftSimulationLODComponent
└─ UAircraftSimulationWorldSubsystem
```

`AircraftCore` 的意义不是存放算法，而是打断模块循环依赖。`AircraftAutopilot` 只通过 `IAircraftFlightControllerInterface` 获取运动状态、物理限制和启停控制；`AircraftLab` 通过 `IAutopilotProvider` 拉取纯数据形式的 `FAutopilotInjection`。因此 Autopilot 可以替换飞控实现，飞控也不需要包含 Autopilot 的具体类。

`UAircraftSimulationWorldSubsystem` 同样不依赖具体飞控或自动驾驶类。它只向实现 `IAircraftSimulationLODConsumer` 的组件广播 `FAircraftSimulationBudget`，这是 LOD 系统保持低耦合的关键。

---

## 3. AAircraftPawn 的组件组合与初始化

`AAircraftPawn` 在 C++ 构造函数中创建五个默认子对象：

```text
AAircraftPawn
├─ BodyMesh            USkeletalMeshComponent
├─ DroneInput          UDroneInputComponent
├─ FlightController    UFlightControllerComponent
├─ AutopilotComponent  UAutopilotComponent
└─ SimulationLOD       UAircraftSimulationLODComponent
```

### 3.1 BodyMesh

`BodyMesh` 是根组件和主 Chaos 刚体，构造时启用：

- `PhysicsActor` 碰撞配置；
- `SetSimulatePhysics(true)`；
- `SetEnableGravity(true)`。

真实质量、质心、惯量和 Chaos 阻尼来自 Skeletal Mesh/Physics Asset/BodyInstance，而不是 `FDroneMassProperties`。飞控在物理线程通过刚体句柄读取：

- `M()`：质量 kg；
- `CenterOfMass()`：机体局部质心偏移 cm；
- `I()`：Chaos 惯量，转换为 kg·m²；
- `LinearEtherDrag()` / `AngularEtherDrag()`：阻尼。

### 3.2 Autopilot 与 FlightController 的绑定

`UAutopilotComponent::BeginPlay()` 会查找实现 `IAircraftFlightControllerInterface` 的组件，并把自己注册为 Autopilot Provider。Autopilot Tick 被设置为 FlightController 游戏线程 Tick 的前置条件，因此同一游戏帧中先生成设定值，再由飞控拉取缓存。

激活 Autopilot 时：

1. 保存原飞行模式；
2. 把飞控切到 `Mission`；
3. 开启 `bUseAutopilotSetpoint`；
4. 用当前 P/V/A/Yaw 初始化 Motion Profile；
5. 先进入当前位置 Hold。

停用时取消活动意图、清空轨迹、关闭 Autopilot 注入并恢复先前飞行模式。

### 3.3 必需与可选配置

- `UFlightControllerProfileAsset` 是飞控的**必需资产**。未设置或校验失败时，组件会停止游戏线程 Tick 和异步物理 Tick，不会继续使用隐式默认值。
- `UAutopilotProfileAsset` 是可选资产；未设置时使用类默认对象中的配置。
- `UAircraftSimulationLODProfileAsset` 是可选资产；未设置时同样使用类默认配置。

### 3.4 当前启动状态

飞控 `BeginPlay()` 成功初始化后，当前代码默认：

- 飞行模式设为 `PositionHold`；
- `ArmState` 直接设为 `Armed`；
- 用当前位姿初始化估计状态与 Hold 目标。

这意味着 `UDroneInputComponent` 中某些“初始是否解锁”配置并不是实际启动状态的唯一来源。若项目需要安全的 Disarmed 启动流程，应统一修改飞控初始化状态机，而不是只修改输入组件。

---

## 4. 执行时序与线程模型

### 4.1 游戏线程：慢逻辑与跨线程快照

`UAutopilotComponent` 和 `UFlightControllerComponent` 都位于 `TG_PrePhysics`。

Autopilot 游戏线程 Tick：

```text
捕获当前飞行状态
  -> 更新/重建轨迹
  -> 路径制导
  -> 航向处理
  -> 协调转弯
  -> Motion Profile 限制速度/加速度/Jerk
  -> 计算速度、加速度、推力前馈
  -> 缓存 FAutopilotInjection
```

FlightController 游戏线程 Tick：

```text
缓存世界重力
  -> 读取玩家输入
  -> 评估旋翼 FailurePolicy
  -> 构建手动 MovementIntent
  -> 从 IAutopilotProvider 拉取 Injection
  -> 写入供物理线程读取的缓存
```

### 4.2 物理线程：一物理步一次控制

当前版本已经删除 `ControlLoopRateHz` 和固定 250 Hz 累加器。真实路径是：

```cpp
AsyncPhysicsTickComponent(DeltaTime, SimTime)
{
    UpdateEstimatedState_PhysicsThread(DeltaTime, SimTime, BodyHandle);
    RunControlLoop(DeltaTime, CachedPilotInput);
    for (UAirscrewComponent* Rotor : Airscrews)
    {
        Rotor->ApplyThrustForce_PhysicsThread(BodyHandle);
    }
}
```

因此：

- **控制更新率 = Chaos 异步物理步率**；
- PID 使用的 `DeltaTime` 与产生当前测量值的物理步一致；
- 不会在同一份冻结刚体状态上重复积分 PID；
- 想改变实际控制率，应统一调整项目 Chaos 异步物理固定步长，而不是给单架无人机增加另一个内部频率。

项目当前启用了 `bTickPhysicsAsync`、`bSubsteppingAsync` 和 `bSubstepping`。具体固定步长仍由项目物理设置/引擎配置决定，文档不假设它永远是 240 Hz 或 250 Hz。

### 4.3 为什么高层逻辑可以降频、飞控不能随意隔步

Autopilot 处理的是路径、目标和设定值，允许 20 Hz、10 Hz 等较慢更新，再由 Motion Profile 与飞控连续跟踪。飞控则直接闭合刚体角速度和姿态，如果简单“每 N 个物理步运行一次”却仍持续施加旧输出，会改变闭环延迟、PID 离散模型和稳定裕度。

所以当前 LOD 的策略是：

- 降低 Autopilot/慢逻辑频率；
- Kinematic 层完全关闭飞控和 Chaos；
- 不在 ReducedPhysics 中任意抽帧运行姿态内环。

---

## 5. 坐标系与单位约定

### 5.1 Unreal 世界系与飞控机体系

Unreal 世界坐标为 X 前、Y 右、Z 上。Chaos 返回的线速度和角速度是世界系量。飞控把角速度逆旋转到机体系后，对 X/Y 取负、Z 保持：

$$
\boldsymbol{\omega}_{ctrl}=(-\omega_x^B,-\omega_y^B,\omega_z^B)
$$

控制器生成的 Roll/Pitch/Yaw 角速度和力矩必须遵守同一符号约定。四元数姿态误差路径也显式对 X/Y 进行了相同转换，否则会把姿态负反馈变成正反馈。

### 5.2 单位

| 物理量 | AircraftLab 对外单位 | Chaos 边界 |
|---|---|---|
| 位置/力臂 | cm | cm |
| 速度 | cm/s | cm/s |
| 加速度 | cm/s² | cm/s² |
| 角度 | degree | 四元数/内部 rad |
| 角速度 | degree/s | Chaos `W()` 为 rad/s |
| 质量 | kg | kg |
| 惯量 | kg·m²（运行缓存） | Chaos cm 制惯量转换后得到 |
| 推力 | N | `1 N = 100` Chaos force units |
| 力矩 | N·m | `1 N·m = 10000` Chaos torque units |

`AircraftPhysicsUnits` 规定只有进入/离开 Chaos 的边界才能进行 N/N·m 转换。控制器、旋翼标定和诊断内部均保持 SI 力学单位。

计算偏心力矩时，控制分配器把 cm 力臂乘 `0.01` 转为 m：

$$
\boldsymbol{\tau}_{arm}=\mathbf r_{m}\times\mathbf F_N
$$

实际施力边界则直接使用 Chaos 的 cm 力臂与 Chaos force，叉积自然得到 Chaos torque，避免重复单位转换。

---

## 6. 刚体与旋翼物理模型

### 6.1 牛顿—欧拉方程

无人机的六自由度运动满足：

$$
m\dot{\mathbf v}=\sum\mathbf F
$$

$$
\mathbf I\dot{\boldsymbol\omega}+\boldsymbol\omega\times(\mathbf I\boldsymbol\omega)=\sum\boldsymbol\tau
$$

AircraftLab 不手写这两组积分器。它只为每个旋翼计算：

$$
\mathbf F_i=T_i\hat{\mathbf n}_i
$$

$$
\boldsymbol\tau_i=mathbf r_i\times\mathbf F_i+
\hat{\mathbf n}_i\,T_i k_{\tau,i}s_i
$$

其中 `s_i` 对 CW 为 -1、CCW 为 +1。Chaos 汇总所有旋翼力/力矩、重力、碰撞和约束后完成刚体积分。

### 6.2 电机与桨的五步模型

每个 `UAirscrewComponent` 在控制循环中依次执行：

1. **指令限速**

   $$
   |dc/dt|\le S_{cmd}
   $$

2. **归一化指令到目标转速**

   $$
   RPM_{target}=RPM_{idle}+(RPM_{max}-RPM_{idle})c^p
   $$

3. **一阶电机响应**

   $$
   RPM_n=RPM_{n-1}+\left(1-e^{-\Delta t/\tau}\right)
   (RPM_{target}-RPM_{n-1})
   $$

   加速和减速分别使用 `SpinUpTimeSeconds` 与 `SpinDownTimeSeconds`。

4. **转速平方推力**

   $$
   T=T_{max}\eta C_T\left(\frac{RPM}{RPM_{max}}\right)^2
   $$

5. **反扭矩**

   $$
   \tau_{reaction}=T\,k_\tau\,s
   $$

`CommandExponent` 是“命令到 RPM”的曲线指数，不是推力平方律本身。两者串联后，忽略 Idle RPM 时近似有 $T\propto c^{2p}$。因此增大指数会让低指令区更软、接近满指令时更陡；它不会自动让推力更线性。

### 6.3 旋翼几何与质心

旋翼组件在注册和 BeginPlay 时从实际组件 Transform 同步：

- 局部位置；
- 局部旋转；
- 推力轴；
- Attach Socket 名称。

控制分配的力臂不是“旋翼相对根组件的位置”，而是：

$$
\mathbf r_i=\mathbf p_{rotor,i}^{body}-\mathbf p_{COM}^{body}
$$

因此 Physics Asset 中质心偏移改变后必须重新验证旋翼布局和控制方向。

### 6.4 关键旋翼参数

| 参数 | 当前默认 | 作用与调节影响 |
|---|---:|---|
| `MaxThrustForce` | 900 N | 单桨最大静推力。增大提升推重比，也会改变悬停指令和控制权限。 |
| `ThrustCoefficient` | 1.0 | 推力标定缩放。通常与实测/目标机型一起校准。 |
| `ReactionTorqueCoefficient` | 0.03 m | 每牛顿推力产生的偏航反扭矩臂。过小会缺偏航权限，过大易偏航过敏。 |
| `Efficiency` | 1.0 | 物理推力/反扭矩效率，同时影响健康度分配。 |
| `ControlAuthorityScale` | 1.0 | 仅限制分配器允许使用的最大推力，可用于人为降额。 |
| `IdleRpm` | 1500 | 非零命令时的起始 RPM。 |
| `MaxRpm` | 12000 | RPM 归一化上限。 |
| `SpinUpTimeSeconds` | 0.06 s | 越大推力建立越慢，闭环可用带宽降低。 |
| `SpinDownTimeSeconds` | 0.10 s | 越大减推越慢，更容易产生制动过冲。 |
| `CommandExponent` | 2.0 | 命令曲线形状。 |
| `MaxCommandSlewPerSecond` | 8.0/s | 越小越平顺，但会增加控制延迟。 |
| `CommandScale` | 1.0 | 组件级输出微调，容易掩盖布局/标定问题，不建议作为常规配平手段。 |

`RadiusCm`、`bUseSocketTransform` 和 `Motor.MinRpm` 当前没有完整进入实际气动/几何选择路径：桨半径不参与推力计算，组件实际 Transform 是几何事实来源，零命令仍直接得到 0 RPM。不要把这些字段交给策划当作当前有效参数。

---

## 7. 状态读取与级联飞控

### 7.1 当前“状态估计”实际上是仿真真值

每个物理步直接读取：

- 位置 `X()`；
- 姿态 `R()`；
- 线速度 `V()`；
- 角速度 `W()`；
- 质量、惯量和阻尼。

线加速度与角加速度通过相邻物理步速度差分得到：

$$
\mathbf a_n=\frac{\mathbf v_n-\mathbf v_{n-1}}{\Delta t}
$$

估计置信度固定为 1.0。这适合游戏中的确定性 NPC 控制，但不能代表真实传感器噪声、偏置、延迟和融合误差。如果未来要验证真实飞控算法，应在这层引入传感器模型和估计器，而不是直接调大 PID 来掩盖真值与实机的差异。

### 7.2 通用 PID

控制器使用并行形式：

$$
u=K_pe+K_i\int e\,dt+K_d\dot e+K_{ff}ff
$$

运行状态包含积分、上一误差/测量和滤波后的导数。实现支持：

- `IntegralLimit`：限制积分状态；
- `OutputLimit`：限制环输出；
- `bFreezeIntegralWhenSaturated`：输出饱和时回退本次积分；
- `DerivativeCutoffHz`：一阶低通滤波导数；
- 对误差求导与对测量求导两种路径。

角速度和垂直速度内环优先使用测量微分：

$$
\dot e\approx-\frac{PV_n-PV_{n-1}}{\Delta t}
$$

这样设定值跳变不会产生 Derivative Kick。

### 7.3 垂直控制

高度保持路径由两层组成：

```text
高度误差
  -> Altitude PID
  -> 期望垂直速度
  -> VerticalVelocity PID
  -> 总距偏移
  -> Hover/Thrust 前馈基准
  -> Collective [Min, Max]
```

手动 Hold 使用 `HoverCollectiveCommand` 作为基准。Autopilot 路径使用动态 `ThrustFeedForward`，并叠加垂直阻尼补偿：

$$
\Delta c_{drag}=c_{hover}\frac{d_{linear}v_{z,des}}{g}
$$

最终总距为：

$$
c=Clamp(c_{base}+\Delta c_{drag}+\Delta c_{PID},c_{min},c_{max})
$$

### 7.4 水平位置与速度控制

水平链路为：

```text
位置误差 + 速度前馈
  -> Position PID
  -> 期望水平速度
  -> 速度误差 + 加速度前馈 + 阻尼前馈
  -> Velocity PID
  -> 期望水平加速度
  -> 倾斜映射
```

在当前航向的前/右平面内：

$$
\theta_{des}=-\arctan2(a_{forward},g)
$$

$$
\phi_{des}=\arctan2(a_{right},g)
$$

Roll/Pitch 最终限制在 `MaxTiltAngleDegrees`。水平阻尼前馈使用 Chaos 线性阻尼：

$$
\mathbf a_{drag,ff}=d_{linear}\mathbf v_{des}\cdot Scale
$$

系统还根据阻尼和保留余量收紧 Autopilot 的可用速度/加速度：

$$
v_{max,drag}=\frac{a_{physical}(1-r)}{d_{linear}}
$$

其中 $r$ 是 `DampingAccelerationReserveFraction`。这避免无人机把全部水平加速度都用来抵消恒速阻尼，导致转弯或抗扰时没有余量。

### 7.5 姿态参考模型与四元数控制

Roll/Pitch 目标默认先经过临界阻尼二阶参考模型：

$$
\ddot x+2\omega_n\dot x+\omega_n^2(x-x_{sp})=0
$$

它输出平滑姿态目标和角速度前馈。`RefModelNaturalFrequency` 越高，目标跟踪越快；太高会重新接近阶跃。`RefModelRateFFLimitDegPerSec` 限制参考模型导数。

默认四元数姿态路径计算：

$$
q_{err}=q_{current}^{-1}q_{desired}
$$

选择最短旋转后，用虚部近似姿态误差并转换成期望机体角速度。`YawWeight` 缩放偏航误差，使 Roll/Pitch 推力方向对齐优先于机头朝向。

随后角速度内环把：

$$
\boldsymbol\omega_{des}-\boldsymbol\omega_{measured}
$$

转换为归一化 Roll/Pitch/Yaw 力矩指令，并叠加按惯量、角阻尼和当前正/负力矩权限归一化的角阻尼前馈。

### 7.6 倾斜总距补偿

机体倾斜后，垂直推力为 $T\cos\alpha$。分配器默认执行：

$$
c_{comp}=\frac{c}{\max(\cos\alpha,cos_{min})}
$$

这能显著减少平移和协调转弯时掉高度。`MinCosTilt` 是防止接近 90° 时除零和推力爆炸的安全下限，不应被理解为允许机体飞到该角度；真正的姿态限制仍由 `MaxTiltAngleDegrees` 决定。

---

## 8. 控制分配：从四维 Wrench 到 N 个旋翼

### 8.1 旋翼雅可比列

对旋翼 $i$，最大允许推力下的物理列为：

$$
\mathbf b_i=
\begin{bmatrix}
F_{z,i}\\
-\tau_{x,i}\\
-\tau_{y,i}\\
\tau_{z,i}
\end{bmatrix}
$$

其中：

$$
\boldsymbol\tau_i=\mathbf r_i\times\mathbf F_i+
\hat{\mathbf n}_i T_i k_{\tau,i}s_i
$$

符号中的 X/Y 负号用于对齐飞控内部 Roll/Pitch 约定。

分配器先用全健康布局计算四个 `RowScale`：总距权限，以及 Roll/Pitch/Yaw 正负方向中的平衡权限。然后把列归一化，使控制器输出的 `[-1,1]` 近似表示该轴可用权限百分比。

### 8.2 阻尼伪逆

自由旋翼的解为：

$$
\mathbf u=J^T(JJ^T+\lambda^2I)^{-1}\mathbf w
$$

- $\mathbf w=[collective,roll,pitch,yaw]^T$；
- $\mathbf u$ 是各旋翼 0～1 推力分数；
- $\lambda$ 是 `DampedPseudoInverseLambda`。

$\lambda$ 增大时矩阵更稳定，但跟踪更软、残差更大；过小则在布局退化或旋翼故障时可能放大数值误差。

### 8.3 主动集约束

普通伪逆可能得到负推力或超过满推力。当前求解器最多迭代 N 次：

1. 对自由旋翼求阻尼伪逆；
2. 找出违反 `[0,1]` 最严重的旋翼；
3. 把它锁到 0 或 1；
4. 从剩余 Wrench 中扣除锁定旋翼贡献；
5. 对剩余旋翼重新求解。

最终记录：

- 期望与已分配 Wrench；
- 各轴残差；
- 残差 L2 范数；
- 饱和电机；
- 失效电机；
- 活动约束数量。

力矩轴残差还会回传给下一物理步的角速度 PID，用于阻止积分继续向已经饱和的方向累积。

### 8.4 `AxisWeights` 的真实状态

虽然配置中存在 `AxisWeights=(Thrust, Roll, Pitch, Yaw)`，当前代码已经回退到标准阻尼伪逆，**没有把这个字段带入法矩阵或分层去饱和算法**。原因是旧的行加权公式会破坏满秩情况下的精确解并可能翻转力矩。

因此当前版本：

- 调整 `AxisWeights` 没有运行效果；
- 不应向策划暴露该参数；
- 若未来需要“饱和时先牺牲 Yaw、再牺牲总距”等优先级，应实现正确的层次化/顺序去饱和分配，而不是简单对 $JJ^T$ 行加权。

---

## 9. 旋翼健康、降效与 FailurePolicy

`FRotorFailureManager` 与已经删除的 `RotorHitRecovery` 游戏化碰撞恢复策略不是同一系统。前者是飞控仍在使用的通用旋翼健康与权限管理器。

支持的操作包括：

- `FailRotor(Index)`；
- `RecoverRotor(Index)`；
- `SetRotorEffectiveness(Index, 0..1)`；
- `FailRotors(Indices)`；
- `RecoverAllRotors()`。

`Effectiveness=0` 表示完全失效；`0～1` 表示部分失效。有效率同时缩小旋翼最大可分配推力和归一化分配列。全失效时还会立即停止对应 `UAirscrewComponent` 的输出。

系统把当前总距、Roll、Pitch、Yaw 权限除以全健康基准，得到 0～1 的 `FControlAuthorityInfo`。`FailurePolicy` 可检查：

- 健康旋翼数；
- 剩余总距权限；
- 三轴剩余力矩权限。

违反条件持续 `ConfirmationTimeSeconds` 后，可：

- 仅记录警告；
- 切换飞行模式；
- 进入 Failsafe 并停桨；
- Emergency Stop。

锁存策略需要显式 `ResetFailurePolicyLatch()`；非锁存策略则要连续健康达到 `RecoveryConfirmationTimeSeconds` 才自动解除。

---

## 10. Autopilot 命令与执行管线

### 10.1 Typed Submit API

蓝图和大多数 C++ 玩法代码应使用类型化接口：

| API | 含义 | 是否自动完成 |
|---|---|---|
| `SubmitMoveTo` | 飞到世界点或 Actor 相对偏移 | 是 |
| `SubmitFollowPath` | 沿路径点序列飞行 | 是 |
| `SubmitCircleArc` | 飞有限圆弧，可多圈 | 是 |
| `SubmitOrbit` | 围绕圆心持续盘旋 | 否，除非超时/取消 |
| `SubmitVelocity` | 持续跟踪世界速度 | 否，除非超时/取消 |
| `SubmitHold` | 锁定提交瞬间的位置 | 持续 |

`SubmitMovementIntent` 是低层 C++ 逃生口，允许直接构造完整 `FAutopilotMovementIntent`；蓝图不应使用它绕过类型化字段约束。

每次 Submit 返回 `FAutopilotIntentHandle`。新命令会把旧活动命令标记为 `Interrupted/Replaced`。同类型命令可用 `UpdateMoveTo`、`UpdateOrbit` 等原地更新并保留 Handle；只有真正改变轨迹几何/规划参数时才重建轨迹。`UpdateHeadingTarget` 可以只换注视目标而不重建移动轨迹。

状态包括 `Accepted`、`Executing`、`Succeeded`、`Failed`、`Cancelled`、`Interrupted` 和 `Rejected`。终态结果最多缓存 64 条。

### 10.2 有限与持续命令的参数设计

有限轨迹使用 `FTrajectoryMotionConstraints`：

| 参数 | 含义 |
|---|---|
| `CruiseSpeedCmPerSec` | 轨迹计划希望达到的巡航速度，不保证短路径一定达到。 |
| `MaxAccelerationCmPerSecSq` | 起步/加速限制。 |
| `MaxDecelerationCmPerSecSq` | 终点提前制动限制。 |
| `MaxJerkCmPerSecCubed` | 水平加速度变化率限制。 |
| `MaxClimbRateCmPerSec` / `MaxDescentRateCmPerSec` | 垂直速度软限制。 |
| `MaxVerticalAccelerationCmPerSecSq` | 垂直加速度软限制。 |
| `MaxVerticalJerkCmPerSecCubed` | 垂直加速度变化率。 |
| `MaxYawRate/Acceleration/Jerk` | 航向运动整形限制。 |

持续 Velocity/Orbit 命令使用 `FContinuousMotionConstraints`，不再重复暴露巡航速度和终点减速度：

- Velocity 的目标速度就是 `DesiredVelocityCmPerSec`；
- Orbit 的水平速度由 $v=|\omega|R$ 唯一决定；
- 持续命令没有终点制动，只需要对加速度和 Jerk 做对称限制。

### 10.3 CruiseSpeed 与实际目标速度

`CruiseSpeedCmPerSec` 是有限轨迹的规划上限，不是“当前必须达到的速度”。实际速度还会被以下因素共同限制：

1. 路径剩余长度；
2. 加速/减速距离；
3. `PassThroughSpeedCmPerSec`；
4. FlightController 的水平硬速度；
5. 最大倾角换算出的物理加速度；
6. Chaos 线性阻尼及保留的控制余量。

旧文档或旧接口中的 `TargetSpeedCmPerSec` 已不应作为第二个等价巡航参数出现。有限命令只有 `CruiseSpeed`；穿越终点速度只在 `PassThrough` 模式下存在。

### 10.4 为什么需要 Jerk

Jerk 是加速度的一阶导数：

$$
j=\frac{da}{dt}
$$

只限制最大加速度，仍允许加速度从 0 在一帧内跳到上限，这相当于无限 Jerk。对无人机而言会造成：

- 姿态目标突然跳变；
- 推力和力矩需求突增；
- 电机/分配器饱和；
- 镜头、挂载、动画和网络插值观感突兀。

Motion Profile 用 Jerk 限制加速度的变化速度，并根据剩余误差计算能够在越过目标前把变化率降回 0 的停止速率。Jerk 越小越柔和，但响应和制动距离越长；战斗 NPC 也不应为了“灵敏”把 Jerk 无限放大，否则最终仍会由飞控硬限幅产生不连续动作。

### 10.5 到达判据

`StopAndComplete` 同时检查：

- 水平位置容差；
- 垂直位置容差；
- 速度容差；
- 航向容差；
- 上述条件连续满足的稳定时间。

`PassThrough` 不要求停下，到达轨迹末端后会把当前出口速度转换为持续 Velocity 意图。圆弧必须完成请求的弧长/圈数，不能只因为终点与起点重合就提前成功。

### 10.6 航向模式

- `KeepCurrent`：保持提交时航向；
- `FixedYaw`：固定世界偏航角；
- `FaceVelocity`：机头朝设定速度方向；
- `FaceTarget`：朝移动目标或独立 LookAt 目标。

移动目标 Actor 与航向目标 Actor 可以不同。例如无人机沿侧向轨迹移动，同时持续朝玩家射击。Actor 字段存在时，位置字段解释为 Actor 世界位置上的相对偏移。

---

## 11. 轨迹、制导、Motion Profile 与前馈

### 11.1 轨迹类型

`UTrajectoryGenerator` 支持：

- Waypoint/Line；
- FollowPath 分段直线；
- Bezier（路径点作为控制点）；
- Minimum Snap 时间参数化轨迹；
- CircleArc；
- Orbit 无限循环。

普通有限轨迹使用梯形/三角形速度剖面。制动距离来自：

$$
s_{brake}=\frac{v^2-v_{end}^2}{2a_{decel}}
$$

当路径太短，轨迹在达到巡航速度前就进入减速，自动退化成三角速度剖面。Minimum Snap 段使用原生时间参数化，不走普通弧长梯形剖面。

### 11.2 路径制导

只有 FollowPath、Orbit 和 CircleArc 会应用额外路径制导；MoveTo 直接使用轨迹名义设定值。

**Pure Pursuit** 使用自适应前瞻距离：

$$
L_{lookahead}=Clamp(k|v|+L_{min},L_{min},L_{max})
$$

然后把期望速度方向指向前瞻点。高速时前瞻更远、更平滑但更容易切角；低速时前瞻更近、贴线更紧。

**Vector Field** 以路径切向和横向误差修正构造速度场：

$$
\mathbf v_{dir}=\mathbf t+K_{cte}e_{cte}\mathbf n
$$

它适合连续高速曲线，但 `CrossTrackGain` 过大时会产生蛇形。

**Direct** 不做额外制导修正，完全使用轨迹名义速度。

### 11.3 Motion Profile

轨迹只给出名义 P/V/A/Yaw。Motion Profile 再用飞控硬限制和当前意图软限制的最小值，对水平速度、垂直速度和偏航逐通道进行加速度/Jerk 整形，输出 `FProfiledSetpoint`。

这种“软整形 + 硬限幅”的组合比只依赖 PID 输出 Clamp 更稳定：软整形尽量让设定值始终可达，硬限幅只承担最后安全边界。

### 11.4 前馈

`UFeedForwardCalculator` 从 Profiled Setpoint 生成：

- 位置环速度前馈；
- 速度环加速度前馈；
- 偏航角速度前馈；
- 重力与期望加速度合成的归一化推力前馈。

反馈负责修正误差，前馈负责已知运动学。如果关闭或错误设置 Kff，控制器只能等误差产生后再追赶；若靠增大 Kp 弥补，就更容易过冲和振荡。

### 11.5 协调转弯

`UTurnBehavior` 从期望速度方向的变化率生成偏航角速度前馈。超过 `CoordinatedTurnSpeedThresholdCmPerSec` 后，根据向心加速度生成 Roll：

$$
a_c=v\omega
$$

$$
\phi=\arctan2(a_c,g)
$$

Roll 受 `MaxBankAngleDegrees` 和 `MaxLateralAccelCmPerSecSq` 限制。低速更偏向用 Yaw 转头，高速通过压坡产生向心力，视觉和动力学都更自然。

### 11.6 悬停推力估计

Autopilot 可启用零阶 EKF，在线估计抵消重力所需的归一化推力 $x$：

$$
a_z=g\frac{thrust}{x}-g
$$

它能适应载重、推力效率或模型误差变化。`ProcessNoiseVariance` 决定估计跟踪变化的速度，`AccelNoiseVariance` 决定对差分加速度的信任程度，`GateSize` 用于拒绝剧烈机动中的异常新息。

普通策划只应选择是否启用；EKF 噪声、方差和门限由程序调校。

---

## 12. Aircraft Simulation LOD

### 12.1 设计目标

Simulation LOD 不是渲染 LOD，而是按距离和玩法重要性切换：

- 是否运行 Chaos；
- 是否运行飞控；
- Autopilot 慢逻辑更新间隔；
- 是否用运动学移动；
- 碰撞模式；
- 建议网络更新频率；
- 调试绘制。

全局策略评估由 `UAircraftSimulationWorldSubsystem` 负责，每架飞机的状态适配由 `UAircraftSimulationLODComponent` 负责。Subsystem 不知道 PID、轨迹或旋翼类型，只广播通用预算。

### 12.2 默认四级配置

| 层级 | 默认距离 | Chaos/飞控 | Autopilot 间隔 | 碰撞 | 网络频率 |
|---|---:|---|---:|---|---:|
| `FullPhysics` | ≤ 6000 cm | 开启 | 0，每游戏帧 | QueryAndPhysics | 30 Hz |
| `ReducedPhysics` | ≤ 15000 cm | 开启 | 0.05 s | QueryAndPhysics | 15 Hz |
| `Kinematic` | ≤ 50000 cm | 关闭 | 0.10 s | QueryOnly | 8 Hz |
| `Dormant` | 超出 Kinematic | 关闭 | 不运行 | Disabled | 2 Hz + Dormancy |

休眠层级的 `MaxDistanceCm=0` 是有意设计：Dormant 是超过 Kinematic 最大距离后的兜底层级，不使用自己的最大距离。

### 12.3 `ReducedPhysics` 的准确含义

当前 `BuildBudget()` 令 `bRunFlightController = Settings.bEnablePhysics`。因此 FullPhysics 和 ReducedPhysics 都：

- 保留 Chaos 物理；
- 每个 Chaos 物理步运行完整飞控；
- 保留物理碰撞。

ReducedPhysics 当前只通过降低 Autopilot/慢逻辑频率、网络更新频率和调试预算省成本，并没有使用低频姿态内环、简化旋翼模型或更粗的 Chaos 求解器。命名表达的是预算层级目标，不表示已经实现不同精度的物理解算器。

### 12.4 距离评估、滞回与驻留时间

Subsystem 每 0.1 秒刷新一次玩家位置，使用最近玩家距离。每个 Profile 可以配置：

- `EvaluationIntervalSeconds`：单架飞机多久允许重新评估；
- `MaxEvaluationsPerFrame`：全局时间切片上限；
- `DistanceHysteresisCm`：边界滞回；
- `MinimumTierResidenceSeconds`：普通距离切换的最短驻留时间。

降级需要越过当前边界加滞回，升级需要进入目标边界减滞回，避免玩家在边界附近时层级每帧抖动。

### 12.5 强制 FullPhysics 的重要性条件

以下任一状态会绕过距离和最短驻留时间，立即选择 FullPhysics：

- 玩家控制；
- 战斗中；
- 正在开火；
- 最近受伤；
- 正在从伤害状态恢复；
- 有外部物理约束；
- 任务关键；
- 显式要求保持物理。

`CombatKeepAliveSeconds` 会在最后一次战斗/受伤活动后继续保持 FullPhysics，防止攻击间隙立刻降级。

### 12.6 内部旋翼约束不会强制 FullPhysics

`bHasExternalPhysicsConstraint` 只表示载荷、绳索、与世界或其他 Actor 的关节等**外部约束**。机身与旋翼之间属于同一无人机 Rig 的内部约束，不应设置这个标志，否则所有无人机都会永久 FullPhysics，LOD 失去意义。

LOD 组件会记录 Owner 的全部 `UPrimitiveComponent`：

- 原碰撞模式；
- 是否在物理层级模拟；
- 相对根组件 Transform；
- 线速度与角速度。

进入非物理层时先停止飞控等力生产者，再关闭各刚体物理；回到物理层时先恢复碰撞、Transform、速度并唤醒刚体，再恢复消费者。这样机身 BOX 与旋翼球体/胶囊体组成的内部 Rig 可以整体在物理和非物理层之间切换。

### 12.7 Kinematic 层

Kinematic 层仍运行低频 Autopilot，Autopilot 发布缓存目标：

- Position；
- Velocity；
- Yaw。

WorldSubsystem 每帧推进根组件：

$$
p_{pred}=p+v_{target}\Delta t
$$

$$
p_{new}=Lerp(p_{pred},p_{target},1-e^{-k\Delta t})
$$

旋转使用 `RInterpTo`。`bSweepKinematicMovement` 决定 SetWorldLocationAndRotation 是否 Sweep；默认碰撞为 QueryOnly，不产生刚体碰撞响应。内部非物理组件按保存的相对 Transform 跟随根组件。

### 12.8 Dormant 层

Dormant 关闭飞控、Autopilot、运动学推进、物理和碰撞，并在服务器设置 `DORM_DormantAll`。离开 Dormant 时先 Flush Dormancy、恢复原 Dormancy 并 ForceNetUpdate；进入 Dormant 时也强制最后一次更新，确保客户端收到最终层级。

---

## 13. 当前网络同步方案

### 13.1 服务器权威 NPC

`AAircraftPawn` 默认：

```cpp
bReplicates = true;
SetReplicateMovement(true);
```

联网时，服务器和 `ROLE_SimulatedProxy` 在 BeginPlay 显式设置：

```cpp
SetPhysicsReplicationMode(
    EPhysicsReplicationMode::PredictiveInterpolation);
```

服务器运行 AI、Autopilot、FlightController、Airscrew 和 Chaos，客户端模拟代理不运行飞控/Autopilot，只消费服务器刚体状态。Predictive Interpolation 根据接收到的速度预测显示位置并平滑纠偏，适合没有本地输入的服务器控制 NPC。

### 13.2 LOD 与网络角色

默认 `bAuthoritySimulationOnly=true`：

- 服务器按玩家距离和重要性选择层级；
- `CurrentTier` 由 `UAircraftSimulationLODComponent` 复制到客户端；
- 客户端不自行按距离做权威层级决策；
- Full/Reduced 客户端默认保留 Chaos，以便 UE 物理复制执行 Predictive Interpolation；
- Kinematic/Dormant 客户端关闭本地 Chaos，根 Transform 由 Replicate Movement 驱动，内部组件跟随根组件。

`bClientProxyUsesDefaultPhysicsReplication` 是保留的序列化字段名。它开启时实际使用的模式是 Pawn BeginPlay 设置的 `PredictiveInterpolation`，不是旧的默认位置纠偏模式。

服务器会按层级设置 `NetUpdateFrequency`：30/15/8/2 Hz。这个频率只是 Actor 复制建议频率，不是飞控频率，也不是客户端插值帧率。

### 13.3 当前复制了什么

当前主要复制：

- Actor/根刚体移动状态；
- Simulation LOD 的 `CurrentTier`。

当前没有独立复制：

- Autopilot 活动命令、Handle 与进度；
- Profiled Setpoint；
- 每桨 RPM/推力；
- `FRotorHealthState`；
- PID、控制权限和分配诊断。

如果客户端 UI、动画或特效需要这些信息，应复制一个经过裁剪的展示状态，而不是把整套飞控运行状态高频复制。影响玩法判定的旋翼故障必须由服务器产生和保存；客户端只用于表现。

### 13.4 为什么现在不使用 UNetworkPhysicsComponent

`UNetworkPhysicsComponent` 的核心价值是维护输入/状态历史，让 Autonomous Proxy 可以本地预测，并在服务器校正后重模拟。当前 NPC 没有客户端本地输入，服务器刚体复制加 Predictive Interpolation 已经覆盖主要需求，接入输入历史只会增加状态设计和重模拟成本。

它并非“必须有玩家输入才能使用”，但没有需要预测的本地控制输入时收益很低。

### 13.5 未来玩家控制无人机

玩家直接控制后不能简单沿用 NPC Simulated Proxy 方案。建议把以下内容设计成网络物理帧状态：

- 归一化玩家输入；
- Arm/Flight/Attitude Mode；
- 必要的 Autopilot 接管命令；
- 旋翼故障/有效率变化事件；
- 能决定控制输出的关键离散状态。

Autonomous Proxy 和服务器必须保持 FullPhysics，不能因客户端距离进入 Kinematic/Dormant。当前 BeginPlay 有意没有给 `ROLE_AutonomousProxy` 设置 PredictiveInterpolation，因为自主代理需要单独选择预测/重模拟方案。实现玩家控制网络物理前，还需要审计 PID 积分、Motion Profile、旋翼一阶状态和 LOD 切换是否具备可重模拟的确定性。

---

## 14. 配置资产与调参职责

### 14.1 UFlightControllerProfileAsset

这是“机体级硬件与控制器”配置。每种质量、惯量、旋翼布局和推力规格应有独立资产。

#### 运动硬限制

当前新资产默认值：

| 参数 | 默认 | 调大后的影响 |
|---|---:|---|
| `MaxTiltAngleDegrees` | 25° | 水平机动更强，但垂直推力余量和稳定裕度降低。 |
| `MaxYawRateDegreesPerSec` | 90°/s | 转头更快。 |
| `MaxRoll/PitchRateDegreesPerSec` | 180°/s | 压坡更快，过大可能激励振荡。 |
| `MaxClimbRateCmPerSec` | 300 | 最大上升更快。 |
| `MaxDescentRateCmPerSec` | 200 | 最大下降更快。 |
| `MaxHorizontalSpeedCmPerSec` | 800 | Autopilot 和手动水平速度硬上限。 |
| `MaxHorizontalAccelerationCmPerSecSq` | 600 | 更敏捷，但仍受倾角、推力和阻尼限制。 |
| `MaxVerticalAccelerationCmPerSecSq` | 500 | 垂直响应更快。 |
| `Min/Hover/MaxCollectiveCommand` | 0 / 0.5 / 1 | 必须满足 Min ≤ Hover ≤ Max；Hover 应接近真实悬停点。 |

#### PID 组

| 控制环 | 输入 -> 输出 | 主要调节目标 |
|---|---|---|
| Position X/Y | 位置误差 -> 期望速度 | 到点刚度、稳态位置误差 |
| Velocity X/Y | 速度误差 -> 水平加速度 | 平移响应、制动和阻尼 |
| Altitude | 高度误差 -> 垂直速度 | 高度回正速度 |
| Vertical Velocity | 垂直速度误差 -> 总距偏移 | 上下振荡与悬停抗扰 |
| Angle Roll/Pitch/Yaw | 姿态误差 -> 角速度 | 回平和航向跟踪 |
| Rate Roll/Pitch/Yaw | 角速度误差 -> 归一化力矩 | 最内环稳定性 |

必须从内向外调：Rate -> Angle -> Velocity/VerticalVelocity -> Position/Altitude -> Autopilot。

`Kp` 增大提高即时刚度；`Ki` 消除恒定偏差但容易积累；`Kd` 增加阻尼但会放大噪声；`Kff` 让已知轨迹导数直接进入控制链。任何 Kff 修改都应同时检查上游是否已经把相同前馈加入设定值，避免双重前馈。

#### 姿态与阻尼配置

| 参数 | 建议 |
|---|---|
| `AngularDampingFeedForwardScale` | 默认 1；Chaos 角阻尼被修改后重新验证。 |
| `bEnableAttitudeRefModel` | 建议开启。 |
| `RefModelNaturalFrequency` | 默认 6 rad/s；越大越硬。 |
| `RefModelRateFFLimitDegPerSec` | 默认 100°/s；是参考模型速度安全网。 |
| `bEnableQuaternionAttitude` | 建议开启。 |
| `YawWeight` | 默认 0.4；越低越优先推力方向。 |
| `LinearDampingFeedForwardScale` | 默认 1；只在 Chaos 线性阻尼模型可信时完整补偿。 |
| `DampingAccelerationReserveFraction` | 默认 0.2；越大越稳健但持续极速越低。 |
| `VerticalDampingFeedForwardScale` | 默认 1；控制稳态升降阻尼补偿。 |

#### 分配器与故障策略

- `DampedPseudoInverseLambda=0.05` 是当前正常布局的轻度正则化起点。
- `bEnableTiltCompensation` 建议开启。
- `MinCosTilt=0.1` 是数学防爆下限，不是玩法倾角。
- `AxisWeights` 当前未接线。
- FailurePolicy 默认关闭；启用前必须专门验证每种故障动作。

### 14.2 UAutopilotProfileAsset

这个资产控制同一机体在路径跟踪和视觉动作上的“驾驶风格”：

- 是否协调转弯；
- 转弯速度阈值、最大 Bank 和最大横向加速度；
- Pure Pursuit / Vector Field / Direct；
- 前瞻距离或横向误差增益；
- 是否启用悬停推力 EKF 及其程序级参数。

它不再重复存放每条任务的 Cruise、Acceleration、Jerk 和 Arrival 参数。这些属于 Submit 命令本身，避免 Profile 和命令同时控制同一件事。

### 14.3 UAircraftSimulationLODProfileAsset

这个资产属于“同类 NPC 的性能预算”，不属于飞控手感。建议按玩法类别建立：普通巡逻机、精英/首领、任务关键机、装载外部物理载荷的机型。

最重要的调节项：

- 三个有效距离边界；
- 评估间隔和每帧评估预算；
- 滞回和最短驻留时间；
- 战斗 KeepAlive；
- Kinematic 修正速率和 Sweep；
- 权威模拟/客户端复制策略；
- 各层网络频率。

### 14.4 策划最小暴露集合

普通策划每条命令只需要：

1. 目标点/目标 Actor/路径点；
2. Cruise、加速度、减速度和 Jerk；
3. 垂直速度/加速度/Jerk；
4. Heading Mode 与可选 LookAt；
5. Arrival Mode、容差、稳定时间和 Timeout；
6. Orbit/CircleArc 的半径、角速度或起止角。

推荐提供预设：

| 风格 | Cruise | Accel/Decel | Jerk | 用途 |
|---|---:|---:|---:|---|
| 柔和巡逻 | 300–500 | 150–250 | 500–1000 | 展示、巡逻、镜头友好 |
| 标准战斗 | 600–800 | 300–500 | 1200–2000 | 常规追击与拉扯 |
| 快速突击 | 800–1200 | 500–800 | 2000–3500 | 高机动敌人；必须受机体硬限制裁剪 |

PID、Chaos 固定步长、分配器、EKF 噪声、故障权限阈值和网络物理模式不应交给普通策划。

---

## 15. C++ 与蓝图使用示例

### 15.1 C++ 提交 MoveTo

```cpp
if (UAutopilotComponent* Autopilot = Aircraft->GetAutopilotComponent())
{
    Autopilot->SetAutopilotActive(true);

    FAutopilotMoveToCommand Command;
    Command.TargetPositionCm = TargetLocation;
    Command.Options.MotionConstraints.CruiseSpeedCmPerSec = 700.0f;
    Command.Options.MotionConstraints.MaxAccelerationCmPerSecSq = 400.0f;
    Command.Options.MotionConstraints.MaxDecelerationCmPerSecSq = 500.0f;
    Command.Options.MotionConstraints.MaxJerkCmPerSecCubed = 1600.0f;
    Command.Options.Heading.Mode = EAutopilotHeadingMode::FaceVelocity;
    Command.Options.ArrivalMode = EAutopilotArrivalMode::StopAndComplete;
    Command.Options.ArrivalCriteria.HorizontalToleranceCm = 75.0f;
    Command.Options.ArrivalCriteria.SpeedToleranceCmPerSec = 50.0f;
    Command.Options.TimeoutSeconds = 15.0f;

    const FAutopilotIntentHandle Handle = Autopilot->SubmitMoveTo(Command);
}
```

联网游戏中这段逻辑必须在服务器执行。不要在普通客户端直接 Submit 后期望服务器自动接收；当前组件没有内建 RPC。

### 15.2 动态目标与独立瞄准

```cpp
FAutopilotMoveToCommand Command;
Command.TargetActor = CoverAnchor;
Command.TargetPositionCm = FVector(0.0f, 0.0f, 300.0f);
Command.Options.Heading.Mode = EAutopilotHeadingMode::FaceTarget;
Command.Options.Heading.bUseLookAtTarget = true;
Command.Options.Heading.LookAtActor = PlayerActor;
```

这里移动目标是掩体锚点，机头目标是玩家，两者互不耦合。

### 15.3 蓝图调用顺序

```text
Get Autopilot Component
  -> Set Autopilot Active(true)
  -> Make Autopilot MoveTo/FollowPath/... Command
  -> Submit...
  -> 保存 Intent Handle
  -> 监听 OnIntentStarted / OnIntentFinished
  -> 必要时 Update... 或 CancelMovementIntent
```

如果 Submit 返回 Handle 但结果是 `Rejected`，优先检查：Autopilot 是否激活、FlightController Profile 是否有效、命令参数是否合法、调用是否发生在服务器。

---

## 16. 性能模型与优化建议

### 16.1 主要 CPU 成本

单架 Full/Reduced 无人机的成本主要来自：

- 每个 Chaos 物理步的状态读取和级联 PID；
- N 个旋翼的电机模型与施力；
- 最多 N 次 4×4 线性系统的主动集分配；
- 多刚体/约束碰撞；
- 游戏线程 Autopilot 轨迹与制导。

渲染 Mesh LOD、动画 Tick LOD 和 Simulation LOD 应同时使用，但三者解决的是不同成本。

### 16.2 当前 LOD 的实际收益

- Full -> Reduced：主要省 Autopilot、网络和调试开销，Chaos/飞控成本基本不变。
- Reduced -> Kinematic：关闭 Chaos 和飞控，是最大性能台阶。
- Kinematic -> Dormant：再关闭 Autopilot、移动、碰撞和大部分网络更新。

如果 Full 和 Reduced 的性能差异不明显，这是当前设计的预期结果，不代表 LOD 没有工作。

### 16.3 推荐监控指标

- `STAT_AircraftSimulationLOD`；
- 各层级无人机数量；
- 每帧实际评估数量；
- Chaos 活跃刚体与约束数量；
- 每架旋翼数量；
- Allocation Residual 与饱和旋翼数；
- 服务器 Actor 网络更新量；
- Kinematic Sweep 命中率。

### 16.4 进一步优化方向

1. 给 ReducedPhysics 实现真正的简化执行器/碰撞策略，而不是抽帧姿态内环。
2. 对远距离纯视觉旋翼关闭独立物理刚体，使用动画表现。
3. 把非关键客户端 VFX 状态从真实每桨状态中解耦。
4. 对大量同 Profile 飞机预计算不随质心/布局变化的分配几何；故障时再局部重建。
5. 避免一架 Profile 的超大 `MaxEvaluationsPerFrame` 意外抬高整个 WorldSubsystem 的全局评估预算。

---

## 17. 调试顺序与常见故障

### 17.1 推荐调试顺序

1. 验证 Physics Asset 的质量、惯量、质心和阻尼。
2. 验证每个旋翼位置、推力轴、CW/CCW 旋向和最大推力。
3. 关闭 Autopilot，只验证 Rate/Angle 内环。
4. 验证悬停总距、垂直速度与高度环。
5. 验证水平速度和位置环。
6. 用低速度/低加速度 MoveTo 验证 Autopilot。
7. 再验证制动、到达判据、路径制导、圆弧和协调转弯。
8. 最后验证旋翼故障、LOD 切换和联网表现。

### 17.2 现象定位

| 现象 | 优先检查 |
|---|---|
| 启动即爆炸/翻转 | 旋翼推力轴、CW/CCW、力矩符号、单位转换、质心、物理约束初始穿透 |
| 悬停持续上升/下降 | `HoverCollectiveCommand`、总推力/质量、垂直阻尼、EKF 是否收敛 |
| 横移方向反了 | Roll/Pitch 符号、四元数 X/Y 翻转、旋翼布局 |
| 到点穿过 | Deceleration/Jerk 太小或 Cruise 太大、速度环不足、推力饱和 |
| 到点来回摆 | Position/Velocity 增益过高、Arrival 过严、阻尼前馈错误 |
| 路径切角 | 前瞻过大、速度过高、制导修正不足 |
| 路径蛇形 | 前瞻过小、CrossTrackGain 过高、速度环阻尼不足 |
| 转弯掉高度 | Tilt Compensation、推力余量、Bank/横向加速度过大 |
| 偏航自旋 | 旋向不平衡、反扭矩系数、Yaw 前馈重复、Yaw Rate PID |
| 客户端抖动 | 是否为 Simulated Proxy、PredictiveInterpolation、网络频率、Dormancy 切换 |
| Reduced 仍很耗 CPU | 当前 Reduced 仍保留完整 Chaos 和飞控，这是已知边界 |
| 修改 AxisWeights 无效果 | 当前字段未接线 |

### 17.3 自动化测试范围

源码包含针对以下领域的自动化测试：

- 物理单位转换；
- 力矩符号约定；
- FlightControlDynamics 阻尼前馈；
- FailurePolicy；
- Simulation LOD 策略和集成；
- Autopilot 移动执行；
- 轨迹生成与 Minimum Snap。

自动化测试能发现数学和状态机回归，但不能替代真实场景中的 Physics Asset、约束、碰撞、网络延迟和多机性能测试。

---

## 18. 当前已知限制与维护注意事项

1. **状态真值化**：没有传感器噪声和融合，仿真飞控会比实机容易。
2. **ReducedPhysics 名称大于实现**：当前没有真正的低精度物理模型。
3. **网络命令层未复制**：AI/玩法必须在服务器权威执行。
4. **玩家控制网络路径未完成**：Autonomous Proxy 不应直接套用 NPC 的 Simulated Proxy 插值方案。
5. **AxisWeights 未生效**：未来实现层次化分配前保持只读/隐藏。
6. **部分遗留数据结构未接线**：不要仅凭 `UPROPERTY` 存在就认为参数会影响运行结果。
7. **Profile 默认值与已有资产可能不同**：运行时以实际 DataAsset 序列化值为准；修改 C++ 默认只影响新建/重置资产。
8. **Autopilot Tick 是游戏线程慢逻辑**：Kinematic 层按 0.1 s 更新目标，WorldSubsystem 每帧只积分缓存目标。
9. **内部多刚体 Rig 的 LOD 切换需要场景验证**：复杂约束从非物理恢复到物理时仍应检查初始重叠和约束冲量。

---

## 19. 源码索引

| 主题 | 主要文件 |
|---|---|
| 公共接口与模块解耦 | `AircraftCore/Public/AircraftFlightControllerInterface.h`、`AutopilotProvider.h` |
| 移动意图 | `AircraftCore/Public/AircraftMovementIntent.h` |
| LOD 公共类型 | `AircraftCore/Public/AircraftSimulationLODTypes.h` |
| Pawn 组合与网络模式 | `AircraftLab/Private/AircraftPawn.cpp` |
| 飞控时序 | `AircraftLab/Private/FlightControllerComponent.cpp` |
| 控制律 | `AircraftLab/Private/FlightControllerControl.cpp` |
| 分配器 | `AircraftLab/Private/FlightControllerAllocation.cpp` |
| 旋翼健康 | `AircraftLab/Private/RotorFailureManager.cpp` |
| 旋翼物理 | `AircraftLab/Private/AirscrewComponent.cpp` |
| 单位边界 | `AircraftLab/Public/AircraftPhysicsUnits.h` |
| 飞控配置 | `AircraftLab/Public/FlightControllerProfileAsset.h`、`Private/FlightControllerDefaults.cpp` |
| LOD | `AircraftSimulationLODComponent.cpp`、`AircraftSimulationWorldSubsystem.cpp`、`AircraftSimulationLODPolicy.cpp` |
| Autopilot 主管线 | `AircraftAutopilot/Private/AutopilotComponent.cpp` |
| 命令类型 | `AircraftAutopilot/Public/AutopilotMovementTypes.h` |
| 意图执行 | `AircraftAutopilot/Private/AutopilotMovementExecutor.cpp` |
| 轨迹 | `AircraftAutopilot/Private/Trajectory/` |
| Motion Profile | `AircraftAutopilot/Private/MotionProfile/` |
| 路径制导 | `AircraftAutopilot/Private/PathFollowing/` |
| 前馈/转弯/EKF | `FeedForward/`、`Turn/`、`HoverThrust/` |

---

## 结语

AircraftLab 当前的核心不是某一个 PID 数字，而是清晰的控制边界：玩法提交意图，Autopilot 生成连续设定值，FlightController 闭合刚体状态，Allocator 把 Wrench 分配给旋翼，Airscrew 在唯一的 Chaos 边界施加具有正确单位和力臂的力。

Simulation LOD 和网络同步也遵守同一原则：服务器决定真实物理状态；客户端只做远程代理表现；远距离通过关闭整个物理闭环获得数量级更大的收益，而不是在冻结状态上重复或抽样运行不稳定的内环。

维护这套系统时，应始终先问“这个参数属于哪一层、由谁消费、在哪个线程运行、是否是权威状态”，再开始修改公式或调参。只要这些边界保持清晰，飞控、AI、性能和网络功能就可以继续独立演进，而不会重新耦合成一个难以验证的单体组件。
