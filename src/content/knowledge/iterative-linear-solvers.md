---
title: "线性方程组迭代求解的数学原理详解 — 从雅可比、高斯-赛德尔到共轭梯度与约束求解"
excerpt: "像搭积木一样，从最基础的方程、未知数、矩阵开始，一步步搭出雅可比迭代与高斯-赛德尔迭代，再延伸到 SOR、共轭梯度（CG）、预条件共轭梯度（PCG）、GMRES、BiCGSTAB、多重网格，以及收敛性的谱半径判据与条件数收敛率。最后落到物理引擎：PBD 约束求解就是高斯-赛德尔、PGS 用投影处理不等约束、Sequential Impulse 即冲量形式的 PGS、有效质量就是 J·M⁻¹·Jᵀ 的对角、XPBD 用 compliance 把刚度与迭代次数解耦。打通数值线性代数与游戏物理约束求解背后同一套迭代思想。"
date: "2026-06-26"
category: "Mathematics"
subtopic: "LinearAlgebra"
tags: ["数学", "线性代数", "数值计算", "迭代法", "约束求解"]
readTime: "阅读约60分钟"
---

## 一、积木式入门：从方程到迭代

这一章不假设任何线性代数基础。像搭积木一样，从最基础的数学知识开始，一块块往上搭，直到看懂雅可比与高斯-赛德尔迭代为什么有效、为什么物理引擎要用它们。

### 1.1 第一块积木：什么叫方程

小学就见过：

$$
x + 3 = 5
$$

答案 $x = 2$。这里只有一个未知数，这种问题非常简单。

### 1.2 第二块积木：多个未知数

现实世界几乎都是多个未知数。例如：

$$
\begin{cases}
2x + y = 5 \\
x + 3y = 7
\end{cases}
$$

未知数有两个 $x,\,y$，需要同时满足两个方程。这种叫做**线性方程组（Linear System）**。

$n$ 个方程、$n$ 个未知数的一般形式是：

$$
\begin{cases}
a_{11}x_1 + a_{12}x_2 + \cdots + a_{1n}x_n = b_1 \\
a_{21}x_1 + a_{22}x_2 + \cdots + a_{2n}x_n = b_2 \\
\vdots \\
a_{n1}x_1 + a_{n2}x_2 + \cdots + a_{nn}x_n = b_n
\end{cases}
$$

### 1.3 第三块积木：矩阵表示

上面的方程可以写成矩阵形式。以

$$
\begin{cases}
2x + y = 5 \\
x + 3y = 7
\end{cases}
$$

为例，记作：

$$
\underbrace{\begin{bmatrix} 2 & 1 \\ 1 & 3 \end{bmatrix}}_{\mathbf{A}}
\underbrace{\begin{bmatrix} x \\ y \end{bmatrix}}_{\mathbf{x}}
=
\underbrace{\begin{bmatrix} 5 \\ 7 \end{bmatrix}}_{\mathbf{b}}
$$

通常写作 $\mathbf{A}\mathbf{x}=\mathbf{b}$。其中 $\mathbf{A}$ 是**系数矩阵**（已知），$\mathbf{x}$ 是**未知向量**（要求的），$\mathbf{b}$ 是**右端项**（已知）。以后看到 $\mathbf{A}\mathbf{x}=\mathbf{b}$，脑子里就该想到"一堆线性方程"。

### 1.4 第四块积木：为什么不能直接求

理论上，如果矩阵可逆，一步到位：

$$
\mathbf{x} = \mathbf{A}^{-1}\mathbf{b}
$$

问题解决。那为什么还要研究迭代？因为现实里可能有 1000 个、100000 个、10000000 个未知数。物理引擎里每一个刚体的速度、角速度、每一个接触约束都会变成未知数；机器人几十个关节；有限元几百万自由度。直接求逆（高斯消元、LU 分解）的时间复杂度大约是

$$
O(n^3)
$$

非常昂贵：$n=100$ 要 $10^6$ 次运算，$n=1000$ 就要 $10^9$ 次。所以不直接算答案，而是**一点一点逼近答案**。

> 直接法一次性精确求解（高斯消元、LU、Cholesky 分解），固定步骤数但计算量大、内存高；迭代法从猜测开始逐步逼近，每次迭代 $O(n)$，内存低，可以提前停止。

物理模拟偏爱迭代法还有三个理由：不需要精确解（误差 $<0.1\text{ mm}$ 肉眼已看不出）、有实时性预算（60 FPS = 16 ms/帧）、规模巨大直接法算不动。

### 1.5 第五块积木：什么叫迭代

例如猜 $x=0$，发现不对；修正 $x=1$，还不对；继续 $x=1.8$，$x=1.98$，$x=2.0001$……越来越接近。这就是**迭代（Iteration）**——不是一步得到答案，而是不断修正。

### 1.6 第六块积木：把方程改写成更新公式

考虑：

$$
\begin{cases}
4x + y = 9 \\
x + 3y = 8
\end{cases}
$$

分别解出每个未知数：第一行 $x = \dfrac{9 - y}{4}$，第二行 $y = \dfrac{8 - x}{3}$。现在已经变成了**更新公式**——给定一个猜测，就能算出一个更接近的猜测。这就是迭代的入口。

## 二、线性方程组基础：对角占优与矩阵分裂

### 2.1 对角占优矩阵

**对角占优（Diagonally Dominant）**：每一行，对角元素的绝对值大于其他元素绝对值之和：

$$
|a_{ii}| > \sum_{j \neq i} |a_{ij}|, \quad \forall i
$$

例如

$$
\begin{bmatrix} \mathbf{10} & 2 & 1 \\ 1 & \mathbf{8} & 2 \\ 2 & 1 & \mathbf{12} \end{bmatrix}
$$

检查：第 1 行 $|10|>|2|+|1|=3$ ✅；第 2 行 $|8|>|1|+|2|=3$ ✅；第 3 行 $|12|>|2|+|1|=3$ ✅。

**为什么重要？对角占优 → 迭代法收敛！** 物理意义是"每个变量主要由自己决定，受其他变量影响较小"，所以迭代容易收敛。

### 2.2 矩阵三分裂：迭代的代数基础

把系数矩阵拆成三块：

$$
\mathbf{A} = \mathbf{D} + \mathbf{L} + \mathbf{U}
$$

- $\mathbf{D}$ —— **对角矩阵**（只留对角元）
- $\mathbf{L}$ —— **严格下三角**（对角线下方）
- $\mathbf{U}$ —— **严格上三角**（对角线上方）

例如

$$
\mathbf{A}=\begin{bmatrix} 4 & -1 & 0 \\ -1 & 4 & -1 \\ 0 & -1 & 4 \end{bmatrix}
$$

分裂为：

$$
\mathbf{D}=\begin{bmatrix} 4 & 0 & 0 \\ 0 & 4 & 0 \\ 0 & 0 & 4 \end{bmatrix},\quad
\mathbf{L}=\begin{bmatrix} 0 & 0 & 0 \\ -1 & 0 & 0 \\ 0 & -1 & 0 \end{bmatrix},\quad
\mathbf{U}=\begin{bmatrix} 0 & -1 & 0 \\ 0 & 0 & -1 \\ 0 & 0 & 0 \end{bmatrix}
$$

这个三分裂是雅可比、高斯-赛德尔、SOR 共同的代数起点：三种方法只是选择**不同的部分**作为"近似 $\mathbf{A}$"留在方程左边去解。

## 三、雅可比迭代：同步更新

### 3.1 核心思想：人人都用昨天的信息

把第 $i$ 个方程解出 $x_i$：

$$
x_i = \frac{1}{a_{ii}}\left( b_i - \sum_{j\ne i} a_{ij} x_j \right)
$$

雅可比的规定：**更新 $x_i$ 时，右边所有 $x_j$ 全部用上一轮的旧值 $x_j^{(k)}$**。所有人一起算完，再统一替换。

> 比喻：四个人讨论，每个人只能听昨天的信息，今天统一更新，明天再统一更新。所以大家始终慢一步——这就是**同步更新（Synchronous Update）**。

### 3.2 迭代公式与矩阵形式

逐分量形式：

$$
\boxed{\,x_i^{(k+1)} = \frac{1}{a_{ii}}\left( b_i - \sum_{j\ne i} a_{ij} x_j^{(k)} \right)\,}
$$

注意右边全部来自第 $k$ 轮。由 $(\mathbf{D}+\mathbf{L}+\mathbf{U})\mathbf{x}=\mathbf{b}$，把 $\mathbf{D}$ 留在左边，得矩阵形式：

$$
\boxed{\,\mathbf{x}^{(k+1)} = \mathbf{D}^{-1}\big(\mathbf{b} - (\mathbf{L}+\mathbf{U})\mathbf{x}^{(k)}\big)\,}
$$

对角矩阵求逆极其简单（每个对角元取倒数），所以每轮成本很低。

### 3.3 手算例子：逼近 $(2,2)$

求解（精确解 $x=2,\,y=2$，我们假装不知道）：

$$
\begin{cases}
4x + y = 9 \\
x + 3y = 8
\end{cases}
$$

改写：$x = \dfrac{9 - y}{4}$，$y = \dfrac{8 - x}{3}$。初始猜测 $\mathbf{x}^{(0)}=(0,0)$。

**第 1 次迭代**：计算新 $x$ 用旧 $y^{(0)}=0$：$x^{(1)}=\dfrac{9-0}{4}=2.25$；计算新 $y$ 用旧 $x^{(0)}=0$：$y^{(1)}=\dfrac{8-0}{3}=2.667$。

**第 2 次**：$x^{(2)}=\dfrac{9-2.667}{4}=1.583$，$y^{(2)}=\dfrac{8-2.25}{3}=1.917$。继续：

| 迭代 $k$ | $x^{(k)}$ | $y^{(k)}$ | 与真解误差 |
|:---:|:---:|:---:|:---:|
| 0 | 0.000 | 0.000 | 2.828 |
| 1 | 2.250 | 2.667 | 0.722 |
| 2 | 1.583 | 1.917 | 0.422 |
| 3 | 1.771 | 2.139 | 0.260 |
| 4 | 1.965 | 2.076 | 0.083 |
| 5 | 1.981 | 1.988 | 0.025 |
| 10 | 2.000 | 2.000 | 0.001 |

观察：逐渐螺旋逼近真解 $(2,2)$。注意第 1 次时更新 $y$ 用的还是**旧的** $x=0$（不是刚算出的 $2.25$），这正是雅可比"全部用旧值"的特征。

### 3.4 算法流程

```
初始猜测
↓ 所有变量保持旧值
↓ 全部计算新值
↓ 一起替换
↓ 重复
```

### 3.5 代码实现

```cpp
// JacobiSolve.cpp — 雅可比迭代求解 Ax=b
void JacobiIteration(
    const TArray<TArray<float>>& A,
    const TArray<float>& b,
    TArray<float>& x,
    int32 MaxIterations = 100,
    float Tolerance = 1e-6f)
{
    const int32 n = b.Num();
    TArray<float> xNew;                  // 双缓冲：新值向量
    xNew.Init(0.0f, n);

    for (int32 iter = 0; iter < MaxIterations; ++iter)
    {
        // 计算所有新值（可并行：各变量互不依赖）
        ParallelFor(n, [&](int32 i)
        {
            float sum = 0.0f;
            for (int32 j = 0; j < n; ++j)
                if (j != i) sum += A[i][j] * x[j];   // 使用旧值！
            xNew[i] = (b[i] - sum) / A[i][i];
        });

        // 检查收敛
        float maxChange = 0.0f;
        for (int32 i = 0; i < n; ++i)
            maxChange = FMath::Max(maxChange, FMath::Abs(xNew[i] - x[i]));

        x = xNew;                        // 一起替换

        if (maxChange < Tolerance)
        {
            UE_LOG(LogTemp, Log, TEXT("Jacobi converged in %d iterations"), iter + 1);
            return;
        }
    }
    UE_LOG(LogTemp, Warning, TEXT("Jacobi did not converge in %d iterations"), MaxIterations);
}
```

### 3.6 关键特点

- **可完全并行**：每个 $x_i^{(k+1)}$ 只依赖旧值，互不干扰，天然适合 GPU / 多核。
- **需双缓冲**：必须同时保留 $\mathbf{x}^{(k)}$ 和 $\mathbf{x}^{(k+1)}$ 两个向量，内存翻倍。
- **信息传播慢**：所有人都慢一步，收敛较慢。

## 四、高斯-赛德尔迭代：算完立即用

### 4.1 核心思想：谁先算出来，就立刻用

既然 $x$ 已经更新了，为什么更新 $y$ 还要用旧的 $x$？高斯提出：**谁先算出来，就立刻使用**。

> 比喻：四个人排队 A→B→C→D，A 说的新消息马上 B 知道，然后 C 知道，然后 D 知道，而不是等明天。所以信息在新一轮内就向下传播，收敛更快。这是**异步更新**。

### 4.2 迭代公式与矩阵形式

逐分量形式（注意：$j<i$ 的用新值 $x_j^{(k+1)}$，$j>i$ 的用旧值 $x_j^{(k)}$）：

$$
\boxed{\,x_i^{(k+1)} = \frac{1}{a_{ii}}\left( b_i - \sum_{j=1}^{i-1} a_{ij}x_j^{(k+1)} - \sum_{j=i+1}^{n} a_{ij}x_j^{(k)} \right)\,}
$$

把已更新的部分 $(\mathbf{D}+\mathbf{L})$ 留在左边，得矩阵形式：

$$
\boxed{\,\mathbf{x}^{(k+1)} = (\mathbf{D}+\mathbf{L})^{-1}\big(\mathbf{b} - \mathbf{U}\mathbf{x}^{(k)}\big)\,}
$$

### 4.3 手算例子：同样逼近 $(2,2)$，但更快

还是

$$
\begin{cases}
4x + y = 9 \\
x + 3y = 8
\end{cases}
$$

初始 $(0,0)$。第 1 次：先算 $x^{(1)}=\dfrac{9-0}{4}=2.25$，**立即更新**；再算 $y$ 用**新的** $x=2.25$：$y^{(1)}=\dfrac{8-2.25}{3}=1.917$（不是雅可比的 2.667）。

| 迭代 $k$ | 雅可比 $(x,y)$ | GS $(x,y)$ | GS 误差 |
|:---:|:---:|:---:|:---:|
| 0 | (0, 0) | (0, 0) | 2.828 |
| 1 | (2.250, 2.667) | (2.250, 1.917) | 0.264 |
| 2 | (1.583, 1.917) | (1.771, 2.076) | 0.234 |
| 3 | (1.771, 2.139) | (1.981, 2.007) | 0.020 |
| 4 | (1.965, 2.076) | (1.998, 2.001) | 0.002 |
| 5 | (1.981, 1.988) | **(2.000, 2.000)** | 0.000 |

5 次即收敛，比雅可比（10 次）快一倍。

### 4.4 代码实现

```cpp
// GaussSeidelSolve.cpp — 高斯-赛德尔迭代，原地更新
void GaussSeidelIteration(
    const TArray<TArray<float>>& A,
    const TArray<float>& b,
    TArray<float>& x,        // 原地更新！
    int32 MaxIterations = 100,
    float Tolerance = 1e-6f)
{
    const int32 n = b.Num();
    for (int32 iter = 0; iter < MaxIterations; ++iter)
    {
        float maxChange = 0.0f;
        // 顺序更新每个变量
        for (int32 i = 0; i < n; ++i)
        {
            float sum = 0.0f;
            for (int32 j = 0; j < n; ++j)
                if (j != i) sum += A[i][j] * x[j];   // x[j] 可能已是新值

            float xNew = (b[i] - sum) / A[i][i];
            maxChange = FMath::Max(maxChange, FMath::Abs(xNew - x[i]));
            x[i] = xNew;                    // 立即更新！
        }

        if (maxChange < Tolerance)
        {
            UE_LOG(LogTemp, Log, TEXT("Gauss-Seidel converged in %d iterations"), iter + 1);
            return;
        }
    }
}
```

稀疏矩阵版本只存储和遍历非零元素，结构相同，省下大量 $O(n^2)$ 的零元扫描。

### 4.5 为什么物理引擎喜欢高斯-赛德尔

十几个刚体互相接触：如果每次全部一起更新，误差传播很慢；如果一个接触算完立即影响后面的接触，整个系统会更快稳定。所以大多数实时物理引擎（Box2D、Bullet、ODE、PhysX 经典求解器、Chaos 约束求解器的核心思想之一）都采用高斯-赛德尔思想的变种，例如 **Projected Gauss-Seidel (PGS)**、**Sequential Impulse** 等。详见第十一章。

## 五、两种方法的对比

### 5.1 详细对比表

| 特性 | 雅可比迭代 | 高斯-赛德尔迭代 |
|:---|:---|:---|
| **核心思想** | 同时更新所有变量 | 顺序更新，立即使用新值 |
| **使用的值** | 全部用上一轮旧值 | 左边已更新用新值，右边用旧值 |
| **存储需求** | 需要两个向量 | 只需一个向量（原地更新） |
| **并行性** | ✅ 可以完全并行 | ❌ 必须顺序执行 |
| **收敛速度** | 较慢 | 通常快 2 倍 |
| **GPU 适用性** | ✅ 很好 | ❌ 不适合 |
| **单核 CPU** | 中等 | ✅ 更快 |

### 5.2 性能对比

**单核 CPU**（问题规模 1000×1000，精度 $10^{-6}$）：

| 方法 | 迭代次数 | 每次迭代 | 总时间 |
|:---|:---:|:---:|:---:|
| 雅可比 | 800 | 1 ms | 800 ms |
| 高斯-赛德尔 | 450 | 1 ms | **450 ms**（快 1.8×） |

**多核 CPU / GPU**（8 核或 GPU）：

| 方法 | 迭代次数 | 每次迭代 | 总时间 |
|:---|:---:|:---:|:---:|
| 雅可比（并行） | 800 | 0.15 ms（8× 加速） | **120 ms**（最快） |
| 高斯-赛德尔（串行） | 450 | 1 ms（无法并行） | 450 ms |

结论：单核选高斯-赛德尔，并行硬件选雅可比。

### 5.3 何时选择哪个

- **选雅可比**：GPU 计算（流体、布料的 GPU 实现）、大规模粒子系统、SIMD 向量化——充分利用并行性。
- **选高斯-赛德尔**：单核 CPU（移动设备、嵌入式）、内存受限（省一半内存）、实时模拟（更少迭代次数）、PBD 约束求解。

### 5.4 Red-Black Gauss-Seidel：给 GS 找回并行性

把变量像国际象棋棋盘染成红黑两色，使同色节点互不依赖：

```
R B R B R
B R B R B
R B R B R
```

先并行更新所有红节点，再并行更新所有黑节点，红黑交替。这样既有 GS 的快速收敛，又能并行——是 GPU 上求解泊松类问题的常用折中。

```cpp
void RedBlackGaussSeidel(const FMatrix& A, const TArray<float>& b,
                          TArray<float>& x, int32 MaxIterations)
{
    const int32 n = b.Num();
    for (int32 iter = 0; iter < MaxIterations; ++iter)
    {
        // 红色节点（偶数索引，并行）
        ParallelFor((n + 1) / 2, [&](int32 idx) {
            int32 i = 2 * idx;
            if (i >= n) return;
            float sum = 0.0f;
            for (int32 j = 0; j < n; ++j) if (j != i) sum += A[i][j] * x[j];
            x[i] = (b[i] - sum) / A[i][i];
        });
        // 黑色节点（奇数索引，并行）
        ParallelFor(n / 2, [&](int32 idx) {
            int32 i = 2 * idx + 1;
            float sum = 0.0f;
            for (int32 j = 0; j < n; ++j) if (j != i) sum += A[i][j] * x[j];
            x[i] = (b[i] - sum) / A[i][i];
        });
    }
}
```

## 六、收敛性分析

### 6.1 什么是收敛

**收敛**：迭代序列趋向真解 $\displaystyle\lim_{k \to \infty} \mathbf{x}^{(k)} = \mathbf{x}^*$。收敛速度是**线性**的：

$$
\|\mathbf{x}^{(k+1)} - \mathbf{x}^*\| \leq \rho \,\|\mathbf{x}^{(k)} - \mathbf{x}^*\|
$$

其中 $\rho < 1$ 是**收敛率**：$\rho=0.5$ 每次误差减半，$\rho=0.9$ 收敛很慢，$\rho=0.1$ 很快。

### 6.2 矩阵分裂与谱半径判据

任何定常迭代都可写成"分裂" $\mathbf{A}=\mathbf{M}-\mathbf{N}$，其中 $\mathbf{M}$ 是好求逆的近似：

$$
\mathbf{M}\mathbf{x}^{(k+1)} = \mathbf{N}\mathbf{x}^{(k)} + \mathbf{b}
\quad\Longrightarrow\quad
\mathbf{x}^{(k+1)} = \mathbf{B}\mathbf{x}^{(k)} + \mathbf{c}
$$

其中 $\mathbf{B}=\mathbf{M}^{-1}\mathbf{N}$ 称为**迭代矩阵**。三种方法的区别只是选了不同的 $\mathbf{M}$：

| 方法 | 分裂 $\mathbf{M}=$ | 迭代矩阵 $\mathbf{B}=$ |
|:---|:---|:---|
| 雅可比 | $\mathbf{D}$ | $\mathbf{B}_J = -\mathbf{D}^{-1}(\mathbf{L}+\mathbf{U})$ |
| 高斯-赛德尔 | $\mathbf{D}+\mathbf{L}$ | $\mathbf{B}_{GS} = -(\mathbf{D}+\mathbf{L})^{-1}\mathbf{U}$ |

**定理**：定常迭代对**任意**初值收敛 $\iff$ 迭代矩阵的谱半径

$$
\boxed{\,\rho(\mathbf{B}) = \max_i |\lambda_i(\mathbf{B})| < 1\,}
$$

$\rho$ 越小收敛越快，误差以 $\rho$ 为比率线性衰减：$\|\mathbf{x}^{(k)} - \mathbf{x}^*\| \lesssim \rho(\mathbf{B})^k \cdot \|\mathbf{x}^{(0)} - \mathbf{x}^*\|$。

由此立得常用充分条件：

- **严格对角占优** $\Rightarrow$ $\rho(\mathbf{B}_J)<1$ 且 $\rho(\mathbf{B}_{GS})<1$，两者皆收敛。
- **对称正定（SPD）** $\Rightarrow$ 高斯-赛德尔收敛（但雅可比不一定！SPD 不保证雅可比收敛）。
- **不可约弱对角占优** $\Rightarrow$ 两者收敛。

### 6.3 一个关键差异：GS 依赖排序

雅可比的 $\mathbf{B}_J$ 只由 $\mathbf{A}$ 决定，与方程顺序无关；而高斯-赛德尔的 $\mathbf{B}_{GS}$ 依赖于"谁先更新"的**排序**——重排方程顺序会改变 $\mathbf{L},\mathbf{U}$，从而改变 $\rho(\mathbf{B}_{GS})$，收敛速度可能不同。这对约束求解器有现实意义：约束的求解顺序会影响收敛快慢与数值稳定性，所以接触约束常按某种启发式排序。

### 6.4 物理系统为何通常收敛

- **局部相互作用**：弹簧网络每个粒子只与邻居相连，矩阵稀疏、对角占优。
- **能量最小化**：物理系统趋向稳定，矩阵正定，收敛有保证。
- **约束的物理意义**：距离约束里每个粒子主要由自己的质量决定，对角元素大，对角占优。

## 七、SOR：超松弛迭代

### 7.1 核心思想：故意"过冲"

在高斯-赛德尔更新值 $x_i^{GS}$ 的基础上加权外推，用振荡换取速度：

> 比喻：调温度，当前 20°C，目标 25°C。GS 增加 5°C 到 25°C；SOR（$\omega=1.5$）增加 $5\times1.5=7.5$°C 到 27.5°C（过冲），下次迭代会调回来，但整体更快到达平衡。

### 7.2 数学公式

$$
\boxed{\,x_i^{(k+1)} = (1-\omega)\,x_i^{(k)} + \omega\, x_i^{GS}\,}
$$

- $\omega=1$：标准高斯-赛德尔
- $1<\omega<2$：**超松弛**，加速收敛
- $0<\omega<1$：**欠松弛**，增加稳定性（系统接近发散时用它压住）
- $\omega\ge 2$：发散

展开形式：

$$
x_i^{(k+1)} = (1-\omega)x_i^{(k)} + \frac{\omega}{a_{ii}}\left( b_i - \sum_{j=1}^{i-1} a_{ij}x_j^{(k+1)} - \sum_{j=i+1}^{n} a_{ij}x_j^{(k)} \right)
$$

### 7.3 手算对比

同样解 $\begin{cases}4x+y=9\\x+3y=8\end{cases}$，初始 $(0,0)$：

| 迭代 | GS ($\omega=1$) | SOR ($\omega=1.5$) | SOR ($\omega=1.8$) |
|:---:|:---:|:---:|:---:|
| 0 | (0, 0) | (0, 0) | (0, 0) |
| 1 | (2.250, 1.917) | (3.375, 2.125) | (4.050, 2.190) |
| 2 | (1.771, 2.076) | (1.719, 1.958) | (1.335, 1.905) |
| 3 | (1.981, 2.007) | (2.021, 2.010) | (2.120, 2.028) |
| 5 | (2.000, 2.000) | **(2.000, 2.000)** | (2.001, 2.000) |

$\omega=1.5$ 时 4 次即收敛（最快）。

### 7.4 最优松弛因子

对**对称正定矩阵**，最优松弛因子与雅可比迭代矩阵的谱半径相关：

$$
\omega_{\text{opt}} = \frac{2}{1+\sqrt{1-\rho(\mathbf{B}_J)^2}}
$$

此时 $\rho(\mathbf{B}_{SOR})=\omega_{\text{opt}}-1$，**严格小于** $\rho(\mathbf{B}_{GS})$，即 SOR 收敛率严格优于高斯-赛德尔。理论值难算，实践中：

| 应用场景 | 推荐 $\omega$ |
|:---|:---|
| 泊松方程（2D 网格） | 1.7 – 1.9 |
| 泊松方程（3D 网格） | 1.5 – 1.7 |
| 一般问题 | 1.2 – 1.5 |
| 不确定 | 从 1.5 开始试 |

### 7.5 代码实现

```cpp
// SORSolve.cpp — 超松弛迭代
void SOR_Iteration(
    const TArray<TArray<float>>& A,
    const TArray<float>& b,
    TArray<float>& x,
    float Omega = 1.5f,
    int32 MaxIterations = 100,
    float Tolerance = 1e-6f)
{
    const int32 n = b.Num();
    for (int32 iter = 0; iter < MaxIterations; ++iter)
    {
        float maxChange = 0.0f;
        for (int32 i = 0; i < n; ++i)
        {
            float sum = 0.0f;
            for (int32 j = 0; j < n; ++j)
                if (j != i) sum += A[i][j] * x[j];

            float x_GS = (b[i] - sum) / A[i][i];          // 标准 GS 更新
            float x_new = (1.0f - Omega) * x[i] + Omega * x_GS;  // SOR 修正

            maxChange = FMath::Max(maxChange, FMath::Abs(x_new - x[i]));
            x[i] = x_new;
        }
        if (maxChange < Tolerance)
        {
            UE_LOG(LogTemp, Log, TEXT("SOR converged in %d iterations (omega=%.2f)"), iter+1, Omega);
            return;
        }
    }
}
```

### 7.6 收敛性

- 对称正定且 $0<\omega<2$ → SOR 收敛。
- 严格对角占优且 $0<\omega\le 1$ → SOR 收敛。

SOR 继承了 GS 难并行的缺点，但收敛速度通常是 GS 的 $1.5\sim2$ 倍，是单核 CPU 实时模拟的好选择。

## 八、共轭梯度法（CG）

前面雅可比、高斯-赛德尔、SOR 都属于**定常迭代**：每一轮用固定的迭代矩阵 $\mathbf{B}$，只用到上一轮信息，收敛速度被谱半径 $\rho$ 钉死。共轭梯度法（Conjugate Gradient）走另一条路，在子空间里每步寻找**最优**近似，是求解**对称正定线性方程组**的最强迭代法之一。

### 8.1 核心思想：解方程变成求最小值

对对称正定 $\mathbf{A}$，解 $\mathbf{A}\mathbf{x}=\mathbf{b}$ 等价于最小化二次型：

$$
f(\mathbf{x}) = \tfrac{1}{2}\mathbf{x}^{\mathsf T}\mathbf{A}\mathbf{x} - \mathbf{x}^{\mathsf T}\mathbf{b}
$$

因为 $\nabla f = \mathbf{A}\mathbf{x}-\mathbf{b}$，极小点处 $\nabla f=0$ 正好就是 $\mathbf{A}\mathbf{x}=\mathbf{b}$。

> 比喻：在山谷中寻找最低点。梯度下降沿最陡方向走"之字形"，很慢；CG 选择"共轭方向"，走直线，$n$ 维问题理论上 $n$ 步必到达。

### 8.2 共轭方向

两个向量 $\mathbf{p},\mathbf{q}$ **关于矩阵 $\mathbf{A}$ 共轭**：$\mathbf{p}^{\mathsf T}\mathbf{A}\mathbf{q}=0$。神奇性质：沿 $n$ 个互相共轭的方向移动，**最多 $n$ 步**必到最优解。CG 每次迭代只需一次矩阵-向量乘法 $\mathbf{A}\mathbf{p}_k$，不需要存储矩阵的逆，理论收敛次数 $\le n$（实际远少于 $n$）。

### 8.3 迭代公式

$$
\begin{aligned}
\mathbf{r}_k &= \mathbf{b} - \mathbf{A}\mathbf{x}_k && \text{（残差）} \\
\beta_k &= \frac{\mathbf{r}_k^{\mathsf T}\mathbf{r}_k}{\mathbf{r}_{k-1}^{\mathsf T}\mathbf{r}_{k-1}} && \text{（方向修正系数）} \\
\mathbf{p}_k &= \mathbf{r}_k + \beta_k \mathbf{p}_{k-1} && \text{（搜索方向）} \\
\alpha_k &= \frac{\mathbf{r}_k^{\mathsf T}\mathbf{r}_k}{\mathbf{p}_k^{\mathsf T}\mathbf{A}\mathbf{p}_k} && \text{（步长）} \\
\mathbf{x}_{k+1} &= \mathbf{x}_k + \alpha_k \mathbf{p}_k && \text{（更新解）}
\end{aligned}
$$

### 8.4 代码实现

```cpp
// ConjugateGradient.cpp — 共轭梯度法求解对称正定 Ax=b
void ConjugateGradient(
    const TArray<TArray<float>>& A,
    const TArray<float>& b,
    TArray<float>& x,
    int32 MaxIterations = 1000,
    float Tolerance = 1e-6f)
{
    const int32 n = b.Num();

    // 1. 初始残差 r = b - Ax，初始方向 p = r
    TArray<float> r = ComputeResidual(A, b, x);
    TArray<float> p = r;
    float rsold = DotProduct(r, r);

    for (int32 iter = 0; iter < MaxIterations; ++iter)
    {
        // 2. Ap 与步长 α = (rᵀr)/(pᵀAp)
        TArray<float> Ap = MatrixVectorMultiply(A, p);
        float pAp = DotProduct(p, Ap);
        float alpha = rsold / pAp;

        // 3. 更新解 x = x + α·p，残差 r = r - α·Ap
        for (int32 i = 0; i < n; ++i) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; }

        // 4. 收敛判断
        float rsnew = DotProduct(r, r);
        if (FMath::Sqrt(rsnew) < Tolerance)
        {
            UE_LOG(LogTemp, Log, TEXT("CG converged in %d iterations"), iter + 1);
            return;
        }

        // 5. 新方向 β = (rᵀr)_new/(rᵀr)_old，p = r + β·p
        float beta = rsnew / rsold;
        for (int32 i = 0; i < n; ++i) p[i] = r[i] + beta * p[i];
        rsold = rsnew;
    }
    UE_LOG(LogTemp, Warning, TEXT("CG did not converge"));
}
```

### 8.5 收敛性：由条件数决定

$$
\|\mathbf{e}_k\|_{\mathbf{A}} \le 2\left(\frac{\sqrt{\kappa}-1}{\sqrt{\kappa}+1}\right)^{\!k}\|\mathbf{e}_0\|_{\mathbf{A}},\qquad
\kappa=\frac{\lambda_{\max}}{\lambda_{\min}}
$$

$\kappa$ 是**条件数**（最大/最小特征值之比）。

| 条件数 $\kappa$ | 收敛速度 | 例子 |
|:---:|:---|:---|
| $\approx 1$ | 极快（几次迭代） | 良态问题 |
| $< 100$ | 快（10–20 次） | 典型物理问题 |
| $> 1000$ | 慢（100+ 次） | 病态问题 |

$n=10000$ 时理论最多 10000 次迭代，实际通常 100–200 次（快 50–100 倍）。这正是预条件登场的理由。

### 8.6 优缺点

| 特性 | 评价 |
|:---|:---|
| 收敛速度 | ✅ 非常快（远少于 $n$ 次） |
| 精度 | ✅ 高精度 |
| 内存 | ✅ 只需几个向量 |
| 稀疏矩阵 | ✅ 非常适合 |
| 并行性 | ⚠️ 有限（矩阵乘法可并行） |
| 限制 | ❌ 只适用于对称正定矩阵 |

## 九、预条件共轭梯度法（PCG）

### 9.1 为什么需要预条件

CG 的收敛速度依赖条件数 $\kappa$：$\kappa$ 小收敛快，$\kappa$ 大收敛慢。预条件的思想是**改造方程组，降低条件数**：

$$
\mathbf{M}^{-1}\mathbf{A}\mathbf{x} = \mathbf{M}^{-1}\mathbf{b}
$$

选好求逆且使 $\mathbf{M}^{-1}\mathbf{A}$ 条件数更小的 $\mathbf{M}$。

> 比喻：无预条件时山谷很狭长（高条件数），要走很多之字形；预条件先"改造地形"让山谷变圆（低条件数），可以直线下山。

### 9.2 常见预条件矩阵

**Jacobi 预条件**（对角预条件）：$\mathbf{M}=\text{diag}(\mathbf{A})$。求逆 $\mathbf{M}^{-1}=\text{diag}(1/a_{11},1/a_{22},\ldots)$ 极其简单、并行友好，但效果一般。

**不完全 Cholesky (IC)**：对 $\mathbf{A}$ 做不完全 Cholesky 分解 $\mathbf{A}\approx\mathbf{L}\mathbf{L}^{\mathsf T}$，$\mathbf{M}=\mathbf{L}\mathbf{L}^{\mathsf T}$。效果好、适合稀疏 SPD，但预处理成本高、实现复杂。

**SSOR 预条件**：

$$
\mathbf{M} = \frac{1}{\omega(2-\omega)}(\mathbf{D} - \omega\mathbf{L})\mathbf{D}^{-1}(\mathbf{D} - \omega\mathbf{U})
$$

比 Jacobi 好、较易实现。

### 9.3 PCG 算法与代码

PCG 与 CG 的关键差异：用预条件后的残差 $\mathbf{z}=\mathbf{M}^{-1}\mathbf{r}$ 代替 $\mathbf{r}$。

```cpp
// PCG_Jacobi.cpp — 雅可比预条件的共轭梯度
void PCG_Jacobi(
    const TArray<TArray<float>>& A,
    const TArray<float>& b,
    TArray<float>& x,
    int32 MaxIterations = 1000,
    float Tolerance = 1e-6f)
{
    const int32 n = b.Num();

    // 1. Jacobi 预条件 = 对角元素的逆
    TArray<float> M_inv;
    M_inv.Init(0.0f, n);
    for (int32 i = 0; i < n; ++i) M_inv[i] = 1.0f / A[i][i];

    // 2. 初始残差 r = b - Ax，预条件 z = M⁻¹r，方向 p = z
    TArray<float> r = ComputeResidual(A, b, x);
    TArray<float> z; z.Init(0.0f, n);
    for (int32 i = 0; i < n; ++i) z[i] = M_inv[i] * r[i];
    TArray<float> p = z;

    float rzold = DotProduct(r, z);   // 注意是 rᵀz 不是 rᵀr

    for (int32 iter = 0; iter < MaxIterations; ++iter)
    {
        TArray<float> Ap = MatrixVectorMultiply(A, p);
        float alpha = rzold / DotProduct(p, Ap);

        for (int32 i = 0; i < n; ++i) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; }

        if (VectorNorm(r) < Tolerance)
        {
            UE_LOG(LogTemp, Log, TEXT("PCG converged in %d iterations"), iter + 1);
            return;
        }

        // 应用预条件 z = M⁻¹r
        for (int32 i = 0; i < n; ++i) z[i] = M_inv[i] * r[i];

        float rznew = DotProduct(r, z);
        float beta = rznew / rzold;
        for (int32 i = 0; i < n; ++i) p[i] = z[i] + beta * p[i];
        rzold = rznew;
    }
}
```

### 9.4 性能对比

| 方法 | 迭代次数 | 相对时间 |
|:---|:---:|:---:|
| 雅可比 | 500 | 5.0× |
| 高斯-赛德尔 | 250 | 2.5× |
| CG | 100 | 1.0× |
| PCG (Jacobi) | 50 | **0.5×** ✅ |
| PCG (IC) | 20 | **0.3×** ✅✅ |

PCG 是求解大规模对称正定系统的**首选**——比 CG 快 $2\sim10$ 倍，比高斯-赛德尔快一个数量级以上。

## 十、非对称与广义方法

CG 只能解对称正定系统，但物理中常出现非对称矩阵（带摩擦的隐式积分、对流-扩散）或特殊结构（泊松方程）。

### 10.1 GMRES

**GMRES（Generalized Minimal Residual）**适用于**任意非奇异矩阵**，在 Krylov 子空间

$$
\mathcal{K}_k = \mathrm{span}\{\mathbf{r}_0,\,\mathbf{A}\mathbf{r}_0,\,\mathbf{A}^2\mathbf{r}_0,\,\ldots,\,\mathbf{A}^{k-1}\mathbf{r}_0\}
$$

中找 $\mathbf{x}_k$ 使残差 $\|\mathbf{b}-\mathbf{A}\mathbf{x}_k\|$ 最小。通过 Arnoldi 过程构造正交基，再解一个小型最小二乘问题。为控制内存，常每 $m$ 步重启一次（GMRES($m$)）。

| 特性 | CG | GMRES |
|:---|:---|:---|
| 适用矩阵 | 对称正定 | **任意非奇异** ✅ |
| 内存需求 | $O(n)$ | $O(mn)$ |
| 收敛速度 | 快 | 中等 |
| 并行性 | 中等 | 差（正交化串行） |

### 10.2 BiCGSTAB

**BiCGSTAB（Biconjugate Gradient Stabilized）**是求解**非对称线性方程组**的内存友好替代，比 GMRES 更省内存。

```
1. r₀ = b - Ax₀，r̃₀ = r₀（任意影子残差）
2. ρ₀ = α = ω₀ = 1，v₀ = p₀ = 0
3. for i = 1, 2, ...:
4.   ρᵢ = (r̃₀, rᵢ₋₁)
5.   β = (ρᵢ/ρᵢ₋₁)(α/ωᵢ₋₁)
6.   pᵢ = rᵢ₋₁ + β(pᵢ₋₁ - ωᵢ₋₁vᵢ₋₁)
7.   vᵢ = Apᵢ，α = ρᵢ/(r̃₀, vᵢ)
8.   s = rᵢ₋₁ - αvᵢ（若 ‖s‖<ε 即收敛）
9.   t = As，ωᵢ = (t,s)/(t,t)
10.  xᵢ = xᵢ₋₁ + αpᵢ + ωᵢs，rᵢ = s - ωᵢt
```

| 方法 | 内存 | 收敛 | 稳定性 |
|:---|:---:|:---:|:---:|
| BiCG | 7 向量 | 快 | ❌ 差 |
| **BiCGSTAB** | **8 向量** | **快** | **✅ 好** |
| GMRES(30) | 31 向量 | 中等 | ✅ 很好 |

非对称问题首选 BiCGSTAB。

### 10.3 Chebyshev 迭代

利用 Chebyshev 多项式在特征值区间 $[\lambda_{\min},\lambda_{\max}]$ 上最优减小误差。**不需要内积计算**（适合 GPU）、易于并行、收敛速度接近 CG，但需要知道特征值范围，不如 CG 通用。

### 10.4 多重网格法（Multigrid）

**多重网格法**是求解大规模椭圆型偏微分方程（如泊松方程）的终极武器。

迭代法有个特性：消除**高频误差**（细节）很快，但消除**低频误差**（整体趋势）很慢。多重网格的策略是在**不同分辨率**的网格上迭代：

```
细网格（高分辨率）：消除高频误差，保留低频误差
    ↓ 限制（下采样）
粗网格（低分辨率）：低频误差变成"高频"，快速消除
    ↓ 插值（上采样）回细网格
    修正解
```

**V-Cycle**：细→光滑→限制→粗→光滑→…→直接求解→插值→粗→光滑→细→光滑。

**复杂度 $O(n)$（线性！）**，是所有迭代法里最快的：

| 问题规模 | 其他方法 | 多重网格 | 加速比 |
|:---:|:---:|:---:|:---:|
| 1,000 | 0.1s | 0.01s | 10× |
| 10,000 | 10s | 0.1s | 100× |
| 100,000 | 1000s | 1s | **1000×** |

适合泊松方程（流体压力）、大规模网格问题，但实现复杂、需要网格层次结构、调参困难。

## 十一、物理模拟中的应用

### 11.1 隐式积分

隐式欧拉积分 $\mathbf{v}^{n+1}=\mathbf{v}^n+\Delta t\,\mathbf{a}(\mathbf{v}^{n+1})$ 是一个**隐式方程**。对弹簧力 $\mathbf{F}=-k\mathbf{x}-c\mathbf{v}$，线性化后得到对称正定线性方程组 $(\mathbf{M}-\Delta t^2\mathbf{K})\Delta\mathbf{v}=\Delta t(\mathbf{f}+\Delta t\mathbf{K}\mathbf{v})$，用 PCG 求解。刚性弹簧 $k$ 很大时必须用隐式积分（稳定），直接法太慢，迭代法正好。

### 11.2 PBD / XPBD 约束求解就是高斯-赛德尔

PBD 的约束求解循环：

```cpp
// PBDSolver.cpp — 约束求解 = 高斯-赛德尔迭代
for (int32 iter = 0; iter < NumIterations; ++iter)
{
    for (FConstraint& C : Constraints)
        C.Solve();   // 解完立即更新位置，影响后续约束
}
```

**这就是高斯-赛德尔**——逐个约束求解，立即把修正写回位置，下一个约束直接用最新位置。雅可比风格的 PBD（并行版）则把所有修正先累积、最后平均应用一次，正是雅可比的"同步更新"思想，适合 GPU 但收敛更慢。

约束 $C(\mathbf{x})=0$ 线性化后，要解的线性系统是（$\mathbf{J}$ 是约束雅可比，$\mathbf{M}$ 是质量矩阵）：

$$
\underbrace{\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}}_{\mathbf{W}\text{（有效质量矩阵）}}\boldsymbol{\lambda} = -\mathbf{C}
$$

位置修正 $\Delta\mathbf{x} = \mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}$。距离约束的有效质量是其对角元 $W = w_a + w_b = \dfrac{1}{m_a}+\dfrac{1}{m_b}$：

```cpp
// DistanceConstraint.cpp — 单约束求解 = 解一个标量方程
FVector Dir = B->P - A->P;
float  Len = Dir.Size();
FVector Grad = Dir / Len;             // 约束梯度 = 雅可比 J 的一行
float  C = Len - RestLength;
float  W = InvMassA + InvMassB;        // 有效质量 = J M⁻¹ Jᵀ 的对角元
float  Lambda = -C / W;               // λ = -C / W
FVector Dp = Lambda * Grad;
A->P -= Dp * InvMassA;                // 立即更新位置（高斯-赛德尔）
B->P += Dp * InvMassB;
```

PBD 逐约束解 $\lambda$，本质就是对这个 $\mathbf{W}\boldsymbol{\lambda}=-\mathbf{C}$ 系统做高斯-赛德尔（或雅可比）迭代。$\mathbf{W}$ 对角占优（质量为对角、约束局部弱耦合），收敛有保证——这正是第六章谱半径判据的物理印证。

### 11.3 PGS：用投影处理不等约束

真实接触不是等式 $C=0$，而是**不等式**：法向不穿透 $\lambda_n\ge 0$（只拉不推）、摩擦受锥约束 $|\boldsymbol{\lambda}_t|\le\mu\lambda_n$。**Projected Gauss-Seidel（PGS）**在高斯-赛德尔每步之后加一道**投影**，把 $\boldsymbol{\lambda}$ 钳到可行域内：

- 接触冲量 $\lambda_n \leftarrow \max(\lambda_n,\,0)$
- 摩擦冲量 $\boldsymbol{\lambda}_t \leftarrow \mathrm{clamp}$ 到摩擦锥 $\|\boldsymbol{\lambda}_t\|\le\mu\lambda_n$

"Projected"的意义就在于此——它把求解等式约束的高斯-赛德尔推广到不等式约束（LCP/MCP 问题）。Box2D、Bullet、ODE、PhysX 经典求解器、Chaos 约束求解器的核心思想都是 PGS 或其变种。

### 11.4 Sequential Impulse：冲量形式的 PGS

Erin Catto 提出的 **Sequential Impulse**（Box2D 的核心）在数学上就是 PGS，只是把"位置修正"换成"速度冲量"：每次只处理一个约束，立即更新刚体速度，下一个约束用最新速度。多次循环后所有约束逐渐同时满足。**Sequential Impulse ≡ 约束冲量求解上的高斯-赛德尔/PGS**。

### 11.5 XPBD：用 compliance 把刚度与迭代次数解耦

PBD 有一个根本局限：**刚度由迭代次数和 $\Delta t$ 决定，且永远非完全刚性**——迭代越多越硬，但再多次也到不了"绝对刚体"，且手感随帧率变化。

**XPBD** 引入**柔度**（compliance）参数 $\tilde{\alpha}$，把约束从"靠迭代逼近"改成"显式刚度"：

$$
\boldsymbol{\lambda} = \frac{-\mathbf{C}}{\mathbf{W} + \tilde{\alpha}},\qquad
\tilde{\alpha} = \frac{\alpha}{\Delta t^2}
$$

$\alpha=0$ 即完全刚性（理想约束），$\alpha>0$ 表示软约束。这样**刚度直接由 $\alpha$ 控制，与迭代次数解耦**——即便只迭代一两次，也能得到正确的刚度。迭代法的角色从"决定有多硬"退化为"决定收敛多快"，刚度本身交给 $\alpha$。

### 11.6 流体压力求解与布料

- **流体压力**：不可压缩条件 $\nabla^2 p = \dfrac{\rho}{\Delta t}\nabla\!\cdot\!\mathbf{v}$ 离散化为泊松方程（SPD、大规模）。最佳选择是**多重网格**，次选 PCG。$100\times100\times100=10^6$ 个网格，直接法内存爆炸，迭代法轻松搞定。
- **布料**：$50\times50$ 布料 = 2500 个粒子、~10000 个弹簧约束，用高斯-赛德尔迭代求解约束即可。

## 十二、常见问题与调试

### 12.1 不收敛（迭代发散）

症状：误差不减反增，出现 NaN/Inf。

- **矩阵非对角占优** → 检查并改用更稳定的格式或减小时间步。
- **初值太差** → 用上一帧的结果作为初值（warm start）。
- **时间步长太大** → 减小 $\Delta t$ 或子步进。

### 12.2 收敛太慢

症状：1000+ 次迭代仍不达标，达不到实时。

- 用 **SOR 加速**（$\omega=1.5$）。
- 用**预条件**（PCG）。
- 更好的初值（外推法 $x_{\text{init}}=2x_{\text{prev}}-x_{\text{prev2}}$）。

### 12.3 数值不稳定

症状：正常几步后突然爆炸、抖动。

- **添加阻尼**：欠松弛（$\omega<1$），$x_{\text{new}}=0.8x_{GS}+0.2x_{\text{old}}$。
- **限制修正量**：`correction = Clamp(correction, -Max, Max)`。
- **使用双精度**：`float` → `double`。

### 12.4 性能问题

- 减少迭代次数（游戏里 5–10 次通常够用）。
- 用稀疏矩阵（只存非零元）。
- 并行化（用雅可比）。
- 降低精度要求（$10^{-6}\to10^{-3}$）。

### 12.5 收敛诊断

```cpp
void DiagnoseConvergence(const FSparseMatrix& A)
{
    UE_LOG(LogTemp, Log, TEXT("Diagonal Dominant: %s"),
           CheckDiagonalDominance(A) ? TEXT("Yes") : TEXT("No"));
    float cond = EstimateConditionNumber(A);
    UE_LOG(LogTemp, Log, TEXT("Condition Number: %.2e"), cond);
    if (cond > 1000.0f)
        UE_LOG(LogTemp, Warning, TEXT("High condition number! Consider preconditioning"));
    UE_LOG(LogTemp, Log, TEXT("Symmetric: %s"),
           CheckSymmetry(A) ? TEXT("Yes") : TEXT("No"));
}
```

## 十三、迭代法总览与选择指南

### 13.1 完整对比表

| 方法 | 适用矩阵 | 内存 | 收敛速度 | 并行性 | 实现难度 |
|:---|:---|:---:|:---|:---:|:---:|
| **雅可比** | 任意 | 低 | 慢 | ✅ 完美 | 简单 |
| **高斯-赛德尔** | 任意 | 低 | 中等 | ❌ 差 | 简单 |
| **SOR** | 任意 | 低 | 较快 | ❌ 差 | 简单 |
| **CG** | 对称正定 | 低 | 快 | ⚠️ 中等 | 中等 |
| **PCG** | 对称正定 | 中 | 很快 | ⚠️ 中等 | 中高 |
| **GMRES** | 任意 | 高 | 快 | ❌ 差 | 高 |
| **BiCGSTAB** | 非对称 | 低 | 很快 | ⚠️ 中等 | 中高 |
| **Chebyshev** | 对称 | 低 | 快 | ✅ 完美 | 中等 |
| **多重网格** | 特殊 | 中 | **极快** | ⚠️ 复杂 | 很高 |

### 13.2 决策树

```
1. 矩阵是对称正定的吗？
   ├─ 是 → 2
   └─ 否 → 5
2. 问题规模？
   ├─ 小（< 1000）→ CG
   ├─ 中（1000–10000）→ PCG
   └─ 大（> 10000）→ PCG + 好的预条件
3. 条件数大吗？
   ├─ 小（< 100）→ CG 即可
   └─ 大（> 100）→ 必须用 PCG
4. GPU 还是 CPU？
   ├─ GPU → CG 或 Chebyshev
   └─ CPU → PCG
5. 非对称矩阵，问题规模？
   ├─ 小/中（< 10000）→ BiCGSTAB
   └─ 大（> 10000）→ GMRES 或 BiCGSTAB + 预条件
6. 是泊松方程吗？
   └─ 是 → 多重网格（最快！）
```

### 13.3 物理模拟场景推荐

| 场景 | 矩阵性质 | 推荐 |
|:---|:---|:---|
| PBD 约束求解 | $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$，对角占优 | 高斯-赛德尔（CPU）/ 雅可比（GPU） |
| 刚体接触 | 不等约束（LCP） | **PGS** / Sequential Impulse |
| 软体隐式积分 | SPD、病态 | PCG（IC 预条件） |
| 流体压力泊松 | SPD、大规模 | **多重网格** / PCG |
| 对流-扩散 | 非对称 | BiCGSTAB / GMRES |

### 13.4 黄金法则

1. 对称正定 $\to$ PCG（首选）
2. 非对称 $\to$ BiCGSTAB
3. 泊松方程 $\to$ 多重网格
4. GPU / 并行 $\to$ 雅可比 或 CG/Chebyshev
5. 实时约束 $\to$ 高斯-赛德尔 / PGS（简单且够快）
6. 不确定 $\to$ 先试 PCG

---

## 结语

雅可比与高斯-赛德尔的差别，归根结底是一句话：**更新一个变量时，要不要用这一轮已经算出的新值**。这个看似微小的选择，派生出"可并行 vs 收敛快"的根本权衡，并贯穿了从 GPU 粒子（雅可比）到 CPU 约束求解（高斯-赛德尔）的全部工程取舍。

向上一步，SOR 用松弛因子加速、多重网格用尺度跳跃消除低频误差；再进一步，CG/PCG 跳出"固定分裂"框架，在 Krylov 子空间里做最优搜索，把收敛率从谱半径推进到条件数。而所有这些，最终都在物理引擎的约束求解器里会师：$\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}=-\mathbf{C}$ 这一个系统，高斯-赛德尔解它（PBD）、投影后解它（PGS）、用冲量解它（Sequential Impulse）、用 compliance 修正它（XPBD）。

理解了谱半径与条件数，就理解了它们为什么收敛、为什么快或慢；理解了 PGS 的投影与 XPBD 的柔度，就理解了它们为什么能处理接触与控制刚度。下次在代码里看到 `NumIterations`、`SolverIterationCount`、`PGS`、`SequentialImpulse`、`effectiveMass`、`compliance`、`PCG`、`Multigrid`，它们背后都是同一件事：在 $\mathbf{A}\mathbf{x}=\mathbf{b}$ 上反复修正、逼近真解。

想继续追溯约束雅可比 $\mathbf{J}$ 与有效质量 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ 的来源，见《雅可比矩阵的数学原理详解》；想看 XPBD 的 predict-correct 流程如何与数值积分串联，见《物理模拟数值积分方法的数学与物理原理详解》。
