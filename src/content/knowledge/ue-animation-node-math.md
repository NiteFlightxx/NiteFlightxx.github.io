---
title: "UE 动画节点数学原理详解"
excerpt: "基于 UE 5.9 源码，系统梳理 IK、混合、骨骼控制、动力学、惯性化等常用动画节点的数学原理、核心公式与实现代码。"
date: "2026-06-25"
category: "Animation"
tags: ["UE5", "动画", "IK", "数学", "C++"]
readTime: "阅读约40分钟"
---

> 本文档基于 `Engine\Source\Editor\AnimGraph\Public` 下的编辑器节点定义，并深入到运行时实现（`AnimGraphRuntime`、`Engine\Private\Animation`、`AnimationCore` 纯算法模块）梳理常用动画节点的数学原理、公式与核心代码。
> 源码版本：UE 5.9。

---

## 一、架构与坐标空间基础

### 1.1 三层结构

UE 动画节点采用"编辑器节点 → 运行时节点 → 纯算法求解器"三层结构：

| 层 | 路径 | 职责 |
|----|------|------|
| 编辑器节点 | `Engine\Source\Editor\AnimGraph\Public\AnimGraphNode_*.h` | 图表显示、Pin、属性编辑 |
| 运行时节点 | `Runtime\AnimGraphRuntime\Public\BoneControllers\AnimNode_*.h` | 骨链收集、空间变换、姿态更新 |
| 纯算法求解器 | `Runtime\AnimationCore\Public\*.h` | 数学求解（与 UE 类型解耦） |

所有骨骼控制节点继承自 `FAnimNode_SkeletalControlBase`，核心入口：

```cpp
virtual void EvaluateSkeletalControl_AnyThread(
    FComponentSpacePoseContext& Output,
    TArray<FBoneTransform>& OutBoneTransforms) override;
```

输出 `TArray<FBoneTransform>` 为**组件空间（Component Space, CS）**变换，由基类写回 Pose。

### 1.2 坐标空间

- **Local Space（局部空间）**：骨骼相对父骨骼的变换 $L_b$。
- **Component Space（组件空间）**：骨骼相对骨骼树根的变换 $C_b = L_b \cdot C_{parent(b)}$。
- **Bone Space（骨骼自身空间）**：以骨骼自身原点为原点，常用于"相对自身的偏移"。
- **World Space（世界空间）**：$W_b = C_b \cdot ComponentTransform$。

父子关系（局部↔组件）：

$$
C_b = L_b \cdot C_{parent(b)}, \qquad L_b = C_b \cdot C_{parent(b)}^{-1}
$$

### 1.3 通用数学工具

各求解器反复使用的核心 API：

| 工具 | 数学含义 |
|------|---------|
| `FQuat::FindBetweenNormals(v1, v2)` | 求从 $\vec v_1$ 到 $\vec v_2$ 的**最短旋转四元数**：旋转轴 $\vec n = \frac{\vec v_1 \times \vec v_2}{\|\vec v_1 \times \vec v_2\|}$，角 $\theta = \arccos(\vec v_1 \cdot \vec v_2)$ |
| `FVector::CrossProduct` (`^`) | 叉积，求旋转轴/平面法线 |
| `FVector::DotProduct` (`\|`) | 点积，求夹角余弦 |
| 余弦定理 | $\cos\theta = \dfrac{a^2+b^2-c^2}{2ab}$ |
| `ToSwingTwist(axis)` | Swing-Twist 分解，把旋转拆为绕指定轴的 Twist + 垂直分量 Swing |
| `FQuat(Axis, Angle)` | 轴角构造旋转 |

---

## 二、IK 类节点

### 2.1 TwoBoneIK（两骨 IK）

**文件**：
- 节点：`AnimGraphRuntime\Public\BoneControllers\AnimNode_TwoBoneIK.h`
- 求解器：`AnimationCore\Public\TwoBoneIK.h` / `Private\TwoBoneIK.cpp`

#### 数学原理

解析解（闭式解），非迭代。已知三骨点 $\vec P_{root} \to \vec P_{joint} \to \vec P_{end}$，目标 $\vec T$（effector），以及定义弯曲平面的极向量 $\vec{JT}$（Joint Target / Pole Vector），用**余弦定理**直接求解关节位置。

记上骨长 $A$、下骨长 $B$、目标距离 $d = \|\vec T - \vec P_{root}\|$，最大臂长 $L_{max} = A + B$。

**余弦定理求关节角**：

$$
\cos\alpha = \frac{A^2 + d^2 - B^2}{2 A d}, \qquad \alpha = \arccos\!\left(\frac{A^2 + d^2 - B^2}{2 A d}\right)
$$

**弯曲平面构造**（Pole Vector 的作用）：

$$
\vec d_{des} = \frac{\vec T - \vec P_{root}}{\|\vec T - \vec P_{root}\|} \quad(\text{目标方向})
$$

$$
\vec n_{plane} = \vec d_{des} \times (\vec{JT} - \vec P_{root}) \quad(\text{平面法线 = 目向} \times \text{极向量})
$$

$$
\vec d_{bend} = \text{normalize}\!\left((\vec{JT} - \vec P_{root}) - \big((\vec{JT} - \vec P_{root}) \cdot \vec d_{des}\big)\,\vec d_{des}\right) \quad(\text{平面内弯曲方向})
$$

**关节位置**（直角三角形分解）：

$$
\text{proj} = A\cos\alpha, \qquad \text{perp} = A\sin\alpha
$$

$$
\boxed{\;\vec P_{joint}^{new} = \vec P_{root} + \text{proj}\cdot\vec d_{des} + \text{perp}\cdot\vec d_{bend}\;}
$$

**拉伸（Stretch）**：当 $d$ 接近 $L_{max}$ 时按线性比例拉伸骨长：

$$
\text{ratio} = \frac{d}{L_{max}}, \quad \text{scale} = (S_{max}-1)\cdot\text{clamp}\!\left(\frac{\text{ratio} - r_{start}}{1 - r_{start}}, 0, 1\right)
$$

$$
A' = A(1+\text{scale}), \quad B' = B(1+\text{scale})
$$

#### 核心代码

```cpp
// AnimationCore/Private/TwoBoneIK.cpp
void SolveTwoBoneIK(const FVector& RootPos, const FVector& JointPos, const FVector& EndPos,
    const FVector& JointTarget, const FVector& Effector,
    FVector& OutJointPos, FVector& OutEndPos,
    double UpperLimbLength, double LowerLimbLength,
    bool bAllowStretching, double StartStretchRatio, double MaxStretchScale)
{
    FVector DesiredDelta = Effector - RootPos;
    double DesiredLength = DesiredDelta.Size();
    double MaxLimbLength = LowerLimbLength + UpperLimbLength;
    FVector DesiredDir = (DesiredLength < DOUBLE_KINDA_SMALL_NUMBER)
        ? FVector(1,0,0) : DesiredDelta.GetSafeNormal();

    // 弯曲平面构造 (Pole Vector 作用)
    FVector JointTargetDelta = JointTarget - RootPos;
    FVector JointBendDir = JointTargetDelta - ((JointTargetDelta | DesiredDir) * DesiredDir);
    JointBendDir.Normalize();

    // 拉伸
    if (bAllowStretching) {
        const double ReachRatio = DesiredLength / MaxLimbLength;
        const double ScaleRange = (1.0 - StartStretchRatio);
        const double ScalingFactor = (MaxStretchScale - 1.0)
            * FMath::Clamp((ReachRatio - StartStretchRatio) / ScaleRange, 0.0, 1.0);
        LowerLimbLength *= (1.0 + ScalingFactor);
        UpperLimbLength *= (1.0 + ScalingFactor);
        MaxLimbLength   *= (1.0 + ScalingFactor);
    }

    OutEndPos = Effector;
    if (DesiredLength >= MaxLimbLength) {            // 不可达: 伸直
        OutEndPos   = RootPos + (MaxLimbLength * DesiredDir);
        OutJointPos = RootPos + (UpperLimbLength * DesiredDir);
    } else {                                        // 可达: 余弦定理
        const double TwoAB = 2.0 * UpperLimbLength * DesiredLength;
        const double CosAngle = (UpperLimbLength*UpperLimbLength + DesiredLength*DesiredLength
            - LowerLimbLength*LowerLimbLength) / TwoAB;
        const double Angle = FMath::Acos(CosAngle);
        const double JointLineDist = UpperLimbLength * FMath::Sin(Angle);
        double ProjJointDist = FMath::Sqrt(
            UpperLimbLength*UpperLimbLength - JointLineDist*JointLineDist);
        if (CosAngle < 0.0) ProjJointDist *= -1.0;   // 上骨反向
        OutJointPos = RootPos + (ProjJointDist * DesiredDir) + (JointLineDist * JointBendDir);
    }
}
```

旋转恢复用最短旋转四元数：

```cpp
FQuat DeltaRotation = FQuat::FindBetweenNormals(OldBoneDir, NewBoneDir);
InOutRootTransform.SetRotation(DeltaRotation * InOutRootTransform.GetRotation());
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `IKBone` | 链末端骨（effector） |
| `EffectorLocation` | 目标到达位置 $\vec T$ |
| `JointTargetLocation` | 极向量（Pole Vector），决定肘/膝朝向，消除 IK 多解性 |
| `bAllowStretching` / `StartStretchRatio` / `MaxStretchScale` | 拉伸开关 / 起始比例 / 最大拉伸倍数 |
| `bAllowTwist` / `TwistAxis` | 是否保留链上 twist；关闭时做 Swing-Twist 分解清零 twist |

---

### 2.2 CCDIK（循环坐标下降 IK）

**文件**：`AnimationCore\Public\CCDIK.h` / `Private\CCDIK.cpp`

#### 数学原理

**Cyclic Coordinate Descent**（循环坐标下降）。从链的一端向另一端逐关节迭代。对每个关节：

1. 计算当前关节到末端的方向 $\vec v_{end}$ 与当前关节到目标的方向 $\vec v_{tgt}$：

$$
\vec v_{end} = \text{normalize}(\vec P_{tip} - \vec P_{joint}), \qquad \vec v_{tgt} = \text{normalize}(\vec T - \vec P_{joint})
$$

2. 旋转轴 = 叉积，旋转角 = 点积反余弦（可按每关节限值 clamp）：

$$
\vec n = \vec v_{end} \times \vec v_{tgt}, \qquad \theta = \arccos(\vec v_{end} \cdot \vec v_{tgt})
$$

$$
\Delta q = (\vec n, \theta), \qquad q_{new} = \Delta q \cdot q_{joint}
$$

3. 向下传播更新所有子关节变换：$C_{child} = L_{child} \cdot C_{parent}^{new}$。

4. 循环条件：$\|\vec P_{tip} - \vec T\| > \text{Precision}$ 且迭代数 $< \text{MaxIterations}$。

#### 核心代码

```cpp
// AnimationCore/Private/CCDIK.cpp —— 单关节旋转数学
FVector ToEnd   = (TipPos - CurrentLinkTransform.GetLocation()).GetSafeNormal();
FVector ToTarget= (TargetPos - CurrentLinkTransform.GetLocation()).GetSafeNormal();

// 角度 = acos(点积), 并按每关节旋转限值 Clamp
double Angle = FMath::ClampAngle(
    FMath::Acos(FVector::DotProduct(ToEnd, ToTarget)),
    -RotationLimitPerJointInRadian, RotationLimitPerJointInRadian);

// 旋转轴 = 叉积, 构造 DeltaRotation 四元数
FVector RotationAxis = FVector::CrossProduct(ToEnd, ToTarget).GetSafeNormal();
FQuat DeltaRotation(RotationAxis, Angle);
FQuat NewRotation = DeltaRotation * CurrentLinkTransform.GetRotation();

// 向下传播: 子关节 = 子Local × 更新后的父ComponentTransform
for (int32 ChildLinkIndex = LinkIndex + 1; ChildLinkIndex <= TipBoneLinkIndex; ++ChildLinkIndex) {
    ChildIterLink.Transform = LocalTransform * CurrentParentTransform;
    CurrentParentTransform = ChildIterLink.Transform;
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `TipBone` / `RootBone` | 链的末端和根，中间骨自动收集 |
| `Precision`（默认 1.0） | 末端到目标的容差（停止条件） |
| `MaxIterations`（默认 10） | 最大迭代次数 |
| `bStartFromTail`（默认 true） | 从末端向根迭代 |
| `bEnableRotationLimit` / `RotationLimitPerJoints` | 每关节最大旋转角度限制（度） |

---

### 2.3 FABRIK（前向反向到达 IK）

**文件**：`AnimationCore\Public\FABRIK.h` / `Private\FABRIK.cpp`
（参考：[andreasaristidou.com/publications/FABRIK.pdf](http://andreasaristidou.com/publications/FABRIK.pdf)）

#### 数学原理

**Forward And Backward Reaching Inverse Kinematics**。两阶段迭代，每步保持骨长约束。

设链 $\vec P_0, \vec P_1, \dots, \vec P_n$，每段长 $l_i = \|\vec P_i - \vec P_{i-1}\|$，最大伸展 $R = \sum l_i$。

**情况 1 — 不可达**（$\|\vec T - \vec P_0\| > R$）：沿直线拉伸

$$
\vec P_i = \vec P_{i-1} + l_i \cdot \frac{\vec T - \vec P_{i-1}}{\|\vec T - \vec P_{i-1}\|}
$$

**情况 2 — 可达**：双向迭代

- **Forward Reaching**（末端→根，保持与子距离）：

$$
\vec P_i = \vec P_{i+1} + l_{i+1} \cdot \frac{\vec P_i - \vec P_{i+1}}{\|\vec P_i - \vec P_{i+1}\|}, \quad i = n-1 \dots 1
$$

- **Backward Reaching**（根→末端，保持与父距离，根固定）：

$$
\vec P_i = \vec P_{i-1} + l_i \cdot \frac{\vec P_i - \vec P_{i-1}}{\|\vec P_i - \vec P_{i-1}\|}, \quad i = 1 \dots n
$$

迭代直到收敛（$\|\vec P_{n-1} - \vec T\|$ 满足精度）。

**旋转重定向**：位置解算后，用最短旋转把每段骨方向对齐到新方向：

$$
\vec d_{old} = \frac{\vec P_{i+1}^{old} - \vec P_i^{old}}{\|\cdot\|}, \quad \vec d_{new} = \frac{\vec P_{i+1}^{new} - \vec P_i^{new}}{\|\cdot\|}
$$

$$
q_i^{new} = \text{FindBetween}(\vec d_{old}, \vec d_{new}) \cdot q_i^{old}
$$

#### 核心代码

```cpp
// AnimationCore/Private/FABRIK.cpp
double RootToTargetDistSq = FVector::DistSquared(InOutChain[0].Position, TargetPosition);

if (RootToTargetDistSq > FMath::Square(MaximumReach)) {
    // 不可达: 沿直线拉伸
    for (int32 LinkIndex = 1; LinkIndex < NumChainLinks; LinkIndex++) {
        CurrentLink.Position = ParentLink.Position
            + (TargetPosition - ParentLink.Position).GetUnsafeNormal() * CurrentLink.Length;
    }
} else {
    InOutChain[TipBoneLinkIndex].Position = TargetPosition;     // 末端贴目标
    double Slop = FVector::Dist(InOutChain[Tip].Position, TargetPosition);
    while ((Slop > Precision) && (IterationCount++ < MaxIterations)) {
        // Forward Reaching: 末端 -> 根, 保持与子距离
        for (int32 LinkIndex = TipBoneLinkIndex - 1; LinkIndex > 0; LinkIndex--) {
            CurrentLink.Position = ChildLink.Position
                + (CurrentLink.Position - ChildLink.Position).GetUnsafeNormal() * ChildLink.Length;
        }
        // Backward Reaching: 根 -> 末端, 保持与父距离
        for (int32 LinkIndex = 1; LinkIndex < TipBoneLinkIndex; LinkIndex++) {
            CurrentLink.Position = ParentLink.Position
                + (CurrentLink.Position - ParentLink.Position).GetUnsafeNormal() * CurrentLink.Length;
        }
        Slop = FMath::Abs(InOutChain[Tip].Length
            - FVector::Dist(InOutChain[Tip-1].Position, TargetPosition));
    }
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `EffectorTransform` | 目标（含位置和旋转） |
| `Precision` / `MaxIterations` | 容差 / 迭代上限 |
| `EffectorRotationSource` | 末端骨最终旋转来源（保持局部/复制目标/保持组件空间） |
| `MaximumReach` | 所有骨长之和（链最大伸展） |

---

### 2.4 SplineIK（样条 IK）

**文件**：`AnimationCore\Public\SplineIK.h` / `Private\SplineIK.cpp`

#### 数学原理

不迭代，而是把骨链"贴"到一条样条曲线上。曲线由 `ControlPoints` 变换一条参考骨样条得到。每根骨的位置通过**沿样条行进固定骨长**求得 —— 用**球面相交**：从上一骨点出发，半径 = 骨长 × 拉伸比，找样条上第一个交点的参数 $\alpha$。

**拉伸比**：

$$
\text{StretchRatio} = \frac{\text{Lerp}(L_{orig}, L_{now}, \text{Stretch})}{L_{orig}}
$$

**位置求解**（球面相交）：

$$
\alpha_i = \text{FindParamAtFirstSphereIntersection}(\vec P_{i-1},\ l_i \cdot \text{StretchRatio})
$$

$$
\vec P_i = \text{PositionSpline.Eval}(\alpha_i)
$$

**旋转求解**：样条切线方向校正 + Roll + Twist 组合

$$
\vec d_{new} = \vec P_{i+1} - \vec P_i \quad(\text{切线方向})
$$

$$
q_{dir} = \text{FindBetween}(\vec d_{cur}, \vec d_{new}) \quad(\text{方向校正})
$$

$$
q_i^{new} = q_{roll} \cdot q_{dir} \cdot q_{offset} \cdot q_{spline}(\alpha_i)
$$

其中 Twist 沿 $\alpha$ 在 `TwistStart` 与 `TwistEnd` 间插值，`Roll` 为整体滚转角。

#### 核心代码

```cpp
// AnimationCore/Private/SplineIK.cpp
const float TotalStretchRatio = FMath::Lerp(OriginalSplineLength, TotalSplineLength, Stretch)
                             / OriginalSplineLength;

// 1. 位置: 沿样条按骨长做球面相交前进
for (int32 BoneIndex = 0; BoneIndex < BoneCount; BoneIndex++) {
    SplineAlphas[BoneIndex] = FindParamAtFirstSphereIntersection.Execute(
        PreviousPoint, BoneLengths[BoneIndex] * TotalStretchRatio, StartingLinearIndex);
    BoneTransform.SetLocation(PositionSpline.Eval(SplineAlphas[BoneIndex]));
    BoneTransform.SetScale3D(ScaleSpline.Eval(SplineAlphas[BoneIndex]));
    PreviousPoint = BoneTransform.GetLocation();
}

// 2. 旋转: 样条切线方向校正 + Roll/Twist
for (int32 BoneIndex = 0; BoneIndex < BoneCount; BoneIndex++) {
    FQuat SplineRotation = RotationSpline.Eval(SplineAlphas[BoneIndex]);
    const float TotalRoll = Roll + Twist.Execute(SplineAlphas[BoneIndex] / TotalSplineAlpha);
    FQuat RollRotation = FRotator(/* TotalRoll */).Quaternion();
    FVector NewBoneDir = OutBoneTransforms[BoneIndex+1].GetLocation() - BoneTransform.GetLocation();
    const FVector CurrentBoneDir = BoneTransforms[BoneIndex+1].GetUnitAxis(BoneAxis);
    DirectionCorrectingRotation = FQuat::FindBetweenNormals(CurrentBoneDir, NewBoneDir);
    BoneTransform.SetRotation(RollRotation * DirectionCorrectingRotation
                              * BoneOffsetRotation * SplineRotation);
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `StartBone` / `EndBone` | 样条链起止骨 |
| `BoneAxis` | 骨的哪个轴对齐到样条切线 |
| `ControlPoints` | 样条控制点变换 |
| `Roll` / `TwistStart` / `TwistEnd` / `TwistBlend` | 沿样条方向的滚转与首末 twist |
| `Stretch`（0~1） | 0 = 骨不拉伸按原长贴样条，1 = 拉伸填满整条样条 |
| `Offset` | 样条起点偏移 |

---

### 2.5 LegIK（腿部 IK + Soft IK）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_LegIK.h`
求解器：`AnimNode_LegIK.cpp` 内的 `FIKChain` 类 + `AnimationCore\Private\SoftIK.cpp`

#### 数学原理

LegIK 是三种求解器的组合 + **Soft IK 防膝盖弹跳** + **Hinge 旋转约束**：

1. **OrientLegTowardsIK**：用 `FindBetweenNormals(FootFKDir, FootIKDir)` 把整条腿旋转对齐 IK 目标方向。
2. **路径选择**：
   - 不可达或 $\le 2$ 链：`OrientAllLinksToDirection`（直线伸向目标）
   - 恰好 3 链（髋/膝/足）：`SolveTwoBoneIK`（余弦定理闭式解）
   - 否则：`SolveFABRIK`（带约束的 FABRIK 变体）

**Soft IK —— 防末端弹跳**。当 effector 接近全展（进入软区），用指数衰减把目标位置往回拉，使膝盖平滑过渡而非"啪"地伸直：

设链长 $L$，软区百分比 $p$，硬区长度 $H = L(1-p)$，软区长度 $S = L \cdot p$。当前 effector 距离 $d$：

$$
\Delta = d - H \quad(\text{超出硬区距离})
$$

若 $\Delta > 0$，进入软区，目标位置缩放到：

$$
\boxed{\;d_{soft} = H + S\left(1 - e^{-\Delta / S}\right)\;}
$$

这是一个**指数饱和**函数：当 $d \to \infty$，$d_{soft} \to H + S = L$，永远不会超过链长，从而在末端附近形成平滑的"软"过渡。

**TwoBone 闭式解**（LegIK 自己的实现）：

$$
\cos C = \frac{a^2 + b^2 - c^2}{2ab}, \qquad C = \arccos(\cos C)
$$

其中 $a$ = 髋膝长，$b$ = 髋足距，$c$ = 膝足长。新膝位：

$$
\vec P_{knee}^{new} = \vec P_{hip} + a\left(\cos C \cdot \hat d_{hipfoot} + \sin C \cdot \hat d_{bend}\right)
$$

#### 核心代码

```cpp
// AnimationCore/Private/SoftIK.cpp —— 指数衰减软化
const float SoftDistance = TotalChainLength * (1.0f - FMath::Min(1.0f, SoftLengthPercent));
const float HardLength   = TotalChainLength - SoftDistance;
const float CurrentDelta = CurrentLength - HardLength;
if (CurrentDelta <= KINDA_SMALL_NUMBER) return;        // 未进入软区

// 指数衰减: SoftenedLength = HardLength + SoftDistance * (1 - e^(-Δ/S))
const float PercentIntoSoftLength = CurrentDelta / SoftDistance;
const float SoftenedLength = HardLength + SoftDistance * (1.0 - FMath::Exp(-PercentIntoSoftLength));

InOutEffectorPosition = RootLocation + StartToEffector * SoftenedLength;
```

```cpp
// AnimNode_LegIK.cpp —— TwoBone 闭式解
void FIKChain::SolveTwoBoneIK(const FVector& InTargetLocation) {
    FVector& pA = Links[0].Location; // Foot
    FVector& pB = Links[1].Location; // Knee
    FVector& pC = Links[2].Location; // Hip
    pA = InTargetLocation;
    const FVector HipToFoot = pA - pC;
    const double a = Links[1].Length;   // hip-knee
    const double b = HipToFoot.Size(); // hip-foot
    const double c = Links[0].Length; // knee-foot
    const double CosC = (a*a + b*b - c*c) / (2.f * a * b);
    const double C = FMath::Acos(CosC);
    // 新膝位 = Hip + a*(cosC*HipToFootDir + sinC*BendDir)
    const FVector NewKneeLoc = pC + a * (HipToFootDir * CosC + BendDir * FMath::Sin(C));
    pB = NewKneeLoc;
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `IKFootBone` / `FKFootBone` | IK 目标足 / FK 源足 |
| `NumBonesInLimb`（默认 2） | 髋膝足共 3 骨 |
| `MinRotationAngle`（默认 15°） | 最小膝角，防反折 |
| `HingeRotationAxis` | 髋膝足平面法线（极向量轴） |
| `ReachPrecision`（默认 0.01）/ `MaxIterations`（默认 12） | FABRIK 容差/迭代 |
| `SoftPercentLength`（默认 1.0=关） | 进入软区的链长百分比 |
| `SoftAlpha`（默认 1.0） | Soft IK 强度混合 |

---

### 2.6 LookAt（注视节点）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_LookAt.h`
求解器：`AnimationCore::SolveAim`（`AnimationCore\Private\AnimationCoreLibrary.cpp`）

#### 数学原理

求一个旋转，使骨的 `LookAt_Axis` 指向目标点。可选**角度钳制**和**投影到平面**。

1. 目标方向：$\vec t = \text{normalize}(\vec T - \vec P_{bone})$
2. **角度钳制**：设当前夹角 $\phi = \arccos(\vec a \cdot \vec t)$，钳制角 $\phi_{max}$。若 $\phi > \phi_{max}$：

$$
\vec t' = \text{normalize}\!\left(\vec a + \frac{\phi_{max}}{\phi}(\vec t - \vec a)\right)
$$

3. **投影到 Up 平面**（限制只能在某平面内旋转）：

$$
\vec t' = \text{normalize}\!\left(\vec t - (\vec t \cdot \hat u)\hat u\right)
$$

4. **最短旋转**：

$$
\boxed{\;q_{\Delta} = \text{FindBetween}(\vec a, \vec t'), \qquad q_{new} = q_{\Delta} \cdot q_{old}\;}
$$

#### 核心代码

```cpp
// AnimationCore/Private/AnimationCoreLibrary.cpp
FQuat SolveAim(const FTransform& CurrentTransform, const FVector& TargetPosition,
    const FVector& AimVector, bool bUseUpVector, const FVector& UpVector, float AimClampInDegree)
{
    FTransform NewTransform = CurrentTransform;
    FVector ToTarget = (TargetPosition - NewTransform.GetLocation()).GetSafeNormal();

    // 角度钳制
    if (AimClampInDegree > ZERO_ANIMWEIGHT_THRESH) {
        double AimClampInRadians = FMath::DegreesToRadians(FMath::Min(AimClampInDegree, 180.0));
        double DiffAngle = FMath::Acos(FVector::DotProduct(AimVector, ToTarget));
        if (DiffAngle > AimClampInRadians) {
            FVector DeltaTarget = ToTarget - AimVector;
            DeltaTarget *= (AimClampInRadians / DiffAngle);
            ToTarget = (AimVector + DeltaTarget).GetSafeNormal();
        }
    }
    // 投影到 UpVector 法平面
    if (bUseUpVector) {
        ToTarget = FVector::VectorPlaneProject(ToTarget, UpVector).GetSafeNormal();
    }
    return FQuat::FindBetweenNormals(AimVector, ToTarget);
}
```

```cpp
// AnimNode_LookAt.cpp —— 节点层调用
FVector LookAtVector = LookAt_Axis.GetTransformedAxis(ComponentBoneTransform);
FVector LookUpVector = LookUp_Axis.GetTransformedAxis(ComponentBoneTransform);
FQuat DeltaRotation = AnimationCore::SolveAim(ComponentBoneTransform, CurrentLookAtLocation,
    LookAtVector, bUseLookUpAxis, LookUpVector, LookAtClamp);
InOutBoneToModifyTransform.SetRotation(DeltaRotation * InOutBoneToModifyTransform.GetRotation());
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `BoneToModify` | 要旋转的骨 |
| `LookAtTarget` / `LookAtLocation` | 注视目标 |
| `LookAt_Axis` | 骨上哪个轴指向目标 |
| `bUseLookUpAxis` / `LookUp_Axis` | 投影到 Up 法平面，使骨只在某平面摆动 |
| `LookAtClamp`（度） | 最大偏转角 |
| `InterpolationTime` / `InterpolationTriggerThreashold` / `InterpolationType` | 目标跳变时的平滑过渡 |

---

## 三、混合类节点

所有混合数学逻辑汇聚于 `Engine\Private\Animation\AnimationRuntime.cpp`。核心是两个模板辅助函数：

- **Overwrite**（初始化）：$\text{Dest} = \text{Source} \cdot w$
- **Accumulate**（累加）：$\text{Dest} \mathrel{+}= w \cdot \text{Source}$（旋转用最短弧线四元数累加）

对归一化权重 $\sum w_i = 1$，输出为凸插值 $\text{Out} = \sum w_i \cdot \text{Pose}_i$。

### 3.1 TwoWayBlend / MultiWayBlend

**文件**：`AnimGraphRuntime\Public\AnimNodes\AnimNode_TwoWayBlend.h`（MultiWayBlend 同理）

#### 数学原理

**TwoWayBlend**：给定权重 $\alpha$（Pose B 的权重）：

$$
\boxed{\;\text{Out} = (1-\alpha)\cdot \text{Pose}_A + \alpha \cdot \text{Pose}_B\;}
$$

旋转通道用最短弧线四元数球面插值（`AccumulateWithShortestRotation` 自动取 $q$ 或 $-q$ 中较近者）。

**MultiWayBlend**：多路加权平均。若 `bNormalizeAlpha=true`，先归一化权重：

$$
w_i' = \frac{w_i}{\sum_j w_j}, \qquad \text{Out} = \sum_i w_i' \cdot \text{Pose}_i
$$

归一化后为凸组合（权重和为 1）；否则为原始权重加权和（可能非凸）。

**Alpha 输入三模式**：Float / Bool（经 `FInputAlphaBoolBlend` 产生类指数过渡曲线）/ Curve（查表）。

#### 核心代码

```cpp
// AnimationRuntime.cpp —— BlendPosesTogether (MultiWayBlend 核心)
BlendPose<Overwrite>(SourcePoses[0], OutPose, w0);      // 初始化 = pose0 * w0
for (i = 1..N)
    BlendPose<Accumulate>(SourcePoses[i], OutPose, wi);  // += wi * pose_i
OutPose.NormalizeRotations();   // 四元数累加后需归一化
```

```cpp
// AnimNode_MultiWayBlend.cpp —— Alpha 归一化
TotalAlpha = sum(DesiredAlphas);
if (bNormalizeAlpha && TotalAlpha > ZERO_ANIMWEIGHT_THRESH)
    CachedAlphas[i] = AlphaScaleBias.ApplyTo(DesiredAlphas[i] / TotalAlpha);  // 归一化为和 1
else
    CachedAlphas[i] = AlphaScaleBias.ApplyTo(DesiredAlphas[i]);               // 原始权重
```

---

### 3.2 LayeredBoneBlend（分层骨骼混合）

**文件**：`AnimGraphRuntime\Public\AnimNodes\AnimNode_LayeredBoneBlend.h`

#### 数学原理

**逐骨骼（per-bone）权重混合**。每个骨骼 $b$ 有自己的混合权重 $w_b$ 与贡献层索引：

$$
\text{Out}_b = (1-w_b)\cdot \text{Base}_b + w_b \cdot {\text{Layer}_{s(b)}}_b
$$

其中 $s(b)$ 是骨骼 $b$ 贡献最多的层索引（由 `BlendWeights`/`LayerSetup` 决定）。

**Mesh Space 旋转混合**（`bMeshSpaceRotationBlend`）：在网格空间（而非局部空间）做旋转插值，避免父骨骼旋转影响下骨骼的插值方向。做法是累积父链旋转乘积：

$$
R_b^{mesh} = R_b^{local} \cdot R_{parent(b)}^{mesh}
$$

然后插值 $R_b^{blend} = \text{FastLerp}(R_{b,src}^{mesh}, R_{b,tgt}^{mesh}, w_b)$，再转回局部：

$$
R_b^{local,new} = (R_{parent(b)}^{mesh,blend})^{-1} \cdot R_b^{blend}
$$

Mesh Space 缩放混合同理。Root Space 模式把根骨的累积旋转设为 Identity，使旋转位于根空间。

#### 核心代码

```cpp
// AnimationRuntime.cpp —— BlendPosesPerBoneFilter 核心
// 对每个骨骼 b:
PoseIndex = BoneBlendWeights[b].SourceIndex;     // 贡献层索引
BlendWeight = BoneBlendWeights[b].BlendWeight;   // per-bone 权重
if (!Relevant)        BlendAtom = BaseAtom;
else if (FullWeight)  BlendAtom = TargetAtom;
else {
    BlendAtom = BaseAtom;
    BlendAtom.BlendWith(TargetAtom, BlendWeight);   // Out = Base*(1-w) + Target*w
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `BasePose` / `BlendPoses[]` | 基础姿态 / 各层姿态 |
| `BlendWeights[]` | 每层权重 |
| `BlendMode` | BranchFilter vs BlendMask（UBlendProfile） |
| `bMeshSpaceRotationBlend` / `bRootSpaceRotationBlend` | 旋转混合空间 |
| `bMeshSpaceScaleBlend` | 缩放混合空间 |
| `CurveBlendOption` | 曲线混合方式 |

---

### 3.3 BlendBoneByChannel（按通道混合）

**文件**：`AnimGraphRuntime\Public\AnimNodes\AnimNode_BlendBoneByChannel.h`

#### 数学原理

对指定骨骼对（源→目标），按 $\alpha$ 在**选定的通道**（Translation/Rotation/Scale 之一或多个）上做插值，其余通道保留 A：

$$
\text{Out}_{channel} = (1-\alpha)\cdot T_{channel}^{A} + \alpha \cdot T_{channel}^{B}
$$

通道过滤发生在混合之后：只把所选通道从插值结果复制回目标。

`FTransform::Blend` 即每通道 lerp：$\text{Blended} = (1-a)\cdot\text{Target} + a\cdot\text{Source}$。

#### 核心代码

```cpp
// AnimNode_BlendBoneByChannel.cpp
BlendedTransform.Blend(TargetTransform, SourceTransform, InternalBlendAlpha);  // (1-a)*Target + a*Source
if (bBlendTranslation) TargetTransform.SetTranslation(BlendedTransform.GetTranslation());
if (bBlendRotation)    TargetTransform.SetRotation(BlendedTransform.GetRotation());
if (bBlendScale)       TargetTransform.SetScale3D(BlendedTransform.GetScale3D());
```

#### 关键参数

`Alpha`、`BoneDefinitions[]`（每项含 `SourceBone`/`TargetBone`/`bBlendTranslation`/`bBlendRotation`/`bBlendScale`）、`TransformsSpace`（BoneSpace/ComponentSpace/WorldSpace/ParentBoneSpace）。

---

### 3.4 ApplyAdditive / MakeDynamicAdditive（叠加动画）

**文件**：`AnimGraphRuntime\Public\AnimNodes\AnimNode_ApplyDynamicAdditive.h` / `AnimNode_MakeDynamicAdditive.h`

#### 数学原理

叠加动画（Additive）记录姿态相对基础姿势的**差值（delta）**，应用时叠加回去。三通道 delta 定义不同：

**MakeDynamicAdditive —— delta 计算**（`ConvertTransformToAdditive`）：

$$
\Delta q_{rot} = q_{target} \cdot q_{base}^{-1} \quad(\text{旋转：四元数除法 = 相对旋转})
$$

$$
\Delta \vec t = \vec t_{target} - \vec t_{base} \quad(\text{位移：加法差值})
$$

$$
\boxed{\;\Delta \vec s = \frac{\vec s_{target}}{\vec s_{base}} - \vec 1 \quad(\text{缩放：乘法增量，应用时为 } \vec s_{base}\cdot(\vec 1 + \Delta\vec s)\;)\;}
$$

**Mesh Space additive**：先把基础和叠加姿态通过 `ConvertPoseToMeshRotation` 转到网格旋转空间（旋转空间），再做 delta。这样旋转 delta 相对网格空间而非局部空间，可正确叠加跨骨链的旋转。

**ApplyAdditive —— delta 应用**（`AccumulateWithAdditiveScale`，权重 $\alpha$）：

$$
\vec t_{out} = \vec t_{base} + \alpha \cdot \Delta\vec t
$$

$$
q_{out} = \text{normalize}\!\left(\Delta q^{\,\alpha}\right) \cdot q_{base}
$$

$$
\vec s_{out} = \vec s_{base} \cdot (\vec 1 + \alpha \cdot \Delta\vec s)
$$

其中 $\Delta q^{\,\alpha}$ 表示对 delta 旋转按 $\alpha$ 缩放角度（球面插值到单位旋转）。

#### 核心代码

```cpp
// AnimationRuntime.cpp —— ConvertTransformToAdditive (delta 计算)
TargetTransform.SetRotation(  TargetRot * BaseRot.Inverse() );                          // 旋转: 四元数差
TargetTransform.SetTranslation( TargetTrans - BaseTrans );                             // 位移: 加法差
TargetTransform.SetScale3D( TargetScale * SafeScaleReciprocal(BaseScale) - 1.f );        // 缩放: 乘法增量
TargetTransform.NormalizeRotation();
```

#### 关键参数

`Base`、`Additive`、`Alpha`、`AlphaInputType`（Float/Bool/Curve）、`bMeshSpaceAdditive`（MakeDynamicAdditive 的网格空间模式）。

---

### 3.5 Inertialization（惯性化）

**文件**：`Engine\Classes\Animation\AnimNode_Inertialization.h` / `Engine\Private\Animation\AnimNode_Inertialization.cpp`
（基于 Bollo 的 GDC 2018 演讲）

#### 数学原理

这是**临界阻尼五次衰减**，而非简单弹簧。在每条曲线/骨骼通道上独立评估，具有边界初速度。

目标：在 $t=t_1$ 时位置、速度、加速度均收敛至零（$x(t_1)=x'(t_1)=x''(t_1)=0$），且无超调。

设初始偏移 $x_0$、初速度 $v_0$（由两帧姿态差估算），衰减时长 $t_1$，用**五次多项式**：

$$
x(t) = A t^5 + B t^4 + C t^3 + D t^2 + v_0\, t + x_0
$$

由边界条件（$t=0$: $x=x_0, x'=v_0, x''=a_0$；$t=t_1$: $x=x'=x''=0$）解得系数：

$$
A = -\frac{0.5(a_0 t_1^2 + 6 t_1 v_0 + 12 x_0)}{t_1^5}
$$

$$
B = \frac{0.5(3 a_0 t_1^2 + 16 t_1 v_0 + 30 x_0)}{t_1^4}
$$

$$
C = -\frac{0.5(3 a_0 t_1^2 + 12 t_1 v_0 + 20 x_0)}{t_1^3}
$$

$$
D = 0.5\, a_0
$$

其中初始加速度 $a_0 = \max\!\left(0,\ \dfrac{-8 t_1 v_0 - 20 x_0}{t_1^2}\right)$（来自 $t_1$ 处零抖动条件，钳到 $\ge 0$ 防超调）。

符号/超调钳制：若 $x_0 < 0$ 全部取反；若 $v_0 > 0$（背离目标）钳为 $v_0 = 0$。

**应用**：对每骨骼，把捕获的（方向、幅度、速度）三元组用衰减曲线包裹后加回：

$$
\text{Translation} \mathrel{+}= \hat d \cdot \text{CalcInertialFloat}(|\Delta\vec t|, v, t, t_1)
$$

$$
\text{Rotation} = \text{FQuat}(\text{axis},\ \text{CalcInertialFloat}(\theta, v, t, t_1)) \cdot \text{Rotation}
$$

#### 核心代码

```cpp
// AnimNode_Inertialization.cpp —— 五次衰减求解器 CalcInertialFloat
double CalcInertialFloat(double x0, double v0, double t, double t1)
{
    // 符号/超调钳制
    if (x0 < 0) { x0 = -x0; v0 = -v0; }
    if (v0 > 0) v0 = 0;                                   // 背离目标: 钳为 0
    t1 = FMath::Min(t1, -5.0 * x0 / v0);                  // 时间钳制防过冲
    const double a0 = FMath::Max(0.0, (-8.0 * t1 * v0 - 20.0 * x0) / (t1 * t1));

    // 五次系数
    const double A = -0.5 * (a0 * t1*t1 + 6.0 * t1 * v0 + 12.0 * x0) / (t1*t1*t1*t1*t1);
    const double B =  0.5 * (3.0 * a0 * t1*t1 + 16.0 * t1 * v0 + 30.0 * x0) / (t1*t1*t1*t1);
    const double C = -0.5 * (3.0 * a0 * t1*t1 + 12.0 * t1 * v0 + 20.0 * x0) / (t1*t1*t1);
    const double D =  0.5 * a0;

    // Horner 法则求值
    return (((((A * t) + B) * t + C) * t + D) * t + v0) * t + x0;
}
```

#### 关键参数

`Source`、`DefaultBlendProfile`（每骨骼衰减时长）、`FilteredCurves`/`FilteredBones`（排除项）、`bResetOnBecomingRelevant`。运行时通过 `RequestInertialization(Duration, BlendProfile)` 消息传入时长。

---

## 四、骨骼控制类节点

### 4.1 ModifyBone（修改骨骼 / Transform Bone）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_ModifyBone.h`
空间变换辅助：`Engine\Private\Animation\AnimationRuntime.cpp`

#### 数学原理

应用顺序固定：**先 Scale，再 Rotation，最后 Translation**（与 FTransform/FMatrix 一致）。每个通道独立做「CS → BoneSpace → 应用模式 → BoneSpace → CS」三步。

**累加公式**（`BMM_Additive` 模式）：

$$
\vec s_{new} = \vec s \cdot \vec s_{scale} \quad(\text{乘法累加})
$$

$$
q_{new} = q_{rot} \cdot q \quad(\text{左乘 = 世界空间叠加})
$$

$$
\vec t_{new} = \vec t + \vec t_{trans} \quad(\text{向量加})
$$

`BMM_Replace` 模式直接赋值，`BMM_Ignore` 跳过该通道。

**空间变换公式**（`ConvertCSTransformToBoneSpace`，CS→目标空间）：

| Space | 公式 |
|-------|------|
| `WorldSpace` | $W = C \cdot \text{ComponentTransform}$ |
| `ComponentSpace` | 不变 |
| `ParentBoneSpace` | $L = \text{Parent}^{-1} \cdot C$ |
| `BoneSpace` | $L_{self} = \text{Bone}^{-1} \cdot C$（相对自身） |

逆变换（Space→CS）为上述的逆运算。

#### 核心代码

```cpp
// AnimNode_ModifyBone.cpp —— 应用顺序: Scale -> Rotation -> Translation
// Scale (Additive: 乘法累加)
NewBoneTM.SetScale3D(NewBoneTM.GetScale3D() * Scale);
// Rotation (Additive: 左乘 = 世界空间叠加)
NewBoneTM.SetRotation(BoneQuat * NewBoneTM.GetRotation());
// Translation (Additive: 向量加)
NewBoneTM.AddToTranslation(Translation);
```

#### 关键参数

`BoneToModify`、`Translation`/`Rotation`/`Scale`、`TranslationMode`/`RotationMode`/`ScaleMode`（`BMM_Ignore`/`Replace`/`Additive`）、`TranslationSpace`/`RotationSpace`/`ScaleSpace`（`EBoneControlSpace`）。

---

### 4.2 BoneDrivenController（骨骼驱动控制器）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_BoneDrivenController.h`

#### 数学原理

从一个源骨骼提取一个标量值 $x$，经映射函数变换后驱动目标骨骼的某分量。

**源值提取**（相对参考姿势的增量）：

| 源分量 | $x$ |
|--------|-----|
| Translation | $(\vec t_{cur} - \vec t_{ref})_{comp}$ |
| Rotation | $\big(q_{cur} \cdot q_{ref}^{-1}\big).\text{Euler}()_{comp}$（相对旋转差） |
| Scale（单值） | $\max(\vec s_{cur}) - \max(\vec s_{ref})$ |
| Scale（分量） | $(\vec s_{cur} - \vec s_{ref})_{comp}$ |

**映射函数**：

- 若有 `DrivingCurve`（`UCurveFloat`）：$y = \text{DrivingCurve}(x)$（任意曲线查表）
- 否则线性 + 可选 range 重映射：

$$
\alpha = \text{clamp}\!\left(\frac{x - x_{min}}{x_{max} - x_{min}},\ 0,\ 1\right), \qquad y = \text{Lerp}(y_{min}, y_{max}, \alpha) \cdot \text{Multiplier}
$$

> **关于多项式**：编辑器里编辑 `DrivingCurve` 时常用三次多项式 $y = A x^3 + B x^2 + C x + D$ 即 $((A x + B) x + C) x + D$ 的概念模型来拟合，但运行时由 `DrivingCurve->GetFloatValue(x)` 查表表达，无硬编码多项式形式。

**ModificationMode（MultiplyMode）**：

| 模式 | 公式 |
|------|------|
| `AddToInput` | $\vec t_{out}.x \mathrel{+}= y$；$q_{out} = q_{cur} \cdot \text{EulerQuat}(\Delta)$（后乘 = 局部增量） |
| `ReplaceComponent` | $\vec t_{out}.x = y$；$q_{out} = \text{EulerQuat}(\text{newEuler})$ |
| `AddToRefPose` | $\vec t_{out}.x = \vec t_{ref}.x + y$；$q_{out} = q_{ref} \cdot \text{EulerQuat}(\Delta)$ |

#### 核心代码

```cpp
// AnimNode_BoneDrivenController.cpp —— 映射
if (DrivingCurve != null) {
    FinalDriverValue = DrivingCurve->GetFloatValue(SourceValue);          // 任意曲线
} else {
    if (bUseRange) {
        float Alpha = Clamp((SourceValue - RangeMin) / (RangeMax - RangeMin), 0, 1);
        FinalDriverValue = Lerp(RemappedMin, RemappedMax, Alpha);
    }
    FinalDriverValue *= Multiplier;                                       // 线性: Final = Multiplier * x
}

// AddToInput 模式: 加到当前分量, 旋转后乘 (局部增量)
NewTrans.X += FinalDriverValue;
NewRot = NewRot * FQuat::MakeFromEuler(DeltaEuler);
```

#### 关键参数

`SourceBone`/`TargetBone`、`SourceComponent`（TranslationX/Y/Z、RotationX/Y/Z、Scale...）、`DrivingCurve`、`Multiplier`、`RangeMin/Max`、`RemappedMin/Max`、`bUseRange`、`ModificationMode`、`DestinationMode`（Bone/MorphTarget/MaterialParameter）、9 个 `bAffect*` 标志。

---

### 4.3 RotationMultiplier（旋转乘数）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_RotationMultiplier.h`
实现：`AnimGraphRuntime\Private\BoneControllers\AnimNodeRotationMultiplier.cpp`

#### 数学原理

提取源骨骼绕指定轴 $\hat a$ 的 swing 角 $\theta_{src}$（相对参考姿势），乘以 `Multiplier` 后作用到目标骨骼。

**Swing 角提取**（`ExtractAngle`）：

1. 当前轴方向：$\vec v_{cur} = q_{cur} \cdot \hat a$
2. 参考轴方向：$\vec v_{ref} = q_{ref} \cdot \hat a$
3. 对齐旋转（抵消使轴偏离的 swing）：$q_{align} = \text{FindBetween}(\vec v_{cur}, \vec v_{ref})$
4. 消掉 swing 后的旋转：$q_{aligned} = q_{align} \cdot q_{cur}$
5. 剩余的纯绕轴 delta：$\Delta q = q_{ref}^{-1} \cdot q_{aligned}$

**角度缩放与重组**：

$$
\Delta q \to (\hat n,\ \theta), \qquad \theta_{new} = \text{Multiplier} \cdot \theta
$$

$$
\boxed{\;q_{target}^{new} = q_{target,ref} \cdot \text{Quat}(\hat n,\ \theta_{new})\;}
$$

若 `bIsAdditive`，则叠加到目标当前旋转：$q_{out} = q_{cur} \cdot \text{Quat}(\hat n,\theta_{new})$。

#### 核心代码

```cpp
// AnimNodeRotationMultiplier.cpp —— Swing 角度提取与缩放
LocalRotationVector    = LocalBoneRot.RotateVector(Axis);           // 当前轴方向
ReferenceRotationVector= RefRot.RotateVector(Axis);                 // 参考轴方向
LocalToRefQuat = FQuat::FindBetweenNormals(LocalRotationVector,
                                           ReferenceRotationVector); // 最短弧对齐两向量
BoneQuatAligned = LocalToRefQuat * LocalBoneRot;                    // 抵消 swing
DeltaQuat = RefRot.Inverse() * BoneQuatAligned;                     // 剩余 = 绕轴 delta

DeltaQuat.ToAxisAndAngle(RotationAxis, RotationAngle);              // 转轴角
if ((RotationAxis | DefaultAxis) < 0) { RotationAxis = -RotationAxis; RotationAngle = -RotationAngle; }
RotationAngle = FMath::UnwindRadians(RotationAngle);                // 最短角
OutQuat = ReferenceQuat * FQuat(RotationAxis, RotationAngle * InMultiplier);  // 缩放角度
```

#### 关键参数

`SourceBone`/`TargetBone`、`Multiplier`（0 表示无操作）、`RotationAxisToRefer`（`BA_X/Y/Z`）、`bIsAdditive`（叠加 vs 替换）。

---

### 4.4 Constraint（约束节点）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_Constraint.h`
求解器：`AnimationCore\Private\Constraint.cpp` / `AnimationCoreLibrary.cpp`

#### 数学原理

**Maintain Offset 原理**：在初始化阶段，若启用 `MaintainOffset`，用参考姿势算出 source 与 target 间的固定偏移并保存。运行时用新 target 复原 source，保证 source 与 target 始终保持初始参考姿势时的相对关系。

保存偏移（`SaveInverseOffset`，base 为 Identity）：

$$
\text{Offset} = \text{Source} \cdot \text{Target}^{-1}
$$

按通道分离：位移 $\Delta\vec t = \vec t_{src} - \vec t_{tgt}$；旋转 $\Delta q = q_{tgt}^{-1} \cdot q_{src}$；缩放 $\Delta\vec s = \vec s_{src} / \vec s_{tgt}$。

应用偏移（`ApplyInverseOffset`）：用新 target 复原 source：

$$
\text{Source}_{new} = \text{Offset} \circ \text{Target}_{new}
$$

即：

$$
\vec t_{new} = \vec t_{tgt} + \Delta\vec t, \qquad q_{new} = \Delta q \cdot q_{tgt}, \qquad \vec s_{new} = \Delta\vec s \cdot \vec s_{tgt}
$$

不维持偏移时直接吸附：$\text{Source}_{new} = \text{Target}$。

**多约束按权重混合**：每个约束有权重 $w_i$，最终为各约束结果的加权混合：

$$
\text{Out} = \sum_i w_i \cdot \text{Constraint}_i(\text{Target}_i), \qquad \sum w_i \text{ 归一化}
$$

**Aim 约束**：复用 `SolveAim`（见 2.6），可叠加 `LookUp` 目标做 bank 修正。

#### 核心代码

```cpp
// Constraint.cpp —— 保存偏移
Offset.Loc  = Base.InverseTransformVectorNoScale(SourceLoc - TargetLoc);
Offset.Rot  = Base.Rot.Inverse() * (Target.Rot.Inverse() * Source.Rot);
Offset.Scale = (Source.Scale * Recip(Target.Scale)) * Recip(Base.Scale);

// 应用偏移: 用新 target 复原 source
OutSource.Loc   = InTarget.Loc   + Base.TransformVectorNoScale(Offset.Loc);
OutSource.Rot   = InTarget.Rot   * Base.Rot * Offset.Rot;
OutSource.Scale = InTarget.Scale * Base.Scale * Offset.Scale;
// 不维持偏移时: OutSource = InTarget (直接吸附)
```

#### 关键参数

`BoneToModify`、`ConstraintSetup[]`（每项含 `TargetBone`、`OffsetOption`、`TransformType`（Translation/Rotation/Scale/Parent）、`PerAxis` 轴过滤）、`ConstraintWeights[]`（每约束权重）。

---

## 五、动力学类节点

### 5.1 SpringBone（弹簧骨骼）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_SpringBone.h`

#### 数学原理

弹簧-阻尼系统，**半隐式（辛）欧拉积分**，固定 120Hz 子步。

运动方程（质量 $m=1$ 隐含，$\vec x_{rest}$ = 静止位置 = 动画位置）：

$$
m\ddot{\vec x} + c\dot{\vec x} + k(\vec x - \vec x_{rest}) = 0
$$

即：

$$
\vec F_{spring} = k\cdot(\vec x_{rest} - \vec x) = k\cdot\vec E \quad(\text{Error } \vec E)
$$

$$
\vec F_{damp} = -c\cdot\dot{\vec x}, \qquad \vec a = \vec F_{spring} - \vec F_{damp} = k\vec E - c\vec v
$$

**半隐式欧拉积分**（先更新速度，再用新速度更新位置，比显式欧拉稳定）：

$$
\boxed{\;\vec v_{n+1} = \vec v_n + \vec a \cdot \Delta t, \qquad \vec x_{n+1} = \vec x_n + \vec v_{n+1} \cdot \Delta t\;}
$$

**临界阻尼**：理论上 $c_{crit} = 2\sqrt{k\,m} = 2\sqrt{k}$。代码未显式计算，而是用经验钳制：当 $c > 1/\Delta t$ 时按比例缩放加速度，防止变帧率下阻尼发散：

$$
\text{if } c > \frac{1}{\Delta t}: \quad \vec v \mathrel{+}= \frac{1/\Delta t}{c}\cdot \vec a\cdot\Delta t
$$

位移球面投影上限：当 $\|\vec x - \vec x_{rest}\| > \text{MaxDisplacement}$，投影回 $\vec x_{rest} + \text{MaxDisplacement}\cdot\hat d$ 球面。

#### 核心代码

```cpp
// AnimNode_SpringBone.cpp —— 弹簧-阻尼 + 半隐式欧拉
FVector const Error        = (TargetPos - BoneLocation);        // x_rest - x
FVector const DampingForce = SpringDamping * BoneVelocity;      // c * v
FVector const SpringForce  = SpringStiffness * Error;           // k * Error
FVector const Acceleration = SpringForce - DampingForce;        // a = k*x - c*v

// 速度积分(半隐式), 带变帧率阻尼安全钳制
double const CutOffDampingValue = 1.0 / FixedTimeStep;           // 阻尼稳定上限 = 1/dt
if (SpringDamping > CutOffDampingValue) {
    double const SafetyScale = CutOffDampingValue / SpringDamping;
    BoneVelocity += SafetyScale * (Acceleration * FixedTimeStep);
} else {
    BoneVelocity += (Acceleration * FixedTimeStep);             // v += a*dt
}

// 位置积分(用更新后的速度)
BoneLocation += (BoneVelocity * FixedTimeStep);                  // x += v_new*dt
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `SpringStiffness`（默认 50.0） | 弹簧刚度 $k$ |
| `SpringDamping`（默认 4.0） | 阻尼系数 $c$ |
| `MaxDisplacement` / `bLimitDisplacement` | 位移球面投影上限 |
| `ErrorResetThresh`（默认 256.0） | 误差重置阈值，超出复位（捕捉传送） |
| `FixedTimeStep = (1/120)*TimeDilation` | 固定 120Hz 子步 |
| `bTranslateX/Y/Z`、`bRotateX/Y/Z` | 通道过滤 |

---

### 5.2 Trail（拖尾骨骼链）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_Trail.h`

#### 数学原理

这是**位置约束链（PBD 风格弛豫）**，不是力/积分。每帧每个子点：

1. 把上一帧位置经 `OldToNewTM` 变换到当前 component 空间（继承基座运动）；
2. 计算目标位置：$\vec P_{tgt} = \vec P_{parent} + (\vec P_{i}^{anim} - \vec P_{i-1}^{anim})$（父点当前位置 + 参考姿态下的骨向量）；
3. 用指数衰减逼近（等价一阶低通滤波）：

$$
\text{corr} = \text{clamp}(\Delta t \cdot \text{speed} \cdot \text{scale},\ 0,\ 1)
$$

$$
\boxed{\;\vec P_i^{new} = \vec P_i + \text{corr}\cdot(\vec P_{tgt} - \vec P_i)\;}
$$

这等价于 $x(t+\Delta t) = x(t) + (1 - e^{-k\Delta t})(\text{target} - x)$ 的线性化，决定拖尾"滞后"程度。

4. **拉伸约束**：把点投影回以父点为圆心、半径 $l_{ref} + \text{StretchLimit}$ 的球面，保持链长：

$$
\text{if } \|\vec P_i - \vec P_{i-1}\| - l_{ref} > \text{StretchLimit}: \quad \vec P_i = \vec P_{i-1} + \hat d\cdot(l_{ref} + \text{StretchLimit})
$$

#### 核心代码

```cpp
// AnimNode_Trail.cpp —— 逐点位置约束
for (int32 i = 1; i < ChainBoneIndices.Num(); i++) {
    FVector ParentPos     = TrailBoneLocations[i - 1];
    FVector TargetDelta   = (ChildAnimPos - ParentAnimPos);      // 参考姿态 offset
    FVector ChildTarget   = ParentPos + TargetDelta;            // 子目标 = 父 + 偏移
    FVector Error         = (ChildTarget - ChildPos);
    // 弛豫: 按速度逐帧逼近, correction ∈ [0,1]
    const float Correction = FMath::Clamp(TimeStep * SpeedScale *
        PerJointTrailData[i].TrailRelaxationSpeedPerSecond, 0.f, 1.f);
    TrailBoneLocations[i] = ChildPos + (Error * Correction);     // 朝目标 lerp
}

// 拉伸约束: 投影回球面
if (bLimitStretch) {
    double RefPoseLength = TargetDelta.Size();
    double CurrentLength = (TrailBoneLocations[i] - TrailBoneLocations[i-1]).Size();
    if (CurrentLength - RefPoseLength > StretchLimit) {
        FVector CurrentDir = (TrailBoneLocations[i] - TrailBoneLocations[i-1]) / CurrentLength;
        TrailBoneLocations[i] = TrailBoneLocations[i-1] + CurrentDir * (RefPoseLength + StretchLimit);
    }
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `ChainLength`（默认 2） | 链长度 |
| `TrailRelaxationSpeed`（FRuntimeFloatCurve，沿链插值） | 每点弛豫速度（根→末），决定滞后程度 |
| `RelaxationSpeedScale`（默认 1.0） | 全局缩放 |
| `StretchLimit` / `bLimitStretch` | 拉伸上限（球面投影半径增量） |
| `FakeVelocity` | 模拟惯性的人为速度 |
| `RotationLimits[]` / `PlanarLimits[]` | 角度/平面碰撞约束 |

---

### 5.3 AnimDynamics（动画动力学）

**文件**：`AnimGraphRuntime\Public\BoneControllers\AnimNode_AnimDynamics.h`
求解器：`Engine\Private\Animation\AnimPhysicsSolver.cpp`（基于 Stan Melax 的 sandbox 物理代码）

#### 数学原理

局部空间刚体仿真。状态为位置 $\vec x$、朝向 $q$（四元数）、线动量 $\vec P$、角动量 $\vec L$；自旋 $\vec\omega = I_{world}^{-1}\cdot\vec L$（$I$ 为惯量张量）。

**阻尼**（指数衰减，帧率无关）：$\vec P \mathrel{*}= (1-c)^{\Delta t}$，$\vec L \mathrel{*}= (1-c)^{\Delta t}$。

**力积分**（前向欧拉）：$\vec P \mathrel{+}= \vec F\cdot\Delta t$（$\vec F = m\vec g$ 等）。

**位置积分**（半隐式欧拉）：$\vec x_{n+1} = \vec x_n + \vec P_n \cdot m^{-1}\cdot\Delta t$。

**朝向积分**（四元数 RK4）：四元数微分方程 $\dot q = \tfrac{1}{2}\,\omega_{quat}\cdot q$，其中 $\omega_{quat} = (0,\vec\omega)$。

$$
\frac{dq}{dt} = \frac{1}{2}\,\Omega(\vec\omega)\, q, \qquad \Omega = \begin{pmatrix}0 & -\omega_x & -\omega_y & -\omega_z \\ \omega_x & 0 & \omega_z & -\omega_y \\ \omega_y & -\omega_z & 0 & \omega_x \\ \omega_z & \omega_y & -\omega_x & 0\end{pmatrix}
$$

经典四阶 Runge-Kutta：

$$
k_1 = f(q,\ \vec L),\quad k_2 = f(q + \tfrac{\Delta t}{2}k_1,\ \vec L),\quad k_3 = f(q + \tfrac{\Delta t}{2}k_2,\ \vec L),\quad k_4 = f(q + \Delta t\, k_3,\ \vec L)
$$

$$
q_{n+1} = \text{normalize}\!\left(q_n + \frac{\Delta t}{6}(k_1 + 2k_2 + 2k_3 + k_4)\right)
$$

**Sequential Impulse（顺序冲量法）约束求解**：迭代求解线性/角度 limit。每个约束计算冲量 $\vec j$：

$$
\vec v_{contact} = \vec\omega \times \vec r + \vec P\cdot m^{-1}, \qquad \vec j = \text{InverseInertiaImpulse}\cdot\Delta\vec v
$$

$$
\vec P \mathrel{+}= \vec j, \qquad \vec L \mathrel{+}= \vec r \times \vec j
$$

Pre/Post 两阶段，Post 阶段 `RemoveBias` 去除为满足约束引入的伪速度防抖。

**弹簧力**：线性弹簧 $F = -k\cdot|\vec x|$，角弹簧 $\tau = -k\cdot\theta$（$\theta$ 由 `FindBetween` 求轴-角）。

#### 核心代码

```cpp
// AnimPhysicsSolver.cpp —— 四元数 RK4 积分
// dq/dt = 0.5 * omega(quat) * q,  omega = I^-1 * L
FVector HalfSpin = (OrientAsMatrix * InverseTensor * OrientAsMatrix.Transpose())
                   .TransformVector(AngularMomentum) * 0.5f;
FQuat SpinQuat(HalfSpin.X, HalfSpin.Y, HalfSpin.Z, 0.0f);
return SpinQuat * NormalisedOrient;     // dq

// 经典四阶 Runge-Kutta
FQuat d1 = DiffQ(q,         I, L);
FQuat d2 = DiffQ(q+d1*(dt/2), I, L);
FQuat d3 = DiffQ(q+d2*(dt/2), I, L);
FQuat d4 = DiffQ(q+d3*dt,     I, L);
return (q + d1*(dt/6) + d2*(dt/3) + d3*(dt/3) + d4*(dt/6)).GetNormalized();
```

```cpp
// AnimPhysicsSolver.cpp —— 动量积分 + Sequential Impulse
// 1) 力/阻尼/重力积分到动量
float LinearDampingLeftOver = FMath::Pow(1.0f - LinearDampingForBody, DeltaTime);  // 指数阻尼
InBody->LinearMomentum *= LinearDampingLeftOver;
InBody->LinearMomentum += Force * DeltaTime;          // P += F*dt

// 2) 弹簧力
for(Spring) Spring.ApplyForces(dt);

// 3) Pre-iterations: 约束求解(冲量法)
for(Iteration < NumPreIterations)  { for(Limit) CurrentLimit.Iter(dt); }
// 4) 用解算后的动量前向欧拉更新位姿
for(Body) CalculateNextPose(dt, Body);
// 5) RemoveBias 清掉仅为满足约束而加的速度, 防抖
// 6) Post-iterations 再迭代
for(Iteration < NumPostIterations) { for(Limit) CurrentLimit.Iter(dt); }
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `LinearSpringConstant` / `bLinearSpring` | 线性弹簧 $k$（按 `*Scale` 缩放） |
| `AngularSpringConstant` / `bAngularSpring` | 角弹簧 $k$（按 `*Scale³` 缩放） |
| `LinearDampingOverride` / `AngularDampingOverride`（默认 0.7） | 阻尼 |
| `GravityScale` / `GravityOverride` | 重力 |
| `NumSolverIterationsPreUpdate`（默认 4）/ `NumSolverIterationsPostUpdate`（默认 1） | 约束迭代次数 |
| `SimulationSpace` | 仿真空间（Component/Actor/World/RootRelative/BoneRelative） |
| `SphericalLimits` / `PlanarLimits` / `ConstraintSetup` | 球面/平面/锥角/扭转约束 |
| `WindScale` / `bEnableWind` | 风力 |

## 六、惯性化外推与混合类补充节点

### 6.1 DeadBlending（死混合 / 惯性化外推）

> 源码：`Engine\Private\Animation\AnimNode_DeadBlending.cpp`、`AnimNode_DeadBlending.h`

DeadBlending（死混合）是 UE 5 中 Inertialization（惯性化）的新一代实现。与传统的 Inertialization 节点（五次多项式衰减）不同，DeadBlending 采用**指数衰减 + 速度前向外推**模型，基于"半衰期（half-life）"参数控制衰减速率，数学上更简洁且物理意义更明确。

#### 数学原理

当动画源节点突然停止或切换时，DeadBlending 记录上一帧的姿态 $x_0$ 与速度 $v$，然后沿速度方向前向外推，同时以指数衰减让速度趋于零。衰减常数由半衰期 $h$ 决定：

$$
c = \frac{\ln 2}{h}
$$

衰减因子为 $(1 - e^{-c\,t})$。对于**平移**外推：

$$
x(t) = x_0 + \frac{v}{c}\left(1 - e^{-c\,t}\right)
$$

对于**旋转**，采用旋转向量（axis-angle 的 $\theta\hat n$ 形式）外推后左乘到原旋转上：

$$
q(t) = \text{Exp}\!\left(\frac{v}{c}\left(1 - e^{-c\,t}\right)\right) \cdot q_0
$$

对于**缩放**，默认采用指数插值（Eerp），在 log 空间外推：

$$
s(t) = \text{Exp}\!\left(\frac{v}{c}\left(1 - e^{-c\,t}\right)\right) \cdot s_0
$$

#### 自适应半衰期

DeadBlending 的核心创新是**根据速度与位移差自适应调整每根骨骼的半衰期**。设源→目标位移差 $\Delta = x_{dst} - x_{src}$，当前速度 $v$，则：

$$
h_{adapt} = \text{Clamp}\!\left(h \cdot \frac{\Delta}{\text{sign}(v)\cdot\max(|v|,\varepsilon)},\ h_{min},\ h_{max}\right)
$$

- 当速度方向与位移方向一致时：速度越大→半衰期越小（快速到达目标）；速度越小→半衰期越大（缓慢逼近）。
- 当速度方向与位移相反时：结果为负，被 clamp 到 $h_{min}$（快速停止）。

#### 核心代码

```cpp
// AnimNode_DeadBlending.cpp —— 指数衰减前向外推
static constexpr float Ln2 = 0.69314718056f;

static inline FVector ExtrapolateTranslation(
    const FVector Translation, const FVector3f Velocity, const float Time,
    const FVector3f DecayHalflife, const float Epsilon = UE_SMALL_NUMBER)
{
    if (Velocity.SquaredLength() > Epsilon)
    {
        const FVector3f C = VectorDivMax(Ln2, DecayHalflife, Epsilon);          // c = ln2 / h
        return Translation + (FVector)(
            VectorDivMax(Velocity, C, Epsilon) *                                 // (v/c)
            (FVector3f::OneVector - VectorInvExpApprox(C * Time)));               // *(1 - e^{-c*t})
    }
    return Translation;
}

// 旋转外推：用旋转向量形式
static inline FQuat ExtrapolateRotation(...)
{
    const FVector3f C = VectorDivMax(Ln2, DecayHalflife, Epsilon);
    return FQuat::MakeFromRotationVector(
        (FVector)(VectorDivMax(Velocity, C, Epsilon) *
        (FVector3f::OneVector - VectorInvExpApprox(C * Time)))) * Rotation;
}

// 自适应半衰期
static inline float ComputeDecayHalfLifeFromDiffAndVelocity(
    const float SrcDstDiff, const float SrcVelocity,
    const float HalfLife, const float HalfLifeMin, const float HalfLifeMax,
    const float Epsilon = UE_KINDA_SMALL_NUMBER)
{
    return FMath::Clamp(
        HalfLife * (SrcDstDiff / ClipMagnitudeToGreaterThanEpsilon(SrcVelocity, Epsilon)),
        HalfLifeMin, HalfLifeMax);
}
```

#### 速度估计与限幅

速度通过相邻两帧差分计算，并做最大速度限幅防止外推爆炸：

```cpp
// 速度 = (当前 - 上一帧) / dt
BoneTranslationVelocities[Idx] = (FVector3f)(TranslationDiff / SrcPoseCurr.DeltaTime);
BoneTranslationVelocities[Idx] = BoneTranslationVelocities[Idx].GetClampedToMaxSize(MaximumTranslationVelocity);
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `ExtrapolationHalfLife` | 基准半衰期 $h$（秒），控制总体衰减速度 |
| `ExtrapolationHalfLifeMin` / `Max` | 自适应半衰期的 clamp 范围 |
| `MaximumTranslationVelocity` / `RotationVelocity` / `ScaleVelocity` | 速度限幅，防外推爆炸 |
| `bLinearlyInterpolateScales` | 缩放是否用线性插值（默认 false = Eerp 指数插值） |

---

### 6.2 BlendSpace 系列（混合空间）

> 源码：`AnimGraphRuntime\Private\AnimNodes\AnimNode_BlendSpacePlayer.cpp`、`AnimNode_RotationOffsetBlendSpace.cpp`、`AnimNode_BlendSpaceEvaluator.cpp`

BlendSpace（混合空间）是 UE 中最常用的动画混合节点之一，通过在 2D 参数空间中放置多个动画样本，根据输入坐标自动插值生成混合姿态。

#### 数学原理

**1. 网格采样与三角剖分**

BlendSpace 在 2D 参数空间（如速度 × 方向）中放置动画样本。当输入坐标 $(x, y)$ 落入某三角形单元时，通过**Delaunay 三角剖分**确定其所在的三角形单元的三个顶点样本 $S_1, S_2, S_3$，然后用**重心坐标**计算权重：

$$
w_i = \text{Barycentric}(x, y,\ S_1, S_2, S_3)
$$

满足 $w_1 + w_2 + w_3 = 1$，每个 $w_i \geq 0$。

**2. 权重归一化**

`FBlendSampleData::NormalizeDataWeight` 确保所有活跃样本权重之和为 1：

$$
w_i' = \frac{w_i}{\sum_j w_j}
$$

**3. 逐轴惯性混合滤波**

BlendSpacePlayer 在坐标快速变化时使用 `BlendFilter`（逐轴惯性化滤波器）平滑过渡，避免姿态跳变。每个轴的惯性滤波独立处理：

$$
x_{smooth}(t) = x_{smooth}(t-\Delta t) + (x_{target} - x_{smooth}(t-\Delta t)) \cdot (1 - e^{-k\cdot\Delta t})
$$

#### RotationOffsetBlendSpace（AimOffset）

RotationOffsetBlendSpace（瞄准偏移混合空间）是 BlendSpace 的变体，专门用于**叠加旋转**。它将 BlendSpace 输出的 Mesh Space 旋转作为叠加姿态，叠加到基础姿态上：

$$
q_{out} = \text{AccumulateMeshSpaceRotationAdditive}(q_{base},\ \Delta q_{blendSpace}^{\,\alpha})
$$

当 `bApplyAdditiveInRootSpace` 为 true 时，使用根空间旋转叠加。

#### 核心代码

```cpp
// AnimNode_RotationOffsetBlendSpace.cpp —— 叠加混合空间旋转
void FAnimNode_RotationOffsetBlendSpace::Evaluate_AnyThread(FPoseContext& Context)
{
    BasePose.Evaluate(Context);  // 1. 求值基础姿态

    if (bIsLODEnabled && FAnimWeight::IsRelevant(ActualAlpha) && GetBlendSpace())
    {
        // 2. 求值 MeshSpace 旋转叠加混合空间
        FPoseContext MeshSpaceRotationAdditivePoseContext(Context);
        FAnimNode_BlendSpacePlayer::Evaluate_AnyThread(MeshSpaceRotationAdditivePoseContext);

        // 3. 叠加到基础姿态
        FAnimationPoseData BaseAnimationPoseData(Context);
        const FAnimationPoseData AdditiveAnimationPoseData(MeshSpaceRotationAdditivePoseContext);

        if (bApplyAdditiveInRootSpace)
            FAnimationRuntime::AccumulateRootSpaceRotationAdditiveToLocalPose(
                BaseAnimationPoseData, AdditiveAnimationPoseData, ActualAlpha);
        else
            FAnimationRuntime::AccumulateMeshSpaceRotationAdditiveToLocalPose(
                BaseAnimationPoseData, AdditiveAnimationPoseData, ActualAlpha);

        Context.Pose.NormalizeRotations();  // 叠加后需归一化四元数
    }
}
```

---

## 七、镜像与驱动类节点

### 7.1 Mirror（镜像节点）

> 源码：`AnimGraphRuntime\Private\AnimNodes\AnimNode_Mirror.cpp`、`Engine\Private\Animation\AnimationRuntime.cpp:1432`

Mirror 节点通过 `MirrorDataTable`（镜像数据表）将骨骼姿态沿指定轴镜像。镜像不仅是简单的轴翻转，还涉及骨骼映射和参考旋转校正。

#### 数学原理

**1. 向量镜像（MirrorVector）**

沿镜像轴 $M$（如 X 轴）翻转，即翻转镜像轴的符号分量：

$$
\vec v_{mirrored} = \text{MirrorVector}(\vec v,\ M)
$$

对于镜像轴为 X 的情况：$\vec v' = (-v_x,\ v_y,\ v_z)$

**2. 四元数镜像（MirrorQuat）**

四元数镜像通过翻转与镜像轴相关的分量实现。设镜像轴为 X，则：

$$
q_{mirrored} = (q_w,\ -q_x,\ q_y,\ -q_z)
$$

一般规律：**w 分量不变，镜像轴分量取反，另一正交分量也取反**。

**3. 参考旋转校正**

当源骨骼和目标骨骼不同（如左臂→右臂）时，镜像后需要校正旋转以对齐目标骨骼的参考朝向：

$$
q_{corrected} = q_{mirrored} \cdot \text{MirrorQuat}(q_{ref}^{src},\ M)^{-1} \cdot q_{ref}^{tgt}
$$

**4. 完整镜像变换**

对于非根骨骼，镜像变换在父骨骼空间中进行：

```
T' = R_parent^{tgt} . Unrotate( MirrorVector( R_parent^{src} . Rotate(T), M ) )
Q' = R_parent^{src} * Q  →  MirrorQuat(·, M)  →  * 校正  →  R_parent^{tgt}^{-1} *
S' = S  (缩放不变)
```

#### 核心代码

```cpp
// AnimationRuntime.cpp —— MirrorPose 的 MirrorTransform lambda
auto MirrorTransform = [&](const FTransform& SourceTransform,
    const FCompactPoseBoneIndex& SourceParentIndex, const FCompactPoseBoneIndex& SourceBoneIndex,
    const FCompactPoseBoneIndex& TargetParentIndex, const FCompactPoseBoneIndex& TargetBoneIndex) -> FTransform
{
    // 平移：旋转到父空间 → 镜像 → 旋转回目标父空间
    FVector T = SourceTransform.GetTranslation();
    T = SourceParentRefRotation.RotateVector(T);
    T = MirrorVector(T, MirrorAxis);
    T = TargetParentRefRotation.UnrotateVector(T);

    // 旋转：旋转到父空间 → 镜像 → 参考旋转校正 → 旋转回目标父空间
    FQuat Q = SourceTransform.GetRotation();
    Q = SourceParentRefRotation * Q;
    Q = MirrorQuat(Q, MirrorAxis);
    Q *= MirrorQuat(SourceBoneRefRotation, MirrorAxis).Inverse() * TargetBoneRefRotation;  // 校正
    Q = TargetParentRefRotation.Inverse() * Q;

    FVector S = SourceTransform.GetScale3D();  // 缩放不变
    return FTransform(Q, T, S);
};
```

---

### 7.2 PoseDriver / RBF Solver（姿态驱动器 / 径向基函数求解器）

> 源码：`AnimGraphRuntime\Private\RBF\RBFSolver.cpp`、`AnimNodes\AnimNode_PoseDriver.cpp`

PoseDriver 通过 RBF（Radial Basis Function，径向基函数）求解器，根据输入骨骼变换在多个目标姿态间分配权重，驱动 PoseAsset 或曲线。是制作矫正姿态（corrective pose）的核心节点。

#### 数学原理

**1. 距离度量**

RBF 首先计算输入 $x$ 与每个目标 $t_i$ 之间的距离 $d_i$，支持多种距离度量：

| 方法 | 公式 |
|------|------|
| Euclidean（欧氏） | $d = \sqrt{\sum_k (\Delta\theta_k)^2}$（Rotator 分量差） |
| Quaternion（四元数弧长） | $d = \arccos(\|q_1 \cdot q_2\|)$ |
| SwingAngle（摆动角） | 绕 twist 轴正交平面的旋转角 |
| TwistAngle（扭转角） | 绕 twist 轴的旋转分量 |

多目标时取平方和开根：$d_{total} = \sqrt{\sum_i d_i^2}$

**2. 核函数（Kernel）**

根据距离 $x = d / \text{radius}$ 计算权重：

| 核函数 | 公式 |
|--------|------|
| Gaussian | $w = e^{-x^2}$ |
| Linear | $w = \max(1 - x,\ 0)$ |
| Exponential | $w = e^{-x}$ |
| Cubic | $w = (1 - x)^3$ |
| Quintic | $w = (1 - x)^5$ |

**3. Additive 求解器**

最简单的求解方式，对每个目标独立计算核函数权重，不做插值：

$$
w_i = \text{Kernel}\!\left(\frac{d(x,\ t_i)}{r_i}\right)
$$

**4. Interpolative 求解器**

构建 RBF 插值矩阵，确保当输入恰好落在某目标上时权重为 1（精确插值），需要求解线性方程组 $W \cdot \lambda = y$。

**5. 权重归一化**

| 方法 | 行为 |
|------|------|
| OnlyNormalizeAboveOne | 仅当总权重 > 1 时归一化（默认，保留"不足 1"的衰减效果） |
| AlwaysNormalize | 始终归一化到总和 1 |
| NormalizeWithinMedian | 在中值距离范围内渐变归一化，$w' = \text{Lerp}(w/\sum w,\ w,\ \text{bias})$ |

#### 核心代码

```cpp
// RBFSolver.cpp —— Additive 求解
static void SolveAdditive(const FRBFParams& Params, const TArray<FRBFTarget>& Targets,
    const FRBFEntry& Input, float* AllWeights)
{
    for (int32 TargetIdx = 0; TargetIdx < Targets.Num(); TargetIdx++)
    {
        const FRBFTarget& Target = Targets[TargetIdx];
        // 1. 计算距离
        const float Distance = FRBFSolver::FindDistanceBetweenEntries(Target, Input, Params, Target.DistanceMethod);
        // 2. 距离 / 半径归一化
        const float Scaling = FRBFSolver::GetRadiusForTarget(Target, Params);
        const float X = Distance / Scaling;
        // 3. 核函数求权重
        float Weight = GetWeightedValue(X, 1.0f, FunctionType, /*BackCompFix=*/true);
        AllWeights[TargetIdx] = Weight;
    }
}

// 核函数
case ERBFFunctionType::Gaussian:
    return FMath::Exp(-Value * Value);           // e^{-x^2}
case ERBFFunctionType::Linear:
    return FMath::Max(1.0f - Value, 0.0f);        // max(1-x, 0)
case ERBFFunctionType::Exponential:
    return 1.f / FMath::Exp(Value);               // e^{-x}
```

```cpp
// RBFSolver.cpp —— 权重归一化
float TotalWeight = 0.f;
for (float Weight : AllWeights) TotalWeight += Weight;

float WeightScale = 1.f;
if (TotalWeight > 1.f) {
    WeightScale = 1.f / TotalWeight;             // 超过1则归一化
} else {
    switch (Params.NormalizeMethod) {
        case ERBFNormalizeMethod::AlwaysNormalize:
            WeightScale = 1.f / TotalWeight;     // 始终归一化
            break;
        case ERBFNormalizeMethod::NormalizeWithinMedian:
            // 中值距离范围内渐变: bias = (d - min) / (max - min)
            float Bias = FMath::Clamp((MedianDistance - Min) / (Max - Min), 0.f, 1.f);
            WeightScale = FMath::Lerp(1.f / TotalWeight, 1.f, Bias);
            break;
    }
}
```

---

### 7.3 ModifyCurve（曲线修改节点）

> 源码：`AnimGraphRuntime\Private\AnimNodes\AnimNode_ModifyCurve.cpp`

ModifyCurve 对动画曲线值进行数学运算，支持多种 ApplyMode。

#### 数学原理

| ApplyMode | 运算 | 公式 |
|-----------|------|------|
| Add | 加 | $\text{result} = \text{current} + \text{new}$ |
| Scale | 乘 | $\text{result} = \text{current} \times \text{new}$ |
| Blend | 覆盖 | $\text{result} = \text{new}$ |
| RemapCurve | 重映射 | $\text{result} = \min(\max(\text{current} - \text{new},\ 0) \times \text{scale},\ 1)$ |
| WeightedMovingAverage | 加权移动平均 | $\text{result} = (1-\alpha)\cdot\text{current} + \alpha\cdot\text{new}$ |

运算后统一通过 Alpha 插值到输出：

$$
\text{out} = \text{Lerp}(\text{current},\ \text{result},\ \alpha)
$$

#### 核心代码

```cpp
// AnimNode_ModifyCurve.cpp —— ProcessCurveOperation
switch (Mode)
{
case EModifyCurveApplyMode::Add:
    Result = CurrentValue + NewValue;                           // current + new
    break;
case EModifyCurveApplyMode::Scale:
    Result = CurrentValue * NewValue;                           // current * new
    break;
case EModifyCurveApplyMode::Blend:
    Result = NewValue;                                          // 直接覆盖
    break;
case EModifyCurveApplyMode::RemapCurve:
    Result = FMath::Min(FMath::Max(CurrentValue - NewValue, 0.f) * Scale, 1.f);
    break;
case EModifyCurveApplyMode::WeightedMovingAverage:
    Result = FMath::Lerp(CurrentValue, NewValue, Alpha);        // 加权移动平均
    break;
}
// 最终通过 Alpha 混合到输出
OutputValue = FMath::Lerp(CurrentValue, Result, Alpha);
```

---

## 八、骨骼控制类补充节点

### 8.1 CopyBone / CopyBoneDelta（骨骼复制）

> 源码：`AnimGraphRuntime\Private\BoneControllers\AnimNode_CopyBone.cpp`、`AnimNode_CopyBoneDelta.cpp`

**CopyBone** 将源骨骼的变换（平移/旋转/缩放，可按通道选择）复制到目标骨骼，支持空间转换。

**CopyBoneDelta** 复制源骨骼相对于参考姿态的**增量（delta）**到目标骨骼，支持 Accumulate（累加）和 Copy（覆盖）两种模式。

#### 数学原理

CopyBoneDelta 的核心是计算源骨骼相对参考姿态的增量变换：

$$
\Delta T_{src} = T_{src} \circ T_{ref}^{-1}
$$

然后根据模式应用到目标骨骼：

- **Accumulate（累加）**：$\text{tgt}' = \text{tgt} + \Delta T_{src} \times \text{multiplier}$
- **Copy（覆盖）**：$\text{tgt}' = \Delta T_{src} \times \text{multiplier}$

旋转增量通过轴-角分解后乘以旋转乘数：

$$
\Delta q = \text{Quat}(\hat n,\ \theta \cdot m)
$$

#### 核心代码

```cpp
// AnimNode_CopyBoneDelta.cpp —— 增量复制
SourceTM.SetToRelativeTransform(RefLSTransform);  // Delta = Src - Ref

if (CopyMode == CopyBoneDeltaMode::Accumulate)
{
    if (bCopyTranslation)
        TargetTM.AddToTranslation(SourceTM.GetTranslation() * TranslationMultiplier);
    if (bCopyRotation)
    {
        FVector Axis; float Angle;
        SourceTM.GetRotation().ToAxisAndAngle(Axis, Angle);     // 轴-角分解
        TargetTM.SetRotation(FQuat(Axis, Angle * RotationMultiplier) * TargetTM.GetRotation());
    }
    if (bCopyScale)
        TargetTM.SetScale3D(TargetTM.GetScale3D() * (SourceTM.GetScale3D() * ScaleMultiplier));
}
else // Copy 模式：直接覆盖
{
    if (bCopyRotation)
    {
        FVector Axis; float Angle;
        SourceTM.GetRotation().ToAxisAndAngle(Axis, Angle);
        TargetTM.SetRotation(FQuat(Axis, Angle * RotationMultiplier));
    }
}
```

---

### 8.2 TwistCorrectiveNode（扭转校正节点）

> 源码：`AnimGraphRuntime\Private\BoneControllers\AnimNode_TwistCorrectiveNode.cpp`

TwistCorrectiveNode 通过测量骨骼的扭转角度来驱动矫正曲线值，常用于制作肘部/膝盖弯曲时的肌肉形变矫正。

#### 数学原理

节点计算**基础轴**与**扭转轴**在扭转平面法线上的投影角度差：

1. 取扭转平面法线 $\vec n$（通过 `TwistPlaneNormalAxis` 变换到骨骼空间）
2. 计算基础轴与法线的点积：$d_{base} = \vec n \cdot \vec v_{base}$
3. 计算扭转轴与法线的点积：$d_{twist} = \vec n \cdot \vec v_{twist}$
4. 通过反正弦得到角度：$\theta_{base} = \arcsin(d_{base})$，$\theta_{twist} = \arcsin(d_{twist})$
5. 角度差：$\Delta\theta = \theta_{twist} - \theta_{base}$

然后将角度差映射到 $[0, 1]$ 范围驱动曲线：

$$
\text{value} = \frac{\text{Clamp}(\Delta\theta,\ \theta_{ref},\ \theta_{max}) - \theta_{ref}}{\theta_{max} - \theta_{ref}} \times (\text{RemappedMax} - \text{RemappedMin})
$$

#### 核心代码

```cpp
// AnimNode_TwistCorrectiveNode.cpp —— 角度计算
float FAnimNode_TwistCorrectiveNode::GetAngle(const FVector& Base, const FVector& Twist,
    const FTransform& ReferencetBoneTransform) const
{
    FVector TwistPlaneNormal = TwistPlaneNormalAxis.GetTransformedAxis(ReferencetBoneTransform);

    float BaseAngle = 0.0f, TwistAngle = 0.0f;
    float BaseDotProduct = FVector::DotProduct(TwistPlaneNormal, Base);
    if (BaseDotProduct > 0.0f)
        BaseAngle = FMath::Asin(BaseDotProduct);        // θ_base = arcsin(n·v_base)

    float TwistDotProduct = FVector::DotProduct(TwistPlaneNormal, Twist);
    if (TwistDotProduct > 0.0f)
        TwistAngle = FMath::Asin(TwistDotProduct);      // θ_twist = arcsin(n·v_twist)

    return TwistAngle - BaseAngle;                       // Δθ = θ_twist - θ_base
}

// 映射到 [RemappedMin, RemappedMax]
const float FinalMappedValue = (FMath::Clamp(CurAngle, ReferenceAngle, RangeMaxInRadian) - ReferenceAngle)
    * (RemappedMax - RemappedMin) / (RangeMaxInRadian - ReferenceAngle);
Context.Curve.Set(CurveName, FinalMappedValue * Alpha);
```

---

### 8.3 HandIKRetargeting（手部 IK 重定向）

> 源码：`AnimGraphRuntime\Private\BoneControllers\AnimNode_HandIKRetargeting.cpp`

HandIKRetargeting 用于在不同骨骼比例的角色间重定向手部位置，通过计算 IK 手到 FK 手的平移差，按权重混合后施加到目标骨骼。

#### 数学原理

根据 `HandFKWeight` 在左右手之间混合 FK 和 IK 位置：

$$
\vec p_{FK} = \text{Lerp}(\vec p_{FK}^{left},\ \vec p_{FK}^{right},\ w_{FK})
$$

$$
\vec p_{IK} = \text{Lerp}(\vec p_{IK}^{left},\ \vec p_{IK}^{right},\ w_{FK})
$$

计算 IK→FK 的平移差（按轴应用 `PerAxisAlpha`）：

$$
\vec \Delta = (\vec p_{FK} - \vec p_{IK}) \times \vec \alpha_{perAxis}
$$

将平移差施加到所有 `IKBonesToMove` 骨骼：

$$
\vec p'_{bone} = \vec p_{bone} + \vec \Delta
$$

#### 核心代码

```cpp
// AnimNode_HandIKRetargeting.cpp
// 按权重混合左右手的 FK/IK 位置
FKLocation = FMath::Lerp<FVector>(LeftHandFKLocation, RightHandFKLocation, HandFKWeight);
IKLocation = FMath::Lerp<FVector>(LeftHandIKLocation, RightHandIKLocation, HandFKWeight);

// IK → FK 平移差，按轴应用 alpha
const FVector IK_To_FK_Translation = (FKLocation - IKLocation) * PerAxisAlpha;

// 施加到目标骨骼
for (const FBoneReference& BoneReference : IKBonesToMove)
{
    FTransform BoneTransform = Output.Pose.GetComponentSpaceTransform(BoneIndex);
    BoneTransform.AddToTranslation(IK_To_FK_Translation);
    OutBoneTransforms.Add(FBoneTransform(BoneIndex, BoneTransform));
}
```

---

### 8.4 ScaleChainLength（链长缩放）

> 源码：`AnimGraphRuntime\Private\BoneControllers\AnimNode_ScaleChainLength.cpp`

ScaleChainLength 通过缩放骨骼链的局部平移，使链的总长度匹配到目标位置。

#### 数学原理

计算期望链长与初始链长的比值，按 Alpha 混合后统一缩放链上每根骨骼的平移：

$$
s = \frac{|\vec p_{target} - \vec p_{start}|}{L_{initial}}
$$

$$
s_{\alpha} = \text{Lerp}(1,\ s,\ \alpha)
$$

$$
\vec t'_i = \vec t_i \cdot s_{\alpha} \quad \forall i \in \text{chain}
$$

初始链长 $L_{initial}$ 有三种计算方式：
- **FixedDefaultLengthValue**：使用固定 `DefaultChainLength`
- **Distance**：链首尾在组件空间的距离
- **ChainLength**：所有骨骼局部平移长度之和

#### 核心代码

```cpp
// AnimNode_ScaleChainLength.cpp
const double DesiredChainLength = (TargetLocationCompSpace - StartTransformCompSpace.GetLocation()).Size();
const double InitialChainLength = GetInitialChainLength(Output.Pose, CSPose);
const double ChainLengthScale = DesiredChainLength / InitialChainLength;
const double ChainLengthScaleWithAlpha = FMath::LerpStable(1.0, ChainLengthScale, ActualAlpha);

// 缩放链上所有骨骼的局部平移
for (const FCompactPoseBoneIndex& BoneIndex : ChainBoneIndices)
{
    LSPose[BoneIndex].ScaleTranslation(ChainLengthScaleWithAlpha);
}
```

---

### 8.5 ApplyLimits（角度限制）

> 源码：`AnimGraphRuntime\Private\BoneControllers\AnimNode_ApplyLimits.cpp`、`AnimationCore\Private\AngularLimit.h`

ApplyLimits 对骨骼旋转施加欧拉角范围限制，将旋转约束在 $[\theta_{min},\ \theta_{max}]$ 范围内。

#### 数学原理

将骨骼旋转相对于参考姿态旋转分解为欧拉角，然后逐轴 clamp：

$$
\theta_{clamped} = \text{Clamp}(\theta_{current},\ \theta_{min} + \theta_{offset},\ \theta_{max} + \theta_{offset})
$$

约束后通过 Alpha 与原始姿态混合：

$$
\text{out} = \text{Lerp}(\text{original},\ \text{clamped},\ \alpha)
$$

#### 核心代码

```cpp
// AnimNode_ApplyLimits.cpp
FQuat BoneRotation = BoneTransform.GetRotation();
// 相对参考姿态的欧拉角范围约束
if (AnimationCore::ConstrainAngularRangeUsingEuler(
        BoneRotation, RefBoneTransform.GetRotation(),
        AngularLimit.LimitMin + AngularOffsets[i],
        AngularLimit.LimitMax + AngularOffsets[i]))
{
    BoneTransform.SetRotation(BoneRotation);
    bAppliedLimit = true;
}

// 通过 alpha 混合约束后姿态与原始姿态
FAnimationRuntime::BlendTwoPosesTogether(AnimationPoseData0, AnimationPoseData1, BlendWeight, BlendedAnimationPoseData);
```

---

### 8.6 CopyPoseFromMesh（从网格复制姿态）

> 源码：`AnimGraphRuntime\Private\AnimNodes\AnimNode_CopyPoseFromMesh.cpp`

CopyPoseFromMesh 从另一个 SkeletalMeshComponent 复制骨骼姿态到当前组件，支持不同骨架间的骨骼名映射。常用于角色装备（武器、服装）跟随主体角色动画。

#### 数学原理

当源骨架与目标骨架不同时，通过骨骼名建立映射表 `BoneMapToSource`。复制时若使用 `bUseMeshPose`，直接复制组件空间变换；否则将组件空间变换转换为局部空间：

$$
\text{Local}_{target} = \text{CS}_{child} \circ \text{CS}_{parent}^{-1}
$$

即子骨骼组件空间变换相对于父骨骼组件空间变换的相对变换。

#### 核心代码

```cpp
// AnimNode_CopyPoseFromMesh.cpp —— 局部空间复制
const FTransform& ParentTransform = SourceMeshTransformArray[ParentIndex];
const FTransform& ChildTransform = SourceMeshTransformArray[SourceBoneIndex];
OutPose[PoseBoneIndex] = ChildTransform.GetRelativeTransform(ParentTransform);  // CS→Local

// 或直接复制组件空间姿态
if (bUseMeshPose)
{
    MeshPoses.SetComponentSpaceTransform(PoseBoneIndex, SourceMeshTransformArray[SourceBoneIndex]);
}
```

---

## 九、播放与混合列表节点

### 9.1 BlendList 系列（混合列表）

> 源码：`AnimGraphRuntime\Private\AnimNodes\AnimNode_BlendListBase.cpp`、`BlendListByBool.cpp`、`BlendListByEnum.cpp`、`BlendListByInt.cpp`

BlendList 系列节点根据离散输入（Bool/Enum/Int）选择活跃姿态，并在切换时进行平滑过渡。包括 BlendListBase（基类）、BlendListByBool、BlendListByEnum、BlendListByInt。

#### 数学原理

**1. 离散选择 + 权重过渡**

当活跃索引变化时，旧姿态权重从 $w$ 衰减到 0，新姿态权重从 $w$ 上升到 1，通过 `FAlphaBlend` 控制过渡曲线（支持线性、缓动、自定义曲线）。

过渡时间根据当前权重差缩放，保证一致性：

$$
t_{remaining} = t_{blend} \times |w_{target} - w_{current}|
$$

**2. 权重归一化**

每帧更新后归一化所有活跃姿态权重：

$$
w_i' = \frac{w_i}{\sum_j w_j}
$$

**3. 惯性化过渡**

支持 `EBlendListTransitionType::Inertialization`，切换时请求惯性化而非传统权重过渡，实现帧间无缝混合。

**4. 逐骨骼混合（BlendProfile）**

支持 `UBlendProfile` 按骨骼设定不同混合权重和时间偏移，通过 `FBlendSampleData::NormalizeDataWeight` 归一化逐骨骼权重。

#### 核心代码

```cpp
// AnimNode_BlendListBase.cpp —— 权重过渡与归一化
for (int32 i = 0; i < PerBlendData.Num(); ++i)
{
    FAlphaBlend& Blend = PerBlendData[i].Blend;
    Blend.Update(Context.GetDeltaTime());           // 推进 alpha 混合
    PerBlendData[i].Weight = Blend.GetBlendedValue();
    SumWeight += PerBlendData[i].Weight;
}

// 归一化权重
if (SumWeight > ZERO_ANIMWEIGHT_THRESH && FMath::Abs(SumWeight - 1.0f) > ZERO_ANIMWEIGHT_THRESH)
{
    float ReciprocalSum = 1.0f / SumWeight;
    for (int32 i = 0; i < PerBlendData.Num(); ++i)
        PerBlendData[i].Weight *= ReciprocalSum;
}

// 逐骨骼混合归一化
if (CurrentBlendProfile)
    FBlendSampleData::NormalizeDataWeight(PerBoneSampleData);
```

#### 评估加速路径

```cpp
// 两个活跃姿态且无 BlendProfile 时的快速路径
BlendPose[FirstPoseIndex].Evaluate(Output);              // 直接求值到输出
FPoseContext Pose2(Output);
BlendPose[SecondPoseIndex].Evaluate(Pose2);
FAnimationRuntime::BlendTwoPosesTogetherInPlace(        // 原地混合，避免第三份姿态分配
    InOutPoseData, PoseTwoData, BlendWeights[FirstPoseIndex]);
```

---

### 9.2 RandomPlayer（随机播放器）

> 源码：`AnimGraphRuntime\Private\AnimNodes\AnimNode_RandomPlayer.cpp`

RandomPlayer 根据概率分布随机播放动画序列，支持循环次数范围和播放速率范围，在序列切换时进行混合。

#### 数学原理

**1. 概率归一化与累积分布函数（CDF）**

将每个序列的 `ChanceToPlay` 归一化并构建 CDF：

$$
p_i' = \frac{p_i}{\sum_j p_j}, \qquad \text{CDF}_i = \sum_{k=0}^{i} p_k'
$$

选择序列时生成 $[0,1)$ 均匀随机数 $r$，通过**二分搜索**（`Algo::UpperBound`）在 CDF 数组中查找：

$$
\text{index} = \text{UpperBound}(\text{CDF},\ r)
$$

**2. 洗牌模式（Shuffle Mode）**

不使用概率，而是构建一个打乱的索引列表，逐个弹出，确保每个序列播放一次且不连续重复（Fisher-Yates 洗牌）。

**3. 切换混合**

当当前序列剩余循环数为 0 且进入混合窗口时，开始向下一序列过渡：

$$
w_{current} = 1 - \alpha_{blend}, \qquad w_{next} = \alpha_{blend}
$$

其中 $\alpha_{blend}$ 由 `FAlphaBlend` 控制，支持缓动曲线。

#### 核心代码

```cpp
// AnimNode_RandomPlayer.cpp —— CDF 构建与二分搜索选择
float CurrentChance = 0.0f;
for (int32 Idx = 0; Idx < NumValidEntries; ++Idx)
{
    CurrentChance += ValidEntries[Idx]->ChanceToPlay / SumChances;  // 累积概率
    NormalizedPlayChances[Idx] = CurrentChance;
}
NormalizedPlayChances[NumValidEntries - 1] = 1.0f;  // 消除浮点误差

// 随机选择：二分搜索 CDF
float RandomVal = RandomStream.GetFraction();
return Algo::UpperBound(NormalizedPlayChances, RandomVal);
```

```cpp
// Fisher-Yates 洗牌
const int32 NumShuffles = ShuffleList.Num() - 1;
for (int32 i = 0; i < NumShuffles; ++i)
{
    int32 SwapIdx = RandomStream.RandRange(i, NumShuffles);
    ShuffleList.Swap(i, SwapIdx);
}
// 确保不连续重复
if (ShuffleList.Num() > 1 && ShuffleList.Last() == LastEntry)
    ShuffleList.Swap(RandomStream.RandRange(0, ShuffleList.Num() - 2), ShuffleList.Num() - 1);
```

---

## 十、RigidBody 与空间/根骨节点

### 10.1 RigidBody（刚体物理节点）

> 源码：`AnimGraphRuntime\Private\BoneControllers\AnimNode_RigidBody.cpp`、`RigidBodyNodeShared.cpp`

RigidBody 节点使用 `ImmediatePhysics`（基于 Chaos 物理引擎）进行实时刚体模拟，将动画骨骼作为运动学目标，对需要模拟的骨骼施加物理动力学。

#### 数学原理

**1. 运动学 vs 动力学体**

- **运动学体（Kinematic）**：未在 `SimulatedBones` 列表中的骨骼，直接由动画驱动，作为物理模拟的目标位置。
- **动力学体（Dynamic）**：在 `SimulatedBones` 中的骨骼，由物理引擎模拟，受重力、约束、外力影响。

**2. 模拟空间转换**

物理模拟在独立的模拟空间中进行，需要将组件空间变换转换到模拟空间：

- **Component Space**：模拟空间 = 组件空间，直接使用。
- **World Space**：模拟空间 = 世界空间，需乘以组件世界变换。
- **BaseBone Space**：模拟空间以某根骨骼为原点，需相对变换。

**3. 物理求解**

调用 `PhysicsSimulation->Simulate_AssumesLocked`，内部使用 Sequential Impulse（顺序冲量法）迭代求解约束（与 AnimDynamics 类似），包括：
- 球面约束（Spherical Limits）：限制骨骼到某点的距离
- 平面约束（Planar Limits）：限制骨骼在某平面一侧
- 锥角约束（Angular Limits）：限制旋转范围

**4. 输出回写**

模拟完成后将模拟空间变换转换回组件空间，写回到骨骼姿态。

#### 核心代码

```cpp
// AnimNode_RigidBody.cpp —— 物理模拟主流程
void FAnimNode_RigidBody::RunPhysicsSimulation(float DeltaTime)
{
    // 1. 将动画骨骼设为运动学目标
    for (int32 BodyIndex = 0; BodyIndex < Bodies.Num(); ++BodyIndex)
    {
        if (!SimulatedBones.Contains(BodyIndex))
        {
            // 运动学体：由动画驱动
            PhysicsSimulation->SetKinematicTarget(BodyIndex, AnimTransforms[BodyIndex]);
        }
    }

    // 2. 执行物理模拟（Sequential Impulse 约束求解）
    PhysicsSimulation->Simulate_AssumesLocked(DeltaTime);

    // 3. 读取模拟结果
    for (int32 BodyIndex : SimulatedBones)
    {
        SimTransforms[BodyIndex] = PhysicsSimulation->GetTransform(BodyIndex);
    }
}
```

#### 关键参数

| 参数 | 含义 |
|------|------|
| `SimulatedBones` | 需要物理模拟的骨骼列表 |
| `SimulationSpace` | 模拟空间（Component/World/BaseBone） |
| `OverrideWorldGravity` / `GravityScale` | 重力覆盖 |
| `SphericalLimits` / `PlanarLimits` / `CapsuleLimits` | 物理约束 |
| `bLinearSpring` / `bAngularSpring` | 弹簧约束 |
| `LinearDamping` / `AngularDamping` | 阻尼 |

---

### 10.2 空间转换与根骨节点

> 源码：`Engine\Private\Animation\AnimationRuntime.cpp`、`AnimGraphRuntime\Private\AnimNodes\AnimNode_RotateRootBone.cpp`、`BoneControllers\AnimNode_ResetRoot.cpp`

#### LocalToComponentSpace / ComponentToLocalSpace

这两种节点在局部空间与组件空间之间转换。局部空间到组件空间的转换通过递归累乘局部变换实现：

$$
\text{CS}_i = \text{CS}_{parent(i)} \cdot L_i
$$

组件空间到局部空间则为逆运算：

$$
L_i = \text{CS}_{parent(i)}^{-1} \cdot \text{CS}_i
$$

#### Root / ResetRoot / RotateRootBone

- **AnimNode_Root**：根节点，动画图表的输出点，提取根运动。
- **ResetRoot**：将根骨骼位移重置为参考姿态。
- **RotateRootBone**：对根骨骼施加额外旋转，支持根运动旋转提取：

$$
q_{root}' = q_{additional} \cdot q_{root}
$$

旋转后的根运动位移需在旋转后的坐标系中重新计算。

---

## 附录：各节点数学对比总表

| 节点 | 求解方式 | 核心公式 | 积分方法 |
|------|---------|---------|---------|
| TwoBoneIK | 闭式解（余弦定理） | $\cos\alpha = \frac{A^2+d^2-B^2}{2Ad}$ | — |
| CCDIK | 迭代（逐关节） | $\Delta q = (\vec v_e \times \vec v_t,\ \arccos(\vec v_e\cdot\vec v_t))$ | — |
| FABRIK | 迭代（前向+反向） | $P_i = P_{i\pm1} + l\cdot\text{normalize}(P_i - P_{i\pm1})$ | — |
| SplineIK | 解析（球面相交） | $\alpha_i = \text{SphereIntersect}(P_{i-1}, l_i\cdot\text{stretch})$ | — |
| LegIK | 闭式 + Soft IK | $d_{soft} = H + S(1 - e^{-\Delta/S})$ | — |
| LookAt | 解析（最短旋转） | $q = \text{FindBetween}(\vec a, \vec t)$ | — |
| TwoWayBlend | 线性插值 | $\text{Out} = (1-\alpha)A + \alpha B$ | — |
| MultiWayBlend | 加权平均 | $\text{Out} = \sum w_i P_i$ | — |
| LayeredBoneBlend | per-bone 插值 | $\text{Out}_b = (1-w_b)B_b + w_b L_b$ | — |
| ApplyAdditive | 叠加 | $q_{out} = \Delta q^{\,\alpha}\cdot q_{base}$ | — |
| Inertialization | 五次衰减 | $x(t) = At^5+Bt^4+Ct^3+Dt^2+v_0 t+x_0$ | — |
| ModifyBone | 变换组合 | $q_{new} = q_{rot}\cdot q$（左乘） | — |
| BoneDrivenController | 映射 | $y = \text{Curve}(x)$ 或 $\text{Multiplier}\cdot x$ | — |
| RotationMultiplier | Swing 缩放 | $q_{tgt} = q_{ref}\cdot\text{Quat}(\hat n, m\theta)$ | — |
| Constraint | 偏移复原 | $\text{Src}_{new} = \text{Offset}\circ\text{Target}_{new}$ | — |
| SpringBone | 弹簧-阻尼 | $a = k\vec E - c\vec v$ | 半隐式欧拉 |
| Trail | 位置约束弛豫 | $x \mathrel{+}= \text{corr}\cdot(\text{target}-x)$ | — |
| AnimDynamics | 刚体 + 约束 | $\dot q = \tfrac12\Omega q$；$F=-kx$ | 半隐式(平动)+RK4(转动)+Sequential Impulse |
| DeadBlending | 指数衰减外推 | $x(t) = x_0 + \frac{v}{c}(1 - e^{-ct}),\ c=\frac{\ln2}{h}$ | — |
| BlendSpace | 重心坐标插值 | $w_i = \text{Barycentric}(x,y)$；$w_i'=w_i/\sum w_j$ | 逐轴惯性滤波 |
| RotationOffsetBlendSpace | Mesh空间旋转叠加 | $q_{out} = \text{Accumulate}(q_{base},\ \Delta q^\alpha)$ | — |
| Mirror | 轴镜像 + 参考校正 | $q' = \text{MirrorQuat}(q)\cdot\text{MirrorQuat}(q_{ref}^{src})^{-1}\cdot q_{ref}^{tgt}$ | — |
| PoseDriver / RBF | 径向基函数 | $w_i = \text{Kernel}(d_i/r_i)$，$d_i=\text{Distance}(x,t_i)$ | — |
| ModifyCurve | 曲线运算 | $\text{out} = \text{Lerp}(\text{cur},\ \text{op}(\text{cur},\text{new}),\ \alpha)$ | — |
| CopyBoneDelta | 增量复制 | $\Delta = T_{src}\circ T_{ref}^{-1}$；$\text{tgt}'=\text{tgt}+\Delta\cdot m$ | — |
| TwistCorrectiveNode | 点积反正弦 | $\Delta\theta = \arcsin(\vec n\cdot\vec v_{twist}) - \arcsin(\vec n\cdot\vec v_{base})$ | — |
| HandIKRetargeting | 位置差平移 | $\vec\Delta = (\vec p_{FK}-\vec p_{IK})\cdot\vec\alpha_{axis}$ | — |
| ScaleChainLength | 链长等比缩放 | $s_\alpha = \text{Lerp}(1,\ |\vec p_{tgt}-\vec p_{start}|/L_0,\ \alpha)$ | — |
| ApplyLimits | 欧拉角范围约束 | $\theta' = \text{Clamp}(\theta,\ \theta_{min}+o,\ \theta_{max}+o)$ | — |
| CopyPoseFromMesh | 相对变换复制 | $L_{tgt} = \text{CS}_{child}\circ\text{CS}_{parent}^{-1}$ | — |
| BlendList 系列 | 离散选择 + 权重过渡 | $w_i' = w_i/\sum w_j$；$t_{rem}=t_{blend}\cdot|\Delta w|$ | AlphaBlend |
| RandomPlayer | CDF + 二分搜索 | $\text{CDF}_i=\sum_{k\leq i}p_k$；$\text{idx}=\text{UpperBound}(\text{CDF},\ r)$ | — |
| RigidBody | ImmediatePhysics / Chaos | 运动学目标 + Sequential Impulse 约束 | Sequential Impulse |

---
