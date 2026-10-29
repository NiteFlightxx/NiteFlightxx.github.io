---
title: 2D 物理引擎：从状态更新到约束求解
excerpt: 串联刚体状态、SAT、接触冲量、摩擦与关节，观察一个小型引擎如何完成时间步。
date: '2026-09-06'
category: Physics
subtopic: RigidBodyDynamics
tags:
  - 物理引擎
  - 刚体动力学
  - 碰撞检测
  - 冲量法
  - JavaScript
readTime: 阅读约10分钟
kind: practice
level: intermediate
pageType: guide
aliases:
  - 2D 物理引擎详解 — 向量、刚体、SAT 碰撞与冲量法约束求解
prerequisites:
  - contact-response-and-manifolds
nextArticles: []
related: [collision-detection-gjk-epa-sat, ue-chaos-physics-engine, pbd-xpbd-math, vbd-avbd-math]
topics:
  - id: ue-chaos-physics
    stage: comparison
    role: comparison
    order: 10
sources: []
---
从[总览](/knowledge/physics-simulation-overview/)中的落球出发，我们已经分别建立了状态、受力、时间积分、接触与约束。现在把它们连接成一个小型 2D 引擎的时间步：同一份状态被哪些阶段读取和修改，接触何时建立，迭代完成后哪些结果需要提交。

二维保留了平移、转动、接触耦合和历史管理，便于看清整条链。本文是实现导读，代码只覆盖明确的小例子，不对应某个已经验收的完整引擎。向量与变换见[空间数学](/knowledge/ue-linear-algebra-guide/)，时间积分见[数值积分](/knowledge/numerical-integration-methods/)。

## 刚体状态与单位

为动态刚体保存质心位置 $x\in\mathbb R^2$、角度 $\theta$、线速度 $v$、角速度 $\omega$、逆质量 $w$ 和逆惯量 $I^{-1}$。碰撞形状另存局部顶点或半径及相对质量框架的变换。

本文取米、秒、千克和弧度。静态体的求解逆质量和逆惯量为零；运动学体同样不接受动态冲量，但其已知线速度和角速度仍影响相对接触速度。

二维叉积约定为

$$
a\times b=a_xb_y-a_yb_x,\qquad
\omega\times r=(-\omega r_y,\omega r_x).
$$

因此距质心 $r$ 的点速度为 $v+\omega\times r$，在该点施力 $F$ 产生力矩 $\tau=r\times F$。质心位置、形状中心和渲染原点不应默认相同。

## 输入、固定步与所有权

外部输入按固定物理子步消费，渲染按需要插值前后提交状态。固定步累计器需要设定追赶上限，明确超预算后保留还是丢弃未模拟时间，不能默默改变动力学时间。

力与冲量的入口分开：力积分为 $\Delta v=hwF$，冲量直接产生 $\Delta v=wp$。每子步清理瞬时力累加器，持续力由拥有者重新提供。弹簧双方承受等大反向作用力，不因双方均可动就各除以二。

一种速度冲量式流水线可以组织为：

~~~text
消费本子步输入并更新规定运动
累加力与力矩，更新自由速度
更新用于碰撞查询的几何与宽相代理
建立窄相接触、流形和关节约束
按身份匹配历史状态并应用热启动
执行若干轮速度约束迭代
用修正后的速度推进位置和角度
按所选方法修正位置偏差
提交状态、更新缓存并清理瞬时输入
~~~

这里选择的是一种具体排程。若改成先预测位置再投影，接触几何、速度回算和恢复阶段也要一起调整，不能把两种主循环逐行叠加。

## 宽相、过滤与候选对

先用碰撞组和掩码过滤，再用 AABB、网格或树寻找候选对。网格需将物体登记到其 AABB 覆盖的所有单元，并对重复出现的物体对去重；不能只登记质心所在格子。

每步更新时需要清空或增量维护旧映射，同时处理负坐标、大物体、边界相切和销毁对象。哈希桶相同不代表单元相同，更不代表真实碰撞。

下面的示例用字符串单元键避免有限哈希碰撞，只返回潜在对；它不是最终窄相。输入 AABB 为闭区间，故相切边界也可能产生候选。

~~~js
// knowledge-grid-example
export function candidatePairs(boxes, cellSize) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw new Error('cell size');
  const cells = new Map(), pairs = new Set();
  boxes.forEach((box, i) => {
    if (box.min.length !== 2 || box.max.length !== 2 ||
        ![...box.min, ...box.max].every(Number.isFinite) ||
        box.min.some((v, k) => v > box.max[k])) throw new Error('AABB');
    const low = box.min.map(v => Math.floor(v / cellSize));
    const high = box.max.map(v => Math.floor(v / cellSize));
    for (let x = low[0]; x <= high[0]; x++) for (let y = low[1]; y <= high[1]; y++) {
      const key = x + ',' + y, entries = cells.get(key) ?? [];
      for (const j of entries) pairs.add(j + ':' + i);
      entries.push(i); cells.set(key, entries);
    }
  });
  return [...pairs].map(key => key.split(':').map(Number));
}
~~~

该示例每次调用建立新表，避免跨步残留。极小网格加上大物体会产生大量登记，实际产品需要容量预算与大物体策略，复杂度不能一律声称为 $O(n)$。

## 窄相到接触流形

圆、凸多边形和边等形状使用各自查询。SAT、GJK 和穿透求解的原理见[凸体碰撞](/knowledge/collision-detection-gjk-epa-sat/)。查询结果需要转换成稳定法线、接触点、间隙与特征身份。

约定法线 $n$ 从 A 指向 B，使法向相对速度

$$
v_n=n\cdot(v_b+\omega_b\times r_b-v_a-\omega_a\times r_a).
$$

$v_n<0$ 表示接近，$v_n>0$ 表示分离。接触点应落在一致的几何与时间状态上。多边形面接触常需要裁剪与点归约；只保留任意一个穿透点可能造成支撑不稳定。

## 法向冲量、恢复与累计钳制

在接触法线冻结时，标量有效逆质量为

$$
W=w_a+w_b+I_a^{-1}(r_a\times n)^2+I_b^{-1}(r_b\times n)^2.
$$

要求 $W>0$。对目标法向速度 $v_{target}$，局部增量为

$$
\Delta p_n=-\frac{v_n-v_{target}}{W},\quad
p_{new}=\max(0,p_{old}+\Delta p_n).
$$

只应用 $p_{new}-p_{old}$。作用在 B 上的冲量为 $pn$，A 上为 $-pn$，角速度变化按各自接触臂叉乘计算。

恢复系数 $e$ 通常基于求解前的接近速度设置 $v_{target}=-e\min(v_{n,pre},0)$，并使用速度阈值控制静止抖动。不要每轮用已经修正的速度重新解释同一次撞击恢复。

## 摩擦与位置误差

二维切线可取 $t=(-n_y,n_x)$。用切向有效逆质量求 $\Delta p_t$，再把累计切向冲量投影到 $[-\mu p_n,\mu p_n]$。法向变化后需重检摩擦上限。

Baumgarte 偏置、独立位置投影和软约束有不同的能量与误差行为，应选定方案并记录容差与最大纠正速度。不能把“减小穿透”和“保持碰撞恢复能量”当成自动同时满足。

原理和累计投影的完整推导见[物理约束](/knowledge/physics_constraints_deep_dive/)。增加接触迭代只能改善当前约束集的误差，不能修复漏掉的接触。

## 关节与弹簧

距离关节的两个锚点由局部坐标变换到世界，使用各自质心接触臂构造约束行。铰链、滑轨和角度限制由允许的相对自由度定义，不能仅按类名判断实际限制。

弹簧力是 $F=-kC\,\nabla C$；双方承受相反作用，固定端的反力不会使动态端受力减半。显式弹簧还需匹配步长和阻尼，硬距离约束则可采用速度约束或[PBD/XPBD](/knowledge/pbd-xpbd-math/)位置修正。两条路线应分别描述。

## 缓存、睡眠与重启

缓存至少包含对象代际、形状对和接触特征，不能只用可能复用的数组索引。移除刚体时应清理宽相登记、约束引用和相关接触状态；Reset 后旧乘子不能自动属于新世界。

睡眠需要同时考虑速度、误差、外力和相连约束的激活，唤醒通常沿耦合关系传播。仅把小速度置零并不构成完整睡眠系统。

## 验证与实现边界

先分别验证自由落体、施加冲量、偏心力矩、单接触恢复、摩擦滑动、堆叠、关节和 Reset，再组成复杂场景。宽相示例的自动检查验证负坐标、跨格物体、候选去重和非法输入，不代表完整引擎已实现或通过这些场景。

AVBD 使用位置/姿态块与原对偶状态，不能只作为“稳定性更好”的一栏加入速度冲量循环。其目标和算法见[VBD/AVBD](/knowledge/vbd-avbd-math/)，原生可对照实现见[avbd-demo3d](/knowledge/avbd-demo3d-implementation/)。本文不提供没有硬件与场景依据的性能排名。

约束与接触资料可从 [Erin Catto 的原始讲义](https://box2d.org/publications/)继续查阅。代码定位、运行示例和物理正确性应分别验证。

## 把主线带入方法与源码

刚体分支到这里形成实现闭环：共同基础建立状态与动量关系，刚体模型加入转动，积分产生候选运动，几何建立接触，约束协调允许的运动，提交保存下一步的起点与历史。这是一类保持形状的模型实现，软体与流体有自己的内部自由度、材料和边界路线。

接下来按问题选择分支：要实现凸体查询，进入[碰撞检测](/knowledge/collision-detection-gjk-epa-sat/)；要比较位置和变分更新，进入[PBD/XPBD](/knowledge/pbd-xpbd-math/)或[VBD/AVBD](/knowledge/vbd-avbd-math/)；要阅读工业引擎，进入[Chaos 架构](/knowledge/ue-chaos-physics-engine/)；要理解 GPU 的阶段和资源依赖，进入[three-avbd](/knowledge/three-avbd-gpu-solver/)。这些分支各自展开，不需要串成一条必修顺序。
