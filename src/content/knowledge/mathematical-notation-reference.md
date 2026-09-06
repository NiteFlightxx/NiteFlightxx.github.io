---
title: "高等数学符号速查详解 — 集合、逻辑、微积分、线代与 LaTeX 书写"
excerpt: "按领域归类的数学符号速查表：基本运算、集合论、逻辑、微积分（极限/导数/积分/级数）、线性代数（向量/矩阵/范数/分解）、概率统计、数论、特殊函数、希腊字母，并附常用数学常数与 LaTeX 公式书写规范。可作为本站所有数学/物理文章的符号对照参考。"
date: "2026-09-06"
category: "Mathematics"
subtopic: "Calculus"
tags: ["数学", "符号", "LaTeX", "速查", "参考"]
readTime: "阅读约15分钟"
---

> 数学符号是技术写作的"字母表"。本文按领域归类高等数学中最常用的符号及其 LaTeX 代码，统一使用 `$...$` 与 `$$...$$` 语法（本站 KaTeX 渲染管线同样依赖这两种分隔符）。阅读本站&#12298;[微积分详解](/knowledge/calculus-foundations/)&#12299;、&#12298;[UE 物理动画线性代数详解](/knowledge/ue-linear-algebra-guide/)&#12299;、&#12298;[常微分方程与数值方法详解](/knowledge/differential-equations/)&#12299; 等文章时遇到不熟悉的记号，可随时回到本篇对照。

---

## 一、基本运算符号

### 1.1 加减乘除

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $+$ | 加 | 加法 | $a + b$ |
| $-$ | 减 | 减法 | $a - b$ |
| $\times$ | 乘 | 乘法 | $a \times b$ |
| $\cdot$ | 点乘 | 乘法 | $a \cdot b$ |
| $\div$ | 除 | 除法 | $a \div b$ |
| $/$ | 除 | 除法 | $a / b$ |
| $\pm$ | 正负 | 加或减 | $x = \pm 5$ |
| $\mp$ | 负正 | 减或加 | 与 $\pm$ 相反 |

### 1.2 幂运算与对数

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $a^n$ | a 的 n 次方 | 幂运算 | $2^3 = 8$ |
| $\sqrt{x}$ | 根号 | 平方根 | $\sqrt{9} = 3$ |
| $\sqrt[3]{x}$ | 立方根 | 三次方根 | $\sqrt[3]{8} = 2$ |
| $\sqrt[n]{x}$ | n 次根 | n 次方根 | $\sqrt[4]{16} = 2$ |
| $\log$ | 对数 | 对数函数 | $\log_{10}100 = 2$ |
| $\ln$ | 自然对数 | 以 e 为底的对数 | $\ln(e) = 1$ |
| $\exp$ | 指数 | e 的幂 | $\exp(x) = e^x$ |
| $e^x$ | e 的 x 次方 | 指数函数 | $e^0 = 1$ |

### 1.3 比较符号

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $=$ | 等于 | 相等 | $2 + 2 = 4$ |
| $\neq$ | 不等于 | 不相等 | $3 \neq 4$ |
| $<$ | 小于 | 严格小于 | $2 < 3$ |
| $>$ | 大于 | 严格大于 | $5 > 3$ |
| $\leq$ | 小于等于 | 不大于 | $x \leq 5$ |
| $\geq$ | 大于等于 | 不小于 | $x \geq 0$ |
| $\approx$ | 约等于 | 近似相等 | $\pi \approx 3.14$ |
| $\equiv$ | 恒等于 | 恒等 | $\sin^2 x + \cos^2 x \equiv 1$ |
| $\propto$ | 正比于 | 成正比 | $F \propto ma$ |
| $\ll$ | 远小于 | 数量级小得多 | $\epsilon \ll 1$ |
| $\gg$ | 远大于 | 数量级大得多 | $N \gg 1$ |

---

## 二、集合论符号

### 2.1 基本集合

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\mathbb{N}$ | 自然数集 | $\{0, 1, 2, 3, \ldots\}$ | $n \in \mathbb{N}$ |
| $\mathbb{Z}$ | 整数集 | $\{\ldots, -2, -1, 0, 1, 2, \ldots\}$ | $x \in \mathbb{Z}$ |
| $\mathbb{Q}$ | 有理数集 | 所有分数 | $\frac{p}{q} \in \mathbb{Q}$ |
| $\mathbb{R}$ | 实数集 | 所有实数 | $x \in \mathbb{R}$ |
| $\mathbb{C}$ | 复数集 | 所有复数 | $z \in \mathbb{C}$ |
| $\emptyset$ | 空集 | 不含任何元素的集合 | $A \cap B = \emptyset$ |

### 2.2 集合运算

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\in$ | 属于 | 元素属于集合 | $x \in A$ |
| $\notin$ | 不属于 | 元素不属于集合 | $y \notin B$ |
| $\subset$ | 真包含于 | A 是 B 的真子集 | $A \subset B$ |
| $\subseteq$ | 包含于 | A 是 B 的子集 | $A \subseteq B$ |
| $\supset$ | 真包含 | A 真包含 B | $A \supset B$ |
| $\supseteq$ | 包含 | A 包含 B | $A \supseteq B$ |
| $\cup$ | 并集 | 属于 A 或 B | $A \cup B$ |
| $\cap$ | 交集 | 同时属于 A 和 B | $A \cap B$ |
| $\setminus$ | 差集 | 属于 A 但不属于 B | $A \setminus B$ |
| $A^c$ | 补集 | 不属于 A 的所有元素 | $A^c = U \setminus A$ |
| $\times$ | 笛卡尔积 | 有序对的集合 | $A \times B$ |
| $\mid$ | 满足条件 | 集合构建符号 | $\{x \mid x > 0\}$ |

### 2.3 集合量词

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\lvert A\rvert$ | 基数 | 集合 A 的元素个数 | $\lvert\{1,2,3\}\rvert = 3$ |
| $2^A$ | 幂集 | A 的所有子集的集合 | $\mathcal{P}(A)$ |

---

## 三、逻辑符号

### 3.1 命题逻辑

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\land$ | 且/合取 | 逻辑与 | $P \land Q$ |
| $\lor$ | 或/析取 | 逻辑或 | $P \lor Q$ |
| $\neg$ | 非/否定 | 逻辑非 | $\neg P$ |
| $\Rightarrow$ | 蕴含 | 如果……则…… | $P \Rightarrow Q$ |
| $\Leftrightarrow$ | 等价 | 当且仅当 | $P \Leftrightarrow Q$ |
| $\oplus$ | 异或 | 恰有一个为真 | $P \oplus Q$ |
| $\top$ | 真 | 恒真 | $P \lor \neg P = \top$ |
| $\bot$ | 假 | 恒假 | $P \land \neg P = \bot$ |

### 3.2 谓词逻辑

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\forall$ | 全称量词 | 对所有…… | $\forall x \in \mathbb{R},\; x^2 \geq 0$ |
| $\exists$ | 存在量词 | 存在…… | $\exists x \in \mathbb{N},\; x > 100$ |
| $\exists!$ | 唯一存在 | 存在唯一…… | $\exists!\, x,\; x^2 = 4 \land x > 0$ |
| $\nexists$ | 不存在 | 不存在…… | $\nexists\, x \in \mathbb{R},\; x^2 = -1$ |

---

## 四、微积分符号

### 4.1 极限

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\lim$ | 极限 | 函数的极限值 | $\lim_{x \to 0} \frac{\sin x}{x} = 1$ |
| $\to$ | 趋于 | 变量趋向某值 | $x \to \infty$ |
| $\infty$ | 无穷大 | 无限大 | $\lim_{x \to \infty} \frac{1}{x} = 0$ |
| $\delta$ | 德尔塔 | 微小增量 | $\epsilon$-$\delta$ 定义 |
| $\epsilon$ | 艾普西隆 | 任意小正数 | $\lvert f(x) - L\rvert < \epsilon$ |

### 4.2 导数

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\frac{dy}{dx}$ | dy 比 dx | 一阶导数 | $\frac{dy}{dx} = f'(x)$ |
| $f'(x)$ | f 撇 | 导数符号 | $(x^2)' = 2x$ |
| $f''(x)$ | f 双撇 | 二阶导数 | $(\sin x)'' = -\sin x$ |
| $\frac{\partial}{\partial x}$ | 偏导 | 偏导数 | $\frac{\partial f}{\partial x}$ |
| $\nabla$ | 梯度/哈密顿算子 | 梯度向量 | $\nabla f = \left(\frac{\partial f}{\partial x},\frac{\partial f}{\partial y},\frac{\partial f}{\partial z}\right)$ |
| $\Delta$ | 增量/拉普拉斯算子 | 增量或拉普拉斯 | $\Delta f,\; \Delta x$ |
| $\frac{d^2y}{dx^2}$ | 二阶导 | 二阶导数 | $\frac{d^2y}{dx^2}$ |
| $df$ | 微分 | 函数的微分 | $df = f'(x)\,dx$ |
| $\dot{x}$ | x 点 | 对时间求导 | $\dot{x} = \frac{dx}{dt}$ |
| $\ddot{x}$ | x 双点 | 二阶时间导数 | $\ddot{x} = \frac{d^2x}{dt^2}$ |

### 4.3 积分

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\int$ | 积分号 | 不定积分 | $\int f(x)\,dx$ |
| $\int_a^b$ | 定积分 | 从 a 到 b 的积分 | $\int_0^1 x^2\,dx = \frac{1}{3}$ |
| $\iint$ | 二重积分 | 二维积分 | $\iint f(x,y)\,dx\,dy$ |
| $\iiint$ | 三重积分 | 三维积分 | $\iiint f(x,y,z)\,dx\,dy\,dz$ |
| $\oint$ | 环路积分 | 闭合曲线积分 | $\oint \mathbf{F} \cdot d\mathbf{r}$ |
| $\oiint$ | 曲面积分 | 闭合曲面积分 | $\oiint \mathbf{F} \cdot d\mathbf{S}$ |
| $dx$ | 微分元素 | 积分变量 | $dx,\; dy,\; dz$ |
| $C$ | 积分常数 | 不定积分常数 | $\int f(x)\,dx = F(x) + C$ |

### 4.4 级数

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\sum$ | 求和 | 求和符号 | $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$ |
| $\prod$ | 求积 | 连乘符号 | $\prod_{i=1}^{n} i = n!$ |
| $n!$ | 阶乘 | n 的阶乘 | $5! = 120$ |

---

## 五、线性代数符号

### 5.1 向量

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\mathbf{v}$ | 向量 v | 向量 | $\mathbf{v} = (x, y, z)$ |
| $\lVert\mathbf{v}\rVert$ | 向量的模 | 向量长度 | $\lVert\mathbf{v}\rVert = \sqrt{x^2+y^2+z^2}$ |
| $\mathbf{v} \cdot \mathbf{w}$ | 点积 | 内积 | $\mathbf{v} \cdot \mathbf{w} = v_x w_x + v_y w_y + v_z w_z$ |
| $\mathbf{v} \times \mathbf{w}$ | 叉积 | 向量积 | $\mathbf{i} \times \mathbf{j} = \mathbf{k}$ |
| $\langle \mathbf{v}, \mathbf{w} \rangle$ | 内积 | 内积符号 | $\langle \mathbf{v}, \mathbf{w} \rangle$ |
| $\mathbf{0}$ | 零向量 | 所有分量为 0 | $\mathbf{0} = (0, 0, 0)$ |
| $\mathbf{i}, \mathbf{j}, \mathbf{k}$ | 单位向量 | 标准基向量 | $\mathbf{i} = (1,0,0)$ |

### 5.2 矩阵

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $A$ | 矩阵 A | 矩阵 | $A = [a_{ij}]$ |
| $A^T$ | A 转置 | 转置矩阵 | $(A^T)_{ij} = A_{ji}$ |
| $A^{-1}$ | A 逆 | 逆矩阵 | $AA^{-1} = I$ |
| $\det(A)$ | 行列式 | 矩阵的行列式 | $\det(A)$ |
| $\text{tr}(A)$ | 迹 | 对角元素之和 | $\text{tr}(A) = \sum a_{ii}$ |
| $I$ | 单位矩阵 | 对角线为 1 | $AI = A$ |
| $O$ | 零矩阵 | 所有元素为 0 | $A + O = A$ |
| $\text{rank}(A)$ | 秩 | 矩阵的秩 | $\text{rank}(A) \leq \min(m,n)$ |
| $\lambda$ | 特征值 | 特征值 | $A\mathbf{v} = \lambda\mathbf{v}$ |
| $\otimes$ | 克罗内克积 | 张量积 | $A \otimes B$ |

### 5.3 范数

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\lVert x\rVert_1$ | L1 范数 | 曼哈顿距离 | $\lVert x\rVert_1 = \sum \lvert x_i\rvert$ |
| $\lVert x\rVert_2$ | L2 范数 | 欧氏距离 | $\lVert x\rVert_2 = \sqrt{\sum x_i^2}$ |
| $\lVert x\rVert_\infty$ | 无穷范数 | 最大绝对值 | $\lVert x\rVert_\infty = \max \lvert x_i\rvert$ |
| $\lVert x\rVert_p$ | p 范数 | p-范数 | $\lVert x\rVert_p = \left(\sum \lvert x_i\rvert^p\right)^{1/p}$ |

### 5.4 矩阵分解

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $A = LU$ | LU 分解 | 下三角 × 上三角 | $Ax = b \Rightarrow LUx = b$ |
| $A = QR$ | QR 分解 | 正交 × 上三角 | 最小二乘 |
| $A = U\Sigma V^T$ | SVD 分解 | 奇异值分解 | 降维、压缩 |

---

## 六、概率统计符号

### 6.1 概率

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $P(A)$ | 概率 | 事件 A 的概率 | $0 \leq P(A) \leq 1$ |
| $P(A \mid B)$ | 条件概率 | B 发生时 A 的概率 | $P(A \mid B) = \frac{P(A\cap B)}{P(B)}$ |
| $P(A \cap B)$ | 交集概率 | A 和 B 同时发生 | $P(A \cap B)$ |
| $P(A \cup B)$ | 并集概率 | A 或 B 发生 | $P(A \cup B)$ |
| $\Omega$ | 样本空间 | 所有可能结果 | $P(\Omega) = 1$ |
| $\sim$ | 服从分布 | 随机变量的分布 | $X \sim N(\mu, \sigma^2)$ |

### 6.2 统计量

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\mu$ | 均值 | 总体均值 | $\mu = E[X]$ |
| $\sigma$ | 标准差 | 标准差 | $\sigma = \sqrt{\text{Var}(X)}$ |
| $\sigma^2$ | 方差 | 方差 | $\sigma^2 = E[(X-\mu)^2]$ |
| $\bar{x}$ | 样本均值 | 样本均值 | $\bar{x} = \frac{\sum x_i}{n}$ |
| $s^2$ | 样本方差 | 样本方差 | $s^2 = \frac{\sum(x_i-\bar{x})^2}{n-1}$ |
| $E[X]$ | 期望 | 随机变量的期望 | $E[X] = \sum x_i p_i$ |
| $\text{Var}(X)$ | 方差 | 随机变量的方差 | $\text{Var}(X) = E[(X-\mu)^2]$ |
| $\text{Cov}(X,Y)$ | 协方差 | X 和 Y 的协方差 | $\text{Cov}(X,Y) = E[(X-\mu_X)(Y-\mu_Y)]$ |
| $\rho$ | 相关系数 | 线性相关程度 | $\rho = \frac{\text{Cov}(X,Y)}{\sigma_X \sigma_Y}$ |

### 6.3 常见分布

| 符号 | 读法 | 含义 |
|------|------|------|
| $N(\mu, \sigma^2)$ | 正态分布 | 均值 $\mu$，方差 $\sigma^2$ |
| $U(a, b)$ | 均匀分布 | 区间 $[a,b]$ 上均匀 |
| $B(n, p)$ | 二项分布 | n 次试验，成功率 p |
| $\text{Poisson}(\lambda)$ | 泊松分布 | 参数 $\lambda$ |
| $\text{Exp}(\lambda)$ | 指数分布 | 参数 $\lambda$ |

---

## 七、数论符号

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $a \mid b$ | 整除 | a 整除 b | $3 \mid 12$ |
| $a \nmid b$ | 不整除 | a 不整除 b | $5 \nmid 12$ |
| $\bmod$ | 模 | 取模运算 | $17 \bmod 5 = 2$ |
| $a \equiv b \pmod{n}$ | 同余 | 模 n 同余 | $17 \equiv 2 \pmod{5}$ |
| $\gcd(a,b)$ | 最大公约数 | 最大公因数 | $\gcd(12, 8) = 4$ |
| $\text{lcm}(a,b)$ | 最小公倍数 | 最小公倍数 | $\text{lcm}(12, 8) = 24$ |
| $\lfloor x \rfloor$ | 下取整 | 不大于 x 的最大整数 | $\lfloor 3.7 \rfloor = 3$ |
| $\lceil x \rceil$ | 上取整 | 不小于 x 的最小整数 | $\lceil 3.2 \rceil = 4$ |

---

## 八、特殊函数符号

### 8.1 三角函数

| 符号 | 读法 | 含义 |
|------|------|------|
| $\sin$ | 正弦 | sine |
| $\cos$ | 余弦 | cosine |
| $\tan$ | 正切 | tangent |
| $\cot$ | 余切 | cotangent |
| $\sec$ | 正割 | secant |
| $\csc$ | 余割 | cosecant |
| $\arcsin$ | 反正弦 | 反三角函数 |
| $\arccos$ | 反余弦 | 反三角函数 |
| $\arctan$ | 反正切 | 反三角函数 |

### 8.2 双曲函数

| 符号 | 读法 | 含义 | 定义 |
|------|------|------|------|
| $\sinh$ | 双曲正弦 | hyperbolic sine | $\sinh x = \frac{e^x - e^{-x}}{2}$ |
| $\cosh$ | 双曲余弦 | hyperbolic cosine | $\cosh x = \frac{e^x + e^{-x}}{2}$ |
| $\tanh$ | 双曲正切 | hyperbolic tangent | $\tanh x = \frac{\sinh x}{\cosh x}$ |

### 8.3 特殊函数

| 符号 | 读法 | 含义 |
|------|------|------|
| $\Gamma(n)$ | 伽马函数 | $(n-1)!$ 的推广 |
| $B(x,y)$ | 贝塔函数 | Beta 函数 |
| $\text{erf}(x)$ | 误差函数 | 误差函数 |
| $\delta(x)$ | 狄拉克函数 | Dirac delta 函数 |
| $\text{sgn}(x)$ | 符号函数 | x 的符号 |

---

## 九、希腊字母

### 9.1 小写希腊字母

| 符号 | 名称 | 常用于 |
|------|------|--------|
| $\alpha$ | alpha / 阿尔法 | 角度、系数 |
| $\beta$ | beta / 贝塔 | 角度、系数 |
| $\gamma$ | gamma / 伽马 | 角度、伽马函数 |
| $\delta$ | delta / 德尔塔 | 微小变化量 |
| $\epsilon$ | epsilon / 艾普西隆 | 任意小正数 |
| $\zeta$ | zeta / 泽塔 | Riemann zeta 函数 |
| $\eta$ | eta / 伊塔 | 效率 |
| $\theta$ | theta / 西塔 | 角度 |
| $\iota$ | iota / 约塔 | 下标 |
| $\kappa$ | kappa / 卡帕 | 曲率 |
| $\lambda$ | lambda / 兰姆达 | 特征值、波长 |
| $\mu$ | mu / 缪 | 均值、摩擦系数 |
| $\nu$ | nu / 纽 | 频率 |
| $\xi$ | xi / 克西 | 随机变量 |
| $o$ | omicron / 奥密克戎 | 很少使用 |
| $\pi$ | pi / 派 | 圆周率 |
| $\rho$ | rho / 柔 | 密度、相关系数 |
| $\sigma$ | sigma / 西格玛 | 标准差、求和 |
| $\tau$ | tau / 套 | 时间常数 |
| $\upsilon$ | upsilon / 宇普西隆 | 很少使用 |
| $\phi$ | phi / 斐 | 角度、黄金比例 |
| $\chi$ | chi / 卡 | 卡方分布 |
| $\psi$ | psi / 普西 | 波函数 |
| $\omega$ | omega / 欧米伽 | 角速度 |

### 9.2 大写希腊字母

| 符号 | 名称 | 常用于 |
|------|------|--------|
| $\Gamma$ | Gamma | 伽马函数 |
| $\Delta$ | Delta | 变化量、拉普拉斯算子 |
| $\Theta$ | Theta | 大 O 符号 |
| $\Lambda$ | Lambda | 对角矩阵 |
| $\Xi$ | Xi | 随机变量 |
| $\Pi$ | Pi | 连乘 |
| $\Sigma$ | Sigma | 求和 |
| $\Phi$ | Phi | 正态分布函数 |
| $\Psi$ | Psi | 波函数 |
| $\Omega$ | Omega | 样本空间、欧姆 |

---

## 十、其他常用符号

### 10.1 数学修饰符

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $\bar{x}$ | x 拔 | 平均值 | $\bar{x} = \frac{\sum x_i}{n}$ |
| $\hat{x}$ | x 帽 | 估计值 | $\hat{x}$ |
| $\tilde{x}$ | x 波浪 | 近似值 | $\tilde{x}$ |
| $x^*$ | x 星 | 共轭/最优值 | $z^*$ |
| $\dot{x}$ | x 点 | 对时间求导 | $\dot{x} = \frac{dx}{dt}$ |
| $\ddot{x}$ | x 双点 | 二阶导数 | $\ddot{x} = \frac{d^2x}{dt^2}$ |
| $x'$ | x 撇 | 导数 | $f'(x)$ |

### 10.2 复数符号

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $i$ | 虚数单位 | $\sqrt{-1}$ | $i^2 = -1$ |
| $\text{Re}(z)$ | 实部 | 复数的实部 | $\text{Re}(3+4i) = 3$ |
| $\text{Im}(z)$ | 虚部 | 复数的虚部 | $\text{Im}(3+4i) = 4$ |
| $\lvert z\rvert$ | 模 | 复数的模 | $\lvert 3+4i\rvert = 5$ |
| $\arg(z)$ | 辐角 | 复数的角度 | $\arg(z)$ |
| $z^*$ | 共轭 | 复数共轭 | $(a+bi)^* = a-bi$ |

### 10.3 区间符号

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $(a, b)$ | 开区间 | $a < x < b$ | $(0, 1)$ |
| $[a, b]$ | 闭区间 | $a \leq x \leq b$ | $[0, 1]$ |
| $[a, b)$ | 左闭右开 | $a \leq x < b$ | $[0, 1)$ |
| $(a, b]$ | 左开右闭 | $a < x \leq b$ | $(0, 1]$ |
| $(-\infty, a)$ | 负无穷到 a | $x < a$ | $(-\infty, 0)$ |
| $(a, \infty)$ | a 到正无穷 | $x > a$ | $(0, \infty)$ |

### 10.4 组合数学

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $n!$ | n 阶乘 | $n \times (n-1) \times \cdots \times 1$ | $5! = 120$ |
| $\binom{n}{k}$ | 组合数 | n 选 k 的组合 | $\binom{5}{2} = 10$ |
| $P(n,k)$ | 排列数 | n 选 k 的排列 | $P(5,2) = 20$ |
| $F_n$ | 斐波那契数 | 第 n 个斐波那契数 | $F_5 = 5$ |

### 10.5 函数与推理符号

| 符号 | 读法 | 含义 | 示例 |
|------|------|------|------|
| $f: A \to B$ | 映射 | 从 A 到 B 的函数 | $f: \mathbb{R} \to \mathbb{R}$ |
| $f \circ g$ | 复合函数 | $f(g(x))$ | $(f \circ g)(x)$ |
| $f^{-1}$ | 反函数 | 逆函数 | $\sin^{-1}(x)$ |
| $\text{dom}(f)$ | 定义域 | 函数的定义域 | $\text{dom}(\sqrt{x}) = [0, \infty)$ |
| $\text{ran}(f)$ | 值域 | 函数的值域 | $\text{ran}(x^2) = [0, \infty)$ |
| $\therefore$ | 因此/所以 | 推理结论 | $A=B,\, B=C \;\therefore A=C$ |
| $\because$ | 因为 | 推理原因 | $\because x>0 \;\therefore x^2>0$ |
| $\perp$ | 垂直 | 垂直关系 | $AB \perp CD$ |
| $\parallel$ | 平行 | 平行关系 | $AB \parallel CD$ |
| $\angle$ | 角 | 角度 | $\angle ABC$ |
| $\triangle$ | 三角形 | 三角形 | $\triangle ABC$ |
| $^\circ$ | 度 | 角度单位 | $90^\circ$ |

---

## 十一、常用数学常数

| 符号 | 名称 | 近似值 | 含义 |
|------|------|--------|------|
| $\pi$ | 圆周率 | 3.14159... | 圆周长与直径之比 |
| $e$ | 自然常数 | 2.71828... | 自然对数的底 |
| $\phi$ | 黄金比例 | 1.61803... | $\frac{1+\sqrt{5}}{2}$ |
| $\gamma$ | 欧拉常数 | 0.57721... | Euler-Mascheroni 常数 |
| $\sqrt{2}$ | 根号 2 | 1.41421... | 2 的平方根 |

---

## 十二、LaTeX 公式书写规范

本站使用 remark-math + rehype-katex 渲染数学公式，统一采用 `$...$`（行内）与 `$$...$$`（块级，独占行）两种分隔符。这是 Markdown 中最通用的 LaTeX 公式格式，兼容 GitHub、GitLab、Obsidian、Typora 等主流渲染器。**不要使用** `\(...\)` 或 `\[...\]` 语法——本站渲染管线不识别这两种分隔符。

### 12.1 行内公式

```markdown
这是行内公式：$E = mc^2$
```

### 12.2 块级公式

块级公式必须让 `$$` 独占一行，否则会被当作行内公式处理（左对齐、不居中）：

```markdown
$$
E = mc^2
$$
```

### 12.3 多行公式（带对齐）

```latex
$$
\begin{aligned}
a &= b + c \\
  &= d + e + f
\end{aligned}
$$
```

### 12.4 矩阵

```latex
$$
A = \begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
$$
```

### 12.5 分段函数

```latex
$$
f(x) = \begin{cases}
x^2 & \text{if } x \geq 0 \\
-x  & \text{if } x < 0
\end{cases}
$$
```

### 12.6 常用 LaTeX 宏包

在独立 LaTeX 文档中使用数学符号时，建议引入以下宏包：

```latex
\usepackage{amsmath}    % 基础数学环境
\usepackage{amssymb}    % 额外数学符号
\usepackage{mathtools}  % 增强数学工具
\usepackage{bm}        % 加粗数学符号
\usepackage{physics}   % 物理符号
```

---

## 参考资料

- 《高等数学》同济大学版
- 《线性代数》教材
- 《概率论与数理统计》教材
- LaTeX 符号速查：[Detexify](http://detexify.kirelabs.org/classify.html)
- LaTeX 数学符号：[Comprehensive LaTeX Symbol List](https://www.ctan.org/pkg/comprehensive)
- ISO 80000-2:2019 数学符号标准
