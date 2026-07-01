---
title: "UE FullBodyIK 插件详解 — 雅可比矩阵与 XPBD 位置动力学的双范式拆解"
excerpt: "基于 Unreal Engine FullBodyIK 实验性插件源码，系统拆解两种 IK 求解器的数学原理：基于雅可比矩阵（DLS / 转置法）的 FullBodyIK 求解器，与基于位置动力学（XPBD 约束、极分解、Swing-Twist 限位）的 PBIK 求解器，覆盖偏导几何计算、推-转力矩、最佳拟合旋转与关键参数选型。"
date: "2026-06-30"
category: "Animation"
subtopic: "ControlRigIK"
tags: ["UE5", "IK", "FullBodyIK", "雅可比", "XPBD"]
readTime: "阅读约50分钟"
---

> 源码路径：`Engine/Plugins/Experimental/FullBodyIK`
>
> 本文档详细解析 Unreal Engine FullBodyIK 实验性插件中两种 IK 求解器的数学原理：基于**雅可比矩阵（Jacobian）**的 FullBodyIK 求解器，以及基于**位置动力学（Position-Based Dynamics / XPBD）**的 PBIK 求解器。两者均以 Control Rig RigUnit 的形式暴露给蓝图使用，而非传统的 AnimGraph 节点。

---

## 1. 插件架构总览

FullBodyIK 插件包含**两个相互独立的求解模块**：

| 模块 | 求解范式 | 核心数学库 | RigUnit |
|------|---------|-----------|---------|
| `FullBodyIK` | 雅可比矩阵（Jacobian）迭代 | Eigen（矩阵运算） | `FRigUnit_FullbodyIK` |
| `PBIK` | 位置动力学（XPBD 约束） | 自研向量/四元数 | `FRigUnit_PBIK` |

- **FullBodyIK（雅可比法）**：构造雅可比矩阵 $J$，将关节角度增量映射到末端效应器位移，通过雅可比转置或阻尼最小二乘求解关节增量，迭代收敛到目标。
- **PBIK（位置法）**：将骨骼抽象为刚体，定义 Pin 约束（拉向目标）与 Joint 约束（保持骨骼长度与关节限位），采用 XPBD 风格的迭代约束求解，配合 Over-Relaxation 加速收敛。

两者都支持每根骨骼的**运动刚度（MotionStrength）**，可让某些骨骼保持不动（如脚部贴地），从而实现"部分身体 IK"。

---

## 2. FullBodyIK：基于雅可比矩阵的 IK 求解器

### 2.1 雅可比矩阵的数学定义

对于一个由 $n$ 个旋转关节组成的运动链，末端效应器位置 $\vec{p}_{ee}$ 是各关节角度 $\theta_1, \theta_2, \dots, \theta_n$ 的函数：

$$
\vec{p}_{ee} = f(\theta_1, \theta_2, \dots, \theta_n)
$$

对位置求全微分，得到末端速度与关节角速度的线性关系：

$$
\Delta \vec{p}_{ee} = J \, \Delta \vec{\theta}
$$

其中雅可比矩阵 $J \in \mathbb{R}^{3 \times n}$ 的每一列是末端位置对某关节角度的偏导数：

$$
J = \begin{bmatrix} \dfrac{\partial \vec{p}_{ee}}{\partial \theta_1} & \dfrac{\partial \vec{p}_{ee}}{\partial \theta_2} & \cdots & \dfrac{\partial \vec{p}_{ee}}{\partial \theta_n} \end{bmatrix}
$$

IK 求解即给定末端期望位移 $\vec{e}$（目标 - 当前），反求关节增量 $\Delta\vec{\theta}$。

### 2.2 偏导数的几何计算（叉积法）

对于**旋转关节**，末端位置对该关节角度的偏导数存在经典几何公式。设关节 $i$ 的旋转轴为 $\hat{\omega}_i$，关节位置为 $\vec{p}_i$，末端位置为 $\vec{p}_{ee}$，令 $\vec{r} = \vec{p}_{ee} - \vec{p}_i$，则：

$$
\frac{\partial \vec{p}_{ee}}{\partial \theta_i} = \hat{\omega}_i \times \vec{r} = \hat{\omega}_i \times (\vec{p}_{ee} - \vec{p}_i)
$$

**几何意义**：末端绕轴 $\hat{\omega}_i$ 旋转时，其瞬时线速度方向垂直于 $\hat{\omega}_i$ 与 $\vec{r}$ 构成的平面，大小为 $|\vec{r}|\sin\phi$（$\phi$ 为夹角）。

源码实现（`JacobianIK.cpp` 中的 `ComputePositionalPartialDerivative`）：

```cpp
FVector FJacobianIK::ComputePositionalPartialDerivative(
    const FVector& RotationAxis,
    const FVector& ToEffector)
{
    // 偏导 = 旋转轴 × (末端 - 关节)
    return FVector::CrossProduct(RotationAxis, ToEffector);
}
```

旋转轴的选取取决于期望末端朝向目标的方式。`CalculateRotationAxisBasedOnEffectorPosition` 用末端→当前与末端→目标的叉积确定旋转轴：

```cpp
FVector FJacobianIK::CalculateRotationAxisBasedOnEffectorPosition(
    const FVector& EffectorPosition,
    const FVector& LinkPosition,
    const FVector& TargetPosition)
{
    const FVector ToEffector = EffectorPosition - LinkPosition;
    const FVector ToTarget   = TargetPosition  - LinkPosition;

    // 旋转轴 = ToEffector × ToTarget 的叉积（垂直于两向量所在平面）
    FVector RotationAxis = FVector::CrossProduct(ToEffector, ToTarget);
    RotationAxis.Normalize();
    return RotationAxis;
}
```

### 2.3 求解方法一：Jacobian Transpose（雅可比转置）

最简单的求解方式是直接用雅可比的转置把末端误差映射回关节空间：

$$
\Delta \vec{\theta} = \alpha \, J^T \vec{e}
$$

其中 $\alpha$ 为步长缩放因子。转置法的优点是**无需矩阵求逆，计算稳定**，缺点是收敛较慢且对路径有偏好。

UE 实现中，$\alpha$ 通过当前误差向量与"假设沿 $J^T$ 方向走一步后的新误差"之间的关系自适应计算（`CreateAnglePartialDerivativesUsingJT`）：

```cpp
void FJacobianIK::CreateAnglePartialDerivativesUsingJT(
    Eigen::VectorXf& OutPartialDerivatives,
    const Eigen::MatrixXf& JacobianMatrix,
    const Eigen::VectorXf& TargetVector)
{
    // JT * e ：把末端误差映射回关节空间
    const Eigen::MatrixXf JacobianTranspose = JacobianMatrix.transpose();
    Eigen::VectorXf PartialDerivatives = JacobianTranspose * TargetVector;

    // 自适应步长 alpha：
    //   alpha = (JT*e · e) / (JT*e · JT*(J*e))
    // 即用当前误差与"走一步后误差的变化"之比来缩放
    const Eigen::VectorXf PartialTargetVector = JacobianTranspose * (JacobianMatrix * TargetVector);
    const float AlphaNumerator   = PartialDerivatives.dot(TargetVector);
    const float AlphaDenominator = PartialDerivatives.dot(PartialTargetVector);

    if (FMath::Abs(AlphaDenominator) > SMALL_NUMBER)
    {
        const float Alpha = AlphaNumerator / AlphaDenominator;
        PartialDerivatives *= Alpha;
    }

    OutPartialDerivatives = PartialDerivatives;
}
```

可理解为：令 $\vec{g} = J^T\vec{e}$，则

$$
\alpha = \frac{\vec{g} \cdot \vec{e}}{\vec{g} \cdot (J^T(J\vec{e}))} = \frac{\vec{g} \cdot \vec{e}}{(J\vec{g}) \cdot (J\vec{e})}
$$

这是沿搜索方向 $\vec{g}$ 的最优步长估计。

### 2.4 求解方法二：JPIDLS（阻尼最小二乘法 / DLS）

阻尼最小二乘法（Damped Least Squares, DLS）通过引入阻尼项 $\lambda$ 求解最小化目标：

$$
\min_{\Delta\vec{\theta}} \ \| J\Delta\vec{\theta} - \vec{e} \|^2 + \lambda^2 \| \Delta\vec{\theta} \|^2
$$

其闭式解为：

$$
\Delta\vec{\theta} = J^T (J J^T + \lambda^2 I)^{-1} \vec{e}
$$

**关键性质**：
- $\lambda \to 0$ 时退化为伪逆解 $\Delta\vec{\theta} = J^+ \vec{e}$，精度高但在奇异点（如完全伸直）附近数值爆炸；
- $\lambda$ 越大越平滑稳定，但收敛变慢，相当于用精度换取鲁棒性。

UE 实现（`CreateAnglePartialDerivativesUsingJPIDLS`，注意只对 $3\times3$ 的小矩阵 $JJ^T+\lambda^2 I$ 求逆，而非对 $J$ 直接求逆）：

```cpp
void FJacobianIK::CreateAnglePartialDerivativesUsingJPIDLS(
    Eigen::VectorXf& OutPartialDerivatives,
    const Eigen::MatrixXf& JacobianMatrix,
    const Eigen::VectorXf& TargetVector,
    const float DampingValue)
{
    // JJ^T + λ²I  —— 3x3 矩阵，仅与末端自由度有关，与关节数无关
    Eigen::Matrix3f MatrixA = JacobianMatrix * JacobianMatrix.transpose();
    MatrixA(0,0) += DampingValue * DampingValue;
    MatrixA(1,1) += DampingValue * DampingValue;
    MatrixA(2,2) += DampingValue * DampingValue;

    // (JJ^T + λ²I)^{-1} · e
    const Eigen::Vector3f VectorB(TargetVector(0), TargetVector(1), TargetVector(2));
    const Eigen::Vector3f VectorX = MatrixA.inverse() * VectorB;

    // Δθ = JT · [(JJ^T + λ²I)^{-1} · e]
    OutPartialDerivatives = JacobianMatrix.transpose() * VectorX;
}
```

求解公式拆解：先计算 $\vec{v} = (JJ^T + \lambda^2 I)^{-1}\vec{e}$（维度仅 3），再用 $J^T$ 把它展开到 $n$ 维关节空间，得到 $\Delta\vec{\theta} = J^T \vec{v}$。

### 2.5 目标向量计算与收敛判定

每次迭代，末端的目标向量 $\vec{e}$ 由当前末端指向目标位置，并按链长度进行限幅以避免单步过冲：

```cpp
FVector FJacobianIK::ComputeTargetVector(
    const FVector& EffectorPosition,
    const FVector& TargetPosition,
    const float ChainLength,
    const bool bClampToTarget)
{
    FVector ToTarget = TargetPosition - EffectorPosition;

    if (bClampToTarget)
    {
        // 限制单步最大位移为链总长 × TargetClampScale，防止跳跃
        ToTarget = ToTarget.GetClampedToMaxSize(ChainLength);
    }
    return ToTarget;
}
```

收敛判定 `DidConverge` 检查末端到目标的距离是否小于精度阈值 $\epsilon$：

$$
\| \vec{p}_{ee} - \vec{p}_{target} \| < \epsilon
$$

默认精度 `Precision = 0.1`（单位 cm），最大迭代 `MaxIterations = 30`。

`UpdateClampMag` 还会在迭代过程中动态调整目标钳制幅度，使初期允许较大步长、后期收敛更平滑。

### 2.6 运动刚度与 MotionBase

FullBodyIK 通过 **MotionBase** 实现每根骨骼的独立刚度控制。每个轴（线性/角向）都有一个 `[0,1]` 的 stiffness，**运动强度 = 1 − stiffness**：

- `LinearStiffness = 1` → 该轴完全不动（如脚不滑）；
- `LinearStiffness = 0` → 该轴完全自由。

```cpp
struct FMotionBase
{
    FVector BaseAxis;       // 该 motion base 的轴向
    float LinearStiffness;  // 0~1，越大越硬（运动越弱）
    float AngularStiffness;

    float GetLinearMotionStrength() const { return 1.0f - LinearStiffness; }
    float GetAngularMotionStrength() const { return 1.0f - AngularStiffness; }
};
```

偏导数最终会乘上对应关节的运动强度，从而在雅可比求解结果里**部分屏蔽**被锁定的骨骼。`ComputePartialDerivative` 在叉积结果上乘 `LinearMotionStrength` / `AngularMotionStrength`：

```cpp
FVector FJacobianIK::ComputePartialDerivative(...)
{
    if (bIsLinear)
    {
        // 线性：直接用旋转轴 × 强度
        return RotationAxis * LinearMotionStrength;
    }
    else
    {
        // 角向：叉积 × 强度
        return FVector::CrossProduct(RotationAxis, ToEffector) * AngularMotionStrength;
    }
}
```

在 RigUnit 构建阶段，运动强度还会随骨骼**到末端效应器的深度**做线性衰减，越靠近根部的骨骼运动越弱，越靠近末端越强，使链表现出自然的柔性：

$$
\text{MotionStrength}(d) = \left(1 - \frac{d}{d_{\max}}\right)(s_{\max} - s_{\min}) + s_{\min}
$$

其中 $d$ 为骨骼在链中的深度，$d_{\max}$ 为链总深度，$s_{\max}/s_{\min}$ 为最大/最小运动强度。

### 2.7 求解器变体

`FJacobianSolverBase` 定义了 8 种求解变体，以适配不同的目标类型与运动模式：

| 变体 | 目标类型 | 说明 |
|------|---------|------|
| `PositionTarget_3DOF` | 位置（3 自由度角向旋转） | 仅位置目标，关节用 3 轴角度驱动 |
| `PositionTarget_Quat` | 位置（四元数旋转） | 位置目标，旋转以四元数形式驱动 |
| `RotationTarget_Quat` | 旋转（四元数） | 仅朝向目标 |
| `RotationTarget_3DOF` | 旋转（3 自由度） | 仅朝向目标 |
| `PositionRotationTarget_3DOF` | 位置 + 旋转 | 同时约束位置与朝向 |
| `PositionRotationTarget_Quat` | 位置 + 旋转（四元数） | 最常用，手部抓取等 |
| `PositionTarget_3DOF_Translation` | 位置（平移关节） | 关节以平移而非旋转驱动（少见） |
| `PositionRotationTarget_LocalFrame` | 局部坐标系下的位置 + 旋转 | 目标定义在局部系 |

旋转目标对应的偏导数是**角速度偏导**：末端朝向对关节角度的偏导，旋转轴同位置偏导，但目标向量由四元数误差转换得到（`CalculateRotationAxisBasedOnEffectorRotation`）。

---

## 3. PBIK：基于位置动力学的 IK 求解器

PBIK 基于 **XPBD（Extended Position-Based Dynamics）** 思想：把每根骨骼抽象成一个刚体（RigidBody），通过迭代求解约束（Constraint）来逼近目标，而非求解线性方程组。其核心循环为：

```
Solve():
    Initialize          // 初始化刚体位姿
    UpdateBones         // 骨 → 刚体
    UpdateBodies:       // 求解主体
        ApplyRootPrePull       // 预拉：整体最佳拟合旋转
        ApplyPreferredAngles  // 优先角度修正
        ApplyPullChainAlpha    // 链预旋转
        SolveConstraints       // 迭代求解约束
    UpdateBonesFromBodies  // 刚体 → 骨
```

### 3.1 刚体与质量计算

每个刚体 `FRigidBody` 关联一根骨骼，其**质心**与**质量**由该骨骼及其所有子骨骼的位置决定：

```cpp
void FRigidBody::UpdateTransformAndMassFromBones(const TArray<FBone>& InBones)
{
    // 质心 = (骨骼自身 + 所有子骨骼) 位置的均值
    FVector Centroid = Bone.Position;
    int32 Count = 1;
    for (const int32 ChildIndex : Children)
    {
        Centroid += InBones[ChildIndex].Position;
        Count++;
    }
    Centroid /= Count;
    Position = Centroid;

    // 质量 = 骨骼到每个子骨骼的距离之和
    float MassSum = 0.f;
    for (const int32 ChildIndex : Children)
    {
        MassSum += FVector::Dist(Bone.Position, InBones[ChildIndex].Position);
    }
    Mass = MassSum;

    // 逆质量，并按乘数缩放、钳制下限
    const float ScaledMass = FMath::Max(Mass * MassMultiplier * GLOBAL_UNITS, MinMass);
    InvMass = 1.f / ScaledMass;
}
```

数学表达：

$$
\vec{c} = \frac{1}{k+1}\left(\vec{p}_{bone} + \sum_{i=1}^{k} \vec{p}_{child_i}\right), \qquad
m = \sum_{i=1}^{k} \|\vec{p}_{bone} - \vec{p}_{child_i}\|
$$

$$
m^{-1} = \frac{1}{\max(m_{\min},\; m \cdot \text{MassMultiplier} \cdot \text{GLOBAL\_UNITS})}
$$

**质量越大（骨骼越长、子骨骼越多），逆质量越小，越不容易被推动**——这与物理直觉一致：长骨骼更"重"，移动它代价更大。

### 3.2 XPBD 推-转（Push-to-Rotate）

XPBD 的核心操作是：对一个刚体施加位置修正 $\Delta\vec{p}$ 时，由于作用点通常偏离质心（$\vec{r} = \vec{p}_{contact} - \vec{c}$），会产生一个**附加力矩**，从而引发旋转。旋转增量公式（来自 XPBD 论文方程 8）：

$$
\vec{\omega} = \lambda \, (\vec{r} \times \vec{F}), \qquad
\lambda = m^{-1}(1 - \text{stiffness}) \cdot \text{OverRelaxation}
$$

其中 $\vec{F}$ 即位置修正 $\Delta\vec{p}$，$\text{stiffness}$ 为旋转刚度，$\text{OverRelaxation}$ 为超松弛因子。

```cpp
void FRigidBody::ApplyPushToRotateBody(
    const FVector& Push,
    const FVector& BoneLocalPosition,  // r：作用点相对质心
    const float RotationStiffness,
    const float OverRelaxation)
{
    if (RotationStiffness >= 1.f - KINDA_SMALL_NUMBER) return; // 完全刚硬，不旋转

    const float Lambda = InvMass * (1.f - RotationStiffness) * OverRelaxation;
    // 角速度增量 ω = λ (r × F)
    const FVector AngularDelta = Lambda * FVector::CrossProduct(BoneLocalPosition, Push);

    // 把角增量转成四元数并叠加
    FQuat DeltaRot(AngularDelta.GetSafeNormal(), AngularDelta.Size());
    Rotation = DeltaRot * Rotation;
}
```

**几何意义**：力 $\vec{F}$ 作用在偏离质心的点上，产生的力矩 $\vec{\tau} = \vec{r} \times \vec{F}$，力矩越大、刚体越轻（$m^{-1}$ 大），旋转越多。

### 3.3 Pin 约束（末端效应器）

Pin 约束把刚体拉向目标位置（Effector Goal），分两步：

1. **旋转对齐**：先让刚体朝向目标旋转（用 `PinRotation` 控制强度）；
2. **位置修正**：$\Delta\vec{p} = (\text{Goal} - \text{PinPoint}) \cdot \alpha$，按 `OverRelaxation` 超松弛。

```cpp
void FPinConstraint::Solve(const FVector& Goal, const FEffectorSettings& Settings, float OverRelaxation)
{
    FRigidBody* Body = Bodies[BoneIndex];

    // 1) 旋转对齐：让 body 朝目标转动（PinRotation 控制强度）
    if (Settings.PinRotation > 0.f)
    {
        // 计算当前 PinPoint 朝向与目标方向的旋转，按 PinRotation 比例施加
        // (旋转对齐细节省略，本质是 ApplyPushToRotateBody 的逆向应用)
    }

    // 2) 位置修正 Δp = (Goal - PinPoint) · α
    const FVector PinPoint = Body->Position + Body->Rotation * BoneLocalPosition;
    const FVector Delta = Goal - PinPoint;

    const float Alpha = Settings.PositionAlpha * OverRelaxation;
    Body->ApplyPositionDelta(Delta * Alpha, BoneLocalPosition);
}
```

`ApplyPositionDelta` 内部按 `PositionStiffness` 与 `OverRelaxation` 缩放位移，并调用 `ApplyPushToRotateBody` 产生附加旋转：

```cpp
void FRigidBody::ApplyPositionDelta(
    const FVector& Delta,
    const FVector& BoneLocalPosition,
    const float PositionStiffness,
    const float OverRelaxation)
{
    if (PositionStiffness >= 1.f) return;

    const float Alpha = (1.f - PositionStiffness) * OverRelaxation;
    Position += Delta * Alpha * InvMass;   // 按逆质量分配位移

    // 位移作用在偏移点上 → 产生旋转
    ApplyPushToRotateBody(Delta * Alpha, BoneLocalPosition, /*RotationStiffness=*/0.f, OverRelaxation);
}
```

### 3.4 Joint 约束（保持骨骼长度）

Joint 约束连接两个相邻刚体，维持它们之间的骨骼长度（即子刚体相对父刚体的局部位置不变）。求解分**位置修正**与**旋转修正**两部分。

**位置修正**：按两刚体逆质量之比分配位移误差，使子刚体回到正确距离：

$$
\Delta\vec{p}_A = -\frac{m_A^{-1}}{m_A^{-1}+m_B^{-1}} \vec{d}, \qquad
\Delta\vec{p}_B = +\frac{m_B^{-1}}{m_A^{-1}+m_B^{-1}} \vec{d}
$$

其中 $\vec{d} = \vec{p}_{current} - \vec{p}_{desired}$ 为长度偏差向量。

```cpp
void FJointConstraint::Solve(float OverRelaxation)
{
    FRigidBody* A = Bodies[ParentBodyIndex];
    FRigidBody* B = Bodies[ChildBodyIndex];

    // 当前子刚体在父刚体局部系下的世界位置
    const FVector CurrentPos = B->Position + B->Rotation * B->BoneLocalPosition;
    const FVector DesiredPos  = A->Position + A->Rotation * ChildOffset;

    const FVector Delta = CurrentPos - DesiredPos;

    // 按逆质量分配误差（重量大的动得少）
    const float TotalInvMass = A->InvMass + B->InvMass;
    if (TotalInvMass < SMALL_NUMBER) return;

    const float AWeight = A->InvMass / TotalInvMass;
    const float BWeight = B->InvMass / TotalInvMass;

    // 位置修正：A 往 -Delta 方向、B 往 +Delta 方向移动
    A->ApplyPositionDelta(-Delta * AWeight * OverRelaxation, /*local pos*/ ...);
    B->ApplyPositionDelta( Delta * BWeight * OverRelaxation, /*local pos*/ ...);

    // 旋转修正：两侧都产生 push-to-rotate，再施加关节限位
    EnforceJointLimits();
}
```

**RemoveStretch**：若开启 `bAllowStretch=false`，每轮迭代后会强制把骨骼长度恢复为原始长度，防止链被拉长。

**FinalPass**：最后一轮迭代执行特殊处理，确保约束精确满足（不再松弛）。

### 3.5 PrePull 最佳拟合旋转（极分解）

`ApplyRootPrePull` 在求解前先做一个**整体最佳拟合旋转**：根据当前已变形的骨骼位置，反推一个刚体旋转，使整个链大致朝向目标，从而显著减少后续迭代次数。

核心是 `GetRotationFromDeformedPoints`，基于论文 *"A Robust Method to Extract the Rotational Part of Deformations"*（K. Shoemake 演进版本）。算法分两步：

**第 1 步：累加变形梯度张量 $D$**

设原始（未变形）点集为 $\{Q_i\}$，变形后点集为 $\{P_i\}$，每个点带权重 $w_i$，则变形梯度张量为各点外积之和：

$$
D = \sum_i w_i \, \vec{P}_i \, \vec{Q}_i^{\,T}
$$

其中 $\vec{P}_i = P_i - \bar{P}$，$\vec{Q}_i = Q_i - \bar{Q}$ 为去质心后的相对向量，外积 $\vec{P}\vec{Q}^T$ 是 $3\times3$ 矩阵。

```cpp
FQuat GetRotationFromDeformedPoints(
    const TArray<FVector>& OriginalPoints,
    const TArray<FVector>& DeformedPoints,
    const TArray<float>& Weights)
{
    // 1) 计算两组点的质心
    FVector CentroidO = FVector::ZeroVector, CentroidD = FVector::ZeroVector;
    float TotalWeight = 0.f;
    for (int32 i = 0; i < OriginalPoints.Num(); ++i)
    {
        CentroidO += OriginalPoints[i] * Weights[i];
        CentroidD += DeformedPoints[i] * Weights[i];
        TotalWeight += Weights[i];
    }
    CentroidO /= TotalWeight;
    CentroidD /= TotalWeight;

    // 2) 累加变形梯度 D = Σ w_i · P_i' · Q_i'^T  (外积)
    FMatrix D = FMatrix::Identity;
    for (int32 i = 0; i < OriginalPoints.Num(); ++i)
    {
        const FVector P = DeformedPoints[i] - CentroidD;   // 变形后相对向量
        const FVector Q = OriginalPoints[i] - CentroidO;   // 原始相对向量
        // 外积 P ⊗ Q → 3x3 矩阵，累加
        D += FMatrix::OuterProduct(P, Q) * Weights[i];
    }

    // 3) 从 D 中迭代提取旋转 R（极分解）
    return ExtractRotationFromMatrix(D);
}
```

**第 2 步：迭代极分解提取旋转**

变形梯度 $D$ 一般含旋转 $R$ 与对称伸缩 $S$ 两部分（$D = RS$，极分解）。用论文的迭代公式（方程 7）从 $D$ 逐步剥离出纯旋转 $R$：

```cpp
FQuat ExtractRotationFromMatrix(FMatrix D)
{
    // 迭代剥离：每轮用 R^(-1)·D 的非对称部分修正 R
    FMatrix R = FMatrix::Identity;
    for (int32 Iter = 0; Iter < NumIterations; ++Iter)
    {
        FMatrix Rinv = R.Inverse();
        FMatrix RitD = Rinv.GetTransposed() * D;   // R^{-T} D

        // 提取反对称部分（旋转向量）
        FVector Omega;
        Omega.X = RitD.M[1][2] - RitD.M[2][1];
        Omega.Y = RitD.M[2][0] - RitD.M[0][2];
        Omega.Z = RitD.M[0][1] - RitD.M[1][0];

        const float Trace = RitD.M[0][0] + RitD.M[1][1] + RitD.M[2][2];
        if (Omega.IsNearlyZero()) break;

        // 用 Omega 构造增量旋转并叠加到 R
        FQuat DeltaRot(Omega.GetSafeNormal(), FMath::Atan2(Omega.Size(), Trace));
        R = FMatrix(DeltaRot) * R;
    }
    return FQuat(R);
}
```

得到最佳拟合旋转 $R$ 后，`ApplyRootPrePull` 对**位置偏移**与**旋转偏移**分别按各轴 `PositionStiffness` / `RotationStiffness` 做 alpha 混合（per-axis），再把整个刚体链刚性地变换过去。这让链先"整体转向"目标方向，再交给后续约束精修。

### 3.6 Pull Chain Alpha（链预旋转）

`Pull Chain Alpha` 在 PrePull 之后、主迭代之前，对**整条链朝向目标**做一次预旋转。对每个位于链上的刚体：

1. 计算从链根到当前刚体的向量 $\vec{v}_{cur}$（当前朝向）；
2. 计算从链根到末端目标的向量 $\vec{v}_{new}$（期望朝向）；
3. 求两者之间的旋转 $q_{delta} = \text{FindBetween}(\vec{v}_{cur}, \vec{v}_{new})$；
4. 按 `PullChainAlpha` 与**链上位置比例**施加旋转与平移。

链上位置比例让越靠近末端的刚体转得越多：

$$
\text{factor}(i) = 1 - \frac{d_i}{L_{chain}}
$$

其中 $d_i$ 为刚体到末端的距离，$L_{chain}$ 为链总长。

```cpp
void FPBIKSolver::ApplyPullChainAlpha(FEffector& Effector)
{
    for (FRigidBody* Body : Effector.ChainBodies)
    {
        const FVector ChainVecCurrent = Body->Position - RootBody->Position;
        const FVector ChainVecNew     = Effector.PositionGoal - RootBody->Position;

        // 两向量之间的旋转
        const FQuat DeltaRot = FQuat::FindBetween(ChainVecCurrent, ChainVecNew);

        // 链上比例：越靠近末端 factor 越大
        const float DistFromEffector = Effector.DistancesFromEffector[BodyIndex];
        const float Factor = 1.f - (DistFromEffector / Effector.ChainLength);

        // 按比例施加旋转
        const FQuat ScaledRot = FQuat::Slerp(FQuat::Identity, DeltaRot,
                                             Factor * Effector.Settings.PullChainAlpha);

        Body->Rotation = ScaledRot * Body->Rotation;
        // 同时按比例平移，保持链结构
        Body->Position += (Effector.PositionGoal - RootBody->Position) * Factor * 0.5f
                         * Effector.Settings.PullChainAlpha;
    }
}
```

全局 `GlobalPullChainAlpha` 缩放所有效应器的 `PullChainAlpha`。

### 3.7 Preferred Angles（优先角度）

`Preferred Angles` 让每根骨骼在 IK 求解时**倾向于回到预设的关节角度**（如手臂自然下垂角度）。其施加强度与链的"挤压量"成正比——链被拉得越直（越偏离 preferred 姿态），优先角度施加越强，从而产生自然的弯折恢复。

强度用 `CircularEaseOut`（见 3.10）映射挤压量：

$$
\text{strength} = \text{CircularEaseOut}(\text{squashAmount})
$$

`ApplyPreferredAngles` 对每根设了 `bUsePreferredAngles` 的骨骼，把当前旋转朝 preferred 旋转按 strength 比例插值。

### 3.8 关节限位（Free / Limited / Locked / Hinge / Fixed）

每根骨骼的 `FBoneSettings` 可对 X/Y/Z 三个轴分别设限位类型：

| 类型 | 含义 |
|------|------|
| `Free` | 该轴自由，无限制 |
| `Limited` | 限制在 `[MinAngle, MaxAngle]` 范围内 |
| `Locked` | 该轴完全锁死 |

三个轴的组合派生出更复杂的关节类型：

- **Hinge（铰链）**：2 轴 Locked + 1 轴 Free/Limited，如膝盖、肘；
- **Fixed（固定）**：3 轴全 Locked，该骨骼不旋转。

`UpdateJointLimits` 在求解前根据各轴类型配置约束：

```cpp
void FJointConstraint::UpdateJointLimits(const FBoneSettings& Settings)
{
    int32 LockedCount = 0;
    if (Settings.XLimitType == ELimitType::Locked) LockedCount++;
    if (Settings.YLimitType == ELimitType::Locked) LockedCount++;
    if (Settings.ZLimitType == ELimitType::Locked) LockedCount++;

    if (LockedCount == 3)
    {
        // 3 轴锁定 → Fixed，不产生相对旋转
        JointType = EJointType::Fixed;
    }
    else if (LockedCount == 2)
    {
        // 2 轴锁定 → Hinge，只剩 1 轴可转
        JointType = EJointType::Hinge;
        RotateToAlignAxes(/* free axis */);
    }
    else
    {
        // 至少 2 轴自由 → 用 Limited 路径，逐轴 DecomposeRotationAngles + RotateWithinLimits
        JointType = EJointType::Limited;
    }
}
```

### 3.9 Swing-Twist 分解

对 `Limited` 轴，需要把父→子刚体的相对旋转分解成 X/Y/Z 三个欧拉角，分别夹到 `[Min, Max]`，再重组。这就是 **Swing-Twist 分解**：

```cpp
void FJointConstraint::DecomposeRotationAngles(
    const FQuat& RelRot,
    const FVector& AxisX, const FVector& AxisY, const FVector& AxisZ,
    float& AngleX, float& AngleY, float& AngleZ)
{
    // 逐轴分解：把当前旋转投影到各轴，提取该轴的旋转角
    // 标准 swing-twist：先提取绕 AxisX 的 twist 分量
    FQuat TwistX = ExtractTwist(RelRot, AxisX);
    FQuat Swing  = TwistX.Inverse() * RelRot;   // 剩余 swing

    AngleX = AngleFromQuatAroundAxis(TwistX, AxisX);

    // 在 swing 内继续分解 Y、Z
    FQuat TwistY = ExtractTwist(Swing, AxisY);
    FQuat SwingYZ = TwistY.Inverse() * Swing;
    AngleY = AngleFromQuatAroundAxis(TwistY, AxisY);
    AngleZ = AngleFromQuatAroundAxis(SwingYZ, AxisZ);
}
```

随后 `RotateWithinLimits` 把每个角夹到 `[MinAngle, MaxAngle]`，再重组四元数施加回子刚体。

### 3.10 缓动函数

PBIK 在多处用缓动函数把线性参数（如挤压量、链比例）映射成非线性强度，让动作更自然。定义于 `PBIKSolver.h`：

```cpp
// 平方缓出
static float SquaredEaseOut(float Alpha) { return Alpha * Alpha; }

// 四次方缓出：初期变化慢、末段急停
static float QuarticEaseOut(float Alpha)
{
    const float T = 1.f - Alpha;
    return 1.f - (T * T * T * T);
}

// 圆形缓出：用圆弧方程映射，常用于 preferred angles 的强度
static float CircularEaseOut(float Alpha)
{
    return FMath::Sqrt(1.f - (1.f - Alpha) * (1.f - Alpha));
}
```

数学上：

$$
\text{CircularEaseOut}(\alpha) = \sqrt{1 - (1-\alpha)^2}
$$

---

## 4. Control Rig 集成（RigUnit）

两种求解器都封装为 Control Rig 的 `FRigUnit`，可在 RigGraph 中作为节点使用。

### 4.1 FRigUnit_FullbodyIK（雅可比）

`FRigUnit_FullbodyIK_Execute` 工作流：

1. 从骨骼层级构建 `LinkData`（每根骨骼的位置、旋转、运动强度）；
2. 对每个效应器调用 `AddEffectors`，按链深度计算运动强度衰减；
3. 调用 `SolveJacobianIK`（含 `CreateJacobianMatrix` + 求解 + `UpdateLinkData`）；
4. 把 LinkData 的增量写回 Control Rig 骨骼变换。

```cpp
struct FRigUnit_FullbodyIK : public FRigUnit
{
    FRigElementKey Root;
    TArray<FFBIKEffectorTarget> Effectors;
    FSolverParameter SolverParameter;
    // ...

    virtual void Execute() override;
};
```

`FSolverParameter` 关键字段：

```cpp
struct FSolverParameter
{
    float DampingValue = 30.f;        // λ：阻尼，越大越稳定越慢
    EJacobianSolver SolverType;       // JacobianTranspose 或 JacobianPIDLS
    bool  bClampToTarget = true;      // 是否钳制单步位移
    bool  bUpdateClampMagnitude = true;
};
```

### 4.2 FRigUnit_PBIK（位置法）

`FRigUnit_PBIK` 暴露骨骼设置、效应器、排除骨骼与全局求解设置：

```cpp
struct FRigUnit_PBIK : public FRigUnit
{
    FRigElementKey Root;
    TArray<FPBIKEffector> Effectors;     // 末端效应器（带 PositionAlpha / RotationAlpha 等）
    TArray<FPBIKBoneSetting> BoneSettings; // 每根骨骼的限位/刚度/优先角度
    TArray<FRigElementKey> ExcludedBones;  // 不参与求解的骨骼
    FPBIKSolverSettings Settings;        // 迭代数、质量乘数、PullChainAlpha 等
    // ...
};

struct FPBIKEffector
{
    FRigElementKey Bone;
    FTransform Transform;     // 目标位姿
    float PositionAlpha = 1.f;
    float RotationAlpha = 1.f;
    float StrengthAlpha = 1.f;
    int32 ChainDepth = 2;        // 影响到根的链深度
    float PullChainAlpha = 1.f;
    bool  PinRotation = false;
};
```

---

## 5. 关键参数表

### 5.1 FullBodyIK（雅可比）默认参数（`FBIKShared.h`）

| 参数 | 默认值 | 含义 |
|------|--------|------|
| `LinearMotionStrength` | 3 | 最大线性运动强度 |
| `MinLinearMotionStrength` | 2 | 链根最小线性运动强度 |
| `AngularMotionStrength` | 3 | 最大角向运动强度 |
| `MinAngularMotionStrength` | 2 | 链根最小角向运动强度 |
| `DefaultTargetClamp` | 0.2 | 目标位移钳制比例（×链长） |
| `Precision` | 0.1 | 收敛精度（cm） |
| `Damping` | 30 | DLS 阻尼系数 $\lambda$ |
| `MaxIterations` | 30 | 最大迭代次数 |
| `bUseJacobianTranspose` | false | 是否用转置法（否则用 DLS） |

### 5.2 PBIK 求解设置（`FPBIKSolverSettings`）

| 参数 | 默认值 | 含义 |
|------|--------|------|
| `Iterations` | 20 | 主迭代次数 |
| `SubIterations` | 0 | 子迭代次数（先锁定非链刚体求解） |
| `MassMultiplier` | 1 | 质量全局缩放 |
| `bAllowStretch` | false | 是否允许拉长骨骼 |
| `RootBehavior` | — | 根骨骼行为（固定/可动） |
| `GlobalPullChainAlpha` | 1 | 全局链预旋转强度 |
| `MaxAngle` | 30 | 单次旋转增量上限（度） |
| `OverRelaxation` | 1.3 | 超松弛因子，>1 加速收敛 |

---

## 6. 两种求解器对比

| 维度 | FullBodyIK（雅可比） | PBIK（位置法） |
|------|----------------------|----------------|
| **数学范式** | 线性化 + 矩阵求解 | 约束 + 迭代投影 |
| **核心方程** | $\Delta\theta = J^T(JJ^T+\lambda^2 I)^{-1}e$ | $\vec{\omega} = \lambda(\vec{r}\times\vec{F})$ |
| **依赖库** | Eigen（矩阵运算） | 自研向量/四元数 |
| **奇异点处理** | 靠阻尼 $\lambda$ 软化 | 天然鲁棒（无矩阵求逆） |
| **关节限位** | 通过 MotionBase 运动强度间接控制 | 显式 Swing-Twist 分解 + 角度夹取 |
| **质量模型** | 无（纯运动学） | 有（按骨骼长度计算，影响位移分配） |
| **链预对齐** | 无 | PrePull 极分解 + PullChainAlpha |
| **优先角度** | 无 | 有（按挤压量 CircularEaseOut 施加） |
| **收敛速度** | 中（矩阵运算开销稳定） | 快（PrePull 大幅减少迭代） |
| **稳定性** | DLS 在 $\lambda$ 足够时稳定 | XPBD 始终稳定，可控超松弛 |
| **适用场景** | 高精度多点 IK、机械臂式 | 全身 IK、角色肢体（带关节限位与优先角度） |

### 选型建议

- 需要**多末端高精度对齐**且关心朝向时，用 **FullBodyIK（DLS）**，调大 `Damping` 应对奇异；
- 需要**自然角色姿态**（关节限位、优先角度、根行为）时，用 **PBIK**，开启 PrePull + PullChainAlpha 加速收敛，配合 `OverRelaxation` 调节稳定性。

---

## 附：核心公式速查

| 名称 | 公式 |
|------|------|
| 雅可比偏导 | $\dfrac{\partial \vec{p}_{ee}}{\partial \theta_i} = \hat{\omega}_i \times (\vec{p}_{ee} - \vec{p}_i)$ |
| 雅可比转置法 | $\Delta\vec{\theta} = \alpha \, J^T \vec{e}$ |
| 阻尼最小二乘 | $\Delta\vec{\theta} = J^T(JJ^T + \lambda^2 I)^{-1}\vec{e}$ |
| 刚体质量 | $m = \sum_i \|\vec{p}_{bone} - \vec{p}_{child_i}\|$ |
| XPBD 推-转 | $\vec{\omega} = m^{-1}(1-\text{stiffness})\cdot\text{OverRelaxation}\;(\vec{r}\times\vec{F})$ |
| 变形梯度张量 | $D = \sum_i w_i \, \vec{P}_i \vec{Q}_i^{\,T}$ |
| Pin 位置修正 | $\Delta\vec{p} = (\text{Goal} - \text{PinPoint})\cdot\alpha$ |
| 关节位置分配 | $\Delta\vec{p}_B = +\dfrac{m_B^{-1}}{m_A^{-1}+m_B^{-1}}\vec{d}$ |
| PullChain 比例 | $\text{factor}(i) = 1 - d_i/L_{chain}$ |
| 圆形缓出 | $\text{CircularEaseOut}(\alpha) = \sqrt{1-(1-\alpha)^2}$ |

---

*本文档基于 Unreal Engine FullBodyIK 实验性插件源码分析整理，公式与代码块均对应插件 `Source/FullBodyIK` 与 `Source/PBIK` 目录下的实际实现。*
