---
title: "Chaos 运动学同步详解 — P.Chaos.SyncKinematicOnGameThread 的三态控制与双路径镜像"
excerpt: "从 Chaos 多线程架构出发，拆解 P.Chaos.SyncKinematicOnGameThread 的三态语义（0=即时更新、1=结果回写、-1=逐对象决策）及三个镜像判定函数如何在 SetKinematicTarget 与 PullFromPhysicsState 两条路径间维持恰一更新不变式。覆盖速度始终复制规则、dirty particle 收集优化、UpdateKinematicFromSimulation 标志默认值与 PhysicalAnimationComponent 覆盖行为。"
date: "2026-07-02"
category: "Engine"
subtopic: "ChaosPhysics"
tags: ["Chaos", "运动学", "Kinematic", "多线程同步", "UE5", "源码分析"]
readTime: "阅读约30分钟"
---

> Chaos 物理引擎运行在独立于游戏线程的**物理线程**（internal thread）上。刚体分**动态**（Dynamic）与**运动学**（Kinematic）两种：动态体的位置由求解器积分得出，自然需要从物理结果回写到游戏线程；运动学体的位置则由游戏线程代码（如 `SetKinematicTarget`）驱动，求解器只负责将其移动到目标位置并计算衍生速度。
>
> 这就引出一个核心问题：**运动学体的游戏线程变换（X, R）应该在哪里更新？** 是在 `SetKinematicTarget` 调用时立即写入游戏线程侧的粒子，还是等物理步进完成后从模拟结果回写？`P.Chaos.SyncKinematicOnGameThread` 正是控制这个选择的全局开关，而它的设计远比表面复杂——涉及三条镜像判定路径、一个逐对象标志、以及一条"速度始终复制"的隐藏规则。
>
> 本文基于 UE 5.8 源码（`SingleParticlePhysicsProxy.cpp`、`PBDRigidsSolver.cpp`、`ChaosEngineInterface.cpp`、`RigidParticleControlFlags.h`）逐行拆解这条同步链路。

---

## 一、问题背景：Chaos 的双线程与运动学体的特殊性

### 1.1 多线程架构下的数据流

Chaos 采用 **Push/Pull 双缓冲**架构：游戏线程（external）通过 PushData 将参数变更推入物理线程（internal），物理线程求解后通过 PullData 将结果拉回游戏线程。对于**动态体**，这个流程是单向的——游戏线程设置初始状态，物理线程计算新位置，结果回写。

但**运动学体**不同。它的位置目标由游戏线程设定（`SetKinematicTarget`），物理线程只负责"执行移动"——将体移动到目标位置，并根据位移计算线/角速度。这导致一个歧义：**游戏线程侧的粒子变换应该在什么时候更新到目标值？**

- **路径 A（即时更新）**：`SetKinematicTarget` 调用时，立刻将游戏线程侧的 X/R 写为目标变换。
- **路径 B（结果回写）**：`SetKinematicTarget` 只设置目标，不写 X/R；物理步进完成后，`PullFromPhysicsState` 从模拟结果中回写 X/R。

两条路径各有利弊：

| | 路径 A：即时更新 | 路径 B：结果回写 |
|---|---|---|
| **延迟** | 零延迟——当帧可见 | 一帧延迟——需等物理步进完成 |
| **一致性** | 游戏线程变换可能"领先"物理线程 | 变换与物理线程计算结果完全一致 |
| **速度** | ❌ 不更新（代码标注 `@todo`） | ✅ 从位移自动推导 |
| **插值** | 不经过渲染插值管线 | ✅ 支持渲染插值（`NextPullData` + `Alpha`） |
| **Dirty 标记** | 需标记 kinematic 为 dirty | 可跳过 dirty 标记（sync=0 时） |

### 1.2 不变式：恰一更新

源码注释（`SingleParticlePhysicsProxy.cpp:328-330`）明确指出了设计意图：

> *Note that kinematics should either be updated here (following simulation), or when the kinematic target is set in `FChaosEngineInterface::SetKinematicTarget_AssumesLocked`. If the logic in one place is changed, it should be checked in the other place too.*

即：**运动学体的变换必须在且仅在一条路径上更新**——要么在 `SetKinematicTarget` 时即时写入（路径 A），要么在 `PullFromPhysicsState` 时从模拟结果回写（路径 B），不能两者都做，也不能都不做。`P.Chaos.SyncKinematicOnGameThread` 的职责就是协调这两条路径，确保不变式成立。

---

## 二、P.Chaos.SyncKinematicOnGameThread 的定义与三态语义

### 2.1 CVAR 定义

变量定义与注册位于 `SingleParticlePhysicsProxy.cpp:28-34`：

```cpp
// This allows forcing the game thread/actor to get or not get transform updates
// from the simulation result for kinematics - noting that they may already have
// been set in the SetKinematicTransform function.
// Velocity and such will still be copied in any case. The default value of -1
// uses the UpdateKinematicFromSimulation flag on the BodyInstance.
CHAOS_API int32 SyncKinematicOnGameThread = -1;
FAutoConsoleVariableRef CVar_SyncKinematicOnGameThread(
    TEXT("P.Chaos.SyncKinematicOnGameThread"),
    SyncKinematicOnGameThread,
    TEXT(
        "If set to 1, kinematic bodies will always send their transforms back to "
        "the game thread, following the simulation step/results. If 0, then they "
        "will never do so, and kinematics will be updated immediately their "
        "kinematic target is set. Any other value (e.g. the default -1) means "
        "that the behavior is determined on a per-object basis with the "
        "UpdateKinematicFromSimulation flag in BodyInstance."));
```

### 2.2 三态语义

| 值 | 路径 A（SetKinematicTarget 即时写 X/R） | 路径 B（PullFromPhysicsState 回写 X/R） | Dirty 标记优化 |
|---|---|---|---|
| **0** | ✅ 始终即时写入 | ❌ 始终跳过 | ✅ 跳过 kinematic dirty 收集 |
| **1** | ❌ 始终跳过 | ✅ 始终回写 | ❌ 正常标记 dirty |
| **-1**（默认） | 取决于逐对象 `UpdateKinematicFromSimulation` | 取决于逐对象 `UpdateKinematicFromSimulation`（取反） | 正常标记 dirty |

默认值 **-1** 将决策权下放到逐对象级别，由 `FBodyInstance::bUpdateKinematicFromSimulation` 标志决定。该标志默认为 `false`（`BodyInstanceCore.cpp:25`），因此**默认行为等同于 0**——即时更新，不回写。

---

## 三、三条镜像判定路径

`SyncKinematicOnGameThread` 的值在源码中被**三个结构完全相同的判定函数**读取，分别守护三条不同的代码路径。这三个函数使用完全相同的 `switch` 模式，形成"镜像"关系——改一处必须改另外两处。

### 3.1 判定函数 1：ShouldSetKinematicTargetSetGameTransform（路径 A 的守门人）

位于 `ChaosEngineInterface.cpp:2573-2591`，决定 `SetKinematicTarget_AssumesLocked` 是否在游戏线程**立即写入** X/R：

```cpp
// Match the logic in places that use SyncKinematicOnGameThread (like
// FSingleParticlePhysicsProxy::PullFromPhysicsState) - to see if that will
// be updating the position. If not, then we need to do it here.
bool ShouldSetKinematicTargetSetGameTransform(
    const FPhysicsActorHandle& InActorReference)
{
    Chaos::FPBDRigidParticle* Rigid = InActorReference->GetRigidParticleUnsafe();
    if (Rigid && Rigid->ObjectState() == Chaos::EObjectStateType::Kinematic)
    {
        switch (Chaos::SyncKinematicOnGameThread)
        {
        case 0:
            return true;   // GT 变换必须在此处设置
        case 1:
            return false;  // GT 变换将从模拟结果获取
        default:
            return !Rigid->UpdateKinematicFromSimulation(); // 逐对象决策
        }
    }
    // 非 kinematic 体保持历史行为：通过 kinematic target 设置 GT 变换
    return true;
}
```

**返回 `true`** = 路径 A 负责 → 立即写入 X/R。
**返回 `false`** = 路径 A 不负责 → 交给路径 B。

### 3.2 判定函数 2：ShouldUpdateTransformFromSimulation（路径 B 的守门人）

位于 `SingleParticlePhysicsProxy.cpp:302-317`，决定 `PullFromPhysicsState` 是否从模拟结果**回写** X/R：

```cpp
bool ShouldUpdateTransformFromSimulation(const Chaos::FPBDRigidParticle& Rigid)
{
    if (Rigid.ObjectState() == Chaos::EObjectStateType::Kinematic)
    {
        switch (Chaos::SyncKinematicOnGameThread)
        {
        case 0:
            return false;  // 不从模拟结果回写
        case 1:
            return true;   // 从模拟结果回写
        default:
            return Rigid.UpdateKinematicFromSimulation(); // 逐对象决策
        }
    }
    return true; // 非 kinematic 体始终从模拟结果回写
}
```

注意此函数与函数 1 的**逻辑取反关系**：`sync=0` 时路径 A 返回 `true`（负责写入）、路径 B 返回 `false`（不回写）；`sync=1` 时路径 A 返回 `false`、路径 B 返回 `true`。在 `default` 分支中，两者通过 `!UpdateKinematicFromSimulation()` 与 `UpdateKinematicFromSimulation()` 互为补集。这确保了"恰一更新"不变式。

### 3.3 判定函数 3：ShouldUpdateFromSimulation（物理线程侧镜像）

位于 `PBDRigidsSolver.cpp:1945-1963`，运行在**物理线程**侧，结构与函数 2 完全一致：

```cpp
template<typename TRigidParticle>
bool ShouldUpdateFromSimulation(const TRigidParticle& InRigidParticle)
{
    if (InRigidParticle.ObjectState() == Chaos::EObjectStateType::Kinematic)
    {
        switch (Chaos::SyncKinematicOnGameThread)
        {
        case 0:
            return false;
        case 1:
            return true;
        default:
            return InRigidParticle.UpdateKinematicFromSimulation();
        }
    }
    // 假设 sleeping/static 粒子不会重复出现在 dirty 列表中
    return true;
}
```

此函数在物理线程的 dirty particle 结果收集阶段使用，决定哪些 kinematic 粒子的结果需要被缓冲到 PullData。

---

## 四、路径 A 详解：SetKinematicTarget_AssumesLocked

### 4.1 完整调用流程

`SetKinematicTarget_AssumesLocked`（`ChaosEngineInterface.cpp:2593`）是游戏线程设置运动学目标的标准入口，被 `BodyInstance::SetKinematicTarget`、`FPhysScene_Chaos::SetKinematicTarget_AssumesLocked`、`PhysicalAnimationComponent` 等调用：

```cpp
void FChaosEngineInterface::SetKinematicTarget_AssumesLocked(
    const FPhysicsActorHandle& InActorReference,
    const FTransform& InNewTarget)
{
    // 1. 始终设置 kinematic target（物理线程将据此移动体）
    const Chaos::FKinematicTarget NewKinematicTarget =
        Chaos::FKinematicTarget::MakePositionTarget(InNewTarget);
    InActorReference->GetGameThreadAPI().SetKinematicTarget(NewKinematicTarget);

    // 2. 条件性即时更新游戏线程侧的 X/R
    if (ShouldSetKinematicTargetSetGameTransform(InActorReference))
    {
        // 不 invalidate X/R——它们将通过 kinematic target 信息正确计算
        InActorReference->GetGameThreadAPI().SetX(InNewTarget.GetLocation(), false);
        InActorReference->GetGameThreadAPI().SetR(InNewTarget.GetRotation(), false);
        InActorReference->GetGameThreadAPI().UpdateShapeBounds();

        FChaosScene* Scene = GetCurrentScene(InActorReference);
        Scene->UpdateActorInAccelerationStructure(InActorReference);
    }
}
```

### 4.2 速度缺失问题

代码中有一条关键的 `@todo` 注释：

> *@todo(chaos): Velocity is not updated here and never will be because we don't read back from the physics thread. We should fix this, but it is awkward to handle multiple calls to SetKinematicTarget on the same frame if we don't have a "previous transform" from which to calculate the velocity and we have overwritten X/R already.*

当路径 A 负责更新（`sync=0` 或逐对象标志为 `false`）时，**速度不会在此处更新**。原因有二：

1. **没有前一帧变换**：如果同一帧内多次调用 `SetKinematicTarget`，X/R 已被覆写，无法从位移差计算速度。
2. **物理线程尚未运行**：运动学体的速度是由物理线程根据位移差推导的（`FKinematicTarget` 的 `Position` 模式：移动到目标，速度 = 位移 / dt），游戏线程此时没有这个信息。

这就是为什么速度的回写被推迟到路径 B——即使 `sync=0` 时 X/R 不从模拟结果回写，速度仍然会从模拟结果中复制（见下一节）。

---

## 五、路径 B 详解：PullFromPhysicsState

### 5.1 变换回写的条件门控

`PullFromPhysicsState`（`SingleParticlePhysicsProxy.cpp:319`）是物理结果回写到游戏线程的核心函数。在处理 X/R 之前，它先通过 `ShouldUpdateTransformFromSimulation` 判定：

```cpp
bool FSingleParticlePhysicsProxy::PullFromPhysicsState(
    const Chaos::FDirtyRigidParticleData& PullData,
    int32 SolverSyncTimestamp,
    const Chaos::FDirtyRigidParticleData* NextPullData,
    const Chaos::FRealSingle* Alpha,
    const FDirtyRigidParticleReplicationErrorData* Error,
    const Chaos::FRealSingle AsyncFixedTimeStep)
{
    Chaos::FPBDRigidParticle* Rigid = Particle ? Particle->CastToRigidParticle() : nullptr;
    if (Rigid)
    {
        bool bNeedUpdateShapeBounds = bPullPhysicsStateForceUpdateBounds;
        bool bUpdatePositionFromSimulation = ShouldUpdateTransformFromSimulation(*Rigid);
        // ...
```

后续的 X/R 写入全部被 `if (bUpdatePositionFromSimulation)` 包裹。例如无插值的分支：

```cpp
        if (bUpdatePositionFromSimulation)
        {
            if (SolverSyncTimestamp >= ProxyTimestamp->OverWriteX.Timestamp)
            {
                Rigid->SetX(PullData.X, false);
                bNeedUpdateShapeBounds = true;
            }
            if (SolverSyncTimestamp >= ProxyTimestamp->OverWriteR.Timestamp)
            {
                Rigid->SetR(PullData.R, false);
                bNeedUpdateShapeBounds = true;
            }
        }
```

### 5.2 隐藏规则：速度始终复制

关键细节：**速度（V, W）和 ObjectState 的写入不受 `bUpdatePositionFromSimulation` 门控**。它们在 X/R 块之后，无条件执行：

```cpp
        // —— 以下不受 bUpdatePositionFromSimulation 门控 ——

        if (SolverSyncTimestamp >= ProxyTimestamp->OverWriteV.Timestamp)
        {
            Rigid->SetV(PullData.V, false);   // 速度始终从模拟结果复制
        }

        if (SolverSyncTimestamp >= ProxyTimestamp->OverWriteW.Timestamp)
        {
            Rigid->SetW(PullData.W, false);   // 角速度始终从模拟结果复制
        }

        if (SolverSyncTimestamp >= ProxyTimestamp->ObjectStateTimestamp)
        {
            Rigid->SetObjectState(PullData.ObjectState, true, /*bInvalidate=*/false);
        }
```

这与 CVAR 注释的声明完全一致：*"Velocity and such will still be copied in any case."*

**原因**：运动学体的速度不是游戏线程设定的，而是物理线程根据 kinematic target 的位移推导的（`FKinematicTarget::Position` 模式：计算 $\mathbf{v} = \Delta\mathbf{x} / \Delta t$，然后将模式设为 `Reset`）。游戏线程无法自行计算这个速度，因此无论变换走哪条路径，速度都必须从物理结果中获取。

### 5.3 两条路径的职责分工总结

| 数据 | 路径 A（SetKinematicTarget） | 路径 B（PullFromPhysicsState） |
|---|---|---|
| 位置 X | sync=0 时写入 | sync=1 时写入（支持渲染插值） |
| 旋转 R | sync=0 时写入 | sync=1 时写入（支持渲染插值） |
| 线速度 V | ❌ 不写入 | ✅ **始终写入** |
| 角速度 W | ❌ 不写入 | ✅ **始终写入** |
| ObjectState | ❌ 不写入 | ✅ **始终写入** |
| ShapeBounds | sync=0 时更新 | sync=1 时更新 |

---

## 六、Dirty Particle 收集优化

### 6.1 收集阶段的跳过逻辑

在 `PBDRigidsSolver.cpp` 的结果收集阶段（`CollectRigidResults` lambda），有两处对 kinematic 粒子的特殊处理（lines 2781-2796 和 3008-3023），结构完全相同：

```cpp
case EPhysicsProxyType::SingleParticleProxy:
{
    if (!bIsResim || DirtyParticle.SyncState() == ESyncState::HardDesync)
    {
        // Although per-particle we can control the syncing of target positions
        // (see ShouldUpdateFromSimulation) we cannot avoid marking kinematics as
        // dirty (unless the global config Chaos::SyncKinematicOnGameThread
        // forces it) because we always need the correct velocities/dynamics to
        // be synced back from the kinematic target.
        // FSingleParticlePhysicsProxy::PullFromPhysicsState will use the proper
        // checks to see whether it needs to sync the particle positions when
        // the dirty particle is processed.
        if (!(Chaos::SyncKinematicOnGameThread == 0
              && DirtyParticle.ObjectState() == EObjectStateType::Kinematic))
        {
            ActiveRigid.Add((FSingleParticlePhysicsProxy*)Proxy);
        }
    }
    break;
}
```

### 6.2 为什么 sync=0 才能跳过

注释解释了为什么只有 `sync=0`（而非逐对象标志为 `false`）才能跳过 dirty 收集：

> *we cannot avoid marking kinematics as dirty (unless the **global config** forces it) because we always need the correct velocities/dynamics to be synced back from the kinematic target.*

在默认的 `sync=-1` 模式下，即使某个 kinematic 体的 `UpdateKinematicFromSimulation` 为 `false`（路径 A 负责变换），它的**速度仍然需要从物理结果中回写**（路径 B 始终负责速度）。因此该体仍然必须进入 dirty 列表，才能触发 `PullFromPhysicsState` 的速度复制。

只有当**全局** `sync=0` 时，引擎才确定地知道"这个 kinematic 体不需要任何从模拟结果的回写"——因为 `PullFromPhysicsState` 中的 `ShouldUpdateTransformFromSimulation` 对所有 kinematic 体都会返回 `false`，而速度虽然不受此门控，但在 `sync=0` 时引擎做了额外假设（见下方注意）。

> **注意**：这里的优化仅跳过 dirty **收集**（避免加入 `ActiveRigid` 列表），不影响 `PullFromPhysicsState` 本身的执行逻辑。这是一个性能优化——`sync=0` 时 kinematic 体不会出现在需要回写结果的列表中，减少了 `BufferPhysicsResults` 的工作量。但这意味着 `sync=0` 时，kinematic 体的速度回写也可能被跳过——这是引擎接受的已知折衷。

---

## 七、UpdateKinematicFromSimulation 逐对象标志

### 7.1 定义与存储

逐对象标志 `bUpdateKinematicFromSimulation` 存储在 `FRigidParticleControlFlags` 的位域中（`RigidParticleControlFlags.h:88`）：

```cpp
FStorage bUpdateKinematicFromSimulation : 1;
```

通过粒子句柄暴露为读写接口（`ParticleHandle.h:1323-1331`）：

```cpp
inline bool UpdateKinematicFromSimulation() const
{
    return ControlFlags().GetUpdateKinematicFromSimulation();
}
inline void SetUpdateKinematicFromSimulation(bool bUpdateKinematicFromSimulation)
{
    PBDRigidParticles->ControlFlags(ParticleIdx)
        .SetUpdateKinematicFromSimulation(bUpdateKinematicFromSimulation);
}
```

### 7.2 默认值

`FBodyInstanceCore` 的构造函数（`BodyInstanceCore.cpp:25`）将其默认初始化为 `false`：

```cpp
FBodyInstanceCore::FBodyInstanceCore()
: bSimulatePhysics(false)
// ...
, bUpdateKinematicFromSimulation(false)   // <-- 默认 false
```

UPROPERTY 注释（`BodyInstanceCore.h:41-43`）说明了其语义：

> *When kinematic, whether the actor transform should be updated as a result of movement in the simulation, rather than immediately whenever a target transform is set.*

因此**默认行为**（`sync=-1` + `bUpdateKinematicFromSimulation=false`）等同于 `sync=0`：运动学体变换在 `SetKinematicTarget` 时即时更新，不从模拟结果回写。

### 7.3 设置路径

- **BodyInstance 创建**：`BodyInstance.cpp:1316` 从 BodyInstance 复制到 `ActorParams.bUpdateKinematicFromSimulation`，再通过 `Dynamic->SetUpdateKinematicFromSimulation(...)` 写入粒子。
- **运行时修改**：`FBodyInstance::SetUpdateKinematicFromSimulation`（`BodyInstance.cpp:4004`）转发到 `FPhysicsInterface::SetUpdateKinematicFromSimulation_AssumesLocked`。
- **ImmediatePhysics 适配器**：注意 ImmediatePhysics 的默认值为 `true`（`ImmediatePhysicsActorHandle_Chaos.h:40`），与 BodyInstance 的 `false` 相反——这是因为 ImmediatePhysics 用于同步（非异步）物理场景，结果即时可用，回写更合理。

### 7.4 PhysicalAnimationComponent 的覆盖

`PhysicalAnimationComponent`（`PhysicalAnimationComponent.cpp:487`）在创建物理驱动型 kinematic 体时强制设置 `Params.bUpdateKinematicFromSimulation = false`：

```cpp
Params.bUpdateKinematicFromSimulation = false;
```

**原因**：物理动画组件的 kinematic 体由物理模拟驱动其局部朝向/位置，但其变换由组件自身管理（通过 `SetKinematicTarget` 频繁更新）。设置为 `false` 确保变换的即时性——组件设置目标后立即可见，无需等待物理步进完成。这与 `sync=0` 的语义一致，只是作用域为逐对象。

---

## 八、完整决策流程图

```
                    P.Chaos.SyncKinematicOnGameThread
                              │
              ┌───────────────┼───────────────┐
              │               │               │
            == 0            == 1           == -1 (默认)
              │               │               │
              ▼               ▼               ▼
     ┌────────────────┐ ┌──────────────┐ ┌────────────────────┐
     │ ShouldSet...   │ │ ShouldSet... │ │ ShouldSet...       │
     │ GameTransform  │ │ GameTransform│ │ GameTransform      │
     │ = true         │ │ = false      │ │ = !UpdateKinematic │
     │                │ │              │ │   FromSimulation()  │
     └───────┬────────┘ └──────┬───────┘ └─────────┬──────────┘
             │                 │                    │
             ▼                 ▼                    ▼
     ┌───────────────────────────────────────────────────────┐
     │              SetKinematicTarget_AssumesLocked          │
     │                                                       │
     │  [始终] 设置 FKinematicTarget (物理线程将据此移动)      │
     │  [条件] 若 ShouldSet...=true:                          │
     │         立即写 X/R + UpdateShapeBounds                 │
     │         + UpdateActorInAccelerationStructure           │
     │  [条件] 若 ShouldSet...=false:                         │
     │         不写 X/R (交给 PullFromPhysicsState)           │
     │  [从不] 写 V/W (留给 PullFromPhysicsState)              │
     └───────────────────────────────────────────────────────┘
                              │
                    ··· 物理线程求解 ···
                              │
             ▼                 ▼                    ▼
     ┌────────────────┐ ┌──────────────┐ ┌────────────────────┐
     │ ShouldUpdate   │ │ ShouldUpdate │ │ ShouldUpdate       │
     │ TransformFrom │ │ TransformFrom│ │ TransformFrom      │
     │ Simulation     │ │ Simulation   │ │ Simulation         │
     │ = false        │ │ = true       │ │ = UpdateKinematic  │
     │                │ │              │ │   FromSimulation() │
     └───────┬────────┘ └──────┬───────┘ └─────────┬──────────┘
             │                 │                    │
             ▼                 ▼                    ▼
     ┌───────────────────────────────────────────────────────┐
     │              PullFromPhysicsState                       │
     │                                                       │
     │  [条件] 若 ShouldUpdate...=true:                       │
     │         SetX / SetR (支持渲染插值 Lerp)                 │
     │  [始终] SetV / SetW (速度始终从模拟结果复制)            │
     │  [始终] SetObjectState                                │
     │  [条件] 若 bNeedUpdateShapeBounds: UpdateShapeBounds   │
     └───────────────────────────────────────────────────────┘
```

---

## 九、实践建议

### 9.1 何时使用各值

| 场景 | 推荐设置 | 理由 |
|---|---|---|
| **默认/大多数情况** | `sync=-1`（默认） | 逐对象标志 `bUpdateKinematicFromSimulation=false` 默认即路径 A，零延迟更新 |
| **网络复制一致性** | `sync=1` | 确保变换与物理线程结果一致，避免客户端预测偏差 |
| **渲染插值需求** | `sync=1` 或逐对象 `true` | 路径 B 支持 `NextPullData` + `Alpha` 插值，路径 A 不支持 |
| **最高性能/最低延迟** | `sync=0` | 跳过 dirty 收集 + 即时变换更新，但牺牲速度回写和插值 |
| **PhysicalAnimationComponent** | 保持默认 | 组件自身已设置逐对象 `false`，无需全局覆盖 |

### 9.2 注意事项

1. **速度回写**：`sync=0` 时 kinematic 体不进入 dirty 列表，速度回写可能被跳过。如果依赖 kinematic 体的速度（如碰撞冲量计算），应使用 `sync=1` 或逐对象 `true`。
2. **多帧多次 SetKinematicTarget**：路径 A 在每次调用时覆写 X/R，同一帧多次调用只保留最后一次。路径 B 则通过物理线程统一处理，速度从位移差推导——如果同一帧多次设置目标，路径 B 的速度更准确。
3. **不要混用**：确保三条镜像判定路径的 `switch` 逻辑一致。引擎源码通过注释 `If the logic in one place is changed, it should be checked in the other place too` 提醒开发者。
4. **Resim（重模拟）场景**：在网络重模拟中，dirty 收集逻辑还检查 `bIsResim` 和 `SyncState() == ESyncState::HardDesync`，确保只有真正需要重同步的粒子才进入结果列表。

---

## 十、源码索引

| 文件 | 行号 | 内容 |
|---|---|---|
| `SingleParticlePhysicsProxy.cpp` | 28-34 | `SyncKinematicOnGameThread` 定义与 CVAR 注册 |
| `SingleParticlePhysicsProxy.cpp` | 302-317 | `ShouldUpdateTransformFromSimulation`（路径 B 守门人） |
| `SingleParticlePhysicsProxy.cpp` | 319-559 | `PullFromPhysicsState` 完整实现 |
| `SingleParticlePhysicsProxy.cpp` | 328-330 | "恰一更新"不变式注释 |
| `PBDRigidsSolver.cpp` | 472 | `extern` 声明 |
| `PBDRigidsSolver.cpp` | 1945-1963 | `ShouldUpdateFromSimulation`（物理线程侧镜像） |
| `PBDRigidsSolver.cpp` | 2781-2796 | Dirty 收集守卫（CollectRigidResults lambda） |
| `PBDRigidsSolver.cpp` | 3008-3023 | Dirty 收集守卫（CollectRigidResults lambda，第二处） |
| `ChaosEngineInterface.cpp` | 2573-2591 | `ShouldSetKinematicTargetSetGameTransform`（路径 A 守门人） |
| `ChaosEngineInterface.cpp` | 2593-2611 | `SetKinematicTarget_AssumesLocked` 完整实现 |
| `RigidParticleControlFlags.h` | 33-34, 88 | `UpdateKinematicFromSimulation` 位域与访问器 |
| `ParticleHandle.h` | 1323-1331 | 瞬态粒子句柄上的 `UpdateKinematicFromSimulation` |
| `ParticleHandle.h` | 3491-3495 | 持久粒子句柄上的 `UpdateKinematicFromSimulation` |
| `BodyInstanceCore.h` | 41-43 | `bUpdateKinematicFromSimulation` UPROPERTY 声明 |
| `BodyInstanceCore.cpp` | 13-25 | 默认值 `false` |
| `PhysicalAnimationComponent.cpp` | 487 | 强制设置 `false` |
| `KinematicTargets.h` | 17-23, 33 | `FKinematicTarget` 模式枚举与构造 |
