---
title: "雅可比矩阵：从导数到机器人、飞控与游戏物理的统一数学语言"
excerpt: "从单变量导数出发，积木式地搭建出雅可比矩阵的完整理解，并补齐两份原始笔记缺失的关键知识：IK 的伪逆与阻尼最小二乘、物理引擎约束求解器的 J·M⁻¹·Jᵀ 核心、SVD 与可操作度、反向传播即雅可比链式法则。打通机器人运动学、飞控状态空间线性化与游戏物理约束求解背后同一套数学框架。"
date: "2026-06-25"
category: "Mathematics"
subtopic: "LinearAlgebra"
tags: ["数学", "线性代数", "雅可比"]
readTime: "阅读约40分钟"
---

## 一、从导数到雅可比：积木式构建

### 1.1 第一块积木：单变量导数

万事从最简单的函数开始：

$$
y = f(x)
$$

导数回答一个问题：**当 $x$ 抖动一点点，$y$ 跟着抖多少？**

$$
f'(x) = \lim_{\Delta x \to 0} \frac{\Delta y}{\Delta x}
$$

例如 $y = x^2$，则 $f'(x) = 2x$。在 $x = 3$ 处，$f'(3) = 6$，意思是 $x$ 增加 $0.01$ 时，$y$ 大约增加 $0.06$。

此时导数只是一个**标量**，可以看作 $1 \times 1$ 的"最小矩阵"。

### 1.2 第二块积木：线性近似

导数还有一个更重要的解释——**局部线性化**。在 $x = a$ 附近：

$$
\Delta y \approx f'(a)\,\Delta x \quad\Longleftrightarrow\quad f(x) \approx f(a) + f'(a)(x - a)
$$

这就是一阶泰勒展开。曲线 $y = x^2$ 在 $x = 3$ 附近"看起来像"一条直线 $y \approx 9 + 6(x-3)$。**雅可比矩阵的全部意义，就是把这个"局部用直线代替曲线"的思想推广到多维。**

### 1.3 第三块积木：多个输入与偏导数

现实世界几乎没有只受一个输入控制的系统。矩形面积：

$$
A = w \cdot h
$$

输入是 $(w, h)$，输出是 $A$。面积同时受宽度和高度影响。我们分别固定一个变量、只让另一个变化：

$$
\frac{\partial A}{\partial w} = h, \qquad \frac{\partial A}{\partial h} = w
$$

$\partial$ 表示"只让一个变量动，其余按住不动"，这就是**偏导数**。

### 1.4 第四块积木：梯度

把所有偏导收进一个行向量，得到**梯度**：

$$
\nabla A = \begin{bmatrix} \dfrac{\partial A}{\partial w} & \dfrac{\partial A}{\partial h} \end{bmatrix} = \begin{bmatrix} h & w \end{bmatrix}
$$

梯度告诉我们：**朝哪个方向走，输出上升最快**。此时我们拥有了一个 $1 \times 2$ 的矩阵。

### 1.5 第五块积木：多个输出（向量值函数）

前面都是"进来一堆，出去一个"。如果"出去也一堆"呢？考虑一个平面坐标变换：

$$
\begin{cases}
x = u^2 - v \\
y = u + v^2
\end{cases}
\quad\Longleftrightarrow\quad
\mathbf{F}(u, v) = \begin{bmatrix} f_1(u,v) \\ f_2(u,v) \end{bmatrix} = \begin{bmatrix} u^2 - v \\ u + v^2 \end{bmatrix}
$$

输入 $(u, v)$，输出 $(x, y)$，即 $\mathbb{R}^2 \to \mathbb{R}^2$。此时**每一个输出分量都有自己的梯度**，单个梯度向量已经装不下所有变化率了。

### 1.6 第六块积木：正式组装——雅可比矩阵

对每个输出分别求偏导，再把它们的梯度行向量**纵向堆叠**：

- 对 $x$：$\begin{bmatrix} \dfrac{\partial x}{\partial u} & \dfrac{\partial x}{\partial v} \end{bmatrix} = \begin{bmatrix} 2u & -1 \end{bmatrix}$
- 对 $y$：$\begin{bmatrix} \dfrac{\partial y}{\partial u} & \dfrac{\partial y}{\partial v} \end{bmatrix} = \begin{bmatrix} 1 & 2v \end{bmatrix}$

摞在一起：

$$
\mathbf{J} = \begin{bmatrix} 2u & -1 \\ 1 & 2v \end{bmatrix}
$$

**这就是雅可比矩阵（Jacobian Matrix）。**

---

## 二、正式定义

设函数 $\mathbf{f}: \mathbb{R}^n \to \mathbb{R}^m$，输入 $\mathbf{x} = (x_1, \dots, x_n)$，输出 $\mathbf{y} = \mathbf{f}(\mathbf{x}) = (f_1, \dots, f_m)$。**雅可比矩阵** $\mathbf{J} \in \mathbb{R}^{m \times n}$ 的第 $i$ 行第 $j$ 列元素为：

$$
\boxed{\,J_{ij} = \frac{\partial f_i}{\partial x_j}\,}
$$

完整展开：

$$
\mathbf{J} = \frac{\partial \mathbf{y}}{\partial \mathbf{x}} = \begin{bmatrix}
\dfrac{\partial f_1}{\partial x_1} & \dfrac{\partial f_1}{\partial x_2} & \cdots & \dfrac{\partial f_1}{\partial x_n} \\[6pt]
\dfrac{\partial f_2}{\partial x_1} & \dfrac{\partial f_2}{\partial x_2} & \cdots & \dfrac{\partial f_2}{\partial x_n} \\[6pt]
\vdots & \vdots & \ddots & \vdots \\[6pt]
\dfrac{\partial f_m}{\partial x_1} & \dfrac{\partial f_m}{\partial x_2} & \cdots & \dfrac{\partial f_m}{\partial x_n}
\end{bmatrix}
$$

> **记忆口诀**：**行**是输出（$f_i$ 往下数），**列**是输入（$x_j$ 往右数）。每一行就是该输出分量的梯度。

### 一个具体例子

$$
\begin{cases}
f_1(x, y) = x^2 + y \\
f_2(x, y) = y^2 - x
\end{cases}
\Longrightarrow\quad
\mathbf{J} = \begin{bmatrix} 2x & 1 \\ -1 & 2y \end{bmatrix}
$$

---

## 三、核心意义：局部线性化

雅可比矩阵最重要的作用是**多维空间中的线性近似**。在单变量里我们用切线近似曲线，在多维里雅可比矩阵就是那个"切平面"：

$$
\boxed{\,\mathbf{f}(\mathbf{x} + \Delta\mathbf{x}) \approx \mathbf{f}(\mathbf{x}) + \mathbf{J}\,\Delta\mathbf{x}\,}
$$

- $\Delta\mathbf{x}$ 是输入空间走的"步子"；
- 乘以 $\mathbf{J}$ 后，变成输出空间走的"步子" $\Delta\mathbf{y} \approx \mathbf{J}\,\Delta\mathbf{x}$；
- 它精确描述了输入空间的微小变形，是如何传递到输出空间的。

> **本质**：雅可比矩阵是非线性函数在某一点的**局部线性映射**。把一个可能极其复杂的非线性系统，在"当前状态"附近近似成一个"矩阵乘法"——而矩阵乘法是线性的、可逆的、可分析的，这正是它能被工程驾驭的原因。

### 多元链式法则 = 雅可比矩阵相乘

这是常被忽略却极重要的一点。单变量链式法则 $\dfrac{dz}{dx} = \dfrac{dz}{dy}\cdot\dfrac{dy}{dx}$ 在多维下的推广，**就是雅可比矩阵的乘法**：若 $\mathbf{z} = \mathbf{f}(\mathbf{y})$，$\mathbf{y} = \mathbf{g}(\mathbf{x})$，则

$$
\mathbf{J}_{\mathbf{f}\circ\mathbf{g}} = \mathbf{J}_{\mathbf{f}} \cdot \mathbf{J}_{\mathbf{g}}
$$

复合函数的雅可比 = 各层雅可比相乘。**这条规则是反向传播、误差反向传递、IK 迭代求逆的数学根基**，后文会反复用到。

---

## 四、几何意义

### 4.1 局部坐标变换：小圆变椭圆

考虑输入空间 $(u,v)$ 与输出空间 $(x,y)$ 之间的映射。一个微小位移 $d\mathbf{q} = \begin{bmatrix} du \\ dv \end{bmatrix}$ 经过雅可比变换：

$$
d\mathbf{p} = \mathbf{J}\,d\mathbf{q}
$$

几何上，输入空间里的一个**小圆**，经过 $\mathbf{J}$ 后变成一个**小椭圆**。雅可比矩阵编码了四种局部变形：**拉伸、压缩、旋转、剪切**。它本质上是一个**局部坐标变换矩阵**。

### 4.2 雅可比行列式：面积/体积缩放因子

当输入维度等于输出维度（$m = n$，方阵），可以计算行列式 $\det(\mathbf{J})$，称为**雅可比行列式**：

- $|\det(\mathbf{J})| = 1$：局部面积/体积保持不变（纯旋转）；
- $|\det(\mathbf{J})| > 1$：面积/体积被放大；
- $|\det(\mathbf{J})| = 0$：该点发生**降维挤压**（如三维被压成二维曲面），函数在该点不可逆——这就是**奇异点**。

这正是换元积分（重积分）中多出来的因子：极坐标换元 $x = r\cos\theta,\ y = r\sin\theta$ 时，

$$
\det(\mathbf{J}) = \begin{vmatrix} \cos\theta & -r\sin\theta \\ \sin\theta & r\cos\theta \end{vmatrix} = r
\qquad\Longrightarrow\qquad
dx\,dy = r\,dr\,d\theta
$$

那个多出来的 $r$，就是雅可比行列式。

### 4.3 SVD、速度椭球与可操作度（补充）

对雅可比矩阵做奇异值分解：

$$
\mathbf{J} = \mathbf{U}\,\boldsymbol{\Sigma}\,\mathbf{V}^{\mathsf T}
$$

其中 $\boldsymbol{\Sigma}$ 的对角元 $\sigma_1 \geq \sigma_2 \geq \dots \geq \sigma_r > 0$ 是奇异值。这套分解给出了雅可比最深刻的几何图像：

- 输入空间（关节速度空间）里的**单位球**，经 $\mathbf{J}$ 映射后变成输出空间（末端速度空间）里的一个**椭球**——称为**速度椭球**（velocity ellipsoid）。
- 椭球的主轴长度正是奇异值 $\sigma_i$。
- $\sigma_{\min}$ 最小的方向，就是末端**最难运动**的方向；当 $\sigma_{\min} \to 0$，椭球被压扁，系统接近**奇异**。
- **可操作度**（manipulability，吉田指数）衡量机械臂在当前位形下"动作有多灵活"：

$$
w = \sqrt{\det(\mathbf{J}\mathbf{J}^{\mathsf T})} = \sigma_1 \sigma_2 \cdots \sigma_r
$$

$w$ 越大越灵活；$w = 0$ 即处于奇异位形。许多机械臂控制策略会主动**最大化** $w$，以远离奇异点。

### 4.4 奇异点（补充）

奇异点是雅可比矩阵**降秩**的位形，工程上有两类常见表现：

1. **边界奇异**：机械臂完全伸直（"够远了"），无法再向外伸展——关节速度无法在该方向产生末端速度。
2. **内部奇异**：两个关节轴线对齐（如肘部锁死），末端失去某方向的自由度。

奇异时 $\det(\mathbf{J}) = 0$，直接求逆会爆炸（关节速度趋于无穷）。这正是下一节"阻尼最小二乘"要解决的问题。

---

## 五、逆问题：IK 求解的核心（补充）

> 这是原始笔记缺失的最关键一节。前文只讲了"正向"：已知关节速度 $\dot{\mathbf{q}}$，求末端速度 $\dot{\mathbf{x}} = \mathbf{J}\dot{\mathbf{q}}$。但工程里更常需要"逆向"：**已知想让末端怎么动，反推关节该怎么动**——即逆运动学（IK）。

### 5.1 正向与逆向

正向运动学：$\mathbf{x} = f(\mathbf{q})$，对时间求导：

$$
\dot{\mathbf{x}} = \mathbf{J}(\mathbf{q})\,\dot{\mathbf{q}}
$$

逆向 IK 想解的是：

$$
\dot{\mathbf{q}} = \mathbf{J}^{-1}\,\dot{\mathbf{x}}
$$

但 $\mathbf{J}$ 往往不是方阵（关节数 $n$ 与任务维度 $m$ 不等），或虽是方阵却在奇异点降秩。于是衍生出三种实用解法。

### 5.2 方阵直接求逆

当 $m = n$ 且 $\mathbf{J}$ 非奇异，直接 $\dot{\mathbf{q}} = \mathbf{J}^{-1}\dot{\mathbf{x}}$。最精确，但**奇异点处爆炸**，实际工程几乎不裸用。

### 5.3 伪逆（Moore-Penrose）

当 $\mathbf{J}$ 非方阵或奇异，用伪逆 $\mathbf{J}^{+}$ 代替 $\mathbf{J}^{-1}$：

$$
\dot{\mathbf{q}} = \mathbf{J}^{+}\,\dot{\mathbf{x}}, \qquad
\mathbf{J}^{+} = \mathbf{J}^{\mathsf T}(\mathbf{J}\mathbf{J}^{\mathsf T})^{-1}
\quad(\text{冗余臂 } n > m,\ \text{宽矩阵})
$$

伪逆给出**最小范数解**——在所有能产生期望末端速度的关节速度中，选关节速度本身最小的那个（节省能量、避免自碰撞）。但它**仍然在奇异点附近数值不稳**。

### 5.4 阻尼最小二乘 DLS（奇异鲁棒）

在 $\mathbf{J}\mathbf{J}^{\mathsf T}$ 上加一个阻尼项 $\lambda^2 \mathbf{I}$，把零奇异值"垫起来"：

$$
\boxed{\,\dot{\mathbf{q}} = \mathbf{J}^{\mathsf T}\bigl(\mathbf{J}\mathbf{J}^{\mathsf T} + \lambda^2 \mathbf{I}\bigr)^{-1}\dot{\mathbf{x}}\,}
$$

- $\lambda$ 越大越稳定但跟踪误差越大；$\lambda \to 0$ 退化为伪逆。
- DLS 在奇异点附近**平滑退化**而非爆炸，是游戏与机器人 IK 的事实标准（UE 的 FABRIK/CCD 之外的解析解算常配 DLS）。
- 它等价于最小化 $\|\mathbf{J}\dot{\mathbf{q}} - \dot{\mathbf{x}}\|^2 + \lambda^2\|\dot{\mathbf{q}}\|^2$——"既贴近目标，又别让关节速度太大"。

### 5.5 雅可比转置法（最廉价）

连矩阵求逆都不要。直接：

$$
\Delta\mathbf{q} = \alpha\,\mathbf{J}^{\mathsf T}\,\Delta\mathbf{x}
$$

其中 $\Delta\mathbf{x}$ 是末端到目标的误差向量，$\alpha$ 是步长。**为什么这能收敛？** 因为 $\mathbf{J}^{\mathsf T}\Delta\mathbf{x}$ 正是误差能量 $E = \tfrac{1}{2}\|\mathbf{f}(\mathbf{q}) - \mathbf{x}_{\text{target}}\|^2$ 对 $\mathbf{q}$ 的**梯度**——所以雅可比转置法本质就是**梯度下降**：每次沿"最快减小末端误差"的方向挪动关节。

- 优点：无需矩阵求逆，计算极廉价，天然稳定，永不爆炸。
- 缺点：收敛慢、末端不走直线、靠近目标时抖动。很多实时游戏 IK 用它就是图"便宜又不会崩"。

> 三种方法的取舍：**转置法**最便宜最稳但精度差；**伪逆**最准但奇异处不稳；**DLS** 是精度与稳定性的最佳折中。这是游戏 IK 选型的核心决策点。

---

## 六、应用一：运动学雅可比（机器人与动画 IK）

这是最经典的应用。机械臂关节角 $\mathbf{q} = [q_1, q_2, \dots, q_n]^{\mathsf T}$，末端位置 $\mathbf{x} = f(\mathbf{q})$。对时间求导：

$$
\dot{\mathbf{x}} = \mathbf{J}(\mathbf{q})\,\dot{\mathbf{q}} \quad\Longleftrightarrow\quad \mathbf{v} = \mathbf{J}(\mathbf{q})\,\boldsymbol{\omega}
$$

其中 $\mathbf{v}$ 是末端速度，$\boldsymbol{\omega}$ 是关节速度。**雅可比把关节空间速度映射到任务空间速度。**

它的逆向（第五节的方法）直接驱动：IK 求解、Motion Matching 姿态校正、攀爬系统手脚 IK、UE Mover 的足部落地。任何"让骨骼末端去够某个点"的逻辑，底层都是 $\mathbf{J}^{-1}$ 或 $\mathbf{J}^{\mathsf T}$ 或 DLS。

---

## 七、应用二：动力学雅可比（飞控与控制）

### 7.1 状态空间线性化

飞控的状态方程：

$$
\dot{\mathbf{x}} = f(\mathbf{x}, \mathbf{u})
$$

其中 $\mathbf{x} = [\mathbf{p}, \mathbf{v}, \mathbf{q}, \boldsymbol{\omega}]^{\mathsf T}$（位置、速度、姿态、角速度），$\mathbf{u}$ 是控制输入。为了设计线性控制器（LQR、MPC），需在工作点 $(\mathbf{x}_0, \mathbf{u}_0)$ 附近线性化：

$$
\delta\dot{\mathbf{x}} = \mathbf{A}\,\delta\mathbf{x} + \mathbf{B}\,\delta\mathbf{u}
$$

其中两个矩阵**本质上都是雅可比矩阵**：

$$
\mathbf{A} = \frac{\partial f}{\partial \mathbf{x}}\bigg|_{\mathbf{x}_0,\mathbf{u}_0}, \qquad
\mathbf{B} = \frac{\partial f}{\partial \mathbf{u}}\bigg|_{\mathbf{x}_0,\mathbf{u}_0}
$$

$\mathbf{A}$ 是对状态的雅可比，$\mathbf{B}$ 是对输入的雅可比。LQR 求解、EKF 协方差传播、MPC 预测，全部建立在这两个矩阵之上。

### 7.2 多旋翼混控：控制分配矩阵

对矢量推力无人机，四个旋翼的推力 $\mathbf{u} = [T_1, T_2, T_3, T_4]^{\mathsf T}$ 产生的机体合力旋量 $\mathbf{W} = [F_x, F_y, F_z, M_x, M_y, M_z]^{\mathsf T}$：

$$
\mathbf{W} = f(\mathbf{u}) \quad\Longrightarrow\quad \Delta\mathbf{W} = \mathbf{J}\,\Delta\mathbf{u}, \qquad \mathbf{J} = \frac{\partial \mathbf{W}}{\partial \mathbf{u}}
$$

这个雅可比 $\mathbf{J}$ 在飞控里有个专门名字——**控制分配矩阵（Control Allocation Matrix / 混控矩阵）**。它把"我想要多大的合力/力矩"翻译成"四个电机各出多少力"。对常规布局它常是常数矩阵（因映射本身线性），但变距矢量推力下它随状态变化，需要实时更新。

---

## 八、应用三：约束雅可比（游戏物理引擎）

这是游戏物理引擎求解器的**心脏**，原始笔记只点到 $\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}$，这里补齐整个求解链路。

### 8.1 约束与约束雅可比

物理引擎里用代数约束描述铰链、球关节、地面接触、距离约束等：

$$
C(\mathbf{x}) = 0
$$

对时间求导，把位置约束变成速度约束：

$$
\dot{C} = \frac{\partial C}{\partial \mathbf{x}}\,\dot{\mathbf{x}} = \mathbf{J}\,\mathbf{v}
$$

其中 $\mathbf{J} = \dfrac{\partial C}{\partial \mathbf{x}}$ 就是**约束雅可比**，$\mathbf{v}$ 是刚体速度。Chaos、PhysX、Bullet、MuJoCo 统一使用这套约束雅可比。

### 8.2 约束力与有效质量矩阵（补充核心）

约束要起作用，必须产生一个**约束力**。达朗贝尔原理要求约束力**不做虚功**，这迫使约束力取如下形式：

$$
\mathbf{F}_c = \mathbf{J}^{\mathsf T}\boldsymbol{\lambda}
$$

其中 $\boldsymbol{\lambda}$ 是拉格朗日乘子（约束力的"强度"）。注意这里又是 $\mathbf{J}^{\mathsf T}$——和 IK 转置法同样的转置出现，因为它们同源于"把任务空间的量映射回状态空间"的对偶关系。

把约束力代入运动方程 $\mathbf{M}\dot{\mathbf{v}} = \mathbf{F}_{\text{ext}} + \mathbf{J}^{\mathsf T}\boldsymbol{\lambda}$，结合速度约束 $\mathbf{J}\mathbf{v}_{\text{new}} = \mathbf{0}$，求解 $\boldsymbol{\lambda}$ 时会出现一个关键矩阵——**有效质量矩阵**：

$$
\boxed{\,\mathbf{K} = \mathbf{J}\,\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\,}
$$

于是约束冲量的求解化为一个小线性系统：

$$
\boldsymbol{\lambda} = \mathbf{K}^{-1}\bigl(-\mathbf{J}\mathbf{v} - \text{bias}\bigr)
$$

更新速度：

$$
\mathbf{v}_{\text{new}} = \mathbf{v} + \mathbf{M}^{-1}\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}
$$

这就是 **Box2D/PhysX 的 Sequential Impulse（顺序冲量法）**、Chaos 的 PBGS（投影高斯-赛德尔）的统一数学内核：每帧把所有约束排成 $\mathbf{J}$，迭代解 $\mathbf{K}\boldsymbol{\lambda}$，再用 $\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}$ 把冲量加回刚体。约束越硬，$\mathbf{K}$ 越大，冲量越大—— stiffness 就藏在这个矩阵里。

> 一句话：**游戏物理引擎的约束求解 = 反复算 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ 并求逆。** 你在编辑器里调的"线性驱动""角驱动""软约束""质量比"，本质上都在影响这个矩阵。

---

## 九、应用四：神经网络反向传播（补充）

原始笔记提到雅可比用于机器学习反向传播但未展开。这里补齐这条线索——它和前几节是**同一个数学结构**。

神经网络一层的前向传播：$\mathbf{z}^{(l+1)} = \sigma(\mathbf{W}^{(l)}\mathbf{z}^{(l)})$。这一层把输入 $\mathbf{z}^{(l)}$ 映射到输出 $\mathbf{z}^{(l+1)}$，是一个向量值函数，它的**雅可比矩阵**为：

$$
\frac{\partial \mathbf{z}^{(l+1)}}{\partial \mathbf{z}^{(l)}} = \operatorname{diag}(\boldsymbol{\sigma}')\,\mathbf{W}^{(l)}
$$

由第三节的链式法则 $\mathbf{J}_{\mathbf{f}\circ\mathbf{g}} = \mathbf{J}_{\mathbf{f}}\cdot\mathbf{J}_{\mathbf{g}}$，损失 $L$ 对最深层输入的梯度，等于**沿途各层雅可比相乘**。反向传播做的正是这件事——只不过它从不显式构造巨大的雅可比矩阵，而是用**向量-雅可比积（VJP）**逐层反推：

$$
\frac{\partial L}{\partial \mathbf{z}^{(l)}} = \frac{\partial L}{\partial \mathbf{z}^{(l+1)}} \cdot \frac{\partial \mathbf{z}^{(l+1)}}{\partial \mathbf{z}^{(l)}} = \bigl(\mathbf{W}^{(l)}\bigr)^{\mathsf T}\!\left(\boldsymbol{\sigma}' \odot \frac{\partial L}{\partial \mathbf{z}^{(l+1)}}\right)
$$

那个 $\mathbf{W}^{\mathsf T}$ 又出现了——和 IK 转置法、约束力 $\mathbf{J}^{\mathsf T}\boldsymbol{\lambda}$ 是**同一个转置**：把"后一层的误差/力"映射回"前一层的梯度/冲量"。PyTorch、JAX 的自动微分引擎，本质上就是高效地计算这些雅可比积，而不把雅可比矩阵物化出来。

---

## 十、数值雅可比 vs 解析雅可比（补充）

实际工程中雅可比从哪来？两条路：

| 方法 | 做法 | 优点 | 缺点 |
|:---|:---|:---|:---|
| **解析雅可比** | 对 $f$ 符号求导，手推或代码生成公式 | 精确、快、无误差积累 | 推导繁琐、易错，改函数要重推 |
| **数值雅可比** | 用有限差分近似：$J_{ij} \approx \dfrac{f_i(\mathbf{x} + h\mathbf{e}_j) - f_i(\mathbf{x})}{h}$ | 通用、无需知道 $f$ 内部结构 | 有截断误差，对噪声敏感，$n$ 维要算 $n+1$ 次 $f$ |

数值法里**中心差分** $\dfrac{f(\mathbf{x}+h\mathbf{e}_j) - f(\mathbf{x}-h\mathbf{e}_j)}{2h}$ 精度更高（误差 $O(h^2)$ 而非 $O(h)$）。游戏引擎里约束雅可比多为解析（约束形式已知可求导）；复杂角色 IK 的雅可比有时用数值法图省事。选择取决于：精度需求、$f$ 是否可解析、性能预算。

---

## 十一、统一视角与总结

### 雅可比矩阵的"四副面孔"

| 面孔 | 公式 | 领域 | 用途 |
|:---|:---|:---|:---|
| 运动学雅可比 | $\mathbf{v} = \mathbf{J}(\mathbf{q})\dot{\mathbf{q}}$ | 机器人/动画 | IK、Motion Matching、攀爬、Mover |
| 动力学雅可比 | $\mathbf{A} = \dfrac{\partial f}{\partial \mathbf{x}},\ \mathbf{B} = \dfrac{\partial f}{\partial \mathbf{u}}$ | 飞控 | LQR、MPC、EKF、状态空间线性化 |
| 控制分配雅可比 | $\Delta\mathbf{W} = \mathbf{J}\,\Delta\mathbf{u}$ | 飞控混控 | 电机力 → 机体合力旋量 |
| 约束雅可比 | $\dot{C} = \mathbf{J}\mathbf{v},\ \mathbf{F}_c = \mathbf{J}^{\mathsf T}\boldsymbol{\lambda}$ | 游戏物理 | Chaos/PhysX/Bullet 约束求解器 |
| 链式雅可比 | $\mathbf{J}_{\mathbf{f}\circ\mathbf{g}} = \mathbf{J}_{\mathbf{f}}\mathbf{J}_{\mathbf{g}}$ | 机器学习 | 反向传播、自动微分 |

### 一句话本质

> **导数描述"一维变化率"，雅可比矩阵描述"多输入、多输出系统在某一点附近的局部线性映射"。**

$$
\boxed{\,\Delta\mathbf{y} \approx \mathbf{J}\,\Delta\mathbf{x}\,}
$$

这就是雅可比矩阵的全部灵魂。它把"非线性世界"在"当前这一刻"近似成"一个矩阵乘法"，于是控制论能线性化设计、机器人能反解关节、物理引擎能解约束、神经网络能反传梯度——四个领域，同一块积木。

如果你能透彻理解运动学、动力学、约束这三种雅可比，以及它们的逆（伪逆/DLS/转置），本质上就打通了机器人学、飞控、游戏物理引擎、动画运动学背后同一套数学框架。下回在任何代码里看到 $\mathbf{J}$、$\mathbf{J}^{\mathsf T}$、$\mathbf{J}^{-1}$、`jacobian`、`jacobianTranspose`、`solveDLS`、`effectiveMass`，你都知道它们在算同一件事。
