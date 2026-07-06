---
title: "Chaos Cloth 详解 — 布料模拟架构、Dataflow 节点与约束系统"
excerpt: "基于 ChaosClothAssetDataflowNodes 插件源码与 Chaos 物理引擎约束系统，系统解析 Chaos Cloth 的布料物理属性、应用场景、参数推荐值、Dataflow 图节点功能与注意事项，以及全部 Cloth Constraint 约束类型的数学原理与创建条件。覆盖 PBD/XPBD 双求解器、各向同性/各向异性分布、弯曲与屈曲机制、自碰撞与交叉修复，以及从导入到终端的完整工作流。"
date: "2026-07-02"
category: "Physics"
subtopic: "ChaosPhysics"
tags: ["物理", "Chaos", "布料", "Cloth", "XPBD", "PBD", "约束", "C++"]
readTime: "阅读约60分钟"
---

> Chaos Cloth 是虚幻引擎 5 的现代布料模拟系统，基于 Chaos 物理引擎的 PBD/XPBD 约束求解框架。它以 **ClothCollection** 数据模型为核心，通过 **Dataflow Graph** 组织从网格导入、拓扑编辑、选择绘制、蒙皮绑定到模拟配置的完整流水线，最终由终端节点生成可挂载到 SkeletalMeshComponent 的布料资产。运行时，布料模拟通过一组位置约束（拉伸、弯曲、面积、长程附着、最大距离、后挡板、动画驱动、自碰撞）在 PBD 或力基求解器中迭代求解。
>
> 本文基于 `ChaosClothAssetDataflowNodes` 插件源码与 `ChaosCloth` 约束系统源码，完整梳理布料物理属性与推荐值、全部非废弃 Dataflow 节点的功能与参数、以及 Cloth Constraint 的数学原理与创建逻辑。阅读前建议回顾本站&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;的约束求解框架，以及&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;的半隐式欧拉积分流水线——Chaos Cloth 的求解器循环正是这些方法在布料领域的工程落地。

---

## 一、Chaos Cloth 架构概述

### 1.1 ClothCollection 数据模型

Chaos Cloth 的核心数据结构是 **ClothCollection**（基于 `FManagedArrayCollection`），它将布料资产组织为以下层次：

- **Sim Mesh（模拟网格）**：低分辨率网格，用于物理模拟。包含 2D 模式位置（Pattern Space）和 3D 模拟位置。
- **Render Mesh（渲染网格）**：高分辨率网格，用于视觉展示。通过 Proxy Deformer 跟随 Sim Mesh 运动。
- **Pattern Data（裁片数据）**：2D 裁片空间信息，记录每个顶点在 2D 布料平面上的位置，用于裁片方向、缝合和各向异性。不完全等同于 UV 空间——它通常来源于 UV 通道，但也可以来自专门的 2D 裁片导入（如 Marvelous Designer）。
- **Selection Sets（选择集）**：命名的顶点/面索引集合，用于参数的逐顶点控制。
- **Weight Maps（权重图）**：逐顶点的浮点权重数组，用于控制刚度、阻尼等参数的空间分布。
- **Skinning Data（蒙皮数据）**：将布料网格绑定到骨骼的蒙皮权重。

### 1.2 Sim Mesh 与 Render Mesh 的关系

Chaos Cloth 将模拟网格与渲染网格分离，这是其核心设计理念：

| 场景 | 配置 | 效果 |
|------|------|------|
| 无 ProxyDeformer 节点 | 默认 | Cloth Asset 完全由布料驱动 |
| 有 ProxyDeformer 节点但无 FilterSet | 空选择 | Cloth Asset 完全由骨骼蒙皮驱动 |
| 有 ProxyDeformer 节点且有 FilterSet | 部分选择 | Cloth Asset 部分布料驱动、部分骨骼蒙皮 |

模拟完成后，需要把 Sim Mesh 的运动"驱动"到 Render Mesh 上，这一步通过 **Proxy Deformation**（代理变形）实现。Proxy Deformer 节点定义 Render Mesh 如何跟随 Sim Mesh 运动——如果使用多三角形影响（`bUseMultipleInfluences`），则在 `InfluenceRadius` 范围内搜索所有模拟网格三角形来影响渲染顶点位置。

### 1.3 Dataflow Graph 工作流

布料资产的构建通过 **Dataflow Graph**（数据流图）完成。图中的节点按拓扑序执行，数据以 `FManagedArrayCollection`（ClothCollection）的形式在节点间传递。典型工作流：

```
导入节点 → 网格操作节点 → 选择/权重节点 → 蒙皮节点 → 模拟配置节点 → 终端节点
```

所有模拟配置节点继承自 `FChaosClothAssetSimulationBaseConfigNode`，通过 `AddProperties(FPropertyHelper&)` 虚函数将自身属性写入 ClothCollection，最终由终端节点（TerminalNode）汇总生成布料资产。

---
## 二、Dataflow 节点详解

> 以下节点均来自 `ChaosClothAssetDataflowNodes` 插件源码（路径：`Engine/Plugins/ChaosClothAssetDataflowNodes/Source/ChaosClothAssetDataflowNodes`）。所有标记为 `Deprecated` 的节点（如 `AddWeightMapNode`、`AttributeNode`、`DatasmithImportNode`、`MergeClothCollectionsNode`、`SimulationLongRangeAttachmentConfigNode`、`SimulationMultiResConfigNode`、全部 PBD 专用约束配置节点、全部 XPBD 专用约束配置节点等）均不在此文档范围内。

### 2.1 导入节点

#### ImportNode — 布料资产导入

将已有的 Cloth Asset 导入到 Dataflow 图中作为 ClothCollection。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| ClothAsset | `UChaosClothAsset*` | — | 要导入的布料资产 |
| ImportLod | `int32` | 0 | 导入的 LOD 级别，每次只能导入一个 LOD |

#### SkeletalMeshImportNode — 骨骼网格导入

将骨骼网格资产导入为布料的模拟网格和/或渲染网格。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| SkeletalMesh | `USkeletalMesh*` | — | 要导入的骨骼网格 |
| bImportSimMesh | `bool` | true | 是否导入模拟网格 |
| bImportRenderMesh | `bool` | true | 是否导入渲染网格 |
| LODIndex | `int32` | 0 | 骨骼网格 LOD 级别 |
| bImportSingleSection | `bool` | false | 启用单 Section 导入模式 |
| SectionIndex | `int32` | 0 | 导入的 Section 索引 |
| UVChannel | `int32` | 0 | 用于导入 2D 模拟网格模式的 UV 通道。设为 -1 则自动将 3D 模拟网格展开为 2D 模式 |
| UVScale | `FVector2f` | (1,1) | 填充 Sim Mesh 位置时应用的 UV 缩放 |
| bSetPhysicsAsset | `bool` | false | 是否设置与骨骼网格相同的物理资产 |
| bImportSimMorphTargets | `bool` | false | 导入 Morph Target 作为模拟形变目标 |

#### StaticMeshImportNode — 静态网格导入

将静态网格资产导入为布料的模拟网格和/或渲染网格。属性与 SkeletalMeshImportNode 类似，但不支持蒙皮相关选项。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| StaticMesh | `UStaticMesh*` | — | 要导入的静态网格 |
| bImportSimMesh | `bool` | true | 是否导入为模拟网格 |
| bImportRenderMesh | `bool` | true | 是否导入为渲染网格 |
| LODIndex | `int32` | 0 | 静态网格 LOD 级别 |
| SimMeshSection | `int32` | -1 | 作为模拟网格导入的材质 Section（-1 为全部） |
| RenderMeshSection | `int32` | -1 | 作为渲染网格导入的材质 Section（-1 为全部） |
| UVChannel | `int32` | 0 | 用于 2D 模拟网格模式的 UV 通道 |
| UVScale | `FVector2f` | (1,1) | UV 缩放 |

#### ImportSimulationCacheNode — 模拟缓存导入

从模拟缓存中设置顶点值。集合的拓扑保持不变。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| ImportedCache | `UChaosCacheCollection*` | — | 要导入的缓存 |
| CacheIndex | `int32` | 0 | 读取的缓存索引 |
| CacheTime | `float` | 0 | 读取的缓存时间 |
| Transform | `FTransform` | — | 缓存数据变换 |
| ParticleOffset | `int32` | 0 | 粒子缓存偏移 |
| bUpdateSimulationMesh | `bool` | true | 从缓存更新模拟网格 |
| bRecalculateNormals | `bool` | true | 基于导入位置重计算模拟法线 |
| bUpdateRenderMesh | `bool` | false | 通过代理变形器数据更新渲染网格 |

### 2.2 终端节点

#### TerminalNode — 布料终端节点

Dataflow 图的终端节点，从 ClothCollection 生成布料资产。

| 属性 | 类型 | 说明 |
|------|------|------|
| CollectionLods | `TArray<FManagedArrayCollection>` | 每个 LOD 的输入布料集合 |
| Refresh | `FDataflowFunctionProperty` | 手动刷新资产（开发调试用，Dataflow 变更时自动刷新） |

### 2.3 网格操作节点

#### RemeshNode — 重新网格化

对布料表面进行重新网格化，以获得指定的网格分辨率。

> 注意：Accessory Meshes、Weight Maps、Skinning Data、Self Collision Spheres 和 Long Range Attachment Constraints 会在输出网格上重建，但其他 Selections 会被移除。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bRemeshSim | `bool` | true | 是否对模拟网格重新网格化 |
| bRemeshRender | `bool` | false | 是否对渲染网格重新网格化 |
| RemeshMethodRender | `EChaosClothAssetRemeshMethod` | Remesh | 渲染网格重网格化方法（Remesh / Simplify） |
| SelectionSourceSim/Render | `EChaosClothAssetRemeshSelectionSource` | DensityMapInput | 选择来源（Selection 输入 / DensityMap 输入+阈值） |
| DensityMapSim/Render | `WeightedValueNonAnimatable` | (100,200) | 目标网格分辨率范围（输入三角形分辨率的百分比） |
| DensityMapThresholdSim/Render | `float` | 1.0 | 密度图转选择集的阈值 |
| TargetPercentRender | `int32` | 100 | Simplify 方法的目标分辨率百分比 |
| IterationsSim/Render | `int32` | 10 | 重网格化迭代次数 |
| SmoothingSim/Render | `double` | 0.25 | 平滑因子 |
| bRemeshRenderSeams | `bool` | false | 是否沿渲染网格边界查找匹配顶点并单独重网格化 |

#### RecalculateNormalsNode — 重计算法线

重新计算几何体的法线。实验性功能，仅处理渲染几何体。

#### ReverseNormalsNode — 反转法线

反转模拟网格和/或渲染网格的法线和/或三角形绕序。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bReverseSimMeshNormals | `bool` | true | 反转模拟网格法线 |
| bReverseSimMeshWindingOrder | `bool` | false | 反转模拟网格三角形绕序 |
| bReverseRenderMeshNormals | `bool` | true | 反转渲染网格法线 |
| bReverseRenderMeshWindingOrder | `bool` | false | 反转渲染网格三角形绕序 |
| SimPatterns / RenderPatterns | `TArray<int32>` | — | 指定操作的 Pattern（空为全部） |

#### TransformPositionsNode — 变换位置

对模拟网格的 2D 位置、3D 位置和渲染网格位置施加缩放、旋转、平移变换。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bTransform2DSimPositions | `bool` | false | 启用 2D 模拟位置变换 |
| Sim2DScale / Sim2DRotation / Sim2DTranslation | — | (1,1)/0/(0,0) | 2D 缩放/旋转（度）/平移 |
| bTransform3DSimPositions | `bool` | false | 启用 3D 模拟位置变换 |
| Sim3DScale / Sim3DRotation / Sim3DTranslation | — | (1,1,1)/(0,0,0)/(0,0,0) | 3D 缩放/旋转（欧拉角）/平移 |
| bTransformRenderPositions | `bool` | false | 启用渲染位置变换 |
| RenderScale / RenderRotation / RenderTranslation | — | (1,1,1)/(0,0,0)/(0,0,0) | 渲染缩放/旋转/平移 |

#### TransformUVsNode — 变换 UV

对布料模式的 UV 坐标施加缩放、旋转、平移变换。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| Scale / Rotation / Translation | — | (1,1)/0/(0,0) | UV 缩放/旋转（度）/平移 |
| Pattern | `int32` | -1 | 变换的 Pattern（-1 为全部） |
| UVChannel | `int32` | -1 | 变换的 UV 通道（-1 为全部） |

#### BlendVerticesNode — 混合顶点

从另一个 ClothCollection 混合顶点值。集合的拓扑保持不变。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| BlendCollection | `FManagedArrayCollection` | — | 要混合的集合 |
| BlendingWeight | `float` | 1.0 | 混合权重（0=保留原值，1=使用 BlendCollection 值） |
| bRequireSameVertexCounts | `bool` | true | 要求顶点数匹配（否则混合共享子集） |
| bBlend2DSimPositions / bBlend3DSimPositions / bBlendSimNormals | `bool` | true | 混合 2D/3D 模拟位置/模拟法线 |
| bBlendRenderPositions / bBlendRenderNormalsAndTangents / bBlendRenderUVs / bBlendRenderColors | `bool` | true | 混合渲染位置/法线切线/UV/颜色 |

#### CopySimulationToRenderMeshNode — 复制模拟到渲染

将模拟网格复制到渲染网格，用于渲染模拟网格或当不需要单独的渲染网格时。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| Material | `UMaterialInterface*` | — | 渲染网格的新材质 |
| bGenerateSingleRenderPattern | `bool` | true | 生成单个渲染 Pattern 而非每个 Sim Pattern 一个 |

#### DeleteElementNode — 删除元素

从 ClothCollection 中删除特定元素。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bDeleteSimMesh | `bool` | false | 删除模拟网格 |
| bDeleteRenderMesh | `bool` | false | 删除渲染网格 |
| Group | `FChaosClothAssetNodeSelectionGroup` | — | 要删除的元素组类型（SimVertices3D / RenderVertices / SimFaces 等） |
| Elements | `TArray<int32>` | — | 要删除的元素索引（空为全部） |
| SelectionName | `ConnectableIStringValue` | — | 要删除的选择集名称 |

#### StripUserAttributesNode — 剥离用户属性

从 ClothCollection 中剥离未被属性引用的用户属性（Weight Maps、Sets、Face Int Maps），减小资产体积。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bStripUnusedSimWeightMaps | `bool` | true | 剥离未使用的模拟权重图 |
| ExtraSimWeightMaps | `TArray<FString>` | — | 额外保留的模拟权重图名称 |
| bStripUnusedSets | `bool` | true | 剥离未使用的选择集 |
| ExtraSets | `TArray<FString>` | — | 额外保留的选择集名称 |
| bStripUnusedSimFaceIntMaps | `bool` | true | 剥离未使用的面整数图 |
| bStripUnusedRenderWeightMaps | `bool` | true | 剥离未使用的渲染权重图（仅影响未 Cook 资产） |
| bCopyAllUserAttributesToSimModel | `bool` | true | 将所有用户属性传输到内部模拟模型 |

### 2.4 DynamicMesh 交互节点

> 以下节点标记为 `Experimental`，用于 ClothCollection 与 GeometryFramework 的 `UDynamicMesh` 之间的交互。

#### ClothCollectionToDynamicMeshNode — 转换为 DynamicMesh

将 ClothCollection 网格转换为 DynamicMesh。输出模拟和渲染两个 DynamicMesh。

#### UpdateClothFromDynamicMeshNode — 从 DynamicMesh 更新布料

从 DynamicMesh 更新布料集合属性。支持将 DynamicMesh 的顶点位置、法线切线、UV、材质复制到渲染网格或模拟网格。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bCopyToRenderPositions | `bool` | false | 复制顶点位置到渲染位置 |
| bCopyToRendeNormalsAndTangents | `bool` | false | 复制法线切线到渲染法线切线 |
| bCopyUVsToRenderUVs | `bool` | false | 复制 UV 到渲染 UV |
| bCopyToRenderMaterials | `bool` | false | 复制输入材质到渲染材质 |
| bCopyToSim3DPositions | `bool` | false | 复制顶点位置到模拟 3D 位置 |
| bCopyToSimNormals | `bool` | false | 复制法线到模拟法线 |
| bCopyUVsToSim2DPositions | `bool` | false | 复制 UV 到模拟 2D 位置 |
| UVChannelIndex | `int32` | 0 | 使用的 UV 通道索引（-1 复制所有渲染 UV） |

#### ExtractWeightMapNode — 提取权重图

从 ClothCollection 中提取权重图。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| WeightMap | `ConnectableIStringValue` | "WeightMap" | 要提取的权重图名称 |
| MeshTarget | `EChaosClothAssetWeightMapMeshTarget` | Simulation | 权重图类型（Simulation / Render） |
| bReorderForDynamicMesh | `bool` | true | 重排权重以匹配 ClothCollectionToDynamicMesh 创建的 DynamicMesh 顺序 |

#### ExtractSelectionSetNode — 提取选择集

从 ClothCollection 中提取选择集。目前仅支持 SimVertices3D 和 RenderVertices 集合。

### 2.5 选择与权重节点

#### SelectionNode — 选择节点

创建或修改布料选择集。支持从其他集合转移选择、从输入名称继承并覆盖。

| 属性 | 类型 | 说明 |
|------|------|------|
| OutputName | `ConnectableOStringValue` | 用作选择集的名称 |
| InputName | `ConnectableIStringValue` | 从此名称填充并覆盖的选择集（空则使用 OutputName） |
| SelectionOverrideType | `EChaosClothAssetSelectionOverrideType` | 覆盖方式（ReplaceAll 替换 / Modify 追加+移除） |
| Group | `FChaosClothAssetNodeSelectionGroup` | 元素类型（SimVertices3D / SimFaces / RenderVertices 等） |
| Indices | `TSet<int32>` | 选择的元素索引 |
| RemoveIndices | `TSet<int32>` | 要从输入选择中移除的索引 |
| TransferCollection | `FManagedArrayCollection` | 用于转移选择的集合 |
| SimTransferType | `EChaosClothAssetWeightMapTransferType` | 模拟网格集的转移类型 |
| TransferSelectionThreshold | `float` | 选择集到图再转回的阈值 |

#### ProceduralSelectionNode — 程序化选择

程序化生成布料选择集。

| 属性 | 类型 | 说明 |
|------|------|------|
| OutputName | `FString` | 选择集名称 |
| Group | `FChaosClothAssetNodeSelectionGroup` | 元素类型 |
| SelectionType | `EChaosClothAssetProceduralSelectionType` | 选择方式（SelectAll 全选 / Conversion 转换已有选择集） |
| ConversionInputName | `ConnectableIStringValue` | 转换模式下要转换的选择集名称 |

#### SelectionToWeightMapNode — 选择转权重图

将整数索引选择集转换为顶点权重图，可为选中和未选中顶点设置不同的值。

| 属性 | 类型 | 说明 |
|------|------|------|
| SelectionName | `FString` | 要转换的选择集名称 |
| WeightMapName | `FString` | 生成的权重图名称（空则使用选择集名称） |
| UnselectedValue | `float` | 未选中顶点的值 |
| SelectedValue | `float` | 选中顶点的值 |

#### SelectionToIntMapNode — 选择转整数图

将整数索引选择集转换为面整数图。图类型匹配选择类型。

| 属性 | 类型 | 说明 |
|------|------|------|
| SelectionName | `ConnectableIStringValue` | 要转换的选择集名称 |
| IntMapName | `ConnectableIOStringValue` | 生成的整数图名称（空则使用选择集名称） |
| bKeepExistingUnselectedValues | `bool` | 若 IntMapName 已存在，保留已有值而非覆盖 |
| UnselectedValue / SelectedValue | `int32` | 未选中/选中元素的值 |

#### WeightMapNode — 权重图节点

绘制权重图属性节点。支持从其他集合转移权重图。

| 属性 | 类型 | 说明 |
|------|------|------|
| OutputName | `ConnectableOStringValue` | 权重图属性名称 |
| InputName | `ConnectableIStringValue` | 从此名称填充并覆盖的权重图 |
| MeshTarget | `EChaosClothAssetWeightMapMeshTarget` | 权重图目标网格（Simulation / Render） |
| MapOverrideType | `EChaosClothAssetWeightMapOverrideType` | 覆盖方式 |
| TransferType | `EChaosClothAssetWeightMapTransferType` | 转移类型（通过 3D 空间映射从渲染网格转移到模拟网格） |
| TransferCollection | `FManagedArrayCollection` | 用于转移权重图的集合 |

#### WeightMapToSelectionNode — 权重图转选择

将顶点权重图转换为整数选择集。

| 属性 | 类型 | 说明 |
|------|------|------|
| WeightMapName | `FString` | 要转换的权重图名称 |
| SelectionName | `FString` | 生成的选择集名称（空则使用权重图名称） |
| SelectionType | `EChaosClothAssetWeightMapConvertableSelectionType` | 选择类型（SimVertices2D / SimVertices3D / SimFaces） |
| SelectionThreshold | `float` | 权重值超过此阈值的顶点将被选中 |

#### AddStitchNode — 缝合节点

将一组顶点"缝合"在一起，创建布料接缝（Seam）或约束（Constraint）。

| 属性 | 类型 | 说明 |
|------|------|------|
| MergeToSingleVertexSelection | `ConnectableIStringValue` | 要缝合的顶点集。可以是 2D 或 3D 顶点。系统会根据拓扑顺序形成缝合链，所有顶点最终合并为单个 3D 顶点 |

**使用说明**：
- **2D vertices**：通常在 UV 空间或拓扑空间选择顶点（如布料 UV 展开上的一条缝边），系统根据拓扑顺序自动形成缝合链，常用于缝衣服的两条边。
- **3D vertices**：直接在三维空间选择一组顶点（无拓扑顺序），通常直接合并为单一顶点，用于将某块布料的若干点收拢成一个固定点（如打结、固定在某个位置）。

### 2.6 蒙皮与代理变形节点

#### ProxyDeformerNode — 代理变形器

将代理变形器信息添加到布料集合的渲染数据中。此节点仅用于选择性地将渲染网格的特定区域分配给模拟网格。

**核心规则**：
- 无 ProxyDeformer 节点 → 布料资产完全由布料驱动
- 有 ProxyDeformer 节点但无 FilterSet → 布料资产完全由骨骼蒙皮驱动
- 有 ProxyDeformer 节点且有 FilterSet → 布料资产部分布料驱动、部分骨骼蒙皮

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| SelectionFilterSets | `TArray<FChaosClothAssetSelectionFilterSet>` | — | 选择过滤器集，限制渲染顶点选择到模拟网格三角形选择。右键 AddOptionPin 可添加更多集合 |
| bUseMultipleInfluences | `bool` | false | 是否使用多个模拟网格三角形影响渲染顶点位置 |
| InfluenceRadius | `float` | — | 搜索影响渲染顶点的模拟网格三角形的半径（SkinningKernelRadius） |
| bPreserveRenderTangents | `bool` | true | 生成代理变形器数据时是否包含渲染切线 |

每个 SelectionFilterSet 包含两个选择：渲染网格选择（RenderSelection，默认 RenderVertices）和模拟网格选择（SimSelection，默认 SimFaces）。

> **性能注意**：ProxyDeformer 节点评估通常比默认代理变形器慢，应尽早放在图中以避免重复计算。若需平滑过渡，可在 MaxDistanceConfig 节点后放置 SkinningBlend 节点。

#### ApplyProxyDeformerNode — 应用代理变形器

更新渲染网格，应用已存在的代理变形器数据。当 Sim Mesh 在代理变形器数据计算后发生变化时使用此节点重新同步渲染网格。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bIgnoreSkinningBlendWeights | `bool` | false | 忽略蒙皮混合权重（对所有点应用代理变形） |

#### TransferSkinWeightsNode — 传递蒙皮权重

将骨骼网格的蒙皮权重传递到布料集合的模拟网格和/或渲染网格。

| 属性 | 类型 | 说明 |
|------|------|------|
| TargetMeshType | `EChaosClothAssetTransferTargetMeshType` | 目标网格（Sim & Render / Sim / Render） |
| RenderMeshSourceType | `EChaosClothAssetTransferRenderMeshSource` | 渲染网格传递源（SkeletalMesh / SimulationMesh） |
| SkeletalMesh | `USkeletalMesh*` | 要传递权重的骨骼网格 |
| LodIndex | `int32` | 骨骼网格 LOD |
| Transform | `FTransform` | 骨骼网格与布料资产之间的相对变换 |
| TransferMethod | `EChaosClothAssetTransferSkinWeightsMethod` | 传递算法（ClosestPointOnSurface / InpaintWeights） |
| RadiusPercentage | `double` | InpaintWeights 方法的搜索半径百分比（边界框对角线） |
| NormalThreshold | `double` | InpaintWeights 方法的法线最大角度差（度） |
| LayeredMeshSupport | `bool` | 对分层网格支持（翻转法线重试） |
| NumSmoothingIterations | `int32` | 自动计算权重的顶点的平滑迭代次数 |
| SmoothingStrength | `float` | 每次平滑迭代的强度 |
| MaxNumInfluences | `EChaosClothAssetMaxNumInfluences` | 每顶点最大骨骼影响数（4 / 8 / 12） |

**传递方法对比**：
- **ClosestPointOnSurface**：对目标网格每个顶点，找到源网格表面最近点并复制其权重。快速但精度较低。
- **InpaintWeights**：先找最近点，若位置在搜索半径内且法线差小于阈值则直接复制；否则通过平滑插值自动计算权重。精度更高但更慢。

#### SkinningBlendNode — 蒙皮混合

从 ProxyDeformer 映射数据初始化 `RenderDeformerSkinningBlend` 权重图。权重图用于布料渲染着色器决定蒙皮与模拟点之间的混合量：0=完全布料驱动，1=完全蒙皮驱动。

| 属性 | 类型 | 说明 |
|------|------|------|
| KinematicVertices3D | `ConnectableIStringValue` | 运动学顶点选择集名称。必须为 SimVertices2D/3D 或 SimFaces 类型。通常来自 MaxDistanceConfig 节点 |
| bUseSmoothTransition | `bool` | 是否创建平滑过渡权重图，消除布料驱动与蒙皮驱动区域间的可见台阶 |

> 前置条件：使用此节点前，输入 ClothCollection 必须已存在 ProxyDeformer 映射数据。

#### BindToRootBoneNode — 绑定到根骨

将整个网格绑定到当前骨架集合的单一根骨骼。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bBindSimMesh | `bool` | true | 是否绑定模拟网格 |
| bBindRenderMesh | `bool` | true | 是否绑定渲染网格 |

#### SetPhysicsAssetNode — 设置物理资产

替换当前用于与模拟网格碰撞的物理资产。

| 属性 | 类型 | 说明 |
|------|------|------|
| PhysicsAsset | `UPhysicsAsset*` | 要分配的物理资产 |

#### GenerateSimMorphTargetNode — 生成模拟形变目标

从布料集合的模拟网格（需匹配拓扑）生成模拟形变目标。

| 属性 | 类型 | 说明 |
|------|------|------|
| MorphTargetCollection | `FManagedArrayCollection` | 生成形变目标的集合 |
| MorphTargetName | `FString` | 形变目标名称 |
| bGenerateNormalDeltas | `bool` | 是否生成法线增量 |

#### SimAccessoryMeshNode — 模拟附件网格

通过将布料集合转换为附件网格并附加到已有布料集合，添加模拟附件网格。未匹配的顶点使用已有布料集合的模拟网格数据填充。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| SimAccessoryMeshCollection | `FManagedArrayCollection` | — | 附件网格集合 |
| AccessoryMeshName | `FString` | "AccessoryMesh" | 附件网格名称 |
| bUseSimImportVertexID | `bool` | true | 使用 SimImportVertexID 匹配顶点 |

### 2.7 体型适配节点

> 以下节点标记为 `Experimental`，用于 ChaosOutfitAsset 的可缩放服装功能。

#### ApplyResizingNode — 应用缩放

为给定目标网格应用缩放，实现服装尺寸适配。通过 RBF（径向基函数）插值实现平滑的顶点移动，而非简单线性缩放。

| 属性 | 类型 | 说明 |
|------|------|------|
| TargetSkeletalMesh | `USkeletalMesh*` | 目标网格（必须与生成插值数据的源网格顶点匹配） |
| SkeletalMeshLODIndex | `int32` | 源/目标网格 LOD |
| InterpolationData | `FMeshResizingRBFInterpolationData` | 预计算的 RBF 插值数据 |
| bForceApplyToRenderMesh | `bool` | 强制应用到渲染网格（否则有模拟网格时只缩放模拟网格） |
| SourceSkeletalMesh | `USkeletalMesh*` | 源网格（用于自定义区域缩放） |
| bSkipCustomRegionResizing | `bool` | 跳过自定义区域缩放数据 |
| bSavePreResizedSimPosition3D | `bool` | 保存缩放前的 3D 位置，用于缩放 XPBD 各向异性拉伸约束的 2D 静止长度。使用此项需在 SimulationStretchConfig 中设置：Use 3d Rest Lengths=false, Solver=XPBD, Distribution=Anisotropic |

#### CustomRegionResizingNode — 自定义区域缩放

为 ChaosOutfitAsset 的可缩放服装添加自定义区域缩放数据。

| 属性 | 类型 | 说明 |
|------|------|------|
| InputGroupData | `TArray<FChaosClothAssetCustomRegionResizingInput>` | 输入自定义区域数据 |
| SimCustomResizingBlendName | `FString` | 生成的模拟网格权重图名称（0=传统缩放，1=自定义区域缩放） |
| RenderCustomResizingBlend | `FString` | 生成的渲染网格权重图名称 |

#### EnableUVResizingNode — 启用 UV 缩放

启用 ChaosOutfitAsset 可缩放服装使用的 UV 缩放。此节点无自定义属性，仅继承基类配置。

### 2.8 模拟配置节点

所有模拟配置节点继承自 `FChaosClothAssetSimulationBaseConfigNode`，共享 `Collection` 输入/输出通道和 `bWarnDuplicateProperty` 属性。各节点通过 `AddProperties()` 虚函数将属性写入 ClothCollection，支持运行时通过 Cloth Interactor 动态修改。

#### SimulationDefaultConfigNode — 默认配置

以骨骼网格布料编辑器格式添加默认模拟属性。用于兼容旧版 `UChaosClothConfig` 工作流。

| 属性 | 类型 | 说明 |
|------|------|------|
| SimulationConfig | `UChaosClothConfig*` | 布料模拟属性（Instanced） |
| SharedSimulationConfig | `UChaosClothSharedSimConfig*` | 共享模拟属性（Instanced） |

#### SimulationSolverConfigNode — 求解器配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| NumIterations | `int32` | 1 | 60fps 下的求解器迭代次数。值越高约束越硬、收敛越好，但 CPU 开销越大 |
| MaxNumIterations | `int32` | 6 | 最大迭代次数上限。帧率低于 60fps 时使用 |
| NumSubsteps | `ImportedIntValue` | (默认值) | 求解器子步数。提高碰撞输入精度和约束分辨率，但增加 CPU 开销 |
| bEnableDynamicSubstepping | `bool` | false | 启用动态子步 |
| DynamicSubstepDeltaTime | `float` | 16.67 | 基于目标子步 delta 时间（毫秒）选择子步数 |
| bEnableNumSelfCollisionSubsteps | `bool` | false | 启用单独的自碰撞子步数 |
| NumSelfCollisionSubsteps | `int32` | 1 | 自碰撞子步数（实际值钳制到 [1, NumSubsteps]） |

#### SimulationGravityConfigNode — 重力配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bUseGravityOverride | `bool` | false | 使用配置重力值而非世界重力 |
| GravityScale | `WeightedValue` | (1,1) | 应用于世界重力的缩放因子（不影响 Override） |
| GravityOverride | `ImportedVectorValue` | (0,0,-980) | 重力加速度向量 [cm/s²] |

#### SimulationAerodynamicsConfigNode — 空气动力学配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bUsePointBasedWindModel | `bool` | false | 使用已废弃的 Legacy 点基风模型。禁用气动精确风模型和水体交互 |
| FluidDensity | `float` | 1.225 | 介质密度（kg/m³，空气约 1.225） |
| WindVelocitySpace | `EChaosSoftsSimulationSpace` | WorldSpace | 风速指定空间 |
| WindVelocity | `FVector3f` | (0,0,0) | 固定风速 [m/s]，参考：阵风 > 8m/s |
| TurbulenceRatio | `float` | 1.0 | 湍流力比例（湍流 ~v²，层流 ~v） |
| Drag | `WeightedValue` | (0.035,1) | 阻力系数。启用 Outer Drag 时作为 Inner Drag |
| OuterDrag | `WeightedValue` | (0.035,1) | 空气速度逆法线方向的阻力系数 |
| Lift | `WeightedValue` | (0.035,1) | 升力系数。启用 Outer Lift 时作为 Inner Lift |
| OuterLift | `WeightedValue` | (0.035,1) | 空气速度逆法线方向的升力系数 |
| bUseWithWaterBodies | `bool` | false | 布料没入水中时使用阻力和浮力 |
| ClothDensityInWater | `float` | 1000 | 水中浮力计算的布料密度（kg/m³） |
| WaterDensity | `float` | 1000 | 水的密度（kg/m³） |
| WaterTurbulenceRatio | `float` | 0 | 水中湍流力比例（0 适合水） |

#### SimulationMassConfigNode — 质量配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| MassMode | `EClothMassMode` | Density | 质量模式（UniformMass / TotalMass / Density） |
| UniformMass | `WeightedValueNonAnimatable` | 0.00015 | Uniform Mass 模式下的每粒子质量 |
| TotalMass | `float` | 0.5 | TotalMass 模式下的总质量（均分到所有粒子） |
| Density | `WeightedValueNonAnimatable` | 0.35 | Density 模式下的质量密度（kg/m²） |
| MinPerParticleMass | `float` | 0.0001 | 粒子质量最小值钳制 |

#### SimulationDampingConfigNode — 阻尼配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| DampingCoefficient | `WeightedValue` | 0.01 | 全局速度阻尼（点阻尼），改善稳定性但可能导致整体减速 |
| LocalDampingSpace | `EChaosSoftsLocalDampingSpace` | CenterOfMass | 局部阻尼计算空间 |
| LocalDampingLinearCoefficient | `float` | 0 | 局部线性阻尼，阻尼粒子速度与全局线性运动的偏差 |
| LocalDampingAngularCoefficient | `float` | 0 | 局部角阻尼，阻尼粒子速度与全局角运动的偏差 |

#### SimulationCollisionConfigNode — 碰撞配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| CollisionThickness | `ImportedFloatValue` | (默认值) | 碰撞形状的附加厚度 |
| FrictionCoefficient | `WeightedValue` | (默认值) | 布料-碰撞物摩擦系数（仅 SkinnedTriangleMesh 使用加权值） |
| ClothCollisionThickness | `WeightedValue` | (默认值) | 布料与碰撞形状碰撞时的附加厚度 |
| bEnableSimpleColliders | `bool` | true | 启用简单碰撞体（胶囊体、凸包、球体、盒体） |
| bUsePlanarConstraintForSimpleColliders | `bool` | false | 对简单碰撞体使用平面约束（更便宜但精度较低） |
| bEnableComplexColliders | `bool` | true | 启用复杂碰撞体（SkinnedLevelSet、MLLevelSet） |
| bUsePlanarConstraintForComplexColliders | `bool` | true | 对复杂碰撞体使用平面约束 |
| bEnableSkinnedTriangleMeshCollisions | `bool` | true | 启用骨骼三角形网格碰撞体 |
| bUseSelfCollisionSubstepsForSkinnedTriangleMeshes | `bool` | true | 使用自碰撞子步数控制骨骼三角形网格碰撞更新 |
| bUseCCD | `bool` | false | 使用连续碰撞检测防止快速运动粒子穿模。对性能有负面影响 |
| InnerCollisionThickness | `WeightedValueNonAnimatable` | (0,0) | 实验性：仅粒子穿透超过内部厚度值时运行 CCD 代码路径 |

#### SimulationMaxDistanceConfigNode — 最大距离配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| MaxDistance | `WeightedValue` | (0,100) | 模拟粒子到其动画蒙皮位置的最大距离。值为 0 的粒子变为运动学体 |
| InKinematic | `ConnectableIStringValue` | "" | 无论 MaxDistance 值如何都设为运动学的 SimVertices3D 选择集 |
| KinematicVertices3D | `FString` | (输出) | 运动学顶点集名称（InKinematic 与低于阈值的顶点的并集） |

#### SimulationBackstopConfigNode — 后挡板配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| BackstopDistance | `WeightedValue` | (0,100) | 后挡板碰撞球到粒子蒙皮位置的距离（沿法线，可正可负） |
| BackstopRadius | `WeightedValue` | (0,100) | 后挡板碰撞球半径 |
| BackstopMeshName | `ConnectableIStringValue` | — | 用作后挡板网格的附件网格名称（空则使用默认动画网格） |

#### SimulationAnimDriveConfigNode — 动画驱动配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| AnimDriveStiffness | `WeightedValue` | (0,1) | 驱动布料向动画蒙皮位置移动的约束强度 |
| AnimDriveDamping | `WeightedValue` | (0,1) | 动画驱动阻尼量 |

#### SimulationStretchConfigNode — 拉伸配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bStretchUse3dRestLengths | `bool` | true | 使用 3D 披覆空间作为静止长度（false 使用 2D 模式空间） |
| SolverType | `EChaosClothAssetConstraintSolverType` | PBD | 约束求解器类型（XPBD / PBD） |
| DistributionType | `EChaosClothAssetConstraintDistributionType` | Isotropic | 约束分布类型（Anisotropic / Isotropic），XPBD 时可用 |
| bAddAreaConstraint | `bool` | true | 添加面积约束（Isotropic 分布时） |
| StretchStiffnessWarp | `WeightedValue` | (100,100) | Warp（垂直）方向拉伸刚度（Anisotropic+XPBD） |
| StretchStiffnessWeft | `WeightedValue` | (100,100) | Weft（水平）方向拉伸刚度 |
| StretchStiffnessBias | `WeightedValue` | (100,100) | Bias（对角）方向拉伸刚度 |
| StretchAnisoDamping | `WeightedValue` | (1,1) | 各向异性拉伸阻尼（相对临界阻尼） |
| StretchStiffness | `WeightedValue` | (1,1) | 拉伸刚度（Isotropic 或 PBD，PBD 内部钳制到 [0,1]） |
| StretchDamping | `WeightedValue` | (1,1) | 拉伸阻尼（XPBD+Isotropic） |
| StretchWarpScale | `WeightedValue` | (1,1) | Warp 方向静止拉伸缩放 |
| StretchWeftScale | `WeightedValue` | (1,1) | Weft 方向静止拉伸缩放 |
| AreaStiffness | `WeightedValue` | (1,1) | 面积保持约束的刚度 |

#### SimulationBendingConfigNode — 弯曲配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| RestAngleType | `EChaosClothAssetRestAngleConstructionType` | Use3DRestAngles | 静止角度计算方式（Use3DRestAngles / FlatnessRatio / RestAngle） |
| FlatnessRatio | `WeightedValueNonAnimatable` | (0,0) | 0=完全平坦 vs 3D 静止角度的比值（0=Use3DRestAngles，1=静止角度为0） |
| RestAngle | `WeightedValueNonAnimatable` | (0,0) | 显式静止角度值（度，0=平坦，正=远离法线折叠，负=朝法线折叠） |
| SolverType | `EChaosClothAssetConstraintSolverType` | PBD | 求解器类型 |
| DistributionType | `EChaosClothAssetConstraintDistributionType` | Isotropic | 分布类型 |
| ConstraintType | `EChaosClothAssetBendingConstraintType` | HingeAngles | 约束方法（HingeAngles 精确角度 / FacesSpring 对角弹簧） |
| BendingStiffnessWarp/Weft/Bias | `WeightedValue` | (100,100) | 各向异性弯曲刚度（Anisotropic+XPBD） |
| BendingAnisoDamping | `WeightedValue` | (1,1) | 各向异性弯曲阻尼 |
| AnisoBucklingRatio | `WeightedValue` | (0.5,0.5) | 各向异性屈曲比 |
| BucklingStiffnessWarp/Weft/Bias | `WeightedValue` | (50,50) | 各向异性屈曲刚度 |
| BendingStiffness | `WeightedValue` | (1,1) | 弯曲刚度（Isotropic 或 PBD） |
| BendingDamping | `WeightedValue` | (1,1) | 弯曲阻尼（XPBD+Isotropic） |
| BucklingStiffness | `WeightedValue` | (0.9,0.9) | 屈曲刚度（通常小于弯曲刚度） |
| BucklingRatio | `WeightedValue` | (0.5,0.5) | 屈曲比 |

#### SimulationStretchOverrideConfigNode — 拉伸覆盖配置

实验性节点，用于覆盖已有拉伸约束属性。每个属性可选择 `None`（不覆盖）、`Override`（替换）或 `Multiply`（乘以）模式。可覆盖：StretchUse3dRestLengths、StretchStiffness（含各向异性 Warp/Weft/Bias）、StretchDamping、WarpScale、WeftScale。

#### SimulationBendingOverrideConfigNode — 弯曲覆盖配置

实验性节点，用于覆盖已有弯曲约束属性。可覆盖：FlatnessRatio、BendingStiffness（含各向异性 Warp/Weft/Bias 和 Buckling）、BucklingRatio、BucklingStiffness（含各向异性）、BendingDamping。支持 `bApplyUniformBendingStiffnessOverride`（统一应用到三个方向）和 `bApplyBendingStiffnessOverrideToBuckling`（同时应用到屈曲刚度）。

#### SimulationPressureConfigNode — 压力配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| Pressure | `WeightedValue` | (0,1) | 法线方向的压力强度（负值推向背面） |

#### SimulationSelfCollisionConfigNode — 自碰撞配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bUseSelfCollisions | `bool` | true | 启用自碰撞 |
| SelfCollisionThickness | `WeightedValue` | (默认值) | 自碰撞每侧偏移（总厚度=2x此值） |
| SelfCollisionStiffness | `float` | 0.5 | 自碰撞弹簧刚度 |
| SelfCollisionFriction | `ImportedFloatValue` | (默认值) | 布料-布料摩擦系数 |
| SelfCollisionDisableNeighborDistance | `int32` | 5 | 禁用邻居碰撞环距离 |
| SelfCollisionLayers | `ConnectableIStringValue` | "SelfCollisionLayers" | 自碰撞层面图（-1=正常碰撞，高层数保持在低层数外侧） |
| SelfCollisionDisabledFaces | `ConnectableIStringValue` | "SelfCollisionDisabledFaces" | 不自碰撞的面选择集 |
| bUseSelfIntersections | `bool` | true | 启用自交叉修复（开销较大） |
| bUseGlobalIntersectionAnalysis | `bool` | true | 全局交叉分析确定碰撞弹簧正确法线 |
| bUseContourMinimization | `bool` | true | 时间步开始时进行轮廓最小化步骤 |
| NumContourMinimizationPostSteps | `int32` | 0 | 时间步后轮廓最小化步骤数（非常昂贵） |
| bUseGlobalPostStepContours | `bool` | true | 后步骤轮廓最小化使用全局轮廓梯度 |

#### SimulationSelfCollisionSpheresConfigNode — 自碰撞球体配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| SelfCollisionSphereRadius | `float` | 0.5 | 每顶点自碰撞球体半径 |
| SelfCollisionSphereStiffness | `float` | 1.0 | 自碰撞球体弹簧刚度 |
| SelfCollisionSphereRadiusCullMultiplier | `float` | 1.0 | 球体剔除乘数（基于 Radius * CullMultiplier） |
| SelfCollisionSphereSetName | `FString` | (输出) | 未剔除顶点生成的碰撞球体选择集名称 |

#### SimulationVelocityScaleConfigNode — 速度缩放配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| VelocityScaleSpace | `EChaosSoftsSimulationSpace` | ReferenceBoneSpace | 速度属性评估空间 |
| LinearVelocityScale | `FVector3f` | (0.75,0.75,0.75) | 参考骨骼到局部布料空间的线性速度量 |
| MaxLinearVelocity | `FVector3f` | (1000,1000,1000) | 最大线性速度 |
| MaxLinearAcceleration | `FVector3f` | (60000,60000,60000) | 最大线性加速度 |
| AngularVelocityScale | `float` | 0.75 | 参考骨骼到局部布料空间的角速度量 |
| MaxAngularVelocity | `float` | 200 | 最大角速度 |
| MaxAngularAcceleration | `float` | 12000 | 最大角加速度 |
| MaxVelocityScale | `float` | 1.0 | 线性和角速度缩放钳制 |
| FictitiousForcesModel | `EChaosClothingSimulationSolverFictitiousForcesModel` | FullScale | 虚拟力模型（None / Legacy / FullScale） |
| FictitiousAngularScale | `float` | 1.0 | 虚拟力角速度比例（0=无离心力，1=完全离心力，2=过驱动） |

#### SimulationMorphTargetConfigNode — 形变目标配置

| 属性 | 类型 | 说明 |
|------|------|------|
| ActiveMorphTarget.Name | `FString` | 活动的模拟形变目标名称 |
| ActiveMorphTarget.Weight | `float` | 形变目标权重 |

#### SimulationResolveExtremeDeformationConfigNode — 极端形变修复配置

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| InputSelection | `ConnectableIStringValue` | "InputSelection" | 检查极端形变的顶点选择集 |
| ExtremeDeformationEdgeRatioThreshold | `float` | 5.0 | 边形变超过此阈值时触发位置重置 |
| ExtremeDeformationVertexSelection | `FString` | (输出) | 极端形变顶点集名称 |

#### SimulationClothVertexFaceSpringConfigNode — 顶点-面弹簧配置

实验性节点，用于创建顶点-面约束并设置其模拟属性。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bAppendToExisting | `bool` | false | 追加到已有约束集 |
| bUseTetRepulsionConstraints | `bool` | false | 作为四面体排斥约束而非弹簧约束 |
| VertexFaceSpringExtensionStiffness | `FVector2f` | (100,100) | 拉伸刚度（弹簧长度大于静止长度时） |
| VertexFaceSpringCompressionStiffness | `FVector2f` | (100,100) | 压缩刚度（弹簧长度小于静止长度时） |
| VertexFaceSpringDamping | `FVector2f` | (0,0) | 阻尼（相对临界阻尼） |
| VertexFaceRepulsionStiffness | `float` | 0.5 | 排斥约束刚度 |
| VertexFaceMaxRepulsionIters | `int32` | 1 | 每求解器迭代最大排斥迭代数 |
| ConstructionSets | `TArray<...>` | — | 程序化生成约束的构造数据 |
| bUseThicknessMap | `bool` | false | 使用厚度图而非当前静止集合状态确定静止长度 |
| Thickness | `WeightedValue` | (0.5,0.5) | 静止长度计算的厚度 |
| RestLengthScale | `float` | 1.0 | 静止长度缩放 |

**构造方法**（`EChaosClothAssetClothVertexFaceSpringConstructionMethod`）：
- `SourceToClosestTarget`：每个源点连接最近的目标点
- `SourceToRayIntersectionTarget`：每个源点沿法线方向射线检测
- `AllWithinRadius`：半径内所有目标点连接
- `Tetrahedralize`：创建四面体网格并查找对应面-顶点对

#### SimulationClothVertexSpringConfigNode — 顶点-顶点弹簧配置

实验性节点，用于创建顶点-顶点约束并设置其模拟属性。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| bAppendToExisting | `bool` | false | 追加到已有约束集 |
| VertexSpringExtensionStiffness | `FVector2f` | (100,100) | 拉伸刚度 |
| VertexSpringCompressionStiffness | `FVector2f` | (100,100) | 压缩刚度 |
| VertexSpringDamping | `FVector2f` | (0,0) | 阻尼 |
| ConstructionSets | `TArray<...>` | — | 程序化生成约束的构造数据 |
| RestLengthScale | `float` | 1.0 | 静止长度缩放 |

**构造方法**（`EChaosClothAssetClothVertexSpringConstructionMethod`）：
- `SourceToClosestTarget`：每个源点连接最近目标点
- `ClosestSourceToClosestTarget`：双向最近连接
- `AllSourceToAllTargets`：所有源点连接所有目标点

---
## 三、Cloth Constraint 约束系统详解

> 以下分析基于 `ChaosCloth` 插件源码（路径：`Engine/Plugins/ChaosCloth/Source/ChaosCloth`）和 Chaos 核心物理引擎约束类。

### 3.1 约束创建前提条件

Chaos Cloth 中的粒子分为两类：

- **Kinematic Particles（运动学粒子）**：`InvM == 0`（无限质量），由动画直接驱动位置，不受物理力影响。
- **Dynamic Particles（动力学粒子）**：`InvM > 0`，由物理引擎模拟，受重力、约束、外力影响。

约束的创建遵循以下规则：

| 粒子组合 | 是否创建约束 |
|---------|-------------|
| Kinematic ↔ Dynamic | ✅ 创建 |
| Dynamic ↔ Dynamic | ✅ 创建 |
| Kinematic ↔ Kinematic | ❌ 不创建 |

原因：运动学粒子位置由动画锁定，在它们之间创建约束没有物理意义——约束无法改变它们的位置，只会浪费计算资源。

### 3.2 PBD 与 XPBD 求解器

Chaos Cloth 支持两种约束求解模式，由 `SimulationStretchConfigNode` 和 `SimulationBendingConfigNode` 上的 `SolverType` 属性控制：

| 特性 | PBD | XPBD |
|------|-----|------|
| 刚度表示 | `ExpStiffness`（指数缩放，0-1） | `Stiffness`（柔度倒数，可达 1e9） |
| 帧率独立性 | ❌ 刚度随帧率和迭代次数变化 | ✅ 刚度与时间步长、迭代次数解耦 |
| 阻尼 | 无独立阻尼参数 | 支持相对临界阻尼的 `Damping` 参数 |
| 拉格朗日乘子 | 无 | 每约束持久化 `Lambda[]` 状态，每子步重置 |
| 求解公式 | `Delta = ExpStiffness * Offset / CombinedInvMass` | `AlphaInv = Stiffness * Dt²; DLambda = (-AlphaInv*Offset - Lambda) / (AlphaInv*CombinedInvMass + 1)` |
| 性能 | 更快 | 略慢（额外乘子状态） |
| 推荐场景 | 简单布料、性能优先 | 需要物理精确性、帧率一致性 |

关于 PBD/XPBD 的完整数学推导，参见本站&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;。

### 3.3 Isotropic 与 Anisotropic 分布

| 特性 | Isotropic（各向同性） | Anisotropic（各向异性） |
|------|---------------------|----------------------|
| 刚度 | 单一标量 `Stiffness` | 三个值：`StiffnessWarp`、`StiffnessWeft`、`StiffnessBias` |
| 前提条件 | 无 | 需要 Pattern Data（2D 裁片空间）计算 Warp/Weft/Bias 方向 |
| 拉伸约束 | 边弹簧 | 各向异性弹簧（边+轴向）或三角形元素 |
| 弯曲约束 | 铰链角度/对角弹簧 | 各向异性铰链角度 |
| 适用场景 | 无 UV 裁片数据的通用布料 | 有裁片数据的服装（如 Marvelous Designer 导入） |

**Warp / Weft / Bias 方向**：
- **Warp（经向）**：UV 的 U 方向（垂直方向、纵向）
- **Weft（纬向）**：UV 的 V 方向（水平方向、横向）
- **Bias（斜向）**：UV 的 45° 对角方向

各向异性允许织物在不同方向表现出不同的抗拉伸/弯曲特性——例如真实织物沿经纬方向更硬、沿斜向更软。`WarpScale` 和 `WeftScale` 可独立调整各方向的静止长度缩放。

### 3.4 拉伸约束（Stretch / Edge Constraint）

拉伸约束防止布料被过度拉长，作用于网格边的两个顶点之间。

**约束创建映射**（由 `CreateStretchConstraints()` 中的优先级瀑布决定）：

| 条件 | 创建的约束类 | 说明 |
|------|-------------|------|
| PatternData + XPBD Anisotropic | `FXPBDStretchBiasElementConstraints` | 三角形元素级各向异性拉伸 |
| XPBD Isotropic | `FXPBDEdgeSpringConstraints` | XPBD 各向同性边弹簧 |
| PBD | `FPBDEdgeSpringConstraints` | PBD 各向同性边弹簧 |
| PatternData + XPBD Anisotropic（附加） | `FXPBDAnisotropicSpringConstraints` | 边+轴向各向异性弹簧（两条规则） |

**数学原理**：

PBD 边弹簧：
$$
\vec{d} = \vec{P}_1 - \vec{P}_2, \quad L = |\vec{d}|, \quad \hat{n} = \frac{\vec{d}}{L}
$$
$$
\Delta\vec{P} = \frac{S \cdot (L - L_0) \cdot \hat{n}}{w_1 + w_2}
$$

其中 $S$ 为刚度（PBD 指数缩放），$w_i$ 为逆质量，$L_0$ 为静止长度。

XPBD 边弹簧（含拉格朗日乘子 $\lambda$ 和阻尼）：
$$
\alpha^{-1} = S \cdot \Delta t^2, \quad \Delta\lambda = \frac{-\alpha^{-1}(L - L_0) - \lambda}{\alpha^{-1}(w_1 + w_2) + 1}
$$
$$
\Delta\vec{P} = \Delta\lambda \cdot \hat{n}, \quad \lambda \mathrel{+}= \Delta\lambda
$$

阻尼变体使用相对速度 $\vec{V}_{rel} = (\vec{P}_1 - \vec{X}_1) - (\vec{P}_2 - \vec{X}_2)$ 和 $\beta = \frac{D \cdot 2\sqrt{S/(w_1+w_2)}}{L_0}$。

**各向异性拉伸**（`FXPBDAnisotropicSpringConstraints`）是一个复合约束，包含：
- **边弹簧**（2粒子）：沿网格边，分 Warp/Weft/Bias 刚度
- **轴向弹簧**（3粒子）：粒子到边上的重心点，通过 `Bary` 坐标定位

两者的 Apply 分为两条独立的约束规则（图染色并行化）。

**三角形元素拉伸**（`FXPBDStretchBiasElementConstraints`）在三角形级别通过 UV 空间变形梯度计算拉伸，连接 3 个粒子，计算 $\partial X / \partial U$ 和 $\partial X / \partial V$，分别应用 Warp（U）/ Weft（V）/ Bias（对角）刚度。

### 3.5 弯曲约束（Bending Constraint）

弯曲约束控制布料抵抗弯折的能力，决定褶皱和波纹的形成。

#### 约束创建映射

| 条件 | 创建的约束类 | 拓扑 | 说明 |
|------|-------------|------|------|
| PatternData + XPBD Anisotropic | `FXPBDAnisotropicBendingConstraints` | 4粒子 | 各向异性铰链角度 |
| XPBD Isotropic + HingeAngles | `FXPBDBendingConstraints` | 4粒子 | XPBD 铰链角度 |
| PBD + HingeAngles | `FPBDBendingConstraints` | 4粒子 | PBD 铰链角度 |
| XPBD + FacesSpring | `FXPBDBendingSpringConstraints` | 2粒子 | XPBD 对角弹簧 |
| PBD + FacesSpring | `FPBDBendingSpringConstraints` | 2粒子 | PBD 对角弹簧 |

#### HingeAngles vs FacesSpring

**HingeAngles（铰链角度 / Bending Element）**：
- 连接 **4 个粒子**：两个相邻三角形共享边的两端点（P1, P2）+ 两个对面顶点（P3, P4）
- 基于两三角形法向量之间的二面角 $\phi$ 约束
- 精确保持折叠角
- $\sin\phi = (\vec{N}_1 \times \vec{N}_2) \cdot \hat{e}$，$\cos\phi = \vec{N}_1 \cdot \vec{N}_2$
- 使用完整解析梯度（4 个偏导数，无小角度近似）

**FacesSpring（面对角弹簧 / Bending Spring）**：
- 连接 **2 个粒子**：两个相邻三角形的对角顶点（不共享边的对面顶点）
- 通过对角线长度约束近似保持折叠角
- 更便宜但精度较低
- 复用标准弹簧 `GetDelta` 数学

> **为什么边界边上没有弯曲约束？** 因为边界边只有一个三角形，没有"对面"三角形。没有相邻面片→没有折叠角→无法创建 Bending Element。这与 `GetUniqueAdjacentElements()` / `GetUniqueAdjacentPoints()` 的拓扑遍历一致。

#### 弯曲约束的数学

铰链角度约束的缩放因子：
$$
\text{Angle} = \text{atan2}(\sin\phi, \cos\phi)
$$
$$
\Delta = \text{Clamp}\bigl(S \cdot (\text{Angle} - \text{RestAngle}),\ -\frac{\pi}{4},\ \frac{\pi}{4}\bigr)
$$
$$
\text{Denom} = \sum_i w_i \cdot |\nabla_i \phi|^2, \quad \text{ScalingFactor} = \frac{\Delta}{\text{Denom}}
$$
$$
\vec{P}_i \mathrel{+}= w_i \cdot \nabla_i \phi \cdot \text{ScalingFactor}
$$

其中 $\nabla_i \phi$ 是二面角对第 $i$ 个粒子位置的解析梯度（4 个偏导数，完整计算无近似）。

#### 静止角度类型

通过 `RestAngleType` 属性控制：

| 类型 | 说明 |
|------|------|
| Use3DRestAngles | 使用 3D 披覆空间模拟网格的静止角度（默认） |
| FlatnessRatio | 作为完全平坦 vs 3D 静止角度的比值计算。0=Use3DRestAngles，1=静止角度为 0（完全平坦） |
| RestAngle | 使用显式值（度）。0=平坦，正值远离边法线折叠，负值朝边法线折叠 |

### 3.6 屈曲机制（Buckling）

屈曲是弯曲约束的核心特性，模拟织物在折叠超过一定阈值后抵抗力骤降的行为。

#### AngleIsBuckled 判定

```cpp
bool AngleIsBuckled(const FSolverReal Angle, const int32 ConstraintIndex) const
{
    // Angle = 0 时完全平坦。用 Angle' = (π - |Angle|) 更直观，= 0 时完全折叠。
    // 屈曲条件：Angle' <= BucklingRatio * RestAngle'
    return UE_PI - FMath::Abs(Angle) < BucklingRatioWeighted.GetValue(ConstraintIndex) 
           * (UE_PI - FMath::Abs(RestAngles[ConstraintIndex]));
}
```

**概念解析**：
- `Angle` = 当前二面角（0 = 完全平坦）
- `Angle' = π - |Angle|` = "折叠度"（0 = 平坦，π = 完全对折）
- `RestAngle' = π - |RestAngle|` = 静止折叠度
- 当 `Angle' ≤ BucklingRatio × RestAngle'` 时判定为屈曲

**直观例子**：
- 假设 RestAngle = 30°（π/6），BucklingRatio = 0.5
- RestAngle' = π - π/6 ≈ 2.618
- 阈值 = 0.5 × 2.618 ≈ 1.309
- 当当前 Angle = 160° 时，Angle' = π - 160° ≈ 0.349
- 0.349 < 1.309 → 判定为屈曲 → 使用屈曲刚度（BucklingStiffness）替代弯曲刚度（Stiffness）

**BucklingRatio 取值**：
- 0 → 屈曲刚度永不使用（始终用弯曲刚度）
- 1 → 一旦折叠超过静止构型就使用屈曲刚度
- 通常屈曲刚度设置为小于弯曲刚度，模拟织物折叠后变软

`IsBuckled[]` 在每个子步的 `Init()` 中从当前状态重新计算。

### 3.7 面积约束（Area Constraint）

面积约束保持三角形面积，防止布料过度剪切变形。

| 条件 | 创建的约束类 | 拓扑 |
|------|-------------|------|
| XPBD | `FXPBDAreaSpringConstraints` | 3粒子（轴向） |
| PBD + PatternData | `FPBDAreaSpringConstraints`（用 Pattern 位置） | 3粒子 |
| PBD | `FPBDAreaSpringConstraints`（用 3D 位置） | 3粒子 |

**数学原理**：通过粒子到对边重心点的轴向弹簧约束三角形面积。重心点 $\vec{P} = \text{Bary} \cdot \vec{P}_2 + (1-\text{Bary}) \cdot \vec{P}_3$，使用乘数 $\text{Multiplier} = \frac{2}{\max(\text{Bary}, 1-\text{Bary}) + 1}$ 修正重心杠杆。

面积约束在 `SimulationStretchConfigNode` 中通过 `bAddAreaConstraint` 启用（仅 Isotropic 分布），刚度由 `AreaStiffness` 控制。

### 3.8 长程附着约束（Long Range Attachment / Tether）

长程附着约束连接运动学粒子到动力学粒子，用于加速约束收敛——每个动力学粒子寻找最近的运动学粒子并建立约束。

| 属性 | 创建的约束类 | 拓扑 |
|------|-------------|------|
| TetherStiffness | `FPBDLongRangeConstraints` | Kinematic → Dynamic 粒子对 |

**数学原理**：单向距离约束（只拉近不推开）：
$$
\vec{d} = \vec{P}_{kin} - \vec{P}_{dyn}, \quad L = |\vec{d}|
$$
$$
\text{Offset} = \max(0, L - L_{ref} \cdot \text{Scale})
$$
$$
\vec{P}_{dyn} \mathrel{+}= S \cdot \text{Offset} \cdot \hat{d}
$$

只有动力学粒子（End）移动，运动学粒子（Start）固定。`checkSlow(InvM(Start)==0 && InvM(End)>0)` 确保严格 Kinematic→Dynamic。

> Long Range Attachment 与 Tether 是同一约束的两种称呼：Long Range Attachment 是学术名称，Tether 是用户可见的属性名。`IsEnabled` 检查 `IsTetherStiffnessEnabled`。每个子步只运行一次（`NumLRAIterations = 1`），源码注释称其为"more of a fake constraint to jump start our initial guess"。

**参数**：
- `TetherStiffness`：栓系刚度
- `TetherScale`：栓系长度缩放（0.01-10，乘以网格缩放）
- `UseGeodesicTethers`：是否使用测地线距离计算栓系长度

### 3.9 最大距离约束（MaxDistance）

最大距离约束限制每个动力学粒子到其动画蒙皮位置的最大距离。值为 0 的粒子变为运动学体。

| 属性 | 创建的约束类 | 拓扑 |
|------|-------------|------|
| MaxDistance | `FPBDSphericalConstraint` | 单粒子 vs 动画位置 |

**数学原理**：硬投影（无刚度，直接位置钳制）：
$$
\vec{C} = \vec{P}_{anim}, \quad \vec{c} = \vec{P} - \vec{C}
$$
$$
\text{if } |\vec{c}| > R: \quad \vec{P} = \vec{C} + \frac{R}{|\vec{c}|} \cdot \vec{c}
$$

将粒子硬性拉回以动画位置为中心、$R$ 为半径的球内。

### 3.10 后挡板约束（Backstop）

后挡板约束防止布料穿透到身体的背面。每个粒子有一个沿动画法线偏移的碰撞球。

| 属性 | 创建的约束类 | 拓扑 |
|------|-------------|------|
| BackstopRadius + BackstopDistance | `FPBDSphericalBackstopConstraint` | 单粒子 vs 动画偏移球 |

**数学原理**：
$$
\vec{C} = \vec{P}_{anim} - (R + D) \cdot \hat{n}_{anim}
$$

球心位于动画位置沿动画法线反方向偏移 $(R + D)$ 处（非 Legacy 模式）。当粒子在球内时，投影到球面：
$$
\text{if } |\vec{P} - \vec{C}| < R: \quad \vec{P} = \vec{C} + \frac{R}{|\vec{P} - \vec{C}|} \cdot (\vec{P} - \vec{C})
$$

Legacy 模式（`UseLegacyBackstop`）从距离中排除半径，匹配旧 PhysX/NvCloth 行为。

### 3.11 动画驱动约束（AnimDrive）

动画驱动约束驱动布料粒子向其动画蒙皮位置移动。

| 属性 | 创建的约束类 | 拓扑 |
|------|-------------|------|
| AnimDriveStiffness | `FPBDAnimDriveConstraint` | 单粒子 vs 动画位置+速度 |

**数学原理**：
$$
\vec{P} \mathrel{-}= S \cdot (\vec{P} - \vec{P}_{anim})
$$

弹簧朝向动画位置，然后阻尼：
$$
\vec{V}_{rel} = (\vec{P} - \vec{X}) - \vec{V}_{anim} \cdot \Delta t, \quad \vec{P} \mathrel{-}= D \cdot \vec{V}_{rel}
$$

### 3.12 自碰撞约束（Self-Collision）

自碰撞约束防止布料与自身相交，由三个协作类组成：

| 类型 | 创建的约束类 | 拓扑 | 说明 |
|------|-------------|------|------|
| 点-面碰撞弹簧 | `FPBDCollisionSpringConstraints` | 1 顶点 + 3 三角形顶点 | 主要自碰撞，通过空间哈希 + GIA 检测 |
| 球体碰撞 | `FPBDSelfCollisionSphereConstraints` | 顶点-顶点对 | 更便宜的回退方案 |
| 三角形交叉 | `FPBDTriangleMeshIntersections` | 三角形-三角形 | 轮廓最小化后处理 |

**点-面碰撞弹簧数学**：
$$
\text{Thickness} = \sum_i \text{Bary}_i \cdot \text{Thickness}_i
$$
$$
\text{CombinedMass} = w_1 + \sum_i \text{Bary}_i \cdot w_i
$$

当顶点到三角形面距离小于 `GetConstraintThickness()` 时，沿（可能翻转的）法线将顶点推出三角形。可逆（在反转下工作）。支持运动学碰撞器三角形。

**全局交叉分析（GIA）**：用于确定碰撞弹簧的正确法线方向。当布料自交叉时，局部法线可能指向错误方向，GIA 通过全局拓扑分析修正法线。

**轮廓最小化**：在时间步开始时尝试通过缩短交叉边来修复交叉。对 GIA 无法修复的开放交叉特别有效。`NumContourMinimizationPostSteps` 控制额外的时间步后步骤数（非常昂贵）。

**自碰撞层**（`SelfCollisionLayers`）：面整数图，-1=正常碰撞，其他数字=层数。高层数面保持在低层数面的外侧（前向法线方向）。用于控制多层布料的碰撞行为。

### 3.13 极端形变检测（Extreme Deformation）

极端形变不是约束，而是一个检测器。存储交叉边、静止长度和顶点选择集，当任何边的当前/静止长度比超过 `ExtremeDeformationEdgeRatioThreshold` 时返回 true。不添加约束规则，仅用于诊断和可视化。

### 3.14 压力与气动力（Pressure & Aerodynamics）

压力与气动力作为外力（非位置约束）施加，仅力基求解器支持。

**气动力**（`FVelocityAndPressureField`）：
$$
\vec{F} = \frac{1}{4}\rho \cdot 2A \cdot \text{TurbulenceFactor} \cdot (\text{Drag/Lift 项}) + A \cdot \frac{1}{2} C_p \cdot \hat{N}
$$

其中 $\rho$ 为流体密度，$A$ 为三角形面积，$C_d$/$C_l$/$C_p$ 分别为阻力/升力/压力系数。支持 Inner/Outer 变体用于双面布料。可选 `FBuoyancyField` 添加水中阻力和浮力。

### 3.15 约束系统总表

| 约束类型 | 约束类 | 拓扑 | 求解器 | 关键参数 |
|---------|--------|------|--------|---------|
| 边拉伸（各向同性） | FPBDEdgeSpringConstraints | 2粒子 | PBD | EdgeSpringStiffness |
| 边拉伸 XPBD（各向同性） | FXPBDEdgeSpringConstraints | 2粒子 | XPBD | XPBDEdgeSpringStiffness, Damping |
| 各向异性拉伸（元素） | FXPBDStretchBiasElementConstraints | 3粒子 | XPBD | Warp/Weft/Bias Stiffness, Damping, Scale |
| 各向异性弹簧（边+轴向） | FXPBDAnisotropicSpringConstraints | 2+3粒子 | XPBD | Warp/Weft/Bias Stiffness, Damping, Scale |
| 弯曲元素（铰链） | FPBDBendingConstraints | 4粒子 | PBD | BendingStiffness, BucklingRatio/Stiffness, RestAngle |
| 弯曲元素 XPBD | FXPBDBendingConstraints | 4粒子 | XPBD | + Damping |
| 弯曲弹簧（对角） | FPBDBendingSpringConstraints | 2粒子 | PBD | BendingSpringStiffness |
| 弯曲弹簧 XPBD | FXPBDBendingSpringConstraints | 2粒子 | XPBD | + Damping |
| 各向异性弯曲 | FXPBDAnisotropicBendingConstraints | 4粒子 | XPBD | Warp/Weft/Bias Stiffness, Buckling, Damping |
| 面积（PBD） | FPBDAreaSpringConstraints | 3粒子 | PBD | AreaStiffness |
| 面积（XPBD） | FXPBDAreaSpringConstraints | 3粒子 | XPBD | (通过 XPBD 轴向刚度) |
| 长程附着/栓系 | FPBDLongRangeConstraints | K→D 对 | PBD(1次/子步) | TetherStiffness, TetherScale |
| 最大距离 | FPBDSphericalConstraint | 单粒子 vs 动画 | PBD | MaxDistance |
| 后挡板 | FPBDSphericalBackstopConstraint | 单粒子 vs 动画球 | PBD | BackstopRadius, BackstopDistance |
| 动画驱动 | FPBDAnimDriveConstraint | 单粒子 vs 动画 | PBD | AnimDriveStiffness, Damping |
| 自碰撞（弹簧） | FPBDCollisionSpringConstraints | 1 顶点+3 三角形 | PBD 后碰撞 | Thickness, Friction, Stiffness, Layers |
| 自碰撞（球体） | FPBDSelfCollisionSphereConstraints | 顶点-顶点对 | PBD 后碰撞 | Radius, Stiffness |
| 自交叉 | FPBDTriangleMeshIntersections | 三角形-三角形 | 后子步 | (来自 FPBDTriangleMeshCollisions) |
| 极端形变 | FPBDExtremeDeformationConstraints | 2粒子（检测器） | 无 | EdgeRatioThreshold |
| 压力/气动 | FVelocityAndPressureField | 每三角形力 | 力基 | Drag, Lift, Pressure, FluidDensity |

---
## 四、调试 CVAR

以下 CVAR 在布料调试中常用（来源于参考文档）：

| CVAR | 默认值 | 说明 |
|------|--------|------|
| `p.ClothPhysics.WaitForParallelClothTask` | 1 | 等待并行布料任务完成 |
| `p.ChaosCloth.DebugDrawPhysMeshWired` | 1 | 绘制布料物理网格线框 |
| `p.Chaos.DebugDraw.Enabled` | 1 | 启用 Chaos 调试绘制 |
| `p.Chaos.Cloth.SwapBackstopAnimDriveApply` | — | 交换 Backstop 和 AnimDrive 的应用顺序 |
| `p.Chaos.Cloth.EnableBuoyancy` | — | 启用浮力场 |

---
## 五、布料物理属性、应用举例与参数推荐

不同类型的布料（丝绸、棉麻、皮革、毛呢等）在物理模拟中具有各自的物理属性差异，这些属性决定了布料的下垂感、褶皱方式、摆动幅度、回弹速度等动态行为。

### 5.1 常见布料类型物理属性对比

| 布料类型 | 拉伸刚度 | 弯曲刚度 | 剪切刚度 | 摩擦力 | 阻尼 | 特点 |
|---------|---------|---------|---------|--------|------|------|
| 丝绸 / 绸缎 | 低 | 极低 | 低 | 低 | 中等 | 极度柔软、易飘动，褶皱细密，光滑贴体 |
| 棉布 / 麻布 | 中 | 中 | 中 | 中高 | 中等偏高 | 稍挺、折叠明显，抗拉性强，易形成平滑波动 |
| 皮革 / 合成皮 | 极高 | 高 | 高 | 高 | 低 | 很厚重，基本无飘动，形状保持强 |
| 牛仔布 / 粗棉布 | 高 | 高 | 高 | 高 | 中 | 结实挺括，折痕硬朗，不易弯曲 |
| 羊毛呢 / 毛料 | 中 | 高 | 中 | 高 | 高 | 厚重下垂、吸收动能、动作迟缓 |
| 薄纱 / 雪纺 / 蕾丝 | 极低 | 极低 | 极低 | 低 | 极低 | 极轻盈，风中飘动剧烈，可产生丰富波浪 |
| 尼龙 / 运动衣料 | 中高 | 低 | 中 | 中 | 中 | 有弹性、轻盈、快速反弹，适合紧身服饰 |

### 5.2 关键物理属性解释

| 属性 | 含义 | 对模拟的影响 |
|------|------|-------------|
| 拉伸刚度 (Stretch Stiffness) | 对抗拉长的能力 | 高→布料不易被拉长；低→易被拉扯出形变 |
| 弯曲刚度 (Bend Stiffness) | 对抗弯折的能力 | 高→不容易产生弧形、褶皱；低→易产生柔软波纹 |
| 剪切刚度 (Shear Stiffness) | 对抗剪切（斜拉形变）的能力 | 高→表面变形小；低→布料易扭曲 |
| 摩擦 (Friction) | 与自身或碰撞物接触的阻力 | 高→不易滑动；低→披风容易滑落或翻转 |
| 阻尼 (Damping) | 运动能量消耗速度 | 高→动作快速停止，表现沉稳；低→持续晃动飘逸 |
| 密度 / 质量 (Mass Density) | 单位面积的重量 | 决定飘动感 vs 沉重感，是布料惯性的基础 |
| 空气阻力 (Air Drag) | 空气对运动布料的阻力 | 高→随风飘、缓慢下落；低→快速贴合或坠落 |

### 5.3 弯曲（Bending）与屈曲（Buckling）

"弯曲"和"屈曲"虽然都涉及物体形变，但在工程力学和布料模拟中是不同的概念：

| 项目 | 弯曲（Bending） | 屈曲（Buckling） |
|------|----------------|-----------------|
| 含义 | 在外力（弯矩）作用下产生平滑弯曲形变 | 在轴向压力作用下发生侧向突然弯曲的失稳现象 |
| 作用力方向 | 垂直于物体轴线的横向力或弯矩 | 沿物体轴线方向的压缩力 |
| 形变特征 | 平滑、连续的弯曲曲线 | 临界负荷后发生突变、屈折、侧向拱起 |
| 是否失稳 | 否 | 是 |
| 布料表现 | 披风边缘飘动形成平滑波纹 | 布料受压后出现"突然起角的折线" |

在 Chaos Cloth 中，弯曲刚度控制布料柔软程度，决定波浪是否容易产生；屈曲则通过 **BucklingRatio** 参数间接建模——当布料折叠超过静止角度的一定比例后，切换到较低的屈曲刚度，模拟织物在受压折叠后抵抗力骤降的行为。详见第三节约束系统中的屈曲机制分析。

### 5.4 应用举例

#### 丝绸披风

极低的弯曲和剪切刚度，大风或飞行时披风会飘得很夸张；轻盈飘逸，但容易穿模，需加高空气阻力或固定肩部区域。

#### 羊毛大衣披风

高阻尼和中高摩擦，摇晃幅度小但下垂感强，适合沉稳的角色气质；受力响应慢，模拟贴近真实重披风。

#### 尼龙斗篷（超级英雄披风）

中等张力、低弯曲，适合做飘带动态；有回弹力，动作后快速归位；可调整风响应性，使其更富表现力。

#### 皮革外套

极高拉伸和弯曲刚度，基本无飘动，形状保持强；需要高迭代次数保证刚度收敛。

### 5.5 模拟参数默认值

以下为源码中的默认值，对应参考 docx 中的参数配置（UE 5.5+）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| **求解器** | | |
| NumIterations | 1 | 60fps 迭代次数 |
| MaxNumIterations | 6 | 最大迭代次数 |
| NumSubsteps | (引擎默认) | 子步数 |
| **重力** | | |
| bUseGravityOverride | false | 使用自定义重力 |
| GravityScale | 1.0 | 重力缩放 |
| GravityOverride | (0,0,-980) | 重力向量 [cm/s²] |
| **空气动力学** | | |
| FluidDensity | 1.225 | 空气密度 [kg/m³] |
| Drag | 0.035 | 阻力系数 |
| Lift | 0.035 | 升力系数 |
| **质量** | | |
| MassMode | Density | 质量模式 |
| Density | 0.35 | 密度 [kg/m²] |
| MinPerParticleMass | 0.0001 | 最小粒子质量 |
| **阻尼** | | |
| DampingCoefficient | 0.01 | 全局阻尼 |
| **碰撞** | | |
| CollisionThickness | (默认值) | 碰撞厚度 |
| FrictionCoefficient | (默认值) | 摩擦系数 |
| bUseCCD | false | 连续碰撞检测 |
| **最大距离** | | |
| MaxDistance | 0 (Low) | 最大距离（0=运动学） |
| **后挡板** | | |
| BackstopDistance | 0 (Low) | 后挡板距离 |
| BackstopRadius | 0 (Low) | 后挡板半径 |
| **动画驱动** | | |
| AnimDriveStiffness | 0 (Low) | 动画驱动刚度 |
| AnimDriveDamping | 0 (Low) | 动画驱动阻尼 |
| **拉伸** | | |
| StretchStiffness (PBD) | 1.0 | PBD 拉伸刚度 |
| StretchStiffnessWarp/Weft/Bias (XPBD) | 100.0 | 各向异性拉伸刚度 |
| StretchDamping | 1.0 | 拉伸阻尼 |
| StretchWarpScale / WeftScale | 1.0 | 方向缩放 |
| AreaStiffness | 1.0 | 面积刚度 |
| **弯曲** | | |
| BendingStiffness (PBD) | 1.0 | PBD 弯曲刚度 |
| BendingStiffnessWarp/Weft/Bias (XPBD) | 100.0 | 各向异性弯曲刚度 |
| BendingDamping | 1.0 | 弯曲阻尼 |
| BucklingStiffness | 0.9 | 屈曲刚度 |
| BucklingRatio | 0.5 | 屈曲比 |
| **自碰撞** | | |
| bUseSelfCollisions | true | 启用自碰撞 |
| SelfCollisionThickness | (默认值) | 自碰撞厚度 |
| SelfCollisionStiffness | 0.5 | 自碰撞刚度 |
| SelfCollisionSphereRadius | 0.5 | 自碰撞球体半径 |

### 5.6 不同布料类型推荐参数

下表汇总了各布料类型的关键模拟参数推荐范围。密度参考值来源于源码 `SimulationMassConfigNode.h` 中 `Density` 属性注释（单位 kg/m²），其余参数基于应用场景与最佳实践：

| 布料类型 | Stretch Stiffness | Bend Stiffness | Density (kg/m²) | Damping | Drag | Friction | 说明 |
|---------|-------------------|----------------|-----------------|---------|------|----------|------|
| 丝绸 | 10-50 | 1-10 | 0.1 | 0.01 | 0.05-0.1 | 0.0-0.2 | 极度柔软、易飘动，需高空气阻力防穿模 |
| 棉布 | 50-100 | 20-50 | 0.2 | 0.02 | 0.035 | 0.3-0.5 | 稍挺、折叠明显，抗拉性强 |
| 皮革 | 500-1000 | 100-200 | 0.6 | 0.1 | 0.02 | 0.8 | 很厚重，需高迭代次数（6-8）保证收敛 |
| 牛仔布 | 200-500 | 50-100 | 0.4 | 0.05 | 0.035 | 0.5-0.8 | 结实挺括，折痕硬朗 |
| 羊毛呢 | 100-200 | 50-100 | 0.7 | 0.05-0.1 | 0.035 | 0.5-0.8 | 厚重下垂、吸收动能、动作迟缓 |
| 薄纱 | 5-20 | 1-5 | 0.05-0.1 | 0.005 | 0.05-0.1 | 0.0-0.1 | 极轻盈，风中飘动剧烈 |
| 尼龙 | 100-200 | 10-30 | 0.3-0.5 | 0.02 | 0.035-0.05 | 0.2-0.4 | 有弹性、快速反弹，适合紧身服饰 |

> 其他织物密度参考（源码注释）：Polyurethane（聚氨酯）0.5、Light Leather（轻皮革）0.3。完整密度对照：Melton Wool 0.7 > Heavy Leather 0.6 > Polyurethane 0.5 > Denim 0.4 > Light Leather 0.3 > Cotton 0.2 > Silk 0.1。

### 5.7 性能优化建议

1. **Sim Mesh 分辨率**：保持模拟网格低多边形（通常 500-3000 三角形），渲染网格高多边形由 Proxy Deformer 驱动。

2. **迭代次数**：NumIterations 1-4 适合大多数场景。刚度需求高的材料（皮革）需要 6-8 次。MaxNumIterations 设为 NumIterations 的 2-3 倍以应对低帧率。

3. **子步数**：NumSubsteps 3-4 适合稳定碰撞。过多子步会线性增加 CPU 开销。启用动态子步仅在快速运动场景需要。

4. **ProxyDeformer 节点位置**：尽早放置在图中以避免重复评估。仅在选择性区域布料驱动时使用。

5. **StripUserAttributes**：在终端节点前使用以剥离未使用的 Weight Maps、Sets 和 Face Int Maps，减小资产体积。

6. **自碰撞**：仅在必要时启用。`bUseSelfIntersections` 和 `NumContourMinimizationPostSteps` 非常昂贵，仅在交叉问题严重时使用。

7. **CCD**：仅在快速运动导致穿模时启用。考虑使用 `InnerCollisionThickness` 限制 CCD 触发范围以优化性能。

8. **XPBD vs PBD**：XPBD 提供帧率一致的刚度，推荐用于需要跨平台一致表现的项目。PBD 更快，适合移动端或简单布料。

---
## 附录：Dataflow 节点分类索引

| 类别 | 节点 |
|------|------|
| 导入 | ImportNode, SkeletalMeshImportNode, StaticMeshImportNode, ImportSimulationCacheNode |
| 终端 | TerminalNode |
| 网格操作 | RemeshNode, RecalculateNormalsNode, ReverseNormalsNode, TransformPositionsNode, TransformUVsNode, BlendVerticesNode, CopySimulationToRenderMeshNode, DeleteElementNode, StripUserAttributesNode |
| DynamicMesh | ClothCollectionToDynamicMeshNode, UpdateClothFromDynamicMeshNode, ExtractWeightMapNode, ExtractSelectionSetNode |
| 选择/权重 | SelectionNode, ProceduralSelectionNode, SelectionToWeightMapNode, SelectionToIntMapNode, WeightMapNode, WeightMapToSelectionNode, AddStitchNode |
| 蒙皮/代理 | ProxyDeformerNode, ApplyProxyDeformerNode, TransferSkinWeightsNode, SkinningBlendNode, BindToRootBoneNode, SetPhysicsAssetNode, GenerateSimMorphTargetNode, SimAccessoryMeshNode |
| 体型适配 | ApplyResizingNode, CustomRegionResizingNode, EnableUVResizingNode |
| 模拟配置 | SimulationDefaultConfigNode, SimulationSolverConfigNode, SimulationGravityConfigNode, SimulationAerodynamicsConfigNode, SimulationMassConfigNode, SimulationDampingConfigNode, SimulationCollisionConfigNode, SimulationMaxDistanceConfigNode, SimulationBackstopConfigNode, SimulationAnimDriveConfigNode, SimulationStretchConfigNode, SimulationBendingConfigNode, SimulationStretchOverrideConfigNode, SimulationBendingOverrideConfigNode, SimulationPressureConfigNode, SimulationSelfCollisionConfigNode, SimulationSelfCollisionSpheresConfigNode, SimulationVelocityScaleConfigNode, SimulationMorphTargetConfigNode, SimulationResolveExtremeDeformationConfigNode, SimulationClothVertexFaceSpringConfigNode, SimulationClothVertexSpringConfigNode |
