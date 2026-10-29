---
title: Niagara：参数、模块与 GPU 数据接口
excerpt: 按层级、命名空间与执行阶段查阅参数，连接模块、数据接口和 GPU 交互。
date: '2026-09-06'
category: Engine
subtopic: VFXSystem
tags:
  - Niagara
  - UE5
  - 粒子系统
  - VFX
  - C++
readTime: 阅读约15分钟
kind: practice
level: intermediate
pageType: guide
aliases:
  - UE Niagara 基础参数详解 — 系统/发射器/空间/属性与自定义模块
prerequisites: []
nextArticles: []
related: []
sources:
  - title: Epic — Overview of Niagara
    url: 'https://dev.epicgames.com/documentation/unreal-engine/overview-of-niagara-effects-for-unreal-engine'
  - title: Epic — Niagara System Settings
    url: >-
      https://dev.epicgames.com/documentation/zh-cn/unreal-engine/system-settings-reference-for-niagara-effects-in-unreal-engine
  - title: Epic — Niagara Scalability and Best Practices
    url: 'https://dev.epicgames.com/documentation/unreal-engine/scalability-and-best-practices-for-niagara'
---
查阅 Niagara 参数时，先确定它属于哪个对象、在哪个阶段执行、使用什么空间，以及由谁写入。本文是工程参考，按查阅任务组织系统、发射器、粒子、模块和数据接口。外部物理求解状态如何发布给 Niagara，另见[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)。

## 范围、版本与代码口径

本轮核对本地 UE 源码快照 e28561eab454，路径为 E:\UnrealEngine\UnrealEngine_Source，核对日期 2026-10-23。Build.version 标为 5.9.0；公开设置资料参考 Epic 文档，具体资产 UI 和可用功能仍以项目版本为准。

以下路径相对于 Engine/Plugins/FX/Niagara/Source/Niagara/。源码定位用于核对接口存在和职责，不表示已经编译自定义模块、完成 GPU 资源绑定或运行某份 Niagara 资产。正文 C++ 是调用示意，宿主成员和资产另行准备。

## 层级与命名空间

### System、Emitter 与 Particle

System 组织一个效果中的发射器及系统级生命周期；Emitter 定义一组粒子的生成、更新和渲染；Particle 属性按粒子保存。模块在当前脚本上下文中读写参数，名称相同也不代表存储作用域相同。

常见命名空间包括 System、Emitter、Particles、User、Engine 和 Module。User 参数用于从宿主暴露输入；Module 参数表达模块输入或局部接口，不应把所有数值都写成粒子属性。

参数由名称和类型共同确定。User.SourcePosition 与 Particles.Position 的含义不同，Vector 与 Position 等类型也不能仅因都有三个数就直接互换。

### 最小查阅顺序

拿到一个参数先查：完整名称与类型 → 所属对象 → 首次赋值阶段 → 后续覆盖阶段 → 使用空间 → Renderer 或其他消费者。若在 Spawn 写入后又在 Update 重置，宿主值看似无效并不一定是参数设置接口失败。

## 执行阶段与模块顺序

System Spawn/Update、Emitter Spawn/Update、Particle Spawn/Update 的运行频率和数据范围不同。Spawn 负责初始化，Update 负责持续演化；同一栈内的模块顺序会影响后续读取值。

位置、速度、力和积分模块必须保持职责清楚。例如先累加加速度，再由指定模块推进速度和位置；若同时添加两套积分逻辑，会重复推进。写入最终位置的外部模拟通常不应再叠加不需要的粒子积分。

Simulation Stage 为额外阶段和迭代提供机制，实际可用性、读写集合和 Data Interface 支持需要按模拟目标和资产配置确认。它不是把任意全局 Compute Shader 自动变成粒子更新模块。

## 系统级设置

### Warmup

Warmup 在显示效果前推进一段模拟，使效果从较成熟状态出现。它包含预热时间、预热步长和次数之间的关系，不是所有项目统一的 0–5 秒范围。

Classes/NiagaraSystem.h:412–428 可查 NeedsWarmup、GetWarmupTime、GetWarmupTickCount、SetWarmupTime 与 ResolveWarmupTickCount。长预热可能增加激活成本；它不能替代资产初始化和异步资源准备。

### Fixed Bounds

Fixed Bounds 是用于可见性及相关可扩展性判断的固定包围范围。它不等于逐粒子碰撞边界，不会仅因一个粒子越界就自动把该粒子删除。

范围过小可能使仍应可见的效果被过早剔除，范围过大又会削弱剔除效果。边界采用何种空间以及组件级覆盖，应按实际资产和组件路径核对。

Classes/NiagaraSystem.h:824–825 提供 GetFixedBounds/SetFixedBounds，:860 与 :1054 可查相应状态和数据。需要粒子出界死亡时，应显式使用粒子生命周期或位置判断模块。

### Effect Type 与 Scalability

Effect Type 用于跨系统共享可扩展性和验证规则，System、Emitter 和 Renderer 还可能提供覆盖。距离、可见性、数量和预算策略需要结合当前设置解释，不能简单归为固定的 LOD Distance 数组。

减少生成数、停止模拟、暂停、剔除渲染和销毁系统是不同动作；选择哪种反应会影响效果恢复与已有粒子状态。调试消失问题时应同时检查 Effect Type、覆盖和可见性。

## 发射器与粒子属性

### CPU/GPU 模拟目标

Public/NiagaraCommon.h:176 定义 ENiagaraSimTarget，包含 CPUSim 与 GPUComputeSim。选择 GPU 需要确认平台、模块、数据接口、碰撞与阶段是否支持，不能用“粒子超过 1000 就必须启用”作为通用条件。

GPU 粒子更新、CPU 宿主调度、渲染开销和读回同步应分开测量。少量粒子并不必然受计算吞吐限制，GPU 支持也不意味着 CPU 代码会自动转换成 HLSL。

### 生成、生命周期与空间

Spawn Rate 与 Burst 表达持续或瞬时生成；生命周期决定粒子何时死亡；Local Space 决定粒子数据如何跟随组件。移动效果时应先分清移动的是组件、发射位置，还是每个粒子的已有位置。

常见属性有位置、速度、年龄、寿命、颜色、尺寸和旋转。属性的初始化、归一年龄以及更新模块之间需要一致，不能假定 Renderer 会替缺失属性生成物理含义。

## Renderer 与绑定

Renderer 消费粒子属性和材质绑定，通常不拥有模拟状态。Sprite、Mesh、Ribbon 等类型各有额外属性要求；看不到粒子时，先检查 Renderer 是否启用、绑定是否指向已写入属性、材质与尺寸是否合理，再检查模拟本身。

Ribbon 的拓扑或排序信息、Mesh 的朝向与缩放不应只按位置数组理解。改变渲染器不会自动改变物理粒子数量或求解方式。

## 从 C++ 设置 User 参数

Public/NiagaraComponent.h 中可查 SetAsset（:299）、SetVariableVec3（:510）、SetVariableFloat（:537）、SetVariableInt（:546）和 SetVariableBool（:555）。这些接口设置对应名称与类型的参数；资产必须暴露并实际读取它们。

~~~cpp
// 调用示意：NiagaraComponent 是已经创建并配置资产的 UNiagaraComponent*。
NiagaraComponent->SetVariableFloat(TEXT("User.Strength"), Strength);
NiagaraComponent->SetVariableVec3(TEXT("User.Direction"), Direction);
NiagaraComponent->SetVariableBool(TEXT("User.Enabled"), bEnabled);
~~~

这里不把 Direction 当作位置，也不宣称该片段可以独立编译。位置数据应核对项目版本的 Position 类型和相应设置接口，尤其在大世界坐标与 Niagara 仿真空间转换时。

Activate、Deactivate、暂停和 ReinitializeSystem 具有不同生命周期语义；Reinitialize 可能重建或重置状态，不应作为“参数没生效”的每帧补丁。SetAsset 还需考虑已有覆盖参数是否重置，源码接口明确包含这个选项。

## 自定义模块与数据接口

### 模块负责什么

Scratch Pad、模块脚本与自定义 HLSL 在对应脚本上下文中执行。它们可以处理已暴露的参数和函数，不会凭一个变量名称自动获得任意外部 GPU 缓冲。

需要共享逻辑时，应明确模块输入、输出、支持的使用阶段和模拟目标。示意数学代码与正式资产接线是两份需要分别核对的证据。

### Data Interface 的契约

Data Interface 提供脚本可调用函数，并将宿主对象或资源映射到 CPU/GPU 执行。Classes/NiagaraDataInterface.h 中可查：

- GetFunctionsInternal：声明函数签名与编辑器可见接口。
- GetVMExternalFunction：CPU VM 函数绑定。
- CanExecuteOnTarget：声明支持的模拟目标。
- GetParameterDefinitionHLSL / GetFunctionHLSL：GPU 代码生成接口。
- SetShaderParameters：绑定本次 GPU 执行所需的 shader 参数。

这些是职责索引，不是完整派生类。线程代理、实例数据、shader 参数布局、资源生命周期和版本变更接口需要对照项目中的真实实现。

### 外部 GPU 状态

外部物理系统发布位置、速度或拓扑时，应定义有效数量、索引身份、空间、单位、缓冲布局、代际和接受版本。Niagara 读取的是已发布状态，不能在同一逻辑中又让它无约定地反向成为物理状态所有者。

RDG 依赖和资源转交必须保证生产完成、消费有效。创建 FGlobalShader 并提交一个 dispatch，只能证明存在独立计算流程，不能证明 Niagara 已能读取其结果。实际宿主、接受提交和发布边界见[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)。

## 常见问题的定位顺序

### 参数设置没有效果

检查完整名称和类型、组件是否使用预期资产、资产是否读取该 User 输入、后续模块是否覆盖、系统是否正在运行及是否被 Scalability 暂停。不要先每帧重建系统。

### 效果突然消失或移动异常

先查组件可见性、Fixed Bounds、Effect Type 和 Renderer，再看粒子寿命、尺寸和生成。移动异常先核对 Local/World/Simulation Space 与位置类型，避免重复附加组件变换。

### CPU 正常而 GPU 异常

检查所有模块和 Data Interface 对目标的支持、GPU 生成代码、参数绑定、阶段资源读写、容量及异步读回。CPU 分支存在不代表 GPU 函数已有实现。

### 性能超预算

分别测量活跃系统和发射器数、生成与更新、GPU 模拟、透明过绘、材质与网格、碰撞及同步。最大粒子数应由场景和目标设备测得，不按“低端 5000、高端 50000”给无条件配额。

## 来源与验证边界

层级和参数概念可查 [Epic Niagara 概览](https://dev.epicgames.com/documentation/unreal-engine/overview-of-niagara-effects-for-unreal-engine)，系统设置查 [System Settings Reference](https://dev.epicgames.com/documentation/zh-cn/unreal-engine/system-settings-reference-for-niagara-effects-in-unreal-engine)，预算与剔除查 [Scalability and Best Practices](https://dev.epicgames.com/documentation/unreal-engine/scalability-and-best-practices-for-niagara)。

本文完成接口与职责核对，没有构建自定义 Data Interface、连接 Niagara 资产或测试目标平台性能。本文作为参数与接入参考，不作为物理算法前置；实际外部求解与发布仍以对应工程文档为准。
