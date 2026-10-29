---
title: "多物理耦合：刚体、软体与流体怎样交换作用"
excerpt: "以界面运动、反作用与时间推进连接不同模型，区分单向驱动和双向耦合。"
date: "2026-10-24"
category: "Physics"
subtopic: "Multiphysics"
tags: ["多物理耦合", "流固耦合", "动量交换", "边界条件"]
readTime: "阅读约15分钟"
kind: "theory"
level: "intermediate"
pageType: "guide"
prerequisites: ["continuum-mechanics"]
nextArticles: []
related: ["rigid-body-dynamics", "deformable-body-dynamics", "fluid-dynamics", "contact-response-and-manifolds", "gpu-physics-plugin"]
sources:
  - title: "Bridson and Müller-Fischer — Fluid Simulation and Solid–Fluid Coupling"
    url: "https://www.cs.ubc.ca/~rbridson/fluidsimulation/fluids_notes.pdf"
---

刚体、软体和流体分别拥有自己的状态与材料模型。把它们放到同一个场景，还需要明确界面在哪里、双方如何传递作用、一次时间步怎样协调。否则即使两边独立运行都合理，组合后也可能凭空增加动量、重复施力或使用过期边界。

本篇讨论机械耦合的共同结构，不宣称所有模型都能无差别接入同一个求解循环。先分别认识[刚体](/knowledge/rigid-body-dynamics/)、[可变形体](/knowledge/deformable-body-dynamics/)与[流体](/knowledge/fluid-dynamics/)的职责，再理解它们相遇时增加了什么。

## 从运动边界走向相互作用

预先规定一块挡板的轨迹，再让水绕开它，是挡板驱动流体。若水压又能改变挡板运动，就形成反馈。对应到软体，水流可以弯曲薄片，而薄片形状变化又会改变流动通道。

单向驱动是有用的近似，不等于完整双向耦合。外部轨迹也可以向系统持续输入能量，不能要求被驱动的子系统像封闭系统一样守恒。

## 界面既传运动也传作用

常见机械界面至少包含两类关系：

- 运动关系：不能穿透时，双方界面法向运动相容；无滑移还约束切向关系。
- 动力关系：界面两侧以一致的符号承受相反作用。连续模型使用牵引，离散算法可能使用节点力、接触冲量或边界压力。

<figure class="physics-figure">
  <svg viewBox="0 0 360 320" role="img" aria-label="流体与固体在界面交换等大反向作用">
    <path class="diagram-muted" d="M10 65H145V245H10ZM215 65H350V245H215Z"/>
    <path class="diagram-line" d="M180 50V260" stroke-dasharray="5 5"/>
    <path class="diagram-accent" d="M117 117H243M232 109L243 117L232 125"/>
    <path class="diagram-accent" d="M243 217H117M128 209L117 217L128 225"/>
    <text x="36" y="42">流体状态</text><text x="229" y="42">刚体或软体</text>
    <text x="24" y="168">压力、速度</text><text x="24" y="191">与密度</text>
    <text x="228" y="168">配置、速度</text><text x="228" y="191">与惯性</text>
    <text x="148" y="98">作用 j</text><text x="135" y="272">反作用 −j</text>
    <text x="60" y="305">同一界面、同一时间区间</text>
  </svg>
  <figcaption>箭头表示界面交换，不代表把双方状态合并成同一个物体。图中省略了更复杂的切向应力与变形分布。</figcaption>
</figure>

流体压力对固体产生面力，对刚体还要以质心为基准累计力矩；软体则将牵引分配到相应自由度。忽略力臂会遗漏转动，把面压力当节点力又会漏掉面积因子。

## 冲量与力需要同一时间语义

一次接触交换冲量 $j$，刚体收到它后线动量改变 $j$、角动量改变 $r\times j$。若要给另一时间积分系统一个平均力，需要以同一个作用区间 $h$ 使用 $F_{\mathrm{avg}}=j/h$。

不能在流体端已经完成动量修正后，再把同一个作用以“碰撞力”和“反馈力”重复传给固体。若双方子步长度不同，还应累计各小步冲量，而不是直接相加各自的平均力数值。

对节点或粒子分配界面作用时，总分配应保持目标合力；需要保持总力矩时，权重和作用位置也必须相容。仅让权重之和为一，并不足以自动保证所有离散守恒性质。

## 时间排程影响反馈是否一致

### 分区求解

一种简单方式是先用旧固体状态更新流体，再把反馈用于固体。它容易复用已有模块，但引入时间滞后；轻固体、强不可压缩流体等情形下，反馈滞后可能造成明显误差或不稳定。

增加子步、预测界面状态、进行耦合迭代或采用松弛，可以在特定系统中改善问题。不存在适用于所有质量比和材料参数的统一迭代次数。

### 同时或强耦合

另一种路线把双方未知量与界面条件一起求解，或者在每一步内反复交换到满足容差。它能处理更多即时反馈，但增加方程规模、非线性和工程成本。

“在一个 GPU 上执行”不意味着已经强耦合，“使用两个求解器”也不必然意味着只有单向反馈。需要查看实际交换的量、时刻和收敛条件。

## 用封闭动量交换检查一次接口

先把复杂界面缩成两个沿同轴运动的有限质量对象：质量 $0.5\,\mathrm{kg}$ 的代表性小块材料速度为 $2\,\mathrm{m/s}$，质量 $2\,\mathrm{kg}$ 的物体静止。若一次理想非弹性交换后具有共同速度，则

$$
v_{\mathrm{common}}=\frac{0.5\times2+2\times0}{0.5+2}=0.4\,\mathrm{m/s}.
$$

物体接收 $0.8\,\mathrm{N\,s}$，材料块接收 $-0.8\,\mathrm{N\,s}$，总动量仍为 $1\,\mathrm{kg\,m/s}$。动能则从 $1\,\mathrm J$ 降为 $0.2\,\mathrm J$，因为这里明确选择了非弹性速度合并。

这只是接口算例，不代表真实流体界面总能缩成一颗粒子，也不表示所有双向耦合都应损失同样比例的动能。

~~~js
// knowledge-coupling-example
export function inelasticExchange(mA, vA, mB, vB) {
  if (![mA,vA,mB,vB].every(Number.isFinite) || mA <= 0 || mB <= 0) throw new Error('invalid exchange');
  const velocity = (mA*vA+mB*vB)/(mA+mB);
  return { velocity, impulseA: mA*(velocity-vA), impulseB: mB*(velocity-vB),
    beforeEnergy: 0.5*mA*vA*vA+0.5*mB*vB*vB,
    afterEnergy: 0.5*(mA+mB)*velocity*velocity };
}
~~~

## 诊断时分别检查模型与接口

先检查几何界面是否正确，再检查材料和运动边界是否相容，随后检查力、冲量、面积、坐标和时间单位，最后观察求解残差与预算。

可用静水压在固定壁上的合力、自由物体受到的反作用、偏心冲量、无外力下总动量，以及不同子步分配下的累计交换进行验证。能量变化还需要区分驱动、物理耗散与数值耗散。

只做一个漂亮的水推箱子演示，不足以区分这些误差。反过来，一个动量小算例通过，也不代表整个流固系统已验收。

## 回到统一的知识脉络

共同基础给出状态、守恒与应力，刚体/软体/流体分支定义自由度与材料，耦合定义界面关系，数值方法再决定如何离散和计算。这些层次共同构成模拟系统。

GPU 或 CPU 的执行和数据发布属于具体实现。在[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)等源码文档中，应进一步核对哪些阶段真正交换反作用、哪些状态已经提交；本篇不据此宣称某个插件已经实现完整流固耦合。
