---
title: "2D 物理引擎详解 — 向量、刚体、SAT 碰撞与冲量法约束求解"
excerpt: "从零构建一个 2D 刚体物理引擎：向量数学、刚体动力学与转动惯量、四种数值积分方法（前向/半隐式欧拉、中点、RK4）、圆-圆/多边形-多边形(SAT)/圆-多边形碰撞检测、冲量法碰撞响应与库仑摩擦限位、铰链/固定/弹簧关节、空间哈希加速。修正源码中弹簧力多余因子、摩擦冲量恢复系数误用、RK4 未耦合状态变量等错误。"
date: "2026-09-06"
category: "Physics"
subtopic: "RigidBodyDynamics"
tags: ["物理引擎", "刚体动力学", "碰撞检测", "冲量法", "JavaScript"]
readTime: "阅读约45分钟"
---

> 本文系统拆解一个基于 JavaScript + HTML5 Canvas 的 2D 刚体物理引擎——从向量数学到碰撞响应的完整链路。与基于位置的约束求解方法不同，本文的引擎采用**基于冲量的速度级求解**（sequential impulse），是 Box2D、PhysX 等工业级引擎的核心范式。
>
> 本文修正了原工程文档中的若干错误：弹簧力多余因子（§6.4）、摩擦冲量误用法向恢复系数（§5.3）、RK4 未耦合位置-速度状态（§3.4）、空间网格缺失字段（§7.2）。文末与&#12298;[VBD 与 AVBD 详解](/knowledge/vbd-avbd-math/)&#12299;（位置法 vs 冲量法）、&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;、&#12298;[凸体碰撞检测的数学原理详解](/knowledge/collision-detection-gjk-epa-sat/)&#12299;、&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;形成交叉引用。

---

## 一、向量数学基础

### 1.1 Vector2 类

2D 物理引擎的基础是二维向量。所有位置、速度、力、法线都用 `Vector2` 表示：

```javascript
class Vector2 {
    constructor(x, y) { this.x = x; this.y = y; }
}
```

### 1.2 基本运算

**加减与标量乘**：

$$
\mathbf{a} \pm \mathbf{b} = \begin{bmatrix} a_x \pm b_x \\ a_y \pm b_y \end{bmatrix}, \quad k\,\mathbf{a} = \begin{bmatrix} k\,a_x \\ k\,a_y \end{bmatrix}
$$

```javascript
function Add(a, b)  { return new Vector2(a.x + b.x, a.y + b.y); }
function Sub(a, b)  { return new Vector2(a.x - b.x, a.y - b.y); }
function Scale(a, k) { return new Vector2(a.x * k, a.y * k); }
```

**点积**——投影与夹角判断：

$$
\mathbf{a} \cdot \mathbf{b} = a_x b_x + a_y b_y = |\mathbf{a}||\mathbf{b}|\cos\theta
$$

正值表示锐角、零表示垂直、负值表示钝角。用于计算相对速度在法线方向的投影。

```javascript
Dot(vec) { return this.x * vec.x + this.y * vec.y; }
```

**叉积（2D 标量版）**——有向面积与力矩：

$$
\mathbf{a} \times \mathbf{b} = a_x b_y - a_y b_x
$$

正值表示 $\mathbf{b}$ 在 $\mathbf{a}$ 的逆时针方向，负值表示顺时针。用于计算力矩 $\tau = \mathbf{r}\times\mathbf{F}$ 和判断点在线段的哪一侧。

```javascript
Cross(vec) { return this.x * vec.y - this.y * vec.x; }
```

**长度与法向量**：

$$
|\mathbf{v}| = \sqrt{v_x^2 + v_y^2}, \quad \mathbf{n} = \begin{bmatrix} v_y \\ -v_x \end{bmatrix}
$$

```javascript
Length()  { return Math.sqrt(this.Length2()); }
Length2() { return this.x * this.x + this.y * this.y; }
GetNormal() { return new Vector2(this.y, -this.x); }
```

`Length2()` 常用于避免开方运算（如碰撞检测中比较平方距离）。

### 1.3 几何计算

**多边形质心**（鞋带公式）：

$$
A = \frac{1}{2}\sum_{i=0}^{n-1}(x_i y_{i+1} - x_{i+1} y_i)
$$

$$
C_x = \frac{1}{6A}\sum_{i=0}^{n-1}(x_i + x_{i+1})(x_i y_{i+1} - x_{i+1} y_i), \quad C_y = \frac{1}{6A}\sum_{i=0}^{n-1}(y_i + y_{i+1})(x_i y_{i+1} - x_{i+1} y_i)
$$

其中顶点循环（$x_n = x_0$），逆时针顺序时 $A > 0$。

```javascript
static calcCentroid(vertices) {
    let A = this.calcArea(vertices);
    let n = vertices.length, Cx = 0, Cy = 0;
    for (let i = 0; i < n; i++) {
        let j = (i + 1) % n;
        let cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
        Cx += (vertices[i].x + vertices[j].x) * cross;
        Cy += (vertices[i].y + vertices[j].y) * cross;
    }
    return new Vector2(Cx / (6 * A), Cy / (6 * A));
}
```

**绕点旋转**——将点 $\mathbf{p}$ 绕中心 $\mathbf{c}$ 旋转 $\theta$：

$$
\mathbf{p}' = R(\theta)\,(\mathbf{p} - \mathbf{c}) + \mathbf{c}, \quad R(\theta) = \begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}
$$

```javascript
static rotateAroundPoint(p, c, rad) {
    let d = Sub(p, c);
    return new Vector2(
        d.x * Math.cos(rad) - d.y * Math.sin(rad) + c.x,
        d.x * Math.sin(rad) + d.y * Math.cos(rad) + c.y
    );
}
```

---

## 二、刚体动力学

### 2.1 刚体状态

每个刚体携带线运动与角运动状态，以及对应的质量倒数（逆质量）与转动惯量倒数（逆惯量）——使用倒数是为了将除法转为乘法，且静态物体（无限质量）的逆质量为零：

```javascript
class Rigidbody {
    constructor(shape, mass = 1) {
        this.mass = mass;
        this.invMass = 1 / mass;
        this.inertia = shape.calculateInertia(mass);
        this.invInertia = 1 / this.inertia;

        this.velocity = new Vector2(0, 0);
        this.angularVelocity = 0;
        this.forceAccumulator = new Vector2(0, 0);
        this.torqueAccumulator = 0;
    }
}
```

### 2.2 转动惯量

转动惯量 $I$ 是旋转运动的"质量"——越大越难被力矩加速。

| 形状 | 公式 |
|------|------|
| 圆形 | $I = \frac{1}{2}mr^2$ |
| 矩形 | $I = \frac{m(w^2+h^2)}{12}$ |
| 多边形（三角分解） | $I = \sum \frac{m_\triangle}{6}(|\mathbf{r}_0|^2 + |\mathbf{r}_1|^2 + \mathbf{r}_0\cdot\mathbf{r}_1)$ |

```javascript
// 圆形
calculateInertia(mass) { return mass * this.radius * this.radius * 0.5; }

// 多边形：分解为三角形求和
calculateInertia(mass) {
    let inertia = 0;
    let mPerTri = mass / this.vertices.length;
    for (let i = 0; i < this.vertices.length; i++) {
        let r0 = Sub(this.vertices[i], this.centroid);
        let r1 = Sub(this.vertices[(i + 1) % this.vertices.length], this.centroid);
        inertia += mPerTri * (r0.Length2() + r1.Length2() + r0.Dot(r1)) / 6;
    }
    return inertia;
}
```

### 2.3 牛顿运动定律

**线性运动**：$\mathbf{F} = m\mathbf{a}$，即 $\mathbf{a} = \mathbf{F}/m$

**旋转运动**：$\tau = I\alpha$，即 $\alpha = \tau/I$

在某点施加力时，同时产生线性加速度与角加速度：

```javascript
addForceAtPoint(atPoint, force) {
    let r = Sub(atPoint, this.shape.centroid);
    this.forceAccumulator = Add(this.forceAccumulator, force);
    this.torqueAccumulator += r.Cross(force);  // τ = r × F
}
```

---

## 三、数值积分方法

数值积分将连续运动方程离散为时间步迭代。本引擎实现了四种方法，精度与稳定性各异。

### 3.1 前向欧拉法

先更新位置（用旧速度），再更新速度（用旧加速度）：

$$
\mathbf{x}_{n+1} = \mathbf{x}_n + \mathbf{v}_n\,\Delta t, \quad \mathbf{v}_{n+1} = \mathbf{v}_n + \mathbf{a}_n\,\Delta t
$$

```javascript
forwardEuler(dt) {
    let a = Scale(this.forceAccumulator, this.invMass);
    this.shape.move(Scale(this.velocity, dt));     // 旧速度
    this.velocity = Add(this.velocity, Scale(a, dt));
    let aa = this.torqueAccumulator * this.invInertia;
    this.shape.rotate(this.angularVelocity * dt);
    this.angularVelocity += aa * dt;
}
```

一阶精度 $O(\Delta t)$，**能量单调增加**（不稳定），不推荐用于物理模拟。

### 3.2 半隐式欧拉法

先更新速度，再用**新速度**更新位置：

$$
\mathbf{v}_{n+1} = \mathbf{v}_n + \mathbf{a}_n\,\Delta t, \quad \mathbf{x}_{n+1} = \mathbf{x}_n + \mathbf{v}_{n+1}\,\Delta t
$$

```javascript
semiImplicitEuler(dt) {
    let a = Scale(this.forceAccumulator, this.invMass);
    this.velocity = Add(this.velocity, Scale(a, dt));  // 先更新速度
    this.shape.move(Scale(this.velocity, dt));          // 用新速度
    let aa = this.torqueAccumulator * this.invInertia;
    this.angularVelocity += aa * dt;
    this.shape.rotate(this.angularVelocity * dt);
}
```

一阶精度 $O(\Delta t)$，但是**辛积分器**——保持相空间体积，能量有界振荡（稳定），是游戏物理引擎的标准选择。

### 3.3 中点法

使用半步处的导数：

$$
\mathbf{v}_{n+1/2} = \mathbf{v}_n + \frac{\mathbf{a}_n\,\Delta t}{2}, \quad \mathbf{x}_{n+1} = \mathbf{x}_n + \mathbf{v}_{n+1/2}\,\Delta t, \quad \mathbf{v}_{n+1} = \mathbf{v}_{n+1/2} + \frac{\mathbf{a}_n\,\Delta t}{2}
$$

```javascript
midPointMethod(dt) {
    let a = Scale(this.forceAccumulator, this.invMass);
    let halfA = Scale(a, 0.5);
    this.velocity = Add(this.velocity, Scale(halfA, dt));
    this.shape.move(Scale(this.velocity, dt));
    this.velocity = Add(this.velocity, Scale(halfA, dt));
}
```

二阶精度 $O(\Delta t^2)$，比欧拉法更准确。

### 3.4 四阶龙格-库塔法（RK4）

RK4 是最精确的方法，使用四个斜率的加权平均。**关键：RK4 必须应用于耦合的状态向量 $(\mathbf{x}, \mathbf{v}, \theta, \omega)$，在每个中间状态重新计算力。**

> **源码错误修正**：原工程代码将速度增量 `k1` 加到力上（`tempForce = Add(force, Scale(k1, 0.5))`），这在量纲上不正确——力（$N$）与速度增量（$m/s$）不能相加。正确的 RK4 必须在每个中间状态重新计算力 $\mathbf{F}(\mathbf{x})$（力通常依赖位置，如弹簧），并对位置和速度同步推进。

正确实现如下——状态向量为 $\mathbf{y} = (\mathbf{x}, \mathbf{v}, \theta, \omega)$，导数为 $\mathbf{f}(\mathbf{y}) = (\mathbf{v},\, \mathbf{F}(\mathbf{x})/m,\, \omega,\, \tau/I)$：

$$
\mathbf{k}_1 = \mathbf{f}(\mathbf{y}_n)
$$

$$
\mathbf{k}_2 = \mathbf{f}\!\left(\mathbf{y}_n + \frac{\mathbf{k}_1\,\Delta t}{2}\right)
$$

$$
\mathbf{k}_3 = \mathbf{f}\!\left(\mathbf{y}_n + \frac{\mathbf{k}_2\,\Delta t}{2}\right)
$$

$$
\mathbf{k}_4 = \mathbf{f}(\mathbf{y}_n + \mathbf{k}_3\,\Delta t)
$$

$$
\mathbf{y}_{n+1} = \mathbf{y}_n + \frac{\Delta t}{6}(\mathbf{k}_1 + 2\mathbf{k}_2 + 2\mathbf{k}_3 + \mathbf{k}_4)
$$

```javascript
rungeKutta4(dt) {
    // 保存初始状态
    let x0 = this.getPosition(), v0 = this.velocity;
    let th0 = this.getRotation(), w0 = this.angularVelocity;

    // k1: 在初始状态求导 f(y_n) = (v, F/m, ω, τ/I)
    let k1 = this.computeDerivatives(x0, v0, th0, w0);

    // k2: 在 y + k1*dt/2 处求导（需重新计算力）
    let s1 = this.combineState(x0, v0, th0, w0, k1, dt * 0.5);
    let k2 = this.computeDerivatives(s1.x, s1.v, s1.th, s1.w);

    // k3: 在 y + k2*dt/2 处求导
    let s2 = this.combineState(x0, v0, th0, w0, k2, dt * 0.5);
    let k3 = this.computeDerivatives(s2.x, s2.v, s2.th, s2.w);

    // k4: 在 y + k3*dt 处求导
    let s3 = this.combineState(x0, v0, th0, w0, k3, dt);
    let k4 = this.computeDerivatives(s3.x, s3.v, s3.th, s3.w);

    // 加权平均: y_{n+1} = y_n + (k1 + 2k2 + 2k3 + k4) * dt/6
    this.applyUpdate(x0, v0, th0, w0, k1, k2, k3, k4, dt);
}

// 计算状态导数：需要基于当前预测位置重新计算力
computeDerivatives(x, v, th, w) {
    this.setPosition(x);      // 设为预测位置以重新计算力
    this.setVelocity(v);
    this.setRotation(th);
    this.setAngularVelocity(w);
    this.computeForces();     // 重新计算 F(x)（弹簧力等依赖位置）
    return {
        dx: v,
        dv: Scale(this.forceAccumulator, this.invMass),
        dth: w,
        dw: this.torqueAccumulator * this.invInertia
    };
}
```

四阶精度 $O(\Delta t^4)$，非常准确，但需 4 次力计算，成本较高。对于常力（如重力）RK4 退化为半隐式欧拉；RK4 的优势在力依赖位置的场景（弹簧、柔性体）。

> 数值积分方法的系统分析——辛性、稳定性域、精度阶——见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。

### 3.5 积分方法对比

| 方法 | 精度 | 稳定性 | 计算量 | 适用场景 |
|------|------|--------|--------|----------|
| 前向欧拉 | $O(\Delta t)$ | 差（能量增长） | 低 | 不推荐 |
| 半隐式欧拉 | $O(\Delta t)$ | 好（辛） | 低 | 游戏物理 |
| 中点法 | $O(\Delta t^2)$ | 中 | 中 | 一般模拟 |
| RK4 | $O(\Delta t^4)$ | 好 | 高（4 次力计算） | 高精度 |

---

## 四、碰撞检测

碰撞检测分两个阶段：**宽相**（broad phase）快速排除不可能碰撞的物体对，**窄相**（narrow phase）精确计算碰撞信息。

### 4.1 圆-圆碰撞

最简单的碰撞——比较圆心距离与半径和：

$$
|\mathbf{c}_A - \mathbf{c}_B| < r_A + r_B
$$

碰撞信息：穿透深度 $d = (r_A + r_B) - |\mathbf{c}_A - \mathbf{c}_B|$，法线 $\mathbf{n} = \frac{\mathbf{c}_B - \mathbf{c}_A}{|\mathbf{c}_B - \mathbf{c}_A|}$（从 A 指向 B），接触点 $\mathbf{p} = \mathbf{c}_A + r_A\,\mathbf{n}$。

```javascript
static circleVsCircle(a, b) {
    let dir = Sub(b.getCentroid(), a.getCentroid());
    let sumR = a.getRadius() + b.getRadius();
    if (dir.Length2() < sumR * sumR) {           // 平方距离避免开方
        let len = dir.Length();
        let n = Scale(dir, 1 / len);
        return new CollisionManifold(len - sumR, n,
            Add(a.getCentroid(), Scale(n, a.getRadius())));
    }
    return null;
}
```

### 4.2 多边形-多边形碰撞（SAT 算法）

**分离轴定理（Separating Axis Theorem）**：两个凸多边形不相交，当且仅当存在一条分离轴（两多边形投影不重叠）。对于凸多边形，分离轴候选只需测试各边的法线。

#### 4.2.1 支撑点查找

对每条边的法线，找另一个多边形中穿透最深的顶点：

$$
d = -(\mathbf{v} - \mathbf{p}) \cdot \mathbf{n}
$$

其中 $\mathbf{v}$ 是测试顶点，$\mathbf{p}$ 是边上参考点，$\mathbf{n}$ 是边的外法线。

```javascript
static findSupportPoint(normal, pointOnEdge, verts) {
    let deepest = 0, support = null;
    for (let v of verts) {
        let penetration = Sub(v, pointOnEdge).Dot(Scale(normal, -1));
        if (penetration > deepest) {
            deepest = penetration;
            support = { vertex: v, depth: penetration };
        }
    }
    return support;  // null 表示分离
}
```

#### 4.2.2 双向检测

从两个多边形分别检测，取穿透深度较小的结果：

```javascript
static polygonVsPolygon(a, b) {
    let cA = this.getContactPoint(a, b);  // 从 A 的边法线检测
    if (!cA) return null;
    let cB = this.getContactPoint(b, a);  // 从 B 的边法线检测
    if (!cB) return null;
    // 取穿透较小者
    return cA.depth < cB.depth
        ? new CollisionManifold(cA.depth, cA.normal, cA.point)
        : new CollisionManifold(cB.depth, Scale(cB.normal, -1), cB.point);
}
```

> SAT 是凸体碰撞检测的基础方法。对于更通用的凸体（非多边形表示），GJK + EPA 提供了基于 Minkowski 差的统一框架，详见&#12298;[凸体碰撞检测的数学原理详解](/knowledge/collision-detection-gjk-epa-sat/)&#12299;。

### 4.3 圆-多边形碰撞

分两种情况：**边碰撞**（圆心在边的 Voronoi 区域内）与**角碰撞**（圆心最接近某顶点）。

边碰撞检测：将圆心投影到边方向，若投影在边范围内且法线投影为正，则测试该边的穿透：

```javascript
static circleVsPolygonEdges(circle, poly) {
    let bestNormal = null, bestVertex = null;
    for (let i = 0; i < poly.vertices.length; i++) {
        let curr = poly.vertices[i];
        let next = poly.vertices[(i + 1) % poly.vertices.length];
        let edgeDir = Sub(next, curr);
        let toCircle = Sub(circle.centroid, curr);
        let proj = toCircle.Dot(edgeDir.GetNormal()); // 投影到法线
        // ... 取穿透最深的边
    }
    // 返回流形
}
```

角碰撞检测：检查圆心到各顶点的距离是否小于半径。

### 4.4 碰撞流形

碰撞流形存储碰撞的全部信息：

```javascript
class CollisionManifold {
    constructor(depth, normal, point) {
        this.depth = depth;        // 穿透深度
        this.normal = normal;      // 碰撞法线（从 A 指向 B）
        this.penetrationPoint = point; // 接触点
        this.rigiA = null;
        this.rigiB = null;
    }
}
```

---

## 五、碰撞响应与冲量求解

### 5.1 冲量基础

冲量是力对时间的积分，等于动量变化：

$$
\mathbf{J} = \int \mathbf{F}\,dt = \Delta\mathbf{p} = m\,\Delta\mathbf{v}
$$

施加冲量后的速度：$\mathbf{v}' = \mathbf{v} + \mathbf{J}/m$。

### 5.2 法向冲量推导

#### 接触点速度

接触点的速度包括质心线速度与角速度贡献：

$$
\mathbf{v}_P = \mathbf{v}_{cm} + \omega\,\mathbf{r}^{\perp}
$$

其中 $\mathbf{r}^{\perp} = (-r_y, r_x)$ 是位置向量的逆时针 90° 旋转，$\omega\,\mathbf{r}^{\perp}$ 是旋转产生的切向速度。

```javascript
let rA = Sub(contactPoint, rigiA.shape.centroid);
let velA = Add(rigiA.velocity, new Vector2(
    -rigiA.angularVelocity * rA.y, rigiA.angularVelocity * rA.x));
```

#### 相对速度与法向分量

$$
\mathbf{v}_{rel} = \mathbf{v}_B - \mathbf{v}_A, \quad v_n = \mathbf{v}_{rel} \cdot \mathbf{n}
$$

$v_n > 0$ 表示分离（无需处理），$v_n < 0$ 表示接近（需碰撞响应）。

#### 冲量大小

由动量守恒与恢复系数 $e$ 推导，冲量大小为：

$$
j = \frac{-(1+e)\,v_n}{\dfrac{1}{m_A} + \dfrac{1}{m_B} + \dfrac{(\mathbf{r}_A\times\mathbf{n})^2}{I_A} + \dfrac{(\mathbf{r}_B\times\mathbf{n})^2}{I_B}}
$$

分母是**有效质量的倒数**——综合了线性惯性与旋转惯性。$\mathbf{r}\times\mathbf{n}$ 是力臂与法线的叉积（2D 标量），平方后除以转动惯量得到旋转对冲量的贡献。

```javascript
let e = (2 * rigiA.material.restitution * rigiB.material.restitution) /
        (rigiA.material.restitution + rigiB.material.restitution);
let rnA = rA.Cross(normal), rnB = rB.Cross(normal);
let invMassSum = rigiA.invMass + rigiB.invMass;
let rotSum = rnA * rnA * rigiA.invInertia + rnB * rnB * rigiB.invInertia;
let j = -(1 + e) * vn / (invMassSum + rotSum);
```

#### 应用冲量

```javascript
let impulse = Scale(normal, j);
rigiA.velocity = Add(rigiA.velocity, Scale(impulse, -rigiA.invMass));
rigiB.velocity = Add(rigiB.velocity, Scale(impulse,  rigiB.invMass));
rigiA.angularVelocity -= rnA * j * rigiA.invInertia;
rigiB.angularVelocity += rnB * j * rigiB.invInertia;
```

### 5.3 摩擦冲量

> **源码错误修正**：原代码使用 `-(1 + e) * v·t * friction` 计算摩擦冲量并直接乘以摩擦系数。这有两个错误：① 摩擦力是耗散的，切向恢复系数应为 0，不应使用法向恢复系数 $e$；② 摩擦系数不应直接乘入冲量，而应作为库仑极限 $\mu\,j_n$ 对冲量进行限位。正确做法是先计算无约束切向冲量，再用 $|\mu\,j_n|$ 限位。

#### 切向速度与方向

$$
\mathbf{v}_t = \mathbf{v}_{rel} - (\mathbf{v}_{rel}\cdot\mathbf{n})\,\mathbf{n}
$$

切向方向取相对运动的反方向（摩擦力反对相对滑动）：

```javascript
let vn_vec = Scale(normal, relativeVelocity.Dot(normal));
let tangent = Sub(relativeVelocity, vn_vec);
if (tangent.Length2() < 1e-10) return;  // 无切向运动，无摩擦
tangent = Scale(tangent, -1);
tangent.Normalize();
```

#### 切向冲量（正确实现）

切向冲量计算与法向类似，但**恢复系数为 0**（不乘 $(1+e)$），然后用库仑摩擦限位：

$$
j_t = \frac{-\mathbf{v}_{rel}\cdot\mathbf{t}}{\dfrac{1}{m_A} + \dfrac{1}{m_B} + \dfrac{(\mathbf{r}_A\times\mathbf{t})^2}{I_A} + \dfrac{(\mathbf{r}_B\times\mathbf{t})^2}{I_B}}
$$

库仑限位：$|j_t| \le \mu\,j_n$（摩擦力不超过正压力的 $\mu$ 倍）。

```javascript
let friction = (2 * rigiA.material.friction * rigiB.material.friction) /
               (rigiA.material.friction + rigiB.material.friction);

let rtA = rA.Cross(tangent), rtB = rB.Cross(tangent);
let rotSumT = rtA * rtA * rigiA.invInertia + rtB * rtB * rigiB.invInertia;

// 切向冲量（切向恢复系数为 0，不含 (1+e)）
let jt = -relativeVelocity.Dot(tangent) / (invMassSum + rotSumT);

// 库仑摩擦限位: |jt| ≤ μ * j_n
let maxFriction = friction * j;
jt = Math.max(-maxFriction, Math.min(maxFriction, jt));

// 应用摩擦冲量
let frictionImpulse = Scale(tangent, jt);
rigiA.velocity = Sub(rigiA.velocity, Scale(frictionImpulse, rigiA.invMass));
rigiB.velocity = Add(rigiB.velocity, Scale(frictionImpulse, rigiB.invMass));
rigiA.angularVelocity -= rtA * jt * rigiA.invInertia;
rigiB.angularVelocity += rtB * jt * rigiB.invInertia;
```

### 5.4 位置修正

冲量法修正速度但不修正位置——穿透仍存在。需直接修正位置（Baumgarte 稳定化），按质量比例分配：

```javascript
positionalCorrection() {
    let percent = 0.2;  // 每帧修正 20%
    let correction = Scale(normal, this.depth / (rigiA.invMass + rigiB.invMass) * percent);
    if (!rigiA.isKinematic) rigiA.getShape().move(Scale(correction, -rigiA.invMass));
    if (!rigiB.isKinematic) rigiB.getShape().move(Scale(correction,  rigiB.invMass));
}
```

### 5.5 迭代求解

碰撞约束需多次迭代（顺序冲量法 / sequential impulse）逐步收敛：

```javascript
for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < rigidBodies.length; i++) {
        // ... 碰撞检测
        if (manifold != null) {
            manifold.resolveCollision();
            manifold.positionalCorrection();
        }
    }
}
```

> 顺序冲量法是 Box2D、PhysX 的核心范式——每次迭代求解一个约束的冲量，多次迭代逼近全局解。这与基于位置的 PBD/XPBD 的约束投影形成对比，后者直接修正位置。两者的统一框架见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;与&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。

---

## 六、关节系统

关节约束两个刚体之间的相对运动。

| 关节类型 | 约束 | 自由度 |
|----------|------|--------|
| 铰链关节 | 位置重合，允许旋转 | 约束 2 平移 |
| 固定关节 | 位置 + 角度锁定 | 约束 3 (2 平移 + 1 旋转) |
| 弹簧关节 | 胡克力，软约束 | 0 |
| 力关节 | 恒力指向锚点 | 0 |

### 6.1 关节连接

关节通过锚点连接两个刚体：

```javascript
class JointConnection {
    constructor(rigiA, anchorAId, rigiB, anchorBId) {
        this.rigidBodyA = rigiA; this.anchorAId = anchorAId;
        this.rigidBodyB = rigiB; this.anchorBId = anchorBId;
    }
}
```

### 6.2 铰链关节

约束两锚点重合，但允许相对旋转。用迭代冲量将距离约束转化为碰撞问题：

```javascript
class HingeJoint extends Joint {
    constructor(conn) {
        super(conn);
        this.restLength = Sub(this.getAnchorAPos(), this.getAnchorBPos()).Length();
        this.iterations = 20;
    }
    updateConnectionA() {
        this.setMaterialZero();  // 恢复系数置 0，避免弹跳
        for (let i = 0; i < this.iterations; i++) {
            let dir = Sub(this.getAnchorAPos(), this.getAnchorBPos());
            let dist = dir.Length();
            if (dist < 1e-7) break;
            dir.Normalize();
            let contact = new CollisionManifold(
                Math.abs(dist - this.restLength),
                dist > this.restLength ? dir : Scale(dir, -1),
                this.getAnchorBPos());
            contact.rigiA = this.rigiA; contact.rigiB = this.rigiB;
            contact.positionalCorrection();
            contact.resolveCollision();
        }
        this.restoreMaterial();
    }
}
```

### 6.3 固定关节

在铰链关节基础上增加角度约束 $\theta_A - \theta_B = \theta_{rest}$：

```javascript
class FixedJoint extends Joint {
    constructor(conn) {
        super(conn);
        this.restOrientation = rigiB.getShape().orientation - rigiA.getShape().orientation;
    }
    updateConnectionA() {
        // ... 位置约束（同铰链）
        let diff = rigiB.getShape().orientation - rigiA.getShape().orientation;
        let error = this.restOrientation - diff;
        rigiB.angularVelocity += error * 0.5;
    }
}
```

### 6.4 弹簧关节

> **源码错误修正**：原代码 `forceMagnitude = restDistance * this.restlength * this.springConstant * forceHalving` 中多了一个 `* this.restlength` 因子，量纲不正确（力 = $N/m \times m = N$，多乘长度得到 $N\cdot m$ 即力矩）。正确公式为胡克定律 $F = k\,\Delta x$。

胡克定律：

$$
F = -k\,(x - x_0)
$$

其中 $k$ 是弹簧刚度，$x - x_0$ 是形变量。

```javascript
class SpringJoint extends Joint {
    constructor(conn, k, restLength) {
        super(conn);
        this.springConstant = k;
        this.restLength = restLength;
    }
    updateConnectionA() {
        if (this.rigiA.isKinematic) return;
        let dir = Sub(this.getAnchorBPos(), this.getAnchorAPos());
        let dist = dir.Length();
        let deformation = dist - this.restLength;  // 形变量 Δx

        // 若另一端为静态物体，力不分摊；否则各承受一半
        let halving = this.rigiB.isKinematic ? 1 : 0.5;

        // F = k * Δx（修正：去掉多余的 * restLength 因子）
        let forceMag = deformation * this.springConstant * halving;
        dir.Normalize();
        this.rigiA.addForceAtPoint(this.getAnchorAPos(), Scale(dir, forceMag));
    }
}
```

形变 $> 0$（拉伸）时力指向另一锚点（拉力）；形变 $< 0$（压缩）时力背离（推力）。

### 6.5 力关节与反向力关节

力关节施加恒力指向另一锚点；反向力关节在距离小于阈值时产生排斥力：

```javascript
class ForceJoint extends Joint {
    constructor(conn, strength) { super(conn); this.strength = strength; }
    updateConnectionA() {
        if (this.rigiA.isKinematic) return;
        let dir = Sub(this.getAnchorBPos(), this.getAnchorAPos());
        dir.Normalize();
        let halving = this.rigiB.isKinematic ? 1 : 0.5;
        this.rigiA.addForceAtPoint(this.getAnchorBPos(),
            Scale(dir, this.strength * halving));
    }
}
```

---

## 七、空间优化

### 7.1 AABB 宽相

轴对齐包围盒（AABB）快速排除不可能碰撞的物体对：

$$
\text{intersect} = (A_{\max,x} > B_{\min,x}) \land (A_{\min,x} < B_{\max,x}) \land (A_{\max,y} > B_{\min,y}) \land (A_{\min,y} < B_{\max,y})
$$

```javascript
class BoundingBox {
    intersect(other) {
        return other.bottomRight.x > this.topLeft.x &&
               other.topLeft.x < this.bottomRight.x &&
               other.topLeft.y < this.bottomRight.y &&
               other.bottomRight.y > this.topLeft.y;
    }
}
```

### 7.2 空间网格

将世界划分为固定大小的网格单元，每个物体注册到覆盖的单元中。复杂度从 $O(n^2)$ 降至接近 $O(n)$。

> **源码补全**：`getNeighbourRigis` 方法使用 `this.rigidBodiesToCells[rigiIndex]`，但原代码未在构造函数中初始化此字段。以下补全了初始化逻辑。

```javascript
class SpatialGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = [];
        this.rigidBodiesToCells = [];  // 补全：物体索引 → 覆盖的格子索引列表
    }
    initialize(worldSize, rigidBodies) {
        this.rigidBodies = rigidBodies;
        this.cellCountX = Math.ceil(worldSize.x / this.cellSize);
        this.cellCountY = Math.ceil(worldSize.y / this.cellSize);
        this.cells = new Array(this.cellCountX * this.cellCountY);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
        // 补全：为每个物体初始化覆盖列表
        for (let i = 0; i < rigidBodies.length; i++) this.rigidBodiesToCells[i] = [];
    }
    mapBodiesToCell() {
        for (let i = 0; i < this.rigidBodies.length; i++) {
            let bb = this.rigidBodies[i].getShape().boundingBox;
            let lx = Math.floor(bb.topLeft.x / this.cellSize);
            let rx = Math.floor(bb.bottomRight.x / this.cellSize);
            let ty = Math.floor(bb.topLeft.y / this.cellSize);
            let by = Math.floor(bb.bottomRight.y / this.cellSize);
            for (let x = lx; x <= rx; x++)
                for (let y = ty; y <= by; y++)
                    this.cells[x + y * this.cellCountX].push(this.rigidBodies[i]);
        }
    }
    getNeighbourRigis(rigiIndex, body) {
        let neighbors = [];
        let occupied = this.rigidBodiesToCells[rigiIndex];
        for (let cellIdx of occupied)
            for (let b of this.cells[cellIdx])
                if (b !== body) neighbors.push(b);
        return neighbors;
    }
}
```

> 注意：`mapBodiesToCell` 在将物体加入格子时，也应记录物体覆盖的格子索引到 `rigidBodiesToCells`，否则 `getNeighbourRigis` 无法工作。上述 `HashGrid.mapBodiesToCell`（§7.3）已正确处理此逻辑。

### 7.3 空间哈希

对于无限或非常大的世界，用哈希函数将网格坐标映射到有限哈希表：

$$
h(x, y) = (x\cdot p_1 \oplus y\cdot p_2) \bmod N
$$

其中 $p_1, p_2$ 是大质数，$\oplus$ 是异或，$N$ 是哈希表大小。

```javascript
class HashGrid extends SpatialGrid {
    constructor(cellSize) {
        super(cellSize);
        this.hashMap = new Map();
        this.hashMapSize = 10000;
        this.p1 = 125311; this.p2 = 588667;
    }
    cellIndexToHash(x, y) {
        return ((x * this.p1) ^ (y * this.p2)) % this.hashMapSize;
    }
    mapBodiesToCell() {
        for (let i = 0; i < this.rigidBodies.length; i++) {
            let bb = this.rigidBodies[i].getShape().boundingBox;
            let lx = Math.floor(bb.topLeft.x / this.cellSize);
            let rx = Math.floor(bb.bottomRight.x / this.cellSize);
            let ty = Math.floor(bb.topLeft.y / this.cellSize);
            let by = Math.floor(bb.bottomRight.y / this.cellSize);
            for (let x = lx; x <= rx; x++)
                for (let y = ty; y <= by; y++) {
                    let h = this.cellIndexToHash(x, y);
                    let entries = this.hashMap.get(h);
                    if (!entries) { entries = []; this.hashMap.set(h, entries); }
                    entries.push(this.rigidBodies[i]);
                    this.rigidBodiesToCells[i].push(h);  // 记录覆盖的格子
                }
        }
    }
}
```

### 7.4 碰撞组

使用位掩码实现高效碰撞过滤：

```javascript
const CollisionGroups = {
    GROUP0: { id: 1 << 0 }, GROUP1: { id: 1 << 1 },
    GROUP2: { id: 1 << 2 }, GROUP3: { id: 1 << 3 },
};
canCollide(a, b) { return (CollisionMatrix[a] & b) !== 0; }
enableBetween(a, b) { CollisionMatrix[a] |= b; CollisionMatrix[b] |= a; }
disableBetween(a, b) { CollisionMatrix[a] &= ~b; CollisionMatrix[b] &= ~a; }
```

---

## 八、与 AVBD 的对比

源文档将本引擎与"AVBD"对比但未定义该术语。**AVBD（Augmented Vertex Block Descent）** 是一种基于位置的物理求解方法——VBD 将隐式时间步进重构为能量最小化问题，以块坐标下降（BCD）求解；AVBD 用增广拉格朗日法（ALM）增强硬约束处理。两者的核心区别在于求解变量与积分方式：

| 方面 | 本引擎（冲量法） | AVBD（位置法） |
|------|------------------|----------------|
| 求解变量 | 速度 | 位置 |
| 约束处理 | 顺序冲量 | 增广拉格朗日 |
| 时间积分 | 显式（半隐式欧拉 / RK4） | 隐式（变分形式） |
| 稳定性 | 依赖迭代次数 | 自适应惩罚参数 |
| 能量守恒 | 较差（需位置修正补偿） | 较好（变分结构） |
| 实现复杂度 | 简单 | 复杂 |
| 适用场景 | 游戏、实时模拟 | 高精度模拟 |

冲量法在速度层面求解约束，然后积分位置；位置法直接修正位置满足约束。VBD/AVBD 的变分隐式积分与块坐标下降的完整推导见&#12298;[VBD 与 AVBD 详解](/knowledge/vbd-avbd-math/)&#12299;，PBD/XPBD 的约束投影框架见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;。

---

## 九、主循环与数学公式汇总

### 9.1 模拟主循环

```javascript
update(dt) {
    this.handleJoints();           // 1. 更新关节
    for (let body of this.rigidBodies) {
        body.addForce(Scale(gravity, body.mass));  // 2. 施加重力
        body.update(dt);            // 3. 积分
    }
    this.grid.refreshGrid();        // 4. 刷新空间网格
    for (let iter = 0; iter < 5; iter++) {  // 5. 碰撞检测与响应（迭代）
        for (let i = 0; i < this.rigidBodies.length; i++) {
            let neighbors = this.grid.getNeighbourRigis(i, this.rigidBodies[i]);
            for (let rigiB of neighbors) {
                if (!rigiA.shape.boundingBox.intersect(rigiB.shape.boundingBox)) continue;
                let m = CollisionDetection.checkCollisions(rigiA, rigiB);
                if (m) { m.resolveCollision(); m.positionalCorrection(); }
            }
        }
    }
}
```

### 9.2 公式汇总

| 公式 | 描述 |
|------|------|
| $\mathbf{F} = m\mathbf{a}$ | 牛顿第二定律 |
| $\tau = I\alpha$ | 旋转运动方程 |
| $\tau = \mathbf{r}\times\mathbf{F}$ | 力矩 |
| $I_{circle} = \frac{1}{2}mr^2$ | 圆形转动惯量 |
| $I_{rect} = \frac{m(w^2+h^2)}{12}$ | 矩形转动惯量 |
| $j = \frac{-(1+e)\,v_n}{\frac{1}{m_A}+\frac{1}{m_B}+\frac{(\mathbf{r}_A\times\mathbf{n})^2}{I_A}+\frac{(\mathbf{r}_B\times\mathbf{n})^2}{I_B}}$ | 法向冲量 |
| $j_t = \frac{-\mathbf{v}_{rel}\cdot\mathbf{t}}{K_t},\quad \|j_t\| \le \mu\,j_n$ | 摩擦冲量（库仑限位） |
| $F = -k(x - x_0)$ | 胡克定律 |

---

## 十、参考文献

1. Millington, I. *Game Physics Engine Development*. Morgan Kaufmann. ——游戏物理引擎开发经典。
2. Ericson, C. *Real-Time Collision Detection*. CRC Press. ——实时碰撞检测权威参考。
3. Catto, E. *Box2D Manual*. ——Box2D 引擎文档，顺序冲量法的工业实现。
4. Catto, E. (2014). *Sequential Impulses*. GDC Physics Tutorial. ——顺序冲量法原理。
5. Bourg, D. M. *Physics for Game Developers*. O'Reilly. ——游戏开发者物理。
