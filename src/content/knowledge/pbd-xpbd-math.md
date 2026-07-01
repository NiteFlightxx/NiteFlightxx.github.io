---
title: "PBD 与 XPBD 的数学与物理原理详解 — 从位置投影到柔度可控的约束求解"
excerpt: "从基于力的弹簧方法的数值刚性痛点出发，系统推导 Position Based Dynamics (PBD) 如何绕过力、直接投影位置以满足约束，再到 XPBD 引入柔度（compliance）参数实现刚度与时间步长、迭代次数解耦。覆盖约束线性化、拉格朗日乘子推导、距离/体积/碰撞/弯曲/形状匹配约束的梯度与海森、Gauss-Seidel 与 Jacobi 迭代策略、图染色并行化，以及在布料、流体（PBF）、软体中的应用。与本站《数值积分方法》《雅可比矩阵》《VBD 与 AVBD》互为印证。"
date: "2026-07-01"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["物理", "PBD", "XPBD", "约束求解", "柔度", "C++"]
readTime: "阅读约45分钟"
---

> 物理模拟的刚性约束（不可拉伸布料、不可压缩流体、刚性关节）让基于力的弹簧方法陷入"刚度越大、时间步越小"的数值困境。**Position Based Dynamics (PBD)**（Müller et al., 2007）换了一条路：不计算力、不解微分方程，直接修正位置使约束满足——绕过了力层面的数值刚性。**XPBD**（Macklin et al., 2016）在此基础上引入柔度（compliance）参数，让材料刚度不再随时间步长和迭代次数漂移，实现了物理参数的直观可控。
>
> 本文从约束线性化与拉格朗日乘子出发搭建 PBD/XPBD 的完整推导，覆盖五类常用约束的梯度与海森、Gauss-Seidel 与 Jacobi 迭代的收敛特性、图染色并行化机制，以及在布料、流体、软体中的工程组合。阅读前建议回顾本站《物理模拟数值积分方法》的隐式欧拉与 predict-correct 流水线，以及《雅可比矩阵》的约束求解器内核 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$——PBD/XPBD 的局部步正是该内核的标量特例。如需进一步了解 PBD/XPBD 的后继方法 VBD/AVBD，参见本站《VBD 与 AVBD 的数学原理详解》。

---

## 一、为什么需要 PBD：力方法的刚性困境

### 1.1 基于力的弹簧方法

传统物理模拟基于牛顿第二定律 $\mathbf{F}=m\mathbf{a}$，模拟循环为：

1. 计算各粒子受力 $\mathbf{f}_i$（重力、弹簧力、碰撞力等）
2. 加速度 $\mathbf{a}_i = \mathbf{f}_i/m_i$
3. 半隐式欧拉更新：$\mathbf{v}_i^{n+1}=\mathbf{v}_i^n+h\,\mathbf{a}_i$，$\mathbf{x}_i^{n+1}=\mathbf{x}_i^n+h\,\mathbf{v}_i^{n+1}$

对于刚性约束（如固定距离杆），弹簧力为：

$$
\mathbf{f}_{\text{spring}} = -k\bigl(\|\mathbf{x}_1-\mathbf{x}_2\|-L_0\bigr)\,\hat{\mathbf{n}}, \qquad \hat{\mathbf{n}}=\frac{\mathbf{x}_1-\mathbf{x}_2}{\|\mathbf{x}_1-\mathbf{x}_2\|}
$$

当 $k\to\infty$（刚性约束）时，系统特征频率 $\omega\propto\sqrt{k/m}$ 爆炸，显式积分器的稳定性条件 $h < 2/\omega$ 要求 $h\to 0$。这就是**数值刚性**（numerical stiffness）——不是物理问题，而是显式积分器在高频振荡下不稳定的数值病理。

### 1.2 PBD 的核心思路

PBD 绕开力层面，直接在**位置空间**求解：预测位置 → 投影到约束流形 → 由位置差反推速度。由于不显式积分刚性弹簧力，PBD 避免了力层面的数值爆炸，允许大时间步。代价是精度由迭代次数决定、能量不严格守恒——但对于实时游戏物理，稳定性和可控性比物理精确性更重要。

---

## 二、PBD：位置投影法

### 2.1 算法框架

```
对每个时间步 h：
  1. 施加外力（预测速度）
     v_i ← v_i + h·f_ext/m_i

  2. 预测位置（半隐式欧拉预测步）
     p_i ← x_i + h·v_i

  3. 生成约束（距离、碰撞、体积等）

  4. 迭代求解约束（N_iter 次）
     for iter = 1..N_iter:
       for each constraint C:
         计算 Δp，投影到 C(p)=0
         p_i ← p_i + Δp_i

  5. 更新速度与位置
     v_i ← (p_i - x_i) / h
     x_i ← p_i
```

步骤 2 是**预测步**（predict），步骤 4 是**修正步**（correct）——这正是本站《数值积分方法》所述 predict-correct 流水线的约束求解层。

### 2.2 约束线性化与位置修正推导

定义标量约束函数 $C:\mathbb{R}^{3n}\to\mathbb{R}$，要求 $C(\mathbf{p})=0$。

对当前预测位置做一阶泰勒展开：

$$
C(\mathbf{p}+\Delta\mathbf{p}) \approx C(\mathbf{p}) + \nabla C^{\mathsf T}\Delta\mathbf{p} = 0
$$

PBD 寻找**质量加权最小范数**的修正——让修正量尽可能小，且重粒子动得少：

$$
\Delta\mathbf{p} = \lambda\,\mathbf{M}^{-1}\nabla C
$$

其中 $\mathbf{M}=\text{diag}(m_1\mathbf{I}_3, m_2\mathbf{I}_3,\ldots)$ 是质量矩阵。代入线性化约束：

$$
C(\mathbf{p}) + \nabla C^{\mathsf T}\bigl(\lambda\,\mathbf{M}^{-1}\nabla C\bigr) = 0
$$

解得拉格朗日乘子：

$$
\boxed{\quad \lambda = -\frac{C(\mathbf{p})}{\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C} = -\frac{C(\mathbf{p})}{\displaystyle\sum_i \frac{1}{m_i}\left\|\frac{\partial C}{\partial\mathbf{p}_i}\right\|^2} \quad}
$$

**位置修正**：

$$
\Delta\mathbf{p}_i = \lambda\,\frac{1}{m_i}\,\frac{\partial C}{\partial\mathbf{p}_i}
$$

> **与本站《雅可比矩阵》的联系**：分母 $\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C$ 正是约束求解器内核 $\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ 的标量特例（单约束时雅可比 $\mathbf{J}=\nabla C^{\mathsf T}$ 退化为向量）。PBD 的每一步就是在解一个单约束的局部线性系统。

### 2.3 距离约束示例

两粒子保持固定距离 $d$：

$$
C(\mathbf{p}_1,\mathbf{p}_2) = \|\mathbf{p}_1-\mathbf{p}_2\| - d
$$

**梯度**（设 $\hat{\mathbf{n}}=(\mathbf{p}_1-\mathbf{p}_2)/\|\mathbf{p}_1-\mathbf{p}_2\|$）：

$$
\nabla_1 C = \hat{\mathbf{n}}, \qquad \nabla_2 C = -\hat{\mathbf{n}}
$$

**乘子**（$\|\nabla_i C\|=1$，所以分母 $=1/m_1+1/m_2$）：

$$
\lambda = -\frac{\|\mathbf{p}_1-\mathbf{p}_2\|-d}{\frac{1}{m_1}+\frac{1}{m_2}}
$$

**位置修正**：

$$
\Delta\mathbf{p}_1 = -\frac{m_2}{m_1+m_2}\bigl(\|\mathbf{p}_1-\mathbf{p}_2\|-d\bigr)\,\hat{\mathbf{n}}
$$

$$
\Delta\mathbf{p}_2 = +\frac{m_1}{m_1+m_2}\bigl(\|\mathbf{p}_1-\mathbf{p}_2\|-d\bigr)\,\hat{\mathbf{n}}
$$

修正量按 $m_2/(m_1+m_2)$ 与 $m_1/(m_1+m_2)$ 分配——重粒子动得少，轻粒子动得多，总动量守恒。

### 2.4 PBD 的特性

| 特性 | 说明 |
|---|---|
| **稳定性** | 绕过力层面的刚性，大时间步不爆炸。但并非"无条件稳定"——碰撞穿透、过约束等仍可导致数值问题 |
| **精度依赖迭代** | 约束满足程度由迭代次数 $N_{\text{iter}}$ 决定，迭代少则约束"软" |
| **刚度不可控** | 有效刚度 $k_{\text{eff}}\propto N_{\text{iter}}/h^2$，随时间步和迭代次数漂移 |
| **能量不守恒** | 位置投影引入非物理阻尼，能量逐步泄漏（对游戏常是优点：系统自然趋于稳定） |

> **"无条件稳定"的说法需辨析**：PBD 不会像显式弹簧那样因 $k$ 过大而数值爆炸，但它的约束满足是近似的（依赖迭代次数），且过约束（over-constraint，如同时要求不可拉伸+不可压缩）时仍可能震荡或锁定。准确说法是：PBD 避免了力层面的数值刚性，但不是数学意义上的无条件稳定。

---

## 三、XPBD：柔度可控的约束求解

### 3.1 PBD 的核心缺陷

PBD 的有效刚度随时间步和迭代次数变化：

$$
k_{\text{eff}} \propto \frac{N_{\text{iter}}}{h^2}
$$

这意味着：改时间步长 → 材料变软/变硬；改迭代次数 → 材料变软/变硬。无法设置物理真实的材料参数（如橡胶 $E\approx10^6$ Pa、钢 $E\approx2\times10^{11}$ Pa）。

### 3.2 柔度参数

XPBD 引入**柔度**（compliance）$\alpha$，定义为刚度的倒数：

$$
\alpha = \frac{1}{k}
$$

$\alpha=0$ 为完全刚性（退化为 PBD），$\alpha$ 越大约束越软。关键在于：XPBD 把 $\alpha$ 做了**时间步缩放**，使有效刚度独立于 $h$：

$$
\tilde\alpha = \frac{\alpha}{h^2} = \frac{1}{k\,h^2}
$$

### 3.3 变分推导

XPBD 把约束求解表述为隐式欧拉的变分形式——最小化"惯性距离 + 约束能量"：

$$
\min_{\mathbf{p}} \;\frac{1}{2}\|\mathbf{p}-\tilde{\mathbf{p}}\|_{\mathbf{M}}^2 + \frac{1}{2\alpha}\,C(\mathbf{p})^2
$$

其中 $\tilde{\mathbf{p}}=\mathbf{x}+h\mathbf{v}+h^2\mathbf{M}^{-1}\mathbf{f}_{\text{ext}}$ 是无约束预测位置。第一项是惯性项（参见本站《VBD 与 AVBD》的惯性势能），第二项是约束能量。

> **与 VBD 的关系**：这个变分形式与 VBD 的能量函数 $E=E_{\text{inertia}}+W$ 结构相同。区别在于：XPBD 的约束项是纯罚函数 $\frac{1}{2\alpha}C^2$，逐**约束**做标量投影；VBD 逐**顶点**做向量牛顿步，海森含惯性项 $m_i/h^2\cdot\mathbf{I}$。两者同源但局部步形式不同（详见本站《VBD 与 AVBD》§4.1）。

引入拉格朗日乘子 $\lambda$，由 KKT 条件：

$$
\mathbf{M}(\mathbf{p}-\tilde{\mathbf{p}}) + \lambda\nabla C = 0 \quad\Rightarrow\quad \mathbf{p} = \tilde{\mathbf{p}} - \lambda\,\mathbf{M}^{-1}\nabla C
$$

对约束一阶线性化 $C(\mathbf{p})\approx C(\tilde{\mathbf{p}})+\nabla C^{\mathsf T}(\mathbf{p}-\tilde{\mathbf{p}})$ 并代入，XPBD 使用**增量形式**（$\lambda$ 跨迭代累积，$\Delta\lambda$ 为本次增量）：

$$
\boxed{\quad \Delta\lambda = -\frac{C(\mathbf{p})+\tilde\alpha\,\lambda}{\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C + \tilde\alpha} \quad}
$$

**位置修正**与 PBD 形式相同，但乘子带累积：

$$
\Delta\mathbf{p}_i = \Delta\lambda\,\frac{1}{m_i}\,\frac{\partial C}{\partial\mathbf{p}_i}, \qquad \lambda \leftarrow \lambda + \Delta\lambda
$$

> **分子 $-C-\tilde\alpha\lambda$ 的含义**：$-C$ 是当前约束违反产生的"回拉力"；$-\tilde\alpha\lambda$ 是已累积约束力的"回扣"——已施加的约束力越大，本次增量越小。这两项的平衡使 $\lambda$ 收敛到精确乘子，而非像 PBD 那样每轮从零投影。
>
> **分母 $\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C+\tilde\alpha$ 的含义**：前半是约束的"有效柔度"（$\mathbf{J}\mathbf{M}^{-1}\mathbf{J}^{\mathsf T}$ 标量特例），后半是材料本身的柔度。刚性约束 $\alpha\to 0$ 时 $\tilde\alpha\to 0$，分母退化为纯 PBD 形式。

### 3.4 完整算法

```
初始化：对每个约束，λ = 0

对每个时间步 h：
  1. 预测位置
     v_i ← v_i + h·f_ext/m_i
     p_i ← x_i + h·v_i

  2. 迭代求解约束
     for iter = 1..N_iter:
       for each constraint C:
         C_val = C(p)
         ∇C = gradient(C, p)
         w = Σ_i (1/m_i)·||∂C/∂p_i||²          // 有效逆质量
         α̃ = α / h²                              // 时间步缩放柔度
         Δλ = -(C_val + α̃·λ) / (w + α̃)
         p_i += Δλ·(1/m_i)·∂C/∂p_i             // 对每个涉及的粒子
         λ += Δλ

  3. 更新速度与位置
     v_i ← (p_i - x_i) / h
     x_i ← p_i
```

### 3.5 距离约束的 XPBD 形式

$$
\Delta\lambda = -\frac{\|\mathbf{p}_1-\mathbf{p}_2\|-d+\tilde\alpha\,\lambda}{\frac{1}{m_1}+\frac{1}{m_2}+\tilde\alpha}
$$

$$
\Delta\mathbf{p}_1 = \Delta\lambda\,\frac{1}{m_1}\,\hat{\mathbf{n}}, \qquad \Delta\mathbf{p}_2 = -\Delta\lambda\,\frac{1}{m_2}\,\hat{\mathbf{n}}
$$

当 $\alpha=0$（$\tilde\alpha=0$）时，$\Delta\lambda=-C/(1/m_1+1/m_2)$，完全退化为 PBD。

### 3.6 柔度参数设置

**刚性约束**（不可拉伸布料、固定距离杆）：

$$
\alpha = 0 \quad\Rightarrow\quad \tilde\alpha = 0 \quad\text{(退化为 PBD)}
$$

**柔性约束**（弹簧，刚度 $k$）：

$$
\alpha = \frac{1}{k}
$$

| 材料 | 刚度 $k$ | 柔度 $\alpha$ |
|---|---|---|
| 软弹簧 | $10^2$ | $10^{-2}$ |
| 刚弹簧 | $10^5$ | $10^{-5}$ |

**从杨氏模量转换**（布料/弹性体）：

$$
k = E\cdot\frac{A}{L} \quad\Rightarrow\quad \alpha = \frac{L}{E\cdot A}
$$

其中 $E$ 为杨氏模量，$A$ 为横截面积，$L$ 为初始长度。这样可以直接用物理材料参数（橡胶 $E\approx10^6$ Pa，钢 $E\approx2\times10^{11}$ Pa）设置 $\alpha$，且改变 $h$ 或 $N_{\text{iter}}$ 不会改变材料行为。

---

## 四、常用约束的梯度与海森

PBD/XPBD 的局部步需要每个约束提供约束值 $C(\mathbf{p})$ 和梯度 $\nabla C$。下面逐个推导五类常用约束。

### 4.1 距离约束

$$
C = \|\mathbf{p}_1-\mathbf{p}_2\| - d
$$

$$
\nabla_1 C = \hat{\mathbf{n}} = \frac{\mathbf{p}_1-\mathbf{p}_2}{\|\mathbf{p}_1-\mathbf{p}_2\|}, \qquad \nabla_2 C = -\hat{\mathbf{n}}
$$

用途：弹簧、布料结构边、刚体连接。XPBD 更新：

$$
\Delta\lambda = -\frac{C+\tilde\alpha\,\lambda}{\frac{1}{m_1}+\frac{1}{m_2}+\tilde\alpha}
$$

### 4.2 体积守恒约束

四面体（顶点 $\mathbf{p}_1,\mathbf{p}_2,\mathbf{p}_3,\mathbf{p}_4$）的体积：

$$
V = \frac{1}{6}\bigl|(\mathbf{p}_2-\mathbf{p}_1)\cdot\bigl[(\mathbf{p}_3-\mathbf{p}_1)\times(\mathbf{p}_4-\mathbf{p}_1)\bigr]\bigr|
$$

$$
C = V - V_0
$$

**梯度**（由三重积求导，注意叉积顺序与符号）：

$$
\nabla_1 C = \frac{1}{6}(\mathbf{p}_4-\mathbf{p}_2)\times(\mathbf{p}_3-\mathbf{p}_2)
$$

其余顶点由循环置换得到。用途：软体不可压缩、充气体（气球）。

### 4.3 碰撞约束

**粒子-平面碰撞**（$\mathbf{q}$ 为平面上一点，$\hat{\mathbf{n}}$ 为法向量）：

$$
C = (\mathbf{p}-\mathbf{q})\cdot\hat{\mathbf{n}}, \qquad \nabla C = \hat{\mathbf{n}}
$$

位置修正：

$$
\Delta\mathbf{p} = -\frac{C}{\frac{1}{m}+\tilde\alpha}\,\hat{\mathbf{n}}
$$

碰撞约束通常是单边的（$C<0$ 时才投影），且 $\alpha=0$（刚性碰撞）。

### 4.4 弯曲约束

**二面角约束**（共享边的两个三角形，法向量 $\hat{\mathbf{n}}_1,\hat{\mathbf{n}}_2$）：

$$
C = \arccos\left(\frac{\hat{\mathbf{n}}_1\cdot\hat{\mathbf{n}}_2}{\|\hat{\mathbf{n}}_1\|\|\hat{\mathbf{n}}_2\|}\right) - \theta_0
$$

梯度需对三角形法向量求导，涉及链式法则，推导较繁琐。

**工程简化**（常用）：连接"隔一个"的顶点 $\mathbf{p}_1$ 与 $\mathbf{p}_3$，用一根更软的距离约束替代：

$$
C_{\text{bend}} \approx \|\mathbf{p}_1-\mathbf{p}_3\| - d_{13}^{\text{rest}}
$$

刚度取结构约束的 1/10。这样弯曲约束复用距离约束的梯度公式，仅 $\alpha$ 取较大值。布料网格中的"隔点连接"即此实现。

### 4.5 形状匹配约束

用于刚体近似和塑性变形。找到最优旋转 $\mathbf{R}$ 使下式最小：

$$
C = \sum_i m_i\|\mathbf{p}_i - (\mathbf{R}\mathbf{q}_i+\mathbf{t})\|^2
$$

其中 $\mathbf{q}_i$ 为初始相对位置。求解步骤：计算质心 → 计算协方差矩阵 $\mathbf{A}=\sum_i m_i\,\mathbf{q}_i'\,(\mathbf{p}_i')^{\mathsf T}$ → SVD 分解 $\mathbf{A}=\mathbf{U}\boldsymbol\Sigma\mathbf{V}^{\mathsf T}$ → $\mathbf{R}=\mathbf{V}\mathbf{U}^{\mathsf T}$ → 位置修正 $\Delta\mathbf{p}_i=\mathbf{R}\mathbf{q}_i+\mathbf{t}-\mathbf{p}_i$。

形状匹配不是标准的拉格朗日乘子约束，而是基于优化的位置修正，但它在 PBD 框架内使用。

---

## 五、迭代策略：Gauss-Seidel 与 Jacobi

### 5.1 两种迭代方式

PBD/XPBD 的约束求解是一个迭代过程，有两种经典策略：

| 策略 | 更新方式 | 收敛 | 并行性 |
|---|---|---|---|
| **Gauss-Seidel** | 逐约束更新，用最新值 | 快（类似 SOR） | 难——有数据依赖 |
| **Jacobi** | 收集所有约束的修正，批量应用 | 慢（通常需阻尼） | 易——约束间无依赖 |

**Gauss-Seidel**：处理约束 $j$ 时，立即写入 $\mathbf{p}_i$，后续约束 $j+1$ 读到的是更新后的值。这导致约束间有顺序依赖——不能直接并行。

**Jacobi**：先计算所有约束的 $\Delta\mathbf{p}_i$（基于当前位置），最后统一累加。约束间无数据依赖，可完全并行。但收敛慢，且不加阻尼时可能震荡。

### 5.2 实际选择

PBD 原始论文（Müller 2007）使用 Gauss-Seidel——收敛快但串行。GPU 实现常用 Jacobi 或带阻尼的 Jacobi 变体。NVIDIA FleX 在 GPU 上使用约束图染色（见下节）实现并行 Gauss-Seidel，兼顾收敛与并行。

> **与 VBD 的对比**：VBD 逐顶点做牛顿步，天然是 Gauss-Seidel 风格（用最新顶点位置），但通过顶点图染色实现并行。PBD/XPBD 逐约束投影，可通过约束图染色实现并行 Gauss-Seidel。两者的并行机制（图染色）相同，区别在于染色对象的稠密程度——详见本站《VBD 与 AVBD》§7。

---

## 六、并行化：图染色（Graph Coloring）

### 6.1 数据竞争问题

直接对约束列表做 `ParallelFor` 会导致**数据竞争**——两个线程同时修改同一粒子的位置。例如约束 A 涉及粒子 1、2，约束 B 涉及粒子 2、3，若并行执行，粒子 2 的位置会被两个线程同时写入。

### 6.2 约束图染色

PBD/XPBD 的并行化通过**约束图染色**（constraint graph coloring）实现：

1. **建图**：以约束为节点，若两约束共享至少一个粒子则连边。
2. **染色**：对图染色，使相邻约束不同色。
3. **批次执行**：同色约束互不共享粒子，可安全并行；不同色批次间串行（Barrier）。

```cpp
// 贪心染色（预处理，一次性）
for (Constraint& C : Constraints) {
    int Color = 0;
    while (HasNeighborWithColor(C, Color))
        ++Color;
    C.BatchColor = Color;
}

// 运行时按色批次并行
for (int Color = 0; Color < MaxColor; ++Color) {
    ParallelFor(ColorConstraints[Color], [&](int Idx) {
        SolveConstraint(Constraints[Idx]);  // 同色互不冲突
    });
    // Barrier：等本批全部完成才进下一色
}
```

### 6.3 色数与并行度

约束图越稠密（约束共享粒子越多），所需色数越多，同步屏障越多，有效并行度越低。布料网格通常需 7–9 种颜色；密集软体可能更多。

> **PBD/XPBD 并非不能并行**——这是常见的误解。PBD/XPBD 同样采用图染色将约束分组并行投影（Fratarcangeli & Pellacini, *Computer Graphics Forum* 2015；NVIDIA FleX 即 GPU 上的 PBD/XPBD 求解器）。与 VBD 的区别在于染色对象：PBD/XPBD 染**约束依赖图**（dual graph），VBD 染**顶点图**（primal graph），后者色数往往少一个量级。这是并行度高低之别，而非能否并行之分。

---

## 七、C++ 实现框架

### 7.1 数据结构

```cpp
struct Particle {
    FVector  Position;
    FVector  Velocity;
    FVector  OldPosition;   // 用于速度更新
    float    InvMass;       // 1/m，无穷大质量用 InvMass=0
};

struct DistanceConstraint {
    int32    Particle1;
    int32    Particle2;
    float    RestLength;
    float    Compliance;    // α = 1/k，刚性约束 α=0
    float    Lambda;        // 累积拉格朗日乘子（XPBD 用，PBD 不需要）

    void Solve(TArray<Particle>& P, float Dt)
    {
        FVector& P1 = P[Particle1].Position;
        FVector& P2 = P[Particle2].Position;
        float  W1 = P[Particle1].InvMass;
        float  W2 = P[Particle2].InvMass;
        if (W1 + W2 == 0.f) return;              // 两端均固定

        FVector Delta = P1 - P2;
        float  Dist   = Delta.Size();
        if (Dist < 1e-7f) return;                 // 避免除零
        FVector Grad   = Delta / Dist;            // n̂

        float  C      = Dist - RestLength;
        float  AlphaTilde = Compliance / (Dt * Dt); // α̃ = α/h²

        // XPBD：Δλ = -(C + α̃·λ) / (w1 + w2 + α̃)
        float  Denom  = W1 + W2 + AlphaTilde;
        float  DLambda = -(C + AlphaTilde * Lambda) / Denom;

        // 位置修正
        P1 += DLambda * W1 * Grad;
        P2 -= DLambda * W2 * Grad;

        // 累积乘子
        Lambda += DLambda;
    }
};
```

### 7.2 求解器

```cpp
class XPBDSolver {
public:
    void Solve(float Dt, int32 Iterations)
    {
        // 1. 预测位置
        for (auto& P : Particles) {
            P.OldPosition = P.Position;
            P.Velocity += Dt * Gravity * P.InvMass;
            P.Position += Dt * P.Velocity;
        }

        // 2. 清零乘子
        for (auto& C : Constraints)
            C.Lambda = 0.f;

        // 3. 迭代求解（图染色批次并行）
        for (int32 Iter = 0; Iter < Iterations; ++Iter) {
            for (int32 Color = 0; Color < NumColors; ++Color) {
                ParallelFor(ColorConstraints[Color], [&](int32 Idx) {
                    Constraints[Idx].Solve(Particles, Dt);
                });
            }
        }

        // 4. 更新速度
        for (auto& P : Particles) {
            P.Velocity = (P.Position - P.OldPosition) / Dt;
        }
    }

private:
    TArray<Particle>           Particles;
    TArray<DistanceConstraint>  Constraints;
    TArray<TArray<int32>>      ColorConstraints;  // 按颜色分组的约束索引
    int32                      NumColors;
    FVector                    Gravity{0, 0, -980.f};
};
```

### 7.3 数值稳定性技巧

**避免除零**：梯度归一化时加 $\epsilon$：

$$
\hat{\mathbf{n}} = \frac{\mathbf{p}_1-\mathbf{p}_2}{\|\mathbf{p}_1-\mathbf{p}_2\|+\epsilon}, \quad \epsilon\sim10^{-7}
$$

**人工阻尼**：抑制高频振荡（PBD 天然有阻尼，XPBD 可显式控制）：

$$
\mathbf{v}_i \leftarrow \mathbf{v}_i\cdot(1-d), \quad d\in[0,1]
$$

**子步进**（substepping）：将大时间步切为多个子步，每个子步内完整迭代：

$$
h_{\text{sub}} = \frac{\Delta t}{N_{\text{sub}}}
$$

子步越多约束收敛越好（每步初始违反量更小），但性能下降。典型 2–8 步。

---

## 八、应用实例

### 8.1 布料模拟

布料由三类约束组合：

| 约束类型 | 作用 | 柔度设置 |
|---|---|---|
| **拉伸约束** | 结构边距离约束，抗拉伸 | $\alpha_{\text{stretch}}$ 小（较刚） |
| **剪切约束** | 对角线距离约束，抗剪切变形 | $\alpha_{\text{shear}}$ 中等 |
| **弯曲约束** | 隔点距离约束，抗弯折 | $\alpha_{\text{bend}}$ 大（较软） |

```cpp
float YoungsModulus = 1e6f;     // Pa
float Thickness    = 0.001f;   // m
float EdgeLength   = 0.01f;    // m

float AlphaStretch = EdgeLength / (YoungsModulus * Thickness);
float AlphaBend    = AlphaStretch * 100.f;  // 弯曲比拉伸软
```

### 8.2 Position Based Fluids (PBF)

PBF（Macklin & Müller, 2013）将 PBD 应用于流体。核心约束为**密度约束**——每个粒子邻域的密度应等于参考密度：

$$
C_i = \frac{\rho_i}{\rho_0} - 1 = 0
$$

其中 $\rho_i=\sum_j m_j\,W(\mathbf{p}_i-\mathbf{p}_j,h)$ 是 SPH 核函数计算的密度。梯度涉及核函数 $\nabla W$ 对各邻居粒子的偏导。PBF 是 PBD 在流体领域的直接应用。

### 8.3 软体模拟

软体由约束组合：

- **距离约束**：四面体各边，维持形状
- **体积约束**：四面体体积，不可压缩
- **形状匹配**：整体形状回归，提供恢复力

---

## 九、PBD 与 XPBD 对比

| 特性 | PBD | XPBD |
|---|---|---|
| **刚度与时间步无关** | ❌ $k_{\text{eff}}\propto N/h^2$ | ✅ $\tilde\alpha=\alpha/h^2$ 补偿 |
| **刚度与迭代次数无关** | ❌ 迭代越多越刚 | ✅ 乘子累积保证收敛 |
| **物理参数直观** | ❌ 需调迭代次数凑刚度 | ✅ 直接用杨氏模量 |
| **收敛机制** | 每轮从零投影 | 乘子累积，收敛到精确解 |
| **额外存储** | 无 | 每约束多存 $\lambda$（一个 float） |
| **实现复杂度** | ✅ 简单 | ⚠️ 略复杂（多 $\tilde\alpha$ 和 $\lambda$） |
| **并行化** | ⚠️ 约束图染色 | ⚠️ 约束图染色（同 PBD） |
| **适用场景** | 实时游戏快速近似 | 需要可控材料属性的高质量模拟 |

**选型建议**：
- 实时游戏、快速近似 → **PBD**（简单高效）
- 需要物理真实材料参数、电影/VFX → **XPBD**
- 硬约束多、高质量布料/软体 → 考虑 **VBD/AVBD**（见本站《VBD 与 AVBD》）

---

## 十、总结

> **PBD 的核心**：绕过力层面，直接在位置空间投影约束。一阶线性化 $C+\nabla C^{\mathsf T}\Delta\mathbf{p}=0$ 配合质量加权最小范数修正 $\Delta\mathbf{p}=\lambda\mathbf{M}^{-1}\nabla C$，给出标量乘子 $\lambda=-C/(\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C)$。避开了显式积分刚性弹簧力的数值爆炸，但有效刚度依赖迭代次数和时间步长。

> **XPBD 的核心**：引入柔度 $\alpha=1/k$ 并做时间步缩放 $\tilde\alpha=\alpha/h^2$，使材料刚度独立于 $h$ 和 $N_{\text{iter}}$。增量乘子 $\Delta\lambda=-(C+\tilde\alpha\lambda)/(\nabla C^{\mathsf T}\mathbf{M}^{-1}\nabla C+\tilde\alpha)$ 跨迭代累积，收敛到精确拉格朗日乘子。$\alpha=0$ 时退化为 PBD。

> **与 VBD/AVBD 的关系**：PBD/XPBD 逐**约束**做标量投影，分母用逆质量 $w_1+w_2+\tilde\alpha$；VBD 逐**顶点**做 $3\times3$ 向量牛顿步，海森含惯性刚度 $m_i/h^2\cdot\mathbf{I}$。两者同源（都是变分隐式欧拉的局部求解），但局部步形式不同。三者都用图染色并行，区别在于染色对象（约束图 vs 顶点图）的稠密程度。详见本站《VBD 与 AVBD 的数学原理详解》。
