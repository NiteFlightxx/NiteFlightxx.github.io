---
title: "UE 线性代数详解 — 坐标系、向量、矩阵、FTransform 与四元数"
excerpt: "基于当前 Unreal Engine 源码，系统说明 UE 的坐标轴、LWC 数学类型、向量与投影、行向量矩阵约定、FTransform 组合、FRotator 与 FQuat、数值求解，以及它们在物理和动画中的正确用法。"
date: "2026-09-25"
category: "Mathematics"
subtopic: "LinearAlgebra"
tags: ["线性代数", "FVector", "FMatrix", "FTransform", "FQuat", "UE源码"]
readTime: "阅读约55分钟"
---

> 本文以当前 `E:\UnrealEngine\UnrealEngine_Source` 源码快照为 UE 行为依据。数学公式会明确采用列向量还是 UE 的行向量语义；代码示例区分可直接使用的 UE API 与算法伪代码，避免把教材约定直接套进 Unreal Engine。
>
> 物理积分、弹簧、碰撞、PBD/XPBD、IK 和动画节点已有独立专题。本文保留它们与线性代数的接口，但不重复完整推导。

---

## 先给结论

在 UE 中写对线性代数，首先要记住下面十件事：

1. UE 世界坐标轴是 **X 前、Y 右、Z 上**。
2. 当前源码中 `FVector`、`FQuat`、`FMatrix`、`FTransform`、`FRotator` 都是 **double 版本**；显式 float 类型带 `3f/4f/44f` 后缀。
3. 点和方向都可由三个数表示，但点受平移影响，方向不受平移影响。
4. `FMatrix` 使用 UE 的行向量变换语义；平移存放在 `M[3][0..2]`。
5. 对 `FMatrix/FTransform`，组合式 $A \mathbin{*} B$ 表示先应用 $A$，再应用 $B$。
6. 对 `FQuat`，组合式 $A \mathbin{*} B$ 表示先应用 $B$，再应用 $A$，和 `FTransform` 相反。
7. UE 的 Pitch 绕 Y，Yaw 绕 Z，Roll 绕 X；不是 X/Y/Z 顺序的同义词。
8. `TransformPosition` 用于点，`TransformVector` 用于方向/位移，`TransformVectorNoScale` 用于不应受缩放影响的方向。
9. 固定绝对误差不能可靠判断所有尺度下的平行、奇异和退化；容差必须结合问题尺度。
10. 正规方程、直接求逆和欧拉角累加都适合教学说明，但不应默认作为生产级数值方案。

源码锚点：

- 数学类型别名：`Engine/Source/Runtime/Core/Public/Math/MathFwd.h:L47-L79`
- Rotator 轴和顺序：`Engine/Source/Runtime/Core/Public/Math/Rotator.h:L21-L52`
- Matrix 组合语义：`Engine/Source/Runtime/Core/Public/Math/Matrix.h:L27-L35`
- Transform 组合语义：`Engine/Source/Runtime/Core/Public/Math/TransformNonVectorized.h:L13-L26`
- Quaternion 组合语义：`Engine/Source/Runtime/Core/Public/Math/Quat.h:L25-L35`

## 阅读路线

- **只想正确使用 UE API**：第 1、2、4、5、8 章。
- **物理开发**：第 1～4、6、7 章，然后转到碰撞、约束和数值积分专题。
- **动画开发**：第 1～5、7 章，然后转到 FullBody IK、动画节点和 Motion Matching 专题。
- **复习数学**：按全文顺序阅读。

---

## 一、UE 的数学约定

### 1.1 坐标轴和方向

当前源码中的方向常量为：

```cpp
FVector::ForwardVector  // (1, 0, 0)，+X
FVector::RightVector    // (0, 1, 0)，+Y
FVector::UpVector       // (0, 0, 1)，+Z
```

源码定义位于 `Engine/Source/Runtime/Core/Private/Math/UnrealMath.cpp:L35-L50`。

这会直接影响叉积和旋转方向。例如：

```cpp
const FVector Forward = FVector::ForwardVector;
const FVector Up = FVector::UpVector;

const FVector Left = FVector::CrossProduct(Forward, Up);   // (0, -1, 0)
const FVector Right = FVector::CrossProduct(Up, Forward);  // (0,  1, 0)
```

叉积实现仍然是标准代数公式：

$$
a\times b=
\left(
a_yb_z-a_zb_y,
a_zb_x-a_xb_z,
a_xb_y-a_yb_x
\right)
$$

源码：`Engine/Source/Runtime/Core/Public/Math/Vector.h:L1522-L1542`。

### 1.2 当前 LWC 类型

当前 UE 使用 Large World Coordinates 类型别名：

| 默认类型 | 实际模板类型 | 显式 float 版本 |
|---|---|---|
| `FVector` | `TVector<double>` | `FVector3f` |
| `FQuat` | `TQuat<double>` | `FQuat4f` |
| `FMatrix` | `TMatrix<double>` | `FMatrix44f` |
| `FTransform` | `TTransform<double>` | `FTransform3f` |
| `FRotator` | `TRotator<double>` | `FRotator3f` |

源码：`Engine/Source/Runtime/Core/Public/Math/MathFwd.h:L47-L79`。

因此不要无意识地把 `FVector::Size()`、点积或距离结果截断到 `float`：

```cpp
const FVector Delta = End - Start;
const double Distance = Delta.Size();
const double DistanceSquared = Delta.SizeSquared();
```

只有当数据接口明确要求 float、并且范围已经验证时，才转换为 `FVector3f` 或 `float`。

### 1.3 点、方向和法线不是同一种语义

数学上：

- 点的齐次分量是 $w=1$，受平移影响；
- 方向的齐次分量是 $w=0$，不受平移影响；
- 法线是协向量，存在非均匀缩放时不能简单按普通方向变换。

对应 UE API：

```cpp
const FTransform LocalToWorld = Actor->GetActorTransform();

const FVector WorldPoint = LocalToWorld.TransformPosition(LocalPoint);
const FVector WorldOffset = LocalToWorld.TransformVector(LocalOffset);
const FVector WorldDirection = LocalToWorld.TransformVectorNoScale(LocalDirection);

const FVector LocalPointAgain = LocalToWorld.InverseTransformPosition(WorldPoint);
```

如果变量叫 `Offset`、`Direction` 或 `Velocity`，却调用 `TransformPosition`，通常意味着空间语义已经混乱。

### 1.4 单位约定

常见 UE 单位：

- 距离：厘米（cm）；
- 速度：cm/s；
- 加速度：$\mathrm{cm}/\mathrm{s}^2$；
- `FRotator`：度；
- `FQuat(Axis, Angle)`：弧度；
- `AddTorqueInRadians`：名字明确表示角度语义采用弧度版本。

角度转换必须显式：

```cpp
const double AngleRadians = FMath::DegreesToRadians(90.0);
const FQuat QuarterTurn(FVector::UpVector, AngleRadians);
```

---

## 二、向量：方向、距离与几何关系

### 2.1 基础运算

给定两个向量：

$$
a=(a_x,a_y,a_z),\qquad b=(b_x,b_y,b_z)
$$

则：

$$
a+b=(a_x+b_x,a_y+b_y,a_z+b_z)
$$

$$
\lVert a\rVert=\sqrt{a_x^2+a_y^2+a_z^2}
$$

```cpp
const FVector Delta = Target - Origin;
const double DistanceSquared = Delta.SizeSquared();

if (DistanceSquared <= FMath::Square(AcceptanceRadius))
{
    // 已进入半径，不需要开方
}
```

距离比较优先使用平方距离；但最终需要真实长度、归一化或时间估计时仍需要开方。

### 2.2 安全归一化

$$
\hat v=\frac{v}{\lVert v\rVert}
$$

```cpp
const FVector Direction = Delta.GetSafeNormal();
```

`GetSafeNormal` 的容差参数比较的是**平方长度**，源码注释位于 `Vector.h:L640-L647`。不要把“最小长度”直接作为这个参数传入而忘记平方。

如果零向量在业务上表示错误，应该显式检查，而不是默默接受返回的零向量：

```cpp
if (Delta.IsNearlyZero())
{
    return;
}

const FVector Direction = Delta.GetSafeNormal();
```

### 2.3 点积

$$
a\cdot b=a_xb_x+a_yb_y+a_zb_z
=\lVert a\rVert\lVert b\rVert\cos\theta
$$

只有当两个向量都已归一化时，点积才直接等于夹角余弦：

```cpp
const FVector Forward = Actor->GetActorForwardVector();
const FVector ToTarget = (TargetLocation - Actor->GetActorLocation()).GetSafeNormal();
const double CosAngle = FVector::DotProduct(Forward, ToTarget);

const double HalfFovRadians = FMath::DegreesToRadians(FieldOfViewDegrees * 0.5);
const bool bInsideFov = CosAngle >= FMath::Cos(HalfFovRadians);
```

常见用途：

- 前后判断；
- 视野锥检测；
- 向量投影；
- 接触法向速度；
- Lambert 光照项。

### 2.4 叉积

叉积结果垂直于输入平面，长度为：

$$
\lVert a\times b\rVert=\lVert a\rVert\lVert b\rVert\sin\theta
$$

判断目标位于角色左右侧：

```cpp
const FVector Forward = Actor->GetActorForwardVector();
const FVector ToTarget = (TargetLocation - Actor->GetActorLocation()).GetSafeNormal();
const double SignedSide = FVector::CrossProduct(Forward, ToTarget).Z;

if (SignedSide > 0.0)
{
    // 在 UE 的 X 前、Y 右、Z 上坐标下，目标偏右
}
```

注意：这个判断假设角色主要绕世界 Z 轴转动。任意表面或飞行姿态应把结果投影到角色自身 Up 轴：

```cpp
const double SignedSide3D = FVector::DotProduct(
    FVector::CrossProduct(Forward, ToTarget),
    Actor->GetActorUpVector());
```

### 2.5 投影、拒绝分量与反射

向量 $v$ 在非零向量 $n$ 上的投影：

$$
\operatorname{proj}_n(v)=\frac{v\cdot n}{n\cdot n}n
$$

如果 $n$ 已归一化：

$$
v_n=(v\cdot n)n,\qquad v_t=v-v_n
$$

```cpp
const FVector UnitNormal = Hit.Normal.GetSafeNormal();
const FVector NormalVelocity = UnitNormal * FVector::DotProduct(Velocity, UnitNormal);
const FVector TangentVelocity = Velocity - NormalVelocity;
```

反射方向：

$$
r=v-2(v\cdot n)n
$$

```cpp
const FVector Reflected = FMath::GetReflectionVector(Velocity, UnitNormal);
```

### 2.6 稳健的平行与退化判断

直接检查 `Cross.SizeSquared() < SMALL_NUMBER` 会随向量长度变化。更稳健的相对判断是：

$$
\frac{\lVert a\times b\rVert^2}
{\lVert a\rVert^2\lVert b\rVert^2}<\varepsilon^2
$$

```cpp
bool AreDirectionsNearlyParallel(const FVector& A, const FVector& B, double SinTolerance)
{
    const double Denominator = A.SizeSquared() * B.SizeSquared();
    if (Denominator <= UE_DOUBLE_SMALL_NUMBER)
    {
        return false; // 零向量没有可靠方向
    }

    const double CrossSquared = FVector::CrossProduct(A, B).SizeSquared();
    return CrossSquared <= FMath::Square(SinTolerance) * Denominator;
}
```

---

## 三、矩阵：理解 UE 的行向量语义

### 3.1 矩阵表示什么

矩阵把向量线性映射到另一个空间。$3 \times 3$ 矩阵可表达旋转、缩放和剪切；$4 \times 4$ 齐次矩阵还可表达平移。

单位矩阵：

$$
I=
\begin{bmatrix}
1&0&0&0\\
0&1&0&0\\
0&0&1&0\\
0&0&0&1
\end{bmatrix}
$$

```cpp
const FMatrix Identity = FMatrix::Identity;
```

### 3.2 UE 的矩阵布局

`FMatrix` 元素按 `M[RowIndex][ColumnIndex]` 访问。UE 的点变换可写成行向量形式：

$$
p'=pM
$$

平移矩阵为：

$$
T=
\begin{bmatrix}
1&0&0&0\\
0&1&0&0\\
0&0&1&0\\
t_x&t_y&t_z&1
\end{bmatrix}
$$

因此平移位于最后一行，而不是许多列向量教材中的最后一列。引擎构造旋转平移矩阵时明确写入：

```cpp
M[3][0] = Origin.X
M[3][1] = Origin.Y
M[3][2] = Origin.Z
```

源码：`Engine/Source/Runtime/Core/Public/Math/RotationTranslationMatrix.h:L87-L89`。

### 3.3 矩阵组合顺序

源码明确规定：

$$
C = A \mathbin{*} B
$$

逻辑上先应用 A，再应用 B：

$$
\operatorname{TransformPosition}(A \mathbin{*} B, P)
=
\operatorname{TransformPosition}
\!\left(B,\operatorname{TransformPosition}(A,P)\right)
$$

源码：`Matrix.h:L30-L35`。

因此 UE 行向量语义下，先缩放、再旋转、最后平移写作：

$$
M_{SRT}=SRT
$$

而不是列向量教材常见的 $TRS$。遇到外部论文或图形学资料，第一步必须确认它采用行向量还是列向量。

### 3.4 行列式、秩和可逆性

$2 \times 2$ 行列式：

$$
\det
\begin{bmatrix}
a&b\\c&d
\end{bmatrix}
=ad-bc
$$

3D 中，三个向量张成的有向体积为标量三重积：

$$
\det[a,b,c]=a\cdot(b\times c)
$$

行列式告诉我们：

- $\det(M)=0$：矩阵降秩，不存在唯一逆；
- $\det(M)<0$：变换发生方向翻转，常见于奇数个负缩放轴；
- $\lvert\det(M)\rvert$：体积缩放因子。

但是生产代码不应仅用固定 `1e-6` 判定任意尺度矩阵是否奇异。数值求解时应使用与矩阵范数相关的阈值、条件数估计或可靠分解。

### 3.5 逆、转置和法线

逆矩阵满足：

$$
MM^{-1}=I
$$

对于纯旋转正交矩阵：

$$
R^{-1}=R^T
$$

法线在非均匀缩放下应使用逆转置：

$$
n'=(M^{-1})^Tn
$$

原因是法线需要继续与变换后的切平面正交，而普通方向变换无法保证这一点。

### 3.6 自定义基

设三个基向量 $e_1,e_2,e_3$。从基坐标恢复标准坐标最清楚的写法是线性组合：

```cpp
FVector ToWorldBasis(
    const FVector& Coordinates,
    const FVector& E1,
    const FVector& E2,
    const FVector& E3)
{
    return Coordinates.X * E1
         + Coordinates.Y * E2
         + Coordinates.Z * E3;
}
```

如果基是标准正交基，反向转换只需要三个点积：

```cpp
FVector ToBasisCoordinates(
    const FVector& V,
    const FVector& E1,
    const FVector& E2,
    const FVector& E3)
{
    return FVector(
        FVector::DotProduct(V, E1),
        FVector::DotProduct(V, E2),
        FVector::DotProduct(V, E3));
}
```

非正交基才需要解线性方程组；不要默认通过显式求逆完成。

---

## 四、FTransform：UE 中最常用的空间变换

### 4.1 内部表示和应用顺序

`FTransform` 保存：

- `Rotation`：四元数；
- `Translation`：向量；
- `Scale3D`：向量。

对位置的应用顺序是：

$$
\mathrm{Scale}\rightarrow\mathrm{Rotate}\rightarrow\mathrm{Translate}
$$

对方向不应用 Translation。源码：`TransformNonVectorized.h:L13-L23`。

```cpp
const FTransform LocalToWorld(
    Rotation,
    Translation,
    Scale);

const FVector WorldPoint = LocalToWorld.TransformPosition(LocalPoint);
const FVector LocalPointAgain = LocalToWorld.InverseTransformPosition(WorldPoint);
```

### 4.2 FTransform 的组合顺序

对于 `FTransform`：

$$
C = A \mathbin{*} B
$$

表示先 A 后 B。骨骼层级因此应写成：

```cpp
const FTransform BoneComponentTransform = BoneLocalTransform * ParentComponentTransform;
```

完整链为：

$$
T_{bone\to component}
=T_{bone\to parent}
T_{parent\to grandparent}
\cdots
T_{root\to component}
$$

不要写成 `Parent * Local`；那会先应用父变换，再应用局部变换。

### 4.3 局部旋转和世界旋转

源码给出的语义示例：

```cpp
// 对 FTransform：
LocalToWorld = DeltaRotation * LocalToWorld; // 局部空间增量
LocalToWorld = LocalToWorld * DeltaRotation; // 世界空间增量
```

这和 `FQuat` 的乘法方向不同，是 UE 旋转代码中最容易混淆的地方之一。

### 4.4 非均匀缩放和剪切边界

`FTransform` 只存旋转、平移和逐轴缩放，不能独立保存剪切。非均匀缩放与旋转组合可能在矩阵意义上产生剪切，因此：

- 需要精确保留任意仿射变换时使用矩阵；
- 骨骼层级尽量避免带旋转的非均匀缩放；
- 法线和碰撞几何必须单独验证；
- 不要假设任意 $\texttt{FMatrix}\rightarrow\texttt{FTransform}\rightarrow\texttt{FMatrix}$ 都能无损往返。

---

## 五、旋转：FRotator 与 FQuat

### 5.1 FRotator 的真实轴和顺序

当前源码定义：

| 分量 | 旋转轴 | 直观含义 |
|---|---|---|
| Pitch | Y，角色 Right 轴 | 抬头/低头 |
| Yaw | Z，角色 Up 轴 | 左右转向 |
| Roll | X，角色 Forward 轴 | 侧倾 |

内在旋转顺序是：

$$
\mathrm{Yaw}\rightarrow\mathrm{Pitch}\rightarrow\mathrm{Roll}
$$

源码：`Rotator.h:L21-L52`。

```cpp
const FRotator Rotation(PitchDegrees, YawDegrees, RollDegrees);
```

`FRotator` 适合编辑、显示和受限相机角度；不适合长期累积任意 3D 姿态。

### 5.2 万向节死锁

欧拉角通过三个顺序旋转参数化姿态。当 Pitch 接近 $\pm 90^\circ$ 时，两个有效旋转轴趋于重合，局部参数化失去一个独立自由度。

正确的工程策略：

- 第一人称相机：限制 Pitch，并用 Yaw/Pitch 作为控制参数；
- 飞行器和任意姿态：内部累积四元数；
- 骨骼动画：使用四元数插值和关节约束；
- 仅在 UI、序列化或调试显示时转换为 Rotator。

四元数避免的是欧拉参数化的奇异性，不代表任何四元数算法都会自动选择正确的业务旋转路径。

### 5.3 四元数表示

单位四元数：

$$
q=(x,y,z,w),\qquad \lVert q\rVert=1
$$

轴角构造：

$$
q=\left(
n_x\sin\frac\theta2,
n_y\sin\frac\theta2,
n_z\sin\frac\theta2,
\cos\frac\theta2
\right)
$$

```cpp
const FVector Axis = FVector::UpVector;
const double AngleRadians = FMath::DegreesToRadians(90.0);
const FQuat Rotation(Axis, AngleRadians);
```

轴应当归一化，角度使用弧度。

### 5.4 Quaternion 的乘法顺序

对于 `FQuat`：

```cpp
const FQuat Combined = Rotation2 * Rotation1;
```

表示先应用 `Rotation1`，再应用 `Rotation2`。源码：`Quat.h:L29-L35`。

对比：

$$
\begin{aligned}
\texttt{FMatrix/FTransform}:\quad&A \mathbin{*} B &&= \text{先 }A\text{，后 }B,\\
\texttt{FQuat}:\quad&A \mathbin{*} B &&= \text{先 }B\text{，后 }A.
\end{aligned}
$$

这是 API 约定，不是 Hamilton 乘积本身发生了变化。

### 5.5 旋转向量

把 $v$ 看作纯四元数 $(v_x,v_y,v_z,0)$：

$$
v'=qvq^{-1}
$$

```cpp
const FVector Rotated = Rotation.RotateVector(FVector::ForwardVector);
```

如果只需要把一个单位方向转到另一个单位方向：

```cpp
const FQuat Delta = FQuat::FindBetweenNormals(FromDirection, ToDirection);
```

反向或近零向量是退化情况，应提前处理。

### 5.6 Slerp、FastLerp 与双覆盖

$q$ 和 $-q$ 表示同一个空间旋转，这叫四元数双覆盖。插值时如果不修正符号，可能沿四维球面的长路径旋转。

```cpp
const FQuat Smooth = FQuat::Slerp(Start, End, Alpha);

FQuat Fast = FQuat::FastLerp(Start, End, Alpha);
Fast.Normalize();
```

当前源码中：

- `Slerp` 会校正 alignment，并返回归一化结果；
- `SlerpFullPath` 不检查最短路径；
- `FastLerp` 会选择短路径，但返回结果未归一化。

源码：`Quat.h:L641-L677、L1366-L1377`。

因此“Slerp 永远优于 Lerp”过于绝对。动画批量混合中，归一化线性插值可能是合理的性能选择；相机恒定角速度转向则更适合 Slerp。

---

## 六、向量空间、秩与特征值

### 6.1 线性组合、基和维度

若：

$$
v=c_1v_1+c_2v_2+\cdots+c_nv_n
$$

则 $v$ 是这些向量的线性组合。基是一组能张成空间且线性无关的向量。

在游戏开发中，“换基”实际对应：

- 世界空间到角色空间；
- 组件空间到骨骼空间；
- 接触法线/切线空间；
- 相机 View Basis；
- 惯性主轴坐标系。

### 6.2 秩和零空间

矩阵的秩是独立行或列的最大数量：

$$
\operatorname{rank}(A)+\operatorname{nullity}(A)=n
$$

在 IK 和约束求解中：

- 秩不足意味着某些目标方向无法由当前自由度产生；
- 零空间表示“不影响主任务”的关节运动；
- 接近秩亏时，直接求逆会产生巨大修正量。

### 6.3 特征值与特征向量

$$
Av=\lambda v
$$

特征向量在变换后保持方向，特征值描述该方向的缩放或动态响应。

典型用途：

- 惯性张量主轴；
- 协方差矩阵和 PCA；
- 线性系统稳定性；
- 刚度矩阵和模态；
- 迭代算法收敛分析。

对称矩阵拥有实特征值和正交特征向量；正定矩阵所有特征值为正。一般矩阵可能出现复特征值，不能把所有问题都塞进只返回两个实数的结构。

### 6.4 条件数比“是否可逆”更重要

即使矩阵在数学上可逆，也可能因为条件数很大而无法稳定求解。微小输入误差会被放大：

$$
\frac{\lVert\delta x\rVert}{\lVert x\rVert}
\lesssim
\kappa(A)
\frac{\lVert\delta b\rVert}{\lVert b\rVert}
$$

工程上需要区分：

- 精确奇异；
- 数值上接近奇异；
- 条件尚可但迭代预算不足；
- 模型本身自由度不够。

---

## 七、线性方程组、最小二乘与 IK

### 7.1 不要默认显式求逆

求解：

$$
Ax=b
$$

理论上可写 $x=A^{-1}b$，但实际通常使用分解：

- LU：一般方阵，多次右端项；
- Cholesky：对称正定矩阵；
- QR：最小二乘，比正规方程稳定；
- SVD：秩亏、伪逆和高鲁棒性场景；
- CG：大型稀疏对称正定系统；
- Gauss-Seidel/Jacobi：约束和实时迭代系统中的基础方法。

延伸阅读：&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

### 7.2 高斯消元的最低要求

教学实现至少需要：

1. 验证每一行尺寸一致；
2. 部分选主元；
3. 相对而非固定绝对阈值；
4. 区分无解、无穷多解和数值失败；
5. 把失败显式返回给调用方。

生产代码还应避免 `TArray<TArray<...>>` 的碎片化布局，并优先使用经过验证的矩阵库或引擎现有求解器。

### 7.3 最小二乘

超定系统求：

$$
\min_x\lVert Ax-b\rVert^2
$$

正规方程：

$$
A^TAx=A^Tb
$$

适合解释推导，但会使条件数近似平方：

$$
\kappa(A^TA)\approx\kappa(A)^2
$$

因此建议：

- 条件良好、规模很小：可使用正规方程；
- 通用最小二乘：QR；
- 秩亏或需要伪逆：SVD；
- 实时 IK：Damped Least Squares。

### 7.4 IK 的阻尼最小二乘

线性化 IK：

$$
J\Delta\theta=\Delta x
$$

Jacobian 往往是矩形矩阵，不能直接交给只接受方阵的高斯消元。常用阻尼最小二乘：

$$
\Delta\theta
=J^T(JJ^T+\lambda^2I)^{-1}\Delta x
$$

其中：

- $\lambda$ 是阻尼，防止奇异附近修正爆炸；
- 更新步长 $\alpha$ 与阻尼不同；
- 最终更新为 $\theta_{next}=\theta+\alpha\Delta\theta$。

完整 Jacobian、转置、伪逆和 DLS 推导见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;；UE FullBody IK 的引擎应用见&#12298;[UE FullBody IK 数学详解](/knowledge/ue-fullbody-ik-math/)&#12299;。

---

## 八、物理中的线性代数接口

本章只说明线性代数负责什么；积分器、碰撞和约束求解转到对应专题。

### 8.1 力、冲量和扭矩

$$
F=ma,\qquad \Delta v=\frac{J}{m},\qquad \tau=r\times F
$$

```cpp
UPrimitiveComponent* Body = GetMesh();

Body->AddForce(WorldForce);
Body->AddImpulse(WorldImpulse);
Body->AddTorqueInRadians(WorldTorque);
```

当前公开接口为 `AddTorqueInRadians` / `AddTorqueInDegrees`，源码位于 `Engine/Source/Runtime/Engine/Classes/Components/PrimitiveComponent.h:L1799-L1818`。

### 8.2 碰撞响应

3D 碰撞不能直接把“一维弹性碰撞公式”逐分量套到 FVector。应先沿接触法线计算相对速度和冲量，再把冲量施加回刚体：

$$
v_{rel,n}=(v_A-v_B)\cdot n
$$

旋转刚体还需要接触臂、逆惯性张量和角速度项。完整推导见：

- &#12298;[2D 物理引擎详解](/knowledge/2d-physics-engine/)&#12299;
- &#12298;[GJK / EPA / SAT 碰撞检测](/knowledge/collision-detection-gjk-epa-sat/)&#12299;
- &#12298;[Chaos 物理引擎详解](/knowledge/ue-chaos-physics-engine/)&#12299;

### 8.3 数值积分和弹簧

连续运动方程需要离散积分。显式 Euler、半隐式 Euler、Verlet 和高阶方法有不同的稳定性与能量行为，不能只凭公式外观替换。

当前 `FMath::SpringDamper` 是原地更新 value/rate 的 `void` 函数：

```cpp
FVector Current = GetActorLocation();
FVector CurrentVelocity = Velocity;
const FVector TargetVelocity = FVector::ZeroVector;

FMath::SpringDamper(
    Current,
    CurrentVelocity,
    Target,
    TargetVelocity,
    DeltaTime,
    UndampedFrequencyHz,
    DampingRatio);
```

函数签名和稳定性注释见 `Engine/Source/Runtime/Core/Public/Math/UnrealMathUtility.h:L1654-L1705`。

深入阅读：

- &#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;
- &#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;
- &#12298;[位置基弹性杆详解](/knowledge/position-based-elastic-rods/)&#12299;
- &#12298;[VBD / AVBD 数学详解](/knowledge/vbd-avbd-math/)&#12299;

---

## 九、动画中的线性代数接口

### 9.1 骨骼层级

每个骨骼保存相对父骨骼的局部变换。按 UE `FTransform` 语义：

```cpp
ComponentTransforms[RootIndex] = LocalTransforms[RootIndex];

for (int32 BoneIndex = 1; BoneIndex < LocalTransforms.Num(); ++BoneIndex)
{
    const int32 ParentIndex = ParentIndices[BoneIndex];
    ComponentTransforms[BoneIndex]
        = LocalTransforms[BoneIndex] * ComponentTransforms[ParentIndex];
}
```

真实 Skeleton 不是一条线性链，必须通过 ParentIndices 取父骨骼，不能默认 `i-1` 就是父节点。

### 9.2 动画混合

位置和缩放可线性插值；旋转需要考虑四元数双覆盖、归一化和路径：

```cpp
FTransform Blended;
Blended.SetLocation(FMath::Lerp(A.GetLocation(), B.GetLocation(), Alpha));
Blended.SetScale3D(FMath::Lerp(A.GetScale3D(), B.GetScale3D(), Alpha));
Blended.SetRotation(FQuat::Slerp(A.GetRotation(), B.GetRotation(), Alpha));
```

实际 AnimGraph 还会处理：

- 每骨骼权重；
- Additive Pose；
- 曲线与 Attribute；
- Sync Group；
- Inertialization / Blend Stack；
- Root Motion 权重。

因此上面的 `FTransform` 示例只用于解释局部数学，不是 AnimGraph 混合器的替代实现。

### 9.3 Look At

“方向转 Rotator”默认让 X 轴朝向目标。如果骨骼前向轴不是 X，必须额外补偿：

```cpp
const FVector Direction = (TargetWorld - BoneWorld).GetSafeNormal();
if (!Direction.IsNearlyZero())
{
    const FQuat AimRotation = FRotationMatrix::MakeFromX(Direction).ToQuat();
    const FQuat Smoothed = FQuat::Slerp(CurrentRotation, AimRotation, Alpha);
}
```

还应明确 Bone Space、Component Space 和 World Space，避免把世界目标直接写入组件空间控制节点。

### 9.4 Root Motion

Root Motion 不是“取出一个位移后调用 `AddMovementInput`”。在当前动画链路中：

- 动画资产通过 `FAnimExtractContext` 决定是否提取 Root Motion；
- AnimGraph 可通过 `IAnimRootMotionProvider` 在 Attribute 中读取/覆盖 Root Motion；
- `UAnimInstance::ConsumeExtractedRootMotion(float Alpha)` 提供消费入口；
- CharacterMovement 负责把 Root Motion 与移动、碰撞和网络状态结合。

源码入口：

- `Engine/Source/Runtime/Engine/Public/Animation/AnimRootMotionProvider.h:L26-L40`
- `Engine/Source/Runtime/Engine/Classes/Animation/AnimInstance.h:L446、L1665`
- `Engine/Source/Runtime/Engine/Classes/Animation/AnimSequence.h:L420`

相关专题：

- &#12298;[UE 动画节点数学详解](/knowledge/ue-animation-node-math/)&#12299;
- &#12298;[UE FullBody IK 数学详解](/knowledge/ue-fullbody-ik-math/)&#12299;
- &#12298;[IK Retargeter 数学与 Ops](/knowledge/ik-retargeter-ops-math/)&#12299;
- &#12298;[Motion Matching 源码详解](/knowledge/motion-matching-pose-search-source-guide/)&#12299;

---

## 十、常用 UE 模式

### 10.1 世界方向转换到角色局部空间

```cpp
const FTransform ActorTransform = Actor->GetActorTransform();
const FVector LocalDirection = ActorTransform.InverseTransformVectorNoScale(WorldDirection);

const double ForwardAmount = LocalDirection.X;
const double RightAmount = LocalDirection.Y;
```

这比用世界 X/Y 分量判断角色前后左右更可靠。

### 10.2 角度计算时 Clamp

浮点误差可能让点积略超出 $[-1,1]$：

```cpp
const FVector A = DirectionA.GetSafeNormal();
const FVector B = DirectionB.GetSafeNormal();
const double CosAngle = FMath::Clamp(FVector::DotProduct(A, B), -1.0, 1.0);
const double AngleRadians = FMath::Acos(CosAngle);
```

### 10.3 固定时间步与帧率无关插值

线性代数只定义状态关系，不保证时间离散正确。使用：

```cpp
Current = FMath::VInterpTo(Current, Target, DeltaTime, InterpSpeed);
```

时要知道它不是固定持续时间的线性插值，也不是物理弹簧。网络重放、物理子步和确定性需求应选择明确的时间模型。

### 10.4 调试空间和方向

```cpp
DrawDebugCoordinateSystem(
    GetWorld(),
    Transform.GetLocation(),
    Transform.Rotator(),
    30.0f,
    false,
    0.0f);

DrawDebugDirectionalArrow(
    GetWorld(),
    Origin,
    Origin + Direction * 100.0,
    20.0f,
    FColor::Green,
    false,
    0.0f);
```

调试图至少同时画：

- 原点；
- X/Y/Z 轴；
- 输入向量；
- 变换后的向量；
- 当前空间名称。

只打印三个数，很难发现“数值正确但空间错误”。

---

## 十一、API 速查

### 11.1 FVector

```cpp
const double Length = V.Size();
const double LengthSquared = V.SizeSquared();

const FVector Direction = V.GetSafeNormal();
const double Distance = FVector::Distance(A, B);
const double DistanceSquared = FVector::DistSquared(A, B);

const double Dot = FVector::DotProduct(A, B);
const FVector Cross = FVector::CrossProduct(A, B);

const FVector Lerp = FMath::Lerp(A, B, Alpha);
const FVector Reflected = FMath::GetReflectionVector(V, UnitNormal);
```

### 11.2 FTransform

```cpp
const FVector WorldPoint = Transform.TransformPosition(LocalPoint);
const FVector WorldVector = Transform.TransformVector(LocalVector);
const FVector WorldDirection = Transform.TransformVectorNoScale(LocalDirection);

const FVector LocalPointAgain = Transform.InverseTransformPosition(WorldPoint);

const FTransform LocalToWorld = LocalToParent * ParentToWorld;
```

### 11.3 FRotator 和 FQuat

```cpp
const FRotator Rotator(PitchDegrees, YawDegrees, RollDegrees);
const FQuat Quat = Rotator.Quaternion();

const FQuat AxisAngle(UnitAxis, AngleRadians);
const FVector Rotated = AxisAngle.RotateVector(Vector);

const FQuat Combined = Rotation2 * Rotation1; // 先 Rotation1，后 Rotation2
const FQuat Smooth = FQuat::Slerp(Start, End, Alpha);

FQuat Fast = FQuat::FastLerp(Start, End, Alpha);
Fast.Normalize();
```

### 11.4 物理组件

```cpp
Body->AddForce(Force);
Body->AddImpulse(Impulse);
Body->AddTorqueInRadians(Torque);
```

---

## 十二、常见错误检查表

| 现象 | 首先检查 |
|---|---|
| 左右方向反了 | 叉积参数顺序、使用的 Up 轴、世界/角色空间 |
| 旋转顺序怪异 | 是否混淆 FQuat 与 FTransform 的乘法顺序 |
| 骨骼飞离父节点 | 是否写成 `Parent * Local`；父索引是否真的为 $i-1$ |
| 位移被额外加了一次平移 | Offset/Direction 是否误用 `TransformPosition` |
| 非均匀缩放后光照错误 | 法线是否使用正确的逆转置语义 |
| 插值绕远路 | 四元数符号、是否需要最短路径、是否使用 FullPath |
| IK 在伸直状态爆炸 | Jacobian 秩、阻尼、步长和目标可达性 |
| 矩阵“可逆”但结果巨大 | 条件数和问题尺度，而不只是 determinant 是否为零 |
| 大世界位置精度丢失 | 是否把 `FVector` 过早缩窄为 `FVector3f` |
| Root Motion 与移动组件冲突 | 是否绕过 AnimGraph/CharacterMovement 的消费链 |

---

## 十三、延伸阅读

### 数学与数值方法

- &#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299;
- &#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;
- &#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;
- &#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299;
- &#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;

### 物理

- &#12298;[2D 物理引擎详解](/knowledge/2d-physics-engine/)&#12299;
- &#12298;[GJK / EPA / SAT 碰撞检测](/knowledge/collision-detection-gjk-epa-sat/)&#12299;
- &#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;
- &#12298;[位置基弹性杆详解](/knowledge/position-based-elastic-rods/)&#12299;
- &#12298;[VBD / AVBD 数学详解](/knowledge/vbd-avbd-math/)&#12299;

### 动画

- &#12298;[UE 动画节点数学详解](/knowledge/ue-animation-node-math/)&#12299;
- &#12298;[UE FullBody IK 数学详解](/knowledge/ue-fullbody-ik-math/)&#12299;
- &#12298;[IK Retargeter 数学与 Ops](/knowledge/ik-retargeter-ops-math/)&#12299;
- &#12298;[Motion Matching 源码详解](/knowledge/motion-matching-pose-search-source-guide/)&#12299;

### 书籍

- *3D Math Primer for Graphics and Game Development* — Fletcher Dunn, Ian Parberry
- *Essential Mathematics for Games and Interactive Applications* — James M. Van Verth, Lars M. Bishop
- *Visualizing Quaternions* — Andrew J. Hanson

---

### 最终原则

线性代数公式本身通常不是 UE Bug 的来源，真正的问题更常发生在四个边界：

1. 把列向量教材约定套进 UE 行向量矩阵；
2. 混淆 FQuat 与 FTransform 的组合顺序；
3. 混淆点、方向、法线及其所在空间；
4. 把数学上存在的解误认为数值上稳定、工程上可用的解。

每次实现前先写清楚：**数据是什么空间、采用什么单位、按什么顺序应用、容差相对什么尺度**。这四个问题明确后，大部分“玄学旋转”“骨骼飞走”“IK 爆炸”和“大世界抖动”都会变成可追踪的问题。
