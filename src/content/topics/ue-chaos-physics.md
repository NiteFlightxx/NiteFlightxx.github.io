---
title: "UE Chaos 物理引擎专题"
excerpt: "从数学与物理基础、时间积分、碰撞与约束，到 Chaos 源码流水线、并行化、运行时同步和引擎对比，按由浅入深的积木顺序阅读。"
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
    description: "补齐经典力学、微分方程、时间积分和迭代求解器这些后文反复使用的共同语言。"
    order: 20
  - id: "collision"
    title: "碰撞检测"
    description: "先从 SAT、GJK、EPA 的几何直觉进入，再阅读 Chaos 窄相源码和接触数据。"
    order: 30
  - id: "constraint"
    title: "约束与求解器"
    description: "把 Jacobian、有效质量、PBD/XPBD、VBD/AVBD 和接触约束串成可实现的求解链。"
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

这个专题是 Chaos 源码的学习地图。每篇知识库文章只承担一个明确积木：基础文章负责概念和推导，算法文章负责可实现步骤，源码文章负责 Unreal Engine 中的落点，实践文章负责验证。专题页负责顺序和上下文，不复制文章正文。

## 推荐阅读顺序

1. **先读 orientation**：确认源码版本、术语和文章边界。
2. **完成 foundation**：经典力学 → 微分方程 → 数值积分 → 迭代线性求解器。
3. **进入 collision 与 constraint**：先理解几何碰撞，再理解约束投影和求解器。
4. **阅读 architecture**：把前面的积木放回 Chaos 的一次 Simulation Tick。
5. **最后阅读 parallel、runtime 和 comparison**：把内核知识连接到性能、同步、调试和选型。

## 文章职责边界

- `ue-chaos-physics-engine` 是专题总览和源码流水线入口，不重复基础推导。
- `collision-detection-gjk-epa-sat` 负责通用几何算法；`gjk-collision-detection` 负责 Chaos 的源码实现。
- `pbd-xpbd-math` 与 `physics_constraints_deep_dive` 负责约束数学；`vbd-avbd-math` 和 `avbd-demo3d-implementation` 负责更高级的变分求解与实现。
- `chaos-kinematic-sync` 属于运行时同步；`2d-physics-engine` 属于对比和实践，不作为 Chaos 内核前置。
- `chaos-cloth`、`gpu-physics-plugin` 和 `jgs2-gpu-elastodynamics` 属于并行/GPU 分支，完成核心路线后按兴趣进入。

## 源码范围

专题默认以 `Engine/Source/Runtime/Experimental/Chaos` 为核心范围。文章中的源码路径、类名和函数名需要结合具体 Unreal Engine 版本复核；跨版本结论会单独标注。
