---
title: "GPU Physics 插件详解：基于 Compute Shader 的 PBD 刚体物理系统"
excerpt: "深入分析一个自研 GPU 物理插件的全貌：从公共 API 设计、GPU Buffer SoA 架构、15 个 Compute Shader 的完整碰撞管线（Broadphase → GJK → EPA → Manifold → PBD Solver），到移动端 ES3.1 兼容、图着色并行求解、流形热启动等核心技术。"
date: "2026-07-03"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["GPU Physics", "Compute Shader", "PBD", "GJK", "EPA", "Collision Detection", "ES3.1", "Unreal Engine"]
readTime: "阅读约45分钟"
---

## 第一节 插件总览与架构

### 1.1 插件定位

GPUPhysics 是一个基于 GPU Compute Shader 的实时刚体物理模拟插件，核心采用 **PBD（Position-Based Dynamics）** 求解框架，完整实现了从宽相到窄相的碰撞检测管线（GJK + EPA + Contact Manifold），并针对移动端 ES3.1 / Metal A12 进行了深度兼容。

插件包含两个模块：

| 模块 | 类型 | 加载阶段 | 职责 |
|------|------|----------|------|
| `GPUPhysics` | Runtime | `PostConfigInit` | 物理模拟核心（C++ + Compute Shader） |
| `GPUPhysicsTests` | UncookedOnly | Default | 编辑器自动化测试 |

源码规模：25 个头文件 + 19 个 C++ 实现文件 + 28 个 HLSL Shader 文件（15 个入口 `.usf` + 13 个被 `#include` 的 `.ush` 头文件）。

### 1.2 分层架构

整个插件按 **接口分离原则** 分为四层：

```
┌─────────────────────────────────────────────────────┐
│  Blueprint 层 (APhysicsWorldManager)               │
│  ─ 场景中的单例 Actor，暴露 UFUNCTION 给蓝图         │
│  ─ 管理 CompoundBody / 粘附 / 可视化注册            │
├─────────────────────────────────────────────────────┤
│  接口层 (Public/Interface/)                          │
│  ─ IPhysicsWorld: 物理世界抽象                      │
│  ─ IPhysicsBodyHandle: 物体句柄抽象                 │
│  ─ IPhysicsQueryInterface: 查询抽象                │
│  ─ PhysicsTypes: 所有 USTRUCT / UENUM / 委托        │
│  ─ PhysicsCallbacks: C++ 委托声明                   │
├─────────────────────────────────────────────────────┤
│  实现层 (Private/Implementation/)                   │
│  ─ FGPUPhysicsWorld: IPhysicsWorld 的实现           │
│  ─ FGPUPhysicsBody: IPhysicsBodyHandle 的实现       │
│  ─ FGPUPhysicsQuery: IPhysicsQueryInterface 的实现  │
├─────────────────────────────────────────────────────┤
│  GPU 调度层 (Private/CSDispatch/)                    │
│  ─ AGPUSimulationDispatcher: Actor，拥有所有 GPU     │
│    Buffer / SRV / UAV，执行 StepSimulation()         │
│  ─ 15 个 Compute Shader 声明类                     │
│  ─ GPU Readback 系统（异步回读）                    │
└─────────────────────────────────────────────────────┘
```

关键设计决策：**接口层不包含任何 RHI / GPU 概念**。`IPhysicsWorld` 只声明 `Simulate(float)`、`CreateBody()` 等纯逻辑接口，GPU 资源的所有权被封装在 `AGPUSimulationDispatcher`（一个 Actor）中。这使得上层可以在不接触 RHI 的情况下使用物理系统。

---

## 第二节 公共 API 详解

### 2.1 形状与可视化类型

```cpp
enum class EPhysicsShapeType : uint8 {
    Box = 0, Cylinder = 1, Sphere = 2, Capsule = 3, Convex = 4
};
```

`Capsule` 仅用于可视化绘制，碰撞管线不实际支持（CPU GJK 和 GPU Broadphase 均未处理）。

```cpp
enum class EVisualizationType : uint8 {
    NormalBox = 0, NormalCylinder = 1, NormalSphere = 2,
    NormalCapsule = 3, NormalConvex = 4,
    NormalCylinder1 = 101,  // 彩蛋币专用 Instance 显示
    Custom = 255            // 独立 StaticMesh
};
```

`Normal*` 类型使用 `InstancedStaticMeshComponent` 批量渲染（高性能），`Custom` 类型使用独立 `UStaticMeshComponent`（支持自定义 Mesh / 材质 / 缩放 / 阴影）。

### 2.2 物理体创建参数

`FPhysicsBodyCreationParams` 是创建物体的统一入口参数，关键字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `InitialTransform` | FTransform | 初始位置 + 旋转 |
| `Shape` | FPhysicsShapeData | 形状类型 + 尺寸 |
| `Mass` | float | 质量，用于计算 InverseMass = 1/Mass |
| `bKinematic` | bool | 运动学物体（InverseMass=0，不受力但可手动移动） |
| `InitialLinearVelocity` | FVector | 初始线速度 |
| `InitialAngularVelocity` | FVector | 初始角速度 |
| `bStartActive` | bool | 是否初始激活 |
| `bCollisionEnabled` | bool | 是否参与碰撞 |
| `bGenerateCollisionEvents` | bool | 是否生成碰撞事件（GPU 端回读） |
| `Restitution` | float | 弹性系数 |
| `Friction` | float | 摩擦系数 |
| `VisualizationConfig` | FVisualizationConfig | 可视化配置 |
| `ConvexData` | UConvexHullDataAsset* | 凸包数据（仅 Convex 类型） |
| `HullIndex` | uint32 | CompoundBody 中的子凸包索引 |
| `BodyGroupID` | uint32 | 内部字段，同组 SubBody 不互相碰撞 |

### 2.3 世界设置

```cpp
struct FPhysicsWorldSettings {
    FVector Gravity = (0, 0, -490);  // cm/s²，UE 默认重力
    float StaticFrictionDD = 0.05;    // 动态-静态摩擦
    float StaticFrictionDK = 0.05;   // 动态-运动学摩擦
    float DynamicFrictionDD = 0.01;
    float DynamicFrictionDK = 0.02;
    int32 MaxBodies = 4096;
    bool bEnableRotation = true;
    int32 MaxContacts = 8192;
};
```

> **注意**：摩擦系数分 DD（Dynamic-Dynamic）和 DK（Dynamic-Kinematic）两组。当碰撞对中有一方是 Kinematic（InverseMass=0）时，使用 DK 系数；双方都是 Dynamic 时使用 DD 系数。这允许对"物体落在平台上"和"物体互相堆叠"设置不同的摩擦参数。

### 2.4 模拟设置

`FPhysicsSimulationSettings` 控制求解器和碰撞管线：

```cpp
struct FPhysicsSimulationSettings {
    int32 SolverIterations = 16;          // PBD 求解迭代次数
    float LinearDamping = 0.01;
    float AngularDamping = 0.05;
    float MaxAngularVelocity = 1000.0;

    // 碰撞管线开关（可独立开关每个阶段）
    bool bEnableGJKDetection = true;
    bool bEnableEPACalculation = true;
    bool bEnableManifoldGeneration = true;
    bool bEnablePBDSolver = true;

    // DeltaTime 平滑（移动平均窗口）
    int32 DeltaTimeSmoothFrames = 5;
    float MinDeltaTime = 0.01;   // 100 FPS 上限
    float MaxDeltaTime = 0.025;  // 40 FPS 下限

    // 流形热启动容差
    float ShapePositionTolerance = 0.4;    // cm
    float ShapeRotationThreshold = 0.999;  // cos(3.6°)
    float ContactPositionTolerance = 0.2;   // cm
};
```

DeltaTime 平滑使用移动平均：维护一个 `DeltaTimeHistory[DeltaTimeSmoothFrames]` 数组，取平均值后 clamp 到 `[MinDeltaTime, MaxDeltaTime]`。这防止了帧率波动导致的物理不稳定。

### 2.5 IPhysicsWorld 接口

```cpp
class IPhysicsWorld {
    // 生命周期
    virtual bool Initialize(const FPhysicsWorldSettings&) = 0;
    virtual void Shutdown() = 0;
    virtual void Simulate(float DeltaTime) = 0;

    // 物体管理
    virtual TSharedPtr<IPhysicsBodyHandle> CreateBody(const FPhysicsBodyCreationParams&) = 0;
    virtual bool DestroyBody(TSharedPtr<IPhysicsBodyHandle>) = 0;
    virtual TArray<TSharedPtr<IPhysicsBodyHandle>> CreateBodies(const TArray<...>&) = 0;

    // 查询
    virtual IPhysicsQueryInterface* GetQueryInterface() = 0;

    // 设置
    virtual void SetGravity(const FVector&) = 0;
    virtual void SetSimulationSettings(const FPhysicsSimulationSettings&) = 0;

    // 事件回调
    virtual FPhysicsCollisionDelegate& OnCollision() = 0;
    virtual FPhysicsPreSimulateDelegate& OnPreSimulate() = 0;
    virtual FPhysicsPostSimulateDelegate& OnPostSimulate() = 0;
};
```

### 2.6 IPhysicsBodyHandle 接口

`IPhysicsBodyHandle` 代表 GPU 中的一个 Particle，提供读写接口。关键特性：

- **读操作**：读取上一帧的模拟结果（有 1 帧延迟，因 GPU 异步回读）
- **写操作**：排队到下一帧应用（不立即生效）

```cpp
class IPhysicsBodyHandle {
    // 标识符
    virtual uint32 GetBodyID() const = 0;
    virtual bool IsValid() const = 0;

    // 位置和旋转（读上一帧数据）
    virtual bool GetPosition(FVector&) const = 0;
    virtual bool GetRotation(FQuat&) const = 0;
    virtual bool GetTransform(FTransform&) const = 0;

    // 写操作（下一帧应用）
    virtual void SetPosition(const FVector&) = 0;
    virtual void SetRotation(const FQuat&) = 0;
    virtual void SetLinearVelocity(const FVector&) = 0;
    virtual void SetAngularVelocity(const FVector&) = 0;

    // 力和冲量（累积到下一帧）
    virtual void AddForce(const FVector&) = 0;
    virtual void AddImpulse(const FVector&) = 0;
    virtual void AddTorque(const FVector&) = 0;

    // 质量 / 碰撞 / 激活
    virtual void SetKinematic(bool) = 0;
    virtual void SetCollisionEnabled(bool) = 0;
    virtual void SetActive(bool) = 0;

    // GPU 数据有效性
    virtual bool HasValidData() const = 0;
    virtual void UpdateCache() const = 0;

    // 用户数据（关联 Actor）
    virtual void* GetUserData() const = 0;
    virtual void SetUserData(void*) = 0;
    AActor* GetOwnerActor() const;  // 便捷方法
    void SetOwnerActor(AActor*);
};
```

### 2.7 IPhysicsQueryInterface 接口

```cpp
class IPhysicsQueryInterface {
    virtual bool Overlap(
        const FPhysicsShapeData& Shape,
        const FTransform& Transform,
        TArray<TSharedPtr<IPhysicsBodyHandle>>& OutOverlaps,
        const FPhysicsQueryParams& Params = {}) const = 0;
};
```

查询基于 CPU 端的上一帧缓存数据，使用 GJK 算法进行精确碰撞检测。当前实现是 O(N) 线性扫描（无 BVH 加速结构），适合中等规模物体数量。

---

## 第三节 PhysicsWorldManager —— 蓝图层入口

`APhysicsWorldManager` 是放置在场景中的单例 Actor，将 `IPhysicsWorld` 包装为 Blueprint 友好的 API。

### 3.1 核心配置

```cpp
UPROPERTY(EditAnywhere) FPhysicsWorldSettings WorldSettings;
UPROPERTY(EditAnywhere) FPhysicsSimulationSettings SimulationSettings;
UPROPERTY(EditAnywhere) bool bAutoSimulate = true;   // Tick 自动步进
UPROPERTY(EditAnywhere) bool bAutoInitialize = true;  // BeginPlay 自动初始化
UPROPERTY(EditAnywhere) TArray<UConvexHullDataAsset*> ConvexDataAssets; // 预注册凸包
```

### 3.2 静态单例访问

```cpp
static APhysicsWorldManager* GetInstance(UWorld* World);
// 通过 TMap<UWorld*, APhysicsWorldManager*> 实现，每个 World 一个实例
```

### 3.3 CompoundBody（多凸包组合体）

插件支持由多个凸包组成的"凹型物体"——CompoundBody。内部结构：

```cpp
struct FCompoundBodyInfo {
    uint32 MasterBodyID;           // 用户看到的 ID
    TArray<uint32> SubBodyIDs;     // 每个凸包一个子 Body
    UStaticMeshComponent* CustomComponent;
};
TMap<uint32, FCompoundBodyInfo> CompoundBodyMap;     // Master → Info
TMap<uint32, uint32> SubBodyToMasterMap;              // Sub → Master
```

创建 CompoundBody 时，每个凸包创建为一个独立的 SubBody（带相同的 `BodyGroupID`），同组 SubBody 之间不互相碰撞。对外暴露 MasterBodyID，所有操作透明地分发给 SubBody。

### 3.4 物体粘附（AttachBodyToBody）

```cpp
bool AttachBodyToBody(int32 MasterBodyID, int32 SlaveBodyID);
```

将 Slave 设为 Kinematic，每帧在模拟后计算相对偏移并跟随 Master 位置：

```cpp
struct FSlaveAttachmentInfo {
    int32 MasterBodyID;
    FVector RelativeOffset;
};
TMap<int32, FSlaveAttachmentInfo> SlaveAttachments;
```

### 3.5 快速查询方法

除了 GJK 精确查询外，Manager 还提供了两个快速检测方法：

- **`SphereOverlapSphereAndCylinderFast`**：针对球体去重叠硬币（Cylinder）和扭蛋（Sphere）的优化检测，跳过 GJK 直接做距离判断
- **`BoxOverlapSphereAndCylinderFast`**：简化版，只判断物体中心点是否在 Box 内部

这些方法专为推币机等特定玩法场景设计，牺牲精度换取性能。

---

## 第四节 ConvexHullDataAsset —— 凸包数据资产

`UConvexHullDataAsset` 是 `UDataAsset` 的子类，存储从 `UStaticMesh` 提取的凸包数据。

### 4.1 数据结构

```cpp
struct FConvexHull {
    TArray<FVector> Vertices;           // 顶点（局部空间，最多 32 个）
    FBox LocalAABB;
    float MaxDistance;                   // 中心到最远顶点

    // 面数据（用于 Contact Manifold 生成）
    TArray<FVector> FaceNormals;        // 面法线（局部空间）
    TArray<FFaceVertexIndices> FaceVertexIndices;  // 面的顶点索引
    TArray<FVector> FaceCenters;         // 面中心点
};

class UConvexHullDataAsset {
    UStaticMesh* SourceMesh;             // 源 Mesh（编辑器重新生成用）
    TArray<FConvexHull> ConvexHulls;     // 多凸包分解
    FBox LocalAABB;                       // 合并 AABB
    FVector CenterOffset;                // 重新中心化偏移量
};
```

### 4.2 多凸包分解

一个 DataAsset 可以包含多个 `FConvexHull`，每个对应原始 Mesh 的一个凸包分解（来自 UE 的 `FKConvexElem`）。GPU 端通过 `HullIndex` 索引到具体的凸包。

### 4.3 编辑器工作流

```cpp
#if WITH_EDITOR
    UFUNCTION(CallInEditor) void ExtractConvexFromMesh();  // 从 SourceMesh 提取
    UFUNCTION(CallInEditor) void ClearData();
#endif
```

`ExtractConvexFromMesh()` 从 `SourceMesh` 的 `BodySetup` 中读取 `FKConvexElem` 列表，为每个 Elem 提取顶点、面法线、面顶点索引和面中心点，然后计算 `CenterOffset`（使凸包几何中心位于原点，便于可视化对齐）和 `LocalAABB`。

---

## 第五节 GPU Buffer 架构

### 5.1 SoA（Structure of Arrays）布局

所有粒子数据采用 **SoA 布局**——每种属性存储在独立的 Buffer 中，而非单个 AoS（Array of Structures）Buffer。这优化了 GPU 内存访问的 coalescing：

```
CurrentPositionBuffer:  [P0.xyz, Mass][P1.xyz, Mass][P2.xyz, Mass]...
PreviousPositionBuffer: [PP0.xyz, InvMass][PP1.xyz, InvMass]...
VelocityBuffer:         [V0.xyz, InvInertia][V1.xyz, InvInertia]...
CurrentRotationBuffer:  [R0.xyzw][R1.xyzw][R2.xyzw]...
PreviousRotationBuffer: [PR0.xyzw][PR1.xyzw]...
AngularVelocityBuffer:  [AV0.xyzw][AV1.xyzw]...
ShapeTypeBuffer:        [ST0][ST1][ST2]...
ExtentsBuffer:           [E0.xyzw][E1.xyzw]...
ParticleStateBuffer:     [State0][State1][State2]...
```

每个粒子的每种属性占用 **4 个 float**（float4 对齐），即使是 3 分量向量也填充到 4。这使得 GPU 端可以使用 `Buffer<float4>` 高效访问，同时复用第 4 分量存储标量数据（Mass / InverseMass / InvInertiaScale）。

### 5.2 粒子状态位编码

`ParticleStateBuffer` 是 `uint` 类型，按位编码：

| 位 | 含义 |
|----|------|
| bit 0 | IsActive（是否激活） |
| bit 1 | bEnableCollision（是否启用碰撞） |
| bit 2 | Collide（当前帧是否发生了碰撞，由 PBD Solver 设置） |
| bit 3 | bGenerateCollisionEvents（是否生成碰撞事件） |
| bits 17–31 | ParticleID（15 位，最大 32767） |

### 5.3 碰撞管线 Buffer 一览

| Buffer 名称 | 格式 | 元素大小 | 用途 |
|---|---|---|---|
| BroadPhasePairBuffer | uint | 8 uints/pair | 宽相碰撞对 |
| BroadPhasePairCountBuffer | uint | 1 | 碰撞对数量 |
| IntersectingPairIndicesBuffer | uint | 1/pair | GJK 检测后的相交对索引 |
| IntersectCountBuffer | uint | 1 | 相交对数量 |
| GJKOutputDataBuffer | uint | 16 uints/pair | GJK 输出 |
| EPAResultBuffer | float | 12 floats/pair | EPA 渗透结果 |
| ManifoldBuffer | float | 132 floats/pair | 局部空间接触流形 |
| SolverManifoldBuffer | float | 120 floats/pair | 世界空间求解器流形 |
| ColorGroupIndicesBuffer | uint | 1/pair | 图着色分组索引 |
| ColorGroupCountBuffer | uint | 1/group | 每组数量 |
| ParticleDeltaBuffer | float | 6 floats × 12/particle | 每粒子增量列表 |
| ParticleDeltaCountBuffer | uint | 1/particle | 每粒子增量数 |
| TotalDeltaBuffer | float | 6 floats/particle | 累计增量 |
| ConstraintArrayBuffer | float | 136 floats/constraint | 持久化约束 |
| ParticleConstraintInfoBuffer | uint | 25 uints/particle | 每粒子约束列表 |
| RestoreInfoBuffer | uint | 2 + N | 热启动结果 |
| CollisionEventBuffer | float4 | 1 + 64×2 | 碰撞事件 |

### 5.4 FGPUManifold 结构（132 floats = 528 bytes）

```
Header (5 float4s = 20 floats):
  [0] Body0ID, Body1ID, NumContactPoints, bIsInitialContact
  [1] LocalContactNormal.xyz, StaticFriction
  [2] DynamicFriction, Restitution, MinInitialPhi, padding
  [3] LastShapeWorldPositionDelta.xyz
  [4] LastShapeWorldRotationDelta.xyzw

Contact Points ×4 (7 float4s each = 28 floats):
  [0] LocalContactPoint0.xyz, Depth
  [1] LocalContactPoint1.xyz, Flags
  [2] LocalAnchorPoint0.xyz, InitialPhi
  [3] LocalAnchorPoint1.xyz, padding
  [4] InitialShapeContactPoint0.xyz, padding
  [5] InitialShapeContactPoint1.xyz, padding
  [6] padding×4
```

Contact Point 的 Flag 位编码：

| 位 | 含义 |
|----|------|
| bit 0 | bHasAnchor（有静态摩擦锚点） |
| bit 1 | bInitialContact（首次接触） |
| bit 2 | bWasRestored（通过热启动恢复） |
| bit 3 | bWasReplaced（被替换） |

---

## 第六节 完整模拟管线

`AGPUSimulationDispatcher::StepSimulation(float DeltaTime)` 是整个物理模拟的入口。以下是单帧的完整管线：

```
┌─────────────────────────────────────────────────────────────┐
│ A. 游戏线程预处理                                            │
│   1. ProcessPendingFreeSlots() — 回收 5 帧前释放的粒子槽      │
│   2. 移动 PendingModifications / PendingNewParticles 到局部  │
│   3. TryProcessAsyncReadback() — 处理上一帧的异步回读         │
├─────────────────────────────────────────────────────────────┤
│ B. 渲染线程：StepSimulation lambda                          │
│   4. 清空 CollisionEventBuffer                               │
│   5. [有修改] FlushPendingModifications → ParticleModify     │
│   6. [有新增] FlushPendingParticles → ParticleAdd             │
│   7. Integrate — 重力积分 + Verlet 位置更新                   │
│   8. GroundConstraint — 地面约束钳制                          │
│   9. 清空 Debug/BroadPhasePair/Delta 缓冲                    │
│  10. Broadphase — AABB 宽相碰撞检测（2D 调度）                │
│  11. [碰撞求解块]                                            │
│      a. TryRestoreManifold — 流形热启动                       │
│      b. GJK Detection — GJK 窄相检测                          │
│      c. EPA — 渗透深度计算                                    │
│      d. ManifoldLocalSpace — 局部空间接触流形生成             │
│  12. Coloring — 图着色分组                                    │
│  13. PBD 迭代求解：                                           │
│      for SolverIter in [0, 16):                              │
│        for ColorGroup in [1, MaxColorGroups):                │
│          Gather → PBDSolver → ApplyDelta                     │
│  14. ScatterOutput — 持久化约束到 ConstraintArray              │
│  15. ResolveVelocity — 从位置差重算速度                       │
│  16. EnqueueAsyncReadback — 异步回读到 CPU                    │
└─────────────────────────────────────────────────────────────┘
```

每一步之间都有显式的 `RHICmdList.Transition` UAV↔SRV 屏障，确保前一步的写入对后一步可见。

### 6.1 粒子回收机制

粒子销毁不是立即的，而是延迟回收：

```cpp
static constexpr uint32 RECYCLING_DELAY_FRAMES = 5;

void DeactivateParticle(uint32 ParticleIndex) {
    PendingFreeIndices.Add({ParticleIndex, CurrentFrameIndex});
}

void ProcessPendingFreeSlots() {
    // 当 CurrentFrame - DeactivatedFrame >= 5 时，将槽位移入 FreeList
    for (auto& Slot : PendingFreeIndices) {
        if (CurrentFrameIndex - Slot.DeactivatedFrame >= RECYCLING_DELAY_FRAMES) {
            FreeParticleIndices.Push(Slot.ParticleIndex);
        }
    }
}
```

延迟 5 帧是为了确保 GPU 端所有引用该粒子的 Compute Shader 已经完成（因为异步回读有 1 帧延迟，且碰撞求解涉及多帧流形热启动）。

### 6.2 DeltaTime 平滑

```cpp
TArray<float> DeltaTimeHistory;
int32 DeltaTimeHistoryIndex = 0;

float SmoothDeltaTime(float RawDelta) {
    DeltaTimeHistory[DeltaTimeHistoryIndex] = RawDelta;
    DeltaTimeHistoryIndex = (DeltaTimeHistoryIndex + 1) % DeltaTimeSmoothFrames;
    float Sum = 0;
    for (float d : DeltaTimeHistory) Sum += d;
    float Avg = Sum / DeltaTimeSmoothFrames;
    return FMath::Clamp(Avg, MinDeltaTime, MaxDeltaTime);
}
```

---

## 第七节 Compute Shader 详解

### 7.1 Shader 声明方式

插件使用了两种 Shader 声明方式：

**旧式（8 个）**：使用 `DECLARE_SHADER_TYPE` + `LAYOUT_FIELD`，手动 `SetParameters`/`UnbindParameters`：
- FParticleIntegrateShader, FParticleVelocityShader, FGroundConstraintShader
- FCollisionBroadPhaseShader, FCollisionColoringShader, FTryRestoreManifoldShader
- FParticleAddShader, FParticleModifyShader

**新式（7 个）**：使用 `DECLARE_GLOBAL_SHADER` + `SHADER_USE_PARAMETER_STRUCT` + `BEGIN_SHADER_PARAMETER_STRUCT`：
- FCollisionDetectionCS, FCollisionEPACS, FCollisionManifoldLocalSpaceCS
- FCollisionGatherCS, FCollisionPBDSolverCS, FCollisionApplyDeltaCS, FCollisionScatterOutputCS

所有 Shader 目标 `ERHIFeatureLevel::ES3_1`（移动端兼容），使用 `PF_R32_FLOAT` / `PF_R32_UINT` 类型化 Buffer 而非 `float4` 结构化 Buffer。

### 7.2 线程组配置一览

| Shader | numthreads | 调度维度 | 组数公式 |
|--------|-----------|---------|---------|
| ParticleAdd | (64,1,1) | 1D | ⌈NewParticleCount/64⌉ |
| ParticleIntegrate | (64,1,1) | 1D | ⌈MaxParticleCapacity/64⌉ |
| ParticleModify | (64,1,1) | 1D | ⌈ModificationCount/64⌉ |
| GroundConstraint | (64,1,1) | 1D | ⌈MaxParticleCapacity/64⌉ |
| ParticleVelocity | (64,1,1) | 1D | ⌈MaxParticleCapacity/64⌉ |
| **BroadPhase** | **(8,8,1)** | **2D** | **⌈GridSize/8⌉ × ⌈GridSize/8⌉** |
| TryRestoreManifold | (64,1,1) | 1D | ⌈MaxPairs/64⌉ |
| CollisionColoring | (64,1,1) | 1D | ⌈MaxPairs/64⌉ |
| CollisionDetection (GJK) | (32,1,1) | 1D | ⌈MaxPairs/32⌉ |
| CollisionEPA | (16,1,1) | 1D | ⌈MaxPairs/16⌉ |
| ManifoldLocalSpace | (16,1,1) | 1D | ⌈MaxPairs/16⌉ |
| CollisionGather | (32,1,1) | 1D | ⌈MaxPairs/32⌉ |
| PBDSolver | (32,1,1) | 1D | ⌈MaxPairs/32⌉ |
| ApplyDelta | (64,1,1) | 1D | ⌈MaxParticles/64⌉ |
| ScatterOutput | (64,1,1) | 1D | ⌈MaxPairs/64⌉ |

> **BroadPhase 是唯一的 2D 调度**：每个线程处理一对 的碰撞检测，`id.x = IndexB`，`id.y = IndexA`，只计算上三角矩阵（`IndexA < IndexB`）避免重复。GridSize = MaxActiveParticleIndex + 1。

---

## 第八节 粒子积分与速度求解

### 8.1 ParticleIntegrate —— 重力积分

**Shader**: `/GPUPhysics/ParticleIntegrate.usf`，入口 `Main`

每粒子执行：

1. 跳过非激活粒子（state bit 0）和无限质量粒子（InverseMass ≤ 0）
2. 保存当前 → 前一帧（`PreviousPosition = CurrentPosition`，`PreviousRotation = CurrentRotation`）
3. 重力施加：`Velocity.z += Gravity × DeltaTime`
4. Chaos 风格线性阻尼：`Velocity = lerp(Velocity, 0, min(1, 0.99 × DeltaTime))`
5. 硬速度限制：`Velocity.z` 不超过 `3.0 / DeltaTime`
6. Verlet 位置更新：`Position += Velocity × DeltaTime`
7. [旋转启用时] 角阻尼 + 角速度 → 四元数增量 → 旋转更新

角速度单位为度/秒，通过 `EulerToQuaternion` 转换为增量四元数后左乘到当前旋转（`NewRot = QuatMultiply(DeltaQuat, CurRot)`）。

### 8.2 ParticleVelocity —— 速度重算

**Shader**: `/GPUPhysics/ParticleVelocity.usf`，入口 `Main`

在 PBD 求解器修改位置后，从位置差反算速度：

```
targetVelocity = (currentPos - prevPos) / DeltaTime
```

线性速度被 clamp 到 ±1000，速度变化 clamp 到 ±200，混合因子 0.9。角速度通过 `deltaQuat = currentRot × inverse(prevRot)` → `QuatToAxisAngle` 反算。

### 8.3 GroundConstraint —— 地面约束

**Shader**: `/GPUPhysics/GroundConstraint.usf`

简单的地面钳制，使用 `max()` 而非 `if`（Metal 兼容）：

```hlsl
position.z = max(position.z, GroundLevel);
```

不包含速度反射（相关代码已注释掉）。

---

## 第九节 宽相碰撞检测

### 9.1 BroadPhase —— AABB 宽相

**Shader**: `/GPUPhysics/CollisionBroadPhase.usf`，入口 `Main`，`[numthreads(8,8,1)]`

2D 调度，每个线程测试一对粒子。算法：

1. 跳过非激活或碰撞禁用的粒子
2. 跳过双方都是静态的情况（InverseMass 均为 0）
3. 计算每粒子的 AABB：
   - **Box**：`halfExtents` 旋转后的轴向投影和（`sum(|rotatedAxis × extent|)`）
   - **Cylinder**：轴向投影 + `sqrt(radial1² + radial2²) × Radius + 0.2`
   - **Sphere**：`center ± Radius`
   - **Convex**：变换所有顶点取 min/max
4. AABB 三轴分离测试
5. 相交则 `InterlockedAdd` 分配输出槽位，写入碰撞对

输出 `BroadPhasePairBuffer` 结构（8 uints/pair）：

```
[idxA, idxB, distance, combinedMaxDistance, shapeTypeA, shapeTypeB, currentFrame, colorGroup]
```

### 9.2 TryRestoreManifold —— 流形热启动

**Shader**: `/GPUPhysics/CollisionTryRestoreManifold.usf`，入口 `TryRestoreManifoldCS`

这是性能优化的关键：尝试复用上一帧的接触流形，跳过昂贵的 GJK + EPA + Manifold 生成。

热启动条件：

1. **变换容差**：比较当前位置差与上一帧存储的 `LastShapeWorldPositionDelta`，分量差 ≤ `ShapePositionTolerance`；比较旋转差的点积与 `ShapeRotationThreshold`（cos 值）
2. **接触点容差**：将上一帧的 `InitialShapeContactPoint0` 变换到当前 Shape1 的局部空间，与 `InitialShapeContactPoint1` 比较，切向距离 ≤ `ContactPositionTolerance`

成功时直接将上一帧的流形更新到当前帧（更新深度和局部坐标），写入 `ManifoldBuffer` 前部（通过 `RestoreInfoBuffer[0]` 的成功计数作为写入偏移）。

失败时记录碰撞对索引到 `RestoreInfoBuffer[2..N]`，供后续 GJK 处理。

### 9.3 Coloring —— 图着色分组

**Shader**: `/GPUPhysics/CollisionColoringMain.usf`，入口 `CollisionColoringMain`

图着色将可能同时写入同一粒子的约束分配到不同的颜色组，使每组内的约束互不冲突，可以并行求解。

当前实现为简化版：`MaxColorGroups = 1`，所有碰撞对分配到单一颜色组（注释中提到"空间哈希着色"但实际未启用）。这意味着 PBD 求解器在一次迭代中只处理所有约束一次，依赖于多次 SolverIteration 来收敛。

---

## 第十节 GJK 窄相碰撞检测

### 10.1 GJK 算法原理

GJK（Gilbert-Johnson-Keerthi）算法通过迭代构建 Minkowski 差的单纯形来判断两个凸体是否相交。

**Support 函数**：对于方向 `d`，返回凸体上沿 `d` 方向最远的点：

$$
\text{Support}_{A \ominus B}(d) = \text{Support}_A(d) - \text{Support}_B(-d)
$$

**单纯形演进**：从 1 点单纯形开始，逐步添加 Support 点。每一步计算当前单纯形到原点的最近点，生成新的搜索方向。如果原点被包含在单纯形内（四面体），则两体相交；如果 Support 点不再向原点推进，则分离。

### 10.2 CPU 版本（FGJKAlgorithm）

CPU 版本用于 `IPhysicsQueryInterface::Overlap` 查询，完整实现了 `HandleLine` / `HandleTriangle` / `HandleTetrahedron`：

- **HandleLine**：2 点情况，投影原点到线段，必要时降维到单点
- **HandleTriangle**：3 点情况，测试 3 个顶点区域 + 3 条边区域
- **HandleTetrahedron**：4 点情况，测试 1 个顶点区域 + 3 条棱区域 + 3 个面区域 + 内部

CPU 版本的 Support 函数支持 Sphere / Box / Cylinder（固定 Z 轴），不支持 Capsule 和 Convex。

最大迭代次数 32，容差 `KINDA_SMALL_NUMBER`。算法参考自 PhysX 的 `GuRefGjkEpa.h:computeGjkDistance`。

> **注意**：CPU 版本不包含 EPA，GJK 检测到相交后即返回，不计算渗透深度。

### 10.3 GPU 版本（GJKCore.ush）

GPU 版本使用 **groupshared 内存**优化，每个线程独立处理一个碰撞对（无跨线程同步）：

```hlsl
groupshared float SharedGJKResultBuffer[32 * 16];   // 每线程 16 floats 结果
groupshared float gs_GJKShapes[32 * 24];             // 每线程 2 个 Shape × 12 floats
groupshared float gs_GJKSimplex[32 * 41];             // 每线程 1 个 Simplex × 41 floats
```

GPU 版本的 Handle 函数直接操作 groupshared 中的 Simplex 数据，维护重心坐标用于计算最近点。

**Convex Support 函数**使用暴力搜索：遍历凸包的所有顶点，取与方向点积最大的点：

```hlsl
float3 SupportConvex_Local(float3 dir, uint vertexOffset, uint vertexCount, Buffer<float4> buf) {
    float bestDot = -1e30;
    float3 bestVertex = float3(0,0,0);
    for (uint i = 0; i < vertexCount; i++) {
        float3 v = buf[vertexOffset + i].xyz;
        float d = dot(dir, v);
        if (d > bestDot) { bestDot = d; bestVertex = v; }
    }
    return bestVertex;
}
```

### 10.4 GJK 输出

`GJKOutputDataBuffer` 每对 16 uints：

```
[idxA, idxB, ColorGroup, bIntersect,
 PointA.xyz (asuint), PointB.xyz (asuint),
 Axis.xyz (asuint), Distance (asuint),
 padding×2]
```

碰撞检测判定条件：`bIntersect == true` **或** `Distance < 0.5`（近距离对保留，为 EPA 和 Manifold 提供输入）。

---

## 第十一节 EPA 渗透深度计算

### 11.1 EPA 算法原理

EPA（Expanding Polytope Algorithm）在 GJK 检测到相交后，从 GJK 的最终单纯形出发，逐步扩展多面体直到找到离原点最近的面。该面的法线即为碰撞法线，距离即为渗透深度。

### 11.2 GPU 实现（EPACore.ush）

GPU 版本使用 groupshared 存储多面体数据，每个线程（最多 16 个）独立处理一对：

```hlsl
groupshared float gs_EPAVertices[16 * 10 * 9];   // 10 顶点 × 9 floats
groupshared float gs_EPAFaces[16 * 16 * 5];       // 16 面 × 5 uints
groupshared float gs_HorizonEdges[16 * 18 * 2];   // 18 边 × 2 uints
groupshared float gs_Shapes[16 * 2 * 11];          // 2 形状 × 11 floats
```

**初始化**：从 GJK 的 Simplex 构建 6 个正交方向的 Support 点，去重后选择 3 个非共线点创建 2 个初始面。

**迭代循环**（最多 12 次）：

1. `FindClosestFace_Batched`：找距原点最近的面（最大投影距离）
2. `AddPointToPolytope_Batched`：沿面法线计算新 Support 点
3. 去重检查：与最近面的 3 个顶点比较
4. **Horizon 搜索**：标记从新顶点可见的面为 obsolete，提取边界边，取消反向对
5. 创建新面：从 horizon 边到新顶点
6. 收敛判断：`Projection >= ClosestDist - Tolerance`

**接触点计算**：将原点投影到最近面上，计算重心坐标，插值 `SupportA` 和 `SupportB` 得到两个体的接触点。

> **移动端防崩溃**：EPA 接触点计算中有一个特殊处理——`SuppB = max(SuppB, -1e20)`，用于打断 Metal 驱动中 `Load-Mul` 指令融合导致的崩溃（注释标注为 AGXMetalA12 Code=3 错误）。

### 11.3 EPA 输出

`EPAResultBuffer` 每对 12 floats：

```
[bSuccess, PenetrationDepth, Normal.xyz,
 ContactPointA.xyz, ContactPointB.xyz, padding]
```

---

## 第十二节 Contact Manifold 生成

### 12.1 流形生成流程

**Shader**: `/GPUPhysics/CollisionManifoldLocalSpace.usf`，入口 `CollisionManifoldLocalSpaceCS`

从 GJK + EPA 结果生成局部空间接触流形：

1. 读取 GJK 输出（PointA, PointB, Axis, Distance）和 EPA 输出（Normal, Depth, ContactA, ContactB）
2. 如果 EPA 失败，回退到 GJK 数据
3. 调用 `GenerateContactManifoldFromEPA`：
   - 对每个 Shape 调用 `GetContactFace` 获取参考面（最多 4 个顶点）
   - 根据面类型选择裁剪策略

### 12.2 参考面提取（ContactFace.ush）

| 形状 | 面提取策略 |
|------|-----------|
| Box | 找到局部方向的主轴，生成该面的 4 个角顶点 |
| Sphere | 返回 0 点（点接触，使用 ClipNone） |
| Cylinder | 轴向（dot > 0.99）：4 点端面；径向（dot < 0.14）：2 点侧面；否则 0 点 |
| Convex | 查询 ConvexInfoBuffer 获取面信息，按方向点积 + 距离加权选择最佳面 |

### 12.3 Sutherland-Hodgman 裁剪（FaceClipper.ush）

对于面-面接触（`ClipNxN`）：

1. 从两个参考面的边界边生成裁剪平面
2. 构建初始多边形（或使用 2 点面）
3. **Sutherland-Hodgman 裁剪**：对每个裁剪平面，计算多边形顶点到平面的距离，保留内侧点，计算边-面交点，双缓冲交替
4. 计算每个接触点的深度（投影到两个面平面）
5. 按深度降序排序
6. **降维到 4 点**：保留 P0，找到最远的 P1，在 P0-P1 基线两侧找最大垂直距离的点

使用 groupshared 工作空间（`SharedWorkspace[16 × 168]`，half 精度）存储多边形和裁剪平面。

### 12.4 局部空间转换

生成世界空间流形后，将其转换到 Shape1 的局部空间存储：

```hlsl
LocalContactNormal = QuatRotateVector(QuatInverse(Rot1), WorldNormal);
LocalContactPoint = QuatRotateVector(InvRot, WorldContactPoint - Pos);
```

同时存储 `LastShapeWorldPositionDelta` 和 `LastShapeWorldRotationDelta`，供下一帧的 TryRestoreManifold 使用。

---

## 第十三节 PBD 碰撞求解器

### 13.1 Gather —— 局部到世界空间转换

**Shader**: `/GPUPhysics/CollisionGather.usf`，入口 `CollisionGatherCS`，`[numthreads(32,1,1)]`

将局部空间流形转换为世界空间求解器流形：

1. 读取局部流形 + 两个粒子的当前位置 / 旋转
2. `WorldNormal = QuatRotateVector(Rot1, LocalContactNormal)`（手动归一化，处理零向量）
3. 计算切线 `TangentU` / `TangentV`（基于 `|Normal.z|` 选择基向量）
4. 对每个接触点：
   - `WorldP0 = Pos0 + QuatRotateVector(Rot0, LocalContactPoint0)`
   - `Phi = dot(WorldP0 - WorldP1, WorldNormal)`（深度，带缩放：0→1 区间线性到 0.6）
5. 第一次迭代：计算切向误差（静态摩擦用锚点，动态摩擦用相对速度 × DeltaTime）
6. 后续迭代：读取 `TotalDeltaBuffer` 中两个体的累计增量，更新 `ContactDelta`

### 13.2 PBDSolver —— 核心求解

**Shader**: `/GPUPhysics/CollisionPBDSolver.usf`，入口 `PBDCollisionSolverCS`，`[numthreads(32,1,1)]`

#### GroupShared 缓存

```hlsl
groupshared float gs_DeltaData[32 * 12];
// 每线程 12 floats: deltaPosA[3], deltaRotA[3], deltaPosB[3], deltaRotB[3]
```

#### 法向约束求解

对每个接触点（4 内部迭代 × NumContacts）：

1. 读取 `Phi`（clamp 到 MaxPushOut = 0.5）
2. 计算有效质量：$W = m_A^{-1} + m_B^{-1} + I_A^{-1} (\mathbf{R}_A \times \mathbf{n})^2 + I_B^{-1} (\mathbf{R}_B \times \mathbf{n})^2$
3. 高度差缩放：如果法线 · up > 0.1，上方物体的有效质量减半（`scaleA 或 scaleB = 0.5`），减少上方物体的修正量
4. $\lambda = 0.8 \times C_{adjusted} / (W_1 \times scaleA + W_2 \times scaleB)$
5. 单侧约束：`NetPushOutNormal + lambda ≥ 0`（不允许拉力）
6. 累积 `deltaPos` 和 `deltaRot`（位置 + `R × n` 旋转修正）

#### 摩擦求解

当 `CurrentSolverIter > 6` 时启用摩擦：

1. 读取切向 `ContactDelta`（从 Gather 阶段累积）
2. 更新 `ContactDelta` 加入当前迭代的切向位移分量
3. `PushOutU = -FrictionStepFactor × ContactDeltaU × ContactMassU`
   - `FrictionStepFactor`：iter < 10 时 0.5，之后 0.25
4. **摩擦锥**：
   - 切向推力 ≤ 静摩擦极限（`StaticFriction × |NormalPressure|`）→ 全静态摩擦（ratio=1）
   - 超过 → clamp 到动摩擦极限（`DynamicFriction × |NormalPressure|`）
5. 应用切向位移到 deltaPos 和 deltaRot

#### 增量输出

每个约束对两个体产生增量，通过 `InterlockedAdd` 分配输出槽位到 `ParticleDeltaBuffer`：

```hlsl
InterlockedAdd(ParticleDeltaCountBuffer[idx], 1, slot);
if (slot < MAX_DELTAS_PER_PARTICLE) {  // 最多 12 个增量
    ParticleDeltaBuffer[base + slot * 6 + 0..2] = deltaPos;
    ParticleDeltaBuffer[base + slot * 6 + 3..5] = deltaRot;
}
```

#### 碰撞事件生成

如果任一物体启用了 `bGenerateCollisionEvents` 且本对尚未记录事件：

```hlsl
if (bGenerateCollisionEvents && bEventRecorded == 0) {
    // 平均有深度的接触点位置
    InterlockedAdd(CollisionEventBuffer[0], 1, EventIndex);
    // 写入 [idxA, idxB, avgContactPos.xyz, avgContactPos.z, WorldNormal.xyz]
}
```

### 13.3 ApplyDelta —— 增量应用

**Shader**: `/GPUPhysics/CollisionApplyDelta.usf`，入口 `CollisionApplyDeltaCS`，`[numthreads(64,1,1)]`

每粒子执行：

1. 读取 `ParticleDeltaCountBuffer[idx]`，跳过 0 增量粒子
2. clamp 到 `MAX_DELTAS_PER_PARTICLE = 12`
3. 累加所有增量：`totalDeltaPos += deltaPos[i]`，`totalDeltaRot += deltaRot[i]`
4. 位置更新：`currentPos += totalDeltaPos`
5. 旋转更新：`deltaQuat = EulerToQuaternion(totalDeltaRot)`，`currentRot = normalize(QuatMultiply(deltaQuat, currentRot))`
6. 写入 `TotalDeltaBuffer`（供下一次 Gather 迭代读取）
7. 清零 `ParticleDeltaCountBuffer[idx]`

### 13.4 ScatterOutput —— 约束持久化

**Shader**: `/GPUPhysics/CollisionScatterOutput.usf`，入口 `ScatterOutputCS`

在 PBD 求解完成后，将流形持久化到 `ConstraintArrayBuffer` 供下一帧热启动使用：

1. 更新 `LastShapeWorldPositionDelta` 和 `LastShapeWorldRotationDelta`
2. 从 `SolverManifoldBuffer` 读取 `StaticFrictionRatio`：
   - ≥ 1.0 → 设置 `bHasAnchor` flag（静态摩擦锚点有效）
   - > 0 → 按 ratio 插值锚点
   - = 0 → 重置锚点 = 接触点，清除 flag
3. 通过 `AddConstraintToParticle` 将约束索引添加到两个粒子的约束列表
4. 构建 `FGPUConstraint` 写入 `ConstraintArrayBufferRW`

---

## 第十四节 移动端 ES3.1 兼容

### 14.1 类型化 Buffer 而非结构化 Buffer

ES3.1 不支持 `RWStructuredBuffer<float4>` 的随机读写，因此所有 Buffer 使用 `RWBuffer<float>` / `RWBuffer<uint>`（类型化 Buffer），通过 4 个连续 float 模拟 float4：

```hlsl
// 读取粒子位置（float4 打包在 float buffer 中）
uint base = particleIndex * 4;
float3 position = float3(PositionBuffer[base], PositionBuffer[base+1], PositionBuffer[base+2]);
float mass = PositionBuffer[base+3];
```

### 14.2 CFLAG_AllowTypedUAVLoads

旧式 Shader 使用 `#pragma CFLAG_AllowTypedUAVLoads` 允许对类型化 UAV 进行随机读取（ES3.1 需要 `GL_EXT_shader_image_load_formatted` 扩展）。

### 14.3 iOS Metal 防崩溃

- **ParticleModify 条件写入**：只写入对应 flag 位置 1 的 Buffer，减少分散写入避免 `AGXMetalA12 Code=3` 错误
- **EPA 反融合**：`SuppB = max(SuppB, -1e20)` 打断 `Load-Mul` 指令融合
- **GroundConstraint 使用 `max()`**：替代 `if` 赋值，避免 Metal 分支预测问题
- **Half 精度 GPUShape**：使用 `half3` / `half4` 减少 GPU 寄存器压力
- **`asuint` / `asfloat` 类型双关**：避免 FTZ（Flush-to-Zero）问题

### 14.4 GroupShared 分区

GJK、EPA、Manifold 和 PBD Solver 使用 groupshared 内存，但采用 **per-thread 分区**（每个线程拥有独立的内存段），无需 `GroupMemoryBarrier`：

```hlsl
// GJK: 每线程 41 floats 的 Simplex 存储
float GetSimplexBase(uint threadIdx) { return threadIdx * 41; }
```

只有 EPAPolytope 的全局↔shared 转换辅助函数使用 `GroupMemoryBarrierWithGroupSync()`，但这些函数在批量路径中未被调用。

---

## 第十五节 GPU 异步回读

### 15.1 异步回读机制

```cpp
struct FAsyncReadbackResources {
    TSharedPtr<FenceRHIRef> SharedFence;
    TUniquePtr<FRHIGPUBufferReadback> PositionReadback;
    TUniquePtr<FRHIGPUBufferReadback> RotationReadback;
    TUniquePtr<FRHIGPUBufferReadback> StateReadback;
    TUniquePtr<FRHIGPUBufferReadback> VelocityReadback;
    TUniquePtr<FRHIGPUBufferReadback> AngularVelocityReadback;
    TUniquePtr<FRHIGPUBufferReadback> DebugReadback;
    TUniquePtr<FRHIGPUBufferReadback> CollisionEventReadback;
    uint64 EnqueuedFrameIndex;
    bool bPending;
    bool bIncludeVelocityData;
};
```

每帧模拟结束后，`EnqueueAsyncReadback` 将 7 个 Buffer 拷贝到 `FRHIGPUBufferReadback` 暂存区并设置共享 Fence。下一帧开始时，`TryProcessAsyncReadback` 检查 Fence 是否 signaled，如果是则锁定暂存 Buffer 并将数据转换为 CPU 端的 `FPhysicsParticleData`。

### 15.2 缓存延迟

由于异步回读有 1 帧延迟：

- `GetPosition()` / `GetRotation()` / `GetVelocity()` 读取的是**上一帧**的模拟结果
- `SetPosition()` / `SetVelocity()` 排队到**下一帧**应用
- 新创建的物体在第一次 `Simulate()` 之前 `HasValidData()` 返回 `false`

### 15.3 FPhysicsParticleData 缓存结构

```cpp
struct FPhysicsParticleData {
    FVector CurrentPosition;      // 48 bytes (3 × float)
    FVector PreviousPosition;
    FVector Velocity;
    FVector DeltaPosition;        // legacy, 未使用
    float CurrentRotation[4];     // 四元数，float[4] 匹配 HLSL float4
    float PreviousRotation[4];
    FVector AngularVelocity;
    FVector DeltaRotation;        // legacy
    float Mass;
    float InverseMass;
    float InvInertiaScale;
    float bGenerateCollisionEvents;
    int32 ShapeType;               // 0=Box, 1=Cylinder, 2=Sphere, 3=Capsule, 4=Convex
    FVector Extents;
    int32 ParticleID;
    int32 IsActive;
    int32 bEnableCollision;
    int32 FrameIndex;
    int32 BodyGroupID;
    int32 Padding;
};  // 总计 160 bytes
```

`FGPUPhysicsBody` 持有 `mutable FPhysicsParticleData CachedData` 和 `mutable bool bCacheValid`。getter 方法在访问前懒更新缓存。

---

## 第十六节 可视化系统

### 16.1 ParticleVisualizationActor

`AParticleVisualizationActor` 是被动更新的可视化 Actor——不使用 `Tick`，由 `PhysicsWorldManager` 在模拟后调用 `UpdateVisualization()`。

#### 混合渲染策略

| 类型 | 渲染方式 | 适用场景 |
|------|---------|---------|
| NormalBox/Cylinder/Sphere/Capsule/Convex | InstancedStaticMeshComponent | 大量相同形状的粒子 |
| NormalCylinder1 (101) | 独立的 ISM | 彩蛋币等需要单独材质的 Cylinder |
| Custom (255) | 独立 StaticMeshComponent | 需要自定义 Mesh/材质/缩放/阴影的物体 |

#### Instance 缩放计算

```cpp
static FVector CalculateInstanceScale(
    EPhysicsShapeType ShapeType,
    const FVector& ActualExtents,    // 物理形状的实际尺寸
    const FVector& DefaultExtents    // Mesh 的默认尺寸
);
// Box: (ActualHalfX/DefaultHalfX, ActualHalfY/DefaultHalfY, ActualHalfZ/DefaultHalfZ)
// Cylinder: (Radius/DefaultRadius, HalfHeight/DefaultHalfHeight, Radius/DefaultRadius)
// Sphere: (Radius/DefaultRadius) × (1,1,1)
```

#### Custom 类型生命周期管理

- 创建时：`CreateCustomComponent` → 新建 `UStaticMeshComponent`，设置 Mesh / 材质 / 缩放 / 阴影
- 每帧：`UpdateCustomComponent` → 更新 Transform 和配置
- 销毁时：`DestroyCustomComponent` → 从 TMap 移除并销毁 Component

### 16.2 Debug 绘制

通过 CVar `GPUPhysics.DebugDraw` 启用：

- Box：`DrawDebugBox`（半尺寸）
- Cylinder：`DrawDebugCylinder`（16 段，Radius + HalfHeight）
- Sphere：`DrawDebugSphere`
- Convex：变换凸包顶点到世界空间，`DrawDebugLine` 绘制边（多凸包用循环颜色区分）
- Custom 类型用橙色，其他用绿色

---

## 第十七节 碰撞事件系统

### 17.1 事件生成流程

1. 创建 Body 时设置 `bGenerateCollisionEvents = true`
2. PBD Solver 检测到碰撞时，通过 `InterlockedAdd` 在 `CollisionEventBuffer` 分配事件槽位
3. 写入事件数据：`[idxA, idxB, avgContactPos, WorldNormal]`
4. 异步回读到 CPU
5. `PhysicsWorldManager::GetAllCollisionEvents()` 返回当前帧事件列表

### 17.2 事件缓冲区布局

```
CollisionEventBuffer:
  [0..3]   uint4  — 事件计数器（counter）
  [4+0×8]  Event 0: [idxA, idxB, contactPos.xyz(asuint), contactPos.z, normal.xyz(asuint), pad]
  [4+1×8]  Event 1: ...
  ...
  [4+63×8] Event 63 (MaxCollisionEvents = 64)
```

使用 `asuint` 将 float 编码为 uint 存储（ES3.1 兼容），回读时用 `asfloat` 解码。

### 17.3 去重

`MaxCollisionEventDedupSlots = 4096`，用于事件去重（避免同一对物体在一帧内生成多个事件）。

---

## 第十八节 编辑器工具

### 18.1 Shader 编译器辅助

`FShaderCompilerHelper` 提供编辑器命令直接编译 Shader 生成 GLSL：

```
CompileShader <ShaderName> [USFFile] [OutputDir]
CompileAllShaders <OutputDir>
```

注册为 IConsoleCommand，在编辑器控制台直接调用。

### 18.2 ConvexHullDataAsset 编辑器

`UConvexHullDataAsset` 提供两个 `CallInEditor` 按钮：

- `ExtractConvexFromMesh()`：从 `SourceMesh` 的 BodySetup 提取凸包数据
- `ClearData()`：清空所有数据

### 18.3 测试模块

`GPUPhysicsTests` 模块（UncookedOnly）包含：

- `PhysicsWorldManagerTest.cpp`：自动化测试，验证 PhysicsWorldManager 的创建、初始化、Body 管理等功能
- 通过 `AutomationController` 集成到 UE 自动化测试框架

---

## 第十九节 关键设计决策与限制

### 19.1 设计优势

1. **接口分离**：上层无需接触 RHI，GPU 资源封装在 Dispatcher Actor 中
2. **SoA 布局**：优化 GPU coalescing 访问
3. **热启动**：TryRestoreManifold 在物体相对静止时跳过整个 GJK+EPA+Manifold 管线
4. **增量累积**：PBD Solver 的增量通过 ParticleDeltaBuffer 收集，ApplyDelta 统一应用，避免同一帧内多次读写位置 Buffer
5. **移动端兼容**：ES3.1 / Metal A12 全链路兼容

### 19.2 当前限制

1. **图着色未启用**：`MaxColorGroups = 1`，所有约束在单一颜色组中求解，依赖 SolverIterations 收敛而非并行分组
2. **CPU 查询无加速结构**：`Overlap` 是 O(N) 线性扫描，无 BVH / 网格加速
3. **CPU 无 EPA**：GJK 检测到相交后不计算渗透深度
4. **Capsule 不支持碰撞**：仅用于可视化绘制
5. **多凸包碰撞未完全实现**：GPU 将多凸包视为单一凸包外壳，真正的 per-hull 碰撞需要为每个 hull 创建独立 Body（CompoundBody 方式）
6. **DeltaTime 硬编码**：Body 的力/冲量转换中 `DeltaTime = 1.0/60.0` 硬编码，未使用实际帧率

### 19.3 性能参数推荐

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| MaxBodies | ≤ 4096 | 移动端建议 ≤ 2048 |
| SolverIterations | 12–16 | 更多迭代更稳定但更慢 |
| MaxBroadPhasePairs | 10240 | Broadphase 输出上限 |
| DeltaTimeSmoothFrames | 5 | 平滑窗口 |
| MinDeltaTime / MaxDeltaTime | 0.01 / 0.025 | 限制在 40–100 FPS |
| RECYCLING_DELAY_FRAMES | 5 | 不可调（硬编码），确保 GPU 安全 |

---

## 附录 A：所有 Compute Shader 一览

| # | Shader 类 | USF 文件 | 入口 | 线程组 | 用途 |
|---|-----------|---------|------|--------|------|
| 1 | FParticleAddShader | ParticleAdd.usf | AddParticlesMain | 64 | 新粒子写入 |
| 2 | FParticleModifyShader | ParticleModify.usf | ParticleModifyMain | 64 | 粒子属性修改 |
| 3 | FParticleIntegrateShader | ParticleIntegrate.usf | Main | 64 | 重力积分 |
| 4 | FGroundConstraintShader | GroundConstraint.usf | Main | 64 | 地面约束 |
| 5 | FCollisionBroadPhaseShader | CollisionBroadPhase.usf | Main | 8×8 | AABB 宽相 |
| 6 | FTryRestoreManifoldShader | CollisionTryRestoreManifold.usf | TryRestoreManifoldCS | 64 | 流形热启动 |
| 7 | FCollisionDetectionCS | CollisionDetection.usf | CollisionDetectionCS | 32 | GJK 窄相 |
| 8 | FCollisionEPACS | CollisionEPA.usf | CollisionEPACS | 16 | EPA 渗透 |
| 9 | FCollisionManifoldLocalSpaceCS | CollisionManifoldLocalSpace.usf | CollisionManifoldLocalSpaceCS | 16 | 流形生成 |
| 10 | FCollisionColoringShader | CollisionColoringMain.usf | CollisionColoringMain | 64 | 图着色 |
| 11 | FCollisionGatherCS | CollisionGather.usf | CollisionGatherCS | 32 | 局部→世界 |
| 12 | FCollisionPBDSolverCS | CollisionPBDSolver.usf | PBDCollisionSolverCS | 32 | PBD 求解 |
| 13 | FCollisionApplyDeltaCS | CollisionApplyDelta.usf | CollisionApplyDeltaCS | 64 | 增量应用 |
| 14 | FCollisionScatterOutputCS | CollisionScatterOutput.usf | ScatterOutputCS | 64 | 约束持久化 |
| 15 | FParticleVelocityShader | ParticleVelocity.usf | Main | 64 | 速度重算 |

## 附录 B：Shader Include 依赖树

```
Common/
  ├── ParticleData.ush      — 粒子结构、SoA 访问、MaxDistance 计算
  ├── QuaternionMath.ush    — 四元数库（EulerToQuaternion, QuatMultiply, ...）
  ├── CollisionTypes.ush    — 所有碰撞结构体、常量、Pack/Unpack 函数
  └── DebugMacros.ush       — 调试宏（8 阶段 × 100 slots）

GJK/
  ├── ShapeSupport.ush      — Support 函数
  ├── GJKSimplex.ush        — CPU 参考版 Simplex 处理
  └── GJKCore.ush           — GPU groupshared 版 GJK 核心

EPA/
  ├── EPAPolytope.ush       — 多面体数据结构 + groupshared
  └── EPACore.ush           — EPA 算法（含 EPAPolytope.ush）

Manifold/
  ├── ContactFace.ush       — 参考面提取
  ├── FaceClipper.ush       — Sutherland-Hodgman 裁剪
  └── ManifoldCore.ush      — 流形生成入口（含 ContactFace + FaceClipper）
```

## 附录 C：CVar 控制台变量

| CVar | 默认值 | 说明 |
|------|--------|------|
| `GPUPhysics.DebugDraw` | 0 | 启用 Debug 绘制 |
| `GPUPhysics.EnableSimulate` | 1 | 启用/暂停物理模拟 |

## 附录 D：源文件索引

```
Public/
  Interface/
    PhysicsTypes.h          — USTRUCT/UENUM/委托定义
    IPhysicsWorld.h         — 物理世界接口
    IPhysicsBodyHandle.h    — 物体句柄接口
    IPhysicsQueryInterface.h — 查询接口
    PhysicsCallbacks.h      — C++ 委托声明
  Data/
    ConvexHullDataAsset.h   — 凸包数据资产
  PhysicsWorldManager.h     — 蓝图层 Actor

Private/
  Implementation/
    GPUPhysicsWorld.h/.cpp  — IPhysicsWorld 实现
    GPUPhysicsBody.h/.cpp   — IPhysicsBodyHandle 实现
    GPUPhysicsQuery.h/.cpp  — IPhysicsQueryInterface 实现
  CSDispatch/
    GPUSimulationDispatcher.h/.cpp — GPU 调度器（核心）
    GPUSimulationShaders.h/.cpp     — 旧式 Shader 声明
    CollisionDetectionShader.h     — GJK Shader
    CollisionEPAShader.h            — EPA Shader
    CollisionGatherShader.h/.cpp   — Gather Shader
    CollisionManifoldLocalSpaceShader.h/.cpp — Manifold Shader
    CollisionPBDSolverShader.h     — PBD Solver Shader
    CollisionApplyDeltaShader.h/.cpp — ApplyDelta Shader
    CollisionScatterOutputShader.h/.cpp — ScatterOutput Shader
  Utility/
    GJKTypes.h/.cpp         — GJK 数据结构
    GJKSupport.h/.cpp       — Support 函数（CPU）
    GJKAlgorithm.h/.cpp     — GJK 算法（CPU）
  Visualization/
    ParticleVisualizationActor.h/.cpp — 可视化 Actor
  PhysicsWorldManager.cpp  — 蓝图层实现
  ShaderCompilerHelper.h/.cpp — Shader 编译辅助
  GPUPhysics.h/.cpp         — 模块入口
```
