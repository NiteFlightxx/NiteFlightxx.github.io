---
title: "经典力学三大体系详解 — 牛顿、拉格朗日与哈密顿的等价框架与工程映射"
excerpt: "系统梳理牛顿力学、拉格朗日力学与哈密顿力学三大经典力学体系的公理基础、核心方程与相互等价性推导。从牛顿第二定律出发，经最小作用量原理推导欧拉-拉格朗日方程，再经勒让德变换抵达哈密顿正则方程与相空间。覆盖广义坐标、循环坐标与诺特定理、泊松括号与辛结构、刘维尔定理，以及三大体系在实时物理模拟中的工程映射——牛顿对应质点弹簧显式积分、拉格朗日对应约束求解与变分积分器、哈密顿对应辛积分与长时间能量守恒。"
date: "2026-07-02"
category: "Physics"
subtopic: "RigidBodyDynamics"
tags: ["经典力学", "牛顿力学", "拉格朗日力学", "哈密顿力学", "变分原理", "分析力学"]
readTime: "阅读约45分钟"
---

> 经典力学是描述宏观物体运动规律的物理学基础。历史上形成了三种等价但视角不同的力学体系：**牛顿力学**（1687，力与加速度的矢量力学）、**拉格朗日力学**（1788，能量与变分的分析力学）、**哈密顿力学**（1833，相空间与辛几何）。三者描述的是同一个物理世界，可以互相推导，但各自的数学结构和适用场景截然不同。
>
> 这不是一篇纯理论物理文档。三大体系的真正工程价值在于：**实时物理模拟中的每一种数值方法都可以追溯到某个力学体系的计算范式**——显式积分对应牛顿矢量力学，约束求解对应拉格朗日乘子法，辛积分器对应哈密顿流。理解三大体系，就是理解物理引擎背后的数学分类学。
>
> 阅读前建议回顾本站&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;的显式/隐式/辛欧拉积分，以及&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;的约束求解——本文的工程映射部分将与它们交叉引用。

---

## 一、为什么需要三种力学体系

### 1.1 发展脉络

```
牛顿力学（1687）—— 力与加速度的矢量力学
    ↓  引入广义坐标与变分原理
拉格朗日力学（1788）—— 能量与作用量的分析力学
    ↓  勒让德变换到相空间
哈密顿力学（1833）—— 正则方程与辛几何
```

三者**在经典范围内完全等价**——对同一个物理系统，三种方法给出相同的运动方程和解。它们的区别不在于"描述了什么"，而在于"如何描述"。

### 1.2 核心思想对比

| 维度 | 牛顿力学 | 拉格朗日力学 | 哈密顿力学 |
|------|---------|------------|-----------|
| **基本变量** | 位置 $\mathbf{x}$、速度 $\mathbf{v}$ | 广义坐标 $q$、广义速度 $\dot{q}$ | 广义坐标 $q$、广义动量 $p$ |
| **核心量** | 力（矢量） | 拉格朗日量 $L=T-V$（标量） | 哈密顿量 $H=T+V$（标量） |
| **基本方程** | $\mathbf{F}=m\mathbf{a}$ | 欧拉-拉格朗日方程 | 哈密顿正则方程 |
| **方程阶数** | 二阶 ODE | 二阶 ODE | 一阶 ODE（维数加倍） |
| **空间** | 位形空间（$3N$ 维） | 位形空间（$n$ 维，$n$=自由度） | 相空间（$2n$ 维） |
| **约束处理** | 显式（需算出约束力） | 隐式（广义坐标自动消除） | 隐式（同拉格朗日） |
| **守恒律** | 手动推导 | 循环坐标自动显现 | 泊松括号自动判定 |

### 1.3 各自的痛点与优势

- **牛顿力学**：直观，工程实践的基础，但处理约束系统需要引入未知的约束力，方程数量爆炸。
- **拉格朗日力学**：通过广义坐标选择自动消除约束力，方程数量降到自由度数，但需要构造拉格朗日量，不如牛顿法直观。
- **哈密顿力学**：方程形式最对称（一阶、辛结构），长时间数值积分最稳定，且是通往量子力学和统计力学的桥梁——但相空间维度翻倍，工程直接计算反而不便。

---

## 二、牛顿力学：力与加速度的矢量力学

### 2.1 牛顿三定律

#### 第一定律（惯性定律）

物体在不受外力或合外力为零时，保持静止或匀速直线运动状态：

$$
\mathbf{F} = 0 \;\Rightarrow\; \mathbf{v} = \text{常量}
$$

**意义**：定义了惯性参考系，引入惯性质量的概念。第一定律不是第二定律 $\mathbf{F}=0$ 的特例——它断言惯性参考系的存在，是第二定律成立的前提。

#### 第二定律（加速度定律）⭐ 核心

物体的加速度与所受合外力成正比，与质量成反比：

$$
\boxed{\;\mathbf{F} = m\mathbf{a} = m\frac{d\mathbf{v}}{dt} = m\frac{d^2\mathbf{x}}{dt^2}\;}
$$

更普遍的微分形式（动量形式）：

$$
\mathbf{F} = \frac{d\mathbf{p}}{dt}, \qquad \mathbf{p} = m\mathbf{v}
$$

当质量随时间变化时（如火箭），动量形式 $\mathbf{F}=\dot{\mathbf{p}}$ 仍然成立，而 $\mathbf{F}=m\mathbf{a}$ 不成立。

**分量形式**（笛卡尔坐标）：

$$
F_x = m\ddot{x}, \quad F_y = m\ddot{y}, \quad F_z = m\ddot{z}
$$

这是一个**二阶常微分方程**，给定初始位置 $\mathbf{x}(0)$ 和初始速度 $\dot{\mathbf{x}}(0)$ 后，唯一确定运动轨迹。

#### 第三定律（作用反作用定律）

两物体间的作用力和反作用力大小相等、方向相反、作用在同一直线上：

$$
\mathbf{F}_{12} = -\mathbf{F}_{21}
$$

**意义**：力总是成对出现，保证系统总动量守恒（内力之和为零）。第三定律是动量守恒的微观原因。

### 2.2 质点系运动方程

对于 $N$ 个质点组成的系统，第 $i$ 个质点的运动方程为：

$$
m_i\ddot{\mathbf{x}}_i = \mathbf{F}_i^{\text{ext}} + \sum_{j \neq i} \mathbf{F}_{ij}
$$

其中 $\mathbf{F}_i^{\text{ext}}$ 是外力，$\mathbf{F}_{ij}$ 是第 $j$ 个质点对第 $i$ 个的内力。内力满足牛顿第三定律 $\mathbf{F}_{ij}=-\mathbf{F}_{ji}$，因此内力对总动量的贡献为零。

### 2.3 常见力的形式

| 力类型 | 表达式 | 说明 |
|--------|--------|------|
| **重力** | $\mathbf{F}_g = m\mathbf{g}$ | $\mathbf{g}\approx(0,0,-9.8)\,\text{m/s}^2$ |
| **弹簧力**（胡克定律） | $\mathbf{F}_s = -k(\mathbf{x}-\mathbf{x}_0)$ | $k$ 为刚度，$\mathbf{x}_0$ 为静止位置 |
| **线性阻尼** | $\mathbf{F}_d = -c\mathbf{v}$ | $c$ 为阻尼系数 |
| **二次阻力** | $\mathbf{F}_{\text{drag}} = -\tfrac{1}{2}\rho C_d A \|\mathbf{v}\|\mathbf{v}$ | 流体阻力 |
| **万有引力** | $\mathbf{F} = -\frac{Gm_1m_2}{r^2}\hat{\mathbf{r}}$ | 中心力 |

### 2.4 守恒定律

#### 动量守恒

系统不受外力或合外力为零时，总动量守恒：

$$
\mathbf{P} = \sum_i m_i\mathbf{v}_i = \text{常量}
$$

**推导**：$\dot{\mathbf{P}} = \sum_i m_i\ddot{\mathbf{x}}_i = \sum_i \mathbf{F}_i^{\text{ext}} = 0$（内力成对抵消）。

#### 角动量守恒

定义角动量 $\mathbf{L} = \mathbf{r}\times\mathbf{p} = m\mathbf{r}\times\mathbf{v}$。系统不受外力矩时：

$$
\frac{d\mathbf{L}}{dt} = \boldsymbol{\tau}^{\text{ext}} = 0 \;\Rightarrow\; \mathbf{L} = \text{常量}
$$

#### 机械能守恒

定义动能 $T=\tfrac{1}{2}m\|\mathbf{v}\|^2$、势能 $V(\mathbf{x})$、总机械能 $E=T+V$。当只有保守力做功时：

$$
\frac{dE}{dt} = 0 \;\Rightarrow\; E = \text{常量}
$$

### 2.5 经典示例：简谐振子

质量 $m$ 连接刚度 $k$ 的弹簧，运动方程为：

$$
m\ddot{x} = -kx \;\Rightarrow\; \ddot{x} + \omega^2 x = 0, \quad \omega = \sqrt{\frac{k}{m}}
$$

通解：$x(t) = A\cos(\omega t + \phi)$，其中 $A$ 为振幅，$\phi$ 为初相位，由初始条件确定。

### 2.6 牛顿力学的局限

| 局限 | 说明 | 例子 |
|------|------|------|
| **约束系统处理困难** | 需引入未知约束力，列方程数远超自由度 | 双摆需 4 个耦合方程 + 2 个约束 |
| **坐标选择不灵活** | $\mathbf{F}=m\mathbf{a}$ 在非笛卡尔坐标中形式复杂 | 圆周运动用极坐标更自然，但牛顿方程需改造 |
| **难以推广** | 无法自然推广到相对论（需洛伦兹协变）和量子力学 | 量子力学需要哈密顿形式 |

---

## 三、拉格朗日力学：能量与变分的分析力学

### 3.1 广义坐标

**广义坐标** $q_i$ 是描述系统状态的独立参数，不一定是笛卡尔坐标。系统的**自由度**为：

$$
n = 3N - m
$$

其中 $N$ 为质点数，$m$ 为完整约束方程数。通过选择恰当的广义坐标，约束被自动消除——不再需要显式计算约束力。

**示例——单摆**：

| 坐标系 | 坐标数 | 约束 | 自由度 |
|--------|--------|------|--------|
| 笛卡尔 $(x,y)$ | 2 | $x^2+y^2=l^2$ | 1 |
| 广义坐标 $\theta$ | 1 | 无 | 1 |

$x = l\sin\theta,\; y = -l\cos\theta$ — 一个广义坐标 $\theta$ 完全描述系统，无冗余约束。

**示例——双摆**：

笛卡尔坐标 $(x_1,y_1,x_2,y_2)$ 有 4 个坐标 + 2 个约束；广义坐标 $(\theta_1,\theta_2)$ 只有 2 个，无约束。

### 3.2 拉格朗日量

$$
\boxed{\;L(q, \dot{q}, t) = T(q, \dot{q}) - V(q)\;}
$$

其中 $T$ 为动能，$V$ 为势能。**核心思想：用能量（标量）替代力（矢量）**——拉格朗日量是状态函数，与坐标选择无关（标量在坐标变换下不变）。

**动能的广义坐标形式**：

位置 $\mathbf{r} = \mathbf{r}(q_1, \ldots, q_n, t)$，速度 $\mathbf{v} = \sum_i \frac{\partial\mathbf{r}}{\partial q_i}\dot{q}_i + \frac{\partial\mathbf{r}}{\partial t}$，动能为：

$$
T = \frac{1}{2}m\left\|\sum_i \frac{\partial\mathbf{r}}{\partial q_i}\dot{q}_i\right\|^2
$$

当动能是广义速度的二次齐次函数时（$T = \tfrac{1}{2}\sum_{ij} M_{ij}(q)\dot{q}_i\dot{q}_j$），$M_{ij}(q)$ 是广义质量矩阵。

### 3.3 欧拉-拉格朗日方程 ⭐ 核心

$$
\boxed{\;\frac{d}{dt}\left(\frac{\partial L}{\partial \dot{q}_i}\right) - \frac{\partial L}{\partial q_i} = 0, \quad i = 1, 2, \ldots, n\;}
$$

这是 $n$ 个二阶微分方程——方程数等于自由度，不含约束力。

#### 推导：最小作用量原理

定义**作用量**：

$$
S = \int_{t_1}^{t_2} L(q, \dot{q}, t)\,dt
$$

**哈密顿原理**（最小作用量原理）：真实运动路径使作用量取极值 $\delta S = 0$。

对 $q_i \to q_i + \delta q_i$ 变分（端点固定 $\delta q_i(t_1)=\delta q_i(t_2)=0$）：

$$
\delta S = \int_{t_1}^{t_2}\left(\frac{\partial L}{\partial q_i}\delta q_i + \frac{\partial L}{\partial \dot{q}_i}\delta\dot{q}_i\right)dt
$$

对第二项分部积分，利用端点条件消去边界项：

$$
\int_{t_1}^{t_2}\frac{\partial L}{\partial \dot{q}_i}\delta\dot{q}_i\,dt = -\int_{t_1}^{t_2}\frac{d}{dt}\left(\frac{\partial L}{\partial \dot{q}_i}\right)\delta q_i\,dt
$$

代入得：

$$
\delta S = \int_{t_1}^{t_2}\left[\frac{\partial L}{\partial q_i} - \frac{d}{dt}\left(\frac{\partial L}{\partial \dot{q}_i}\right)\right]\delta q_i\,dt = 0
$$

由于 $\delta q_i$ 任意，方括号必须为零——即欧拉-拉格朗日方程。

### 3.4 经典示例：单摆（拉格朗日方法）

**广义坐标** $q = \theta$。

**动能**：$T = \tfrac{1}{2}m(l\dot\theta)^2 = \tfrac{1}{2}ml^2\dot\theta^2$

**势能**（最低点为零势能面）：$V = mgl(1-\cos\theta)$

**拉格朗日量**：$L = \tfrac{1}{2}ml^2\dot\theta^2 - mgl(1-\cos\theta)$

**欧拉-拉格朗日方程**：

$$
\frac{\partial L}{\partial\theta} = -mgl\sin\theta, \quad \frac{d}{dt}\left(\frac{\partial L}{\partial\dot\theta}\right) = ml^2\ddot\theta
$$

$$
\boxed{\;\ddot\theta + \frac{g}{l}\sin\theta = 0\;}
$$

与牛顿方法结果一致——但过程中**完全不需要计算绳的约束力**（张力），广义坐标 $\theta$ 已将其自动消除。这是拉格朗日力学的核心优势。

### 3.5 广义动量与循环坐标

#### 广义动量

$$
p_i = \frac{\partial L}{\partial \dot{q}_i}
$$

在笛卡尔坐标中 $p_x = m\dot{x}$（线动量），在极坐标角度中 $p_\theta = mr^2\dot\theta$（角动量）——广义动量**统一了线动量和角动量**。

#### 循环坐标与守恒律

若拉格朗日量不显含某坐标 $q_i$（即 $\partial L/\partial q_i = 0$），则 $q_i$ 称为**循环坐标**（或可遗坐标），对应的广义动量守恒：

$$
\frac{d}{dt}\left(\frac{\partial L}{\partial \dot{q}_i}\right) = 0 \;\Rightarrow\; p_i = \text{常量}
$$

**物理意义**：

| 对称性 | 循环坐标 | 守恒量 |
|--------|---------|--------|
| 空间平移不变性 | $x$ | 动量 $p_x$ |
| 旋转不变性 | $\theta$ | 角动量 $p_\theta$ |
| 时间平移不变性 | $t$ | 能量 $H$（诺特定理） |

### 3.6 拉格朗日力学的优势

1. **自动处理约束**——约束通过广义坐标的选择消除，不需显式计算约束力。
2. **坐标选择灵活**——可使用极坐标、球坐标、柱坐标或任意曲线坐标。
3. **守恒律自动显现**——识别循环坐标即得守恒量，无需手动推导。
4. **易于推广**——拉格朗日形式自然推广到场论、广义相对论、量子力学的费曼路径积分。

---

## 四、哈密顿力学：相空间与辛几何

### 4.1 哈密顿量

通过**勒让德变换**从拉格朗日量得到哈密顿量：

$$
\boxed{\;H(q, p, t) = \sum_i p_i\dot{q}_i - L(q, \dot{q}, t), \qquad p_i = \frac{\partial L}{\partial \dot{q}_i}\;}
$$

**物理意义**：在以下条件下，哈密顿量等于系统总能量 $H = T + V$：

1. 约束不显含时间；
2. 势能不依赖于速度；
3. 坐标变换不含时间。

**推导**：当动能是速度的二次齐次函数 $T = \tfrac{1}{2}\sum_{ij}M_{ij}\dot{q}_i\dot{q}_j$ 时，由欧拉齐次函数定理：

$$
\sum_i p_i\dot{q}_i = \sum_i \frac{\partial T}{\partial\dot{q}_i}\dot{q}_i = 2T
$$

因此 $H = 2T - (T-V) = T + V$。

### 4.2 哈密顿正则方程 ⭐ 核心

$$
\boxed{\;\dot{q}_i = \frac{\partial H}{\partial p_i}, \qquad \dot{p}_i = -\frac{\partial H}{\partial q_i}\;}
$$

这是 $2n$ 个**一阶**微分方程（拉格朗日方程是 $n$ 个二阶方程）。方程形式高度对称——位置和动量以几乎相同的结构演化，仅差一个负号。

#### 推导

从哈密顿量定义 $H = \sum_i p_i\dot{q}_i - L$ 取全微分：

$$
dH = \sum_i \dot{q}_i\,dp_i - \sum_i \frac{\partial L}{\partial q_i}\,dq_i - \frac{\partial L}{\partial t}\,dt
$$

利用 $\dot{p}_i = \partial L/\partial q_i$（来自欧拉-拉格朗日方程），与 $H(q,p,t)$ 的全微分 $dH = \sum_i\frac{\partial H}{\partial q_i}dq_i + \sum_i\frac{\partial H}{\partial p_i}dp_i + \frac{\partial H}{\partial t}dt$ 比较系数，即得正则方程。

### 4.3 经典示例：简谐振子

**拉格朗日量**：$L = \tfrac{1}{2}m\dot{x}^2 - \tfrac{1}{2}kx^2$

**广义动量**：$p = \partial L/\partial\dot{x} = m\dot{x}$，解出 $\dot{x} = p/m$

**哈密顿量**：

$$
H = p\dot{x} - L = \frac{p^2}{2m} + \frac{1}{2}kx^2
$$

**正则方程**：

$$
\dot{x} = \frac{\partial H}{\partial p} = \frac{p}{m}, \qquad \dot{p} = -\frac{\partial H}{\partial x} = -kx
$$

消去 $p$ 得 $m\ddot{x}=-kx$，即牛顿第二定律——三条路径殊途同归。

**相空间轨迹**：能量守恒 $H=E$ 给出：

$$
\frac{p^2}{2m} + \frac{1}{2}kx^2 = E
$$

这是相空间 $(x,p)$ 中的**椭圆**——能量等值线即相轨迹。

### 4.4 相空间

**相空间**是由广义坐标 $q$ 和广义动量 $p$ 组成的 $2n$ 维空间：

$$
\text{相空间} = \{(q_1, \ldots, q_n,\; p_1, \ldots, p_n)\}
$$

- **相点**：相空间中一个点 $(q,p)$ 代表系统的一个完整状态。
- **相轨迹**：系统随时间演化在相空间中描出的曲线。
- **相流**：哈密顿方程定义的相空间矢量场 $\frac{d}{dt}\binom{q}{p} = \binom{\partial H/\partial p}{-\partial H/\partial q}$。

相空间的几何性质是哈密顿力学的核心——它揭示了对称性、守恒律和混沌的深层结构。

### 4.5 刘维尔定理

**表述**：相空间体积元在哈密顿流下保持不变。

$$
\frac{d}{dt}(\rho\,dq\,dp) = 0
$$

其中 $\rho(q,p,t)$ 是相空间密度。

**意义**：哈密顿系统是相空间中的不可压缩流——相点像不可压缩流体一样流动，既不会聚拢也不会散开。这是统计力学的基础，也是哈密顿系统长期稳定性的几何根源。

### 4.6 泊松括号

对相空间中两个函数 $f(q,p,t)$ 和 $g(q,p,t)$，定义**泊松括号**：

$$
\{f, g\} = \sum_i \left(\frac{\partial f}{\partial q_i}\frac{\partial g}{\partial p_i} - \frac{\partial f}{\partial p_i}\frac{\partial g}{\partial q_i}\right)
$$

**基本泊松括号**：

$$
\{q_i, q_j\} = 0, \quad \{p_i, p_j\} = 0, \quad \{q_i, p_j\} = \delta_{ij}
$$

**运动方程的泊松括号形式**：任意物理量 $f(q,p,t)$ 的时间演化为：

$$
\frac{df}{dt} = \{f, H\} + \frac{\partial f}{\partial t}
$$

特别地，哈密顿正则方程可写为 $\dot{q}_i = \{q_i, H\}$，$\dot{p}_i = \{p_i, H\}$。

**守恒律判据**：若 $\{f, H\} = 0$ 且 $\partial f/\partial t = 0$，则 $f$ 是守恒量。例如 $\{H, H\}=0$ 即能量守恒。

### 4.7 正则变换与辛结构

**正则变换**是从一组正则变量 $(q,p)$ 到另一组 $(Q,P)$ 的变换，使新变量仍满足哈密顿方程形式。正则变换保持**辛形式**不变：

$$
\omega = \sum_i dp_i \wedge dq_i
$$

辛形式的不变性是哈密顿力学的几何本质——哈密顿力学就是辛流形上的几何。正则变换可通过**生成函数**构造，有四种类型（$F_1(q,Q)$、$F_2(q,P)$、$F_3(p,Q)$、$F_4(p,P)$）。

### 4.8 哈密顿-雅可比理论

寻找正则变换使新哈密顿量 $K=0$，则新变量都是常数——运动方程被"解掉"。生成函数 $S(q,P,t)$（**作用函数**）满足：

$$
\boxed{\;H\left(q, \frac{\partial S}{\partial q}, t\right) + \frac{\partial S}{\partial t} = 0\;}
$$

这是**哈密顿-雅可比方程**——一个一阶偏微分方程。它的解直接给出系统的完全积分。哈密顿-雅可比理论是经典力学与量子力学的桥梁：在 $\hbar\to 0$ 极限下，薛定谔方程退化为哈密顿-雅可比方程。

---

## 五、三大体系的等价性

三种力学在经典范围内完全等价，可以互相推导：

### 5.1 牛顿 → 拉格朗日

从 $\mathbf{F}=m\mathbf{a}$ 出发，对保守力 $\mathbf{F}=-\nabla V$，定义 $L=T-V$，代入欧拉-拉格朗日方程即得牛顿第二定律。

### 5.2 拉格朗日 → 哈密顿

通过勒让德变换 $H=\sum_i p_i\dot{q}_i - L$，$p_i = \partial L/\partial\dot{q}_i$，从二阶欧拉-拉格朗日方程得到一阶哈密顿正则方程。

### 5.3 哈密顿 → 牛顿

从正则方程 $\dot{q}=\partial H/\partial p$，$\dot{p}=-\partial H/\partial q$ 出发，对第二个方程求时间导数并代入第一个方程消去 $p$，得到二阶方程 $\ddot{q}=-\partial V/\partial q$，即牛顿第二定律。

### 5.4 对比总表

| 特征 | 牛顿力学 | 拉格朗日力学 | 哈密顿力学 |
|------|---------|------------|-----------|
| **基本变量** | $\mathbf{x}, \mathbf{v}$ | $q, \dot{q}$ | $q, p$ |
| **基本方程** | $\mathbf{F}=m\mathbf{a}$ | $\frac{d}{dt}\frac{\partial L}{\partial\dot{q}} - \frac{\partial L}{\partial q} = 0$ | $\dot{q}=\frac{\partial H}{\partial p},\; \dot{p}=-\frac{\partial H}{\partial q}$ |
| **方程阶数** | 二阶 | 二阶 | 一阶（维数加倍） |
| **基本量** | 力（矢量） | 拉格朗日量（标量） | 哈密顿量（标量） |
| **空间** | 位形空间 | 位形空间 | 相空间 |
| **维数** | $3N$ | $n$（自由度） | $2n$ |
| **约束处理** | 显式（约束力） | 隐式（广义坐标） | 隐式（广义坐标） |
| **守恒律** | 手动推导 | 循环坐标 | 泊松括号 |
| **对称性** | 不明显 | 诺特定理 | 生成元 |

---

## 六、诺特定理

**诺特定理**：每一种连续对称性对应一个守恒律。

| 对称性 | 守恒量 | 物理意义 |
|--------|--------|---------|
| 时间平移不变性 | 能量守恒 | 物理定律不随时间改变 |
| 空间平移不变性 | 动量守恒 | 空间均匀性 |
| 空间旋转不变性 | 角动量守恒 | 空间各向同性 |

**证明思路**：若拉格朗日量在某连续变换 $q_i \to q_i + \epsilon\xi_i$ 下不变（$\delta L = 0$），则存在守恒量：

$$
Q = \sum_i \frac{\partial L}{\partial \dot{q}_i}\xi_i = \text{常量}
$$

诺特定理在拉格朗日框架中表述最自然——它直接从拉格朗日量的对称性读出守恒律，无需额外计算。这是分析力学超越牛顿力学的标志性成果之一。

---

## 七、工程映射：三大体系与实时物理模拟

三大体系不是纯理论——实时物理模拟中的每种数值方法都对应某个力学体系的计算范式。以下建立映射关系，并指向本站的详细文档。

### 7.1 牛顿力学 → 质点弹簧系统与显式积分

牛顿力学在工程中的直接体现是**质点弹簧系统**（Mass-Spring System）+ **显式数值积分**：

$$
m_i\ddot{\mathbf{x}}_i = \mathbf{F}_i^{\text{ext}} + \sum_j \mathbf{F}_{ij}^{\text{spring}} + \mathbf{F}_i^{\text{damping}}
$$

每个粒子受力求和 → 牛顿第二定律求加速度 → 显式欧拉/半隐式欧拉积分位置。这是最直观的物理模拟方法，但存在两个问题：刚性弹簧需要极小时间步（CFL 条件），且约束系统难以保证。

关于显式欧拉、半隐式欧拉、RK4 等积分方法的数学推导与稳定性分析，详见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。

### 7.2 拉格朗日力学 → 约束求解与变分积分器

拉格朗日力学在工程中有两条主要映射路径：

**路径一：拉格朗日乘子法 → 约束求解器**

PBD/XPBD/VBD 等位置动力学方法的数学根基是拉格朗日乘子法——约束 $C(\mathbf{x})=0$ 通过乘子 $\lambda$ 加入系统，求解 $\lambda$ 后直接修正位置：

$$
\Delta\mathbf{p}_i = \lambda \frac{1}{m_i}\frac{\partial C}{\partial\mathbf{p}_i}
$$

这与拉格朗日力学中"约束力隐含在拉格朗日乘子中"的思想完全一致。关于 PBD/XPBD 如何将拉格朗日乘子法落地为实时约束求解器，详见&#12298;[PBD 与 XPBD 详解](/knowledge/pbd-xpbd-math/)&#12299;。

**路径二：变分原理 → 变分积分器**

哈密顿原理 $\delta S = 0$ 可以直接离散化——不积分离散 ODE，而是离散作用量泛函 $S = \int L\,dt$，对离散作用量取变分。这样得到的**变分积分器**（Variational Integrator）天然保持辛结构和动量守恒。

VBD（Vertex Block Descent）正是将隐式欧拉的变分形式——能量最小化 $\mathbf{x}^{n+1} = \arg\min E(\mathbf{x})$——用块坐标下降实时求解。详见&#12298;[VBD 与 AVBD 详解](/knowledge/vbd-avbd-math/)&#12299;。

### 7.3 哈密顿力学 → 辛积分器

哈密顿力学的辛结构（$\omega = \sum dp_i \wedge dq_i$）在数值离散中有一个重要推论：**辛积分器**（Symplectic Integrator）保持辛形式不变，因此在长时间模拟中能量近似守恒、无人工能量漂移。

**辛欧拉方法**（一阶辛积分器）：

$$
\begin{aligned}
p^{n+1} &= p^n - \Delta t\,\frac{\partial H}{\partial q}(q^n, p^{n+1}) \\
q^{n+1} &= q^n + \Delta t\,\frac{\partial H}{\partial p}(q^n, p^{n+1})
\end{aligned}
$$

等价于半隐式欧拉（先更新速度再用新速度更新位置），但**辛性保证**来自哈密顿力学的辛结构。这是为什么半隐式欧拉在保守系统中比显式欧拉稳定得多的深层原因。

关于辛欧拉、Verlet、RK4 的对比及其与哈密顿辛结构的关系，详见&#12298;[物理模拟数值积分方法详解](/knowledge/numerical-integration-methods/)&#12299;。

### 7.4 工程映射总表

| 力学体系 | 数学结构 | 工程映射 | 数值方法 | 对应文档 |
|---------|---------|---------|---------|---------|
| **牛顿力学** | $\mathbf{F}=m\mathbf{a}$ | 质点弹簧系统、刚体动力学 | 显式/半隐式欧拉 | 数值积分方法详解 |
| **拉格朗日力学** | 欧拉-拉格朗日方程、最小作用量 | 约束求解、变分积分 | PBD/XPBD、VBD | PBD 与 XPBD 详解、VBD 与 AVBD 详解 |
| **哈密顿力学** | 正则方程、辛结构 | 辛积分、长时间稳定模拟 | 辛欧拉、Verlet | 数值积分方法详解 |

---

## 八、参考文献

### 经典教材

1. **Goldstein, H.** — *Classical Mechanics* (3rd Edition). 经典力学权威教材，详尽覆盖三大体系。
2. **Landau, L. D. & Lifshitz, E. M.** — *Mechanics* (Course of Theoretical Physics, Vol. 1). 以拉格朗日形式为起点，简洁深刻。
3. **Arnold, V. I.** — *Mathematical Methods of Classical Mechanics*. 现代辛几何视角的力学。
4. **José, J. V. & Saletan, E. J.** — *Classical Dynamics: A Contemporary Approach*. 现代方法与应用。

### 物理模拟参考

5. **Erleben, K. et al.** — *Physics-Based Animation*. 物理动画的工程教材。
6. **Müller, M. et al.** — *Position Based Dynamics* (SIGGRAPH 2007). PBD 原始论文。
7. **Macklin, M. & Müller, M.** — *XPBD: Position-Based Simulation of Compliant Constrained Dynamics* (MIG 2016). XPBD 原始论文。
8. **Chen, Z. et al.** — *Vertex Block Descent* (arXiv:2403.06321, 2024). VBD 原始论文。
