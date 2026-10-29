---
title: 线性系统的迭代求解
excerpt: 从残差与收敛条件理解 Jacobi、Gauss–Seidel、CG 和预条件，再连接物理约束。
date: '2026-06-26'
category: Mathematics
subtopic: LinearAlgebra
tags:
  - 数学
  - 线性代数
  - 数值计算
  - 迭代法
  - 约束求解
readTime: 阅读约15分钟
kind: algorithm
level: intermediate
pageType: guide
aliases:
  - 线性方程组迭代求解详解 — 从雅可比、高斯-赛德尔到共轭梯度与约束求解
prerequisites:
  - ue-linear-algebra-guide
  - jacobian-matrix
nextArticles:
  - pbd-xpbd-math
  - ue-chaos-physics-engine
related: []
topics:
  - id: ue-chaos-physics
    stage: foundation
    role: theory
    order: 60
sources:
  - title: Netlib — Templates for the Solution of Linear Systems
    url: 'https://netlib.org/templates/templates.html'
---
迭代求解从初值出发，逐步降低方程残差。方法是否有效取决于矩阵、更新顺序、预条件与停止判据，不能只比较迭代次数。本文负责线性系统的完整求解主线；非线性 Newton 外迭代见[Hessian](/knowledge/hessian-matrix/)，接触投影和状态更新见[物理约束](/knowledge/physics_constraints_deep_dive/)。

## 问题、符号与比较基准

设 $A\in\mathbb R^{n\times n}$、$b\in\mathbb R^n$ 已知，要求 $Ax=b$。$x^{(k)}$ 表示第 $k$ 个迭代值，$x^*$ 表示精确解。全文使用

$$
r^{(k)}=b-Ax^{(k)},\qquad e^{(k)}=x^*-x^{(k)},\qquad Ae^{(k)}=r^{(k)}.
$$

残差可以直接计算，解误差通常不能。小残差也不必然意味着小的相对解误差：病态矩阵可能把残差放大为明显的解误差。矩阵条件数描述这种敏感性；修改初值不会改变矩阵条件数。

直接法通常做分解后回代，不应显式求逆。稠密分解常需 $O(n^3)$ 运算，稀疏分解的代价取决于填充和排序。迭代法的一次矩阵向量乘法需 $O(\operatorname{nnz}(A))$，稠密时仍是 $O(n^2)$；不能普遍写成每轮 $O(n)$。

全文采用同一个可手算系统：

$$
A=\begin{bmatrix}4&1\\1&3\end{bmatrix},\quad
b=\begin{bmatrix}9\\8\end{bmatrix},\quad
x^{(0)}=\begin{bmatrix}0\\0\end{bmatrix},\quad
x^*=\begin{bmatrix}19/11\\23/11\end{bmatrix}.
$$

将解代回，两行分别得到 $9$ 和 $8$。$(2,2)$ 不满足第一行，因此不能作为本例真解。

## 固定迭代与收敛条件

统一采用 $A=D+L+U$：$D$ 为对角部分，$L,U$ 为带原始符号的严格下、上三角部分。一般分裂 $A=M-N$ 给出

$$
x^{(k+1)}=M^{-1}(Nx^{(k)}+b),\quad
B=M^{-1}N,\quad e^{(k+1)}=Be^{(k)}.
$$

对任意初值收敛的充要条件是谱半径 $\rho(B)<1$。这里的逆表示应用求解操作，通常不显式构造逆矩阵。

严格行对角占优是 Jacobi 和 GS 收敛的一个充分条件。实对称正定（SPD）保证 GS 收敛，却不保证无阻尼 Jacobi 收敛。例如三阶矩阵对角元为 $1$、非对角元为 $0.9$ 时为 SPD，但 Jacobi 迭代矩阵有特征值 $-1.8$。物理系统稀疏，也不自动具有对角占优或 SPD 性质。

## Jacobi：读取同一份旧状态

### 更新公式与执行顺序

Jacobi 把每一行中的其他未知量冻结在上一轮：

$$
x_i^{(k+1)}=\frac{b_i-\sum_{j\ne i}a_{ij}x_j^{(k)}}{a_{ii}},\qquad
B_J=-D^{-1}(L+U).
$$

一次完整 sweep 需要先保存旧向量，再计算全部新分量。各行之间没有本轮读后写依赖，可以并行；所有新值算完后才交换缓冲。要求所用对角元非零，不能用任意 epsilon 替换零对角并声称仍在求解原系统。

本例第一轮得到 $(2.25,2.666667)$；第二轮得到 $(1.583333,1.916667)$。两次更新中的 $y$ 都读取对应轮开始时的 $x$。

### 加权 Jacobi 与适用范围

对原始 Jacobi 结果 $\hat x$ 做松弛：

$$
x^{(k+1)}=x^{(k)}+\omega D^{-1}r^{(k)}.
$$

在 SPD 情况下，若 $0<\omega<2/\lambda_{\max}(D^{-1}A)$，该迭代收敛。$\omega$ 需要匹配谱范围，不能把 $2/3$ 当作任意问题的最优参数。

Jacobi 常用于规则网格的平滑器、对角预条件或并行基线。它的优势是排程简单；耦合很强时，跨局部区域的信息传播可能需要较多轮。

## Gauss–Seidel：顺序使用最新分量

### 更新公式与同例比较

按 $i=1,\ldots,n$ 原地更新：

$$
x_i^{(k+1)}=\frac{b_i-\sum_{j<i}a_{ij}x_j^{(k+1)}-\sum_{j>i}a_{ij}x_j^{(k)}}{a_{ii}},\quad
B_{GS}=-(D+L)^{-1}U.
$$

第一轮先得到 $x=2.25$，再以它求出 $y=1.916667$；第二轮得到 $(1.770833,2.076389)$。GS 在这份矩阵上比 Jacobi 更快传递信息，但迭代次数和耗时的优势没有通用固定倍数。

经典 GS 是有确定更新顺序的迭代，并不等于并发编程中的“异步算法”。改变变量排序会改变迭代矩阵，可能改变收敛速度。

### 图着色、分块与并行

当 $a_{ij}\ne0$ 或 $a_{ji}\ne0$ 时，在变量 $i,j$ 之间连边。同色节点之间没有耦合，可以并行更新；不同颜色顺序执行并建立同步。这样相当于采用一种按颜色排列的 GS 顺序，不保证与原始逐行顺序得到相同的中间结果。

规则二维五点模板可以使用红黑两色。一般网格、接触图或高阶模板需要按真实读写关系建图。分块 GS 则把一组自由度共同求解，减少块内传播误差，同时增加局部求解成本。

## SOR：在 GS 修正上松弛

先用当前最新值求出 GS 候选 $\hat x_i$，再更新：

$$
x_i^{(k+1)}=(1-\omega)x_i^{(k)}+\omega\hat x_i.
$$

$\omega=1$ 是 GS，$0<\omega<1$ 是欠松弛，$1<\omega<2$ 是超松弛。对于 SPD 矩阵，$0<\omega<2$ 保证 SOR 收敛；对一般非对称矩阵，仅满足这个区间并不足够。

矩阵形式为

$$
(D+\omega L)x^{(k+1)}=\omega b+[(1-\omega)D-\omega U]x^{(k)}.
$$

本例取 $\omega=1.2$，第一轮得到 $(2.7,2.12)$。它不必在每一轮都比 GS 误差更小。最优松弛参数与问题结构有关，不能统一推荐 $1.5$。

## CG：在 SPD 系统上构造共轭方向

### 目标函数与递推

当 $A$ 为 SPD 时，$Ax=b$ 等价于最小化

$$
f(x)=\tfrac12x^TAx-b^Tx,\qquad \nabla f=Ax-b=-r.
$$

CG 构造满足 $p_i^TAp_j=0$ 的共轭方向，避免反复破坏已处理方向上的最优性。初始 $r_0=b-Ax_0,p_0=r_0$，每轮执行：

$$
\alpha_k=\frac{r_k^Tr_k}{p_k^TAp_k},\quad
x_{k+1}=x_k+\alpha_kp_k,\quad r_{k+1}=r_k-\alpha_kAp_k,
$$

$$
\beta_k=\frac{r_{k+1}^Tr_{k+1}}{r_k^Tr_k},\qquad
p_{k+1}=r_{k+1}+\beta_kp_k.
$$

精确算术下至多 $n$ 步得到解；浮点计算会损失共轭性，实际需要残差检查，不能机械地把第 $n$ 步当作必然成功。

### 收敛、成本与失败条件

以 $A$ 范数度量误差时有经典上界

$$
\frac{\|e_k\|_A}{\|e_0\|_A}\le2\left(\frac{\sqrt\kappa-1}{\sqrt\kappa+1}\right)^k,\qquad
\kappa=\frac{\lambda_{\max}(A)}{\lambda_{\min}(A)}.
$$

这是误差界，实际收敛还与特征值分布有关。每轮主要是一轮稀疏矩阵向量乘法、向量更新和若干内积；GPU 或分布式系统中的归约和同步也有代价。

CG 要求 SPD 算子。出现 $p^TAp\le0$ 时应报告非正曲率或数值故障，检查矩阵、约束消元和预条件；不能继续除法再把 NaN 当作未收敛。

## PCG：改变求解尺度

选一个易于应用求解且 SPD 的预条件矩阵 $P$。PCG 的对称解释是求解 $P^{-1/2}AP^{-1/2}$，不是直接把通常不对称的 $P^{-1}A$ 当作普通欧氏内积下的 SPD 矩阵。

令 $z_k=P^{-1}r_k,p_0=z_0$，递推改为：

$$
\alpha_k=\frac{r_k^Tz_k}{p_k^TAp_k},\quad
\beta_k=\frac{r_{k+1}^Tz_{k+1}}{r_k^Tz_k}.
$$

其他向量更新与 CG 相同。每轮“应用预条件”一般指解 $Pz=r$，不构造 $P^{-1}$。

### 常见预条件与选择

对角预条件取 $P=D$，成本低、易并行，主要改善分量尺度差异。不完全 Cholesky 近似 $A\approx RR^T$，可改善强耦合问题，但建立和三角求解有额外成本，分解也可能失败。

在本文 $A=D+L+U$ 的符号约定下，SSOR 为

$$
P_{SSOR}=\frac{1}{\omega(2-\omega)}(D+\omega L)D^{-1}(D+\omega U).
$$

使用另一种 $A=D-L-U$ 约定时符号会变化，不能混用。预条件必须同时比较建立时间、应用时间、迭代轮数、内存和能否跨时间步复用。

## 非对称问题：GMRES 与 BiCGSTAB

### GMRES 的 Arnoldi 与小型最小二乘

从初始残差生成 Krylov 空间

$$
\mathcal K_m(A,r_0)=\operatorname{span}\{r_0,Ar_0,\ldots,A^{m-1}r_0\}.
$$

Arnoldi 过程逐步构造正交基 $V_m$ 和上 Hessenberg 矩阵 $\bar H_m$，满足 $AV_m=V_{m+1}\bar H_m$。然后解小型最小二乘

$$
y_m=\arg\min_y\|\|r_0\|_2e_1-\bar H_my\|_2,\qquad x_m=x_0+V_my_m.
$$

每次新增基向量，需要一次矩阵向量乘法并与已有基正交化。存储随基维度增加；GMRES($m$) 每 $m$ 步重启以限制内存，但会丢失部分历史搜索信息，可能停滞。有限精度下还要关注正交性损失。

GMRES 可用于非对称非奇异系统。是否左预条件决定最小化的是原始残差还是预条件残差，因此必须另外报告原系统残差。

### BiCGSTAB 的短递推

BiCGSTAB 用固定影子残差 $\hat r$、短向量递推与局部残差平滑减少存储。初始化 $r=b-Ax$，$p=v=0$，$\rho_{old}=\alpha=\omega=1$。每轮核心为

$$
\rho=\hat r^Tr,\quad\beta=\frac{\rho}{\rho_{old}}\frac{\alpha}{\omega},\quad
p=r+\beta(p-\omega v),\quad v=Ap,
$$

$$
\alpha=\frac{\rho}{\hat r^Tv},\quad s=r-\alpha v,\quad t=As,\quad
\omega=\frac{t^Ts}{t^Tt},
$$

$$
x\leftarrow x+\alpha p+\omega s,\qquad r\leftarrow s-\omega t.
$$

若 $s$ 已满足停止判据，应先提交 $x+\alpha p$ 并结束，避免在 $t=0$ 时除零。$\rho$、$\hat r^Tv$ 或 $\omega$ 接近零可能导致 breakdown，残差也未必单调下降。加入预条件时需对相应方向应用求解操作，不能只替换最后一步。

GMRES 与 BiCGSTAB 没有对所有非对称问题都成立的首选关系：前者以较多存储换残差最小化，后者节省向量存储但可能更不规则。

## Chebyshev 与多重网格

### Chebyshev：利用谱区间构造误差多项式

设 SPD 算子的谱位于已知区间 $[a,b]$，$0<a<b$。多项式迭代构造

$$
e_m=p_m(A)e_0,\quad
p_m(\lambda)=\frac{T_m((b+a-2\lambda)/(b-a))}{T_m((b+a)/(b-a))},
$$

其中 $T_m$ 是 Chebyshev 多项式，$p_m(0)=1$。三项递推允许用矩阵向量乘法和向量更新实现，不必每轮做 CG 的内积归约。

优势来自避免部分全局同步；限制是谱界估计。低估最大特征值可能破坏稳定性，高估太多会减弱加速。作为多重网格平滑器时，常只针对待平滑的高频谱区间，不能直接套用完整解算器的参数。

### 多重网格：在粗层修正慢误差

Jacobi/GS 对某些椭圆问题能较快衰减振荡误差，却难以快速消除平滑误差。粗网格让细层的平滑误差变得更容易表达和修正。一次线性 V-cycle 为：

~~~text
对当前层执行少量预平滑
r = b - A*x
b_coarse = R*r
在粗层近似求解 A_coarse*e_coarse = b_coarse
x = x + P*e_coarse
执行少量后平滑
~~~

$R$ 是限制算子，$P$ 是延拓算子；Galerkin 构造常取 $A_c=RAP$。粗层求解的是误差方程，不是无条件把当前位置下采样后再放大。

几何多重网格依赖网格层次；代数多重网格从矩阵耦合建立层次。在层级复杂度受控且每轮收敛率不随网格恶化等条件下，可达到近线性总成本。强各向异性、复杂边界和错误粗空间都可能使它失效，不能泛称“所有问题最快”。

## 停止判据与结果报告

推荐至少检查原系统残差：

$$
\|b-Ax_k\|_2\le\varepsilon_{abs}+\varepsilon_{rel}\|b\|_2.
$$

绝对与相对容差均需匹配变量和方程尺度。$b=0$ 时绝对项仍然有效。只检查 $\|x_{k+1}-x_k\|$ 可能把停滞当作收敛。

还应报告最大迭代次数、有限数检查、停滞和 breakdown。递推残差可能积累浮点误差，最终结果用实际 $b-Ax$ 复核；必要时根据算法采用残差替换或重启。

比较方法时保持同一矩阵、初值、预条件、精度与硬件，同时记录建立时间、单轮时间和总时间。没有测量条件的毫秒表与“通常快两倍”不属于可复用的结论。

## 可执行的统一比较

下面是用于小矩阵说明的 JavaScript 实现。它保留稠密存储以便阅读，不是 GPU 或生产级稀疏库。CG/PCG 的 SPD 条件由调用者保证，运行中的正曲率检查只用于尽早报告故障。

~~~js
// knowledge-linear-example
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const matvec = (A, x) => A.map(row => dot(row, x));
export const residual = (A, b, x) => b.map((v, i) => v - dot(A[i], x));
export function solve(A, b, { method = 'jacobi', omega = 1, maxIterations = 100,
  atol = 1e-12, rtol = 1e-10, x0 = b.map(() => 0) } = {}) {
  const n = b.length;
  if (!n || A.length !== n || A.some(row => row.length !== n) || x0.length !== n)
    throw new Error('shape');
  if (![...A.flat(), ...b, ...x0, omega, atol, rtol].every(Number.isFinite) ||
      atol < 0 || rtol < 0 || !Number.isInteger(maxIterations) || maxIterations < 0)
    throw new Error('invalid input');
  if (!['jacobi', 'gs', 'sor', 'cg', 'pcg'].includes(method)) throw new Error('method');
  const diagonal = A.map((row, i) => row[i]);
  if (method !== 'cg' && diagonal.some(v => v === 0)) throw new Error('zero diagonal');
  if (method === 'pcg' && diagonal.some(v => v <= 0)) throw new Error('preconditioner');
  let x = [...x0], r = residual(A, b, x);
  const norm = a => Math.hypot(...a);
  const tolerance = atol + rtol * norm(b);
  const history = [];
  const record = () => {
    const actual = residual(A, b, x);
    if (![...x, ...actual].every(Number.isFinite)) throw new Error('nonfinite');
    history.push({ x: [...x], residual: norm(actual) });
    return history.at(-1).residual <= tolerance;
  };
  if (record()) return { x, history, converged: true };
  const precondition = v => v.map((value, i) => method === 'pcg' ? value / diagonal[i] : value);
  let z = precondition(r), p = [...z], rz = dot(r, z);
  for (let k = 0; k < maxIterations; k++) {
    if (method === 'cg' || method === 'pcg') {
      const Ap = matvec(A, p), curvature = dot(p, Ap);
      if (!(curvature > 0) || !(rz > 0)) throw new Error('nonpositive curvature');
      const alpha = rz / curvature;
      x = x.map((v, i) => v + alpha * p[i]);
      r = r.map((v, i) => v - alpha * Ap[i]);
      if (record()) return { x, history, converged: true };
      z = precondition(r);
      const next = dot(r, z), beta = next / rz;
      p = z.map((v, i) => v + beta * p[i]);
      rz = next;
    } else {
      const old = [...x];
      for (let i = 0; i < n; i++) {
        const values = method === 'jacobi' ? old : x;
        const sum = A[i].reduce((total, a, j) => total + (i === j ? 0 : a * values[j]), 0);
        const candidate = (b[i] - sum) / diagonal[i];
        x[i] = old[i] + (method === 'gs' ? 1 : omega) * (candidate - old[i]);
      }
      if (record()) return { x, history, converged: true };
    }
  }
  return { x, history, converged: false };
}
export const benchmark = { A: [[4, 1], [1, 3]], b: [9, 8], exact: [19 / 11, 23 / 11] };
~~~

自动检查直接执行此代码，核对手算轮次、实际残差、零初始残差、零对角、非正曲率及已知不收敛案例。未提供 GMRES、BiCGSTAB 或多重网格的生产实现，因此这些部分的递推说明不能作为相应实现已通过测试的证据。

## 与物理求解器的边界及资料

线性系统只在算子固定时成立。非线性材料需要更新线性化；接触需要非负冲量与摩擦可行域；PBD/XPBD 可能在每个约束后重新计算梯度。它们可以采用 Jacobi 或 GS 风格排程，但不能由线性谱半径直接推断完整场景必然收敛。

方法定义、预条件和停止判据可对照 [Netlib《Templates》](https://netlib.org/templates/templates.html)。从固定算子进入非线性优化见[Hessian](/knowledge/hessian-matrix/)；从矩阵进入接触与关节见[物理约束](/knowledge/physics_constraints_deep_dive/)；时间步与内迭代的区别见[数值积分](/knowledge/numerical-integration-methods/)。
