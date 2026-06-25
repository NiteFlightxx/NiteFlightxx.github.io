---
title: "虚幻引擎 IK Retargeter Op 堆栈的数学原理"
excerpt: "基于 Unreal Engine 5.9 IKRig 插件源码，系统剖析 IK Retargeter 的 Op 堆栈架构、共享的 One Euro Filter 平滑原语，以及全部 20 个活跃 Op 的功能、数学原理与参数。从骨盆运动、FK 链重定向到 IK 目标偏移、地面约束的 Rodrigues 趾弯曲求解，逐个拆解其公式推导与代码落地。"
date: "2026-06-25"
category: "Animation"
tags: ["UE5", "IK", "重定向", "动画", "C++", "数学"]
readTime: "阅读约45分钟"
---

> 本文基于 Unreal Engine 5.9 的 `IKRig` 插件源码整理，源码位于 `Engine/Plugins/Animation/IKRig/Source/IKRig`。目录 `Public/Retargeter/RetargetOps` 下共有 22 个 Op 头文件，其中 `IKChainsOp` 已在整个 `USTRUCT` 上标注 `Deprecated`（被 `FKChainsOp` 取代），本文**不收录**该废弃 Op，仅覆盖其余 20 个活跃 Op 及曲线 Op 的抽象基类。
>
> IK Retargeter（IK 重定向器）是 UE 用于在不同比例骨架间迁移动画的核心系统。它的精妙之处在于：把"重定向"这件事拆成了一条**可自由编排的 Op 堆栈**，每个 Op 只负责一件小事——或搬骨盆、或拉链条、或贴脚——串联起来就能处理从人到马、从写实到 Q 版的任意迁移。本文不讨论编辑器用法，而是聚焦于**每个 Op 背后的数学**：公式从何而来、代码如何落地、参数如何影响结果。

---

## 一、Op 堆栈架构总览

### 1.1 基类 FIKRetargetOpBase

所有 Op 都继承自 `FIKRetargetOpBase`（`IKRetargetOps.h`）。它定义了 Op 的生命周期与运行契约：

| 方法 | 作用 |
|------|------|
| `Initialize()` | 在重定向器初始化时调用一次，缓存骨骼索引、参考姿态、链映射等常量数据。 |
| `Run()` | 每帧执行的核心逻辑，输入源姿态 `InSourceGlobalPose`，输出目标姿态 `OutTargetGlobalPose`。 |
| `RunBeforeChildren()` | （仅父 Op）在子 Op 执行前运行，用于准备子 Op 所需的上下文（如重置 IK Goal 容器）。 |
| `RunAfterParent()` | （仅子 Op）在父 Op 的 IK 求解完成后运行，用于在求解结果上做后处理。 |
| `GetSettings()` | 返回该 Op 的设置结构体指针（每个 Op 有自己的 `FIKRetarget...OpSettings`）。 |
| `GetType()` / `GetSettingsType()` | 返回 Op 及其设置结构的 `UScriptStruct`，用于反射式复制。 |
| `GetParentOpType()` | 返回父 Op 类型；返回 `nullptr` 表示独立 Op。 |
| `IsSingleton()` | 为 `true` 时该 Op 全局唯一（如 `CopyBasePoseOp`、`ScaleSourceOp`）。 |
| `CanHaveChildOps()` | 为 `true` 时该 Op 可挂载子 Op（目前仅 `RunIKRigOp` 与曲线 Op 基类）。 |
| `CollectRetargetedBones()` | 声明本 Op 会修改哪些骨骼，供子 Op 判断传播范围。 |
| `OnPlaybackReset()` | 动画回放重置时调用，用于清空滤波器等时序状态。 |

每个 Op 的设置结构都派生自 `FIKRetargetOpSettingsBase`，自带三个基础字段：`bEnabled`（是否启用）、`LODThreshold`（LOD 截断阈值）、`bDebugDraw`（调试绘制开关）。运行时通过 `CopySettingsAtRuntime()` 把编辑器端的设置复制到运行时实例，复制时可排除需要重新初始化的字段（如骨骼引用）。

### 1.2 三阶段执行模型

Op 堆栈并非简单的线性顺序。对于父子关系（如 `RunIKRigOp` 与其子 Op），执行分三个阶段：

1. **`RunBeforeChildren`**：父 Op 准备上下文。`RunIKRigOp` 在此重置 Goal 容器、做基于链的基础 Goal 重定向（位置/旋转）。
2. **子 Op 的 `Run`**：所有子 Op 依次运行，它们在 IK 求解**之前**修改 Goal（偏移、缩放、贴地、种植等）。
3. **父 Op 的 `Run`**：`RunIKRigOp` 调用 `FIKRigProcessor::Solve()` 执行 IK 求解。
4. **子 Op 的 `RunAfterParent`**：IK 求解**之后**的后处理，如 `FloorConstraintOp` 在此弯曲脚趾、`BlendToSourceOp` 在此混合旋转。

这种"前处理 → 求解 → 后处理"的分层正是 Op 堆栈能灵活组合的关键。

### 1.3 Op 分类总览

| 分类 | Op | 父 Op | 说明 |
|------|-----|-------|------|
| 全局姿态 | PelvisMotionOp | — | 骨盆运动重定向（旋转+平移+地面约束） |
| 全局姿态 | RootMotionGeneratorOp | — | 根骨骼运动生成 |
| 全局姿态 | ScaleSourceOp | — | 源姿态整体缩放（单例） |
| 全局姿态 | RetargetPoseOp | — | 选择使用的重定向姿态（单例） |
| FK 链 | FKChainsOp | — | FK 链形状重定向（独立链映射） |
| 骨骼变换 | CopyBasePoseOp | — | 按名复制源局部变换（单例） |
| 骨骼变换 | PinBoneOp | — | 骨骼钉扎/跟随 |
| 骨骼变换 | StretchChainOp | — | 链长拉伸（独立链映射） |
| 骨骼变换 | AdditivePoseOp | — | 叠加重定向姿态增量 |
| 骨骼变换 | FilterBoneOp | — | 旋转的 One Euro 滤波 |
| IK Goal | RunIKRigOp | — | IK 求解父 Op（可挂子 Op） |
| IK Goal | OffsetGoalsOp | RunIKRigOp | Goal 位置/旋转偏移 |
| IK Goal | ScaleGoalsOp | RunIKRigOp | Goal 位置缩放 |
| IK Goal | BlendToSourceOp | RunIKRigOp | Goal 混合回源 |
| IK Goal | AlignPoleVectorOp | RunIKRigOp | 极向量对齐 |
| IK Goal | WeaponGoalsOp | RunIKRigOp | 双手武器/道具瞄准 |
| IK Goal | StrideWarpingOp | RunIKRigOp | 步幅/横向扭曲 |
| IK Goal | SpeedPlantingOp | RunIKRigOp | 速度种植（脚部固定） |
| IK Goal | FloorConstraintOp | RunIKRigOp | 地面/脚趾约束 |
| 曲线 | RetargetCurvesOpBase | — | 曲线 Op 抽象基类（单例） |
| 曲线 | CurveRemapOp | RetargetCurvesOpBase | 曲线复制/重映射（单例） |

---

## 二、共享平滑原语：One Euro Filter

`FilterBoneOp` 与 `FloorConstraintOp`（脚趾弯曲）都依赖同一个自适应低通滤波器——**One Euro Filter**，定义在 `RetargetOpUtils.h/.cpp`。理解它是理解后面两个 Op 的前提。

### 2.1 为什么需要自适应滤波

普通低通滤波面临一个两难：截止频率 $f_c$ 设低了，静止时很平滑，但快速运动时滞后严重；设高了，响应快了，静止时却抖动。One Euro 的核心思想是——**当信号变化快（速度大）时提高截止频率，变化慢时降低截止频率**。这样静止时强滤波去抖，运动时弱滤波保真，做到"用最低的滤波量达到不抖"。

### 2.2 标量版：FOneEuroScalarFilter

设置三参数（结构 `FOneEuroFilterSettings`）：

- `Responsiveness` $R$（默认 0.5）：速度对截止频率的提升系数。
- `CutoffFrequency` $f_c$（默认 1.5 Hz）：最小截止频率。
- `VelocityCutoffFrequency` $f_{c,v}$（默认 20.0 Hz）：导数（速度估计）本身的低通截止频率。

一阶低通滤波器离散形式为：

$$
x_f = x_{f,\text{prev}} + \alpha\,(x - x_{f,\text{prev}}) = (1-\alpha)\,x_{f,\text{prev}} + \alpha\,x
$$

其中 $\alpha$ 由截止频率与时间步长决定：

$$
\alpha = \frac{\Omega\,\Delta t}{1 + \Omega\,\Delta t}, \qquad \Omega\,\Delta t = 2\pi\,f_c\,\Delta t
$$

代码中对 $\Delta t$ 做了钳制 $[1/240,\,1/15]$ 秒，并对 $f_c$ 钳到奈奎斯特频率 $0.5/\Delta t$，避免数值爆炸。

每帧 `Update(value, dt, settings)` 的步骤：

1. **估计速度**：$\dot{x} = (x - x_{\text{prev}}) / \Delta t$，再用一个低通（截止 $f_{c,v}$）平滑得到 $\dot{x}_f$。
2. **自适应截止频率**：

$$
f_c' = f_c + R\,|\dot{x}_f|
$$

3. **用 $f_c'$ 计算新的 $\alpha$，对当前值做低通**：$x_f = \text{LowPass}(x_{f,\text{prev}}, x, \alpha)$。

速度越快，$|\dot{x}_f|$ 越大，$f_c'$ 越大，$\alpha$ 越接近 1（几乎不滤波）；速度越慢，$f_c' \to f_c$，强滤波。

### 2.3 四元数版：FOneEuroQuatFilter

四元数位于 $S^3$ 流形上，不能直接做线性低通。代码用**指数映射（Log/Exp）**把旋转差映射到切空间 $\mathbb{R}^3$ 滤波：

1. 计算误差旋转 $Q_{\text{err}} = Q_{\text{target}} \cdot Q_{\text{prev}}^{-1}$。
2. 取对数得到切空间向量 $\boldsymbol{\phi} = \log(Q_{\text{err}})$，其模长 $|\boldsymbol{\phi}|$ 即半旋转角，方向即旋转轴。
3. 半角速度 $\boldsymbol{\omega}/2 = \boldsymbol{\phi}/\Delta t$。
4. 用 $|\boldsymbol{\omega}|$ 计算自适应截止频率 $f_c' = f_c + R\,|\boldsymbol{\omega}|$，再算 $\alpha$。
5. 在切空间做步进：$\boldsymbol{\phi}_{\text{step}} = \alpha\,\boldsymbol{\phi}$，取指数回 $S^3$：$Q_{\text{step}} = \exp(\boldsymbol{\phi}_{\text{step}})$。
6. 更新：$Q_{\text{new}} = Q_{\text{step}} \cdot Q_{\text{prev}}$。

这样滤波始终在流形的切空间进行，结果仍是合法单位四元数，避免线性插值造成的"缩放"问题。

---

## 三、全局姿态 Op

### 3.1 PelvisMotionOp —— 骨盆运动重定向

骨盆是整条运动链的根，它的平移与旋转决定了角色的整体位移与朝向。`PelvisMotionOp` 是重定向器中数学最密集的 Op 之一。

**核心参数**（`FIKRetargetPelvisMotionOpSettings`）：

- `SourcePelvisBone` / `TargetPelvisBone`：源/目标骨盆骨骼。
- `BlendToAbsoluteOffset`（`FVector`，0–1，默认 0）：在"按比例缩放运动"与"绝对运动增量"间逐轴混合。常用于 $Z$ 轴：矮角色不希望垂直运动被等比压缩，可对 $Z$ 拉到 1 用绝对增量。
- `FloorConstraintWeight`（0–1，默认 0）：骨盆地面约束权重。
- `SourceCrotchOffset` / `TargetCrotchOffset`（cm，默认 0）：骨盆到"裆部"的垂直偏移，用于地面约束的比例换算。
- `bUseGroundFalloff`（默认 false）：约束是否随离地高度衰减。
- `GroundFalloffHeightPercent`（0.1–1，默认 0.9）：衰减起始高度占骨盆参考高度的比例。
- `RotationAlpha`（0–1，默认 1）、`RotationOffsetLocal` / `RotationOffsetGlobal`（`FRotator`）。
- `TranslationAlpha`（0–1，默认 1）、`TranslationOffsetLocal` / `TranslationOffsetGlobal`（`FVector`）。
- `BlendToSourceTranslation`（0–1，默认 0）+ `BlendToSourceTranslationWeights`（`FVector`）：逐轴向源骨盆位置混合。
- `ScaleHorizontal` / `ScaleVertical`（默认 1）：运动量的水平/垂直缩放。
- `AffectIKHorizontal`（0–1，默认 1）/ `AffectIKVertical`（0–1，默认 0）：骨盆修改对 IK 位置的影响权重。

**全局缩放因子**（初始化时缓存）：

$$
\mathbf{s} = \frac{H_{\text{tgt}}}{H_{\text{src}}}\,(1,\,1,\,1)
$$

其中 $H$ 为骨盆在重定向姿态中的高度。该因子供 `GetGlobalScaleVector()` 暴露给 `FKChainsOp`（GloballyScaled 平移模式）与 `RootMotionGeneratorOp` 使用，并再乘以 `ScaleHorizontal/ScaleVertical`。

**旋转重定向**（先做旋转，以便局部偏移用正确朝向）：

$$
\Delta R = R_{\text{src,cur}} \cdot R_{\text{src,init}}^{-1}
$$

$$
R_{\text{ret}} = \Delta R \cdot R_{\text{tgt,init}}
$$

再叠加偏移（局部在右、全局在左）与 Alpha 混合：

$$
R = \text{FastLerp}\bigl(R_{\text{tgt,init}},\; (R_{\text{ret}} \cdot q_{\text{local}}),\; q_{\text{global}} \cdot \dots,\; \alpha_{\text{rot}}\bigr)
$$

记录旋转增量 $\Delta R_{\text{pelvis}} = R_{\text{ret}} \cdot R_{\text{tgt,init}}^{-1}$，供 `RunIKRigOp` 修正 Goal 旋转时使用。

**平移重定向**有两种运动模型，逐轴混合：

- **按比例缩放**（默认）：把源位置归一化到源高度，再乘目标高度——

$$
\mathbf{p}_{\text{scaled}} = \frac{\mathbf{p}_{\text{src,cur}}}{H_{\text{src}}} \cdot H_{\text{tgt}}
$$

- **绝对增量**：直接搬源位移增量——

$$
\mathbf{p}_{\text{abs}} = \mathbf{p}_{\text{tgt,init}} + (\mathbf{p}_{\text{src,cur}} - \mathbf{p}_{\text{src,init}})
$$

- **混合**：$\mathbf{p} = \text{Lerp}(\mathbf{p}_{\text{scaled}},\,\mathbf{p}_{\text{abs}},\,\text{BlendToAbsoluteOffset})$。

**裆部地面约束**（当源骨盆低于参考高度时，按裆高比例压低目标骨盆）：

$$
h_{\text{crotch,src}} = \mathbf{p}_{\text{src,cur}}.z - C_{\text{src}}, \quad h_{\text{crotch,init}} = \mathbf{p}_{\text{src,init}}.z - C_{\text{src}}
$$

$$
\text{pct} = \frac{h_{\text{crotch,src}}}{\max(1,\,h_{\text{crotch,init}})}, \quad h_{\text{crotch,tgt}} = (\mathbf{p}_{\text{tgt,init}}.z - C_{\text{tgt}}) \cdot \text{pct}
$$

$$
z_{\text{constrained}} = h_{\text{crotch,tgt}} + C_{\text{tgt}}
$$

可选地面衰减：当目标骨盆接近参考站立高度时不施加约束，避免压扁正常站立。最终 $z = \text{Lerp}(z,\,z_{\text{constrained}},\,w_{\text{final}})$。

之后的流程：向源位置混合（`BlendToSourceTranslation`）→ 垂直/水平缩放 → 全局偏移 → 旋转后的局部偏移 → `TranslationAlpha` 混合。记录平移增量 $\Delta\mathbf{p}_{\text{pelvis}} = \mathbf{p}_{\text{final}} - \mathbf{p}_{\text{ret}}$，供 IK Goal Op 通过 `GetPelvisTranslationOffset()` 与 `GetAffectIKWeightAsVector()` 修正 Goal 位置——这正是 `RunIKRigOp` 中 `InvRootModification` 的来源。

### 3.2 RootMotionGeneratorOp —— 根运动生成

根骨骼（区别于骨盆）承载角色在世界中的位移。该 Op 有两种运动来源（`ERootMotionSource`）：

- **CopyFromSourceRoot**：从源根复制，但按骨盆缩放因子缩放位移。
- **GenerateFromTargetPelvis**：从已重定向的目标骨盆生成根运动。

**参数**：`SourceRoot`/`TargetRoot`/`TargetPelvis`（骨骼）、`bRotateWithPelvis`（是否随骨盆旋转）、`RootHeightSource`（CopyHeightFromSource / SnapToGround）、`GlobalOffset`（`FTransform`）、`bMaintainOffsetFromPelvis`（默认 true）、`bPropagateToNonRetargetedChildren`（默认 true）。

**CopyFromSourceRoot 模式**：

$$
\Delta R_{\text{root}} = R_{\text{src,cur}} \cdot R_{\text{src,init}}^{-1}, \quad R_{\text{out}} = \Delta R_{\text{root}} \cdot R_{\text{tgt,init}}
$$

位移增量按骨盆全局缩放缩放：

$$
\Delta\mathbf{p} = (\mathbf{p}_{\text{src,cur}} - \mathbf{p}_{\text{src,init}}) \cdot \mathbf{s}_{\text{pelvis}}
$$

若 `SnapToGround` 则 $z=0$。

**GenerateFromTargetPelvis 模式**：若 `bMaintainOffsetFromPelvis`，根 = 参考姿态中根相对骨盆的变换 × 当前骨盆全局变换；否则根直接等于骨盆。若 `!bRotateWithPelvis`，把旋转重置为参考姿态根旋转（避免骨盆偏航带歪根）。

**子骨骼传播**：若 `bPropagateToNonRetargetedChildren`，计算新旧根的相对变换 $\Delta = T_{\text{old}}^{-1} \cdot T_{\text{new}}$，对所有"未被重定向链包含"的根子骨骼施加 $\mathbf{p}_i \leftarrow \mathbf{p}_i \cdot \Delta$，使道具骨、武器骨等跟随根移动。最后应用 `GlobalOffset`。

> 注：源码中还存在一个旧版 `URootMotionGeneratorOp`（UObject 形式），标注 `BEGIN DEPRECATED UOBJECT-based OP`，仅用于老资产通过 `ConvertToInstancedStruct` 迁移到新版 `FIKRetargetRootMotionOp`，不属于活跃 Op。

### 3.3 ScaleSourceOp —— 源姿态整体缩放

单例 Op。`Run()` 留空——处理器在送入源姿态前读取本 Op 设置并调用 `FRetargetPoseScaleWithPivot::ScalePose` 做整体缩放。

**参数**：`SourceScaleFactor`（0.01–∞，默认 1）、`ScalePivot`（ComponentOrigin / Bone，默认 ComponentOrigin）、`ScalePivotBone`、`bProjectScalePivotToFloor`（默认 false，把枢轴投影到 $z=0$）。

**数学**（绕枢轴 $\mathbf{c}$ 的均匀缩放）：

$$
\mathbf{p}_i' = \mathbf{c} + (\mathbf{p}_i - \mathbf{c}) \cdot k
$$

对源骨架每个骨骼的平移施加此式。这影响后续所有 Op 看到的源姿态与全部 IK Goal，是处理"源骨架单位不对"的利器。

### 3.4 RetargetPoseOp —— 重定向姿态选择

单例 Op，`Run()` 同样留空——处理器在初始化骨架时读取本 Op 设置，决定用哪套重定向姿态。重定向姿态是用户为每个骨架调好的"对齐基准"，决定了旋转增量与缩放因子的参考。

**参数**：`bOverrideSourcePose`（默认 false）+ `SourcePoseToUse`（`FName`）、`bOverrideTargetPose`（默认 false）+ `TargetPoseToUse`。不勾选则用资产默认姿态。

---

## 四、FK 链重定向：FKChainsOp

`FKChainsOp` 是最复杂的 Op，负责在 IK 求解前把源链的"形状"（旋转+平移+缩放）迁移到目标链。它维护**自己的链映射表**（`FRetargetChainMapping`），允许与主映射不同的源/目标链配对。

**每链参数**（`FRetargetFKChainSettings`）：

- `EnableFK`（默认 true）。
- `RotationMode`（`EFKChainRotationMode`，默认 Interpolated）：None / Interpolated / OneToOne / OneToOneReversed / MatchChain / MatchScaledChain / CopyLocal。
- `RotationAlpha`（0–1，默认 1）。
- `TranslationMode`（`EFKChainTranslationMode`，默认 None）：None / GloballyScaled / Absolute / StretchBoneLengthUniformly / StretchBoneLengthNonUniformly / OrientAndScale。
- `TranslationAlpha`（0–1，默认 1）。

**Op 参数**：`IKRigAsset`、`ChainsToRetarget`、调试绘制开关。

### 4.1 链参数化与编码

每条链按骨骼在链中的累积长度归一化为参数 $u \in [0,1]$（`BoneChain->Params`）。`FChainEncoderFK::EncodePose` 把源链当前全局变换拷出并计算局部变换。

为消除源/目标链父骨骼朝向错位带来的"倾斜"，解码前先把整条源链刚体变换到目标链父的当前朝向：

$$
\Delta T_{\text{parent}} = T_{\text{src,parent,init}} \cdot T_{\text{tgt,parent,init}}^{-1}
$$

$$
T_{\text{src,parent}} = \Delta T_{\text{parent}} \cdot T_{\text{tgt,parent,cur}}
$$

再把源链各骨骼局部变换接到这个新父上重算全局，保证后续旋转迁移在"对齐"的局部空间进行。

### 4.2 旋转重定向（RetargetRotation）

核心是"旋转增量迁移"：先取源骨骼的当前/参考全局旋转，算增量，再叠到目标参考旋转上：

$$
\Delta R = R_{\text{src,cur}} \cdot R_{\text{src,init}}^{-1}, \quad R_{\text{out}} = \Delta R \cdot R_{\text{tgt,init}}
$$

各模式区别在于如何选取 $R_{\text{src,cur}}/R_{\text{src,init}}$：

- **Interpolated / MatchChain / MatchScaledChain**：按目标骨骼的参数 $u$ 在源链上插值取变换（`GetTransformAtChainParam`），适合源/目标链骨骼数不同的情况。
- **OneToOne**：按下标一一对应，目标更长则多余骨骼保持参考姿态。
- **OneToOneReversed**：从链尾开始对应。
- **None**：不做旋转，链随父刚体转动（用链首参考局部 × 父当前全局）。
- **CopyLocal**：取最近源骨骼的局部旋转增量 $\Delta R_{\text{local}} = R_{\text{src,cur,local}} \cdot R_{\text{src,init,local}}^{-1}$，叠到目标局部参考旋转上，再转到全局：$R_{\text{out}} = R_{\text{parent,global}} \cdot (\Delta R_{\text{local}} \cdot R_{\text{tgt,init,local}})$。不做真正的重定向，仅搬局部增量。

### 4.3 平移重定向（RetargetPosition）

各模式决定目标骨骼相对父的位置：

- **None**：用目标重定向姿态的局部偏移，父全局变换后得到位置。
- **GloballyScaled**：直接用源骨骼全局位置乘骨盆全局缩放 $\mathbf{s}$。
- **Absolute**：直接用源骨骼全局位置。
- **StretchBoneLengthUniformly**：按整链拉伸比均匀拉伸局部偏移——

$$
r = \frac{L_{\text{src,cur}}}{L_{\text{src,init}}}, \quad \mathbf{p}_{\text{out}} = T_{\text{parent}}(\mathbf{o}_{\text{tgt,local}} \cdot r)
$$

- **StretchBoneLengthNonUniformly**：按该骨骼参数 $u$ 处的局部拉伸比 $r(u)$ 拉伸（`GetStretchAtParam`），允许链各段拉伸不同。
- **OrientAndScale**：最精细的模式，"定向并缩放"。用初始化时缓存的源/目标参考骨骼方向与长度、以及 FromTo 旋转增量 $\Delta R_{\text{ref}} = \text{FindBetween}(\hat{\mathbf{d}}_{\text{src,init}}, \hat{\mathbf{d}}_{\text{tgt,init}})$：

$$
k = \frac{|\mathbf{v}_{\text{src,cur}}|}{L_{\text{src,ref}}}, \quad \mathbf{o} = \hat{\mathbf{v}}_{\text{src,cur}} \cdot (L_{\text{tgt,ref}} \cdot k)
$$

再把参考方向差旋转叠上：$\mathbf{o}' = \bigl((\Delta R_{\text{ref}} \cdot R_{\text{out}}) \cdot R_{\text{out}}^{-1}\bigr) \cdot \mathbf{o}$。当参考骨长过短（< 0.1）时退化为加性偏移，避免除零。

### 4.4 缩放重定向（RetargetScale）

加性增量迁移：

$$
\mathbf{s}_{\text{out}} = \mathbf{s}_{\text{src,cur}} + (\mathbf{s}_{\text{tgt,init}} - \mathbf{s}_{\text{src,init}})
$$

### 4.5 MatchChain —— 样条 IK 式链形匹配

当 `RotationMode` 为 MatchChain / MatchScaledChain 时，在常规重定向结果之上再做一次"摆动旋转对齐"：

1. 把源链当前各骨骼位置当作线性样条控制点，整体平移到目标链起点。
2. 若 MatchScaledChain，按当前源/目标链长比缩放样条点：$\mathbf{q}_i = \mathbf{o} + (\mathbf{q}_i - \mathbf{o}) \cdot (L_{\text{src}}/L_{\text{tgt}})$。
3. 对目标链每个骨骼，以其骨长为距离，在样条上找到对应瞄准点（`GetPointOnSplineDistanceFromPoint`，内部用点到射线的勾股定理求最近点）。
4. 生成从当前骨向量到瞄准方向的摆动旋转 $R_{\text{swing}} = \text{FindBetween}(\hat{\mathbf{b}},\,\hat{\mathbf{a}})$，左乘到该骨旋转。
5. 把末端位移增量传播到后续所有链内骨骼。

这样目标链的骨骼会逐个"贴"到源链样条上，实现形状精确匹配，同时保留插值阶段已有的扭转信息。

### 4.6 最终混合（BlendByAlpha）

全链重定向后，在局部空间按 `RotationAlpha`/`TranslationAlpha` 在"重定向姿态"与"重定向结果"间混合，再转回全局写出。

此外 Op 还处理"中间父骨骼"：链与链之间未被重定向的骨骼（如颈骨位于头链与脊链之间）需在解码前更新，否则会停留在旧位置。

---

## 五、骨骼/链变换 Op

### 5.1 CopyBasePoseOp —— 按名复制源局部变换

单例 Op。直接把源骨架的局部变换按骨骼名复制到目标，**不做任何重定向**。

**参数**：`bCopyBasePose`（默认 true）、`CopyFromStart`（`FBoneReference`，从哪个源骨骼开始复制）、`BonesToExclude`（排除骨骼数组）。

**数学**：

$$
T_{\text{src,local}} = T_{\text{src,global}} \cdot T_{\text{src,parent,global}}^{-1}
$$

$$
T_{\text{tgt,global}} = T_{\text{src,local}} \cdot T_{\text{tgt,parent,global}}
$$

适用于源/目标骨架骨骼命名一致、希望完全照搬姿态的场景。

### 5.2 PinBoneOp —— 骨骼钉扎/跟随

把目标骨骼"钉"到另一个骨骼（源或目标）上，使其跟随该骨骼的运动。

**参数**：`BonesToPin`（数组，每项含 `BoneToCopyFrom`/`BoneToCopyTo`）、`SkeletonToCopyFrom`（Source/Target，默认 Target）、`bCopyTranslation`（默认 true）+ `TranslationMode`（5 种枚举）、`bCopyRotation`（默认 true）+ `RotationMode`（2 种枚举）、`bCopyScale`（默认 true）、`bPropagateToChildren`（默认 false）、`GlobalOffset`/`LocalOffset`（`FTransform`）。

**平移模式**：

- **CopyGlobalPosition**：直接取源骨全局位置。
- **CopyGlobalPositionAndMaintainOffset**：保持参考姿态中两骨的相对变换，源动则目标按相对关系跟随。
- **CopyLocalPosition**：取源骨局部位置。
- **CopyLocalPositionRelativeOffset**：在目标局部位置上叠加源/目标参考骨长差。
- **CopyLocalPositionRelativeScaled**：按骨长比缩放局部位置。

**旋转模式**：

- **CopyGlobalRotation**：直接取源骨全局旋转。
- **MaintainOffsetFromBoneToCopyFrom**：增量迁移——$\Delta R = R_{\text{src,cur}} \cdot R_{\text{src,ref}}^{-1}$，$R_{\text{out}} = \Delta R \cdot R_{\text{tgt,ref}}$。

最终结果叠加偏移：$T_{\text{out}} = T_{\text{local}} \cdot (T_{\text{new}} \cdot T_{\text{global}})$。

### 5.3 StretchChainOp —— 链长拉伸

独立 Op，有自己的链映射。把目标链拉长/压缩以匹配源链长度，再乘一个缩放系数。

**每链参数**：`TargetChainName`、`bEnabled`（默认 false）、`MatchSourceLength`（0–1，默认 0）、`ScaleChainLength`（默认 1）。

**Op 参数**：`IKRigAsset`、`ChainsToStretch`。

**数学**：

$$
L_{\text{tgt,cur}} = \sum_i |\mathbf{p}_{i+1} - \mathbf{p}_i|, \quad L_{\text{src,cur}} = \sum_i |\mathbf{p}_{i+1}^{\text{src}} - \mathbf{p}_i^{\text{src}}|
$$

$$
L_{\text{match}} = \text{Lerp}(L_{\text{tgt,cur}},\, L_{\text{src,cur}},\, \text{MatchSourceLength}), \quad k = \frac{L_{\text{match}}}{L_{\text{tgt,cur}}} \cdot \text{ScaleChainLength}
$$

对链内每根骨（从第二根起），保持骨向量方向、缩放长度：

$$
\mathbf{v}_i' = (\mathbf{p}_i - \mathbf{p}_{i-1}) \cdot k, \quad \mathbf{p}_i' = \mathbf{p}_{i-1}' + \mathbf{v}_i'
$$

最后用保存的子骨骼局部变换重算子骨骼全局变换，使附属骨骼跟随。

### 5.4 AdditivePoseOp —— 叠加重定向姿态增量

把重定向姿态（`RetargetPose`）相对于参考姿态的增量叠加到当前目标姿态上。

**参数**：`PoseToApply`（`FName`，用哪套重定向姿态）、`Alpha`（0–1，默认 1）。

**数学**：骨盆平移直接加根平移增量；每根骨的旋转增量为 $\Delta R = R_{\text{retarget}} \cdot R_{\text{ref}}^{-1}$，若 $\alpha \ne 1$ 则 $\Delta R = \text{FastLerp}(I,\,\Delta R,\,\alpha)$，局部旋转左乘：$R_{\text{local}}' = \Delta R \cdot R_{\text{local}}$，再重算全局。

### 5.5 FilterBoneOp —— 旋转的 One Euro 滤波

对指定骨骼的全局旋转做时域平滑，消除抖动。

**参数**：`BonesToFilter`（目标骨骼数组）、`Alpha`（默认 1）、`FilterSettings`（`FOneEuroFilterSettings`）、`bResetPlayback`（默认 true）。

**数学**：对每根目标骨，用 `FOneEuroQuatFilter::Update`（见第二节）得到滤波旋转，再用 `FastLerp` 在原始旋转与滤波旋转间按 $\alpha$ 混合，最后 `SetGlobalTransformAndUpdateChildren` 写回并传播子骨骼。回放重置时清空滤波器历史，避免跨片段串扰。

---

## 六、IK Goal Op：RunIKRigOp 及其子 Op

`RunIKRigOp` 是唯一可挂子 Op 的 IK Op。它本身完成"基于链的 Goal 重定向"，子 Op 则在 IK 求解前后调整 Goal。

### 6.1 RunIKRigOp —— IK 求解父 Op

**每链参数**（`FIKRetargetRunIKRigChainSettings`）：`TargetChainName`、`bEnableIK`（默认 true）、`ChainPositionAlpha`（0–1，默认 1）、`ChainRotationAlpha`（0–1，默认 1）、`bOverrideGoalAlpha`（默认 false）、`FinalPositionAlpha`/`FinalRotationAlpha`（0–1，默认 1）。

**Op 参数**：`Chains`、`IKRigAsset`、调试绘制开关。

**链式 Goal 位置重定向**（`FRunIKRigChain::Run`，在 `RunBeforeChildren` 中）：

源链当前向量与归一化长度（反映肢体伸展程度）：

$$
\mathbf{v} = \mathbf{p}_{\text{src,end}} - \mathbf{p}_{\text{src,start}}, \quad \hat{\mathbf{v}} = \mathbf{v}/|\mathbf{v}|, \quad l_{\text{norm}} = |\mathbf{v}| / L_{\text{src,init}}
$$

骨盆修改对 IK 的反向修正（已影响 IK 的部分不重复计入）：

$$
\mathbf{w}_{\text{inv}} = \mathbf{1} - \mathbf{w}_{\text{affectIK}}, \quad \mathbf{m}_{\text{inv}} = \Delta\mathbf{p}_{\text{pelvis}} \cdot \mathbf{w}_{\text{inv}}
$$

$$
\mathbf{p}_{\text{start}} = \mathbf{p}_{\text{tgt,start}} - \mathbf{m}_{\text{inv}}
$$

Goal 位置 = 目标链起点 + 源方向（按伸展度缩放）× 目标链初始长度：

$$
\mathbf{p}_{\text{goal}} = \mathbf{p}_{\text{start}} + (\hat{\mathbf{v}} \cdot l_{\text{norm}}) \cdot L_{\text{tgt,init}}
$$

$$
\mathbf{p}_{\text{goal}} = \text{Lerp}(\mathbf{p}_{\text{goal,old}},\, \mathbf{p}_{\text{goal}},\, \alpha_{\text{pos}})
$$

**链式 Goal 旋转重定向**：

$$
\Delta R = R_{\text{src,end,cur}} \cdot R_{\text{src,end,init}}^{-1}, \quad R_{\text{goal}} = \Delta R \cdot R_{\text{tgt,end,init}}
$$

之后 `Run()` 调用 `IKRigProcessor::Solve()` 求解，写回输出姿态。

### 6.2 OffsetGoalsOp —— Goal 位置/旋转偏移

为每条 IK 链的 Goal 施加局部/全局平移与旋转偏移。

**每链参数**：`Alpha`（默认 1）、`GlobalTranslationOffset`/`LocalTranslationOffset`（`FVector`）、`GlobalRotationOffset`/`LocalRotationOffset`（`FRotator`）。

**Op 参数**：`Chains`、`Alpha`（默认 1）、`TranslationAlpha`/`RotationAlpha`（默认 1）。

**旋转**：先局部后全局——

$$
R_{\text{goal}}' = R_{\text{global}} \cdot R_{\text{goal}} \cdot R_{\text{local}}
$$

再按 $\alpha = \alpha_{\text{chain}} \cdot \alpha_{\text{op}} \cdot \alpha_{\text{rot}}$ 混合：$R = \text{Lerp}(R_{\text{goal}}, R_{\text{goal}}', \alpha)$。

**平移**：

$$
\mathbf{p}_{\text{goal}}' = \mathbf{p}_{\text{goal}} + \mathbf{o}_{\text{global}} + R_{\text{goal}} \cdot \mathbf{o}_{\text{local}}
$$

按 $\alpha = \alpha_{\text{chain}} \cdot \alpha_{\text{op}} \cdot \alpha_{\text{trans}}$ 混合。

### 6.3 ScaleGoalsOp —— Goal 位置缩放

对 Goal 位置做水平/垂直/沿链方向缩放。

**每链参数**：`ScaleVertical`（默认 1）、`ScaleHorizontal`（默认 1）、`ScaleAlongChain`（默认 1）。

**Op 参数**：`Chains`、`Alpha`（默认 1）。

**数学**：

$$
\mathbf{p}' = \mathbf{p} \cdot (s_h,\, s_h,\, s_v)
$$

$$
\mathbf{p}'' = \mathbf{p}_{\text{start}} + (\mathbf{p}' - \mathbf{p}_{\text{start}}) \cdot s_{\text{chain}}
$$

按 $\alpha_{\text{op}}$ 混合。$s_{\text{chain}}$ 以链起点为枢轴缩放，可制造"伸手更远/更近"的效果。

### 6.4 BlendToSourceOp —— Goal 混合回源

把目标 Goal 向源骨骼实际位置混合，常用于"目标链比例差异大时部分回退到源运动"。

**每链参数**：`BlendToSource`（0–1，默认 0）、`TranslationAlpha`（默认 1）、`RotationAlpha`（默认 0）、`TranslationPerAxisAlpha`（`FVector`，默认 1）、`ApplyPelvisOffset`（0–1，默认 0）。

**Op 参数**：`Chains`、`Alpha`（默认 1）、`DebugDrawSize`。

**数学**：最终位置权重 $\alpha_p = \text{BlendToSource} \cdot \alpha_{\text{trans}} \cdot \alpha_{\text{op}}$，逐轴：

$$
\mathbf{p}_{\text{goal}} = \text{Lerp}(\mathbf{p}_{\text{goal}},\, \mathbf{p}_{\text{src}},\, \alpha_p \cdot \mathbf{w}_{\text{perAxis}})
$$

旋转增量迁移：$\Delta R = R_{\text{src,cur}} \cdot R_{\text{src,init}}^{-1}$，$R_{\text{new}} = \Delta R \cdot R_{\text{tgt,init}}$，按 $\alpha_r$ 混合。

### 6.5 AlignPoleVectorOp —— 极向量对齐

IK 求解器的极向量（Elbow/Knee 朝向）若在源/目标间不一致，会导致关节弯曲方向错误。本 Op 对齐极向量方向。

**每链参数**：`bEnabled`、`AlignAlpha`（0–1，默认 1）、`StaticAngularOffset`（±180°，默认 0）、`MaintainOffset`（默认 false）。

**Op 参数**：`IKRigAsset`、`ChainsToAlign`、`Alpha`（默认 1）。

**数学**：对每条链，先找链上与链轴差异最大的轴作为"极轴"（`CalculateBestPoleAxisForChain`），再求源/目标的极向量（极轴投影到与链法向量正交的平面后归一化）：

$$
\mathbf{p}_{\text{pole}} = \text{Normalize}\bigl(\text{ProjectPlane}(\hat{\mathbf{a}},\, \hat{\mathbf{n}}_{\text{chain}})\bigr)
$$

匹配角为源/目标极向量夹角，减去参考姿态偏移（若 `MaintainOffset`）：

$$
\theta = \arccos(\mathbf{p}_{\text{src}} \cdot \mathbf{p}_{\text{tgt}}) - \theta_{\text{ref}}
$$

绕链轴旋转 $\theta$ 并按 `AlignAlpha` 衰减，再叠加静态偏移角，左乘到链根骨骼旋转：

$$
R_{\text{base}} = \text{FastLerp}(I,\, Q(\hat{\mathbf{n}}_{\text{chain}},\,\theta),\,\alpha_{\text{align}}) \cdot Q(\hat{\mathbf{n}}_{\text{chain}},\,\theta_{\text{static}}) \cdot R_{\text{base}}
$$

### 6.6 WeaponGoalsOp —— 双手武器/道具瞄准

专门处理双手持枪/持道具的姿态：缩放武器骨、把"持枪根"钉到主导手、把另一只手的 Goal 拉到辅助手 IK 骨。

**参数**：9 个骨骼引用（默认为 UE 骨骼约定名 `weapon_l/r`、`hand_attach_l/r`、`hand_l/r`、`ik_hand_l/r`、`ik_hand_gun`）、`Alpha`（默认 1）、`bEnableWeaponScale`（默认 true）、`WeaponScale`（默认 1）、`bSnapIKHandGun`（默认 true）、`LeftRightHandIKAlpha`（0–1，默认 1）、`LeftHandIKAlpha`/`RightHandIKAlpha`（0–1，默认 1）、`bSuppressMissingBoneWarnings`。

**数学**：

- **武器缩放**：$k = \text{Lerp}(1,\, \text{WeaponScale},\, \alpha)$，对 5 根武器骨 `SetScale3D` 并传播子骨骼。
- **持枪根钉扎**：$\mathbf{p} = \text{Lerp}(\mathbf{p}_{\text{handL}},\, \mathbf{p}_{\text{handR}},\, \alpha_{\text{lr}} \cdot \alpha)$，设到 `ik_hand_gun` 并传播。
- **Goal 拉到 IK 手骨**：对每只手 Goal，$\mathbf{p}_{\text{goal}} = \text{Lerp}(\mathbf{p}_{\text{goal}},\, \mathbf{p}_{\text{ikHand}},\, \alpha_{\text{hand}} \cdot \alpha)$，旋转同理 `FastLerp`。

### 6.7 StrideWarpingOp —— 步幅/横向扭曲

根据角色面朝方向，沿前向/侧向轴扭曲 IK Goal 位置，用于调整步幅长度与横向间距。

**每链参数**：`TargetChainName`、`EnableStrideWarping`（默认 true）、`Alpha`（默认 1）。

**Op 参数**：`ChainSettings`、`Alpha`（默认 1）、`DirectionSource`（Goals/Chain/RootBone，默认 Goals）、`ForwardDirection`（`EBasicAxis`，默认 Y）、`DirectionChain`、`WarpForwards`（默认 1）、`SidewaysOffset`（默认 0）、`WarpSplay`（默认 1）。

**面朝方向求解**：

- **Goals**：收集所有 Goal 的参考位置与当前位置（投影到 $z=0$），用 `GetRotationFromDeformedPoints` 做点集"最佳拟合"旋转，质心作为身体位置。
- **Chain**：用 `DirectionChain` 的骨骼，多骨时取链首到链尾向量，单骨时用骨旋转后的前向轴；质心取各骨均值。
- **RootBone**：用根骨参考到当前的旋转增量作用到前向轴。

前向/侧向轴：$\hat{\mathbf{f}} = T_{\text{body}} \cdot \hat{\mathbf{f}}_0$，$\hat{\mathbf{s}} = \hat{\mathbf{f}} \times \hat{\mathbf{z}}$。

**前向扭曲**：把 Goal 在过"参考位置当前映射点"的前向法平面上投影，缩放其偏离量：

$$
\mathbf{p}_{\text{proj}} = \text{ProjectPlane}(\mathbf{p}_{\text{goal}},\, \hat{\mathbf{f}})
$$

$$
\mathbf{p}_{\text{warp}} = \mathbf{p}_{\text{proj}} + (\mathbf{p}_{\text{goal}} - \mathbf{p}_{\text{proj}}) \cdot \text{WarpForwards}
$$

**横向偏移**：按 Goal 在参考姿态中相对侧向轴的符号向侧向推移：

$$
\mathbf{p}_{\text{warp}} \mathrel{+}= \hat{\mathbf{s}} \cdot \text{SidewaysOffset} \cdot \text{sign}(\hat{\mathbf{p}}_{\text{init}} \cdot \hat{\mathbf{s}}_0)
$$

**外扩/内收（Splay）**：以身体位置（$z$ 取 Goal 高度）为枢轴缩放：

$$
\mathbf{p}_{\text{warp}} = \mathbf{o}_{\text{splay}} + (\mathbf{p}_{\text{warp}} - \mathbf{o}_{\text{splay}}) \cdot \text{WarpSplay}
$$

最终按 $\alpha$ 混合，并把 Goal 空间设为 Component。

### 6.8 SpeedPlantingOp —— 速度种植

当源末端骨骼速度（由动画曲线 `SpeedCurveName` 提供）低于阈值时，把 IK Goal "种"在固定位置；速度恢复后让 Goal 平滑追上动画。这是消除脚部滑动（foot sliding）的关键 Op。

**每链参数**：`TargetChainName`、`Alpha`（默认 1）、`SpeedCurveName`。

**Op 参数**：`ChainsToSpeedPlant`、`Alpha`（默认 1）、`SpeedThreshold`（默认 15 cm/s）、`BlendMethod`（Spring / MoveTowards）、`MaxBlendSpeed`（默认 900，MoveTowards）、`TimeToMaxSpeed`（默认 0.2s）、`ArrivalSpeedGain`（默认 10）、`SpringStrength`（默认 3 Hz）。

**种植判定**：$\text{planted} = (v_{\text{curve}} < \text{SpeedThreshold})$。目标位置在种植时取固定点 $\mathbf{p}_{\text{plant}}$，否则取当前 Goal 位置。

**Spring 模式**：用临界阻尼弹簧 `VectorSpringInterp`，刚度换算为 $\omega^2 = (\text{SpringStrength} \cdot 2\pi)^2$，阻尼系数 1.0（临界）。

**MoveTowards 模式**：更具追踪精度的方案。

1. 估计动画速度 $\mathbf{v}_{\text{tgt}} = (\mathbf{p}_{\text{goal}} - \mathbf{p}_{\text{last}})/\Delta t$。
2. 若已追踪：$\mathbf{p}_{\text{cur}} = \mathbf{p}_{\text{target}}$。
3. 否则计算追上所需的额外速度，受"最大追速"与"到达制动"双重限制：

$$
v_{\text{boost,max}} = \max(0,\, \text{MaxBlendSpeed} - |\mathbf{v}_{\text{tgt}}|)
$$

$$
v_{\text{boost,dist}} = d \cdot \text{ArrivalSpeedGain} \quad (\text{随距离 } d \to 0 \text{ 衰减，起制动})
$$

$$
a_{\text{time}} = \text{clamp}(t/\text{TimeToMaxSpeed},\,0,\,1)^2 \quad (\text{起飞加速})
$$

$$
v_{\text{boost}} = \min(a_{\text{time}} \cdot v_{\text{boost,max}},\, v_{\text{boost,dist}})
$$

$$
\mathbf{v}_{\text{desired}} = \mathbf{v}_{\text{tgt}} + \hat{\mathbf{d}} \cdot v_{\text{boost}}, \quad \mathbf{p}_{\text{cur}} \mathrel{+}= \mathbf{v}_{\text{desired}} \cdot \Delta t
$$

若步长超过剩余距离则到达，转为 1:1 追踪。最终按 $\alpha$ 混合 Goal 位置。

> 历史兼容：5.8 的旧参数 `Stiffness` 在 `PostLoad` 中按 $\text{SpringStrength} = \sqrt{\text{Stiffness}}/(2\pi)$ 转换（因 $\omega^2 = \text{Stiffness}$，故 $\omega = \sqrt{\text{Stiffness}}$，而 `SpringStrength` 以 Hz 给出 $\omega = 2\pi f$）。

### 6.9 FloorConstraintOp —— 地面/脚趾约束

两阶段 Op：`Run`（IK 求解前）调整 Goal 高度贴地 + 抬脚离地；`RunAfterParent`（IK 求解后）弯曲脚趾使其不穿地。其脚趾求解用到了优美的 **Rodrigues 旋转公式**。

**每链参数**（`FFloorConstraintChainSettings`）：`TargetChainName`、`EnableFloorConstraint`（默认 false）、`Alpha`（默认 1）、`MaintainHeightOffset`（0–1，默认 0）、`bUseFoot`/`bUseToes`、`Foot`（`FFloorConstraintFootDefinition`）、`Toes`（`FFloorConstraintToesDefinition`）。

**Op 参数**：`ChainsToAffect`、`Alpha`（默认 1）、`HeightFalloffOffset`（默认 8 cm）、`HeightFalloffDistance`（默认 20 cm）。

**脚部定义**（`Foot`）：`MedialOffset`/`LateralOffset`/`HeelOffset`/`ToeOffset`（均默认 10 cm）、`VerticalOffset`（默认 0）。脚被建模为踝关节在地面投影点出发的 4 点四边形（前内、前外、后内、后外）。

**趾部定义**（`Toes`）：`Alpha`（默认 1）、`Responsiveness`（默认 0.02）、`CutoffFrequency`（默认 8 Hz）、`VelocityCutoffFrequency`（默认 1.0 Hz）、`AllToes` 数组（每趾：`ToeBone`、`Length`、`YawOffset`、`VerticalOffset`）。

**Goal 高度贴地**（`Run`）：当源骨高度 $h_{\text{src}}$ 低于衰减终点 $h_{\text{end}} = h_{\text{start}} + \text{FalloffDistance}$ 时按衰减权重把 Goal 高度拉向源骨高度（可选叠加参考姿态高度差）：

$$
w = \text{falloff}(h_{\text{src}}) \cdot \alpha_{\text{chain}} \cdot \alpha_{\text{op}}, \quad z_{\text{goal}} = \text{Lerp}(z_{\text{goal}},\, h_{\text{src}} + \text{offset},\, w)
$$

**脚离地**：4 点中取最低点，若 $z < 0$ 则把 Goal 上抬 $|z|$。

**脚趾弯曲求解**（`CalcToeCorrectionAngle`，`RunAfterParent`）：把脚趾尖绕脚趾关节（Pitch 轴 $\hat{\mathbf{k}}$）旋转，求使趾尖落在地面（$z=0$）的角 $\theta$。设骨向量 $\mathbf{r} = \mathbf{p}_{\text{end}} - \mathbf{p}_{\text{start}}$，由 Rodrigues 公式旋转后的 $z$ 分量为：

$$
z(\theta) = A\cos\theta + B\sin\theta + C
$$

其中 $A = r_z - k_z(\hat{\mathbf{k}}\cdot\mathbf{r})$、$B = (\hat{\mathbf{k}}\times\mathbf{r})_z$、$C = k_z(\hat{\mathbf{k}}\cdot\mathbf{r}) + p_{\text{start},z}$。要求 $z(\theta) = 0$，即：

$$
A\cos\theta + B\sin\theta + C = 0
$$

利用 $A\cos\theta + B\sin\theta = R\cos(\theta - \varphi)$，其中 $R = \sqrt{A^2+B^2}$、$\varphi = \text{atan2}(B,A)$，解出：

$$
\theta = \varphi \pm \arccos\!\left(\frac{-C}{R}\right)
$$

取最小的正解（脚趾只向上弯，不向后翻），用 One Euro Filter 平滑后构造 $Q(\hat{\mathbf{k}},\,\theta)$ 左乘到趾骨旋转并传播子骨骼。源码中这段求解附有完整推导注释，是引擎中难得的"数学教科书式"代码。

---

## 七、曲线 Op

动画曲线（驱动形态键、材质参数等）在重定向时也需要迁移，由曲线 Op 负责。

### 7.1 RetargetCurvesOpBase —— 曲线 Op 抽象基类

`FIKRetargetCurvesOpBase` 是抽象基类（`IsAbstract() = true`，单例）。它本身不做工作——`Initialize()`/`Run()` 均为空实现，但定义了曲线处理的契约：

- `HasCurveProcessing()`：标识本 Op 是否处理曲线。
- `ProcessAnimSequenceCurves(...)`：批量导出动画时对逐帧曲线数据做处理的回调，默认把输入搬到输出。
- `AnimGraphPreUpdateMainThread` / `AnimGraphEvaluateAnyThread`：运行时在游戏线程/工作线程上处理曲线的钩子。
- `bTakeInputCurvesFromSourceAnimInstance`：当存在多个曲线 Op 时，仅第一个应从源动画实例取输入，后续从当前姿态上下文取。

由于抽象，用户不能直接添加它，只能添加其派生 Op（目前仅 `CurveRemapOp`）。

### 7.2 CurveRemapOp —— 曲线复制/重映射

单例 Op，派生自 `RetargetCurvesOpBase`。同样不在 `Run()` 中工作，而是通过回调被动画节点调用。

**参数**：`bCopyAllSourceCurves`（默认 true）、`bRemapCurves`（默认 true）、`CurvesToRemap`（`FCurveRemapPair` 数组，每项含 `SourceCurve`/`TargetCurve`）。

**运行时逻辑**（`AnimGraphEvaluateAnyThread`）：

- 若 `bCopyAllSourceCurves`，先把源全部曲线拷到输出。
- 若 `bRemapCurves`，对每对 `(SourceCurve, TargetCurve)`：读源曲线值，以 `TargetCurve` 名写入输出（`Combine` 合并）。这样可把驱动源骨架形态键的曲线，重定向到目标骨架不同名的形态键上。

**批量导出逻辑**（`ProcessAnimSequenceCurves`）：若 `bCopyAllSourceCurves` 则原样搬所有曲线数据；否则只搬重映射涉及的。再对每对把源数据写到目标名下（已存在则覆盖，不存在则追加）。

默认情况下 IK Retargeter 会自动复制同名曲线，只有当目标曲线名不同时才需要配置重映射对。

---

## 八、参数速查与设计要点

### 8.1 Alpha 的层级叠加

几乎所有 Op 都遵循"链 Alpha × Op Alpha（× 子项 Alpha）"的乘法叠加。例如 `FloorConstraintOp` 的趾弯曲权重：

$$
\alpha_{\text{final}} = \alpha_{\text{toes}} \cdot \alpha_{\text{chain}} \cdot \alpha_{\text{op}}
$$

设计 Op 时应保持这一约定，使层级控制一致。

### 8.2 增量迁移范式

旋转重定向几乎都采用"参考姿态增量迁移"范式：

$$
\Delta R = R_{\text{cur}} \cdot R_{\text{init}}^{-1}, \quad R_{\text{out}} = \Delta R \cdot R_{\text{tgt,init}}
$$

这保证：源相对自身参考姿态转了多少，目标就相对自身参考姿态转多少，从而自动吸收两骨架在参考姿态下的朝向差异。平移的"绝对增量"模式、`PinBoneOp` 的 `MaintainOffset` 旋转模式、`RunIKRigOp` 的 Goal 旋转都是这一范式。

### 8.3 子 Op 的执行时机

牢记三阶段：子 Op 的 `Run` 在 IK 求解**前**调 Goal，`RunAfterParent` 在求解**后**改姿态。`FloorConstraintOp` 同时用了两者——`Run` 抬 Goal，`RunAfterParent` 弯脚趾；`BlendToSourceOp` 的旋转混合在 `RunAfterParent`，避免被 IK 求解覆盖。

### 8.4 共享状态

`PelvisMotionOp` 暴露三个 getter 供其他 Op 复用其计算结果：`GetGlobalScaleVector()`（全局缩放）、`GetPelvisTranslationOffset()`（骨盆平移增量）、`GetAffectIKWeightAsVector()`（对 IK 的影响权重）。`RunIKRigOp` 与 `FKChainsOp` 都依赖这些值做修正，因此 `PelvisMotionOp` 通常应排在堆栈靠前位置。

---

## 九、总结

UE 的 IK Retargeter Op 堆栈是一个把"动画重定向"这件高度依赖美术直觉的事，工程化为可组合、可推理的数学算子的优秀范例。其设计有三点值得借鉴：

1. **关注点分离**：骨盆、FK 链、IK Goal、地面、曲线各自独立，单一职责，靠堆栈顺序组合出复杂行为。
2. **数学一致性**：旋转用四元数增量迁移、平移用比例/绝对双模型、滤波用流形上的 One Euro，整套体系在流形与切空间间规范游走，避免欧拉角奇点与线性插值缩放。
3. **前/后处理分层**：父 Op 的 `RunBeforeChildren`/`Run`/子 Op 的 `RunAfterParent` 三段式，让"改 Goal"与"改姿态"两类操作在正确时机发生，是 Op 能灵活编排的关键。

理解了这些 Op 的数学，就能在重定向出现脚滑、脚穿地、手部错位、步幅不对等问题时，精确定位该调哪个 Op 的哪个参数，而不是凭感觉反复试错。
