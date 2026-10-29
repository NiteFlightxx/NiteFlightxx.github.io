---
title: 位置约束求解：PBD 与 XPBD
excerpt: 推导位置投影、柔度与乘子更新，说明时间步、迭代和约束状态的关系。
date: '2026-07-01'
category: Physics
subtopic: ConstraintSolver
tags:
  - 物理
  - PBD
  - XPBD
  - 约束求解
  - 柔度
  - C++
readTime: 阅读约10分钟
kind: algorithm
level: intermediate
pageType: guide
aliases:
  - PBD 与 XPBD 详解 — 从位置投影到柔度可控的约束求解
prerequisites:
  - numerical-integration-methods
  - physics_constraints_deep_dive
nextArticles:
  - vbd-avbd-math
related: ["pbd-xpbd-vbd-avbd-comparison"]
topics:
  - id: ue-chaos-physics
    stage: constraint
    role: theory
    order: 10
sources:
  - title: Position Based Dynamics
    url: 'https://matthias-research.github.io/pages/publications/posBasedDyn.pdf'
  - title: XPBD
    url: 'https://mmacklin.com/xpbd.pdf'
---
PBD 在预测位置上逐约束修正，XPBD 在修正中加入柔度和步内累计乘子。两者的关键区别是离散约束方程，而不是是否存在一个迭代循环。本文负责粒子位置层的推导、执行顺序和退化处理；刚体接触、摩擦与速度冲量的共同语言见[物理约束](/knowledge/physics_constraints_deep_dive/)。

与 VBD、AVBD 的模型、更新块、有限预算结果及工程成本比较，统一见[四种位置求解方法对比](/knowledge/pbd-xpbd-vbd-avbd-comparison/)。

## 状态与一次子步

设粒子位置 $x_i$、速度 $v_i$、质量 $m_i$，逆质量 $w_i=1/m_i$。固定粒子取 $w_i=0$。子步长度为 $h>0$，$p_i$ 是当前子步的候选位置，$n$ 表示时间步，$k$ 表示同一步内迭代。

对已知外力 $f_i$，先计算

$$
v_i^*=v_i^n+hw_if_i,\qquad p_i^{(0)}=x_i^n+hv_i^*.
$$

约束迭代结束后提交

$$
x_i^{n+1}=p_i,\qquad v_i^{n+1}=\frac{p_i-x_i^n}{h}.
$$

这里将位置修正反馈到速度。独立的速度约束、恢复、摩擦和阻尼属于后续阶段，不能在修正后又重复积分相同外力。规定运动的固定端需要单独更新已知位置。

## PBD 的质量加权投影

### 从线性化到修正

对标量等式 $C(p)=0$，一阶近似为

$$
C(p+\Delta p)\approx C(p)+\sum_i\nabla_iC^T\Delta p_i.
$$

在满足线性化约束的修正中，最小化质量加权位移，得到

$$
W=\sum_iw_i\|\nabla_iC\|^2,\qquad
\Delta\lambda=-\frac{C}{W},\qquad
\Delta p_i=w_i\nabla_iC\,\Delta\lambda.
$$

$W$ 是有效逆质量。$W=0$ 时约束没有可用的动态修正方向，必须跳过或报告不可满足；退化几何使梯度不可定义时，也应使用明确的退化策略。

一个约束的投影可能破坏另一个约束，因此需要多轮迭代。沿本轮最新位置重新计算 $C$ 和梯度，就是非线性 GS 风格的约束求解。

### 距离约束算例

定义 $C=\|p_b-p_a\|-\ell_0$，$n=(p_b-p_a)/\ell$。其梯度为 $(-n,n)$，因此

$$
\Delta p_a=-w_an\Delta\lambda,\qquad
\Delta p_b=w_bn\Delta\lambda,\qquad
\Delta\lambda=-\frac{\ell-\ell_0}{w_a+w_b}.
$$

若两点在一维上的位置为 $0,2$，静止长度为 $1$，两点质量均为 $1$，则 $\Delta\lambda=-1/2$，新位置是 $0.5,1.5$。固定左端后，右端单独移动到 $1$。

对零长度且静止长度非零的退化情况，不能直接除以 $\ell$。保留可靠历史方向、使用确定的替代方向或拒绝当前约束，各有行为代价。

## XPBD 的柔度与累计乘子

### 变分目标与时间缩放

对 $E_C=C^2/(2\alpha)$，$\alpha>0$ 是柔度。包含惯性的目标为

$$
\Phi(p)=\frac{1}{2h^2}(p-y)^TM(p-y)+\frac{1}{2\alpha}C(p)^2,
\qquad y=x^n+hv^n+h^2M^{-1}f_{ext}.
$$

乘以 $h^2$ 后，约束项系数应为 $h^2/(2\alpha)$。遗漏这一因子会改变材料与时间步的关系。

令 $\tilde\alpha=\alpha/h^2$，以位置层乘子 $\lambda$ 表示约束响应，采用

$$
M(p-y)-J^T\lambda=0,\qquad C(p)+\tilde\alpha\lambda=0.
$$

距离弹簧的 $\alpha=1/k$，单位为长度/力；位置乘子的单位为力乘时间平方。物理约束力估计为 $J^T\lambda/h^2$。体积或应变约束中的柔度必须根据该约束能量重新推导，不能直接把杨氏模量的倒数当作任意约束的参数。

### 局部增量

对当前约束做一阶局部更新，得到

$$
\Delta\lambda=-\frac{C(p)+\tilde\alpha\lambda}
 {\sum_iw_i\|\nabla_iC\|^2+\tilde\alpha},\qquad
\Delta p_i=w_i\nabla_iC\Delta\lambda,
$$

$$
\lambda\leftarrow\lambda+\Delta\lambda.
$$

$\lambda$ 在**当前子步开始时**初始化，在该子步的迭代中累计。分子中的 $\tilde\alpha\lambda$ 保留了已施加修正对应的材料响应。每轮清零会改变所求离散方程。

$\alpha=0$ 时局部位置修正退化为硬 PBD 投影。柔度减弱了材料参数对时间步和迭代次数的隐式依赖，但有限迭代、非线性和耦合仍产生求解误差，不能说一轮就得到任意系统的精确刚度。

### 子步循环

~~~text
对每个子步 h：
  保存旧位置 x_old
  根据外力或已知运动建立预测位置 p
  对每条本步约束初始化 lambda = 0
  对每轮迭代：
    读取当前 p，计算 C、梯度与有效逆质量
    计算 alpha_tilde = alpha / h²
    求 delta_lambda，并施加所需可行域限制
    修正相关粒子位置
    累计 lambda
  以 (p - x_old) / h 重建速度
  执行明确的速度级处理并提交位置
~~~

跨子步热启动是额外策略，需要处理步长变化、约束身份、接触基和失效条件。它不能与步内累计混为一谈。

## 常用约束与各自的几何条件

### 距离与有符号体积

距离梯度见前例。四面体令 $a=p_1-p_0,b=p_2-p_0,c=p_3-p_0$，有符号体积为

$$
V=\tfrac16a\cdot(b\times c),\qquad C=V-V_0.
$$

梯度为

$$
\nabla_1C=\tfrac16(b\times c),\quad
\nabla_2C=\tfrac16(c\times a),\quad
\nabla_3C=\tfrac16(a\times b),\quad
\nabla_0C=-(\nabla_1C+\nabla_2C+\nabla_3C).
$$

顶点排序决定体积符号。体积等式本身不构成完整的反转障碍，退化后梯度质量也可能恶化。

### 接触与单边投影

采用分离为正的间隙 $g\ge0$，反作用乘子要求 $\lambda_n\ge0$。先求候选增量，再令 $\lambda_{new}=\max(0,\lambda_{old}+\Delta\lambda)$，仅施加两者之差。距离场、平面和粒子对各自有不同的梯度与几何有效范围。

接触摩擦、恢复和连续碰撞检测需要额外模型，不能从一条位置非穿透约束自动获得。

### 弯曲、应变与形状匹配

二面角弯曲约束依赖相邻三角形的法线及面积，退化三角形和角度跨越 $\pi$ 的分支需要处理。等距弯曲、二面角和杆的扭转并非同一约束；材料坐标与扭转见[弹性杆](/knowledge/position-based-elastic-rods/)。

应变约束从形变梯度构造能量，再推导对应 $C$ 和柔度。形状匹配通过最佳拟合变换产生目标位置，不能无说明地套成任意标量 XPBD 约束。

## 统一的可执行距离约束

下面只实现两点距离约束的一次 XPBD 更新。它支持固定点，显式报告无法定义方向的重合状态，不包含碰撞、阻尼或跨步缓存。

~~~js
// knowledge-xpbd-example
export function distanceUpdate(a, b, wa, wb, rest, alpha, h, lambda = 0) {
  if (a.length !== 3 || b.length !== 3 ||
      ![...a, ...b, wa, wb, rest, alpha, h, lambda].every(Number.isFinite) ||
      wa < 0 || wb < 0 || rest < 0 || alpha < 0 || h <= 0) throw new Error('input');
  const d = b.map((v, i) => v - a[i]);
  const length = Math.hypot(...d);
  if (wa + wb === 0) return { a: [...a], b: [...b], lambda, status: 'fixed' };
  if (length === 0) throw new Error('undefined distance direction');
  const scaled = alpha / (h * h);
  const delta = -(length - rest + scaled * lambda) / (wa + wb + scaled);
  const n = d.map(v => v / length);
  return {
    a: a.map((v, i) => v - wa * n[i] * delta),
    b: b.map((v, i) => v + wb * n[i] * delta),
    lambda: lambda + delta, status: 'updated'
  };
}
~~~

对固定左端、单位质量右端、预测位置 $2$、静止长度 $1$、$h=1,\alpha=1$，一轮得到右端 $1.5$ 和 $\lambda=-0.5$。此时 $C+\tilde\alpha\lambda=0$，保持同一乘子再次更新不会继续把距离拉向 $1$。这就是软约束的平衡，不是求解失败。

## 并行、成本与诊断

Jacobi 需要把重叠粒子的修正归并并明确松弛；GS 立即写回位置；约束图着色可将没有共享可写粒子的约束放在同一批执行。一个约束内部的向量化和多个约束之间的并行是不同层次。

不收敛时先核对约束定义、质量、梯度与接触集合，再比较子步与迭代预算。发散或 NaN 还可能来自零长度、退化体积、非法逆质量和反转材料模型。禁止只调整柔度掩盖几何错误。

自动算例检查覆盖硬距离、固定端、软约束平衡、步内累计和非法输入。它不构成布料自碰撞、刚体摩擦或 UE 资产接入的验证。

## 来源与继续阅读

原始定义见 [Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf) 与 [XPBD](https://mmacklin.com/xpbd.pdf)。整体约束关系见[物理约束](/knowledge/physics_constraints_deep_dive/)，能量和顶点块见[VBD/AVBD](/knowledge/vbd-avbd-math/)，密度约束见[PBF](/knowledge/pbf-fluid-simulation/)。
