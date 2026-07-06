---
title: "AVBD 工程实现剖析 — 从变分原理到刚体增广拉格朗日求解器（avbd-demo3d 源码精读）"
excerpt: "以 avbd-demo3d 项目为锚，逐文件精读一个基于 Augmented VBD 的刚体物理引擎：6 自由度刚体的惯性预测与角向海森、增广拉格朗日的交替原对偶更新、违反比例罚参数调度、球铰/弹簧/接触三类约束的梯度与海森推导、SAT 碰撞与 Sutherland-Hodgman 流形裁剪、跨帧热启动与自适应重力预测。并对照本站既有 AVBD 理论文档，指出块的定义、图染色、对偶更新结构、罚参数调度、收敛策略等处的差异与勘误。"
date: "2026-07-03"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["物理", "AVBD", "刚体动力学", "增广拉格朗日", "约束求解", "碰撞检测", "源码精读"]
readTime: "阅读约55分钟"
---

> 本站已有&#12298;[VBD 与 AVBD 详解](/knowledge/vbd-avbd-math/)&#12299;一文，从变分隐式积分出发推导了 VBD 的能量泛函、块坐标下降（BCD）、约束梯度/海森，以及 AVBD 用增广拉格朗日（ALM）化解硬约束刚性的原理。那篇是**理论骨架**——以布料/软体的**逐顶点 3×3 牛顿步**为主视角。
>
> 本文是它的**工程对照面**：以开源项目 `avbd-demo3d` 为锚，精读一个把 AVBD 落到**刚体 6 自由度**上的完整实现。刚体推广带来三个本质变化——块从"顶点（3 DOF）"变成"刚体（6 DOF）"，牛顿步从 3×3 变成 6×6，角向惯性用四元数 log/exp 而非线性位置差。更重要的是，工程实现为了**实时与稳定**做出了若干与论文教科书不同的取舍：对偶变量每轮迭代交替更新（而非外层独立收敛）、罚参数按违反量比例增长（而非几何增长）、固定迭代无收敛早停、跨帧热启动作为稳定性核心。
>
> 阅读建议：先读理论文搭好框架，再读本文看工程如何裁剪理论。第九节是两文的逐项勘误对照，可直接跳转查证。

---

## 一、avbd-demo3d 项目概览

`avbd-demo3d` 是一个单进程、单线程的 AVBD 刚体物理演示引擎，用 SDL2 + 固定管线 OpenGL 渲染、ImGui 调参，可原生编译也可经 Emscripten 编为 WebAssembly 在浏览器运行（触屏适配齐全）。它不是一个产品级引擎，而是一份**可读、可调、可对照论文**的参考实现——代码总量不足 3000 行，却完整覆盖了 AVBD 的全部核心机制。

### 1.1 源码文件分工

| 文件 | 行数 | 职责 |
|---|---|---|
| `maths.h` | 548 | 数学原语：`float3`/`quat`/`float3x3`、四元数 log/exp、`skew`/`outer`/`rotation`、**6×6 LDLᵀ 求解器** |
| `solver.h` | 192 | 类型与接口声明：`Rigid`/`Force`/`Joint`/`Spring`/`Manifold`/`Solver` + 常量宏 |
| `solver.cpp` | 243 | `Solver::step()` 主循环、`defaultParams()` 调参、`pick()` 射线拾取 |
| `rigid.cpp` | 48 | `Rigid` 构造（质量/转动惯量/包围球）、链表注销、`constrainedTo` |
| `force.cpp` | 59 | `Force` 基类：侵入式三链表（全局/bodyA/bodyB）注册与注销 |
| `joint.cpp` | 178 | 球铰约束：线性+角向、几何刚度、罚参数调度、断裂 |
| `spring.cpp` | 72 | 胡克弹簧：**纯原罚函数，无对偶变量** |
| `collide.cpp` | 494 | OBB-OBB SAT 碰撞检测、Sutherland-Hodgman 流形裁剪 |
| `manifold.cpp` | 176 | 接触约束：单边法向 + 库仑摩擦锥、特征持久化热启动 |
| `scenes.h` | 352 | 14 个演示场景（金字塔、绳、桥、软体晶格、可断裂梁…） |
| `main.cpp` | 1043 | 主循环、SDL/GL/ImGui 初始化、相机、输入、渲染、阴影 |

### 1.2 类层次

```
Solver                       顶层仿真器：步进、调参、拾取
 ├─ Rigid  (侵入式单链表)    单个刚体：6 DOF 状态 + 质量/惯量
 │    └─ Force* forces       该体上的约束链表头
 └─ Force  (侵入式单链表)    抽象约束接口
      ├─ Joint : Force       球铰（可设线性/角向刚度、断裂阈值）
      ├─ Spring : Force      弹簧（纯罚，无对偶）
      ├─ Manifold : Force    接触流形（最多 8 点 + 摩擦）
      └─ IgnoreCollision     碰撞抑制占位符
```

`Force` 是 AVBD 原对偶契约的抽象：

```cpp
struct Force {
    Solver *solver; Rigid *bodyA, *bodyB;
    Force *nextA, *nextB, *next;        // 三条侵入式链表
    virtual bool initialize() = 0;     // 每步一次：缓存常量、热启动；返回 false 则删除该约束
    virtual void updatePrimal(Rigid*, float alpha,
        float3x3 &lhsLin, float3x3 &lhsAng, float3x3 &lhsCross,
        float3 &rhsLin, float3 &rhsAng) = 0;   // 累加该约束对该体的 6×6 海森与梯度
    virtual void updateDual(float alpha) = 0;   // 更新拉格朗日乘子 λ 与罚参数 ρ
};
```

每个约束只需实现这三个方法，求解器负责把它们组装进每体的 6×6 系统。这是 AVBD 可扩展性的工程体现——加一种新约束只需写一个 `Force` 子类。

---

## 二、AVBD 的物理数学原理（刚体推广版）

本节是理论文档的精炼，并补上**角向推广**——理论文以布料顶点（3 DOF）为主，本实现面向刚体（6 DOF），惯性项与海森都要扩展。

### 2.1 变分隐式欧拉：积分即最小化

隐式欧拉 $\mathbf{M}\dot{\mathbf{v}}=\mathbf{f}(\mathbf{x})$ 经离散化与整理（见理论文 §1.1），等价于最小化：

$$
E(\mathbf{x}) = \underbrace{\frac{1}{2h^2}\|\mathbf{x}-\mathbf{y}\|_{\mathbf{M}}^2}_{\text{惯性势能}} + \underbrace{W(\mathbf{x})}_{\text{约束/弹性势能}}
$$

其中惯性预测点 $\mathbf{y}=\mathbf{x}^n+h\mathbf{v}^n+h^2\mathbf{g}$ 是无约束自由运动外推。**一步积分 = 一步能量最小化**——这是 VBD 的变分根基。

### 2.2 刚体的 6 自由度惯性项

布料顶点只有 3 个平移 DOF，惯性项是标量 $\frac{m}{2h^2}\|\mathbf{x}-\mathbf{y}\|^2$。刚体有 3 平移 + 3 旋转 = 6 DOF。设刚体位置 $\mathbf{x}$、朝向四元数 $\mathbf{q}$、质量 $m$、转动惯量张量 $\mathbf{I}$（对角化为 $\text{diag}(I_{xx},I_{yy},I_{zz})$），惯性预测：

$$
\mathbf{y}_{\text{lin}} = \mathbf{x}^n + h\mathbf{v}_{\text{lin}}^n + h^2\mathbf{g}, \qquad \mathbf{q}_{\text{ang}}^{\text{pred}} = \mathbf{q}^n \oplus h\boldsymbol\omega^n
$$

其中 $\oplus$ 是**四元数指数映射**增量（`operator+(quat, float3)`），$\boldsymbol\omega$ 是角速度旋转向量。惯性势能：

$$
E_{\text{inertia}} = \frac{m}{2h^2}\|\mathbf{x}-\mathbf{y}_{\text{lin}}\|^2 + \frac{1}{2h^2}(\mathbf{q}\ominus\mathbf{q}_{\text{ang}}^{\text{pred}})^{\mathsf T}\mathbf{I}(\mathbf{q}\ominus\mathbf{q}_{\text{ang}}^{\text{pred}})
$$

$\ominus$ 是四元数对数差（`operator-(quat,quat)`，返回 3 维旋转向量 = $2\cdot\text{vec}(\mathbf{q}\otimes\mathbf{q}_{\text{pred}}^{-1})$）。对应海森：

$$
\mathbf{H}_{\text{inertia}} = \begin{bmatrix} \frac{m}{h^2}\mathbf{I}_3 & \mathbf{0} \\ \mathbf{0} & \frac{1}{h^2}\text{diag}(I_{xx},I_{yy},I_{zz}) \end{bmatrix}
$$

这是一个 6×6 对角块矩阵——平移块 $m/h^2\cdot\mathbf{I}_3$、角向块 $\mathbf{I}/h^2$、无平移-角向耦合（`lhsCross` 初始为零）。**惯性海森是对角正定的**，这正是 VBD 数值稳定性的核心：即使约束海森退化，惯性项也保证 6×6 系统正定可解。

### 2.3 增广拉格朗日：硬约束的对偶解法

AVBD 把硬约束 $c(\mathbf{x})=0$ 的纯罚形式 $\frac{k}{2}c^2$（$k\to\infty$ 时条件数爆炸）替换为增广拉格朗日泛函（见理论文 §5.2）：

$$
\mathcal{L}(\mathbf{x},\boldsymbol\lambda) = E_{\text{inertia}}(\mathbf{x}) + \sum_j\Bigl[\boldsymbol\lambda_j\,c_j(\mathbf{x}) + \frac{\rho_j}{2}\,c_j(\mathbf{x})^2\Bigr]
$$

- $\boldsymbol\lambda$：拉格朗日乘子，代表**已施加的约束力**，迭代中累积逼近真实反力。
- $\rho$：罚参数（**有限值**），只负责局部二阶化保证凸性，无需 $\to\infty$。

对 $\mathbf{x}$ 的梯度贡献：$\nabla c_j$ 是约束雅可比，则

$$
\nabla_{\mathbf{x}} W_j^{\text{ALM}} = (\boldsymbol\lambda_j + \rho_j\,c_j)\,\nabla_{\mathbf{x}} c_j
$$

这正是实现中 `F = K*C + lambda` 的数学含义（$\mathbf{K}=\text{diag}(\rho)$，$\mathbf{C}=c$，$\boldsymbol\lambda$ 为乘子）。海森贡献（Gauss-Newton 一阶近似）：

$$
\mathbf{H}_j = \rho_j\,\nabla c_j\,\nabla c_j^{\mathsf T} = \mathbf{J}^{\mathsf T}\mathbf{K}\mathbf{J}
$$

即实现中的 `lhsLin += jLinT * K * jLin` 等秩 1 外积累加。

### 2.4 块坐标下降：逐体牛顿步

BCD 把全局最小化切成**逐块**下降。本实现的"块"是一个**完整刚体**的 6 DOF（不是布料的单顶点 3 DOF）。每轮迭代：

1. **原步（primal）**：遍历所有动态刚体，固定他体，对该体组装 6×6 牛顿系统并求解 $\Delta\mathbf{z}=-\mathbf{H}^{-1}\nabla\mathcal{L}$，更新位置/朝向。
2. **对偶步（dual）**：遍历所有约束，根据残余违反量更新 $\boldsymbol\lambda$ 与 $\rho$。

两步在**同一轮迭代内交替执行**，重复 `iterations` 轮（默认 10）。这是与理论文嵌套结构的关键差异，第九节详述。

---

## 三、数学原语（maths.h）

实现不用任何线性代数库，全部手写。几个对 AVBD 至关重要的原语：

### 3.1 四元数 log / exp：角向增量的载体

角速度是 3 维旋转向量 $\boldsymbol\omega$，而朝向是单位四元数 $\mathbf{q}$。两者间的转换靠两个重载运算符：

```cpp
// operator-(quat a, quat b) —— 对数差（log map）
// 返回从 b 到 a 的旋转向量，模长 = 2·半角
float3 operator-(quat a, quat b) {
    return (a * inverse(b)).vec() * 2.0f;   // vec() 取 (x,y,z) 分量
}

// operator+(quat a, float3 b) —— 指数映射（exp map）
// 用旋转向量 b 增量更新朝向，一阶泰勒近似
quat operator+(quat a, float3 b) {
    return normalize(a + quat{b.x, b.y, b.z, 0} * a * 0.5f);
}
```

- **对数差** $\ominus$：`q_diff = a ⊗ b⁻¹`，取其向量部分 ×2。当相对旋转是小角时，向量部分 ≈ 半角轴 × 半角，×2 得到完整旋转向量。用于（a）角向约束残差 $C_{\text{ang}}=(\mathbf{q}_A\ominus\mathbf{q}_B)\cdot\text{torqueArm}$；（b）角速度提取 $\boldsymbol\omega=(\mathbf{q}^{n+1}\ominus\mathbf{q}^n)/h$。
- **指数映射** $\oplus$：`normalize(q + ½·[ω,0]⊗q)`，是一阶泰勒近似 $\mathbf{q}^{n+1}\approx\text{normalize}(\mathbf{q}+\frac{h}{2}\boldsymbol\omega\otimes\mathbf{q})$。用于朝向的原步更新 `positionAng += dxAng`。

> **为何用 log/exp 而非欧拉角**：欧拉角有万向锁、旋转顺序歧义；旋转向量 $\boldsymbol\omega\in\mathbb{R}^3$ 是 $\mathfrak{so}(3)$ 的切空间坐标，可线性叠加、无奇异（小角范围内），正好适配牛顿法的线性求解。代价是大角度旋转时一阶近似误差累积，故实现固定迭代 + 小时间步控制误差。

### 3.2 skew 与 outer：雅可比的矩阵化

```cpp
// skew(r) —— 叉积的矩阵形式：skew(r)·v = cross(r, v)
float3x3 skew(float3 r) {
    return {{ 0, -r.z,  r.y},
            { r.z,  0,  -r.x},
            {-r.y,  r.x,  0}};
}

// outer(a, b) —— 秩 1 外积 a·bᵀ（3×3）
float3x3 outer(float3 a, float3 b) {
    return {{b*a.x, b*a.y, b*a.z}};
}
```

- `skew(r)` 把"角速度产生的线速度" $\mathbf{v}=\boldsymbol\omega\times\mathbf{r}$ 写成矩阵乘 $\text{skew}(\mathbf{r})^{\mathsf T}\boldsymbol\omega$。约束雅可比的角向块正是 $\pm\text{skew}(\mathbf{r}_{\text{world}})$——接触点偏移 $\mathbf{r}$ 绕质心旋转产生的线速度。
- `outer(jLin, jLin)*stiffness` 直接构造 Gauss-Newton 海森 $\rho\,\nabla c\,\nabla c^{\mathsf T}$。

### 3.3 6×6 LDLᵀ 求解器：逐体牛顿步的内核

这是实现的心脏。每个刚体的牛顿系统是 6×6 对称正定（SPD）：

$$
\underbrace{\begin{bmatrix} \mathbf{H}_{\text{lin}} & \mathbf{H}_{\text{cross}}^{\mathsf T} \\ \mathbf{H}_{\text{cross}} & \mathbf{H}_{\text{ang}} \end{bmatrix}}_{\text{lhs}} \underbrace{\begin{bmatrix}\Delta\mathbf{x}\\ \Delta\boldsymbol\omega\end{bmatrix}}_{\text{dx}} = \underbrace{\begin{bmatrix}-\nabla_{\text{lin}}\\ -\nabla_{\text{ang}}\end{bmatrix}}_{\text{rhs}}
$$

其中 $\mathbf{H}_{\text{lin}}$、$\mathbf{H}_{\text{ang}}$ 是 3×3 SPD 块，$\mathbf{H}_{\text{cross}}$ 是平移-角向耦合（来自约束雅可比的交叉项）。`solve()` 用**手写展开的 LDLᵀ 分解**（4 步：分解 → 前代 → 对角解 → 回代），全程无分支、无循环、无动态分配，约 70 行直写算术：

```cpp
void solve(float3x3 aLin, float3x3 aAng, float3x3 aCross,
           float3 bLin,   float3 bAng,
           float3 &xLin,  float3 &xAng)
{
    // 下三角存储 21 个元素 A11..A66
    // Step 1: LDLᵀ 分解（6 个对角元 D1..D6，15 个下三角元 L21..L65）
    // Step 2: 前代 L·y = b
    // Step 3: 对角解 D·z = y
    // Step 4: 回代 Lᵀ·x = z（注意角向先于平移，因上三角变量序）
    ...
}
```

> **为何不用 3×3**：布料顶点只有平移，海森是 3×3，可用 Sherman-Morrison 公式解析求逆（理论文 §4.1）。刚体有 6 DOF 且平移-角向耦合，系统是 6×6，需通用 SPD 求解。LDLᵀ 是 SPD 系统的最优解法（不需求逆、数值稳定、可手写展开），6×6 规模下展开后的常数折叠效率极高。

---

## 四、求解器主循环（Solver::step）

`step()` 是 AVBD 的完整一帧，分五个相位。下表是 548 行 `maths.h` 与 243 行 `solver.cpp` 浓缩成的算法骨架，所有默认值来自 `defaultParams()`：

```
默认参数：dt=1/60, gravity=-10, iterations=10,
          betaLin=10000, betaAng=100, alpha=0.99, gamma=0.999
```

### Phase A — 碰撞宽相（O(n²) 包围球）

```cpp
for (A : bodies) for (B : bodies after A) {
    float3 dp = A.positionLin - B.positionLin;
    float  r  = A.radius + B.radius;
    if (dot(dp,dp) <= r*r && !A.constrainedTo(B))
        new Manifold(solver, A, B);   // 每帧动态创建碰撞约束
}
```

`constrainedTo` 跳过已有约束连接的体对（如软体晶格内部），避免冗余碰撞。碰撞流形每帧重建——但 `Manifold::initialize` 会通过 `FeaturePair` 特征键把上一帧的 $\lambda/\rho/\text{stick}$ 迁移过来（见 §6.3）。

### Phase B — 约束初始化与热启动

```cpp
for (Force *f = forces, *next; f; f = next) {
    next = f->next;
    if (!f->initialize()) delete f;   // 返回 false = 失活（分离的接触/断裂的关节）
}
```

`initialize()` 做三件事：（1）检测碰撞、裁剪流形；（2）缓存步首约束值 $C_0$；（3）热启动——$\lambda\leftarrow\lambda\cdot\alpha\gamma$，$\rho\leftarrow\text{clamp}(\rho\cdot\gamma,\rho_{\min},\rho_{\max})$。失活的约束被 `delete`（侵入式链表自动注销）。

### Phase C — 惯性预测与自适应热启动

```cpp
for (body : bodies) {
    // 惯性预测点 y（Eq 2）：无约束自由运动外推
    body->inertialLin = body->positionLin + body->velocityLin * dt
                      + (mass > 0 ? float3{0,0,gravity} * dt*dt : 0);
    body->inertialAng = body->positionAng + body->velocityAng * dt;  // ⊕ 四元数增量

    // 保存步首位置 x⁻（BDF1 速度提取用）
    body->initialLin = body->positionLin;
    body->initialAng = body->positionAng;

    // 自适应热启动：估计"外部"加速度占比，加权施加重力冲量
    if (mass > 0) {
        float3 accel    = (velocityLin - prevVelocityLin) / dt;
        float  accelExt = accel.z * sign(gravity);           // 与重力同向的分量
        float  w = clamp(accelExt / fabsf(gravity), 0, 1);   // NaN 安全 → 0
        positionLin += velocityLin * dt + float3{0,0,gravity} * (w * dt * dt);
        positionAng += velocityAng * dt;
    }
    body->prevVelocityLin = body->velocityLin;
}
```

三步各有来历：

1. **惯性预测 $\mathbf{y}$**：变分隐式欧拉的预测点，原步把位置往 $\mathbf{y}$ 拉。`inertialAng` 用 `operator+(quat,float3)` 做 $\mathbf{q}\oplus h\boldsymbol\omega$。
2. **步首快照 $\mathbf{x}^-$**：BDF1 速度提取 $\mathbf{v}=(\mathbf{x}^{n+1}-\mathbf{x}^-)/h$ 需要。
3. **自适应热启动**（VBD 论文原创）：估计上一帧加速度有多少来自重力（外部）vs 约束（内部）。若加速度几乎全是重力，就把重力冲量在热启动里预施加，让迭代从更接近真解的位置起步；若加速度来自约束反力，则少施加或不施加，避免过冲。`w` 是重力占比权重。这把"预测-修正"的预测步做得更准，减少迭代次数。

### Phase D — BCD 主循环（原对偶交替）

```cpp
for (int it = 0; it < iterations; it++) {        // 固定 10 轮，无收敛检查
    // —— 原步：逐体组装并求解 6×6 牛顿系统 ——
    for (body : bodies) {
        if (body->mass <= 0) continue;           // 静态/运动学体跳过

        float3x3 lhsLin = diagonal(mass,mass,mass) / (dt*dt);   // 惯性海森 H_lin
        float3x3 lhsAng = diagonal(moment) / (dt*dt);           // 惯性海森 H_ang
        float3x3 lhsCross = {0};                                 // 平移-角向耦合，初始 0
        float3 rhsLin = lhsLin * (positionLin - inertialLin);    // 惯性梯度
        float3 rhsAng = lhsAng * (positionAng - inertialAng);

        // 累加该体所有约束的海森与梯度
        for (force = body->forces; force; force = nextOnBody)
            force->updatePrimal(body, alpha, lhsLin, lhsAng, lhsCross, rhsLin, rhsAng);

        // 求解 6×6 SPD 系统，应用牛顿步
        float3 dxLin, dxAng;
        solve(lhsLin, lhsAng, lhsCross, -rhsLin, -rhsAng, dxLin, dxAng);
        positionLin += dxLin;
        positionAng += dxAng;                    // ⊕ 四元数指数映射
    }
    // —— 对偶步：更新所有约束的 λ 与 ρ ——
    for (force : forces) force->updateDual(alpha);
}
```

**关键观察**：

- 惯性海森 $\mathbf{M}/h^2$ 直接作为 `lhs` 初值——这就是变分隐式欧拉把惯性项"写进能量"的工程体现。`rhs` 初值是惯性梯度 $(\mathbf{M}/h^2)(\mathbf{x}-\mathbf{y})$。
- `updatePrimal` 按 `+=` 累加：每个约束把 $\mathbf{J}^{\mathsf T}\mathbf{K}\mathbf{J}$ 加进 `lhs`，把 $\mathbf{J}^{\mathsf T}\mathbf{F}$ 加进 `rhs`。多约束在同一体的 6×6 系统里**自动取折中**——这是 VBD 比逐约束投影的 PBD 在复杂拓扑下更稳的根源。
- 牛顿步 `dx = solve(-rhs)`，注意 `rhs` 取负号——因为牛顿步是 $\Delta\mathbf{z}=-\mathbf{H}^{-1}\nabla\mathcal{L}$，而 `rhs` 存的是梯度 $\nabla\mathcal{L}$。
- **原步与对偶步每轮交替**，不是理论文的"原步收敛后再对偶更新"。这是工程为实时性做的关键裁剪，第九节详析。
- **固定 10 轮，无收敛早停**。无论是否收敛都跑满——确定性优先于效率。

### Phase E — BDF1 速度更新

```cpp
for (body : bodies) {
    prevVelocityLin = body->velocityLin;
    if (body->mass > 0) {
        body->velocityLin = (body->positionLin - body->initialLin) / dt;
        body->velocityAng = (body->positionAng - body->initialAng) / dt;  // ⊖ 对数差
    }
}
```

向后差分（BDF1）：$\mathbf{v}^{n+1}=(\mathbf{x}^{n+1}-\mathbf{x}^n)/h$。角速度用四元数对数差 `(qⁿ⁺¹ ⊖ qⁿ)/dt`，得到旋转向量。`prevVelocityLin` 存下一帧自适应热启动用。

> **BDF1 的耗散性**：隐式欧拉/BDF1 天然带数值阻尼——高频振荡被滤除。这对刚体堆叠稳定是好事（抑制抖动），但会让弹性体（弹簧）显得偏"粘"。实现没有额外阻尼项，所有耗散来自 BDF1 + 稳定化参数 $\alpha$。

---

## 五、约束实现详解

三个 `Force` 子类展示 AVBD 的三种约束范式。

### 5.1 Joint：球铰 + 角约束 + 断裂（完整 ALM）

球铰约束两体的一个锚点重合，并可附加朝向对齐与断裂阈值。

**状态**（`solver.h:85-100`）：

```cpp
struct Joint : Force {
    float3 rA, rB;                  // 锚点在两体局部系的偏移
    float3 C0Lin, C0Ang;            // 步首约束值（稳定化目标）
    float3 penaltyLin, penaltyAng;  // 自适应罚参数 ρ（每轴独立）
    float3 lambdaLin, lambdaAng;    // 拉格朗日乘子 λ（3 线性 + 3 角向）
    float stiffnessLin, stiffnessAng, fracture;  // 材料刚度(∞=硬)、断裂阈值
    float torqueArm;               // 角向误差缩放因子
    bool broken;
};
```

**线性约束**（锚点重合）：约束值 $\mathbf{C}_{\text{lin}}=\mathbf{p}_A(\mathbf{r}_A)-\mathbf{p}_B(\mathbf{r}_B)$（两锚点的世界坐标差，3 维）。雅可比：

$$
\mathbf{J}_{\text{lin}}^A = +\mathbf{I}_3, \quad \mathbf{J}_{\text{lin}}^B = -\mathbf{I}_3, \quad \mathbf{J}_{\text{ang}}^A = -\text{skew}(\mathbf{R}_A\mathbf{r}_A), \quad \mathbf{J}_{\text{ang}}^B = +\text{skew}(\mathbf{R}_B\mathbf{r}_B)
$$

角向块来自 $\partial\mathbf{p}/\partial\boldsymbol\omega=\boldsymbol\omega\times\mathbf{r}=\text{skew}(\mathbf{r})^{\mathsf T}\boldsymbol\omega$（`skew(r)*v = cross(r,v)`）。增广力 $\mathbf{F}=\mathbf{K}\mathbf{C}+\boldsymbol\lambda$（$\mathbf{K}=\text{diag}(\rho_{\text{lin}})$），硬约束时叠加稳定化偏置 $\mathbf{C}\leftarrow\mathbf{C}-\mathbf{C}_0\cdot\alpha$。海森为 Gauss-Newton $\mathbf{J}^{\mathsf T}\mathbf{K}\mathbf{J}$：

```cpp
// updatePrimal 线性部分（节选）
float3x3 K = diagonal(penaltyLin);                   // ρ 对角阵
float3 C = pA - pB - (isinf(stiffnessLin) ? C0Lin * alpha : 0);  // 稳定化
float3 F = K * C + lambdaLin;                         // 增广力 = ρ·C + λ
float3x3 jLin = (body == bodyA) ? identity : -identity;
float3x3 jAng = (body == bodyA) ? skew(-rAworld) : skew(rBworld);
lhsLin  += transpose(jLin) * K * jLin;               // J_linᵀ K J_lin
lhsAng  += transpose(jAng) * K * jAng;               // J_angᵀ K J_ang
lhsCross+= transpose(jAng) * K * jLin;               // 交叉耦合块
rhsLin  += jLin * F;  rhsAng += jAng * F;            // Jᵀ F
```

**几何刚度**（ball-socket 独有，二阶项）：锚点世界坐标随朝向旋转，约束力本身又随锚点位置变化，存在二阶耦合 $\mathbf{F}\cdot\nabla^2\mathbf{C}$。`geometricStiffnessBallSocket(k,v)` 为每个约束力分量构造此二阶矩阵，按 $\mathbf{F}$ 加权求和后 `diagonalize`（取列范数）加进 `lhsAng`：

```cpp
float3x3 H = geometricStiffnessBallSocket(0,r)*F[0]
           + geometricStiffnessBallSocket(1,r)*F[1]
           + geometricStiffnessBallSocket(2,r)*F[2];
lhsAng += diagonalize(H);    // 对角近似，保证正定
```

这是比纯 Gauss-Newton 更精确的牛顿步——理论文 §3.1 提到的"法向曲率修正"在球铰里的对应物，但实现取对角近似以保正定与效率。

**角向约束**（朝向对齐）：$\mathbf{C}_{\text{ang}}=(\mathbf{q}_A\ominus\mathbf{q}_B)\cdot\text{torqueArm}$，雅可比 $\mathbf{J}_{\text{ang}}=\pm\text{torqueArm}\cdot\mathbf{I}_3$，海森 $\text{torqueArm}^2\cdot\mathbf{K}_{\text{ang}}$。`torqueArm` 把四元数差的量纲（无量纲旋转向量）缩放到与线位移可比，使线性+角向罚参数可统一调度。

**对偶更新**（`updateDual`）：

```cpp
// 硬约束：λ 累积 = ALM 对偶上升
if (isinf(stiffnessLin)) {
    float3 C = pA - pB - C0Lin * alpha;       // 含稳定化
    lambdaLin = K * C + lambdaLin;            // λ ← λ + ρ·C  （标准 ALM 更新）
}
// 罚参数调度：按违反量比例增长，钳到材料刚度与上限
penaltyLin = min(penaltyLin + abs(C) * betaLin, min(stiffnessLin, PENALTY_MAX));
```

- **硬约束**（`stiffness=∞`）：$\boldsymbol\lambda\leftarrow\boldsymbol\lambda+\boldsymbol\rho\,\mathbf{C}$，即标准 ALM 对偶上升。$\boldsymbol\lambda$ 跨步累积，精确逼近真实约束力。
- **软约束**（有限 `stiffness`）：$\boldsymbol\lambda$ **冻结**不更新，仅罚参数增长（钳到 `stiffness`）。软约束退化为自适应罚函数法——这正是"弹簧式"行为。
- **罚参数调度**：$\rho\leftarrow\min(\rho+\beta\cdot|\mathbf{C}|,\,\text{stiffness},\,\rho_{\max})$。违反越大、增长越快，自适应聚焦瓶颈约束。这是**违反比例调度**，与理论文的几何增长 $\rho\leftarrow\gamma\rho$ 不同（第九节）。

**断裂**：当角向乘子模长超过阈值 $\|\boldsymbol\lambda_{\text{ang}}\|>\text{fracture}$，清零全部 $\lambda/\rho$、置 `broken=true`，下帧 `initialize()` 返回 false 被删除。场景 13（Breakable）演示梁在重物冲击下逐段断裂。

### 5.2 Spring：纯原罚函数（无对偶）

```cpp
struct Spring : Force {
    float3 rA, rB; float rest; float stiffness;
};
```

胡克弹簧：$C=\|\mathbf{p}_A-\mathbf{p}_B\|-\text{rest}$，能量 $\frac{k}{2}C^2$。`updatePrimal` 计算梯度 $kC\hat{\mathbf{n}}$ 和 Gauss-Newton 海森 $k\hat{\mathbf{n}}\hat{\mathbf{n}}^{\mathsf T}$，`updateDual` **空实现**——无 $\lambda$、无罚调度、刚度恒定。

> **为何弹簧不用 ALM**：弹簧是**软约束**，$k$ 有限，不存在 $k\to\infty$ 的刚性病。ALM 的对偶 machinery 是为硬约束准备的，软弹性力用纯罚更直接、更省内存。这揭示一个工程原则：**AVBD 求解器允许纯罚与 ALM 混用**——同一场景里弹簧（纯罚）与球铰（ALM）共存，各自取最合适的约束范式。理论文把 AVBD 描述为"全 ALM"，实现做了更务实的混合。

### 5.3 Manifold：接触 + 库仑摩擦（单边 ALM）

碰撞接触是最复杂的约束，融合了**单边不等式**（不穿透）、**库仑摩擦锥**、**多接触点流形**、**特征持久化热启动**。

**数据结构**（`solver.h:128-168`）：

```cpp
struct Manifold : Force {
    struct Contact {
        FeaturePair feature;   // 拓扑特征键（用于跨帧匹配）
        float3 rA, rB;         // 接触点两体局部偏移
        float3 C0;             // 步首约束值（接触基下）
        float3 penalty;        // 法向 + 2 切向罚参数
        float3 lambda;        // 法向 + 2 切向乘子
        bool stick;           // 静摩擦粘滞标志
    };
    Contact contacts[8];      // 最多 8 接触点
    float3x3 basis;           // 行0=法向(A→B), 行1/2=切向
    int numContacts;
    float friction;           // = sqrt(μA·μB)
};
```

**接触基**：`basis = orthonormal(-normalAB)`，行 0 是法向（A 指向 B），行 1/2 是正交切向。所有约束量在接触基下表示——法向是约束的第 0 分量，切向是第 1/2 分量。

**约束值**（Taylor 展开，`updatePrimal`）：

$$
\mathbf{C} = \mathbf{C}_0(1-\alpha) + \mathbf{J}_A^{\text{lin}}\Delta\mathbf{x}_A^{\text{lin}} + \mathbf{J}_B^{\text{lin}}\Delta\mathbf{x}_B^{\text{lin}} + \mathbf{J}_A^{\text{ang}}\Delta\mathbf{q}_A^{\text{ang}} + \mathbf{J}_B^{\text{ang}}\Delta\mathbf{q}_B^{\text{ang}}
$$

其中 $\Delta\mathbf{x}=\mathbf{x}-\mathbf{x}^-$ 是相对步首的位移，$\mathbf{J}^{\text{lin}}=\pm\text{basis}$、$\mathbf{J}^{\text{ang}}=\text{cross}(\mathbf{r}_{\text{world}},\text{basis行})$。$\mathbf{C}_0(1-\alpha)$ 是稳定化：随 $\alpha\to1$ 把步首误差渐清零（Baumgarte 风格的位置修正）。$\mathbf{C}_0$ 法向分量含 `+COLLISION_MARGIN`（0.01），把接触变成"软停在裕度"约束，避免零穿透抖动。

**单边与摩擦锥投影**（关键的不等式处理）：

```cpp
float3 F = K * C + lambda;        // 增广力
F[0] = min(F[0], 0.0f);           // 法向：只能推（≤0），不能拉
float bounds = fabsf(F[0]) * friction;          // 库仑锥半径 μ|F_n|
float fs = length(float2{F[1], F[2]});          // 切向力大小
if (fs > bounds && fs > 0) {                    // 超出摩擦锥
    float s = bounds / fs;
    F[1] *= s; F[2] *= s;                        // 缩回锥内
}
```

法向力钳为非正（接触只能推不能拉）；切向力钳到库仑锥 $\|\mathbf{F}_t\|\leq\mu|\mathbf{F}_n|$。这是把 ALM 的等式约束推广到**不等式约束**——通过对偶变量投影实现，而非改能量形式。

**对偶更新**：$\boldsymbol\lambda\leftarrow\mathbf{F}$（投影后的增广力成为新乘子）；罚参数 $\rho\leftarrow\min(\rho+\beta\cdot|\mathbf{C}|,\rho_{\max})$，且**仅当接触活跃**（法向 $F_0<0$）或**静摩擦粘滞**（切向位移 $<\text{STICK\_THRESH}$）时才增长切向罚。`stick` 标志记录静摩擦状态，下帧 `initialize` 据此保留接触锚点（不刷新 $\mathbf{r}_A/\mathbf{r}_B$），实现静摩擦锚定。

**特征持久化**：`FeaturePair.key` 是 32 位整数，编码接触拓扑（`类型 | 参考轴 | 入射轴 | 顶点序号`）。`initialize()` 每帧重新检测碰撞，但按特征键匹配旧接触，迁移其 $\lambda/\rho/\text{stick}$。这让乘子跨帧累积——即便接触点坐标因体运动而变化，拓扑相同的接触仍继承历史约束力，大幅减少收敛所需迭代。

---

## 六、碰撞检测（collide.cpp）

### 6.1 SAT 15 轴分离测试

OBB-OBB 碰撞用分离轴定理（SAT）测试 15 个候选轴：A 的 3 面轴、B 的 3 面轴、9 个边叉积轴 $\mathbf{a}_i\times\mathbf{b}_j$。每轴投影两体，若任一轴分离则无碰撞（早退）；否则记录最小穿透轴：

```cpp
float separation = distance - (rA + rB);   // 负值=穿透
if (separation > 0) return 0;              // 分离轴 → 无碰撞
if (!best.valid || separation > best.separation) best = {type, idxA, idxB, separation, n};
```

`best` 是穿透最浅（`separation` 最大即最不负）的轴。面轴 vs 边轴有容差仲裁（`edgeRelTol=0.95`、`edgeAbsTol=0.01`）：当边轴穿透接近面轴时优先选边，避免面接触在退化姿态下翻转抖动。

### 6.2 Sutherland-Hodgman 流形裁剪

面接触：选参考面（穿透最浅的面），建入射面（对方最朝参考法向的面），用参考面 4 个侧平面 `clipPolygonAgainstPlane` 裁剪入射面 4 顶点，保留参考面内侧的顶点为接触点（最多 8 个，按中点距离去重）：

```cpp
// 4 个侧平面：±u、±v（u/v 是参考面内切向）
clip0 → clip1 (clip +u) → clip0 (clip -u) → clip1 (clip +v) → clip0 (clip -v)
for (p : clippedVertices) {
    float d = dot(p - refFace.center, refFace.normal);
    if (d > PLANE_EPSILON) continue;        // 在参考面前方，非接触
    addContact(pReference = p - normal*d, pIncident = p, featureKey);
}
```

边接触：两支撑边的最近点对（Ericson 线段-线段最近点算法），单接触点。

### 6.3 接触基与法向约定

`basisOut = orthonormal(-best.normalAB)`——`normalAB` 是 B 指向 A，取负后行 0 是 A 指向 B 的法向。行 1/2 是正交切向。所有接触约束量在此基下表示，法向在第 0 分量、切向在第 1/2 分量，便于单边钳制与摩擦锥投影。

---

## 七、稳定性与调参（基于真实默认值）

实现的 `defaultParams()` 给出一组经过验证的默认值，与理论文的建议有差异：

| 参数 | 实现默认 | 理论文建议 | 差异解读 |
|---|---|---|---|
| `dt` | 1/60 (≈0.0167) | — | 固定步长，无子步（main 每帧调一次 step） |
| `iterations` | 10 | VBD 10–20，AVBD 5–10 | 取 AVBD 上限，靠热启动弥补 |
| `alpha` | 0.99 | 未涉及 | 稳定化权重，越接近 1 越保守（误差清除越慢） |
| `betaLin` | 10000 | — | 线性罚增长速率，违反 1 单位则 ρ 增 1e4 |
| `betaAng` | 100 | — | 角向罚增长速率，比线性小 100 倍（角量纲不同） |
| `gamma` | 0.999 | 理论 γ=1.5–2.0（增长） | **方向相反**：实现是热启动衰减（<1），理论是 ρ 增长（>1） |
| `PENALTY_MAX` | 1e10 | — | 罚参数硬上限，防 ρ 爆炸 |
| `COLLISION_MARGIN` | 0.01 | — | 接触目标裕度，软停而非硬零穿透 |
| `STICK_THRESH` | 1e-5 | — | 静摩擦粘滞位移阈值 |

**$\alpha$ 的双重角色**：（1）稳定化——`C0*(1-alpha)` 把步首误差渐清零，`alpha=0.99` 意味着每轮仅清除 1% 残余，温和防抖；（2）热启动衰减——`lambda *= alpha*gamma`，每帧乘 `0.99*0.999≈0.989`，约 60 帧（1 秒）后衰减到 0.51，让陈旧乘子自然淡出、新约束力重新建立。

**$\beta_{\text{lin}}\gg\beta_{\text{ang}}$**：线位移与角位移量纲不同（米 vs 弧度，但惯量张量数值差异更大），分开调率是论文的"minor upgrade"——实现注释明言。

---

## 八、场景与可视化

14 个场景覆盖 AVBD 的典型用例，全部通过 `scenes.h` 的工厂函数注册：

| 索引 | 场景 | 演示重点 | 约束类型 |
|---|---|---|---|
| 0 | Empty | 空场景 | — |
| 1 | Ground | 单体落地 | Manifold |
| 2 | DynamicFriction | 11 球不同摩擦系数滑行 | Manifold（摩擦锥） |
| 3 | StaticFriction | 30° 斜面 + 不同摩擦 | Manifold（静摩擦锚定） |
| 4 | Pyramid | 16 层金字塔堆叠（默认） | Manifold（大质量比稳定） |
| 5 | Rope | 20 节链条 | Joint（球铰） |
| 6 | HeavyRope | 轻绳末端挂重物 | Joint（质量比） |
| 7 | Spring | 弹簧悬挂 | Spring（纯罚） |
| 8 | SpringsRatio | 刚度比 1000× 的交替弹簧 | Spring（刚度比稳定） |
| 9 | Stack | 10 层垂直堆叠 | Manifold |
| 10 | StackRatio | 4 层尺寸翻倍（1/2/4/8） | Manifold（极端质量比） |
| 11 | SoftBody | 3 个 4×4×4 晶格软体 | Joint（Klin=1000,Kang=250）+ IgnoreCollision |
| 12 | Bridge | 40 节木板链桥 + 50 落物 | Joint（INFINITY,0=铰链） |
| 13 | Breakable | 10 节梁 + 5 重物冲击断裂 | Joint（断裂阈值=90） |

渲染用固定管线 OpenGL（`glBegin/glEnd` 时代），无 shader。特色是**模板平面阴影**：找最大朝上的静态面，用方向光投影矩阵把动态体投成灰色阴影，两遍模板防止重叠加深。触屏适配完整——双指轨道/缩放、双击射箱、长按拖拽。

> main 每帧仅调一次 `solver->step()`，无子步、无固定步长累积，步进与 vsync 同步。`dt`/`iterations`/`gravity` 可在 ImGui 实时滑动调整，便于观察参数对稳定性的影响。

---

## 九、与理论文档的对比与勘误

本节是核心——把 `vbd-avbd-math.md` 的论断逐条对照实现，标注 confirmed（确认）、nuance（需细化）、**error（需更正）**。

### 9.1 ✅ 确认无误的论断

| 理论文论断 | 实现印证 |
|---|---|
| 隐式欧拉 = 能量最小化 $\min E_{\text{inertia}}+W$ | `step()` Phase C/D 完全照此：惯性预测 $\mathbf{y}$、惯性海森 $M/h^2$、原步牛顿 |
| 惯性项海森 $m/h^2\cdot\mathbf{I}$ 保证正定 | `lhsLin = diagonal(mass)/(dt*dt)`，`lhsAng = diagonal(moment)/(dt*dt)` |
| 牛顿步 $\Delta\mathbf{x}=-\mathbf{H}^{-1}\nabla E$ | `solve(lhs, -rhs, dx); position += dx` |
| ALM 形式 $\lambda c+\frac{\rho}{2}c^2$，梯度 $(\lambda+\rho c)\nabla c$ | `F = K*C + lambda; rhs += Jᵀ F`（$\mathbf{K}=\rho$，$\mathbf{C}=c$） |
| Gauss-Newton 海森 $\rho\,\nabla c\,\nabla c^{\mathsf T}=\mathbf{J}^{\mathsf T}\mathbf{K}\mathbf{J}$ | `lhs += transpose(J) * K * J`（秩 1 外积） |
| "A" = 增广拉格朗日，非动量 | 确认：$\lambda$ 对偶上升 + 罚调度是核心，无任何动量预测项（Phase C 的自适应热启动是位置预测，非优化动量） |
| BDF1 速度 $\mathbf{v}=(\mathbf{x}^{n+1}-\mathbf{x}^n)/h$ | Phase E 完全一致 |
| 硬约束 $\lambda\leftarrow\lambda+\rho c$ | Joint 硬约束 `lambdaLin = K*C + lambdaLin`（即 $\lambda+\rho C$） |

### 9.2 ⚠️ 需细化的论断（nuance）

**① "块 = 顶点，3×3 牛顿步"**

理论文 §4.1 反复强调"VBD 的块是一个顶点"、牛顿步是 3×3。这对**布料/软体**（顶点 3 DOF）成立。但本实现面向**刚体**（6 DOF），块是一个完整刚体，牛顿步是 **6×6 LDLᵀ**。这不是错误——VBD/AVBD 是个**框架**，"块"的粒度随应用域变：布料逐顶点 3×3、刚体逐体 6×6、理论上还能逐粒子簇 N×N。理论文以布料为主视角，未覆盖刚体推广；本文补上 6×6 与角向四元数 log/exp 这一层。

**② "图染色是 VBD 并行优势的核心"**

理论文 §7 把图染色作为 VBD 高性能的关键。实现**完全没用图染色**——单线程顺序 BCD（链表遍历）。这说明：图染色是 VBD **可选的并行化策略**（GPU/多核场景才需要），不是 VBD **定义性特征**。顺序 BCD 一样收敛、一样是 VBD。理论文把"可并行"与"必须并行"混淆了。实现证明了 AVBD 的本质是**变分能量 + BCD + ALM**，并行只是工程加速。

**③ "收敛保证 / 收敛早停"**

理论文 §4.3 伪代码有 `if ‖∇E‖ < ε: break`（收敛早停），§9.2 表格标 VBD/AVBD"✅ 收敛保证"。实现**无任何收敛检查**——固定 10 轮跑满。BCD 的能量单调下降理论保证成立（每步下降），但"早停"是工程优化项，实现选择确定性（固定轮数）而非自适应。这不算错误，但理论文应说明"早停可选，实践中常用固定轮数"。

### 9.3 ❌ 需更正的论断（error）

**① 罚参数调度：几何增长 vs 违反比例增长**

理论文 §5.2 写 $\rho\leftarrow\gamma\rho$（$\gamma>1$ 几何增长），§8.2 给典型 $\gamma=1.5\sim2.0$。

实现用 $\rho\leftarrow\min(\rho+\beta\cdot|\mathbf{C}|,\,\rho_{\max})$——**按违反量比例增长**，非几何增长。这是更现代的自适应罚调度（类 Goldfarb 罚策略）：违反大的约束罚参数涨得快，自动聚焦瓶颈；几何增长则对所有约束一视同仁，可能让已满足的约束罚参数无谓膨胀。

更关键的是符号冲突：实现里 `gamma=0.999` 是**热启动衰减因子**（`initialize` 中 $\rho\leftarrow\rho\cdot\gamma$，$\gamma<1$ 衰减），方向与理论文 $\gamma>1$ 增长**完全相反**。两者用同一字母 $\gamma$ 却是相反操作——读者对照两文会困惑。**建议理论文将增长因子改名 $\eta$ 或明确区分"增长 $\gamma_{\uparrow}$"与"衰减 $\gamma_{\downarrow}$"。**

**② 对偶更新结构：嵌套外/内层 vs 交替原对偶**

理论文 §5.3 伪代码是**嵌套结构**：

```
外层（对偶）for k = 1..N_outer:
  内层（VBD）固定 λ,ρ，逐顶点最小化至收敛:
    for iter = 1..N_inner: ...   ← 原步收敛后才更新对偶
  对偶更新: λ ← λ + ρc
```

实现是**交替结构**（单层循环）：

```
for it = 1..iterations:           ← 每轮都更新原与对偶
  原步（遍历所有体，各做一次牛顿步）
  对偶步（遍历所有约束，各更新一次 λ/ρ）
```

这是本质差异。理论文的结构保证内层原步收敛后再对偶上升——这是 ALM 经典理论收敛性证明的前提。实现的交替法每轮都动 $\lambda$，原步未收敛就更新对偶——**经典 ALM 收敛性证明不直接适用**。实践中交替法靠热启动 + 罚调度仍稳定，但理论保证较弱。理论文应注明"工程实现常交替更新以省内层迭代，代价是失去严格的 ALM 收敛证明"。

**③ "VBD 无 Lagrange 乘子累积，乘子累积是 XPBD 机制"**

理论文 §4.2 关键点 3 写"VBD 把约束以罚函数直接写入能量...无 $\lambda$ 累积...乘子累积是 XPBD 机制"。§5.4 又澄清"AVBD 的 $\lambda$ 是 ALM 对偶变量，不是 XPBD 内层累积"。

实现表明这个二分法**过于绝对**。AVBD 的 $\lambda$ **既跨迭代累积也跨帧累积**（`initialize` 热启动迁移、`updateDual` 每轮 `lambda = F` 累加）。它与 XPBD $\lambda$ 的区别不在"是否累积"，而在**累积的语义**：XPBD $\lambda$ 累积是为消除迭代次数依赖（柔度 $\tilde\alpha=1/(kh^2)$）；AVBD $\lambda$ 累积是为精确逼近真实约束力（ALM 对偶上升）。两者都"累积"，只是目的不同。理论文 §5.4 的澄清方向对，但"不是内层累积"的表述会误导读者以为 AVBD $\lambda$ 不在迭代间累积——实际上它每轮 `updateDual` 都在累积。

**④ 子步的必要性**

理论文 §8.1 强调子步（典型 2–8）满足 CFL 条件。实现**无子步**——main 每帧单步 `solver->step(dt=1/60)`。这靠 AVBD 的隐式特性（无条件稳定）+ 罚调度 + 稳定化 $\alpha$ 在大步长下维持稳定。理论文应说明"子步是显式/半隐式方法的稳定手段，VBD/AVBD 的隐式变分结构允许更大步长，子步非必需"。

### 9.4 理论文未覆盖的实现要点

| 要点 | 实现位置 | 作用 |
|---|---|---|
| **稳定化参数 $\alpha$** | `step`/`updatePrimal`/`updateDual` 全程传递 | Baumgarte 位置修正 + 热启动衰减，AVBD 稳定的关键旋钮 |
| **跨帧热启动** | `initialize` 迁移 $\lambda/\rho$ | 乘子跨帧累积，大幅减少收敛迭代，是实时性的核心 |
| **自适应重力热启动** | Phase C `accelWeight` | 估计外力占比，加权预施重力，减少原步迭代 |
| **纯罚与 ALM 混用** | Spring 无对偶 vs Joint/Manifold 有对偶 | 软弹性用纯罚、硬约束用 ALM，同场景共存 |
| **单边 + 摩擦锥投影** | Manifold `F[0]=min(F[0],0)` + 锥钳制 | ALM 处理不等式约束的工程做法 |
| **几何刚度对角近似** | Joint `diagonalize(H)` | 球铰二阶项保正定的实用近似 |
| **接触特征持久化** | `FeaturePair.key` 匹配 | 接触点坐标变但拓扑同则继承乘子 |
| **6×6 LDLᵀ 手写展开** | `maths.h::solve` | 刚体 6 DOF 牛顿步的高效内核 |

---

## 十、总结

> **avbd-demo3d 证明了什么**：AVBD 不需要 GPU、不需要图染色、不需要子步、不需要收敛检查，也能在 1/60 秒内稳定模拟 16 层金字塔堆叠、40 节链桥、可断裂梁。它的稳定性的真正来源是——（1）变分隐式欧拉把惯性写进能量（无条件稳定）；（2）增广拉格朗日用 $\lambda$ 精确施加硬约束力（避免 $k\to\infty$ 病态）；（3）跨帧热启动让乘子累积（每帧从近最优起点出发）；（4）稳定化 $\alpha$ 温和清除残余误差。

> **与理论文的关系**：理论文给出 VBD/AVBD 的数学骨架（变分原理、BCD、ALM、收敛理论），实现给出工程肉身（6×6 求解、交替原对偶、违反比例罚调度、热启动、单边投影）。两者互补：理论告诉你"为什么对"，实现告诉你"怎么跑起来"。本文第九节列出的差异不是理论文"错了"——多数是**理论做了简化假设以利推导，实现做了务实裁剪以利实时**。理解这层张力，才能既不被论文的理想结构束缚，也不被实现的工程妥协误导。

> **代码层面的一句话总结**：AVBD 求解器 = 每帧重建约束图 → 热启动迁移乘子 → 10 轮「逐体 6×6 牛顿步 + 逐约束对偶上升」交替 → BDF1 提速度。每个 `Force` 子类只负责把自己的 $\mathbf{J}^{\mathsf T}\mathbf{K}\mathbf{J}$ 与 $\mathbf{J}^{\mathsf T}\mathbf{F}$ 累加进所在体的 6×6 系统，求解器负责组装与求解。这种"约束自治、求解器统一"的架构，正是 AVBD 可扩展性的工程体现。

---

*本文基于 `avbd-demo3d` 源码（11 文件、约 3000 行）逐行精读整理，所有公式、代码、参数均对应实际实现。理论对照部分基于本站&#12298;[VBD 与 AVBD 详解](/knowledge/vbd-avbd-math/)&#12299;。*
