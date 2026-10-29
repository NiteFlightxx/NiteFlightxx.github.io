---
title: "UE Chaos 物理引擎专题"
excerpt: "沿 Chaos 的状态与执行流水线定位源码，再按具体问题查阅几何、约束、并行与同步。"
category: "Physics"
status: "active"
engine: "Unreal Engine"
engineVersion: "UE 5.x"
sourceRoot: "Engine/Source/Runtime/Experimental/Chaos"
tags: ["Chaos", "Unreal Engine", "物理引擎", "源码阅读"]
stages:
  - id: "orientation"
    title: "阅读说明与术语"
    description: "先明确专题边界、源码版本、文章职责和阅读方法；总览文章只负责导航，不重复展开每个算法。"
    order: 10
  - id: "foundation"
    title: "数学与物理基础"
    description: "共同基础建立状态、守恒与连续介质；刚体、软体与流体各有模型路线，这里按 Chaos 实现需要查阅。"
    order: 20
  - id: "collision"
    title: "碰撞检测"
    description: "先从 SAT、GJK、EPA 的几何直觉进入，再阅读 Chaos 窄相源码和接触数据。"
    order: 30
  - id: "constraint"
    title: "约束与求解器"
    description: "先理解接触与约束的共同模型，再按问题选择位置或变分求解分支。"
    order: 40
  - id: "architecture"
    title: "Chaos Simulation Pipeline"
    description: "沿着 AdvanceOneTimeStepImpl 和粒子状态流，理解碰撞、约束、求解、回写如何组成一次物理步。"
    order: 50
  - id: "parallel"
    title: "并行化与 GPU"
    description: "阅读 Island、图染色、任务图、布料和 GPU 路径，理解吞吐、确定性与调试成本的取舍。"
    order: 60
  - id: "runtime"
    title: "运行时同步与工程问题"
    description: "把源码结论用于运动学同步、时间步、抖动、堆叠、穿透和项目集成问题。"
    order: 70
  - id: "comparison"
    title: "其他物理引擎对比"
    description: "最后再比较 Box2D、PhysX、Bullet、Jolt 和 Havok，避免在不了解 Chaos 内核前做表面类比。"
    order: 80
---

## 专题定位

这个专题帮助把一般物理模型映射到 Chaos 的实际实现。[物理模拟总览](/knowledge/physics-simulation-overview/)先连接共同基础、刚体、软体与流体；本专题再按具体实现需要深入刚体、布料和对应数值工具，负责源码版本、阶段位置与工程证据。

## 推荐阅读顺序

1. 阅读 [Chaos 架构](/knowledge/ue-chaos-physics-engine/)，确认源码范围和一次物理步的阶段。
2. 需要具体几何查询时，进入 [Chaos GJK](/knowledge/gjk-collision-detection/)；需要同步时，进入[运动学同步](/knowledge/chaos-kinematic-sync/)。
3. 遇到推导问题时，回查数学与约束主文；PBD/XPBD 与 VBD/AVBD 是不同方法分支，不能当成同一引擎必然依次执行的环节。
4. 布料、GPU 和其他实现按模型与任务选择，不构成阅读 Chaos 内核的统一前置要求。

## 文章职责边界

- `ue-chaos-physics-engine` 是专题总览和源码流水线入口，不重复基础推导。
- `collision-detection-gjk-epa-sat` 负责通用几何算法；`gjk-collision-detection` 负责 Chaos 的源码实现。
- `pbd-xpbd-math` 与 `physics_constraints_deep_dive` 负责约束数学；`vbd-avbd-math` 和 `avbd-demo3d-implementation` 负责更高级的变分求解与实现。
- `chaos-kinematic-sync` 属于运行时同步；`2d-physics-engine` 属于对比和实践，不作为 Chaos 内核前置。
- `chaos-cloth`、`gpu-physics-plugin` 和 `jgs2-gpu-elastodynamics` 分别涉及布料模型、GPU 宿主与弹性体算法，按任务进入。

## 源码范围

专题默认以 `Engine/Source/Runtime/Experimental/Chaos` 为核心范围。文章中的源码路径、类名和函数名需要结合具体 Unreal Engine 版本复核；跨版本结论会单独标注。
