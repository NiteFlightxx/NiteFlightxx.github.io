---
title: "UE 物理动画线性代数详解 — 向量、矩阵、四元数与物理动画应用"
excerpt: "系统讲解虚幻引擎物理与动画编程所需的线性代数：向量运算（点积、叉积、投影）、矩阵与变换（行列式、逆矩阵、旋转矩阵）、向量空间与线性相关性、特征值与特征向量、线性方程组求解（高斯消元、LU 分解、最小二乘）、四元数（Hamilton 乘积、Slerp 插值、万向节死锁消除）、物理应用（牛顿定律、弹道、碰撞、弹簧）、动画应用（骨骼层级、FK/IK、动画混合、根运动）与 UE 实战案例。配合 UE C++ 代码示例。"
date: "2026-09-06"
category: "Mathematics"
subtopic: "LinearAlgebra"
tags: ["线性代数", "向量", "矩阵", "四元数", "UE"]
readTime: "阅读约40分钟"
---

> 线性代数是游戏引擎的数学基石：3D 空间中物体的位置、朝向与运动由向量描述，变换由矩阵编码，旋转由四元数表示。物理模拟中的力、速度、加速度是向量运算，碰撞检测依赖叉积与行列式，动画系统依赖坐标空间变换与四元数插值，IK 求解依赖线性方程组。本文从向量出发，沿"向量 → 矩阵 → 坐标变换 → 四元数 → 物理应用 → 动画应用 → UE 实战"的主线系统梳理全链。
>
> 本文为教材式总览。微积分基础见&#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299;，微分方程与数值方法见&#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;，偏微分方程见&#12298;[偏微分方程与数值离散详解](/knowledge/partial-differential-equations/)&#12299;，数学符号速查见&#12298;[高等数学符号速查详解](/knowledge/mathematical-notation-reference/)&#12299;。雅可比矩阵的深拆见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;，海森矩阵的深拆见&#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299;，线性方程组迭代求解的深拆见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

---

## 一、引言：为什么游戏开发需要线性代数

线性代数在游戏引擎中的应用贯穿以下环节：

- **位置与方向**：用 3D 向量表示物体的位置和朝向
- **运动**：通过向量运算计算移动、旋转、缩放
- **物理模拟**：力、速度、加速度的计算与碰撞检测
- **动画**：骨骼变换的层级组合、插值与混合
- **碰撞检测**：通过叉积、行列式判断物体相交关系

本文面向已有基础编程经验、希望系统掌握虚幻引擎物理与动画底层数学的读者。

---

## 二、向量

### 2.1 向量基础与虚幻引擎类型

向量是具有**大小**和**方向**的量。在 3D 图形中，向量通常表示：

- 位置（Position）
- 方向（Direction）
- 速度（Velocity）
- 力（Force）

虚幻引擎中的向量类型：

```cpp
FVector   // 3D 向量 (X, Y, Z)
FVector2D // 2D 向量 (X, Y)
FVector4  // 4D 向量 (X, Y, Z, W)
```

基本用法：

```cpp
FVector Position(100.0f, 200.0f, 50.0f);
FVector Direction(1.0f, 0.0f, 0.0f); // X 轴正方向
```

### 2.2 向量运算

#### 加法与减法

$$
\vec{V_1} + \vec{V_2} = (x_1+x_2,\; y_1+y_2,\; z_1+z_2)
$$

$$
\vec{V_1} - \vec{V_2} = (x_1-x_2,\; y_1-y_2,\; z_1-z_2)
$$

加法得到新位置，减法求两点之间的方向向量。

```cpp
FVector A(100, 0, 0);
FVector B(50, 100, 0);
FVector Sum = A + B;        // (150, 100, 0)
FVector Diff = A - B;       // (50, -100, 0)
```

#### 标量乘法

$$
k \cdot \vec{V} = (kx,\; ky,\; kz)
$$

标量乘法改变向量的大小但不改变方向，常用于缩放速度或力的大小。

```cpp
FVector Velocity(10, 0, 0);
FVector DoubleSpeed = Velocity * 2.0f; // (20, 0, 0)
```

### 2.3 向量长度与距离

#### 长度（模）

$$
|\vec{V}| = \sqrt{x^2 + y^2 + z^2}
$$

```cpp
FVector V(3, 4, 0);
float Length = V.Size();              // 5.0
float SquaredLength = V.SizeSquared(); // 25.0（更快，避免开方）
```

**性能提示**：比较距离时优先使用 `SizeSquared()` 避免开方运算。

#### 距离公式

$$
d(\vec{A}, \vec{B}) = |\vec{B} - \vec{A}| = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2 + (z_2-z_1)^2}
$$

```cpp
float Distance = FVector::Distance(A, B);
float DistSquared = FVector::DistSquared(A, B); // 更快
```

### 2.4 向量归一化

将向量转换为长度为 1 的单位向量，保持方向不变：

$$
\hat{V} = \frac{\vec{V}}{|\vec{V}|}
$$

```cpp
FVector Direction(3, 4, 0);
FVector UnitDirection = Direction.GetSafeNormal(); // (0.6, 0.8, 0)
bool bIsNormalized = Direction.IsNormalized();
```

`GetSafeNormal()` 在向量长度接近零时返回零向量，避免除以零。

### 2.5 点积

#### 定义

$$
\vec{V_1} \cdot \vec{V_2} = x_1 x_2 + y_1 y_2 + z_1 z_2 = |\vec{V_1}| \cdot |\vec{V_2}| \cdot \cos\theta
$$

#### 几何意义

点积测量两个向量的**相似程度**：

- 点积 > 0：夹角 < 90°（同向）
- 点积 = 0：夹角 = 90°（垂直）
- 点积 < 0：夹角 > 90°（反向）

#### 重要性质

- **交换律**：$\vec{A} \cdot \vec{B} = \vec{B} \cdot \vec{A}$
- **分配律**：$\vec{A} \cdot (\vec{B} + \vec{C}) = \vec{A} \cdot \vec{B} + \vec{A} \cdot \vec{C}$
- **自身点积**：$\vec{A} \cdot \vec{A} = |\vec{A}|^2$

#### 计算夹角

$$
\theta = \arccos\left(\frac{\vec{V_1} \cdot \vec{V_2}}{|\vec{V_1}| \cdot |\vec{V_2}|}\right)
$$

```cpp
FVector Forward = Actor->GetActorForwardVector();
FVector ToTarget = (Target - Actor->GetActorLocation()).GetSafeNormal();

float Dot = FVector::DotProduct(Forward, ToTarget);

if (Dot > 0.7f) // cos(45°) ≈ 0.707
{
    // 目标在前方约 45° 范围内
}
```

**常见应用**：视野检测（判断目标是否在视野角度内）、朝向判断、Lambert 光照模型中的光照计算、向量投影。

### 2.6 叉积

#### 定义

$$
\vec{V_1} \times \vec{V_2} = (y_1 z_2 - z_1 y_2,\; z_1 x_2 - x_1 z_2,\; x_1 y_2 - y_1 x_2)
$$

#### 几何意义

- 结果是**垂直于两个向量的新向量**
- 大小：$|\vec{V_1} \times \vec{V_2}| = |\vec{V_1}| \cdot |\vec{V_2}| \cdot \sin\theta$
- 方向遵循**右手定则**

#### 重要性质

- **反交换律**：$\vec{A} \times \vec{B} = -(\vec{B} \times \vec{A})$
- **分配律**：$\vec{A} \times (\vec{B} + \vec{C}) = \vec{A} \times \vec{B} + \vec{A} \times \vec{C}$
- **平行向量**：$\vec{A} \times \vec{A} = \vec{0}$
- **正交性**：$(\vec{A} \times \vec{B}) \cdot \vec{A} = 0$，$(\vec{A} \times \vec{B}) \cdot \vec{B} = 0$

```cpp
FVector Up = FVector::UpVector;          // (0, 0, 1)
FVector Forward = FVector::ForwardVector; // (1, 0, 0)
FVector Right = FVector::CrossProduct(Forward, Up); // (0, 1, 0)
```

**常见应用**：构建坐标系（由两个轴求第三个轴）、判断目标在左侧还是右侧、计算三角形表面法线、判断旋转方向。

```cpp
FVector Forward = Actor->GetActorForwardVector();
FVector ToTarget = (Target - Actor->GetActorLocation()).GetSafeNormal();
FVector Cross = FVector::CrossProduct(Forward, ToTarget);

if (Cross.Z > 0)
{
    // 目标在右侧
}
else
{
    // 目标在左侧
}
```

### 2.7 向量投影

计算向量 $\vec{A}$ 在向量 $\vec{B}$ 上的投影：

$$
\text{Proj}_{\vec{B}}(\vec{A}) = \frac{\vec{A} \cdot \vec{B}}{|\vec{B}|^2} \cdot \vec{B}
$$

常用于分解速度或力的分量。例如碰撞响应中，将速度分解为沿表面方向和沿法线方向：

```cpp
FVector Velocity(10, 10, 0);
FVector SurfaceNormal(0, 1, 0);

// 投影到表面法线（法线方向分量）
float ProjectionLength = FVector::DotProduct(Velocity, SurfaceNormal);
FVector NormalComponent = SurfaceNormal * ProjectionLength;

// 沿表面的速度分量（切向）
FVector SurfaceVelocity = Velocity - NormalComponent;
```

---

## 三、矩阵

### 3.1 矩阵基础与单位矩阵

矩阵是按行列排列的数字阵列，用于表示**线性变换**。

- **4×4 矩阵**：完整的 3D 变换（位置、旋转、缩放）
- **3×3 矩阵**：仅旋转和缩放
- **单位矩阵**：不做任何变换

$$
\mathbf{I} = \begin{bmatrix}
1 & 0 & 0 & 0 \\
0 & 1 & 0 & 0 \\
0 & 0 & 1 & 0 \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

单位矩阵的性质：$\mathbf{M} \times \mathbf{I} = \mathbf{I} \times \mathbf{M} = \mathbf{M}$。

```cpp
FMatrix M = FMatrix::Identity;
```

### 3.2 矩阵乘法

矩阵乘法**不可交换**：$\mathbf{A} \times \mathbf{B} \neq \mathbf{B} \times \mathbf{A}$，但满足**结合律**：$(\mathbf{A} \times \mathbf{B}) \times \mathbf{C} = \mathbf{A} \times (\mathbf{B} \times \mathbf{C})$。

对于矩阵 $\mathbf{A}_{m \times n}$ 和 $\mathbf{B}_{n \times p}$：

$$
(\mathbf{AB})_{ij} = \sum_{k=1}^{n} A_{ik} B_{kj}
$$

结果矩阵的维度为 $m \times p$。

```cpp
FVector TransformedPoint = Matrix.TransformPosition(Point);  // 变换位置点（受平移影响）
FVector TransformedVector = Matrix.TransformVector(Direction); // 变换方向向量（不受平移影响）
```

`TransformPosition` 与 `TransformVector` 的区别：前者将点视为齐次坐标 $(x, y, z, 1)$，受平移分量影响；后者将向量视为 $(x, y, z, 0)$，不受平移影响。这在法线变换、光线方向变换等场景中至关重要。

### 3.3 变换矩阵

#### 平移矩阵

$$
\begin{bmatrix}
1 & 0 & 0 & T_x \\
0 & 1 & 0 & T_y \\
0 & 0 & 1 & T_z \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

#### 缩放矩阵

$$
\begin{bmatrix}
S_x & 0 & 0 & 0 \\
0 & S_y & 0 & 0 \\
0 & 0 & S_z & 0 \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

#### 旋转矩阵

**绕 X 轴旋转**（Pitch）：

$$
\mathbf{R_x}(\theta) = \begin{bmatrix}
1 & 0 & 0 & 0 \\
0 & \cos\theta & -\sin\theta & 0 \\
0 & \sin\theta & \cos\theta & 0 \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

**绕 Y 轴旋转**（Yaw）：

$$
\mathbf{R_y}(\theta) = \begin{bmatrix}
\cos\theta & 0 & \sin\theta & 0 \\
0 & 1 & 0 & 0 \\
-\sin\theta & 0 & \cos\theta & 0 \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

**绕 Z 轴旋转**（Roll）：

$$
\mathbf{R_z}(\theta) = \begin{bmatrix}
\cos\theta & -\sin\theta & 0 & 0 \\
\sin\theta & \cos\theta & 0 & 0 \\
0 & 0 & 1 & 0 \\
0 & 0 & 0 & 1
\end{bmatrix}
$$

**欧拉角组合旋转**（Yaw-Pitch-Roll 顺序）：

$$
\mathbf{R} = \mathbf{R_z}(\text{roll}) \times \mathbf{R_x}(\text{pitch}) \times \mathbf{R_y}(\text{yaw})
$$

旋转顺序会影响最终结果，这是欧拉角表示的固有特性，也是万向节死锁问题的根源（详见 4.4 节）。

### 3.4 逆矩阵与转置

#### 逆矩阵

逆矩阵用于**反向变换**，满足 $\mathbf{M} \times \mathbf{M}^{-1} = \mathbf{I}$。

```cpp
FMatrix Inverse = Matrix.Inverse();
```

典型应用：世界空间与本地空间之间的转换。若 $\mathbf{M}_{\text{world}}$ 将本地坐标变换到世界坐标，则 $\mathbf{M}_{\text{world}}^{-1}$ 将世界坐标变换回本地坐标。

#### 转置矩阵

转置矩阵将行列互换。对于**正交矩阵**（如旋转矩阵），转置等于逆：

$$
\mathbf{M}^T = \mathbf{M}^{-1}
$$

```cpp
FMatrix Transposed = Matrix.GetTransposed();
```

这一性质在法线变换中尤为重要：法线应使用变换矩阵的逆转置 $\left(\mathbf{M}^{-1}\right)^T$ 进行变换，以在存在非均匀缩放时保持法线与表面垂直。

### 3.5 行列式

行列式是方阵的一个标量值，揭示矩阵对空间变换的本质特征。

#### 定义

**2×2 矩阵的行列式**：

$$
\det\begin{pmatrix}
a & b \\
c & d
\end{pmatrix} = ad - bc
$$

**3×3 矩阵的行列式**（按第一行余子式展开）：

$$
\det\begin{pmatrix}
a & b & c \\
d & e & f \\
g & h & i
\end{pmatrix}
= a(ei - fh) - b(di - fg) + c(dh - eg)
$$

```cpp
// 3×3 行列式
float Det3x3(float a, float b, float c,
             float d, float e, float f,
             float g, float h, float i)
{
    return a * (e * i - f * h)
         - b * (d * i - f * g)
         + c * (d * h - e * g);
}

// 使用 FMatrix 计算行列式
float Det = Matrix.Determinant();
```

#### 几何意义

- **2D**：行列式的绝对值 = 两个向量张成的**平行四边形面积**
- **3D**：行列式的绝对值 = 三个向量张成的**平行六面体体积**

```cpp
// 计算平行六面体体积（混合积 det = V1 · (V2 × V3)）
float ParallelepipedVolume(FVector V1, FVector V2, FVector V3)
{
    FVector Cross = FVector::CrossProduct(V2, V3);
    float Det = FVector::DotProduct(V1, Cross);
    return FMath::Abs(Det);
}

// 四面体体积 = 平行六面体体积 / 6
float TetrahedronVolume(FVector A, FVector B, FVector C, FVector D)
{
    return ParallelepipedVolume(B - A, C - A, D - A) / 6.0f;
}
```

#### 重要性质

1. **行列式为零 ⟺ 矩阵不可逆（奇异矩阵）**
2. **行列式为零 ⟺ 列向量（或行向量）线性相关**
3. **转置不改变行列式**：$\det(\mathbf{M}^T) = \det(\mathbf{M})$
4. **乘积的行列式 = 行列式的乘积**：$\det(\mathbf{AB}) = \det(\mathbf{A}) \cdot \det(\mathbf{B})$
5. **逆矩阵的行列式**：$\det(\mathbf{M}^{-1}) = \dfrac{1}{\det(\mathbf{M})}$
6. **行列式的符号表示方向性**：
   - $\det > 0$：保持方向（右手系 → 右手系）
   - $\det < 0$：翻转方向（右手系 → 左手系）
   - $\det = 0$：降维（压缩到低维空间）

```cpp
// 判断矩阵是否可逆
bool IsMatrixInvertible(const FMatrix& M)
{
    return !FMath::IsNearlyZero(M.Determinant(), 1e-6f);
}

// 检测镜像变换（负缩放导致 det < 0）
bool HasMirroringTransform(const FTransform& Transform)
{
    FVector Scale = Transform.GetScale3D();
    int NegativeScales = 0;
    if (Scale.X < 0) NegativeScales++;
    if (Scale.Y < 0) NegativeScales++;
    if (Scale.Z < 0) NegativeScales++;
    return (NegativeScales % 2) == 1;
}
```

#### 行列式与叉积的关系

3D 叉积可以形式化表示为行列式：

$$
\vec{a} \times \vec{b} = \begin{vmatrix}
\vec{i} & \vec{j} & \vec{k} \\
a_x & a_y & a_z \\
b_x & b_y & b_z
\end{vmatrix}
$$

#### Cramer 法则

对于线性方程组 $\mathbf{A}\vec{x} = \vec{b}$，当 $\det(\mathbf{A}) \neq 0$ 时：

$$
x_i = \frac{\det(\mathbf{A}_i)}{\det(\mathbf{A})}
$$

其中 $\mathbf{A}_i$ 是将 $\mathbf{A}$ 的第 $i$ 列替换为 $\vec{b}$ 后的矩阵。

```cpp
// 使用 Cramer 法则求解 2×2 线性方程组
// ax + by = e
// cx + dy = f
bool Solve2x2(float a, float b, float c, float d,
              float e, float f, float& x, float& y)
{
    float Det = a * d - b * c;
    if (FMath::IsNearlyZero(Det, 1e-6f))
        return false; // 无解或无穷多解
    x = (e * d - b * f) / Det;
    y = (a * f - e * c) / Det;
    return true;
}
```

#### 游戏开发中的实际应用

**判断点在三角形内（2D）**——利用行列式（叉积）的符号一致性：

```cpp
bool IsPointInTriangle2D(FVector2D P, FVector2D A, FVector2D B, FVector2D C)
{
    auto Sign = [](FVector2D P1, FVector2D P2, FVector2D P3) -> float
    {
        return (P1.X - P3.X) * (P2.Y - P3.Y) - (P2.X - P3.X) * (P1.Y - P3.Y);
    };

    float d1 = Sign(P, A, B);
    float d2 = Sign(P, B, C);
    float d3 = Sign(P, C, A);

    bool HasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    bool HasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(HasNeg && HasPos); // 所有符号相同 → 在三角形内
}
```

**计算多边形面积（Shoelace 公式）**——行列式的几何应用：

```cpp
float PolygonArea(const TArray<FVector2D>& Vertices)
{
    float Area = 0.0f;
    int32 n = Vertices.Num();
    for (int32 i = 0; i < n; ++i)
    {
        int32 j = (i + 1) % n;
        Area += Vertices[i].X * Vertices[j].Y;
        Area -= Vertices[i].Y * Vertices[j].X;
    }
    return FMath::Abs(Area) * 0.5f;
}
```

**判断三角形是否退化**——行列式（叉积）为零意味着面积为零：

```cpp
bool IsTriangleDegenerate(FVector A, FVector B, FVector C)
{
    FVector Edge1 = B - A;
    FVector Edge2 = C - A;
    FVector Cross = FVector::CrossProduct(Edge1, Edge2);
    return Cross.SizeSquared() < SMALL_NUMBER;
}
```

| 行列式值 | 几何含义 | 应用 |
|---------|---------|------|
| $\det = 0$ | 矩阵奇异（不可逆） | 检查矩阵可逆性 |
| $\|\det\|$ | 体积/面积缩放因子 | 计算面积、体积 |
| $\det > 0$ | 保持方向 | 判断右手/左手系 |
| $\det < 0$ | 翻转方向 | 检测镜像变换 |
| $\|\det\| = 1$ | 保持体积 | 识别正交变换 |

### 3.6 向量空间与线性相关性

行列式揭示了矩阵与向量组的深层关系——一个矩阵是否可逆取决于其列向量是否线性无关。由此自然进入向量空间理论，它是线性代数的理论框架，帮助我们理解向量和矩阵的本质。

#### 线性组合

向量 $\vec{v}$ 是向量 $\vec{v}_1, \vec{v}_2, \ldots, \vec{v}_n$ 的**线性组合**，如果存在标量 $c_1, c_2, \ldots, c_n$ 使得：

$$
\vec{v} = c_1 \vec{v}_1 + c_2 \vec{v}_2 + \cdots + c_n \vec{v}_n
$$

线性插值（Lerp）就是线性组合的特例，系数和为 1：

```cpp
FVector Lerp(FVector A, FVector B, float Alpha)
{
    return (1.0f - Alpha) * A + Alpha * B;
}
```

#### 线性相关与线性无关

向量组 $\{\vec{v}_1, \vec{v}_2, \ldots, \vec{v}_n\}$ **线性相关**，如果存在不全为零的系数使得：

$$
c_1 \vec{v}_1 + c_2 \vec{v}_2 + \cdots + c_n \vec{v}_n = \vec{0}
$$

否则称为**线性无关**。

**几何理解**：

- 2 个向量线性相关 ⟺ 平行（共线）
- 3 个向量线性相关 ⟺ 共面
- 线性无关 ⟺ 张成不同的方向

```cpp
// 判断两个向量是否线性相关（平行）
bool AreVectorsParallel(FVector V1, FVector V2)
{
    FVector Cross = FVector::CrossProduct(V1, V2);
    return Cross.SizeSquared() < SMALL_NUMBER;
}

// 判断三个向量是否线性相关（共面）
bool AreVectorsCoplanar(FVector V1, FVector V2, FVector V3)
{
    // 混合积（标量三重积）为零 ⟺ 共面
    FVector Cross = FVector::CrossProduct(V2, V3);
    float ScalarTripleProduct = FVector::DotProduct(V1, Cross);
    return FMath::Abs(ScalarTripleProduct) < SMALL_NUMBER;
}
```

#### 基与维度

向量空间的**基**是一组线性无关的向量，能够通过线性组合表示空间中的任意向量。

3D 空间的标准基：

$$
\vec{i} = (1, 0, 0), \quad \vec{j} = (0, 1, 0), \quad \vec{k} = (0, 0, 1)
$$

任意向量可表示为 $\vec{v} = x\vec{i} + y\vec{j} + z\vec{k}$。**维度**即基中向量的个数，3D 空间的维度是 3。

```cpp
const FVector BasisX = FVector(1, 0, 0); // FVector::ForwardVector
const FVector BasisY = FVector(0, 1, 0); // FVector::RightVector
const FVector BasisZ = FVector(0, 0, 1); // FVector::UpVector
```

在自定义基下表示向量，需要构建以基向量为列的矩阵并求逆：

```cpp
struct FCustomBasis
{
    FVector E1, E2, E3;

    // 标准坐标 → 自定义基坐标（需对 [E1 E2 E3] 求逆）
    FVector ToCustom(FVector StandardVec)
    {
        FMatrix M = FMatrix(E1, E2, E3, FVector::ZeroVector);
        return M.Inverse().TransformVector(StandardVec);
    }

    // 自定义基坐标 → 标准坐标（线性组合）
    FVector ToStandard(FVector CustomVec)
    {
        return CustomVec.X * E1 + CustomVec.Y * E2 + CustomVec.Z * E3;
    }
};
```

#### 矩阵的秩

矩阵的**秩**（Rank）是其列向量（或行向量）中线性无关向量的最大个数。

- $\text{rank}(\mathbf{M}) \leq \min(m, n)$（对于 $m \times n$ 矩阵）
- $\text{rank}(\mathbf{M}) = n$ ⟺ 列满秩（列向量线性无关）
- $\text{rank}(\mathbf{M}) < n$ ⟺ 矩阵奇异（不可逆）

**秩-零化度定理**：

$$
\text{rank}(\mathbf{M}) + \text{nullity}(\mathbf{M}) = n
$$

其中零化度（nullity）是零空间（核空间）的维度。秩的几何意义是矩阵变换后空间的维度——秩降低意味着变换将空间压缩到了更低维度。

```cpp
// 对于方阵，满秩 ⟺ 行列式非零
bool IsFullRank(const FMatrix& M)
{
    return !FMath::IsNearlyZero(M.Determinant(), 1e-6f);
}
```

### 3.7 特征值与特征向量

向量空间理论为理解矩阵本质提供了框架。在此基础上，特征值与特征向量揭示了矩阵变换中方向不变的轴——这在物理稳定性分析和主成分分析中至关重要。

#### 定义

对于矩阵 $\mathbf{M}$，如果存在非零向量 $\vec{v}$ 和标量 $\lambda$ 使得：

$$
\mathbf{M}\vec{v} = \lambda\vec{v}
$$

则称 $\lambda$ 为**特征值**（Eigenvalue），$\vec{v}$ 为对应的**特征向量**（Eigenvector）。

**几何意义**：特征向量在矩阵变换下**方向不变**，只是被缩放了 $\lambda$ 倍。

#### 特征值的计算

特征值满足**特征方程**：

$$
\det(\mathbf{M} - \lambda \mathbf{I}) = 0
$$

对于 2×2 矩阵 $\mathbf{M} = \begin{pmatrix} a & b \\ c & d \end{pmatrix}$，特征多项式为：

$$
\lambda^2 - (a+d)\lambda + (ad - bc) = 0
$$

$$
\lambda = \frac{(a+d) \pm \sqrt{(a+d)^2 - 4(ad-bc)}}{2}
$$

```cpp
struct FEigenvalues2D
{
    float Lambda1;
    float Lambda2;
    bool bIsComplex;
};

FEigenvalues2D ComputeEigenvalues2x2(float a, float b, float c, float d)
{
    FEigenvalues2D Result;
    float Trace = a + d;       // 迹 = 特征值之和
    float Det = a * d - b * c; // 行列式 = 特征值之积
    float Discriminant = Trace * Trace - 4.0f * Det;

    if (Discriminant >= 0)
    {
        float SqrtDisc = FMath::Sqrt(Discriminant);
        Result.Lambda1 = (Trace + SqrtDisc) * 0.5f;
        Result.Lambda2 = (Trace - SqrtDisc) * 0.5f;
        Result.bIsComplex = false;
    }
    else
    {
        // 复特征值（旋转矩阵的特征值即为复数）
        Result.Lambda1 = Trace * 0.5f;                    // 实部
        Result.Lambda2 = FMath::Sqrt(-Discriminant) * 0.5f; // 虚部
        Result.bIsComplex = true;
    }
    return Result;
}
```

> 3×3 矩阵的特征值求解涉及三次方程，通常使用数值迭代方法（如幂迭代法、Jacobi 特征值算法）。这属于线性方程组迭代求解的范畴，详见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

#### 特征向量

对于特征值 $\lambda$，特征向量 $\vec{v}$ 满足 $(\mathbf{M} - \lambda\mathbf{I})\vec{v} = \vec{0}$，即特征向量位于 $\mathbf{M} - \lambda\mathbf{I}$ 的零空间中。

#### 重要性质

1. **迹 = 特征值之和**：$\text{tr}(\mathbf{M}) = \lambda_1 + \lambda_2 + \cdots + \lambda_n$
2. **行列式 = 特征值之积**：$\det(\mathbf{M}) = \lambda_1 \cdot \lambda_2 \cdots \lambda_n$
3. **对称矩阵的特征值都是实数**
4. **正定矩阵的所有特征值都大于 0**

#### 旋转矩阵的特征值

3D 旋转矩阵的特征值：

- $\lambda_1 = 1$（对应旋转轴方向的特征向量，即旋转轴本身）
- $\lambda_2, \lambda_3 = e^{\pm i\theta}$（复数，模为 1，$\theta$ 为旋转角度）

#### 稳定性分析

特征值可用于分析物理系统的稳定性。弹簧-阻尼系统的运动方程 $\mathbf{M}\ddot{x} + \mathbf{C}\dot{x} + \mathbf{K}x = 0$ 的特征方程为 $M\lambda^2 + C\lambda + K = 0$：

```cpp
bool IsSpringSystemStable(float Stiffness, float Damping, float Mass)
{
    // 特征方程：M·λ² + C·λ + K = 0
    float a = Mass;
    float b = Damping;
    float c = Stiffness;

    float Discriminant = b * b - 4.0f * a * c;
    float SqrtDisc = FMath::Sqrt(FMath::Max(0.0f, Discriminant));
    float Lambda1 = (-b + SqrtDisc) / (2.0f * a);
    float Lambda2 = (-b - SqrtDisc) / (2.0f * a);

    // 系统稳定 ⟺ 所有特征值实部为负
    return Lambda1 < 0 && Lambda2 < 0;
}
```

> 特征值分析在雅可比矩阵中同样关键——雅可比矩阵的特征值决定了系统的局部行为，详见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;。海森矩阵的特征值判定极值类型，详见&#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299;。

### 3.8 线性方程组求解

特征值分析与线性方程组求解是矩阵计算的两条主线。前文已涉及 Cramer 法则与行列式，此处系统梳理高斯消元、LU 分解与最小二乘法——它们是 IK 求解、约束求解和曲线拟合的数学基础。迭代求解方法（Jacobi、Gauss-Seidel、共轭梯度）的深拆见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

#### 高斯消元法

将增广矩阵化为行阶梯形，然后回代求解。算法分两步：

1. **前向消元**：通过行变换化为上三角矩阵
2. **回代**：从最后一行开始逐步求解

```cpp
bool SolveGaussian(TArray<TArray<float>>& A, TArray<float>& b, TArray<float>& x)
{
    int32 n = A.Num();
    if (n == 0 || A[0].Num() != n || b.Num() != n)
        return false;

    // 构建增广矩阵 [A|b]
    TArray<TArray<float>> Aug;
    Aug.SetNum(n);
    for (int32 i = 0; i < n; ++i)
    {
        Aug[i].SetNum(n + 1);
        for (int32 j = 0; j < n; ++j)
            Aug[i][j] = A[i][j];
        Aug[i][n] = b[i];
    }

    // 前向消元（部分选主元）
    for (int32 k = 0; k < n; ++k)
    {
        // 选择主元（列中绝对值最大的行）
        int32 PivotRow = k;
        float MaxPivot = FMath::Abs(Aug[k][k]);
        for (int32 i = k + 1; i < n; ++i)
        {
            if (FMath::Abs(Aug[i][k]) > MaxPivot)
            {
                MaxPivot = FMath::Abs(Aug[i][k]);
                PivotRow = i;
            }
        }

        if (FMath::IsNearlyZero(MaxPivot, 1e-10f))
            return false; // 矩阵奇异

        if (PivotRow != k)
            Swap(Aug[k], Aug[PivotRow]);

        for (int32 i = k + 1; i < n; ++i)
        {
            float Factor = Aug[i][k] / Aug[k][k];
            for (int32 j = k; j <= n; ++j)
                Aug[i][j] -= Factor * Aug[k][j];
        }
    }

    // 回代
    x.SetNum(n);
    for (int32 i = n - 1; i >= 0; --i)
    {
        float Sum = Aug[i][n];
        for (int32 j = i + 1; j < n; ++j)
            Sum -= Aug[i][j] * x[j];
        x[i] = Sum / Aug[i][i];
    }
    return true;
}
```

#### LU 分解

将矩阵 $\mathbf{A}$ 分解为下三角矩阵 $\mathbf{L}$ 和上三角矩阵 $\mathbf{U}$：

$$
\mathbf{A} = \mathbf{LU}
$$

LU 分解的优势在于分解完成后可重复使用，适合多次求解同一系数矩阵但不同右端项的方程组。求解分两步：

1. 前向替换解 $\mathbf{L}\vec{y} = \vec{b}$
2. 回代解 $\mathbf{U}\vec{x} = \vec{y}$

#### 最小二乘法

当方程组无精确解时（超定系统，方程数多于未知数），求**最小平方误差解**：

$$
\min_{\vec{x}} \|\mathbf{A}\vec{x} - \vec{b}\|^2
$$

**正规方程**：

$$
\mathbf{A}^T \mathbf{A} \vec{x} = \mathbf{A}^T \vec{b}
$$

```cpp
TArray<float> SolveLeastSquares(const TArray<TArray<float>>& A, const TArray<float>& b)
{
    int32 m = A.Num();    // 方程个数
    int32 n = A[0].Num(); // 未知数个数

    // 构建 A^T·A（n×n）
    TArray<TArray<float>> ATA;
    ATA.SetNum(n);
    for (int32 i = 0; i < n; ++i)
    {
        ATA[i].SetNum(n);
        for (int32 j = 0; j < n; ++j)
        {
            float Sum = 0.0f;
            for (int32 k = 0; k < m; ++k)
                Sum += A[k][i] * A[k][j];
            ATA[i][j] = Sum;
        }
    }

    // 构建 A^T·b（n）
    TArray<float> ATb;
    ATb.SetNum(n);
    for (int32 i = 0; i < n; ++i)
    {
        float Sum = 0.0f;
        for (int32 k = 0; k < m; ++k)
            Sum += A[k][i] * b[k];
        ATb[i] = Sum;
    }

    // 求解正规方程
    TArray<float> x;
    SolveGaussian(ATA, ATb, x);
    return x;
}
```

#### 应用：IK 雅可比求解

IK 的核心是将目标位置差转化为关节角度修正，通过求解线性方程组 $\mathbf{J}\Delta\theta = \Delta x$ 实现：

```cpp
void SolveIKJacobian(TArray<float>& JointAngles,
                     FVector TargetPosition,
                     FVector CurrentEndEffectorPos,
                     TArray<TArray<float>>& Jacobian)
{
    FVector DeltaPos = TargetPosition - CurrentEndEffectorPos;
    TArray<float> DeltaX = {DeltaPos.X, DeltaPos.Y, DeltaPos.Z};
    TArray<float> DeltaTheta;

    // 求解 J·Δθ = Δx
    if (SolveGaussian(Jacobian, DeltaX, DeltaTheta))
    {
        for (int32 i = 0; i < JointAngles.Num(); ++i)
            JointAngles[i] += DeltaTheta[i] * 0.1f; // 阻尼系数
    }
}
```

> 雅可比矩阵的构建与 IK 中的具体应用详见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;。对于大规模稀疏系统（如布料、流体约束），迭代方法比直接法更高效，详见&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;。

---

## 四、坐标变换

### 4.1 变换的组合

3D 物体的完整变换通常按 **SRT** 顺序应用：

1. **缩放（Scale）**：改变大小
2. **旋转（Rotation）**：改变朝向
3. **平移（Translation）**：改变位置

矩阵乘法的顺序对应变换的应用顺序：$\mathbf{M}_{\text{total}} = \mathbf{T} \times \mathbf{R} \times \mathbf{S}$，即先缩放、再旋转、最后平移。

### 4.2 FTransform

虚幻引擎使用 `FTransform` 封装完整变换，内部以"旋转（四元数）+ 平移（向量）+ 缩放（向量）"三元组存储，比 4×4 矩阵更紧凑且数值更稳定：

```cpp
FTransform Transform;
Transform.SetLocation(FVector(100, 200, 50));
Transform.SetRotation(FQuat(FRotator(0, 90, 0))); // 旋转 90°
Transform.SetScale3D(FVector(2, 2, 2));           // 放大 2 倍

// 变换点（本地 → 世界）
FVector WorldPoint = Transform.TransformPosition(LocalPoint);

// 反向变换（世界 → 本地）
FVector LocalPoint = Transform.InverseTransformPosition(WorldPoint);
```

### 4.3 坐标空间

#### 常见坐标空间

1. **本地空间（Local Space）**：相对于物体自身的坐标系
2. **世界空间（World Space）**：场景的全局坐标系
3. **视图空间（View Space）**：相对于相机的坐标系
4. **骨骼空间（Bone Space）**：相对于骨骼的坐标系

#### 空间转换

```cpp
// 本地 → 世界
FVector WorldOffset = Actor->GetActorTransform().TransformPosition(LocalOffset);

// 世界 → 本地
FVector TargetLocal = Actor->GetActorTransform().InverseTransformPosition(TargetWorld);
```

### 4.4 旋转表示与万向节死锁

#### 欧拉角

欧拉角用三个角度表示旋转：

- **Pitch**：俯仰角（绕 X 轴）
- **Yaw**：偏航角（绕 Z 轴）
- **Roll**：翻滚角（绕 Y 轴）

```cpp
FRotator Rotation(Pitch, Yaw, Roll);
```

**优点**：直观易懂、容易手动编辑、占用内存小（3 个浮点数）

**缺点**：**万向节死锁**、插值不平滑、旋转顺序依赖

#### 万向节死锁

万向节死锁是欧拉角表示旋转时的**根本性缺陷**：当中间旋转轴（通常 Pitch）达到 ±90° 时，外环和内环的旋转轴会重合对齐，导致失去一个旋转自由度。

**数学原理**：当 $\text{Pitch} = 90°$ 时，旋转矩阵退化为：

$$
\mathbf{R} = \mathbf{R_z}(\psi) \times \mathbf{R_x}(90°) \times \mathbf{R_y}(\phi) \approx \mathbf{R_z}(\psi - \phi)
$$

Yaw 和 Roll 的效果合并，两者控制的是**同一个旋转**。

**实际影响**：

```cpp
// 飞行模拟器：飞机垂直爬升时
FRotator Rotation(90.0f, 0.0f, 0.0f); // Pitch = 90°，死锁！
Rotation.Yaw += 10.0f;   // 尝试左转
Rotation.Roll += 10.0f;  // 尝试右滚
// 两个操作效果叠加，无法独立控制！
```

**避免万向节死锁的方法**：

方法一——限制旋转角度（适用于第一人称相机）：

```cpp
void ClampPitch(FRotator& Rotation)
{
    Rotation.Pitch = FMath::Clamp(Rotation.Pitch, -89.0f, 89.0f);
}
```

方法二——使用四元数（最佳方案）：

```cpp
// 错误：欧拉角插值可能经过死锁点
FRotator BadInterp = FMath::Lerp(Start, End, 0.5f);

// 正确：四元数 Slerp，平滑无死锁
FQuat GoodInterp = FQuat::Slerp(Start.Quaternion(), End.Quaternion(), 0.5f);
FRotator Result = GoodInterp.Rotator();
```

| 场景 | 问题表现 | 解决方案 |
|------|---------|---------|
| 第一人称相机 | 垂直上下看时旋转异常 | 限制 Pitch 到 ±89° |
| 飞行模拟 | 垂直爬升时无法控制方向 | 使用四元数 |
| 骨骼动画 | 关节旋转到极限时抖动 | 使用四元数 + IK 约束 |
| 动画插值 | 旋转路径突然跳变 | Slerp（四元数插值） |
| 物理模拟 | 旋转物体行为异常 | 物理引擎内部使用四元数 |

**核心原则**：显示和编辑用欧拉角（直观），计算和插值用四元数（无死锁）。

---

## 五、四元数

### 5.1 为什么使用四元数

四元数是表示 3D 旋转的最佳方式，优于欧拉角和旋转矩阵：

**优点**：

- 无万向节死锁
- 插值平滑（Slerp）
- 占用内存小（4 个浮点数）
- 旋转组合高效
- 数值稳定

**缺点**：不直观，难以直接编辑

### 5.2 四元数表示

四元数由 4 个分量组成：

$$
\mathbf{q} = (x, y, z, w) = w + xi + yj + zk
$$

其中 $w$ 是标量部分，$(x, y, z)$ 是向量部分，虚数单位满足 $i^2 = j^2 = k^2 = ijk = -1$。

**四元数的模**：

$$
|\mathbf{q}| = \sqrt{w^2 + x^2 + y^2 + z^2}
$$

**单位四元数**（$|\mathbf{q}| = 1$）用于表示旋转。

### 5.3 四元数运算

#### 从轴角创建

给定旋转轴 $\vec{n}$（单位向量）和旋转角度 $\theta$：

$$
\mathbf{q} = \left(n_x \sin\frac{\theta}{2},\; n_y \sin\frac{\theta}{2},\; n_z \sin\frac{\theta}{2},\; \cos\frac{\theta}{2}\right)
$$

```cpp
FQuat Quat = FQuat(FVector::UpVector, FMath::DegreesToRadians(90.0f));
```

#### 从欧拉角创建

```cpp
FRotator Rotator(0, 90, 0);
FQuat Quat = Rotator.Quaternion();
```

#### 四元数乘法（组合旋转）

Hamilton 乘积：

$$
\mathbf{q_1} \otimes \mathbf{q_2} = \begin{pmatrix}
w_1 w_2 - x_1 x_2 - y_1 y_2 - z_1 z_2 \\
w_1 x_2 + x_1 w_2 + y_1 z_2 - z_1 y_2 \\
w_1 y_2 - x_1 z_2 + y_1 w_2 + z_1 x_2 \\
w_1 z_2 + x_1 y_2 - y_1 x_2 + z_1 w_2
\end{pmatrix}
$$

向量形式的简化记法：

$$
\mathbf{q_1} \otimes \mathbf{q_2} = \left(w_1 w_2 - \vec{v_1} \cdot \vec{v_2},\; w_1 \vec{v_2} + w_2 \vec{v_1} + \vec{v_1} \times \vec{v_2}\right)
$$

```cpp
FQuat Combined = Rotation2 * Rotation1; // 先应用 Rotation1，再应用 Rotation2
```

四元数乘法不可交换：$\mathbf{q_1} \otimes \mathbf{q_2} \neq \mathbf{q_2} \otimes \mathbf{q_1}$。

#### 四元数求逆（反向旋转）

**共轭**：$\mathbf{q}^* = (w, -x, -y, -z)$

**逆**：$\mathbf{q}^{-1} = \dfrac{\mathbf{q}^*}{|\mathbf{q}|^2}$，对于单位四元数，$\mathbf{q}^{-1} = \mathbf{q}^*$。

```cpp
FQuat Inverse = Quat.Inverse();
```

### 5.4 四元数插值

#### Slerp（球面线性插值）

Slerp 是最常用的旋转插值方法，在四元数球面上沿大圆弧均匀插值，产生恒定角速度的平滑旋转动画：

$$
\text{Slerp}(\mathbf{q_1}, \mathbf{q_2}, \alpha) = \frac{\sin((1-\alpha)\theta)}{\sin\theta}\mathbf{q_1} + \frac{\sin(\alpha\theta)}{\sin\theta}\mathbf{q_2}
$$

其中 $\theta$ 是两个四元数之间的角度：$\cos\theta = \mathbf{q_1} \cdot \mathbf{q_2}$。

```cpp
FQuat Interpolated = FQuat::Slerp(StartQuat, EndQuat, Alpha);
```

应用：角色转身动画、相机平滑旋转、骨骼动画混合。

#### Nlerp（归一化线性插值）

快速但角速度不恒定的插值，适合对精度要求不高的场景：

```cpp
FQuat Interpolated = FQuat::FastLerp(StartQuat, EndQuat, Alpha);
Interpolated.Normalize(); // 必须归一化
```

### 5.5 旋转向量

使用四元数旋转向量的标准公式：

$$
\vec{v'} = \mathbf{q} \otimes \vec{v} \otimes \mathbf{q}^{-1}
$$

其中 $\vec{v}$ 被视为纯四元数 $(0, v_x, v_y, v_z)$。

**优化公式**（避免完整的四元数乘法，减少运算量）：

$$
\vec{v'} = \vec{v} + 2\vec{q_{xyz}} \times (\vec{q_{xyz}} \times \vec{v} + q_w \vec{v})
$$

```cpp
FQuat Rotation = FQuat(FRotator(0, 90, 0));
FVector Rotated = Rotation.RotateVector(FVector::ForwardVector);
```

### 5.6 实用函数

```cpp
// 获取旋转轴和角度
FVector Axis;
float Angle;
Quat.ToAxisAndAngle(Axis, Angle);

// 转换为欧拉角
FRotator Rotator = Quat.Rotator();

// 归一化
Quat.Normalize();
bool bIsNormalized = Quat.IsNormalized();

// 点积（比较旋转相似度）
float Dot = FQuat::DotProduct(Quat1, Quat2);
```

---

## 六、物理应用

### 6.1 牛顿运动定律

牛顿第二定律：

$$
\vec{F} = m\vec{a}
$$

```cpp
FVector Force(1000, 0, 0);
float Mass = 10.0f;
FVector Acceleration = Force / Mass;

Velocity += Acceleration * DeltaTime;
Location += Velocity * DeltaTime;
```

### 6.2 物理组件

```cpp
UPrimitiveComponent* PhysicsComp = GetMesh();

PhysicsComp->AddForce(FVector(1000, 0, 0));       // 施加力（持续作用）
PhysicsComp->AddImpulse(FVector(500, 0, 1000));   // 施加冲量（立即改变速度）
PhysicsComp->AddTorque(FVector(0, 0, 10000));     // 施加扭矩（旋转力）
```

### 6.3 射线检测与反射

**反射向量公式**：

$$
\vec{R} = \vec{I} - 2(\vec{I} \cdot \vec{N})\vec{N}
$$

其中 $\vec{I}$ 是入射向量，$\vec{N}$ 是表面法线（单位向量）。

```cpp
FVector Start = Actor->GetActorLocation();
FVector Forward = Actor->GetActorForwardVector();
FVector End = Start + Forward * 1000.0f;

FHitResult HitResult;
FCollisionQueryParams Params;

if (GetWorld()->LineTraceSingleByChannel(HitResult, Start, End, ECC_Visibility, Params))
{
    FVector HitNormal = HitResult.Normal;
    // 反射向量（弹射效果）
    FVector Reflected = Forward - 2 * FVector::DotProduct(Forward, HitNormal) * HitNormal;
}
```

### 6.4 弹道计算

抛体运动的运动学方程：

$$
\vec{v}(t) = \vec{v_0} + \vec{a}t
$$

$$
\vec{s}(t) = \vec{s_0} + \vec{v_0}t + \frac{1}{2}\vec{a}t^2
$$

```cpp
FVector Velocity = InitialVelocity;
FVector Gravity(0, 0, -980.0f); // cm/s²

Velocity += Gravity * DeltaTime;
Location += Velocity * DeltaTime;
```

### 6.5 碰撞响应

一维弹性碰撞（动量守恒 + 动能守恒）：

$$
\vec{v_1'} = \frac{(m_1 - m_2)\vec{v_1} + 2m_2 \vec{v_2}}{m_1 + m_2}
$$

$$
\vec{v_2'} = \frac{(m_2 - m_1)\vec{v_2} + 2m_1 \vec{v_1}}{m_1 + m_2}
$$

```cpp
float Mass1 = 10.0f, Mass2 = 5.0f;
FVector V1 = Object1->GetVelocity();
FVector V2 = Object2->GetVelocity();

FVector V1New = ((Mass1 - Mass2) * V1 + 2 * Mass2 * V2) / (Mass1 + Mass2);
FVector V2New = ((Mass2 - Mass1) * V2 + 2 * Mass1 * V1) / (Mass1 + Mass2);
```

> 3D 碰撞冲量法的完整推导见&#12298;[2D 物理引擎详解](/knowledge/2d-physics-engine/)&#12299;，其中包含法向冲量、切向摩擦冲量和 Coulomb 限位的系统讲解。

### 6.6 弹簧系统

胡克定律（弹簧力）与阻尼力：

$$
\vec{F}_{\text{spring}} = -k\vec{x}
$$

$$
\vec{F}_{\text{damping}} = -c\vec{v}
$$

$$
\vec{F}_{\text{total}} = -k\vec{x} - c\vec{v}
$$

其中 $k$ 是弹簧常数，$c$ 是阻尼常数，$\vec{x}$ 是位移，$\vec{v}$ 是速度。

```cpp
FVector Displacement = TargetPos - CurrentPos;
FVector SpringForce = SpringConstant * Displacement;
FVector DampingForce = -DampingConstant * Velocity;
FVector TotalForce = SpringForce + DampingForce;

Velocity += (TotalForce / Mass) * DeltaTime;
```

> 弹簧-阻尼系统的临界阻尼条件 $c = 2\sqrt{km}$ 与数值稳定性分析详见&#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;。

---

## 七、动画应用

### 7.1 骨骼变换层级

骨骼动画基于层级变换链：根骨骼 → 脊柱 → 肩膀 → 上臂 → 前臂 → 手。每个骨骼都有相对于父骨骼的**本地变换**，最终世界变换是所有父骨骼变换的累积。

$$
\mathbf{T}_{\text{world}} = \mathbf{T}_{\text{parent}} \times \mathbf{T}_{\text{local}}
$$

对于完整骨骼链：

$$
\mathbf{T}_{\text{final}} = \mathbf{T}_{\text{root}} \times \mathbf{T}_{\text{bone1}} \times \mathbf{T}_{\text{bone2}} \times \cdots \times \mathbf{T}_{\text{boneN}}
$$

```cpp
// 世界空间变换 = 父变换 × 本地变换
FTransform WorldTransform = ParentTransform * LocalTransform;
```

### 7.2 正向运动学（FK）

从根骨骼向末端依次传递变换：

```cpp
void UpdateBoneChain(TArray<FTransform>& LocalTransforms)
{
    TArray<FTransform> WorldTransforms;
    WorldTransforms.Add(LocalTransforms[0]); // 根骨骼

    for (int32 i = 1; i < LocalTransforms.Num(); ++i)
    {
        // 子骨骼世界变换 = 父世界变换 × 子本地变换
        WorldTransforms.Add(WorldTransforms[i - 1] * LocalTransforms[i]);
    }
}
```

### 7.3 反向运动学（IK）

从目标位置反推骨骼旋转，常用于脚步贴合地面、手部抓取物体、角色看向目标。

**Two-Bone IK**（双骨骼 IK）用于手臂、腿部等由两段骨骼组成的链：

```cpp
// 在动画蓝图中使用 Two Bone IK 节点
// 或在 C++ 中：
FAnimNode_TwoBoneIK TwoBoneIK;
TwoBoneIK.EffectorLocation = TargetLocation;     // 末端位置（手/脚）
TwoBoneIK.JointTargetLocation = HintLocation;     // 关节提示位置（肘/膝盖方向）
```

> IK 求解中雅可比矩阵的构建与线性方程组求解见 3.8 节，深拆见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;。UE FullBody IK 的完整数学见&#12298;[UE FullBody IK 数学详解](/knowledge/ue-fullbody-ik-math/)&#12299;。

### 7.4 动画混合

**线性插值（Lerp）**用于位置和缩放：

$$
\text{Lerp}(\vec{A}, \vec{B}, \alpha) = (1-\alpha)\vec{A} + \alpha\vec{B}
$$

**球面线性插值（Slerp）**用于旋转：

$$
\text{Slerp}(\mathbf{q_1}, \mathbf{q_2}, \alpha) = \frac{\sin((1-\alpha)\theta)}{\sin\theta}\mathbf{q_1} + \frac{\sin(\alpha\theta)}{\sin\theta}\mathbf{q_2}
$$

其中 $\cos\theta = \mathbf{q_1} \cdot \mathbf{q_2}$。

```cpp
float Alpha = 0.7f; // 70% PoseB, 30% PoseA
FTransform Blended;

Blended.SetLocation(
    FMath::Lerp(PoseA.GetLocation(), PoseB.GetLocation(), Alpha));
Blended.SetRotation(
    FQuat::Slerp(PoseA.GetRotation(), PoseB.GetRotation(), Alpha));
Blended.SetScale3D(
    FMath::Lerp(PoseA.GetScale3D(), PoseB.GetScale3D(), Alpha));
```

旋转必须使用 Slerp 而非 Lerp，否则会产生非均匀角速度和数值不稳定。

### 7.5 注视目标（Look At）

让骨骼（如头部、眼睛）朝向目标：

```cpp
FVector BoneLocation = GetBoneLocation(TEXT("Head"));
FVector Direction = (TargetLocation - BoneLocation).GetSafeNormal();

// 创建朝向目标的旋转
FQuat LookAtQuat = Direction.Rotation().Quaternion();

// 平滑过渡（Slerp 朝向目标）
FQuat CurrentQuat = GetBoneRotation(TEXT("Head"));
FQuat NewQuat = FQuat::Slerp(CurrentQuat, LookAtQuat, DeltaTime * InterpSpeed);
```

### 7.6 根运动（Root Motion）

角色移动由动画驱动而非代码控制：

```cpp
// 提取根骨骼位移增量
FTransform RootMotionDelta = AnimInstance->ExtractRootMotion(DeltaTime);

// 应用到角色
FVector Movement = RootMotionDelta.GetLocation();
Character->AddMovementInput(Movement, 1.0f);
```

### 7.7 动画曲线与插值

缓动函数控制动画的加速/减速：

```cpp
// 平滑开始和结束
float EaseInOut = FMath::InterpEaseInOut(0.0f, 1.0f, Alpha, 2.0f);

// 弹性效果
float Spring = FMath::SpringDamper(Current, Target, Velocity, Stiffness, Damping, DeltaTime);
```

> 缓动函数的数学推导（Taylor 级数近似、SmoothStep）见&#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299;。

---

## 八、UE 实战案例

### 8.1 角色移动

```cpp
void AMyCharacter::MoveForward(float Value)
{
    if (Controller && Value != 0.0f)
    {
        FRotator Rotation = Controller->GetControlRotation();
        FRotator YawRotation(0, Rotation.Yaw, 0);

        // 获取控制器朝向的前向向量
        FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
        AddMovementInput(Direction, Value);
    }
}
```

### 8.2 相机平滑跟随

```cpp
void ACameraActor::SmoothFollow(AActor* Target, float DeltaTime)
{
    FVector TargetLocation = Target->GetActorLocation();
    FVector CurrentLocation = GetActorLocation();

    // 向量插值平滑移动
    FVector NewLocation = FMath::VInterpTo(CurrentLocation, TargetLocation, DeltaTime, InterpSpeed);
    SetActorLocation(NewLocation);

    // 四元数插值平滑旋转
    FRotator TargetRotation = (TargetLocation - NewLocation).Rotation();
    FRotator NewRotation = FMath::RInterpTo(GetActorRotation(), TargetRotation, DeltaTime, RotationSpeed);
    SetActorRotation(NewRotation);
}
```

### 8.3 弹道预测

```cpp
TArray<FVector> PredictProjectilePath(FVector StartPos, FVector Velocity, float TimeStep, int32 Steps)
{
    TArray<FVector> Path;
    FVector Gravity(0, 0, -980.0f);

    FVector Pos = StartPos;
    FVector Vel = Velocity;

    for (int32 i = 0; i < Steps; ++i)
    {
        Path.Add(Pos);
        Vel += Gravity * TimeStep;
        Pos += Vel * TimeStep;
    }
    return Path;
}
```

### 8.4 AI 视野检测

结合点积（角度判断）与射线检测（遮挡判断）：

```cpp
bool CanSeeTarget(AActor* Observer, AActor* Target)
{
    FVector ObserverLoc = Observer->GetActorLocation();
    FVector TargetLoc = Target->GetActorLocation();
    FVector ObserverForward = Observer->GetActorForwardVector();

    FVector ToTarget = (TargetLoc - ObserverLoc).GetSafeNormal();
    float Dot = FVector::DotProduct(ObserverForward, ToTarget);

    float FOVAngle = 60.0f;
    float CosineFOV = FMath::Cos(FMath::DegreesToRadians(FOVAngle / 2.0f));

    if (Dot > CosineFOV) // 在视野角度内
    {
        FHitResult Hit;
        FCollisionQueryParams Params;
        Params.AddIgnoredActor(Observer);

        if (GetWorld()->LineTraceSingleByChannel(Hit, ObserverLoc, TargetLoc, ECC_Visibility, Params))
        {
            return Hit.GetActor() == Target; // 确认无遮挡
        }
    }
    return false;
}
```

### 8.5 程序化脚步 IK

```cpp
void ACharacter::UpdateFootIK()
{
    FVector LeftFootLocation = GetMesh()->GetSocketLocation(TEXT("foot_l"));
    FVector TraceStart = LeftFootLocation + FVector(0, 0, 50);
    FVector TraceEnd = LeftFootLocation - FVector(0, 0, 100);

    FHitResult Hit;
    if (GetWorld()->LineTraceSingleByChannel(Hit, TraceStart, TraceEnd, ECC_Visibility))
    {
        // 计算脚部偏移
        float Offset = Hit.Location.Z - LeftFootLocation.Z;

        // 平滑插值
        LeftFootOffset = FMath::FInterpTo(LeftFootOffset, Offset,
                                          GetWorld()->DeltaTimeSeconds, 10.0f);

        // 在动画蓝图中使用此值调整脚部位置
    }
}
```

### 8.6 绳索与布料模拟（Verlet 积分）

Verlet 积分公式：

$$
\vec{x}(t + \Delta t) = 2\vec{x}(t) - \vec{x}(t - \Delta t) + \vec{a}(t)\Delta t^2
$$

其中 $\vec{x}(t) - \vec{x}(t - \Delta t)$ 近似为速度。

```cpp
void UpdateRopeSimulation(TArray<FVector>& Points, TArray<FVector>& OldPoints, float DeltaTime)
{
    FVector Gravity(0, 0, -980.0f);

    // Verlet 积分
    for (int32 i = 1; i < Points.Num() - 1; ++i) // 跳过固定端点
    {
        FVector Velocity = Points[i] - OldPoints[i];
        OldPoints[i] = Points[i];
        Points[i] = Points[i] + Velocity + Gravity * DeltaTime * DeltaTime;
    }

    // 约束求解（保持相邻点间距离）
    for (int32 Iter = 0; Iter < 5; ++Iter)
    {
        for (int32 i = 0; i < Points.Num() - 1; ++i)
        {
            FVector Delta = Points[i + 1] - Points[i];
            float Distance = Delta.Size();
            float Difference = (Distance - RestLength) / Distance;

            Points[i] += Delta * 0.5f * Difference;
            Points[i + 1] -= Delta * 0.5f * Difference;
        }
    }
}
```

> Verlet 积分的数学推导与精度分析见&#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;，位置基约束求解的深拆见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;。

---

## 九、常用 API 速查

### 9.1 FVector

```cpp
FVector V(1, 2, 3);

// 长度
float Length = V.Size();
float SquaredLength = V.SizeSquared();

// 归一化
FVector Normalized = V.GetSafeNormal();
V.Normalize(); // 原地归一化

// 距离
float Distance = FVector::Distance(V1, V2);
float DistSquared = FVector::DistSquared(V1, V2);

// 点积与叉积
float Dot = FVector::DotProduct(V1, V2);
FVector Cross = FVector::CrossProduct(V1, V2);

// 插值
FVector Lerped = FMath::Lerp(V1, V2, Alpha);
FVector Interped = FMath::VInterpTo(Current, Target, DeltaTime, Speed);
```

### 9.2 FQuat

```cpp
// 创建
FQuat Q1 = FQuat(FRotator(Pitch, Yaw, Roll));
FQuat Q2 = FQuat(Axis, AngleRadians);

// 插值
FQuat Slerped = FQuat::Slerp(Q1, Q2, Alpha);
FQuat FastLerped = FQuat::FastLerp(Q1, Q2, Alpha);

// 旋转向量
FVector Rotated = Q.RotateVector(V);

// 组合旋转
FQuat Combined = Q2 * Q1; // 先 Q1 后 Q2

// 求逆
FQuat Inverse = Q.Inverse();
```

### 9.3 FRotator

```cpp
FRotator R(Pitch, Yaw, Roll);

// 转换
FQuat Quat = R.Quaternion();
FVector Forward = R.Vector();

// 归一化（-180 到 180）
FRotator Normalized = R.GetNormalized();

// 插值
FRotator Interped = FMath::RInterpTo(Current, Target, DeltaTime, Speed);
```

---

## 十、可视化调试

线性代数运算的结果往往是抽象的向量或矩阵，可视化调试是将数学与引擎表现对应起来的关键手段：

```cpp
// 绘制线段
DrawDebugLine(GetWorld(), Start, End, FColor::Red, false, 2.0f, 0, 2.0f);

// 绘制方向箭头
DrawDebugDirectionalArrow(GetWorld(), Start, End, 50.0f, FColor::Green, false, 2.0f);

// 绘制坐标系（显示三轴朝向）
DrawDebugCoordinateSystem(GetWorld(), Location, Rotation, 100.0f, false, 2.0f);

// 绘制球体
DrawDebugSphere(GetWorld(), Center, Radius, 12, FColor::Blue, false, 2.0f);

// 屏幕调试信息
if (GEngine)
{
    GEngine->AddOnScreenDebugMessage(-1, 5.0f, FColor::Yellow,
        FString::Printf(TEXT("Dot Product: %f"), DotProduct));
}
```

---

## 十一、延伸阅读

- **3D Math Primer for Graphics and Game Development**（Fletcher Dunn, Ian Parberry）——游戏开发线性代数的经典入门，涵盖向量、矩阵、四元数与几何应用的完整链路。
- **Essential Mathematics for Games and Interactive Applications**（James M. Van Verth, Lars M. Bishop）——游戏数学的全面参考，包含坐标变换、几何检测与动画数学。
- **Visualizing Quaternions**（Andrew J. Hanson）——四元数的可视化与几何直觉，深入理解 Slerp 与万向节死锁的本质。

本站相关文章：

- &#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299;——微积分基础，含缓动函数的 Taylor 级数推导
- &#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;——Verlet 积分与弹簧-阻尼系统
- &#12298;[偏微分方程与数值离散详解](/knowledge/partial-differential-equations/)&#12299;——流体方程的有限差分离散
- &#12298;[高等数学符号速查详解](/knowledge/mathematical-notation-reference/)&#12299;——数学符号与 LaTeX 书写参考
- &#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;——雅可比矩阵在 IK 与物理中的应用
- &#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299;——海森矩阵在优化与极值判定中的应用
- &#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;——Jacobi、Gauss-Seidel、共轭梯度与约束求解
- &#12298;[2D 物理引擎详解](/knowledge/2d-physics-engine/)&#12299;——向量与刚体的完整物理引擎实现
- &#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;——位置基约束求解（绳索/布料的约束方法）
