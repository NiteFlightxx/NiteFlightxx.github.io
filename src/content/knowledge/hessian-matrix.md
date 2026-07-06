---
title: "海森矩阵详解 — 从二阶导数到曲率、极值判定与牛顿法的统一框架"
excerpt: "从单变量二阶导数出发，积木式地搭建出海森矩阵的完整理解：二阶泰勒近似与曲率、Schwarz 对称性、极值判定的正定/负定/不定、海森即梯度的雅可比、牛顿法的 H⁻¹∇f 与线性求解的关系、势能曲面与刚度矩阵、凸性与海森半正定。打通最优化、物理稳定性与机器学习背后同一套二阶导数框架。"
date: "2026-06-29"
category: "Mathematics"
subtopic: "Calculus"
tags: ["数学", "微积分", "最优化", "海森矩阵", "牛顿法"]
readTime: "阅读约45分钟"
---

## 一、从二阶导数到海森：积木式构建

### 1.1 第一块积木：导数回顾（斜率）

从最简单的函数开始：

$$
y = f(x)
$$

导数回答"当 $x$ 抖动一点点，$y$ 跟着抖多少"——

$$
f'(x) = \lim_{\Delta x \to 0} \frac{\Delta y}{\Delta x}
$$

一阶导数 $f'(x)$ 是曲线在某点的**斜率**，告诉我们函数是增是减、增减多快。但这只是故事的**一半**——它只说了"方向"，没说"弯曲程度"。这正是本文的起点。

### 1.2 第二块积木：二阶导数（曲率）

对导数再求一次导，得到**二阶导数**：

$$
f''(x) = \frac{d}{dx}\bigl(f'(x)\bigr) = \frac{d^2 f}{dx^2}
$$

二阶导数回答一个新问题：**斜率本身在怎么变？** 它描述曲线的**弯曲方向与程度**：

- $f''(x) > 0$：开口向上（凹，U 形），斜率在增大——像一个碗底；
- $f''(x) < 0$：开口向下（凸，倒 U 形），斜率在减小——像一个山丘顶；
- $f''(x) = 0$：拐点，弯曲方向在此切换。

例如 $y = x^3$，则 $f'(x) = 3x^2$，$f''(x) = 6x$。在 $x = 0$ 处 $f''(0) = 0$——这正是拐点，曲线从凹变凸。

> **直觉**：一阶导数是"坡度"，二阶导数是"坡度在变陡还是变缓"。开车时一阶导数是速度，二阶导数是**加速度**——你踩油门还是踩刹车。

### 1.3 第三块积木：二次近似（为什么需要二阶导数）

雅可比矩阵的全部意义是一阶泰勒展开——局部用**直线**代替曲线。但直线没有弯曲，描述不了"凹"还是"凸"。要捕捉弯曲，必须再进一阶，用**抛物线**代替曲线——这就是二阶泰勒展开：

$$
f(x) \approx f(a) + f'(a)(x - a) + \frac{1}{2}f''(a)(x - a)^2
$$

例如 $y = \sin x$ 在 $x = 0$ 附近：$f(0)=0$，$f'(0)=1$，$f''(0)=0$，所以 $\sin x \approx x$（一阶，直线）。但如果想知道"比直线低多少"，需要二阶项 $\tfrac{1}{2}\cdot 0\cdot x^2 = 0$——在 $x=0$ 处二阶项为零（拐点），要靠更高阶才知道。换 $y = \cos x$ 在 $x=0$：$f(0)=1$，$f'(0)=0$，$f''(0)=-1$，所以 $\cos x \approx 1 - \tfrac{1}{2}x^2$——一条开口向下的抛物线，精确捕捉了"余弦在顶点是凸的"。

**海森矩阵的全部意义，就是把这个"用抛物线代替曲面"的思想推广到多维。** 二阶导数 $f''(x)$ 在多维下变成了一个矩阵——海森矩阵。

### 1.4 第四块积木：多个输入与偏导数

和雅可比矩阵一样，现实系统几乎都有多个输入。考虑一个标量函数 $f(x, y)$（进来两个，出去一个），先回忆偏导数——固定一个变量、只让另一个变化：

$$
\frac{\partial f}{\partial x}, \qquad \frac{\partial f}{\partial y}
$$

把偏导收成向量就是**梯度**（详见本站&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;§1.4）：

$$
\nabla f = \begin{bmatrix} \dfrac{\partial f}{\partial x} \\[4pt] \dfrac{\partial f}{\partial y} \end{bmatrix}
$$

梯度是一阶信息：哪个方向上升最快。但梯度不知道"曲面在弯曲"——它是一架在曲面上滑行的飞机，只感知坡度，不感知坡度的变化。

### 1.5 第五块积木：二阶偏导数与混合偏导

一阶偏导本身还是 $x, y$ 的函数，可以再求一次偏导，得到**二阶偏导数**：

$$
\frac{\partial^2 f}{\partial x^2} = \frac{\partial}{\partial x}\!\left(\frac{\partial f}{\partial x}\right), \qquad
\frac{\partial^2 f}{\partial y^2} = \frac{\partial}{\partial y}\!\left(\frac{\partial f}{\partial y}\right)
$$

这两个是"纯二阶导"——同一个变量连续求两次。但还有一种新的东西：先对 $x$ 求导、再对 $y$ 求导（或反过来），叫**混合偏导数**：

$$
\frac{\partial^2 f}{\partial y\, \partial x} = \frac{\partial}{\partial y}\!\left(\frac{\partial f}{\partial x}\right), \qquad
\frac{\partial^2 f}{\partial x\, \partial y} = \frac{\partial}{\partial x}\!\left(\frac{\partial f}{\partial y}\right)
$$

混合偏导捕捉的是"一个方向的变化率，受另一个方向影响吗"——两个变量的**交叉耦合**。这恰恰是一阶导数完全看不到的信息。

> **直觉**：纯二阶导是"这条路本身在变陡还是变缓"；混合偏导是"往东走时，南边的坡度也在变吗"——两变量之间的曲率耦合。

### 1.6 第六块积木：正式组装——海森矩阵

把所有二阶偏导数收进一个方阵——行和列都是输入变量，第 $i$ 行第 $j$ 列是 $\partial^2 f / \partial x_i \partial x_j$：

以 $f(x, y) = x^2 + xy + y^2$ 为例：

- 一阶：$\dfrac{\partial f}{\partial x} = 2x + y$，$\dfrac{\partial f}{\partial y} = x + 2y$
- 纯二阶：$\dfrac{\partial^2 f}{\partial x^2} = 2$，$\dfrac{\partial^2 f}{\partial y^2} = 2$
- 混合：$\dfrac{\partial^2 f}{\partial y\, \partial x} = 1$，$\dfrac{\partial^2 f}{\partial x\, \partial y} = 1$

摞成矩阵：

$$
\mathbf{H} = \begin{bmatrix} \dfrac{\partial^2 f}{\partial x^2} & \dfrac{\partial^2 f}{\partial x\, \partial y} \\[6pt] \dfrac{\partial^2 f}{\partial y\, \partial x} & \dfrac{\partial^2 f}{\partial y^2} \end{bmatrix} = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}
$$

**这就是海森矩阵（Hessian Matrix）。**

---

## 二、正式定义与对称性

### 2.1 定义

设标量函数 $f: \mathbb{R}^n \to \mathbb{R}$，输入 $\mathbf{x} = (x_1, \dots, x_n)$。**海森矩阵** $\mathbf{H} \in \mathbb{R}^{n \times n}$ 的第 $i$ 行第 $j$ 列元素为：

$$
\boxed{\,H_{ij} = \frac{\partial^2 f}{\partial x_i\, \partial x_j}\,}
$$

完整展开：

$$
\mathbf{H} = \nabla^2 f = \begin{bmatrix}
\dfrac{\partial^2 f}{\partial x_1^2} & \dfrac{\partial^2 f}{\partial x_1\, \partial x_2} & \cdots & \dfrac{\partial^2 f}{\partial x_1\, \partial x_n} \\[6pt]
\dfrac{\partial^2 f}{\partial x_2\, \partial x_1} & \dfrac{\partial^2 f}{\partial x_2^2} & \cdots & \dfrac{\partial^2 f}{\partial x_2\, \partial x_n} \\[6pt]
\vdots & \vdots & \ddots & \vdots \\[6pt]
\dfrac{\partial^2 f}{\partial x_n\, \partial x_1} & \dfrac{\partial^2 f}{\partial x_n\, \partial x_2} & \cdots & \dfrac{\partial^2 f}{\partial x_n^2}
\end{bmatrix}
$$

> **记忆口诀**：行和列都是**同一组输入变量**，每个格子是"先对行变量求导、再对列变量求导"的二阶变化率。对角线是纯二阶导，非对角线是混合偏导。

### 2.2 对称性：Schwarz 定理

注意上面例子里 $\dfrac{\partial^2 f}{\partial x\, \partial y} = \dfrac{\partial^2 f}{\partial y\, \partial x} = 1$——两个混合偏导相等，不是巧合。**Schwarz 定理**（又称 Clairaut 定理）说：只要 $f$ 的二阶偏导数连续（工程中几乎总成立），**求导顺序可以交换**：

$$
\frac{\partial^2 f}{\partial x_i\, \partial x_j} = \frac{\partial^2 f}{\partial x_j\, \partial x_i}
$$

因此海森矩阵是**对称矩阵**——$H_{ij} = H_{ji}$，即 $\mathbf{H} = \mathbf{H}^{\mathsf T}$。这个性质极其重要：对称矩阵有一整套优美理论（实特征值、正交特征向量、可对角化），后文的极值判定、曲率分析全部依赖对称性。

### 2.3 一个贯穿全文的例子

$$
f(x, y) = x^2 + xy + y^2
$$

$$
\nabla f = \begin{bmatrix} 2x + y \\ x + 2y \end{bmatrix}, \qquad
\mathbf{H} = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}
$$

梯度在 $(0, 0)$ 处为零（驻点），海森在所有点都是常数矩阵 $\begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$（因为 $f$ 是二次函数，二阶导不随位置变化）。这个例子会在全文反复出现。

---

## 三、核心意义：二次近似

### 3.1 二阶泰勒展开

雅可比矩阵给出**一阶**近似——局部用切平面代替曲面。海森矩阵给出**二阶**近似——局部用抛物面（二次曲面）代替曲面：

$$
\boxed{\,f(\mathbf{x} + \Delta\mathbf{x}) \approx f(\mathbf{x}) + \nabla f(\mathbf{x})^{\mathsf T}\Delta\mathbf{x} + \frac{1}{2}\,\Delta\mathbf{x}^{\mathsf T}\,\mathbf{H}(\mathbf{x})\,\Delta\mathbf{x}\,}
$$

逐项拆解：

- $f(\mathbf{x})$：当前点的值；
- $\nabla f^{\mathsf T}\Delta\mathbf{x}$：一阶项，梯度告诉你"往 $\Delta\mathbf{x}$ 方向走，值变多少"；
- $\tfrac{1}{2}\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x}$：二阶项，海森告诉你"走 $\Delta\mathbf{x}$ 时，曲面还额外弯曲了多少"。

在驻点（$\nabla f = 0$）处一阶项消失，函数的局部行为**完全由海森矩阵决定**：

$$
f(\mathbf{x} + \Delta\mathbf{x}) \approx f(\mathbf{x}) + \frac{1}{2}\,\Delta\mathbf{x}^{\mathsf T}\,\mathbf{H}\,\Delta\mathbf{x}
$$

这时 $\tfrac{1}{2}\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x}$ 是正是负，决定了驻点是山谷还是山丘——这正是第五节极值判定的数学根源。

> **本质**：海森矩阵是函数在某一点的**曲率信息**。雅可比说"哪里高哪里低"，海森说"曲面怎么弯"。一阶看趋势，二阶看弯曲——两者合在一起才完整描述了函数的局部形状。

### 3.2 海森矩阵 = 梯度的雅可比

这是海森与雅可比之间最深刻的联系。梯度 $\nabla f$ 是一个从 $\mathbb{R}^n$ 到 $\mathbb{R}^n$ 的向量值函数（进来 $\mathbf{x}$，出去 $\nabla f$）。对它求雅可比矩阵（详见本站&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;§1.6）：

$$
\mathbf{J}_{\nabla f} = \frac{\partial(\nabla f)}{\partial \mathbf{x}} = \begin{bmatrix}
\dfrac{\partial}{\partial x_1}\!\left(\dfrac{\partial f}{\partial x_1}\right) & \cdots & \dfrac{\partial}{\partial x_n}\!\left(\dfrac{\partial f}{\partial x_1}\right) \\
\vdots & \ddots & \vdots \\
\dfrac{\partial}{\partial x_1}\!\left(\dfrac{\partial f}{\partial x_n}\right) & \cdots & \dfrac{\partial}{\partial x_n}\!\left(\dfrac{\partial f}{\partial x_n}\right)
\end{bmatrix} = \begin{bmatrix}
\dfrac{\partial^2 f}{\partial x_1^2} & \cdots & \dfrac{\partial^2 f}{\partial x_1 \partial x_n} \\
\vdots & \ddots & \vdots \\
\dfrac{\partial^2 f}{\partial x_n \partial x_1} & \cdots & \dfrac{\partial^2 f}{\partial x_n^2}
\end{bmatrix} = \mathbf{H}
$$

$$
\boxed{\,\mathbf{H} = \mathbf{J}_{\nabla f}\,}
$$

**海森矩阵就是梯度的雅可比矩阵。** 雅可比是一阶导数的矩阵，对梯度再求一次雅可比就得到二阶导数的矩阵——海森。这解释了为什么海森是方阵（梯度是 $\mathbb{R}^n \to \mathbb{R}^n$）且对称（Schwarz 定理）。

> 一阶导数 → 标量；梯度（一阶导数向量）→ 列向量；雅可比（一阶导数矩阵）→ $m \times n$ 矩阵；海森（二阶导数矩阵）→ $n \times n$ 对称方阵。海森是这条"导数阶梯"的下一级。

---

## 四、几何意义：曲率与二次型

### 4.1 二次型：海森的几何语言

二阶泰勒展开的最后一项 $\tfrac{1}{2}\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x}$ 是一个**二次型**——它把向量 $\Delta\mathbf{x}$ 映射成一个标量。这个标量的正负，取决于 $\mathbf{H}$ 和 $\Delta\mathbf{x}$ 的方向：

- 沿某方向 $\Delta\mathbf{x}$，若 $\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x} > 0$：曲面在该方向**凹向上**（U 形）；
- 若 $\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x} < 0$：曲面在该方向**凸向下**（倒 U 形）；
- 若 $\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x} = 0$：该方向无曲率（拐点方向）。

以全文例子 $\mathbf{H} = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$ 为例：
- 沿 $x$ 轴 $\Delta\mathbf{x} = [1, 0]^{\mathsf T}$：$\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x} = 2 > 0$（凹向上）；
- 沿 $y$ 轴 $\Delta\mathbf{x} = [0, 1]^{\mathsf T}$：$= 2 > 0$（凹向上）；
- 沿对角线 $\Delta\mathbf{x} = [1, 1]^{\mathsf T}$：$= 2+1+1+2 = 6 > 0$（更凹）；
- 沿反对角线 $\Delta\mathbf{x} = [1, -1]^{\mathsf T}$：$= 2-1-1+2 = 2 > 0$（凹向上，但弱）。

所有方向都凹向上——这个曲面像一个碗。这就是"正定"的几何含义（第五节）。

### 4.2 特征值与主曲率方向

因为海森是对称矩阵，它可以被正交对角化：

$$
\mathbf{H} = \mathbf{Q}\,\boldsymbol{\Lambda}\,\mathbf{Q}^{\mathsf T}
$$

其中 $\boldsymbol{\Lambda} = \operatorname{diag}(\lambda_1, \lambda_2, \dots, \lambda_n)$ 是特征值对角阵，$\mathbf{Q}$ 的列是正交特征向量。代回二次型：

$$
\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x} = \Delta\mathbf{x}^{\mathsf T}\mathbf{Q}\boldsymbol{\Lambda}\mathbf{Q}^{\mathsf T}\Delta\mathbf{x} = \tilde{\mathbf{x}}^{\mathsf T}\boldsymbol{\Lambda}\tilde{\mathbf{x}} = \lambda_1 \tilde{x}_1^2 + \lambda_2 \tilde{x}_2^2 + \cdots + \lambda_n \tilde{x}_n^2
$$

其中 $\tilde{\mathbf{x}} = \mathbf{Q}^{\mathsf T}\Delta\mathbf{x}$ 是 $\Delta\mathbf{x}$ 在特征向量基下的坐标。几何意义极其清晰：

- **特征向量**是曲面的**主曲率方向**——沿这些方向，曲面只弯不扭（纯凹或纯凸）；
- **特征值**是各主方向的**曲率大小**——$\lambda_i$ 越大，该方向弯得越剧烈。

以 $\mathbf{H} = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$ 为例，特征值 $\lambda_1 = 3$（方向 $[1,1]^{\mathsf T}$）、$\lambda_2 = 1$（方向 $[1,-1]^{\mathsf T}$）。所以沿对角线方向曲率最大（$\lambda = 3$），沿反对角线方向曲率最小（$\lambda = 1$），但两个方向都凹向上——碗在最陡方向更深。

### 4.3 椭球与条件数

如果 $\mathbf{H}$ 正定（所有 $\lambda_i > 0$），等值面 $f(\mathbf{x}) = \text{const}$ 在驻点附近是**椭球**，主轴长度正比于 $1/\sqrt{\lambda_i}$。曲率越大（$\lambda_i$ 大）的方向，椭球越窄——曲面在该方向"夹得越紧"。

**条件数** $\kappa = \lambda_{\max} / \lambda_{\min}$ 衡量曲面的**各向异性**：

- $\kappa = 1$：各方向曲率相同，等值面是球（各向同性）；
- $\kappa \gg 1$：某方向极陡、某方向极缓，等值面是狭长椭球——**病态**（ill-conditioned）。

> 这与迭代法里的条件数是**同一个概念**（详见本站&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;§9）：牛顿法在驻点附近要解 $\mathbf{H}\,\Delta\mathbf{x} = -\nabla f$，如果 $\mathbf{H}$ 病态（$\kappa$ 大），求解就慢——共轭梯度的收敛速度正取决于这个 $\kappa$。海森的条件数，直接决定了优化算法在此处的收敛快慢。

---

## 五、二阶导数判据：极值分类

这是海森矩阵最经典的应用——**判定驻点是极小值、极大值还是鞍点**。

### 5.1 单变量回顾

单变量下，驻点 $f'(x_0) = 0$ 处看二阶导数：

- $f''(x_0) > 0$：极小值（凹向上，碗底）；
- $f''(x_0) < 0$：极大值（凸向下，山顶）；
- $f''(x_0) = 0$：无法判定（可能拐点，需更高阶）。

### 5.2 多变量：正定、负定、不定

多变量下，$f''$ 变成了海森矩阵。判定不是看单个数，而是看 $\mathbf{H}$ 的**定性**——所有方向的曲率符号是否一致。设 $\nabla f(\mathbf{x}_0) = 0$（驻点）：

| $\mathbf{H}(\mathbf{x}_0)$ 的定性 | 所有特征值 | 几何 | 结论 |
|:---|:---|:---|:---|
| **正定** | $\lambda_i > 0$（全正） | 所有方向都凹向上（碗） | **极小值** |
| **负定** | $\lambda_i < 0$（全负） | 所有方向都凸向下（倒碗） | **极大值** |
| **不定** | 有正有负 | 某方向凹、某方向凸（马鞍） | **鞍点** |
| **半定** | 有零、其余同号 | 某方向无曲率 | **无法判定**（需更高阶） |

以全文例子 $f = x^2 + xy + y^2$ 在驻点 $(0,0)$：$\mathbf{H} = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$，特征值 $3, 1$ 全正 → 正定 → **极小值**。

对照一个鞍点例子 $f = x^2 - y^2$：

$$
\mathbf{H} = \begin{bmatrix} 2 & 0 \\ 0 & -2 \end{bmatrix}, \qquad \lambda_1 = 2 > 0,\ \lambda_2 = -2 < 0
$$

有正有负 → 不定 → **鞍点**。几何上：沿 $x$ 方向凹向上（山谷），沿 $y$ 方向凸向下（山脊）——像一个马鞍。

### 5.3 判别流程

对 $n$ 维函数 $f(\mathbf{x})$，极值判定的完整流程：

1. 求 $\nabla f = 0$，找到所有驻点 $\mathbf{x}_0$；
2. 在每个驻点算 $\mathbf{H}(\mathbf{x}_0)$；
3. 检查 $\mathbf{H}$ 的定性（看特征值符号，或用顺序主子式——见下）；
4. 正定 → 极小；负定 → 极大；不定 → 鞍点；半定 → 无法判定。

> **$2 \times 2$ 的快捷判别**（Sylvester 准则特例）：对 $\mathbf{H} = \begin{bmatrix} a & b \\ b & c \end{bmatrix}$，看行列式 $\det(\mathbf{H}) = ac - b^2$ 和 $a$：
> - $a > 0$ 且 $\det > 0$ → 正定 → 极小；
> - $a < 0$ 且 $\det > 0$ → 负定 → 极大；
> - $\det < 0$ → 不定 → 鞍点；
> - $\det = 0$ → 无法判定。

这就是高中学的"$\Delta = b^2 - 4ac$"判别式的矩阵版——$\det(\mathbf{H}) = ac - b^2$ 正是 $-\Delta/4$。海森把一元二次的判别式推广到了任意维度。

---

## 六、凸性与海森矩阵

### 6.1 凸函数与海森半正定

凸函数是最优化的"好函数"——**局部极小即全局极小**，没有鞍点陷阱。凸性的二阶刻画是：

$$
f \text{ 是凸函数} \iff \mathbf{H}(\mathbf{x}) \succeq 0 \quad \text{（半正定，对所有 } \mathbf{x} \text{）}
$$

即海森在**所有点**都半正定——所有特征值非负，曲面处处只凹向上或平坦，不会凸向下。这等价于"曲面位于任意切平面上方"。

### 6.2 严格凸与正定

$$
f \text{ 是严格凸函数} \iff \mathbf{H}(\mathbf{x}) \succ 0 \quad \text{（正定，对所有 } \mathbf{x} \text{）}
$$

严格凸函数有**唯一**全局极小值，且牛顿法/梯度下降保证收敛到它。例如 $f = x^2 + xy + y^2$ 的海森 $\begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$ 处处正定 → 严格凸 → 唯一极小值在 $(0,0)$。

> **工程意义**：优化问题建模时，若能保证目标函数的海森正定（或通过加正则项 $\tfrac{\mu}{2}\|\mathbf{x}\|^2$ 让它正定），就能放心用牛顿法/共轭梯度，不必担心陷入鞍点。机器学习里的 L2 正则化，本质就是给海森加 $\mu \mathbf{I}$，把特征值整体抬高、确保正定。

---

## 七、应用一：牛顿法（最优化）

这是海森矩阵在工程中最核心的应用——**二阶优化方法**。

### 7.1 一维牛顿法回顾

求 $f'(x) = 0$（找极值）。在当前点 $x_k$ 对 $f'$ 做一阶泰勒展开（即对 $f$ 做二阶展开）：

$$
f'(x) \approx f'(x_k) + f''(x_k)(x - x_k)
$$

令其为零，解出下一步：

$$
x_{k+1} = x_k - \frac{f'(x_k)}{f''(x_k)}
$$

一维牛顿法 = 用二阶导数的倒数"跳到抛物线的底"。它**二阶收敛**（每步误差平方级缩小），比梯度下降的一阶收敛快得多。

### 7.2 多维牛顿法

把 $f'$ 换成梯度 $\nabla f$，$f''$ 换成海森 $\mathbf{H}$，标量除法换成矩阵求解：

$$
\boxed{\,\mathbf{x}_{k+1} = \mathbf{x}_k - \mathbf{H}(\mathbf{x}_k)^{-1}\,\nabla f(\mathbf{x}_k)\,}
$$

这就是**多维牛顿法**。它不再是沿梯度走一小步（一阶），而是"看到曲率后直接跳到抛物面的底"（二阶）——在海森正定的区域，收敛极快。

以全文例子 $f = x^2 + xy + y^2$，初始 $\mathbf{x}_0 = (1, 1)$：

- $\nabla f = [2x+y,\ x+2y]^{\mathsf T} = [3,\ 3]^{\mathsf T}$
- $\mathbf{H} = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$，$\mathbf{H}^{-1} = \frac{1}{3}\begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}$
- $\Delta\mathbf{x} = -\mathbf{H}^{-1}\nabla f = -\frac{1}{3}\begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}\begin{bmatrix} 3 \\ 3 \end{bmatrix} = -\frac{1}{3}\begin{bmatrix} 3 \\ 3 \end{bmatrix} = \begin{bmatrix} -1 \\ -1 \end{bmatrix}$
- $\mathbf{x}_1 = (1,1) + (-1,-1) = (0, 0)$——**一步到位**！

因为 $f$ 是二次函数，抛物面精确，牛顿法一步收敛到真解。对一般函数，牛顿法在驻点附近二阶收敛，但远离驻点时可能不收敛。

### 7.3 与线性求解的关系

牛顿步 $\Delta\mathbf{x} = -\mathbf{H}^{-1}\nabla f$ 本质上是解一个线性方程组：

$$
\mathbf{H}\,\Delta\mathbf{x} = -\nabla f
$$

**每一步牛顿迭代，都要解一次以海森为系数矩阵的线性系统。** 这直接连接到迭代求解法（详见本站&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;）：

- $\mathbf{H}$ 对称正定（在极小值附近）→ 可用**共轭梯度（CG）**，不必显式求逆；
- $\mathbf{H}$ 病态（$\kappa$ 大）→ CG 收敛慢，需要**预条件（PCG）**；
- 大规模问题（如深度学习，$\mathbf{H}$ 是百万维）→ 存储/计算 $\mathbf{H}$ 不可行，改用拟牛顿法（BFGS/L-BFGS，用梯度差**近似**海森的逆，见 §7.4）。

> **牛顿法 = 梯度下降 + 曲率修正。** 梯度下降只看坡度（一阶），牛顿法还看弯曲（二阶），所以步长更准、收敛更快——代价是每步要算海森并解线性系统。

### 7.4 陷阱与修正

裸牛顿法有三个工程陷阱，各有成熟修正：

| 陷阱 | 原因 | 修正 |
|:---|:---|:---|
| 远离驻点不收敛 | $\mathbf{H}$ 不正定，抛物面开口错方向 | **阻尼牛顿法**：加步长 $\alpha$，$\mathbf{x}_{k+1} = \mathbf{x}_k - \alpha\,\mathbf{H}^{-1}\nabla f$，线搜索选 $\alpha$ |
| 鞍点被困 | $\mathbf{H}$ 不定，$\mathbf{H}^{-1}$ 把你推向鞍点 | **信赖域**：限制 $\|\Delta\mathbf{x}\| \leq \Delta_k$，只在信任范围内用二阶模型 |
| $\mathbf{H}$ 太大算不动 | $n$ 维海森是 $n \times n$ | **拟牛顿法（BFGS/L-BFGS）**：不显式构造 $\mathbf{H}$，用梯度差 $\mathbf{s}_k = \mathbf{x}_{k+1}-\mathbf{x}_k,\ \mathbf{y}_k = \nabla f_{k+1} - \nabla f_k$ 近似 $\mathbf{H}^{-1}$ |

L-BFGS（有限内存 BFGS）只存最近 $m$ 步的 $(\mathbf{s}, \mathbf{y})$，内存 $O(mn)$ 而非 $O(n^2)$，是大规模无约束优化的工业标准。SciPy 的 `scipy.optimize.minimize(method='L-BFGS-B')`、PyTorch 的 `LBFGS` 优化器都基于此。

---

## 八、应用二：物理——势能曲面与稳定性

### 8.1 势能极小值与正定海森

物理系统总势能 $V(\mathbf{q})$（$\mathbf{q}$ 是广义坐标）的**平衡位置**是 $\nabla V = 0$ 处。但平衡不一定稳定——要看海森：

- $\mathbf{H}_V \succ 0$（正定）：**稳定平衡**——势能极小，扰动后系统被"拉回"（小球在碗底）；
- $\mathbf{H}_V \prec 0$（负定）：**不稳定平衡**——势能极大，扰动后系统"滑走"（小球在山顶）；
- $\mathbf{H}_V$ 不定：**鞍点平衡**——某方向稳定、某方向不稳定（小球在马鞍点）。

> 物理直觉：海森正定 = 势能曲面在平衡点是个碗，任何方向的扰动都使势能升高，回复力把系统推回去。这就是"稳定"的数学定义。

### 8.2 刚度矩阵 = 势能海森

对势能在平衡点 $\mathbf{q}_0$ 做二阶泰勒展开（一阶项为零）：

$$
V(\mathbf{q}_0 + \Delta\mathbf{q}) \approx V(\mathbf{q}_0) + \frac{1}{2}\,\Delta\mathbf{q}^{\mathsf T}\,\mathbf{H}_V\,\Delta\mathbf{q}
$$

回复力 $\mathbf{F} = -\nabla V \approx -\mathbf{H}_V\,\Delta\mathbf{q}$。这跟弹簧力 $\mathbf{F} = -\mathbf{K}\,\Delta\mathbf{q}$ 形式完全一致——所以：

$$
\boxed{\,\mathbf{K} = \mathbf{H}_V\,}
$$

**刚度矩阵就是势能的海森矩阵。** 这把结构力学（刚度矩阵）、弹性体（应力-应变）、物理引擎（约束柔度）统一在海森框架下：

- 弹簧系统的刚度矩阵 = 势能对位移的海森；
- 有限元分析的刚度矩阵 = 应变能对节点位移的海森；
- XPBD 的 compliance 矩阵 = 约束势能对约束力的海森的逆（柔度 = 海森之逆）。

### 8.3 振动模态与特征值

线性化运动方程 $\mathbf{M}\ddot{\mathbf{q}} + \mathbf{K}\mathbf{q} = 0$（$\mathbf{M}$ 质量矩阵，$\mathbf{K}$ 刚度矩阵 $= \mathbf{H}_V$）的振动模态，由广义特征值问题 $\mathbf{K}\,\boldsymbol{\phi} = \omega^2 \mathbf{M}\,\boldsymbol{\phi}$ 决定。每个特征值 $\omega^2$ 对应一个固有频率 $\omega$，特征向量 $\boldsymbol{\phi}$ 对应振动模态。

> 这与 §4.2 完全呼应：海森的特征值是曲率（物理上就是刚度/频率），特征向量是主曲率方向（物理上就是振动模态）。**特征值大 = 方向硬 = 频率高**。游戏引擎里刚体的"线性驱动""角驱动"刚度，本质上就是在调势能海森的对角元。

---

## 九、应用三：机器学习与深度学习

### 9.1 损失地貌

神经网络的训练是最优化问题——最小化损失函数 $L(\mathbf{w})$（$\mathbf{w}$ 是所有权重）。损失函数构成一个**损失地貌**（loss landscape），权重空间的"地形"。海森矩阵描述这个地形的曲率：

- 沿高曲率方向（$\lambda$ 大）：损失变化剧烈，需小步长；
- 沿低曲率方向（$\lambda$ 小）：损失变化平缓，可大步长。

梯度下降用**统一步长**（学习率 $\eta$），无法区分方向曲率——这正是它在病态问题上慢的根源。

### 9.2 海森与学习率

梯度下降 $\mathbf{w}_{k+1} = \mathbf{w}_k - \eta\,\nabla L$ 的收敛性取决于学习率 $\eta$ 与海森特征值的关系。对二次模型，收敛条件是：

$$
0 < \eta < \frac{2}{\lambda_{\max}}
$$

最大学习率被最大特征值 $\lambda_{\max}$ 限制——曲率最陡的方向决定了你能迈多大步。而收敛速度由条件数 $\kappa = \lambda_{\max}/\lambda_{\min}$ 决定：$\kappa$ 越大，各方向曲率越不均，梯度下降越慢（详见本站&#12298;[线性方程组迭代求解详解](/knowledge/iterative-linear-solvers/)&#12299;§9 关于条件数与 CG 收敛率的讨论，同一套数学）。

### 9.3 为什么深度学习不用真牛顿法

真牛顿法需要 $\mathbf{H}^{-1}$，对百万参数的网络，$\mathbf{H}$ 是百万×百万矩阵——**存储和求逆都不可行**。所以深度学习的实践是：

- **Adam/RMSProp**：用梯度的一阶矩/二阶矩**对角近似**海森——每个参数一个自适应学习率，相当于只取海森的对角线；
- **K-FAC/NGD**：近似海森的**块结构**（按层分块），折中精度与开销；
- **L-BFGS**：传统拟牛顿，小模型/全 batch 训练可用，但 SGD 域不常用。

> 海森在深度学习里"理论上完美、实践中太贵"——它的曲率信息能解释为什么 Adam 比纯 SGD 快（Adam 隐式做了对角海森缩放），但完整海森的计算成本让工业界选择了近似。

---

## 十、数值海森 vs 解析海森（补充）

和雅可比一样（详见本站&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;§十），海森也有解析与数值两条路：

| 方法 | 做法 | 优点 | 缺点 |
|:---|:---|:---|:---|
| **解析海森** | 对 $f$ 符号求二阶导 | 精确、无误差 | 推导极繁，$n$ 个变量有 $n^2/2$ 项 |
| **数值海森** | 有限差分：$H_{ij} \approx \dfrac{\frac{\partial f}{\partial x_i}\big\vert_{x_j+h} - \frac{\partial f}{\partial x_i}\big\vert_{x_j-h}}{2h}$ | 通用、无需手推 | 误差大，需 $O(n^2)$ 次 $f$ 评估 |
| **自动微分** | 反向模式算梯度后，对梯度再自动微分 | 精确、机器可算 | 二阶 AD 实现复杂，开销大 |

数值海森特别贵：$n$ 个变量需要 $O(n^2)$ 次函数评估（而雅可比只需 $O(n)$ 次）。这是大规模问题避免显式海森的另一个原因。实践中常用**梯度的有限差分**近似海森（对梯度向量做数值雅可比，即 $\mathbf{H} = \mathbf{J}_{\nabla f}$ 的数值版），开销 $O(n)$ 次梯度评估。

---

## 十一、统一视角与总结

### 海森矩阵的"几副面孔"

| 面孔 | 公式 | 领域 | 用途 |
|:---|:---|:---|:---|
| 二阶泰勒 | $f \approx f_0 + \nabla f^{\mathsf T}\Delta\mathbf{x} + \tfrac{1}{2}\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\Delta\mathbf{x}$ | 微积分 | 局部二次近似 |
| 梯度的雅可比 | $\mathbf{H} = \mathbf{J}_{\nabla f}$ | 线性代数 | 与雅可比的统一 |
| 曲率算子 | $\lambda_i$ = 主曲率 | 几何 | 曲面弯曲方向与程度 |
| 极值判据 | 正定→极小，负定→极大，不定→鞍点 | 最优化 | 驻点分类 |
| 凸性判据 | $\mathbf{H} \succeq 0$ → 凸 | 最优化 | 全局最优保证 |
| 牛顿步 | $\Delta\mathbf{x} = -\mathbf{H}^{-1}\nabla f$ | 最优化 | 二阶收敛优化 |
| 刚度矩阵 | $\mathbf{K} = \mathbf{H}_V$ | 物理 | 势能曲率 = 刚度 = 频率 |

### 一句话本质

> **一阶导数描述"变化率"，雅可比矩阵描述"多维局部线性映射"，海森矩阵描述"多维局部曲率"。**

$$
\boxed{\,f(\mathbf{x} + \Delta\mathbf{x}) \approx f(\mathbf{x}) + \nabla f^{\mathsf T}\Delta\mathbf{x} + \frac{1}{2}\,\Delta\mathbf{x}^{\mathsf T}\mathbf{H}\,\Delta\mathbf{x}\,}
$$

雅可比说"这个点往哪走、走多快"，海森说"这个点怎么弯"。一个是切平面，一个是抛物面——一阶看趋势，二阶看曲率。牛顿法把两者合用（$\mathbf{H}^{-1}\nabla f$），既知方向又知弯曲，所以能一步跳到抛物面底部。而物理上，势能的海森就是刚度矩阵——曲率即刚度，刚度即频率，从数学到物理一脉相承。

如果你能透彻理解"海森是对称矩阵、特征值是曲率、正定就是碗、牛顿法是 $\mathbf{H}^{-1}\nabla f$、势能海森就是刚度"，本质上就打通了最优化、结构振动、物理引擎约束刚度、机器学习收敛性背后同一套二阶导数框架。下回在任何代码里看到 `hessian`、`Hessian`、`hess`、`jacobian(gradient)`、`stiffness_matrix`、`newton_step`、`H⁻¹g`、`BFGS`、`condition_number`，你都知道它们在算同一件事——曲率。
