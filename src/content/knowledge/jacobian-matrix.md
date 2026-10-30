---
title: Jacobian 矩阵与局部线性化
excerpt: 用导数矩阵描述输入扰动到输出变化的映射，连接链式法则、IK 与约束。
date: '2026-06-25'
category: Mathematics
subtopic: LinearAlgebra
tags:
  - 数学
  - 线性代数
  - 雅可比
readTime: 阅读约40分钟
kind: theory
level: intermediate
pageType: guide
aliases:
  - 雅可比矩阵详解 — 从导数到机器人、飞控与游戏物理的统一框架
prerequisites:
  - calculus-foundations
  - ue-linear-algebra-guide
nextArticles:
  - hessian-matrix
  - iterative-linear-solvers
  - ue-animation-node-math
related: []
sources:
  - title: OpenStax Calculus Volume 3 — The Chain Rule
    url: https://openstax.org/books/calculus-volume-3/pages/4-5-the-chain-rule
  - title: Modern Robotics — Statics of Open Chains
    url: https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-2-statics-of-open-chains/
  - title: Modern Robotics — Singularities
    url: https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-3-singularities/
  - title: Modern Robotics — Manipulability
    url: https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-4-manipulability/
  - title: Modern Robotics — Numerical Inverse Kinematics
    url: https://modernrobotics.northwestern.edu/nu-gm-book-resource/6-2-numerical-inverse-kinematics-part-1-of-2/
---
Jacobian 回答一个具体问题：当几个输入一起改变时，多个输出分别会改变多少？先把两个输出的偏导数逐项算清，再把它们排成矩阵，最后就能理解约束速度和约束作用中为什么会同时出现 $J$ 与 $J^{\mathsf T}$。

本文沿用列向量约定。导数、偏导数、梯度与拉格朗日乘子的入门推导见[微分基础](/knowledge/calculus-foundations/)；这里先从一个二维算例展开，后面再讨论 IK、几何奇异性和控制中的应用。以下是一般数学模型，不据此推断某个 UE 系统的具体实现。

## 输入、输出与导数约定

### 一个输出为什么可以用梯度表示

先回顾标量函数 $s(x,y)=x^2+2y^2$。两个输入分别改变时，输出的一阶变化为

$$
ds=2x\,dx+4y\,dy.
$$

它只有一个输出，所以只需要一组系数 $(2x,4y)$。把这组系数竖着写，就是梯度；横着写，则可以直接乘输入变化的列向量。

现在设计算过程会同时输出两个数。每个输出都要有自己的一组系数，一条梯度向量就无法同时记录全部关系。这正是引入 Jacobian 的原因。

### 一个具体例子

沿用原文的两个输出函数：

$$
u=x^2+y,\qquad v=y^2-x.
$$

例如在 $(x,y)=(2,3)$，两个输出分别为 $u=7,v=7$。要描述输入改变后的输出变化，我们需要回答四个问题：

- 只改变 $x$，$u$ 怎样变化？
- 只改变 $y$，$u$ 怎样变化？
- 只改变 $x$，$v$ 怎样变化？
- 只改变 $y$，$v$ 怎样变化？

逐项计算，而不直接跳到矩阵：

$$
\begin{aligned}
\frac{\partial u}{\partial x}
&=\frac{\partial}{\partial x}(x^2+y)=2x+0=2x,\\
\frac{\partial u}{\partial y}
&=\frac{\partial}{\partial y}(x^2+y)=0+1=1,\\
\frac{\partial v}{\partial x}
&=\frac{\partial}{\partial x}(y^2-x)=0-1=-1,\\
\frac{\partial v}{\partial y}
&=\frac{\partial}{\partial y}(y^2-x)=2y-0=2y.
\end{aligned}
$$

### 为什么每个输出占一行

分别写出两个输出的全微分：

$$
du=2x\,dx+1\,dy,\qquad
dv=-1\,dx+2y\,dy.
$$

它们使用同一组输入变化量，可以合并为

$$
\begin{bmatrix}du\\dv\end{bmatrix}
=
\underbrace{\begin{bmatrix}2x&1\\-1&2y\end{bmatrix}}_{J}
\begin{bmatrix}dx\\dy\end{bmatrix}.
$$

第一行乘输入向量得到 $du$，第二行得到 $dv$；第一列对应 $x$，第二列对应 $y$。**行对应输出，列对应输入**，由这个乘法关系决定。

单独看第一列 $(2x,-1)^{\mathsf T}$，它还表示只改变 $x$ 时两个输出各自的变化率；第二列同理。这使 Jacobian 同时拥有“按输出看行”和“按输入看列”两种读法。

## 核心意义：局部线性化

### 把矩阵乘法实际算一次

仍取当前位置 $(2,3)$。先在当前位置计算导数：

$$
J(2,3)=\begin{bmatrix}4&1\\-1&6\end{bmatrix}.
$$

现在输入增加 $\Delta x=0.1,\Delta y=0.2$。一阶模型预测

$$
\begin{bmatrix}\Delta u\\\Delta v\end{bmatrix}
\approx
\begin{bmatrix}4&1\\-1&6\end{bmatrix}
\begin{bmatrix}0.1\\0.2\end{bmatrix}.
$$

先算第一行，再算第二行：

$$
\begin{aligned}
\Delta u&\approx4\times0.1+1\times0.2=0.6,\\
\Delta v&\approx-1\times0.1+6\times0.2=1.1.
\end{aligned}
$$

因此预测的新输出是 $(7.6,8.1)^{\mathsf T}$。这个矩阵把两个输入方向上的贡献，分别汇总成了两个输出的变化量。

### 与真实变化比较

把新位置 $(2.1,3.2)$ 直接代入原函数：

$$
\begin{aligned}
u_{\mathrm{new}}&=2.1^2+3.2=7.61,\\
v_{\mathrm{new}}&=3.2^2-2.1=8.14.
\end{aligned}
$$

所以真实增量是 $(0.61,1.14)^{\mathsf T}$，与线性预测相差 $(0.01,0.04)^{\mathsf T}$。差额恰好来自展开时省略的平方项：

$$
\begin{aligned}
\Delta u&=2x\Delta x+\Delta y+(\Delta x)^2,\\
\Delta v&=-\Delta x+2y\Delta y+(\Delta y)^2.
\end{aligned}
$$

把两项输入扰动同时减半，线性部分也减半，而这个例子的误差缩小为四分之一。局部线性化保留一阶响应；有限输入变化仍有余项。

用向量记号，令 $\mathbf q=(x,y)^{\mathsf T}$，$\mathbf F=(u,v)^{\mathsf T}$，上述过程简写为

$$
\mathbf F(\mathbf q+\Delta\mathbf q)
\approx\mathbf F(\mathbf q)+J(\mathbf q)\Delta\mathbf q.
$$

$J$ 在当前点取值。对非线性函数，走到新位置后通常需要重新计算，不能把第一次的矩阵一直用于整条轨迹。矩阵也可能非方阵或奇异；线性化并不自动带来可逆性。

### 可复算的局部预测

以下可运行 JavaScript 直接实现上述函数与导数，参数和结果均无量纲。它用于验证一阶预测及其余项，不是完整求解器。

~~~js
// knowledge-jacobian-local-example
export function twoOutput(q) {
  if (!Array.isArray(q) || q.length !== 2 || !q.every(Number.isFinite)) throw new Error('invalid input');
  const [x, y] = q;
  return [x*x+y, y*y-x];
}
export function jacobianAt(q) {
  twoOutput(q);
  return [[2*q[0], 1], [-1, 2*q[1]]];
}
export function localPrediction(q = [2, 3], delta = [.1, .2]) {
  twoOutput(delta);
  const base = twoOutput(q), J = jacobianAt(q);
  const predicted = J.map(row => row.reduce((sum, value, i) => sum + value*delta[i], 0));
  const next = twoOutput(q.map((value, i) => value+delta[i]));
  const actual = next.map((value, i) => value-base[i]);
  return { J, base, predicted, actual, remainder: actual.map((value, i) => value-predicted[i]) };
}
~~~

## 正式定义

具体例子中，我们有两个输入、两个输出，所以矩阵是两行两列。推广到输入有 $n$ 个分量、输出有 $m$ 个分量的可微函数

$$
\mathbf F:\mathbb R^n\to\mathbb R^m,
$$

Jacobian 就有 $m$ 行、$n$ 列。第 $i$ 行第 $j$ 列记录第 $i$ 个输出对第 $j$ 个输入的偏导数：

$$
J_{ij}=\frac{\partial F_i}{\partial q_j},\qquad
J=\begin{bmatrix}
\partial F_1/\partial q_1&\cdots&\partial F_1/\partial q_n\\
\vdots&\ddots&\vdots\\
\partial F_m/\partial q_1&\cdots&\partial F_m/\partial q_n
\end{bmatrix}.
$$

例如六个输入、三个输出对应三行六列。矩阵尺寸由输入和输出决定，与函数是否线性、是否用于物理无关。

### Jacobian 与梯度的转置关系

只有一个输出 $s(\mathbf q)$ 时，Jacobian 退化为一行：

$$
J_s=\begin{bmatrix}\partial s/\partial q_1&\cdots&\partial s/\partial q_n\end{bmatrix}.
$$

而梯度按本文约定是列向量，所以 $J_s=(\nabla s)^{\mathsf T}$。多个输出时，每一行是对应输出梯度的转置。

梯度针对标量输出；Jacobian 能同时处理多个输出。这是组织方式的推广，不需要把二者当作互不相关的导数。

### 多元链式法则 = Jacobian 矩阵相乘

若先由输入 $\mathbf q$ 得到 $\mathbf z=\mathbf G(\mathbf q)$，再得到 $\mathbf y=\mathbf H(\mathbf z)$，则

$$
d\mathbf z=J_Gd\mathbf q,\qquad
d\mathbf y=J_Hd\mathbf z=J_HJ_Gd\mathbf q.
$$

因此复合映射的 Jacobian 是 $J_HJ_G$。后执行的映射放在左侧，矩阵尺寸必须相容。

如果末端只输出一个能量 $E(\mathbf z)$，则

$$
dE=(\nabla_{\mathbf z}E)^{\mathsf T}d\mathbf z
=(\nabla_{\mathbf z}E)^{\mathsf T}J_Gd\mathbf q
=(J_G^{\mathsf T}\nabla_{\mathbf z}E)^{\mathsf T}d\mathbf q.
$$

与 $dE=(\nabla_{\mathbf q}E)^{\mathsf T}d\mathbf q$ 比较，得到

$$
\nabla_{\mathbf q}E=J_G^{\mathsf T}\nabla_{\mathbf z}E.
$$

例如用前面的 $\mathbf G=(u,v)^{\mathsf T}$，再定义 $E=(u^2+v^2)/2$。在 $(2,3)$，输出为 $(7,7)^{\mathsf T}$，输出端梯度也是 $(7,7)^{\mathsf T}$。映射回输入得到

$$
\nabla_{\mathbf q}E
=\begin{bmatrix}4&-1\\1&6\end{bmatrix}\begin{bmatrix}7\\7\end{bmatrix}
=\begin{bmatrix}21\\49\end{bmatrix}.
$$

转置在这里来自链式法则。后面的约束广义力会通过虚功得到相同的转置映射结构，但输出端的量具有不同的物理含义。

## 约束接口：速度映射与力的对偶

### 两个粒子为什么有四个输入

设两个二维粒子的位置为 $\mathbf x_a=(a_x,a_y)^{\mathsf T}$、$\mathbf x_b=(b_x,b_y)^{\mathsf T}$，要求距离为静止长度 $\ell_0$。定义

$$
\mathbf d=\mathbf x_b-\mathbf x_a,\quad r=\|\mathbf d\|,\quad
\mathbf n=\mathbf d/r,\quad C=r-\ell_0.
$$

先假设 $r>0$。约束只输出一个误差值，但两个二维位置共有四个输入，按顺序拼接为

$$
\mathbf q=\begin{bmatrix}a_x\\a_y\\b_x\\b_y\end{bmatrix}.
$$

所以该约束的 Jacobian 必须是一行四列。输入维度取决于全部参与计算的自由度，不能因为有两个粒子就写成二。

### 从四个偏导数得到约束行

距离对相对位置的梯度为 $\mathbf n$，平方根的完整求导见[距离约束梯度](/knowledge/calculus-foundations/#一步步求距离约束梯度)。由于相对位置是末端位置减起点位置，各分量分别给出

$$
\frac{\partial C}{\partial a_x}=-n_x,\quad
\frac{\partial C}{\partial a_y}=-n_y,\quad
\frac{\partial C}{\partial b_x}=n_x,\quad
\frac{\partial C}{\partial b_y}=n_y.
$$

按输入顺序排列：

$$
J=\begin{bmatrix}-n_x&-n_y&n_x&n_y\end{bmatrix}.
$$

负号来自几何关系：沿连线正方向移动起点，会减小距离；同向移动末端，会增加距离。整体平移两个端点时，两组贡献抵消。

例如 $\mathbf x_a=(0,0)^{\mathsf T}\,\mathrm m$、$\mathbf x_b=(3,4)^{\mathsf T}\,\mathrm m$、$\ell_0=5\,\mathrm m$，则

$$
C=0,\qquad \mathbf n=\begin{bmatrix}0.6\\0.8\end{bmatrix},\qquad
J=\begin{bmatrix}-0.6&-0.8&0.6&0.8\end{bmatrix}.
$$

约束误差为零，不代表导数也为零；它仍然描述从当前可行位置出发，哪些扰动会改变距离。

### 把位置变化换成时间变化

对位置扰动，$\Delta C\approx J\Delta\mathbf q$；对可微运动轨迹，直接使用链式法则：

$$
\dot C
=\frac{\partial C}{\partial a_x}v_{ax}
+\frac{\partial C}{\partial a_y}v_{ay}
+\frac{\partial C}{\partial b_x}v_{bx}
+\frac{\partial C}{\partial b_y}v_{by}
=J\mathbf v.
$$

其中 $\mathbf v=(v_{ax},v_{ay},v_{bx},v_{by})^{\mathsf T}$，所以

$$
\dot C=\mathbf n^{\mathsf T}(\mathbf v_b-\mathbf v_a).
$$

这是相对速度在连线方向上的投影。在三四五距离例子中，若起点不动、末端沿水平正向以 $1\,\mathrm{m/s}$ 移动，距离增长率是 $0.6\,\mathrm{m/s}$；若末端速度为 $(-0.8,0.6)^{\mathsf T}\,\mathrm{m/s}$，与连线垂直，当前距离变化率为零。

因此时间不变的理想距离约束要求位置满足 $C=0$，可行速度满足 $J\mathbf v=0$。后一个条件只约束瞬时变化率，不能单独修复已有的位置误差。

若约束显式依赖时间，完整式子是 $\dot C=J\dot{\mathbf q}+\partial C/\partial t$。对刚体姿态采用局部旋转增量时，应使用线速度和角速度对应的 Jacobian，不能把任意四元数分量导数直接当成角速度。

### 理想约束反力为什么落在法向空间

用 $\delta\mathbf q$ 表示虚位移：在固定时刻对位置作一个假想的一阶变化。它不代表已经执行的时间步，也不需要乘时间间隔。

在规则等式约束处，允许的虚位移满足

$$
J\delta\mathbf q=0.
$$

理想约束反力的假设是：它对所有这些允许虚位移都不做虚功，即

$$
\mathbf Q_c^{\mathsf T}\delta\mathbf q=0.
$$

例如杆允许端点作切向相对变化，理想轴向反力不对这种变化做功。若还存在干摩擦等切向作用，需要另加模型。

因此 $\mathbf Q_c$ 与所有允许方向垂直。线性代数中，矩阵零空间的正交补等于其转置的值域，于是

$$
\mathbf Q_c=J^{\mathsf T}\boldsymbol\lambda_f.
$$

$\boldsymbol\lambda_f$ 是力层的乘子。这只确定了约束作用所在的方向空间；乘子大小还需要动力学方程、质量与外力共同求出。[拉格朗日乘子的几何推导](/knowledge/calculus-foundations/#约束极值与拉格朗日乘子)使用同样的切向与法向关系，但目标梯度与物理反力具有不同含义。

### 用虚功直接核对转置

把约束空间中的作用量 $\boldsymbol\lambda_f$ 定义为与约束变化 $\delta\mathbf C$ 共轭的量，它在任意试探虚位移上的虚功为

$$
\delta W
=\boldsymbol\lambda_f^{\mathsf T}\delta\mathbf C
=\boldsymbol\lambda_f^{\mathsf T}J\delta\mathbf q
=(J^{\mathsf T}\boldsymbol\lambda_f)^{\mathsf T}\delta\mathbf q.
$$

而广义力定义要求 $\delta W=\mathbf Q_c^{\mathsf T}\delta\mathbf q$。比较任意试探虚位移前的系数，就得到同一个结果。对允许虚位移，$J\delta\mathbf q=0$，该虚功也确实为零。

转置保证同一份功在两套变量下表达一致，并非反转运动映射而取逆。机器人末端作用与关节力矩间的同类推导见 [Modern Robotics 的功率一致性推导](https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-2-statics-of-open-chains/)。

单条距离约束的 $J$ 是一行四列，乘子是标量；$J^{\mathsf T}\lambda_f$ 得到四个自由度上的作用。直接用 $J\lambda_f$ 只会缩放一个行向量，不能在本文列向量约定下得到所需的广义力列向量。

### 一个约束力的数值例子

仍用三四五距离方向，选 $\lambda_f=-10\,\mathrm N$：

$$
\mathbf Q_c=J^{\mathsf T}\lambda_f
=\begin{bmatrix}6\\8\\-6\\-8\end{bmatrix}\,\mathrm N.
$$

粒子 $a$ 受到 $(6,8)^{\mathsf T}\,\mathrm N$，粒子 $b$ 受到相反的力，二者沿连线相互拉近。乘子反号时就是相互推开。

这个例子只验证映射与符号，没有通过动力学求解得到这个特定乘子。实际需要拉力、推力还是单边排斥，由约束类型和状态决定。

### 力、冲量与位置修正需要分别解释

三种常见表达式共享几何转置，但乘子的单位与阶段不同：

$$
\begin{aligned}
\mathbf Q_c&=J^{\mathsf T}\boldsymbol\lambda_f&&\text{连续力层},\\
\Delta\mathbf v&=M^{-1}J^{\mathsf T}\mathbf p&&\text{离散冲量层},\\
\Delta\mathbf q&=M^{-1}J^{\mathsf T}\Delta\boldsymbol\lambda_x&&\text{XPBD 位置修正层}.
\end{aligned}
$$

$M$ 是粒子质量矩阵。在距离约束、SI 单位下，$\lambda_f$ 的单位是牛顿，$p$ 是牛顿秒，$\lambda_x$ 是牛顿秒平方；后两式因此分别得到速度和位移。

XPBD 的力估计还涉及子步长度，例如相应符号约定下写成 $J^{\mathsf T}\lambda_x/h^2$。AVBD 的增广能量梯度则要按自身拉格朗日函数的正负号处理。不同求解层的乘子不能直接互换。

冻结当前 Jacobian 后，有效逆质量为

$$
W=JM^{-1}J^{\mathsf T}.
$$

它把约束冲量映射为约束速度变化；非奇异时其逆才是有效质量。对两粒子距离约束，$W=1/m_a+1/m_b$。材料刚度仍需另通过柔度、能量或目标进入。

### 多约束矩阵与稀疏性

一百个三维粒子的位置输入有三百分量；两百条标量距离约束的误差输出有两百分量。因此

$$
J\in\mathbb R^{200\times300},\quad
\boldsymbol\lambda_f\in\mathbb R^{200},\quad
J^{\mathsf T}\boldsymbol\lambda_f\in\mathbb R^{300}.
$$

每行只在相连两粒子的六个位置分量上可能非零。实现可以直接保存局部块与粒子索引，不必生成完整稠密矩阵。多个约束作用到一个粒子时，广义力贡献相加。

具体接触行、角向力臂、单边投影和缓存见[物理约束](/knowledge/physics_constraints_deep_dive/)，不同位置求解器见[PBD、XPBD、VBD 与 AVBD 对比](/knowledge/pbd-xpbd-vbd-avbd-comparison/)。

### 可复算的约束行

以下二维算例直接生成本文的距离约束行。位置与静止长度按米输入；退化阈值只用于本例的拒绝策略。

~~~js
// knowledge-jacobian-constraint-example
export function distanceRow(a, b, rest = 5) {
  const valid = q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite);
  if (!valid(a) || !valid(b) || !Number.isFinite(rest) || rest <= 0) throw new Error('invalid input');
  const d = b.map((value, i) => value-a[i]);
  const length = Math.hypot(...d);
  if (!Number.isFinite(length) || length <= 1e-12) throw new Error('degenerate distance');
  const n = d.map(value => value/length);
  return { C: length-rest, J: [-n[0], -n[1], n[0], n[1]] };
}
export function transposeAction(row, multiplier) {
  if (!Array.isArray(row) || !row.length || !row.every(Number.isFinite) ||
      !Number.isFinite(multiplier)) throw new Error('invalid input');
  return row.map(value => value*multiplier);
}
~~~

## 几何意义

### 局部坐标变换：小圆变椭圆

线性映射 $u=2x,v=3y$ 的 Jacobian 是

$$
J=\begin{bmatrix}2&0\\0&3\end{bmatrix}.
$$

它把横向小位移放大两倍、纵向放大三倍；输入平面中的小圆经这个映射变成椭圆。非线性映射也能在一个足够小的邻域内，用当前位置的 Jacobian 描述这种变化。

一般矩阵还可以产生旋转、剪切或压扁。若矩阵降秩，小圆的像可能退化为线段或点；不是每个 Jacobian 都构成可逆的坐标变换。

### 雅可比行列式：面积/体积缩放因子

输入与输出维度相等时，$\det J$ 的绝对值给出线性化映射的面积或体积缩放因子：

- 绝对值大于一表示局部放大，小于一表示局部缩小。
- 绝对值等于一表示保面积或保体积，不能由此认定是纯旋转。例如横向放大两倍、纵向缩小一半也保面积。
- 行列式为零表示导数矩阵奇异。它不能提供可微的局部逆；原非线性函数是否仍有某种逆，需要另行分析。例如一元函数 $x^3$ 在零点导数为零，却仍是单调可逆函数。

极坐标换元 $x=r\cos\theta,y=r\sin\theta$ 的 Jacobian 为

$$
J=\begin{bmatrix}\cos\theta&-r\sin\theta\\\sin\theta&r\cos\theta\end{bmatrix},
\qquad \det J=r.
$$

因此 $r>0$ 时，面积元为 $dx\,dy=r\,dr\,d\theta$。改变变量时，既要改变函数表达式，也要改变面积或体积的度量。

### SVD、速度椭球与可操作度

奇异值分解把 Jacobian 写为

$$
J=U\Sigma V^{\mathsf T}.
$$

它可理解为先改变输入方向基底，再沿各方向缩放，最后改变输出方向基底。奇异值是这些缩放尺度，可以包含零。

对机械臂，输入关节速度的单位球，经 $J$ 映射成任务空间中的速度椭球；左奇异向量给出输出主轴方向，相应奇异值给出轴长。若某个原本可达的方向尺度趋近零，反求该方向速度就可能需要很大的关节速度。几何解释见 [Modern Robotics 可操作度](https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-4-manipulability/)。

对于 $m$ 维任务且 $m\le n$，常见可操作度量为

$$
w=\sqrt{\det(JJ^{\mathsf T})}.
$$

满行秩时，它等于全部 $m$ 个奇异值的乘积；不满行秩时为零，不能只把非零奇异值相乘后仍声称得到这个行列式度量。若任务维度大于关节数，这个完整任务体积度量恒为零，需要根据可达子空间选择指标。

可操作度依赖输入、输出的尺度。混合位置与角度、线速度与角速度时，应先定义任务度量；数值更大不直接表示更省能量或更安全。

### 奇异点

机械臂奇异性通常指 Jacobian 相对该机构可达到的最大秩发生下降。例如平面二连杆完全伸直时，两个关节的一阶末端响应可能变得共线，失去一个独立运动方向。

方阵可以通过行列式判断奇异，非方阵应检查秩或奇异值。某方向不可达时，求解器可能留下残差；接近奇异时，要求维持某个固定末端速度可能放大关节速度。不能把所有奇异情况都概括为速度必然无穷。见 [Modern Robotics 奇异性](https://modernrobotics.northwestern.edu/nu-gm-book-resource/5-3-singularities/)。

## 逆问题：IK 求解的核心

### 正向与逆向

正向映射已知关节速度，计算末端速度：

$$
\mathbf v=J(\mathbf q)\dot{\mathbf q}.
$$

逆问题给定期望末端速度 $\mathbf v_*$，寻找关节速度，使 $J\dot{\mathbf q}$ 尽量接近目标。若改用位置误差，则是在当前线性化下寻找一个小位置修正；执行后通常要重算 Jacobian。

不同方法处理可达性、欠定性、奇异尺度与正则化的方式不同。以下公式解释一般局部 IK，不据此声称某个 UE 节点已经采用它们。

### 方阵线性求解

当输入输出维度相同且矩阵非奇异时，求解

$$
J\dot{\mathbf q}=\mathbf v_*.
$$

公式上可以写成 $\dot{\mathbf q}=J^{-1}\mathbf v_*$，实现应使用合适的线性求解器。接近奇异时，需要检查条件数、解的大小和任务残差，不能只确认程序没有报告除零。

### 伪逆（Moore-Penrose）

一般矩阵可以通过 SVD 构造伪逆：

$$
J^+=V\Sigma^+U^{\mathsf T},\qquad
\dot{\mathbf q}=J^+\mathbf v_*.
$$

非零奇异值取倒数，零奇异值对应项取零。它给出线性最小二乘解中欧氏范数最小的一个；目标可达时，就是所有精确解中范数最小的一个。实际数值实现需要明确奇异值截断阈值。

只有满行秩时，才可以使用

$$
J^+=J^{\mathsf T}(JJ^{\mathsf T})^{-1}.
$$

“关节比任务多”本身不保证满行秩。最小关节速度范数也不自动意味着最小能量、避障或满足关节限位；这些需要额外目标与约束。

### 阻尼最小二乘 DLS

给定正则尺度 $\mu>0$，求解

$$
\min_{\dot{\mathbf q}}\;
\tfrac12\|J\dot{\mathbf q}-\mathbf v_*\|^2+
\tfrac{\mu^2}{2}\|\dot{\mathbf q}\|^2.
$$

第一项要求跟随任务，第二项抑制过大的关节速度。其解可以组织为

$$
(JJ^{\mathsf T}+\mu^2I)\mathbf z=\mathbf v_*,
\qquad \dot{\mathbf q}=J^{\mathsf T}\mathbf z.
$$

这里的 $\mu$ 是正则参数，不是前面的约束力乘子。它将奇异方向上的逆增益从 $1/\sigma$ 改为 $\sigma/(\sigma^2+\mu^2)$，使固定正则下的局部线性解有界；完整非线性迭代仍要考虑步长、限位和任务可达性。

增大正则一般会牺牲跟踪精度。选择应结合变量尺度、允许速度和残差，不能只寻找一个对所有角色都通用的常数。

### 雅可比转置法与步长

若希望当前末端位置 $\mathbf F(\mathbf q)$ 接近期望位置 $\mathbf x_*$，定义

$$
\mathbf e=\mathbf x_*-\mathbf F(\mathbf q),\qquad
E(\mathbf q)=\tfrac12\|\mathbf F(\mathbf q)-\mathbf x_*\|^2.
$$

按链式法则，能量梯度是

$$
\nabla E=J^{\mathsf T}(\mathbf F-\mathbf x_*)=-J^{\mathsf T}\mathbf e.
$$

所以沿负梯度更新得到

$$
\Delta\mathbf q=\eta J^{\mathsf T}\mathbf e=-\eta\nabla E.
$$

这里正号来自误差定义，不能把 $J^{\mathsf T}\mathbf e$ 又标成同一能量的正梯度。它只需要矩阵向量乘法，但下降仍依赖步长。

例如一维映射 $F(q)=2q$、目标为零，误差能量为 $E=2q^2$。从 $q=1$ 取 $\eta=1$，更新得到 $q=-3$，能量由 $2$ 增大到 $18$。因此无需矩阵求逆不代表天然稳定。

伪逆怎样参与逐轮更新，可对照 [Modern Robotics 数值 IK](https://modernrobotics.northwestern.edu/nu-gm-book-resource/6-2-numerical-inverse-kinematics-part-1-of-2/)。方法选择需要结合误差、预算、限位与奇异状态，不存在脱离任务的统一排名。

## 运动学中的 Jacobian

设关节输入为 $\mathbf q$，末端位置为 $\mathbf x=\mathbf F(\mathbf q)$，则

$$
\dot{\mathbf x}=J(\mathbf q)\dot{\mathbf q}.
$$

某一列表示只让对应关节以单位参数速度运动时，末端产生的一阶速度响应。关节为转动关节或移动关节时，该列的单位也不同。

这套导数语言可用于一般 IK，但 IK 还存在几何、解析、CCD、FABRIK 等不同路线，不能把所有末端定位都归结为显式 Jacobian 求逆。本站的具体数学与源码分析见[全身 IK](/knowledge/ue-fullbody-ik-math/)，具体实现应以对应版本源码为准。

## 控制与飞控中的 Jacobian

### 状态空间线性化

对连续状态方程 $\dot{\mathbf x}=\mathbf f(\mathbf x,\mathbf u)$，在工作点附近有

$$
\mathbf f(\mathbf x_0+\delta\mathbf x,\mathbf u_0+\delta\mathbf u)
\approx \mathbf f(\mathbf x_0,\mathbf u_0)+A\delta\mathbf x+B\delta\mathbf u,
$$

$$
A=\left.\frac{\partial\mathbf f}{\partial\mathbf x}\right|_0,\qquad
B=\left.\frac{\partial\mathbf f}{\partial\mathbf u}\right|_0.
$$

若参考状态是满足原方程的轨迹，减去参考轨迹的导数后得到 $\delta\dot{\mathbf x}\approx A\delta\mathbf x+B\delta\mathbf u$；平衡点是其中的特殊情况。任意工作点不能无条件丢掉常量项。

$A$ 表示状态扰动怎样影响状态变化率，$B$ 表示控制输入扰动怎样影响它。控制器或估计器还需代价、噪声和观测模型等信息；Jacobian 只是局部模型的一部分。涉及姿态时，要明确采用什么局部误差参数。

### 多旋翼混控：控制分配矩阵

把四个旋翼推力写成 $\mathbf u=(T_1,T_2,T_3,T_4)^{\mathsf T}$，机体合力与力矩组成输出 $\mathbf W$。局部关系为

$$
\Delta\mathbf W\approx J\Delta\mathbf u,\qquad
J=\frac{\partial\mathbf W}{\partial\mathbf u}.
$$

它正向描述各执行器变化会产生什么合力与力矩。固定布局、固定推力方向且输入直接采用推力时，这个映射可以是常系数线性的；若输入是转速或还包含倾转角，就要按实际映射求导。

给定期望合力再反求执行器输入，是另一个带饱和、可达性和优先级的控制分配问题。四个标量推力输入通常无法独立指定任意六维合力旋量；矩阵存在不代表所有期望输出都可实现。具体飞控模型见[无人机动力学与飞行控制](/knowledge/quadcopter-flight-control-math/)。

## 反向传播中的 Jacobian

考虑一层列向量映射 $\mathbf z'=\sigma(W\mathbf z+\mathbf b)$，激活函数逐分量作用。记

$$
D=\operatorname{diag}\!\left(\sigma'(W\mathbf z+\mathbf b)\right),\qquad J=DW.
$$

若已知输出端的损失梯度 $\mathbf g'=\nabla_{\mathbf z'}L$，输入端梯度为

$$
\mathbf g=\nabla_{\mathbf z}L=J^{\mathsf T}\mathbf g'
=W^{\mathsf T}D\mathbf g'
=W^{\mathsf T}\left(\sigma'(W\mathbf z+\mathbf b)\odot\mathbf g'\right).
$$

$\odot$ 是逐分量乘法。这里始终采用列梯度，没有把行形式的导数与列形式的反向传播混在同一个等式中。反向模式可以直接计算这种转置乘积，不必构造完整的巨大 Jacobian。

它与前面的能量链式法则共享数学结构，梯度的含义仍取决于具体损失和变量，不能把梯度、力与冲量直接当成同一种量。

## 数值雅可比 vs 解析雅可比

解析求导应用求导规则获得公式；有限差分通过附近函数值估计导数。对第 $j$ 个输入，前向差分为

$$
J_{ij}\approx\frac{F_i(\mathbf q+h\mathbf e_j)-F_i(\mathbf q)}h,
$$

其中 $\mathbf e_j$ 是该坐标的单位基向量。它需要基准函数值以及每个输入方向的一次扰动采样。中心差分改为

$$
J_{ij}\approx\frac{F_i(\mathbf q+h\mathbf e_j)-F_i(\mathbf q-h\mathbf e_j)}{2h}.
$$

足够光滑且忽略舍入误差时，二者截断误差通常分别是一阶和二阶；步长过小还可能损失精度。解析公式也会出现推导、实现和浮点误差，因此仍应核对导数，不能简单标为无误差。

自动微分则沿计算图组合局部导数，属于另一种方法。它不靠有限扰动采样，也不会替错误模型补上正确物理。正文两段可执行算例由文档审计直接提取，分别检查一阶预测余项、有限差分和虚功映射。

## 统一视角与总结

### 不同系统中的导数映射

运动学中，输入是关节变量、输出是末端状态；控制线性化中，输入是状态或控制、输出是状态变化率；约束中，输入是物理自由度、输出是约束误差。它们都先定义输入输出，再对当前映射求导。

相同的字母 $J$ 不代表相同的尺寸、单位或物理对象。转置、伪逆与有效逆质量也不能混作同一种求逆操作。

### 导数映射的含义

对一个已明确变量的可微映射，核心关系是

$$
\Delta\mathbf F\approx J\Delta\mathbf q.
$$

对与输出变化共轭的作用或梯度，转置给出输入端对应量；要反求输入修正，则需要另选线性求解、最小二乘或优化方法。先说明正在做哪一种操作，再解释矩阵的作用。

- [微分基础](/knowledge/calculus-foundations/)负责导数、梯度和约束极值的来由。
- [Hessian](/knowledge/hessian-matrix/)继续解释曲率与 Newton 方法。
- [物理约束](/knowledge/physics_constraints_deep_dive/)负责约束行如何参与动力学求解。
- [线性迭代](/knowledge/iterative-linear-solvers/)负责冻结线性子问题的残差与迭代条件。
