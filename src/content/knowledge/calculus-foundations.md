---
title: "微积分详解 — 从极限到微分、积分与向量微积分"
excerpt: "系统讲解微积分核心理论：数学预备知识、三角函数、指数对数、函数极限、微分学（导数、偏导数、梯度、雅可比矩阵、海森矩阵、中值定理、泰勒级数、傅里叶级数）、积分学（定积分、换元法、分部积分、多重积分、曲线曲面积分）、向量微积分（梯度、散度、旋度、Gauss/Stokes 公式）。配合 UE C++ 代码示例（FastInvSqrt、FastSin、缓动函数、数值积分）。"
date: "2026-09-06"
category: "Mathematics"
subtopic: "Calculus"
tags: ["微积分", "导数", "积分", "向量微积分", "C++"]
readTime: "阅读约50分钟"
---

> 微积分是游戏物理与动画编程的数学基础：位置是速度的积分，速度是位置的导数；力场是势函数的梯度；流体行为由偏微分方程描述。本文系统梳理从极限到向量微积分的完整理论链，并配合 UE C++ 实践示例。
>
> 本文为教材式总览，ODE 数值方法见&#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299;，PDE 与有限差分离散见&#12298;[偏微分方程与数值离散详解](/knowledge/partial-differential-equations/)&#12299;，数学符号速查见&#12298;[高等数学符号速查详解](/knowledge/mathematical-notation-reference/)&#12299;。雅可比/海森矩阵的深拆见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;与&#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299;。

---

## 一、数学预备知识

### 1.1 幂运算与根式

幂运算表示重复乘法：

$$
a^n = \underbrace{a \times a \times \cdots \times a}_{n \text{ 次}}
$$

其中 $a$ 为底数，$n$ 为指数。基本性质：

| 性质 | 公式 |
|------|------|
| 同底相乘 | $a^m \cdot a^n = a^{m+n}$ |
| 同底相除 | $\frac{a^m}{a^n} = a^{m-n}$ |
| 幂的幂 | $(a^m)^n = a^{mn}$ |
| 零次幂 | $a^0 = 1$（$a \neq 0$） |
| 负指数 | $a^{-n} = \frac{1}{a^n}$ |
| 分数指数 | $a^{m/n} = \sqrt[n]{a^m}$ |

```cpp
float Power = FMath::Pow(2.0f, 3.0f);       // 2³ = 8
float SquareRoot = FMath::Sqrt(16.0f);      // √16 = 4
float CubeRoot = FMath::Pow(8.0f, 1.0f/3.0f); // ∛8 = 2
```

### 1.2 多项式与二次方程

多项式标准形式：

$$
P(x) = a_n x^n + a_{n-1} x^{n-1} + \cdots + a_1 x + a_0
$$

二次方程 $ax^2 + bx + c = 0$ 的求根公式：

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

判别式 $\Delta = b^2 - 4ac$ 决定根的性质：$\Delta > 0$ 两个实根，$\Delta = 0$ 重根，$\Delta < 0$ 复数根。

```cpp
bool SolveQuadratic(float a, float b, float c, float& Root1, float& Root2)
{
    float Discriminant = b * b - 4.0f * a * c;
    if (Discriminant < 0) return false;
    float SqrtDisc = FMath::Sqrt(Discriminant);
    Root1 = (-b + SqrtDisc) / (2.0f * a);
    Root2 = (-b - SqrtDisc) / (2.0f * a);
    return true;
}
```

### 1.3 坐标系统

**笛卡尔坐标**：UE 使用左手坐标系，X 为前方，Y 为右方，Z 为上方。

**极坐标**（2D）：用半径 $r$ 和角度 $\theta$ 表示点。

$$
x = r\cos\theta, \quad y = r\sin\theta
$$

$$
r = \sqrt{x^2 + y^2}, \quad \theta = \text{atan2}(y, x)
$$

**球坐标**（3D）：用 $r, \theta, \phi$ 表示点。

$$
x = r\sin\phi\cos\theta, \quad y = r\sin\phi\sin\theta, \quad z = r\cos\phi
$$

> 使用 `atan2(y, x)` 而非 `atan(y/x)`，以正确处理所有象限。

---

## 二、三角函数

### 2.1 定义

在单位圆上，角度 $\theta$ 对应点的坐标为 $(\cos\theta, \sin\theta)$：

$$
\cos\theta = x, \quad \sin\theta = y, \quad \tan\theta = \frac{\sin\theta}{\cos\theta}
$$

### 2.2 重要恒等式

**毕达哥拉斯恒等式**：

$$
\sin^2\theta + \cos^2\theta = 1
$$

**和差公式**：

$$
\sin(a \pm b) = \sin a\cos b \pm \cos a\sin b
$$

$$
\cos(a \pm b) = \cos a\cos b \mp \sin a\sin b
$$

**倍角公式**：

$$
\sin(2\theta) = 2\sin\theta\cos\theta, \quad \cos(2\theta) = \cos^2\theta - \sin^2\theta
$$

### 2.3 重要角度值

| 角度 | 弧度 | $\sin$ | $\cos$ | $\tan$ |
|------|------|--------|--------|--------|
| 0° | 0 | 0 | 1 | 0 |
| 30° | $\pi/6$ | $1/2$ | $\sqrt{3}/2$ | $\sqrt{3}/3$ |
| 45° | $\pi/4$ | $\sqrt{2}/2$ | $\sqrt{2}/2$ | 1 |
| 60° | $\pi/3$ | $\sqrt{3}/2$ | $1/2$ | $\sqrt{3}$ |
| 90° | $\pi/2$ | 1 | 0 | ∞ |

### 2.4 反三角函数与 atan2

`atan2(y, x)` 返回 $[-\pi, \pi]$，能正确处理所有四个象限，是游戏开发中计算角度的标准函数。

```cpp
float Angle = FMath::Atan2(Y, X); // 弧度，[-π, π]
```

### 2.5 游戏应用

圆周运动、摆动振荡、视野检测：

```cpp
// 圆周运动
FVector CircularMotion(FVector Center, float Radius, float AngularSpeed, float Time)
{
    float Angle = AngularSpeed * Time;
    return Center + FVector(Radius * FMath::Cos(Angle), Radius * FMath::Sin(Angle), 0.0f);
}

// 视野检测
bool IsInFieldOfView(FVector Forward, FVector ToTarget, float FOVDegrees)
{
    float CosAngle = FVector::DotProduct(Forward, ToTarget.GetSafeNormal());
    return CosAngle >= FMath::Cos(FMath::DegreesToRadians(FOVDegrees * 0.5f));
}
```

---

## 三、指数与对数

### 3.1 指数函数

$$
f(x) = a^x \quad (a > 0, a \neq 1)
$$

自然指数 $e^x$，其中 $e = \lim_{n \to \infty}(1 + 1/n)^n \approx 2.71828$。性质：$e^{a+b} = e^a \cdot e^b$，$e^0 = 1$。

### 3.2 对数函数

对数是指数的逆运算：$y = \log_a x \iff a^y = x$。自然对数 $\ln x = \log_e x$。

$$
\ln(ab) = \ln a + \ln b, \quad \ln(a^b) = b\ln a
$$

### 3.3 指数衰减

指数衰减描述量随时间呈指数减少：

$$
f(t) = f_0 \cdot e^{-\lambda t}
$$

半衰期 $T_{1/2} = \ln 2 / \lambda$，时间常数 $\tau = 1/\lambda$。

```cpp
// 帧率无关的平滑插值
float ExponentialSmoothing(float Current, float Target, float Smoothness, float DeltaTime)
{
    float Alpha = 1.0f - FMath::Exp(-Smoothness * DeltaTime);
    return FMath::Lerp(Current, Target, Alpha);
}
```

---

## 四、函数与极限

### 4.1 函数概念

函数 $f: X \to Y$ 将定义域中每个元素映射到值域中的唯一元素。基本性质包括单调性（递增/递减）、奇偶性（$f(-x) = f(x)$ 为偶函数，$f(-x) = -f(x)$ 为奇函数）、周期性（$f(x+T) = f(x)$）。

### 4.2 极限

$$
\lim_{x \to a} f(x) = L
$$

极限存在当且仅当左极限等于右极限。

**重要极限**：

$$
\lim_{x \to 0} \frac{\sin x}{x} = 1, \quad \lim_{x \to \infty}\left(1 + \frac{1}{x}\right)^x = e
$$

$$
\lim_{x \to 0} \frac{e^x - 1}{x} = 1, \quad \lim_{x \to 0} \frac{1 - \cos x}{x^2} = \frac{1}{2}
$$

### 4.3 连续性

函数 $f(x)$ 在 $x = a$ 处连续当且仅当 $\lim_{x \to a} f(x) = f(a)$。

### 4.4 缓动函数

缓动函数让动画更自然，本质是定义在 $[0, 1]$ 上的连续函数：

```cpp
// Smoothstep：在 [0,1] 区间平滑过渡
float SmoothStep(float x)
{
    x = FMath::Clamp(x, 0.0f, 1.0f);
    return x * x * (3.0f - 2.0f * x);
}

// 缓出三次
float EaseOutCubic(float t)
{
    float t1 = t - 1.0f;
    return t1 * t1 * t1 + 1.0f;
}
```

---

## 五、微分学

### 5.1 导数定义

$$
f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}
$$

物理意义：位置的导数是速度，速度的导数是加速度。

**常用导数公式**：

| 函数 | 导数 |
|------|------|
| $c$ | $0$ |
| $x^n$ | $nx^{n-1}$ |
| $\sin x$ | $\cos x$ |
| $\cos x$ | $-\sin x$ |
| $e^x$ | $e^x$ |
| $\ln x$ | $1/x$ |

**运算法则**：加法 $(f+g)' = f' + g'$，乘法 $(fg)' = f'g + fg'$，链式法则 $\frac{d}{dx}f(g(x)) = f'(g(x)) \cdot g'(x)$。

### 5.2 偏导数

对于多元函数 $f(x, y)$，偏导数是固定其他变量后对单一变量的导数：

$$
\frac{\partial f}{\partial x} = \lim_{h \to 0} \frac{f(x+h, y) - f(x, y)}{h}
$$

**Schwarz 定理**（混合偏导相等）：若 $f_{xy}$ 和 $f_{yx}$ 连续，则 $f_{xy} = f_{yx}$。

**全微分**：

$$
df = \frac{\partial f}{\partial x}dx + \frac{\partial f}{\partial y}dy
$$

**多元链式法则**：若 $z = f(u(x,y), v(x,y))$，则：

$$
\frac{\partial z}{\partial x} = \frac{\partial f}{\partial u}\frac{\partial u}{\partial x} + \frac{\partial f}{\partial v}\frac{\partial v}{\partial x}
$$

**隐函数求导**：对 $F(x, y) = 0$：

$$
\frac{dy}{dx} = -\frac{F_x}{F_y} \quad (F_y \neq 0)
$$

### 5.3 梯度与方向导数

梯度是所有偏导数组成的向量，指向函数增长最快的方向：

$$
\nabla f = \left(\frac{\partial f}{\partial x}, \frac{\partial f}{\partial y}, \frac{\partial f}{\partial z}\right)
$$

方向导数是梯度在方向 $\mathbf{u}$ 上的投影：

$$
D_{\mathbf{u}} f = \nabla f \cdot \mathbf{u}
$$

```cpp
// 地形法线：由高度梯度得到
FVector GetTerrainNormal(FVector2D Pos)
{
    float h = 0.1f;
    float Hx = (GetHeight(Pos + FVector2D(h, 0)) - GetHeight(Pos - FVector2D(h, 0))) / (2 * h);
    float Hy = (GetHeight(Pos + FVector2D(0, h)) - GetHeight(Pos - FVector2D(0, h))) / (2 * h);
    return FVector(-Hx, -Hy, 1.0f).GetSafeNormal();
}
```

### 5.4 雅可比矩阵

向量函数 $\mathbf{F}: \mathbb{R}^n \to \mathbb{R}^m$ 的雅可比矩阵是一阶偏导数矩阵：

$$
J = \begin{pmatrix} \frac{\partial f_1}{\partial x_1} & \cdots & \frac{\partial f_1}{\partial x_n} \\ \vdots & \ddots & \vdots \\ \frac{\partial f_m}{\partial x_1} & \cdots & \frac{\partial f_m}{\partial x_n} \end{pmatrix}
$$

雅可比行列式描述坐标变换的体积缩放因子。极坐标变换 $x = r\cos\theta, y = r\sin\theta$ 的雅可比行列式为 $r$——这就是极坐标积分乘 $r$ 的原因。

详见&#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299;。

### 5.5 海森矩阵

标量函数 $f: \mathbb{R}^n \to \mathbb{R}$ 的海森矩阵是二阶偏导数矩阵：

$$
H = \begin{pmatrix} f_{xx} & f_{xy} \\ f_{yx} & f_{yy} \end{pmatrix}
$$

由 Schwarz 定理，$H$ 是对称矩阵。特征值决定曲率：全正为局部最小值，全负为局部最大值，有正有负为鞍点。

二阶泰勒展开：

$$
f(\mathbf{x} + \Delta\mathbf{x}) \approx f(\mathbf{x}) + \nabla f^T \Delta\mathbf{x} + \frac{1}{2}\Delta\mathbf{x}^T H \Delta\mathbf{x}
$$

详见&#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299;。

### 5.6 高阶导数与拉普拉斯算子

二阶导数描述变化率的变化（急动度 Jerk 为三阶）。拉普拉斯算子是梯度的散度：

$$
\nabla^2 f = \frac{\partial^2 f}{\partial x^2} + \frac{\partial^2 f}{\partial y^2} + \frac{\partial^2 f}{\partial z^2}
$$

应用：热传导、流体扩散、网格平滑。

```cpp
// 拉普拉斯平滑：顶点移向邻居平均位置
FVector SmoothVertex(FVector Center, TArray<FVector> Neighbors)
{
    FVector Average = FVector::ZeroVector;
    for (const FVector& N : Neighbors) Average += N;
    Average /= Neighbors.Num();
    return Center + 0.5f * (Average - Center);
}
```

### 5.7 微分中值定理

**罗尔定理**：若 $f$ 在 $[a,b]$ 连续、$(a,b)$ 可导且 $f(a) = f(b)$，则存在 $c \in (a,b)$ 使 $f'(c) = 0$。

**拉格朗日中值定理**：若 $f$ 在 $[a,b]$ 连续、$(a,b)$ 可导，则存在 $c \in (a,b)$ 使：

$$
f'(c) = \frac{f(b) - f(a)}{b - a}
$$

物理意义：某时刻瞬时速度等于平均速度。

**柯西中值定理**：$\frac{f'(c)}{g'(c)} = \frac{f(b)-f(a)}{g(b)-g(a)}$，是洛必达法则的基础。

### 5.8 洛必达法则

对于 $\frac{0}{0}$ 或 $\frac{\infty}{\infty}$ 型不定式：

$$
\lim_{x \to a} \frac{f(x)}{g(x)} = \lim_{x \to a} \frac{f'(x)}{g'(x)}
$$

```cpp
// 数值稳定：避免 0/0
float SafeSinc(float x)
{
    if (FMath::Abs(x) < 1e-4f)
        return 1.0f - x * x / 6.0f; // 洛必达结果
    return FMath::Sin(x) / x;
}
```

### 5.9 泰勒级数

函数 $f(x)$ 在 $x = a$ 处的泰勒展开：

$$
f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!}(x-a)^n
$$

麦克劳林级数（$a = 0$）：

$$
e^x = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \cdots
$$

$$
\sin x = x - \frac{x^3}{3!} + \frac{x^5}{5!} - \cdots
$$

$$
\cos x = 1 - \frac{x^2}{2!} + \frac{x^4}{4!} - \cdots
$$

```cpp
// 快速 sin 近似（小角度）
float FastSin(float x)
{
    float x2 = x * x;
    return x - x2 * x / 6.0f + x2 * x2 * x / 120.0f;
}

// 快速开方倒数（Quake III 算法）
float FastInvSqrt(float x)
{
    float halfx = 0.5f * x;
    int i = *(int*)&x;
    i = 0x5f3759df - (i >> 1);
    float y = *(float*)&i;
    y = y * (1.5f - halfx * y * y); // 牛顿迭代
    return y;
}
```

### 5.10 傅里叶级数

周期为 $T$ 的函数可表示为正弦余弦之和：

$$
f(x) = \frac{a_0}{2} + \sum_{n=1}^{\infty}\left[a_n\cos(n\omega x) + b_n\sin(n\omega x)\right]
$$

复数形式：$f(x) = \sum_{n=-\infty}^{\infty} c_n e^{in\omega x}$。

应用：波形合成、音频效果、地形纹理生成。

---

## 六、积分学

### 6.1 不定积分

积分是导数的逆运算：

$$
\int f(x)\,dx = F(x) + C \quad (F'(x) = f(x))
$$

| 函数 | 不定积分 |
|------|----------|
| $x^n$ ($n \neq -1$) | $\frac{x^{n+1}}{n+1} + C$ |
| $1/x$ | $\ln\|x\| + C$ |
| $e^x$ | $e^x + C$ |
| $\sin x$ | $-\cos x + C$ |
| $\cos x$ | $\sin x + C$ |

### 6.2 定积分与微积分基本定理

**Newton-Leibniz 公式**：

$$
\int_a^b f(x)\,dx = F(b) - F(a)
$$

**积分中值定理**：存在 $\xi \in [a,b]$ 使 $\int_a^b f(x)\,dx = f(\xi)(b-a)$。

### 6.3 换元积分法

**第一类换元（凑微分）**：

$$
\int f[\phi(x)]\phi'(x)\,dx = F[\phi(x)] + C
$$

例：$\int 2x\,e^{x^2}\,dx$，令 $u = x^2$，则 $\int e^u\,du = e^{x^2} + C$。

**第二类换元（三角换元）**：

- 含 $\sqrt{a^2 - x^2}$：令 $x = a\sin t$
- 含 $\sqrt{a^2 + x^2}$：令 $x = a\tan t$
- 含 $\sqrt{x^2 - a^2}$：令 $x = a\sec t$

### 6.4 分部积分法

$$
\int u\,dv = uv - \int v\,du
$$

例：$\int x e^x\,dx = xe^x - e^x + C$。

循环积分例：$\int e^x \sin x\,dx$，两次分部后得 $I = \frac{e^x(\sin x - \cos x)}{2} + C$。

### 6.5 数值积分

**矩形法**：$\int_a^b f(x)\,dx \approx \sum f(x_i)\Delta x$

**梯形法**：

$$
\int_a^b f(x)\,dx \approx \frac{\Delta x}{2}\sum_{i=0}^{n-1}[f(x_i) + f(x_{i+1})]
$$

**辛普森法则**（高精度）：

$$
\int_a^b f(x)\,dx \approx \frac{\Delta x}{3}\left[f(x_0) + 4\sum_{\text{odd}} f(x_i) + 2\sum_{\text{even}} f(x_i) + f(x_n)\right]
$$

```cpp
float SimpsonsIntegration(TFunction<float(float)> Function, float a, float b, int Steps)
{
    ensure(Steps % 2 == 0);
    float dx = (b - a) / Steps;
    float Sum = Function(a) + Function(b);
    for (int i = 1; i < Steps; i += 2) Sum += 4.0f * Function(a + i * dx);
    for (int i = 2; i < Steps; i += 2) Sum += 2.0f * Function(a + i * dx);
    return Sum * dx / 3.0f;
}
```

### 6.6 多重积分

**二重积分**：

$$
\iint_D f(x, y)\,dA = \int_a^b \int_{g_1(x)}^{g_2(x)} f(x, y)\,dy\,dx
$$

**极坐标**：$dA = r\,dr\,d\theta$（雅可比行列式）。

**三重积分**：球坐标 $dV = \rho^2 \sin\phi\,d\rho\,d\phi\,d\theta$。

应用：质心 $\bar{x} = \frac{\iiint x\rho\,dV}{\iiint \rho\,dV}$，转动惯量 $I = \iiint r^2 \rho\,dV$。

### 6.7 曲线积分与曲面积分

**第一类曲线积分**（对弧长）：

$$
\int_C f(x,y)\,ds = \int_a^b f(x(t),y(t))\sqrt{x'^2 + y'^2}\,dt
$$

**第二类曲线积分**（对坐标，力沿路径做功）：

$$
\int_C \mathbf{F} \cdot d\mathbf{r} = \int_a^b \mathbf{F}(\mathbf{r}(t)) \cdot \mathbf{r}'(t)\,dt
$$

**Green 公式**：

$$
\oint_C P\,dx + Q\,dy = \iint_D \left(\frac{\partial Q}{\partial x} - \frac{\partial P}{\partial y}\right)dA
$$

**Gauss 散度定理**：

$$
\iiint_\Omega \nabla \cdot \mathbf{F}\,dV = \oiint_{\partial\Omega} \mathbf{F} \cdot d\mathbf{S}
$$

**Stokes 公式**：

$$
\iint_S (\nabla \times \mathbf{F}) \cdot d\mathbf{S} = \oint_{\partial S} \mathbf{F} \cdot d\mathbf{r}
$$

---

## 七、向量微积分

### 7.1 梯度

$$
\nabla f = \left(\frac{\partial f}{\partial x}, \frac{\partial f}{\partial y}, \frac{\partial f}{\partial z}\right)
$$

梯度指向函数增长最快方向，垂直于等值面。运算法则：$\nabla(fg) = f\nabla g + g\nabla f$。

### 7.2 散度

$$
\nabla \cdot \mathbf{F} = \frac{\partial P}{\partial x} + \frac{\partial Q}{\partial y} + \frac{\partial R}{\partial z}
$$

$\nabla \cdot \mathbf{F} > 0$ 为源（发散），$< 0$ 为汇（收敛），$= 0$ 为无源场（不可压缩流体）。

### 7.3 旋度

$$
\nabla \times \mathbf{F} = \left(\frac{\partial R}{\partial y} - \frac{\partial Q}{\partial z}, \frac{\partial P}{\partial z} - \frac{\partial R}{\partial x}, \frac{\partial Q}{\partial x} - \frac{\partial P}{\partial y}\right)
$$

$\nabla \times \mathbf{F} = \mathbf{0}$ 为保守场/无旋场。流体力学中表示涡量。

### 7.4 重要恒等式

$$
\nabla \times (\nabla f) = \mathbf{0} \quad \text{（梯度场无旋）}
$$

$$
\nabla \cdot (\nabla \times \mathbf{F}) = 0 \quad \text{（旋度场无散）}
$$

$$
\nabla \times (\nabla \times \mathbf{F}) = \nabla(\nabla \cdot \mathbf{F}) - \nabla^2 \mathbf{F}
$$

### 7.5 保守场

向量场 $\mathbf{F}$ 是保守场当且仅当存在势函数 $\phi$ 使 $\mathbf{F} = \nabla\phi$，等价于 $\nabla \times \mathbf{F} = \mathbf{0}$（单连通区域），且曲线积分与路径无关。

---

## 八、参考文献

1. Stewart, J. *Calculus: Early Transcendentals*. ——标准微积分教材。
2. Strang, G. *Calculus*. MIT OpenCourseWare. ——免费在线教材。
3. &#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299; — ODE 与数值积分方法。
4. &#12298;[偏微分方程与数值离散详解](/knowledge/partial-differential-equations/)&#12299; — PDE 与有限差分。
5. &#12298;[高等数学符号速查详解](/knowledge/mathematical-notation-reference/)&#12299; — 数学符号书写规范。
6. &#12298;[雅可比矩阵详解](/knowledge/jacobian-matrix/)&#12299; — 雅可比矩阵深拆。
7. &#12298;[海森矩阵详解](/knowledge/hessian-matrix/)&#12299; — 海森矩阵深拆。
