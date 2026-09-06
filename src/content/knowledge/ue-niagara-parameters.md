---
title: "UE Niagara 基础参数详解 — 系统/发射器/空间/属性与自定义模块"
excerpt: "系统梳理虚幻引擎 Niagara 粒子系统的参数体系：系统级、发射器、空间与坐标系、粒子属性、执行上下文、渲染器、模块、数据接口、事件、用户参数，以及自定义模块开发（C++ 数据接口、类型注册标志位 ENiagaraTypeRegistryFlags、Compute Shader）。将原工程文档中埋藏在二级章节下的类型注册标志体系提升为独立章节，补全 Compute Shader 管线与 .usf 注册流程。"
date: "2026-09-06"
category: "Engine"
subtopic: "VFXSystem"
tags: ["Niagara", "UE5", "粒子系统", "VFX", "C++"]
readTime: "阅读约45分钟"
---

> **Niagara** 是虚幻引擎 4.26+ 引入的新一代粒子系统，采用模块化、数据驱动的设计，支持 GPU 计算与自定义扩展。相比传统 Cascade，它提供了更灵活的节点式编辑器和可编程模型，使复杂视觉特效（VFX）的开发从美术配置到程序员扩展形成完整闭环。
>
> 本文系统梳理 Niagara 的参数体系与自定义模块开发，覆盖从系统配置到 C++ 扩展的完整链路。GPU 粒子模拟常作为流体/物理效果的计算载体——与&#12298;[SPH 流体模拟详解](/knowledge/sph-fluid-simulation/)&#12299;、&#12298;[PBF 流体模拟详解](/knowledge/pbf-fluid-simulation/)&#12299;形成交叉引用。

---

## 一、概述

### 1.1 核心特点

| 特性 | 说明 |
|------|------|
| 模块化设计 | 通过模块堆栈构建复杂效果，模块可复用、可组合 |
| 数据驱动 | 属性基于数据组织，易于调试与优化 |
| 节点式编辑 | 可视化节点编辑器，无需编写代码即可构建效果 |
| 高性能 | 优化的 GPU 计算支持，支持海量粒子 |
| 灵活扩展 | 支持自定义模块、数据接口、Compute Shader |

### 1.2 层级结构

```
Niagara System（系统）
├── User Variables（用户参数）
├── System Variables（系统变量）
└── Emitter（发射器）
    ├── Emitter Variables（发射器变量）
    ├── Spawn Script（生成脚本）
    ├── Update Script（更新脚本）
    ├── Event Script（事件脚本）
    └── Renderer（渲染器）
        └── Particles（粒子）
            └── Particle Variables（粒子属性）
```

每个层级有独立的作用域和生命周期，理解层级关系是掌握 Niagara 的基础。

---

## 二、系统级参数

### 2.1 System Execution Mode（系统执行模式）

控制整个系统的执行逻辑和时间基准。

| 模式 | 说明 |
|------|------|
| Independent（独立） | 系统独立运行，不受世界时间影响 |
| Game（游戏） | 跟随游戏时间运行，受时间膨胀影响 |
| User（用户） | 通过用户参数控制执行 |

### 2.2 Warmup Time（预热时间）

$$
\text{Warmup Time} \in [0.0, 5.0] \text{ 秒}
$$

系统开始播放前预先模拟的时间长度，用于让粒子效果在开始时达到稳定状态，避免"冷启动"现象。

### 2.3 Fixed Bounds（固定边界）

**参数类型**：Box（AABB 包围盒）

定义系统的固定边界范围，超出此范围的粒子将被剔除。包含 Min（最小值，Vector3）与 Max（最大值，Vector3）。

> **注**：Fixed Bounds 在系统级和性能优化中均有涉及——此处为参数定义，性能影响与调优策略见&#12298;十五、性能优化&#12299;。

### 2.4 LOD Distance（细节层次距离）

$$
\text{LOD Distance} \in [0, +\infty) \text{ 厘米}
$$

根据与摄像机的距离自动切换不同细节层次，包含 Distance（触发切换的距离阈值）和 LOD Levels（不同距离的 LOD 配置）。

---

## 三、发射器参数

### 3.1 Spawn Rate（生成速率）

$$
\text{Spawn Rate} \in [10, 10000] \text{ 粒子/秒}
$$

每秒生成的粒子数量。相关模块：

| 模块 | 说明 |
|------|------|
| Spawn Rate | 固定速率生成 |
| Spawn Burst Instantaneous | 瞬时爆发生成 |
| Spawn Burst Repeated | 重复爆发生成 |

典型值参考：低密度 10–100，中密度 100–1000，高密度 1000–10000。

### 3.2 Life Cycle Mode（生命周期模式）

| 模式 | 说明 |
|------|------|
| Self（自循环） | 发射器自动循环 |
| Auto（自动） | 根据 Spawn 参数自动控制 |
| Invalid（无效） | 手动控制 |

### 3.3 Execution State（执行状态）

| 状态 | 说明 |
|------|------|
| Active（活跃） | 发射器正在运行 |
| Inactive（非活跃） | 发射器已停止 |
| Invalid（无效） | 发射器未初始化 |

### 3.4 Allocation Mode（分配模式）

| 模式 | 说明 |
|------|------|
| Fixed（固定） | 预分配固定数量的粒子 |
| Dynamic（动态） | 根据需求动态分配 |
| Auto（自动） | 系统自动选择 |

控制内存分配策略，影响性能。固定分配避免运行时分配开销但可能浪费内存；动态分配节省内存但有分配开销。

### 3.5 Emitter Age 与 Looped Age

$$
\text{Emitter Looped Age} = \text{Emitter Age} \bmod \text{Loop Duration}
$$

- **Emitter Age**：发射器从开始运行到现在的总时间。
- **Looped Age**：当前循环周期内的年龄，用于循环效果同步。

---

## 四、空间与坐标系统

空间和坐标系统是理解粒子位置与变换的关键。不同空间坐标系影响位置计算、速度变换和渲染位置。

### 4.1 Simulation Space（模拟空间）

| 选项 | 说明 |
|------|------|
| Local Space（本地空间） | 相对于发射器坐标系 |
| World Space（世界空间） | 相对于世界坐标系 |
| System Space（系统空间） | 相对于系统坐标系 |

这是 Niagara 中最重要的参数之一，决定了所有粒子计算的坐标系基准，影响范围包括粒子位置计算、速度变换、力场应用和碰撞检测。

### 4.2 SimulationPosition 与 Position

| 属性 | 用途 |
|------|------|
| SimulationPosition | 用于物理模拟和计算 |
| Position | 用于渲染的最终位置（可能经过变换） |

在 Local Space 下，SimulationPosition 是相对于发射器原点的位置，发射器移动时粒子跟随移动，适合附着在物体上的效果。在 World Space 下，SimulationPosition 是世界坐标，发射器移动不影响已生成的粒子，适合环境效果。

> **API 说明**：`SimulationPosition` 是 UE5 Niagara 中的核心位置属性。在 GPU 模拟中，这是主要的位置属性，所有物理力基于它计算。属性名在不同 UE 版本中保持稳定（UE 4.26+ 至 UE 5.x），但底层布局可能因引擎版本略有差异。

### 4.3 空间转换

**Local → World**：

$$
\mathbf{p}_{\text{world}} = \mathbf{T}_{\text{emitter}} \cdot \mathbf{p}_{\text{local}}
$$

**World → Local**：

$$
\mathbf{p}_{\text{local}} = \mathbf{T}_{\text{emitter}}^{-1} \cdot \mathbf{p}_{\text{world}}
$$

其中 $\mathbf{T}_{\text{emitter}}$ 为发射器的完整变换矩阵（位置 + 旋转 + 缩放）。

### 4.4 坐标系参数总结

| 参数 | 类型 | 空间 | 说明 |
|------|------|------|------|
| SimulationPosition | Vector3 | 依 SimulationSpace | 粒子的模拟位置 |
| Position | Vector3 | 渲染空间 | 渲染时的最终位置 |
| Emitter Position | Vector3 | World | 发射器世界位置 |
| Emitter Orientation | Quaternion | World | 发射器朝向 |
| Emitter Transform | Transform | World | 发射器完整变换 |
| System Position | Vector3 | World | 系统世界位置 |
| System Transform | Transform | World | 系统完整变换 |

---

## 五、粒子属性

### 5.1 位置与速度

| 属性 | 类型 | 说明 |
|------|------|------|
| Position | Vector3 | 渲染空间中的位置 |
| SimulationPosition | Vector3 | 模拟空间中的位置 |
| PreviousPosition | Vector3 | 上一帧位置，用于速度计算和 Verlet 积分 |
| Velocity | Vector3 | 速度向量（cm/s） |
| PreviousVelocity | Vector3 | 上一帧速度 |

速度计算公式：

$$
\mathbf{v} = \frac{\mathbf{p}_{\text{current}} - \mathbf{p}_{\text{previous}}}{\Delta t}
$$

速度典型值：缓慢 100–500 cm/s，正常 500–2000 cm/s，快速 2000–5000 cm/s。

### 5.2 生命周期

| 属性 | 类型 | 说明 |
|------|------|------|
| Age | Float（秒） | 粒子存活时间 |
| Lifetime | Float（秒） | 最大存活时间 |
| NormalizedAge | Float（0–1） | $= \text{Age} / \text{Lifetime}$ |
| RemainingLife | Float（秒） | $= \text{Lifetime} - \text{Age}$ |

NormalizedAge 是 Niagara 中最常用的驱动参数，用于曲线插值（Color Over Life、Size Over Life 等）。

### 5.3 颜色与大小

| 属性 | 类型 | 说明 |
|------|------|------|
| Color | Vector4 (RGBA) | 颜色值，范围 0.0–1.0 |
| Size | Vector3 | X/Y/Z 轴大小（cm） |
| Scale | Float | 相对初始大小的缩放倍数 |

颜色通过 Color Over Life 模块驱动——以 NormalizedAge 为输入，输出 RGBA 曲线值。

### 5.4 旋转

| 属性 | 类型 | 说明 |
|------|------|------|
| Rotation | Vector3 / Quaternion | 粒子旋转角度 |
| RotationRate | Vector3 (度/秒) | 每秒旋转角度 |

### 5.5 物理属性

| 属性 | 类型 | 说明 |
|------|------|------|
| Mass | Float (kg) | 物理质量，典型 0.001–10.0 |
| InvMass | Float (1/kg) | 质量倒数，用于优化计算 |

$$
\text{InvMass} = \frac{1}{\text{Mass}} \quad (\text{当 Mass} > 0)
$$

### 5.6 其他属性

| 属性 | 说明 |
|------|------|
| DynamicMaterialParameters | 传递给材质的自定义参数（DynamicMaterial1-4, DynamicMaterialParam1-4） |
| MeshOrientation | 网格朝向（Default / Velocity / Camera / Normal） |
| ParticleID | 粒子唯一标识符 |
| SpawnID | 粒子生成时的批次 ID |

---

## 六、执行上下文参数

执行模块脚本时，Niagara 提供内置上下文参数，对实现循环、迭代和批量处理至关重要。

### 6.1 Execution Index（执行索引）

当前正在执行的粒子或实例的索引（从 0 开始）。

| 执行上下文 | 含义 |
|-----------|------|
| Spawn Script | 当前生成的粒子索引 |
| Update Script | 当前更新的粒子索引 |
| Event Script | 当前事件处理的粒子索引 |
| For Each Loop | 循环中的当前迭代索引 |

典型用途：遍历粒子数组、基于索引的随机化、粒子间交互。

### 6.2 Execution Count（执行总数）

当前执行批次中粒子或实例的总数。

| 执行上下文 | 含义 |
|-----------|------|
| Spawn Script | 本次生成的所有粒子总数 |
| Update Script | 当前帧所有活跃粒子总数 |
| Event Script | 触发事件的所有粒子总数 |
| For Each Loop | 循环迭代的总次数 |

典型用途：计算平均值/总和、归一化操作、性能监控。

### 6.3 组合使用模式

**归一化索引**（映射到 0–1，用于曲线采样）：

$$
\text{Normalized Index} = \frac{\text{Execution Index}}{\text{Execution Count} - 1}
$$

**循环访问数组**：

```
Execution Index → Modulo (Array Size) → Array Index → Get Array Element
```

**粒子对处理**（如约束求解）：

```
For Each (Particles):
  Execution Index     → Get Particle A
  Execution Index + 1 → Get Particle B
  Calculate Distance → Apply Constraint
  // 需确保 Execution Index + 1 < Execution Count
```

### 6.4 其他执行上下文

| 参数 | 类型 | 说明 |
|------|------|------|
| DeltaTime | Float (秒) | 自上一帧以来经过的时间 |
| EmitterAge | Float (秒) | 发射器运行总时间 |
| SystemTick | Int32 | 系统运行的帧数（从 0 开始） |

---

## 七、渲染器

### 7.1 Sprite Renderer（精灵渲染器）

| 参数 | 类型 | 说明 |
|------|------|------|
| SpriteSize | Vector2 (宽×高) | 2D 精灵粒子的尺寸 |
| SpriteRotation | Float (度) | 精灵的旋转角度 |
| SubImageIndex | Int32 | 纹理图集子图像索引 |
| Material | MaterialInterface | 渲染材质（须使用 Niagara Sprite 渲染域） |

### 7.2 Mesh Renderer（网格渲染器）

| 参数 | 类型 | 说明 |
|------|------|------|
| Mesh | StaticMesh | 3D 网格模型 |
| Scale | Vector3 | 网格缩放倍数 |
| MeshOrientation | Enum | Default / Velocity / Camera / Normal |

### 7.3 Ribbon Renderer（条带渲染器）

| 参数 | 类型 | 说明 |
|------|------|------|
| DrawDirection | Enum | Normal（沿轨迹）/ From First / From Second |
| TessellationFactor | Float | 条带细分密度 |
| UVTilingDistance | Float (cm) | UV 重复距离 |

### 7.4 通用渲染参数

| 参数 | 类型 | 说明 |
|------|------|------|
| SortMode | Enum | None / ViewDistance / ViewDepth / Custom Ascending / Custom Descending |
| CullDistance | Float (cm) | 超出此距离的粒子被剔除 |
| VisibilityTag | Name | 控制粒子可见性 |

---

## 八、模块系统

### 8.1 Spawn（生成）模块

| 模块 | 参数 | 说明 |
|------|------|------|
| Spawn Rate | SpawnRate (Float) | 固定速率生成 |
| Spawn Burst Instantaneous | SpawnCount, SpawnTime | 瞬时爆发 |
| Spawn Burst Repeated | SpawnCount, SpawnPeriod, SpawnDuration | 周期性爆发 |

### 8.2 Update（更新）模块

**Gravity Force**：重力加速度向量，地球 $\mathbf{g} = [0, 0, -980]$ cm/s²。

**Drag**：阻力系数，速度衰减：

$$
\mathbf{v} \leftarrow \mathbf{v} \cdot (1 - \text{Drag} \cdot \Delta t)
$$

典型值 0.0–1.0。

**Collision**：碰撞模块，支持 Plane / World Static / Depth Buffer，参数含 Friction（0–1）、Restitution（0–1）、CollisionRadius。

### 8.3 形状生成模块

| 形状 | 说明 |
|------|------|
| Point | 点 |
| Box | 立方体 |
| Sphere | 球体 |
| Cylinder | 圆柱体 |
| Cone | 圆锥体 |
| Circle | 圆形 |

参数含 ShapeSize 和 SpawnDistribution。

### 8.4 视觉模块

| 模块 | 曲线输入 | 说明 |
|------|---------|------|
| Scale Over Life | NormalizedAge | 大小随生命周期变化 |
| Color Over Life | NormalizedAge | 颜色随生命周期变化 |
| Alpha Over Life | NormalizedAge | 透明度随生命周期变化 |

典型 Alpha 曲线模式：Fade In（0→1）、Fade Out（1→0）、Fade In/Out（0→1→0）。

---

## 九、数据接口

数据接口允许 Niagara 访问外部数据源。

### 9.1 Curve Data Interface

从外部曲线资产读取数据。参数含 CurveAsset 和 Input（通常为 NormalizedAge）。

### 9.2 Grid 2D/3D Data Interface

访问 2D 或 3D 网格数据，参数含 GridSize、GridCellSize 和 Position。用于基于网格的模拟（如流体、烟雾）。

### 9.3 Mesh Data Interface

访问静态网格数据，参数含 Mesh 和 SamplingMethod。用于从网格表面生成粒子、读取顶点数据、碰撞检测。

### 9.4 Texture Data Interface

从纹理采样数据，参数含 Texture 和 UVCoordinates。用于颜色采样、高度场数据和遮罩数据。

---

## 十、事件系统

| 事件 | 触发条件 | 输出数据 |
|------|---------|---------|
| Collision Event | 粒子与指定对象碰撞 | CollisionPosition, CollisionNormal, CollisionVelocity |
| Death Event | 粒子生命周期结束 | — |
| Location Event | 粒子到达指定位置 | EventLocation, EventRadius |
| Custom Event | 代码或蓝图手动触发 | EventName, EventParameters |

碰撞事件用于实现碰撞后特效（火花、爆炸）；死亡事件用于粒子死亡时的额外效果；自定义事件用于与外部系统交互。

---

## 十一、用户参数

### 11.1 参数类型

用户参数在 Niagara System 的 User Exposed 面板定义，支持 Bool、Int、Float、Vector2/3/4、Color、Curve、Texture 等类型。

### 11.2 常用用户参数

| 参数 | 类型 | 范围 | 用途 |
|------|------|------|------|
| Intensity | Float | 0.0–10.0 | 统一控制特效强度 |
| ColorTint | Color | — | 统一调整特效颜色 |
| SpawnRateMultiplier | Float | 0.0–5.0 | 动态调整粒子生成速率 |
| SizeMultiplier | Float | 0.1–10.0 | 统一缩放粒子大小 |

### 11.3 参数绑定

支持蓝图绑定（蓝图中设置参数值）、C++ 绑定（代码设置参数值）和材质绑定（与材质参数关联），用于运行时动态控制特效。

---

## 十二、自定义模块开发

### 12.1 自定义函数模块（Function Modules）

在 Niagara 编辑器中创建可重用函数，包含 Inputs、Outputs 和 Script 三部分。支持 Float、Int、Bool、Vector2/3/4、Color、Quaternion、Matrix 及自定义结构体（如 `FNSPBDParticle`）作为输入输出类型。

### 12.2 自定义数据接口（Data Interfaces）

数据接口允许 Niagara 访问外部数据源，需 C++ 实现。

**步骤 1：创建 C++ 类**

```cpp
#pragma once

#include "NiagaraDataInterface.h"
#include "MyCustomDataInterface.generated.h"

UCLASS(EditInlineNew, Category = "My Custom")
class PHYSICSINTERACTION_API UNiagaraDataInterfaceMyCustom : public UNiagaraDataInterface
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, Category = "My Custom")
    float CustomParameter = 1.0f;

    virtual void GetFunctions(TArray<FNiagaraFunctionSignature>& OutFunctions) override;
    virtual void GetVMExternalFunction(const FVMExternalFunctionBindingInfo& BindingInfo,
                                       void* InstanceData, FVMExternalFunction& OutFunc) override;
};
```

**步骤 2：实现功能函数**

```cpp
#include "MyCustomDataInterface.h"
#include "NiagaraTypes.h"
#include "NiagaraShader.h"

void UNiagaraDataInterfaceMyCustom::GetFunctions(
    TArray<FNiagaraFunctionSignature>& OutFunctions)
{
    FNiagaraFunctionSignature Sig;
    Sig.Name = TEXT("GetCustomValue");
    Sig.Inputs.Add(FNiagaraVariable(FNiagaraTypeDefinition::GetFloatDef(), TEXT("Input")));
    Sig.Outputs.Add(FNiagaraVariable(FNiagaraTypeDefinition::GetFloatDef(), TEXT("Output")));
    Sig.bMemberFunction = true;
    Sig.bRequiresContext = false;
    OutFunctions.Add(Sig);
}

void UNiagaraDataInterfaceMyCustom::GetVMExternalFunction(
    const FVMExternalFunctionBindingInfo& BindingInfo,
    void* InstanceData,
    FVMExternalFunction& OutFunc)
{
    if (BindingInfo.Name == TEXT("GetCustomValue"))
    {
        OutFunc = FVMExternalFunction::CreateLambda(
            [this](FVectorVMContext& Context)
            {
                FVectorVMRegister InputReg(Context, 0, ERHIFeatureLevel::SM5);
                FVectorVMRegister OutputReg(Context, 0, ERHIFeatureLevel::SM5);

                for (int32 i = 0; i < Context.NumInstances; ++i)
                {
                    float Input = InputReg.Get<float>();
                    float Output = Input * CustomParameter;
                    OutputReg.Set<float>(Output);

                    InputReg.Advance();
                    OutputReg.Advance();
                }
            });
    }
}
```

> **API 说明**：`FVectorVMRegister` 是 Niagara Vector VM 的寄存器访问类。其构造函数签名和 API 在 UE 5.0–5.4 间有细微变化——早期版本使用 `FVectorVMContext` 直接索引，UE 5.2+ 引入了更类型安全的 `FVectorVMRegister` 封装。以上代码基于 UE 5.2+ 风格；若在 UE 5.0/5.1 中编译，需改用 `FVectorVM::GetRegister` 风格 API。

### 12.3 自定义结构体

```cpp
USTRUCT(BlueprintType)
struct FNSPBDParticle {
    GENERATED_BODY()

    UPROPERTY(EditAnywhere)
    FVector Position;

    UPROPERTY(EditAnywhere)
    FVector PreviousPosition;

    UPROPERTY(EditAnywhere)
    FVector Velocity;

    UPROPERTY(EditAnywhere)
    float Mass;

    UPROPERTY(EditAnywhere)
    float InvMass;

    FNSPBDParticle(FVector InPosition = FVector::ZeroVector,
                   FVector InVelocity = FVector::ZeroVector,
                   float InMass = 1.0f)
        : Position(InPosition)
        , PreviousPosition(InPosition)
        , Velocity(InVelocity)
        , Mass(InMass)
        , InvMass(Mass > 0 ? 1.0f / Mass : 0.0f)
    {
    }
};
```

注意事项：必须使用 `GENERATED_BODY()` 宏，属性必须用 `UPROPERTY()` 标记，结构体名称以 `F` 开头（UE 约定）。

### 12.4 模块脚本类型

| 类型 | 执行时机 | 用途 |
|------|---------|------|
| Spawn Script | 粒子生成时执行一次 | 初始化粒子属性 |
| Update Script | 每帧为每个粒子执行 | 更新粒子状态 |
| Event Script | 事件触发时执行 | 响应特定事件 |

---

## 十三、类型注册与 ENiagaraTypeRegistryFlags

> **原工程文档将本节埋藏在 `#### 2.3` 下，内容超过 450 行。此处提升为独立章节，因其是自定义模块开发的核心知识点。**

### 13.1 注册流程

在模块的 `StartupModule` 中注册自定义类型：

```cpp
void FPhysicsInteractionModule::StartupModule()
{
    const FNiagaraTypeDefinition TypeDef(FNSPBDParticle::StaticStruct());
    const auto Flags =
        ENiagaraTypeRegistryFlags::AllowAnyVariable |
        ENiagaraTypeRegistryFlags::AllowNotUserVariable;

    FNiagaraTypeRegistry::Register(TypeDef, Flags);
}
```

### 13.2 基础标志位

| 标志 | 值 | 作用域 | 说明 |
|------|-----|--------|------|
| None | 0 | 无 | 不设置任何标志，类型不可使用 |
| AllowUserVariable | 1<<0 | User | 允许作为用户变量，在 User Exposed 面板可见 |
| AllowSystemVariable | 1<<1 | System | 允许作为系统级变量，所有发射器共享 |
| AllowEmitterVariable | 1<<2 | Emitter | 允许作为发射器级变量，该发射器粒子可访问 |
| AllowParticleVariable | 1<<3 | Particle | 允许作为粒子级变量，每个粒子独立副本 |
| AllowParameter | 1<<4 | 函数 | 允许作为函数参数或模块参数 |
| AllowPayload | 1<<5 | 事件 | 允许作为事件载荷 |
| IsUserDefined | 1<<6 | 标记 | 标记为用户自定义类型（非引擎内置） |

### 13.3 组合标志

| 组合 | 组成 | 说明 |
|------|------|------|
| AllowAnyVariable | User \| System \| Emitter \| Particle | 所有变量级别均可用，最宽松 |
| AllowNotUserVariable | System \| Emitter \| Particle | 允许内部使用，不暴露给蓝图 |

### 13.4 变量级别层次结构

```
Niagara System（系统）
├── User Variables        ← AllowUserVariable
├── System Variables      ← AllowSystemVariable
│
└── Emitter（发射器）
    ├── Emitter Variables  ← AllowEmitterVariable
    │
    └── Particles（粒子）
        └── Particle Variables ← AllowParticleVariable
```

### 13.5 常用标志组合模式

**模式 1：完全开放型**（简单类型，如基础结构体）

```cpp
const auto Flags =
    ENiagaraTypeRegistryFlags::AllowAnyVariable |
    ENiagaraTypeRegistryFlags::AllowParameter |
    ENiagaraTypeRegistryFlags::AllowPayload;
```

**模式 2：内部使用型**（复杂类型，含指针）

```cpp
const auto Flags =
    ENiagaraTypeRegistryFlags::AllowNotUserVariable |
    ENiagaraTypeRegistryFlags::AllowParameter;
```

**模式 3：粒子专用型**（粒子属性数据）

```cpp
const auto Flags =
    ENiagaraTypeRegistryFlags::AllowParticleVariable |
    ENiagaraTypeRegistryFlags::AllowParameter;
```

**模式 4：事件传递型**（事件数据结构）

```cpp
const auto Flags =
    ENiagaraTypeRegistryFlags::AllowPayload |
    ENiagaraTypeRegistryFlags::AllowParameter;
```

**模式 5：配置参数型**（系统/发射器配置）

```cpp
const auto Flags =
    ENiagaraTypeRegistryFlags::AllowUserVariable |
    ENiagaraTypeRegistryFlags::AllowSystemVariable |
    ENiagaraTypeRegistryFlags::AllowEmitterVariable |
    ENiagaraTypeRegistryFlags::AllowParameter;
```

### 13.6 实际应用示例

**注册 PBD 粒子结构体**（简单数据，全面开放）：

```cpp
void FPhysicsInteractionModule::StartupModule()
{
    const FNiagaraTypeDefinition TypeDef(FNSPBDParticle::StaticStruct());
    const auto Flags =
        ENiagaraTypeRegistryFlags::AllowAnyVariable |
        ENiagaraTypeRegistryFlags::AllowParameter |
        ENiagaraTypeRegistryFlags::AllowPayload |
        ENiagaraTypeRegistryFlags::IsUserDefined;

    FNiagaraTypeRegistry::Register(TypeDef, Flags);
}
```

**注册包含指针的约束结构体**（限制使用范围）：

```cpp
USTRUCT(BlueprintType)
struct FPBDConstraint {
    FPBDParticle* ParticleA;  // 指针成员，不能暴露给用户
    FPBDParticle* ParticleB;

    UPROPERTY(EditAnywhere)
    int32 IndexA;

    UPROPERTY(EditAnywhere)
    int32 IndexB;
};

void FPhysicsInteractionModule::StartupModule()
{
    const FNiagaraTypeDefinition TypeDef(FPBDConstraint::StaticStruct());
    const auto Flags =
        ENiagaraTypeRegistryFlags::AllowEmitterVariable |
        ENiagaraTypeRegistryFlags::AllowParameter |
        ENiagaraTypeRegistryFlags::IsUserDefined;
    // 不含 AllowUserVariable（不暴露给蓝图）
    // 不含 AllowParticleVariable（结构体过大，不适合粒子级）

    FNiagaraTypeRegistry::Register(TypeDef, Flags);
}
```

### 13.7 标志选择决策树

```
开始：注册自定义类型
│
├─ 包含指针或非序列化成员？
│  ├─ 是 → 不使用 AllowUserVariable
│  └─ 否 → 可考虑 AllowUserVariable
│
├─ 数据量大小？
│  ├─ 大（>100 字节）→ 避免 AllowParticleVariable
│  └─ 小 → 可使用 AllowParticleVariable
│
├─ 需要从蓝图访问？
│  ├─ 是 → 必须使用 AllowUserVariable
│  └─ 否 → 使用 AllowNotUserVariable
│
├─ 需要在事件中传递？
│  ├─ 是 → 添加 AllowPayload
│  └─ 否 → 不需要
│
├─ 需要作为函数参数？
│  ├─ 是 → 添加 AllowParameter
│  └─ 否 → 可能无法在自定义函数中使用
│
└─ 是否为项目自定义类型？
   ├─ 是 → 添加 IsUserDefined
   └─ 否 → 不添加
```

### 13.8 性能考虑

| 考量 | 影响 | 建议 |
|------|------|------|
| AllowParticleVariable | 每个粒子创建副本，大型结构体显著增加内存 | 粒子级变量保持小于 64 字节 |
| AllowSystemVariable vs AllowEmitterVariable | System 共享一份数据，Emitter 每个发射器独立一份 | 共享数据用 System，独立状态用 Emitter |
| AllowPayload | 事件载荷需额外内存和传输开销 | 载荷数据保持精简 |

### 13.9 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| Cannot Set external constant, Type: XXX | 类型含指针但用了 AllowUserVariable | 移除 AllowUserVariable 或移除指针成员 |
| Type not allowed for particle attributes | 未设置 AllowParticleVariable | 添加 AllowParticleVariable |
| Cannot use type in function parameters | 未设置 AllowParameter | 添加 AllowParameter |

---

## 十四、Compute Shader 与 GPU 计算

> **原工程文档此节较薄弱，以下补全 Compute Shader 管线、绑定与 .usf 注册流程。**

### 14.1 GPU 模拟概述

当粒子数量多、计算复杂时，启用 GPU Simulation 可获得显著性能提升。GPU 模拟通过 Compute Shader 在 GPU 上并行执行粒子更新逻辑。

启用条件：粒子数量多（>1000）、计算复杂、需要并行加速。

### 14.2 创建 GPU 计算模块

**步骤 1：创建 Module 脚本**

在 Niagara 编辑器中创建新的 Module Script，设置执行上下文（Spawn/Update），添加 GPU Compute Script 节点。

**步骤 2：编写 HLSL 代码**

```hlsl
// GPU 计算脚本示例：重力 + 边界反弹
void CustomCompute(
    inout float3 Position,
    inout float3 Velocity,
    in float3 Gravity,
    in float DeltaTime
)
{
    // 应用重力
    Velocity += Gravity * DeltaTime;

    // 更新位置
    Position += Velocity * DeltaTime;

    // 简单的边界检查
    if (Position.y < 0.0)
    {
        Position.y = 0.0;
        Velocity.y *= -0.5; // 反弹
    }
}
```

### 14.3 .usf 着色器文件注册

> **补全**：原工程文档未说明 .usf 文件的创建与注册流程。

Compute Shader 的 HLSL 代码需放在 `.usf`（Unreal Shader File）中，并在模块启动时注册到引擎的着色器映射。

**步骤 1：创建 .usf 文件**

在插件的 `Shaders` 目录下创建 `MyCustomComputeShader.usf`：

```hlsl
#pragma once

#include "/Engine/Public/Platform.ush"

// 粒子数据缓冲的绑定
RWStructuredBuffer<float3> PositionBuffer : register(u0);
RWStructuredBuffer<float3> VelocityBuffer : register(u1);

// 参数
float3 Gravity;
float DeltaTime;
uint NumParticles;

[numthreads(64, 1, 1)]
void MainCS(uint3 DispatchThreadId : SV_DispatchThreadID)
{
    uint Index = DispatchThreadId.x;
    if (Index >= NumParticles)
        return;

    float3 Pos = PositionBuffer[Index];
    float3 Vel = VelocityBuffer[Index];

    // 重力积分
    Vel += Gravity * DeltaTime;
    Pos += Vel * DeltaTime;

    // 边界反弹
    if (Pos.y < 0.0)
    {
        Pos.y = 0.0;
        Vel.y *= -0.5;
    }

    PositionBuffer[Index] = Pos;
    VelocityBuffer[Index] = Vel;
}
```

**步骤 2：实现 FGlobalShader 子类**

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GlobalShader.h"
#include "ShaderParameterStruct.h"

class FMyCustomComputeShader : public FGlobalShader
{
public:
    DECLARE_GLOBAL_SHADER(FMyCustomComputeShader)
    SHADER_USE_PARAMETER_STRUCT(FMyCustomComputeShader, FGlobalShader)

    BEGIN_SHADER_PARAMETER_STRUCT(FParameters)
        SHADER_PARAMETER(FVector3f, Gravity)
        SHADER_PARAMETER(float, DeltaTime)
        SHADER_PARAMETER(uint32, NumParticles)
        SHADER_PARAMETER_UAV(RWStructuredBuffer<FVector3f>, PositionBuffer)
        SHADER_PARAMETER_UAV(RWStructuredBuffer<FVector3f>, VelocityBuffer)
    END_SHADER_PARAMETER_STRUCT()

    static bool ShouldCompilePermutation(const FGlobalShaderPermutationParameters& Parameters)
    {
        return IsFeatureLevelSupported(Parameters.Platform, ERHIFeatureLevel::SM5);
    }
};

IMPLEMENT_GLOBAL_SHADER(FMyCustomComputeShader,
    "/Plugin/PhysicsInteraction/MyCustomComputeShader.usf",
    "MainCS", SF_Compute);
```

**步骤 3：调度 Compute Shader**

```cpp
void RunCustomComputeShader(
    FRHICommandListImmediate& RHICmdList,
    FUnorderedAccessViewRHIRef PositionUAV,
    FUnorderedAccessViewRHIRef VelocityUAV,
    FVector3f Gravity, float DeltaTime, uint32 NumParticles)
{
    FMyCustomComputeShader::FPermutationDomain PermutationVector;
    TShaderMapRef<FMyCustomComputeShader> ComputeShader(GetGlobalShaderMap(ERHIFeatureLevel::SM5), PermutationVector);

    FMyCustomComputeShader::FParameters Params;
    Params.Gravity = Gravity;
    Params.DeltaTime = DeltaTime;
    Params.NumParticles = NumParticles;
    Params.PositionBuffer = PositionUAV;
    Params.VelocityBuffer = VelocityUAV;

    FComputeShaderUtils::Dispatch(RHICmdList, ComputeShader, Params,
        FIntVector(FMath::DivideAndRoundUp(NumParticles, 64u), 1, 1));
}
```

> **版本说明**：以上代码基于 UE 5.x 的 Render Hardware Interface (RHI)。`FComputeShaderUtils::Dispatch` 在 UE 5.1+ 可用；UE 5.0 需手动使用 `RHICmdList.DispatchComputeShader`。`FVector3f` 是 UE 5.0 引入的 float 精度 FVector；UE 4.x 使用 `FVector`（double 精度）。

### 14.4 GPU 模拟管线

```
CPU 端                          GPU 端
──────                          ──────
1. 准备参数                  
2. 绑定 UAV/SRV  ──────────→  Compute Shader 执行
3. Dispatch(线程组数)            ├─ 读取 PositionBuffer (UAV)
                                ├─ 读取 VelocityBuffer (UAV)
                                ├─ 计算（重力、碰撞等）
                                └─ 写回 PositionBuffer / VelocityBuffer
4. 等待 GPU 完成  ←──────────
5. 后续渲染使用更新后的数据
```

线程组大小：`[numthreads(64, 1, 1)]` 表示每组 64 个线程。Dispatch 的线程组数量为 $\lceil \text{NumParticles} / 64 \rceil$。

---

## 十五、性能优化

### 15.1 GPU Simulation

| 参数 | 说明 |
|------|------|
| GPUSimulation | 启用 GPU 模拟 |
| GPUSimulationStage | GPU 模拟阶段 |

优势：更高性能、支持更多粒子、并行计算。

### 15.2 Fixed Bounds（固定边界）

如&#12298;二、系统级参数&#12299; §2.3 所述，Fixed Bounds 用于提前剔除超出范围的粒子，减少不必要的计算。此参数在系统级设置，性能影响在于减少 GPU/CPU 对不可见粒子的处理开销。

### 15.3 Max Particles（最大粒子数）

| 设备 | 典型值 |
|------|--------|
| 低端 | 1000–5000 |
| 中端 | 5000–10000 |
| 高端 | 10000–50000 |

限制发射器的最大粒子数量，防止粒子数量过多导致性能问题。

### 15.4 LOD System

根据距离自动优化性能：LOD Distance（LOD 切换距离）和 LOD ParticleCount（各 LOD 的粒子数量）。

### 15.5 Culling（剔除）

| 参数 | 说明 |
|------|------|
| CullDistance | 超出此距离的粒子被剔除 |
| CullAngle | 超出此角度的粒子被剔除 |

剔除不可见或远离摄像机的粒子。

---

## 十六、常用参数组合

### 16.1 火焰效果

| 参数 | 值 |
|------|-----|
| SpawnRate | 100–500 粒子/秒 |
| Lifetime | 0.5–2.0 秒 |
| InitialVelocity | 向上，随机化 |
| ColorOverLife | 红→橙→黄→透明 |
| SizeOverLife | 小→大→小 |
| AlphaOverLife | 淡入淡出 |
| Gravity | 轻微向上或零 |
| NoiseForce | 添加随机运动 |

### 16.2 烟雾效果

| 参数 | 值 |
|------|-----|
| SpawnRate | 50–200 粒子/秒 |
| Lifetime | 3–10 秒 |
| InitialVelocity | 向上，扩散 |
| Color | 灰白，低 Alpha |
| SizeOverLife | 小→大 |
| Drag | 0.5–0.8（高阻力） |
| NoiseForce | 复杂的噪声运动 |

### 16.3 火花效果

| 参数 | 值 |
|------|-----|
| SpawnBurst | 瞬时生成 50–200 个粒子 |
| Lifetime | 0.2–1.0 秒 |
| InitialVelocity | 随机方向，高速 |
| Color | 白→黄→红→透明 |
| Size | 1–5 cm |
| Gravity | 标准重力 |
| Collision | 启用碰撞 |

### 16.4 雨滴效果

| 参数 | 值 |
|------|-----|
| SpawnRate | 1000–5000 粒子/秒 |
| Lifetime | 根据高度计算 |
| InitialVelocity | 向下，随机水平偏移 |
| Size | 2–5 cm |
| Shape | 条带或网格 |
| Collision | 世界静态碰撞 |
| GPUSimulation | 启用（推荐） |

### 16.5 爆炸效果

| 参数 | 值 |
|------|-----|
| SpawnBurst | 瞬时生成大量粒子 |
| InitialVelocity | 径向爆炸 |
| ColorOverLife | 白→黄→红→黑→透明 |
| SizeOverLife | 大→小 |
| Lifetime | 0.5–2.0 秒 |
| NoiseForce | 添加随机性 |

---

## 十七、重要参数优先级

### 最高优先级（必须理解）

1. **SimulationSpace** — 决定所有计算的坐标系
2. **SimulationPosition** — 粒子物理计算的核心位置
3. **NormalizedAge** — 生命周期驱动的核心参数
4. **ExecutionIndex** — 循环和迭代的基础
5. **ExecutionCount** — 批量处理的必需参数

### 高优先级（常用）

6. Position — 渲染位置
7. Velocity — 运动计算
8. Lifetime — 生命周期控制
9. Age — 时间追踪
10. DeltaTime — 时间增量

### 中优先级（重要）

11. PreviousPosition — 速度计算
12. EmitterPosition — 空间转换
13. Color — 视觉效果
14. Size — 视觉大小
15. Mass — 物理计算

---

## 十八、参考文献

1. Epic Games. *Niagara VFX System Documentation*. Unreal Engine 5.x. ——官方 Niagara 文档与 API 参考。
2. Epic Games. *Niagara Data Interface API*. `UNiagaraDataInterface`, `FNiagaraTypeRegistry`, `ENiagaraTypeRegistryFlags`. ——类型注册与数据接口的引擎源码。
3. Epic Games. *Compute Shader Development Guide*. `FGlobalShader`, `FComputeShaderUtils`, RHI. ——GPU 计算着色器开发指南。
4. Project PhysicsInteraction. `FNSPBDParticle`, `FPBDConstraint` 示例. ——PhysicsInteraction 插件中的自定义类型注册实践。
5. &#12298;[SPH 流体模拟详解](/knowledge/sph-fluid-simulation/)&#12299; — Niagara GPU 粒子常作为流体模拟的计算载体。
6. &#12298;[PBF 流体模拟详解](/knowledge/pbf-fluid-simulation/)&#12299; — PBF 流体在 Niagara 中的 GPU 实现视角。
