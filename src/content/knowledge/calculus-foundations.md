---
title: 微分基础：从导数到梯度与物理求解
excerpt: 从变化率与局部近似出发，逐步推导偏导数、梯度及其在约束、弹性能量与物理求解中的作用。
date: '2026-09-06'
category: Mathematics
subtopic: Calculus
tags: [微积分, 导数, 偏导数, 梯度, 物理求解]
readTime: 阅读约75分钟
kind: theory
level: foundation
pageType: guide
aliases:
  - 工程微积分：变化率、累积与局部近似
  - 微积分详解 — 从极限到微分、积分与向量微积分
prerequisites: []
nextArticles: [differential-equations, jacobian-matrix]
related: [hessian-matrix, pbd-xpbd-math, vbd-avbd-math, pbd-xpbd-vbd-avbd-comparison]
topics:
  - id: ue-chaos-physics
    stage: foundation
    role: theory
    order: 10
sources:
  - title: OpenStax Calculus Volume 1 — Defining the Derivative
    url: https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative
  - title: OpenStax Calculus Volume 3 — Partial Derivatives
    url: https://openstax.org/books/calculus-volume-3/pages/4-3-partial-derivatives
  - title: OpenStax Calculus Volume 3 — Tangent Planes and Linear Approximations
    url: https://openstax.org/books/calculus-volume-3/pages/4-4-tangent-planes-and-linear-approximations
  - title: OpenStax Calculus Volume 3 — The Chain Rule
    url: https://openstax.org/books/calculus-volume-3/pages/4-5-the-chain-rule
  - title: OpenStax Calculus Volume 3 — Directional Derivatives and the Gradient
    url: https://openstax.org/books/calculus-volume-3/pages/4-6-directional-derivatives-and-the-gradient
  - title: OpenStax Calculus Volume 3 — Lagrange Multipliers
    url: https://openstax.org/books/calculus-volume-3/pages/4-8-lagrange-multipliers
  - title: OpenStax Calculus Volume 1 — The Fundamental Theorem of Calculus
    url: https://openstax.org/books/calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus
  - title: OpenStax Calculus Volume 3 — Conservative Vector Fields
    url: https://openstax.org/books/calculus-volume-3/pages/6-3-conservative-vector-fields
---

导数回答“输入稍微变化，输出会怎样变化”；偏导数把这个问题分解到各个输入；梯度把这些信息合在一起，用来预测任意小位移造成的标量变化。物理中的约束修正、弹性力和能量最小化，都建立在这条关系上。

本文从函数和变化量开始，不预设读者已经理解微积分。先用抛物线理解一个输入的变化，再用二维椭圆碗理解多个输入；接着在单位圆上寻找极值，解释约束与拉格朗日乘子，最后用双粒子弹簧连接物理求解。数学算例先采用无量纲变量，弹簧部分再明确物理单位。

积分、三角函数与向量场的既有内容整理在文末附录，按需查阅。Jacobian、Hessian 和四种位置求解方法的完整技术展开，分别链接对应主文。

## 函数、变量与变化量

### 输入与输出

函数是一条确定的对应规则：给定允许的输入，就得到唯一的输出。例如

$$
f(x)=x^2
$$

表示把输入平方。输入为 $2$ 时，输出为 $4$；输入为 $-2$ 时，输出仍为 $4$。不同输入可以有相同输出，“唯一”指的是同一输入不能同时对应两个不同结果。

输入通常称为自变量，输出称为因变量。允许的输入范围称为定义域。例如实数范围内的 $\sqrt{x}$ 要求 $x\ge0$；计算导数时也要先确认附近的输入仍在定义域内。

### 标量、向量与函数的维度

标量是一个数，例如时间、质量和能量。向量由一组分量组成，例如三维位置

$$
\mathbf{x}=\begin{bmatrix}x\\y\\z\end{bmatrix}.
$$

全文向量默认竖着写成列向量。先通过几个具体对象区分输入与输出：

- 输入时间，输出一个位置分量，是一个输入、一个输出。
- 输入时间，输出三维位置，是一个输入、三个输出分量。
- 输入地面横纵坐标，输出地形高度，是两个输入、一个输出。
- 输入两个三维粒子的位置，输出弹簧势能，是六个输入分量、一个输出。

一元与多元描述输入；标量输出与向量输出描述输出。一个多元函数完全可以只输出一个数，势能就是这种情况。

### 函数值与函数变化量

在当前位置 $x$ 施加输入变化量 $\Delta x$，新位置为 $x+\Delta x$，输出变化量定义为

$$
\Delta f=f(x+\Delta x)-f(x).
$$

例如 $f(x)=x^2$，从 $x=1$ 走到 $1.1$：

$$
\Delta x=0.1,\qquad \Delta f=1.1^2-1=0.21.
$$

这里的 $f(x)$、$\Delta f$ 和 $\Delta x$ 不能互相替代。后面求导，就是研究它们之间的局部比例关系。

## 从平均变化率到导数

### 平均变化率与割线

输入变化量不为零时，平均变化率是

$$
\frac{\Delta f}{\Delta x}=\frac{f(x+\Delta x)-f(x)}{\Delta x}.
$$

对抛物线 $f(x)=x^2$，在 $x=1$ 附近计算：

$$
\begin{aligned}
\Delta x=1&:\quad \frac{\Delta f}{\Delta x}=3,\\
\Delta x=0.1&:\quad \frac{\Delta f}{\Delta x}=2.1,\\
\Delta x=0.01&:\quad \frac{\Delta f}{\Delta x}=2.01.
\end{aligned}
$$

在图上，连接两个采样点的直线叫割线；这个比值就是割线斜率。它描述整段区间的变化，尚未说明起点那一瞬间的变化率。

### 极限与导数定义

不断缩小非零的 $\Delta x$。如果平均变化率从两侧趋近同一个有限数，就把它定义为该点的导数：

$$
f'(x)=\lim_{\Delta x\to0}\frac{f(x+\Delta x)-f(x)}{\Delta x}.
$$

极限不是把分母直接设置为零；它研究的是分母还没有变成零时，比值趋向哪里。图上，对应割线趋近该点的切线。

现在从定义推导平方函数，而不是直接记结论：

$$
\frac{(x+\Delta x)^2-x^2}{\Delta x}
=\frac{2x\Delta x+(\Delta x)^2}{\Delta x}
=2x+\Delta x.
$$

当 $\Delta x\to0$，得到

$$
f'(x)=2x,\qquad f'(1)=2.
$$

$f'(1)$ 是一个点的数值，$f'(x)$ 则是一个新函数：输入不同位置，就得到不同位置的局部变化率。[导数的教材定义与几何解释](https://openstax.org/books/calculus-volume-1/pages/3-1-defining-the-derivative)可作对照。

<div data-demo="calculus-secant">交互图加载前：平方函数在横坐标 1 处的切线斜率是 2；另一个点的横坐标依次取 2、1.1、1.01，割线斜率分别为 3、2.1、2.01。</div>

图中可以拖动两个采样点，也可以用滑块改变位置。两点重合时，差商本身未定义；此时只显示解析切线，不把除零结果当成导数。

### 导数的符号、大小与单位

在某点导数为正，表示沿输入增大的方向，小范围内输出倾向增加；导数为负则倾向减少。绝对值越大，相同的小输入变化通常带来越大的输出变化。这里比较的是同一变量、相同单位下的局部响应。

导数也有单位：位置对时间的导数是速度，单位为 $\mathrm{m/s}$；能量对长度的导数单位为 $\mathrm{J/m}=\mathrm N$。改变输入单位会改变导数数值，因此不能脱离变量尺度比较“哪个梯度更大”。

### 导数不存在的情况

对 $f(x)=|x|$，原点左侧斜率为 $-1$，右侧为 $1$，没有唯一的两侧导数。跳跃处连连续性都不满足，更不可能有普通导数。某些函数还可能出现无穷斜率，此时不存在有限导数。

接触启用、摩擦状态切换、钳制和分段材料模型都可能包含非光滑点。程序能返回一个分支的数值，不等于该处存在通常意义的导数。

## 导数怎样描述运动

### 从位置到速度与加速度

一维运动写成位置函数 $x(t)$，则

$$
v(t)=\frac{dx}{dt},\qquad
a(t)=\frac{dv}{dt}=\frac{d^2x}{dt^2}.
$$

例如按 SI 单位，令

$$
x(t)=x_0+v_0t+\tfrac12a_0t^2.
$$

对时间求导，常量位置项消失，得到 $v(t)=v_0+a_0t$；再求一次导数得到 $a(t)=a_0$。导数回答“这个物理量每单位时间变化多少”。

在某段时间内，用两帧位置相减再除以间隔，得到平均速度；只有在相应光滑条件下，时间间隔趋于零才得到瞬时速度。离散求解器的速度更新是近似或离散定义，需要与连续函数区分。

### 空间轨迹与时间曲线

三维位置函数逐分量求导：

$$
\mathbf{v}(t)=
\begin{bmatrix}\dot x(t)\\\dot y(t)\\\dot z(t)\end{bmatrix},\qquad
\mathbf{a}(t)=\dot{\mathbf{v}}(t).
$$

点号表示对时间求导。速度非零时，$\mathbf{v}$ 沿空间轨迹的切线方向，速率是 $\|\mathbf{v}\|$。时间—位置图上切线的斜率，和世界空间轨迹里的方向，不是同一张图中的量。

还要分清“对谁求导”。地形 $h(x,y)$ 对 $x$ 求导得到空间坡度；角色沿 $x(t),y(t)$ 行进时，高度对时间的导数还要考虑行进速度。这会在多元链式法则中自然出现。

## 如何计算导数

### 基本求导规则

以下 $c$ 是常量，三角函数的输入采用弧度；幂函数公式在函数及导数有定义的区间使用：

$$
\begin{aligned}
\frac{d}{dx}c&=0,&\frac{d}{dx}x^p&=px^{p-1},\\
\frac{d}{dx}e^x&=e^x,&\frac{d}{dx}\ln x&=\frac1x\quad(x>0),\\
\frac{d}{dx}\sin x&=\cos x,&\frac{d}{dx}\cos x&=-\sin x.
\end{aligned}
$$

常量的导数为零，因为输入改变时常量不变；幂函数公式则是平方函数推导的推广。不要把它误用到指数也随输入变化的表达式，例如 $x^x$。

对可导函数 $u(x),v(x)$，

$$
\begin{aligned}
(u+v)'&=u'+v',\\
(cu)'&=cu',\\
(uv)'&=u'v+uv',\\
\left(\frac uv\right)'&=\frac{u'v-uv'}{v^2}\quad(v\ne0).
\end{aligned}
$$

乘积不能只把两边分别求导再相乘，因为输入变化会同时影响两个因子。展开小变化量后保留一阶项，才会得到上面的两个贡献。

### 链式法则：变化逐层传递

设中间变量 $u=g(x)$，最终输出 $f=F(u)$。输入改变先影响 $u$，再由 $u$ 影响 $f$，因此

$$
\frac{df}{dx}=\frac{dF}{du}\frac{dg}{dx}.
$$

例如 $f(x)=(x^2+1)^3$：外层对输入求导得到 $3(x^2+1)^2$，内层导数为 $2x$，所以

$$
f'(x)=6x(x^2+1)^2.
$$

这个写法看起来像约分，但首先是一条在可微条件下成立的定理；多元情况需要矩阵和求和，不能只按分数字面取消符号。

### 弹簧能量的一元预告

令 $q$ 表示沿弹簧轴向的有符号伸长量，刚度 $k$ 为常量，势能为

$$
U(q)=\tfrac12kq^2,\qquad \frac{dU}{dq}=kq.
$$

如果伸长量本身依赖位置 $q=q(x)$，还需要再乘一层：

$$
\frac{dU}{dx}=kq\frac{dq}{dx}.
$$

漏掉最后一个导数，就只得到能量对“伸长”的变化率，没有得到能量对“位置”的变化率。稍后会把它推广到两个三维粒子。

距离与平方距离也必须分清。$r(x)=\sqrt{x^2}$ 在非零处的导数是 $x/|x|$，而 $x^2$ 的导数为 $2x$；两者既不是相同数值，也不是相同单位。

## 微分与局部线性近似

### 导数是比例，微分是线性变化

若函数在 $x$ 可导，对小输入扰动 $s$，可以写成

$$
f(x+s)=f(x)+f'(x)s+r(s),\qquad
\lim_{s\to0}\frac{|r(s)|}{|s|}=0.
$$

最后的 $r(s)$ 是近似误差；它相对于输入扰动趋于更快地消失。这就是“小范围内能用直线代替曲线”的精确定义。

规定一个输入微分 $dx=s$，对应输出微分定义为

$$
df=f'(x)\,dx.
$$

真实变化量是 $\Delta f=f(x+s)-f(x)$；微分 $df$ 是它的一阶线性部分。它们一般不相等。这里不需要把 $dx$ 理解为某个计算机能够存储的“无限小数”。

### 平方函数的误差能精确写出来

对 $f(x)=x^2$，

$$
(x+s)^2=x^2+2xs+s^2.
$$

在 $x=1,s=0.1$ 时，一阶预测是 $df=0.2$，真实变化是 $0.21$，误差为 $0.01$。把扰动减半，误差变为原来的四分之一，因为这个例子的误差恰好是 $s^2$。

一般可微函数只保证余项相对 $|s|$ 消失；要得到统一的二阶误差界，还需要更强的光滑性条件。不要把某个多项式的误差阶直接推广到所有可微函数。

### 为什么非线性求解通常需要迭代

如果要使 $f(x)=0$，可用当前直线模型求候选修正：

$$
f(x)+f'(x)s=0
\quad\Longrightarrow\quad
s=-\frac{f(x)}{f'(x)}.
$$

当分母非零时，这就是一元 Newton 求根的候选步。走到新位置后，原曲线与旧切线可能已经明显不同，通常需要重新计算。导数为零、初值差或步长过大时，它也可能失败；局部近似不是一次解决全局问题的保证。

## 多元函数与偏导数

### 固定其他输入，只沿一个方向观察

考虑椭圆碗

$$
f(x,y)=x^2+2y^2.
$$

先固定 $y=1$，函数变成 $f(x,1)=x^2+2$。常数项 $2$ 不随 $x$ 改变，沿这条曲线求导得到 $2x$。把固定值换成任意 $y$，$2y^2$ 仍然是相对于 $x$ 的常数，因此

$$
\frac{\partial f}{\partial x}
=\frac{\partial}{\partial x}(x^2)+\frac{\partial}{\partial x}(2y^2)
=2x+0=2x.
$$

这就是偏导数（Partial Derivative）：暂时固定其他输入，只沿一个输入方向计算变化率。从极限定义也可以逐项验证：

$$
\frac{\partial f}{\partial x}
=\lim_{s\to0}\frac{(x+s)^2+2y^2-(x^2+2y^2)}s
=\lim_{s\to0}(2x+s)=2x.
$$

再对 $y$ 求偏导。这次 $x^2$ 是常数，而 $2y^2$ 的导数为 $4y$：

$$
\frac{\partial f}{\partial y}
=\frac{\partial}{\partial y}(x^2)+\frac{\partial}{\partial y}(2y^2)
=0+4y=4y.
$$

符号 $\partial$ 提醒我们：输入不止一个，此次只改变其中一个。几何上，两条偏导数分别来自沿坐标方向切开曲面的截线。[偏导数的定义与截面解释](https://openstax.org/books/calculus-volume-3/pages/4-3-partial-derivatives)给出了对应教材表述。

在 $(1,1)$ 处，两个偏导分别为 $2$ 和 $4$。这表示沿正 $x$ 与正 $y$ 各移动相同的小距离时，后者带来的函数增加量约为前者的两倍；它没有说沿其他方向的变化必须等于其中某一个。

### 独立输入与沿路径变化

偏导数固定其他坐标，是对函数本身的局部提问。实际运动时，两个输入可能一起变化。

令 $x(t)=t,y(t)=t$，沿这条路径有 $f(t,t)=3t^2$，所以

$$
\frac{d}{dt}f(x(t),y(t))=6t.
$$

而在同一个位置，$\partial f/\partial x=2t$。二者不同，因为前者同时包含 $y$ 的变化。完整关系是

$$
\frac{df}{dt}
=\frac{\partial f}{\partial x}\frac{dx}{dt}
+\frac{\partial f}{\partial y}\frac{dy}{dt}.
$$

对地形高度求时间导数同样如此：坡度还要乘上行进速度。更一般的依赖传播见[多元链式法则](https://openstax.org/books/calculus-volume-3/pages/4-5-the-chain-rule)。

## 全微分、方向导数与梯度

### 多个输入同时变化

现在两个输入同时改变：在 $(1,1)$ 处，横向改变 $0.1$，纵向也改变 $0.1$。横向的一阶贡献是 $2\times0.1=0.2$，纵向的一阶贡献是 $4\times0.1=0.4$，相加得到 $0.6$。

为什么可以相加？因为局部线性模型把各个输入的影响分别计算，再叠加。对这里的光滑函数，任意小扰动 $(s_x,s_y)$ 满足

$$
f(x+s_x,y+s_y)
\approx f(x,y)+f_xs_x+f_ys_y.
$$

$f_x,f_y$ 是偏导数的简写，均在当前点取值。全微分把这两个线性贡献相加：

$$
df=f_x\,dx+f_y\,dy.
$$

对椭圆碗，在 $(1,1)$ 施加 $(0.1,0.1)$ 的扰动，线性预测为 $0.6$，真实变化为 $0.63$；差额来自 $s_x^2+2s_y^2$。这正是一元线性近似的多输入推广。[切平面与全微分](https://openstax.org/books/calculus-volume-3/pages/4-4-tangent-planes-and-linear-approximations)讨论了这种模型成立的条件。

### 梯度把偏导数组合起来

我们已经算出两个偏导数：$2x$ 与 $4y$。它们分别回答两个坐标方向的问题。为了同时保存这两条信息，把它们按输入顺序排列为列向量：

$$
\nabla f(x,y)=\begin{bmatrix}2x\\4y\end{bmatrix}.
$$

这个向量叫梯度（Gradient）。$\nabla$ 读作 nabla；在这里，它表示对标量函数的各个输入分别求偏导并组成向量。在 $(1,1)$ 处，梯度为 $(2,4)^{\mathsf T}$：第一个分量是横向变化率，第二个分量是纵向变化率。

现在回到全微分，把一次普通乘法展开：

$$
df=2\,dx+4\,dy
=\begin{bmatrix}2&4\end{bmatrix}
\begin{bmatrix}dx\\dy\end{bmatrix}.
$$

这个“对应分量相乘后相加”的运算就是内积。上标 $\mathsf T$ 表示转置，把梯度列向量转为行向量后，得到

$$
df=\nabla f^{\mathsf T}d\mathbf{x}.
$$

所以把偏导数组成向量的用途已经明确：给定实际位移的各个分量，就能用一次内积预测标量输出的一阶变化。最后再推广到 $n$ 个输入；$\mathbb R^n$ 表示由 $n$ 个实数分量组成的空间，梯度写成

$$
\nabla f=
\begin{bmatrix}
\partial f/\partial x_1\\\vdots\\\partial f/\partial x_n
\end{bmatrix}.
$$

注意梯度生活在输入空间中。地形高度函数的二维梯度位于水平参数平面，不是高度曲面的三维法线；三维曲面法线可由 $(-h_x,-h_y,1)$ 归一化得到。

### 方向导数是指定方向上的变化率

有了梯度，现在可以回答“如果斜着走，会怎样”。先把移动分成方向与距离：单位向量 $\mathbf{u}$ 满足 $\|\mathbf{u}\|=1$，只表示方向；沿它移动距离 $s$，位移就是 $s\mathbf{u}$。

代入一阶模型，得到

$$
\Delta f\approx\nabla f^{\mathsf T}(s\mathbf{u})
=s(\nabla f^{\mathsf T}\mathbf{u}).
$$

再除以移动距离 $s$ 并取极限，就得到方向导数：

$$
D_{\mathbf{u}}f(\mathbf{x})
=\lim_{s\to0}\frac{f(\mathbf{x}+s\mathbf{u})-f(\mathbf{x})}{s}
=\nabla f^{\mathsf T}\mathbf{u}.
$$

最后一个等号要求函数在该点可微。对非单位向量也能计算路径导数，但其大小还包含参数化速度，不能再直接解释为“每单位移动距离”的变化率。

仍在 $(1,1)$，先选几个可以直接核对的单位方向：

$$
\begin{aligned}
\mathbf{u}=(1,0)^{\mathsf T}&:\quad D_{\mathbf u}f=2,\\
\mathbf{u}=(0,1)^{\mathsf T}&:\quad D_{\mathbf u}f=4,\\
\mathbf{u}=\frac{(2,4)^{\mathsf T}}{\sqrt{20}}
&:\quad D_{\mathbf u}f=\frac{2\times2+4\times4}{\sqrt{20}}=\sqrt{20}.
\end{aligned}
$$

前两个方向就是偏导数；第三个方向是梯度归一化后的方向，变化率约为 $4.472$。如果把第三个方向反过来，变化率变成 $-\sqrt{20}$。因此梯度长度描述局部最大的每单位距离增长率，不是当前函数值。

再沿 $\mathbf{u}=(1,-1)^{\mathsf T}/\sqrt2$ 行进：

$$
D_{\mathbf{u}}f=\frac{2-4}{\sqrt2}=-\sqrt2.
$$

函数会局部下降，因为负 $y$ 方向带来的下降超过正 $x$ 方向带来的增加。

### 为什么梯度指向增长最快的方向

在欧氏距离度量下，内积可以写为

$$
\nabla f^{\mathsf T}\mathbf{u}
=\|\nabla f\|\cos\theta.
$$

$\theta$ 是二者的夹角。在所有单位方向中，$\cos\theta=1$ 时变化率最大；所以非零梯度的方向是局部最速上升方向，负梯度方向是局部最速下降方向。[方向导数与梯度](https://openstax.org/books/calculus-volume-3/pages/4-6-directional-derivatives-and-the-gradient)包含这一几何关系。

这一结论固定了“相同长度”的定义。若混合米、弧度和其他尺度，或者采用质量加权距离，最速方向会随度量改变。物理求解中的质量矩阵和预条件，正是在处理这种方向与尺度问题。

<div data-demo="calculus-gradient">交互图加载前：椭圆碗在坐标 (1, 1) 处的梯度分量为 (2, 4)。沿水平正向的变化率是 2，沿竖直正向是 4；沿梯度单位方向的变化率约为 4.472。</div>

拖动观察点或改变移动方向，对比梯度、所选单位方向和方向导数。箭头按统一比例缩放以保持图内可见，具体数值以读数为准；等高线不是三维透视图。

### 等值面、驻点与步长

等值线上的点满足 $f(\mathbf{x})=c$。例如椭圆碗通过 $(1,1)$ 的等值线满足 $x^2+2y^2=3$。在这个点，方向 $(2,-1)^{\mathsf T}$ 与梯度 $(2,4)^{\mathsf T}$ 的内积为零：横向增长与纵向下降的一阶贡献恰好抵消。

一般地，沿等值线的切线方向 $\mathbf{t}$ 运动，函数一阶变化为零，因此

$$
\nabla f^{\mathsf T}\mathbf{t}=0.
$$

在可微且梯度非零的规则点，梯度垂直于等值线或等值面。梯度为零时，这个式子对所有方向都成立，无法据此选出唯一法线。

梯度为零的点叫驻点。它可能是最小值，也可能是最大值或鞍点；例如 $-x^2$ 在原点是最大值，而 $x^2-y^2$ 在原点是鞍点。

即使当前负梯度是下降方向，也不代表沿它走任意远都会下降。对 $f(x)=x^2$，在 $x=1$ 用 $x_{\mathrm{new}}=x-\eta f'(x)$：取 $\eta=0.1$ 得到 $0.8$，函数下降；取 $\eta=2$ 得到 $-3$，函数反而增大。方向和步长必须分别考虑。

## 约束极值与拉格朗日乘子

### 只能沿单位圆移动时，怎样寻找极值

考虑一个简单问题：让 $f(x,y)=x+y$ 尽可能大，但位置必须满足

$$
g(x,y)=x^2+y^2-1=0.
$$

在整个平面上，沿右上方可以一直增加目标值；单位圆约束限制了我们能够到达的位置。例如 $(1,0)$ 是可行点，但直接沿目标梯度 $(1,1)^{\mathsf T}$ 走一小段，会离开圆周。

因此首先要问：在当前位置，哪些方向是圆周允许的切向方向？其次才问：在这些方向中，是否还能提高目标值？

### 从约束不变得到允许方向

设一条圆周上的光滑路径为 $\mathbf{r}(s)$，参数 $s$ 表示沿路径的位置，且 $\mathbf{r}(0)=\mathbf{p}$。因为路径始终满足约束，

$$
g(\mathbf{r}(s))=0.
$$

两边对 $s$ 求导，左边使用链式法则：

$$
\frac{d}{ds}g(\mathbf{r}(s))\bigg|_{s=0}
=\nabla g(\mathbf p)^{\mathsf T}\mathbf r'(0)=0.
$$

$\mathbf t=\mathbf r'(0)$ 是切向量，因此允许的切向变化满足 $\nabla g^{\mathsf T}\mathbf t=0$。在 $(1,0)$，约束梯度为 $(2,0)^{\mathsf T}$，切线是竖直方向。沿正切向 $(0,1)^{\mathsf T}$，目标变化率为 $1$，所以这个点还不是极大点。

这里描述的是一阶方向。沿切线直着走一段距离一般会离开圆周：从 $(1,0)$ 走到 $(1,s)$，约束误差为 $s^2$。真正沿圆周运动时，路径还会弯曲。切向量不能直接当作任意有限可行位移。

### 极值点为什么要求两个梯度平行

假设圆周上某个点已经是局部极大或极小点。把目标函数限制在圆周路径上，它就变成一元函数 $f(\mathbf r(s))$。在这个内部极值点，一元导数必须为零：

$$
\frac{d}{ds}f(\mathbf r(s))\bigg|_{s=0}
=\nabla f(\mathbf p)^{\mathsf T}\mathbf t=0.
$$

现在得到两个条件：约束梯度与切线垂直，目标梯度也与切线垂直。在二维中，非零切线的法向空间只有一个维度，因此目标梯度必然是约束梯度的标量倍数：

$$
\nabla f=\lambda\nabla g.
$$

$\lambda$ 叫拉格朗日乘子（Lagrange Multiplier）。它表示这里两个梯度之间的比例；它的数值由具体目标、约束定义和解的位置共同决定。

![单位圆上的目标等值线、约束法线及最大值与最小值候选](/images/knowledge/lagrange-circle.svg)

图中目标等值线满足 $x+y=\text{常数}$。在正向极值点，目标等值线与单位圆相切，目标梯度和约束梯度同向；负向极值点对应最小值。示意图采用等比例坐标，箭头长度仅用于区分方向。

### 把两个候选点都算出来

首先逐项求导：

$$
\nabla f=\begin{bmatrix}1\\1\end{bmatrix},\qquad
\nabla g=\begin{bmatrix}2x\\2y\end{bmatrix}.
$$

把梯度关系与原约束一起写成三个标量方程：

$$
\begin{cases}
1=2\lambda x,\\
1=2\lambda y,\\
x^2+y^2=1.
\end{cases}
$$

前两式说明 $\lambda\ne0$ 且 $x=y$。代入约束得到 $2x^2=1$，因此有两个候选点：

$$
\mathbf p_+=\begin{bmatrix}1/\sqrt2\\1/\sqrt2\end{bmatrix},\qquad
\mathbf p_-=\begin{bmatrix}-1/\sqrt2\\-1/\sqrt2\end{bmatrix}.
$$

目标值分别为 $\sqrt2$ 与 $-\sqrt2$，对应乘子分别为 $1/\sqrt2$ 与 $-1/\sqrt2$。又因为圆周上恒有 $|x+y|\le\sqrt2\sqrt{x^2+y^2}=\sqrt2$，这两个值分别是全局最大值和最小值。只求出正号分支会漏掉另一个极值。

下面的代码采样单位圆及其切向量，用于核对这两个候选点的一阶条件。它直接使用圆周参数化，不是寻找极值的迭代算法，所有量均无量纲。

~~~js
// knowledge-calculus-circle-example
export function circleState(theta) {
  if (!Number.isFinite(theta)) throw new Error('invalid angle');
  const position = [Math.cos(theta), Math.sin(theta)];
  const tangent = [-position[1], position[0]];
  return {
    position, tangent,
    objective: position[0]+position[1],
    objectiveRate: tangent[0]+tangent[1],
    constraint: position[0]**2+position[1]**2-1,
    constraintGradient: position.map(value => 2*value),
  };
}
~~~

### 从几何条件写出拉格朗日函数

为了把三个条件组织成统一的求导问题，定义

$$
\mathcal L(x,y,\lambda)=f(x,y)-\lambda g(x,y).
$$

分别对三个输入求偏导并令其为零：

$$
\begin{aligned}
\partial_x\mathcal L&=f_x-\lambda g_x=0,\\
\partial_y\mathcal L&=f_y-\lambda g_y=0,\\
\partial_\lambda\mathcal L&=-g=0.
\end{aligned}
$$

前两式正是梯度平行条件，最后一式恢复原约束。因此这个函数只是把已经推导出的关系组织起来。若改用 $f+\lambda g$，乘子的符号约定随之改变，不能把两个约定的乘子直接混用。

### 适用条件与多约束推广

上面的必要条件要求目标和约束足够光滑，并在候选点有 $\nabla g\ne0$，使约束局部具有规则切线或切平面。在三维中，要对整个切平面内的所有允许方向检查目标的一阶变化，而不能只选择其中一条切线。具体条件见 [OpenStax 乘子定理](https://openstax.org/books/calculus-volume-3/pages/4-8-lagrange-multipliers)。

满足乘子方程只说明找到了候选点，通常还要比较目标值、检查二阶性质或边界。约束退化时也可能漏解：一元约束 $g(x)=x^2=0$ 只允许 $x=0$，此时目标 $f(x)=x$ 在可行集合上同时取得最大和最小值，但没有任何 $\lambda$ 能使 $1=\lambda\,0$。

多个独立等式约束限制了更多方向。相应正则条件下，目标梯度位于各约束法线张成的空间：

$$
\nabla f=\sum_j\lambda_j\nabla g_j.
$$

把多条约束的导数组织成矩阵后，这个关系会写成 $\nabla f=J^{\mathsf T}\boldsymbol\lambda$。下一节先解释矩阵如何组织这些导数；[Jacobian 的约束接口](/knowledge/jacobian-matrix/#约束接口速度映射与力的对偶)再从虚功解释理想约束反力为什么也具有转置映射的结构。

## 向量输入、Jacobian 与多元链式法则

### 从一个输出到多个输出

前面每次只研究一个标量输出。现在同时观察椭圆碗的函数值与单位圆的约束值，把它们作为两个输出：

$$
\mathbf F(x,y)=\begin{bmatrix}x^2+2y^2\\x^2+y^2-1\end{bmatrix}.
$$

第一项对两个输入的偏导分别为 $2x,4y$；第二项分别为 $2x,2y$。每个输出占一行，各输入按列排列：

$$
J=\begin{bmatrix}2x&4y\\2x&2y\end{bmatrix}.
$$

这个矩阵叫 Jacobian（雅可比矩阵）。它把两个输出各自的一阶变化一起写出来：

$$
\begin{bmatrix}\Delta F_1\\\Delta F_2\end{bmatrix}
\approx
\begin{bmatrix}2x&4y\\2x&2y\end{bmatrix}
\begin{bmatrix}\Delta x\\\Delta y\end{bmatrix}.
$$

如果只有一个输出，只需要一行；如果有更多输出，就继续往下加行。对一般函数 $\mathbf F:\mathbb R^n\to\mathbb R^m$，输入有 $n$ 个分量，输出有 $m$ 个分量，于是

$$
J_{ij}=\frac{\partial F_i}{\partial x_j},\qquad
\Delta\mathbf{F}\approx J\Delta\mathbf{x}.
$$

$J$ 有 $m$ 行、$n$ 列，乘以 $n$ 维输入扰动得到 $m$ 维输出扰动。对只有一个输出的标量函数，本文约定下有

$$
J_f=(\nabla f)^{\mathsf T}.
$$

梯度是列向量，标量函数的 Jacobian 是行向量；它们包含相同的一阶信息，形状却不同。这也是物理公式里经常出现转置的原因。

### 逐层传播与转置

设 $\mathbf{z}=\mathbf{G}(\mathbf{x})$，输出能量 $U=\phi(\mathbf{z})$。小变化满足

$$
d\mathbf{z}=J_Gd\mathbf{x},\qquad
dU=(\nabla_{\mathbf{z}}\phi)^{\mathsf T}d\mathbf{z}.
$$

先把第一式代入第二式，再把行列次序写清楚：

$$
dU=(\nabla_{\mathbf z}\phi)^{\mathsf T}J_Gd\mathbf x
=\left(J_G^{\mathsf T}\nabla_{\mathbf z}\phi\right)^{\mathsf T}d\mathbf x.
$$

另一方面，根据输入梯度的定义，$dU=(\nabla_{\mathbf x}U)^{\mathsf T}d\mathbf x$。比较任意输入变化量前面的系数，就得到

$$
\nabla_{\mathbf{x}}U=J_G^{\mathsf T}\nabla_{\mathbf{z}}\phi.
$$

正向的 Jacobian 将输入变化映射到输出变化；转置将输出端的标量变化率映射回输入梯度。维度核对是可靠的检查，不应凭记忆在公式中随意加转置。

### 全系统梯度与粒子块

将 $N$ 个三维粒子的位置按顺序拼接：

$$
\mathbf{x}=\begin{bmatrix}\mathbf{x}_1\\\vdots\\\mathbf{x}_N\end{bmatrix}
\in\mathbb R^{3N},\qquad
\nabla_{\mathbf{x}}U=
\begin{bmatrix}\nabla_{\mathbf{x}_1}U\\\vdots\\\nabla_{\mathbf{x}_N}U\end{bmatrix}.
$$

对单个粒子求梯度，得到三个分量；对整个系统求梯度，得到 $3N$ 个分量。某条弹簧只连接两个粒子时，它对其他粒子位置的梯度为零。这种局部依赖产生稀疏性，也决定了求解器需要访问哪些邻居。

Jacobian 的局部线性化、IK、奇异性与伪逆详见[Jacobian 矩阵与局部线性化](/knowledge/jacobian-matrix/)，这里不再重复完整推导。

## 物理中的约束梯度、能量梯度与力

### 从两粒子位置定义弹簧

现在使用物理单位。设两个粒子位置为 $\mathbf{x}_a,\mathbf{x}_b$，单位为米，静止长度为 $\ell_0>0$，刚度 $k$ 的单位为 $\mathrm{N/m}$。定义

$$
\mathbf{d}=\mathbf{x}_b-\mathbf{x}_a,\qquad
\ell=\|\mathbf{d}\|,\qquad
\mathbf{n}=\frac{\mathbf{d}}\ell,\qquad
C=\ell-\ell_0.
$$

本节先假设 $\ell>0$。$C$ 是带长度单位的约束误差：拉长时为正，压缩时为负。它不是力，也不是能量。

### 一步步求距离约束梯度

把相对位置写成分量，

$$
\ell=\sqrt{d_x^2+d_y^2+d_z^2}.
$$

用平方根和平方函数的链式法则，

$$
\frac{\partial\ell}{\partial d_x}
=\frac{1}{2\sqrt{d_x^2+d_y^2+d_z^2}}\,2d_x
=\frac{d_x}{\ell}.
$$

其他分量同理，所以 $\nabla_{\mathbf{d}}\ell=\mathbf{n}$。由于增加 $\mathbf{x}_b$ 会同向增加 $\mathbf{d}$，而增加 $\mathbf{x}_a$ 会反向改变 $\mathbf{d}$，最终得到

$$
\nabla_a C=-\mathbf{n},\qquad
\nabla_b C=\mathbf{n}.
$$

这里 $\nabla_a$ 表示对粒子 $a$ 的三个位置分量求导。两者方向相反，意味着同样朝右移动端点 $a$ 与端点 $b$，对距离变化的贡献相反。

对任意小位移，一阶误差变化为

$$
\Delta C\approx
-\mathbf{n}^{\mathsf T}\Delta\mathbf{x}_a
+\mathbf{n}^{\mathsf T}\Delta\mathbf{x}_b.
$$

若两个端点施加相同平移，该表达式为零；这是距离约束平移不变性的导数表达。

### 从约束得到能量梯度

弹性势能采用

$$
U=\tfrac12kC^2.
$$

位置先决定距离，距离决定伸长，伸长再决定能量。逐层求导：

$$
\nabla_aU=kC\nabla_aC=-kC\mathbf{n},\qquad
\nabla_bU=kC\nabla_bC=kC\mathbf{n}.
$$

约束梯度只告诉我们改变哪个位置会怎样改变误差；乘上 $kC$ 后，才得到改变位置会怎样改变能量。

### 为什么力是负能量梯度

对保守力，微小位移上的做功等于势能减少：

$$
dW=\mathbf{f}^{\mathsf T}d\mathbf{x}=-dU
=-(\nabla U)^{\mathsf T}d\mathbf{x}.
$$

由于它对任意小位移成立，有

$$
\mathbf{f}=-\nabla U.
$$

因此弹簧对两个端点的力分别为

$$
\mathbf{f}_a=kC\mathbf{n},\qquad
\mathbf{f}_b=-kC\mathbf{n}.
$$

拉伸时两端相互吸引，压缩时相互推开。这一关系用于当前势能描述的保守力；阻尼、干摩擦和规定运动的驱动力不能直接用同一个位置势能公式概括。

### 一个数值与量纲都能核对的例子

取 $\mathbf{x}_a=(0,0,0)^{\mathsf T}\,\mathrm m$、$\mathbf{x}_b=(2,0,0)^{\mathsf T}\,\mathrm m$、$\ell_0=1\,\mathrm m$、$k=100\,\mathrm{N/m}$。则

$$
\begin{aligned}
C&=1\,\mathrm m,&U&=50\,\mathrm J,\\
\nabla_aU&=(-100,0,0)^{\mathsf T}\,\mathrm N,
&\mathbf{f}_a&=(100,0,0)^{\mathsf T}\,\mathrm N.
\end{aligned}
$$

端点 $b$ 的梯度与力分别相反。若只把 $b$ 沿正 $x$ 移动 $0.001\,\mathrm m$，一阶预测的能量增加是 $0.1\,\mathrm J$，精确增加为 $0.10005\,\mathrm J$。

$C$ 的单位是米；$\nabla C$ 是长度对长度的比值，无量纲；$\nabla U$ 的单位是牛顿；位置修正的单位仍是米。能量梯度数值可以和力取负对应，却不能不经过质量、时间或求解方程就直接当作位移。

### 固定端、退化与变量选择

固定一个粒子不会改变原几何函数的导数；它改变的是允许修正的自由度，例如用零逆质量排除该粒子的动态响应。

当 $\ell=0$ 时，$\mathbf{n}$ 未定义。对于正静止长度的距离弹簧，不能把分母随意加一个小数就宣称恢复了精确梯度；保留历史方向、使用确定的替代方向或拒绝退化状态，都需要明确行为约定。

如果改用平方距离约束，必须重新推导导数、单位和柔度。若变量换成刚体平移与旋转，还需要旋转自由度对应的导数。本文的粒子位置公式不能原样充当四元数或刚体角向更新。

## 从一阶变化到二阶变化

### 二阶导数与 Hessian

一阶导数描述函数怎样变化；二阶导数描述一阶导数怎样变化。对 $f(x)=x^2$，$f'(x)=2x$，$f''(x)=2$：越往右走，斜率按固定速率增加。

多元函数把所有二阶偏导排列成 Hessian 矩阵：

$$
H_{ij}=\frac{\partial}{\partial x_j}
\left(\frac{\partial f}{\partial x_i}\right),\qquad
H=J_{\nabla f}.
$$

当二阶偏导连续时，混合偏导相等，Hessian 对称。对椭圆碗，

$$
\nabla f=\begin{bmatrix}2x\\4y\end{bmatrix},\qquad
H=\begin{bmatrix}2&0\\0&4\end{bmatrix}.
$$

沿 $y$ 方向，梯度变化比沿 $x$ 更快，这与等高线在 $y$ 方向更紧密一致。

### 从切平面到局部二次模型

对二阶连续可微函数，局部展开为

$$
f(\mathbf{x}+\mathbf{s})
=f(\mathbf{x})+\nabla f^{\mathsf T}\mathbf{s}
+\tfrac12\mathbf{s}^{\mathsf T}H\mathbf{s}
+o(\|\mathbf{s}\|^2).
$$

$o(\|\mathbf{s}\|^2)$ 表示余项相对 $\|\mathbf{s}\|^2$ 趋于零。对本例这个精确二次函数，余项就是零。在 $(1,1)$ 处，完整变化量为

$$
\Delta f=2s_x+4s_y+s_x^2+2s_y^2.
$$

若取 $(s_x,s_y)=(0.1,-0.05)$，一阶项相消，但真实变化为 $0.015$。切线方向只保证一阶变化为零，不保证走一段直线后还留在原等高线上。

### 曲率与 Newton 方向

在驻点附近，若所有方向二次项均为正，则该点具有严格局部极小的充分条件；有正有负则是鞍点。二次项为零的方向需要继续分析，不能只凭 Hessian 判定。

把局部二次模型对 $\mathbf{s}$ 的梯度设为零，得到

$$
H\mathbf{s}=-\nabla f.
$$

这是 Newton 最优化的线性子问题。工程上应求解该方程，不是先显式构造完整逆矩阵。对椭圆碗，由于模型精确且 Hessian 正定，完整步直接到原点；一般非线性函数没有这个一步性质。

梯度只给出一阶变化；Hessian 帮助解释各方向的响应尺度。正定性、线搜索、Gauss–Newton 与局部收敛条件详见[二阶近似与 Hessian 矩阵](/knowledge/hessian-matrix/)。

## 这些导数如何进入物理求解器

### PBD：沿约束梯度修正位置

将所有粒子位置暂记为 $\mathbf{x}$，约束 Jacobian 为 $J=(\nabla C)^{\mathsf T}$。希望修正后约束为零，一阶近似要求

$$
C(\mathbf{x})+J\Delta\mathbf{x}\approx0.
$$

满足这一条件的位移可能有很多。PBD 选择质量加权的修正方向：

$$
W=\sum_i w_i\|\nabla_iC\|^2,\qquad
\Delta\lambda=-\frac CW,\qquad
\Delta\mathbf{x}_i=w_i\nabla_iC\,\Delta\lambda.
$$

$w_i=1/m_i$ 是逆质量，固定端取零；$W$ 是有效逆质量。约束梯度确定局部误差对位置的敏感方向，逆质量决定各粒子怎样分担修正，乘子确定本轮修正尺度。它不等于对总势能做一次固定步长梯度下降。

只有 $W>0$ 且几何导数有效时，公式才可直接使用。多约束之间会互相影响，因此还需要重算与迭代。

### XPBD：柔度与累计乘子

对标量柔度 $\alpha$、子步长 $h$，定义 $\widetilde\alpha=\alpha/h^2$。常见 XPBD 更新为

$$
\Delta\lambda=
\frac{-C-\widetilde\alpha\lambda}{W+\widetilde\alpha},\qquad
\Delta\mathbf{x}_i=w_i\nabla_iC\,\Delta\lambda.
$$

相比前式，位置方向仍依赖约束梯度，尺度还包含柔度和子步内累计乘子。本文距离弹簧的柔度可取 $\alpha=1/k$；任意重定义的约束不能直接沿用这个数值。

有限迭代、非线性和历史状态仍会影响结果，不能把柔度参数理解为彻底消除所有时间步与迭代依赖。[PBD 与 XPBD](/knowledge/pbd-xpbd-math/)维护完整子步流程与具体约束推导。

### VBD：对离散时间目标求能量导数

一种隐式 Euler 位置目标写为

$$
\Phi(\mathbf{x})=
\frac{1}{2h^2}(\mathbf{x}-\mathbf{y})^{\mathsf T}M(\mathbf{x}-\mathbf{y})
+U(\mathbf{x}),
$$

$\mathbf{y}$ 是惯性预测位置，$M$ 为质量矩阵。其梯度包含惯性项和材料项：

$$
\nabla\Phi=\frac{M}{h^2}(\mathbf{x}-\mathbf{y})+\nabla U.
$$

VBD 按顶点块累加这些梯度与局部 Hessian，再计算块更新。注意材料保守力是 $-\nabla U$，而 $-\nabla\Phi$ 还包括离散惯性项，不能把后者整体直接叫作材料力。

### AVBD：增广项也需要一致求导

以单个硬等式约束的增广项作机制示意：

$$
\mathcal L(\mathbf{x},\Lambda)
=\Phi(\mathbf{x})+\Lambda C(\mathbf{x})+\tfrac12\rho C(\mathbf{x})^2.
$$

固定本轮乘子与罚参数，对位置求梯度得到

$$
\nabla\mathcal L=\nabla\Phi+(\Lambda+\rho C)\nabla C.
$$

同一条链式法则再次出现，但系数现在带有对偶状态。完整 AVBD 还涉及乘子更新、罚参数调度、正则化和接触处理；有限刚度材料与硬约束的状态策略也不同，不能把这个简式当作完整原算法。

[VBD 与 AVBD](/knowledge/vbd-avbd-math/)负责能量导数和局部块，[PBD、XPBD、VBD 与 AVBD 对比](/knowledge/pbd-xpbd-vbd-avbd-comparison/)负责目标、乘子、收敛与工程取舍。此处只说明导数的入口，不重复完整算法。

## 如何验证自己计算的导数

### 解析求导、有限差分与自动微分

解析求导是手工应用求导规则得到公式；有限差分用附近函数值估计导数；自动微分按程序的计算路径组合局部导数。自动微分不等于有限差分，也不会自动修正错误模型、不可微切换或错误的变量约定。

一元前向差分与中心差分分别为

$$
f'(x)\approx\frac{f(x+\varepsilon)-f(x)}\varepsilon,
\qquad
f'(x)\approx\frac{f(x+\varepsilon)-f(x-\varepsilon)}{2\varepsilon}.
$$

在足够光滑且忽略浮点舍入时，二者截断误差通常分别是一阶和二阶。$\varepsilon$ 太大会离开局部范围，太小则可能在两个相近数相减时损失精度；应根据输入尺度扫描多个步长。

### 先检查方向导数，再检查每个分量

对选定单位方向 $\mathbf{d}$，比较

$$
\nabla f(\mathbf{x})^{\mathsf T}\mathbf{d}
\quad\text{与}\quad
\frac{f(\mathbf{x}+\varepsilon\mathbf{d})-f(\mathbf{x}-\varepsilon\mathbf{d})}{2\varepsilon}.
$$

取坐标基方向就可以检查各分量；再取几个混合方向，检查分量拼接、符号与索引。方向差分不必构造大型数值 Jacobian，适合调试局部能量项。

下面是可直接执行的 JavaScript 算例，采用米、牛顿和焦耳。它只验证距离弹簧的能量与梯度，不是完整积分器或 UE 实现。传入的方向需要是单位向量，差分尺度与位置使用相同长度单位。

~~~js
// knowledge-calculus-gradient-example
export function springEnergyGradient(a, b, rest = 1, stiffness = 100) {
  const valid = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!valid(a) || !valid(b) || !Number.isFinite(rest) || rest <= 0 ||
      !Number.isFinite(stiffness) || stiffness <= 0) throw new Error('invalid input');
  const delta = b.map((value, i) => value - a[i]);
  const length = Math.hypot(...delta);
  if (!Number.isFinite(length) || length <= 1e-12) throw new Error('degenerate distance');
  const constraint = length - rest;
  const gradientB = delta.map(value => stiffness * constraint * value / length);
  return {
    energy: 0.5 * stiffness * constraint ** 2,
    constraint,
    gradient: [...gradientB.map(value => -value), ...gradientB],
  };
}

export function checkSpringDirection(a, b, direction, epsilon = 1e-5) {
  if (!Array.isArray(direction) || direction.length !== 6 || !direction.every(Number.isFinite) ||
      Math.abs(Math.hypot(...direction) - 1) > 1e-10 ||
      !Number.isFinite(epsilon) || epsilon <= 0) throw new Error('invalid direction or epsilon');
  const sample = springEnergyGradient(a, b);
  const position = [...a, ...b];
  const movedEnergy = sign => {
    const q = position.map((value, i) => value + sign * epsilon * direction[i]);
    return springEnergyGradient(q.slice(0, 3), q.slice(3)).energy;
  };
  const analytic = sample.gradient.reduce((sum, value, i) => sum + value * direction[i], 0);
  const numeric = (movedEnergy(1) - movedEnergy(-1)) / (2 * epsilon);
  return { analytic, numeric, error: Math.abs(analytic - numeric) };
}

console.log(springEnergyGradient([0, 0, 0], [2, 0, 0]));
// 能量 50；约束误差 1；全系统梯度分量为 [-100, 0, 0, 100, 0, 0]。
console.log(checkSpringDirection([0, 0, 0], [2, 0, 0], [0, 0, 0, 1, 0, 0]));
// 解析方向导数 100；中心差分应接近 100，误差取决于浮点与步长。
~~~

代码中的极短距离阈值只是本例按米设置的拒绝策略，不是材料参数，也不代表所有缩放下都适用。

### 除了数值差分，还要核对物理结构

对本例，始终应有 $\nabla_aU+\nabla_bU=\mathbf0$，对应整体平移不改变能量。刚体旋转整个粒子对也不应改变距离与能量。静止长度处，能量和梯度都应为零；压缩与拉伸时，力方向应相反。

如果差分不匹配，先查变量顺序、正负号、单位、零长度和函数实现是否一致；若只在切换点失败，检查是否跨越了非光滑分支。不能靠无限缩小差分步长、扩大容差或隐藏 NaN 宣称导数正确。

梯度验证通过之后，还要分别验证 Hessian、局部求解残差、完整时间步与接触状态。导数正确只是求解器正确性的一个环节。

## 附录：函数与近似工具

### 偏导数存在不代表整体可微

正文使用的多项式在各个方向都足够光滑。一般函数需要另外检查：分别沿坐标轴观察，只覆盖了所有接近路径中的一部分。例如定义

$$
q(x,y)=\begin{cases}
\dfrac{xy}{x^2+y^2},&(x,y)\ne(0,0),\\
0,&(x,y)=(0,0).
\end{cases}
$$

沿两条坐标轴，函数恒为零，所以原点两个偏导数都是零；沿 $y=x$ 接近原点，函数却恒为 $1/2$。它在原点不连续，无法用一个统一的平面近似。

常用充分条件是：各一阶偏导在该点附近存在，并在该点连续，则函数在该点可微。可微要求所有足够小的方向共享同一个一阶模型；只有各坐标偏导存在，尚不足以保证正文的梯度方向公式。

### 幂、坐标与三角函数

幂是重复乘法的推广；在有定义的范围内，同底数相乘时指数相加，幂再乘方时指数相乘。多项式由常量乘幂函数相加组成，例如 $ax^2+bx+c$。当 $a\ne0$ 时，其零点满足

$$
x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}.
$$

这只是代数求根；是否有实根取决于判别式，数值实现还需考虑消减误差。空间向量、坐标变换与点积的完整说明见[UE 空间数学](/knowledge/ue-linear-algebra-guide/)。

单位圆上的点是 $(\cos\theta,\sin\theta)$，满足

$$
\sin^2\theta+\cos^2\theta=1,\qquad
\sin(a+b)=\sin a\cos b+\cos a\sin b.
$$

因此二维极坐标可写成 $x=r\cos\theta,y=r\sin\theta$。从坐标恢复方向通常使用能识别象限的 $\operatorname{atan2}(y,x)$；原点方向仍未定义，不能因为库函数返回数值就赋予它几何方向。角度求导需统一为弧度。

### 指数、对数与衰减

对数是指数的逆运算。对正实数，有

$$
\ln(ab)=\ln a+\ln b,\qquad e^{a+b}=e^ae^b.
$$

恒定衰减率 $\gamma>0$ 的精确响应为

$$
q(t)=q_0e^{-\gamma t},\qquad T_{1/2}=\frac{\ln2}{\gamma}.
$$

目标 $q_*$ 在一段时间内保持不变时，一阶平滑的精确推进为

$$
q_{\mathrm{new}}=q_*+(q_{\mathrm{old}}-q_*)e^{-\gamma h}.
$$

目标变化、额外约束或离散更新顺序会改变完整行为；不能只凭使用指数就声称整个动画或控制系统与帧率无关。动力系统的完整建模见[常微分方程](/knowledge/differential-equations/)。

### 连续性、中值定理与洛必达法则

连续意味着输入接近某点时，函数值也接近该点的函数值；一元可导蕴含连续，反过来不成立。连续缓动曲线若在拼接处斜率不连续，仍可能出现速度突变；需要根据用途检查相应阶数。

若 $f$ 在闭区间 $[a,b]$ 连续、开区间 $(a,b)$ 可导，则存在内部点 $c$ 满足

$$
f'(c)=\frac{f(b)-f(a)}{b-a}.
$$

这是拉格朗日中值定理；端点值相同时得到罗尔定理。对相应连续且可导的 $f,g$，柯西中值定理给出交叉形式

$$
[f(b)-f(a)]g'(c)=[g(b)-g(a)]f'(c).
$$

只有额外确认相关分母非零，才能改写为比值。它们描述连续曲线上的性质，不保证有限帧差分恰好等于某个指定采样时刻的导数。

洛必达法则可在满足邻域可导、分母导数非零、导数比极限存在等相应条件时，处理 $0/0$ 或无穷比无穷型极限。它不是允许程序执行除零，也不是所有比值都能通过分子分母分别求导保持不变。

例如 $\sin x/x$ 在原点的连续延拓值为 $1$；近原点的实现可采用 $1-x^2/6$ 等局部 Taylor 近似，而不必先计算一个数值不稳定的比值。

### Taylor 多项式与 Fourier 展开

有限阶 Taylor 公式包含余项；无限 Taylor 级数等于原函数还需要更强条件，不能仅由“无限次可导”推出。常见局部展开为

$$
e^x=1+x+\tfrac12x^2+\cdots,\quad
\sin x=x-\tfrac16x^3+\cdots,\quad
\cos x=1-\tfrac12x^2+\cdots.
$$

Taylor 围绕一个位置使用局部导数。Fourier 则使用正弦余弦基函数描述周期信号；周期为 $T$ 时，令 $\omega=2\pi/T$，形式为

$$
f(t)\sim\frac{a_0}{2}+\sum_{n=1}^{\infty}
\left[a_n\cos(n\omega t)+b_n\sin(n\omega t)\right].
$$

这里用展开符号而不无条件写逐点相等：收敛方式需要额外假设，跳跃点还涉及左右极限均值与 Gibbs 现象。两种展开解决的问题不同。

## 附录：积分与累积

### 不定积分与定积分

导数描述局部变化率，积分描述累积。若 $F'=f$，则不定积分写为

$$
\int f(x)\,dx=F(x)+c.
$$

常数 $c$ 表示所有原函数之间相差的常量。例如 $\int2x\,dx=x^2+c$，而 $\int(1/x)\,dx=\ln|x|+c$，后者在不跨越零点的区间讨论。

定积分可以由许多小区间上的函数值乘宽度求和，再取极限定义。它是带符号的累积，函数在轴线下方时贡献为负；不一定等于几何面积。

对连续函数，微积分基本定理把累积与原函数联系起来：

$$
\int_a^b f(x)\,dx=F(b)-F(a).
$$

若 $A(x)=\int_a^x f(t)\,dt$，则 $A'(x)=f(x)$。连续性等条件与完整表述见[微积分基本定理](https://openstax.org/books/calculus-volume-1/pages/5-3-the-fundamental-theorem-of-calculus)。连续函数还在区间某点取得其积分平均值。

对运动，位置变化是速度的时间积分：

$$
x(t)-x(t_0)=\int_{t_0}^{t}v(\tau)\,d\tau.
$$

已知位置可以求速度，但只知道速度还需要初始位置才能恢复完整运动。这也是初值问题需要初始状态的原因。

### 换元与分部积分

换元是链式法则的逆向使用。令 $u=\phi(x)$，有

$$
\int f(\phi(x))\phi'(x)\,dx=F(\phi(x))+c.
$$

例如 $\int2xe^{x^2}\,dx=e^{x^2}+c$。定积分换元还要变换上下限，并确认变换与定义域适用；三角换元常用来处理平方根中的二次项。

分部积分来自乘积求导：

$$
\int u\,dv=uv-\int v\,du.
$$

例如 $\int xe^x\,dx=xe^x-e^x+c$。这些是解析积分工具，与时间求解器每子步怎样更新状态是不同层面的事情。

### 数值求积与时间推进

当函数已知但积分难以解析时，可用矩形、梯形或 Simpson 求积。等宽节点 $x_i=a+i\Delta x$，$\Delta x=(b-a)/n$ 下，复合梯形公式是

$$
\int_a^b f(x)\,dx\approx
\frac{\Delta x}{2}\sum_{i=0}^{n-1}[f(x_i)+f(x_{i+1})].
$$

对正偶数 $n$，复合 Simpson 公式是

$$
\int_a^b f(x)\,dx\approx\frac{\Delta x}{3}
\left[f(x_0)+4\sum_{\substack{i=1\\i\text{ 为奇数}}}^{n-1}f(x_i)
+2\sum_{\substack{i=2\\i\text{ 为偶数}}}^{n-2}f(x_i)+f(x_n)\right].
$$

在适当有界高阶导数条件下，复合梯形与 Simpson 的全局误差分别为二阶和四阶；非光滑函数不能直接套用这些精度结论。步数还须为正，不能只检查偶数性。

已知函数的求积，与力依赖未知位置和速度时的动力学时间推进不同。Euler、Verlet、RK 与隐式方法见[数值积分：方法、误差与稳定性](/knowledge/numerical-integration-methods/)。

### 多重积分、路径与曲面

空间分布需要对面积或体积积分。例如密度 $\rho$ 给出总质量与质心：

$$
m=\iiint_\Omega\rho\,dV,\qquad
\mathbf{x}_{\mathrm{com}}=\frac1m\iiint_\Omega\mathbf{x}\rho\,dV.
$$

换坐标必须包含体积缩放：极坐标中 $dA=r\,dr\,d\theta$；球坐标以极角 $\phi$、方位角 $\theta$ 表示时，$dV=r^2\sin\phi\,dr\,d\phi\,d\theta$。其来源是 Jacobian 行列式，不能只替换函数表达式而遗漏测度。

沿参数曲线 $\mathbf{r}(t)$，标量的弧长积分与力的做功分别为

$$
\int_\Gamma f\,ds=\int_a^b f(\mathbf{r}(t))\|\mathbf{r}'(t)\|\,dt,
$$

$$
W=\int_\Gamma\mathbf{F}\cdot d\mathbf{r}
=\int_a^b\mathbf{F}(\mathbf{r}(t))^{\mathsf T}\mathbf{r}'(t)\,dt.
$$

曲面积分则累积曲面上的标量或通量。曲线方向、曲面法线和参数化都参与符号约定，涉及闭合边界的关系见下节。

## 附录：向量场与空间微分

### 梯度、散度、旋度与拉普拉斯

梯度将标量场的空间变化组织为向量；对三维向量场 $\mathbf{F}=(F_x,F_y,F_z)^{\mathsf T}$，散度将各方向流出变化相加，结果为标量：

$$
\nabla\cdot\mathbf{F}=\partial_xF_x+\partial_yF_y+\partial_zF_z.
$$

旋度是描述局部旋转的向量，采用标准右手定向的分量公式：

$$
\nabla\times\mathbf{F}=
\begin{bmatrix}
\partial_yF_z-\partial_zF_y\\
\partial_zF_x-\partial_xF_z\\
\partial_xF_y-\partial_yF_x
\end{bmatrix}.
$$

接入具体引擎时，要核对坐标定向、叉乘和角向量约定。拉普拉斯算子对标量场是梯度的散度：

$$
\nabla^2f=\nabla\cdot\nabla f=\partial_{xx}f+\partial_{yy}f+\partial_{zz}f.
$$

它是 Hessian 的迹，是一个数；Hessian 保留全部二阶方向信息，是矩阵。二者不能互换。

对速度场，不可压缩条件是散度为零；对力场，散度为零并不能直接解释为流体不可压缩。场代表什么物理量，必须先定义。压力、黏性与流体方程见[PDE](/knowledge/partial-differential-equations/)和[流体动力学](/knowledge/fluid-dynamics/)。

### 恒等式与积分定理

在足够光滑的区域，混合偏导相等给出

$$
\nabla\times\nabla f=\mathbf0,\qquad
\nabla\cdot(\nabla\times\mathbf{F})=0,
$$

$$
\nabla\times(\nabla\times\mathbf{F})
=\nabla(\nabla\cdot\mathbf{F})-\nabla^2\mathbf{F}.
$$

Green 定理把平面正向边界上的线积分与内部旋度分量联系起来：

$$
\oint_{\partial D}P\,dx+Q\,dy
=\iint_D(\partial_xQ-\partial_yP)\,dA.
$$

散度定理与 Stokes 定理分别写为

$$
\iiint_\Omega\nabla\cdot\mathbf{F}\,dV
=\iint_{\partial\Omega}\mathbf{F}\cdot\mathbf{n}\,dS,
$$

$$
\iint_S(\nabla\times\mathbf{F})\cdot\mathbf{n}\,dS
=\oint_{\partial S}\mathbf{F}\cdot d\mathbf{r}.
$$

这些关系要求相应光滑场、规则区域和一致边界定向，不能在穿过奇点时无条件使用。它们也是连续守恒律与通量离散的基础，进一步见[连续介质](/knowledge/continuum-mechanics/)。

### 保守场与势函数

若向量场存在势函数 $\phi$，使 $\mathbf{F}=\nabla\phi$，则沿路径的积分仅由端点决定，称为保守场。物理力使用势能 $U$ 时通常采用 $\mathbf{F}=-\nabla U$，二者只差势函数的符号约定。

光滑梯度场无旋；反过来，从无旋推出存在全局势函数，还需要定义域条件，例如在单连通开区域内的适当光滑场。绕过奇点的有孔区域可能存在无旋但不保守的场。[保守向量场](https://openstax.org/books/calculus-volume-3/pages/6-3-conservative-vector-fields)说明了这种局部与全局的区别。

## 来源与继续阅读

基础定义与条件参考上方对应的 OpenStax 教材章节；文中的抛物线、椭圆碗与弹簧是按统一符号自行展开的数学算例，不是论文性能复现。

- [Jacobian 矩阵与局部线性化](/knowledge/jacobian-matrix/)：多输出映射、IK 与导数的对偶关系。
- [二阶近似与 Hessian 矩阵](/knowledge/hessian-matrix/)：曲率、Newton、Gauss–Newton 与导数检查。
- [常微分方程](/knowledge/differential-equations/)与[数值积分](/knowledge/numerical-integration-methods/)：从连续运动方程到离散时间推进。
- [PBD 与 XPBD](/knowledge/pbd-xpbd-math/)、[VBD 与 AVBD](/knowledge/vbd-avbd-math/)及[四种方法对比](/knowledge/pbd-xpbd-vbd-avbd-comparison/)：导数参与实际求解的目标、状态与边界。
- [数学符号与 LaTeX 速查](/knowledge/mathematical-notation-reference/)：按需查询记号。
