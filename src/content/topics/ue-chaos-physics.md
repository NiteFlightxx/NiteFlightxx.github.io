---
title: "UE Chaos 物理引擎专题"
excerpt: "从数学基础、源码架构、碰撞与约束求解，到并行化、工程问题和其他物理引擎对比，建立一条可验证的 Chaos 源码阅读路线。"
category: "Physics"
status: "active"
engine: "Unreal Engine"
engineVersion: "UE 5.x"
sourceRoot: "Engine/Source/Runtime/Experimental/Chaos"
tags: ["Chaos", "Unreal Engine", "物理引擎", "源码阅读"]
stages:
  - id: "foundation"
    title: "理论基础"
    description: "先建立刚体动力学、时间积分、PBD/XPBD 和迭代求解器的共同语言。"
    order: 10
  - id: "architecture"
    title: "Chaos 总体架构"
    description: "从物理 Tick 进入 AdvanceOneTimeStepImpl，跟踪状态、约束、求解和回写的完整流水线。"
    order: 20
  - id: "collision"
    title: "碰撞检测"
    description: "理解 Broadphase、GJK、EPA、接触流形和 Chaos 的几何分派。"
    order: 30
  - id: "solver"
    title: "约束求解"
    description: "连接 Jacobian、有效质量、Position/Velocity/Projection 三阶段以及接触和 Joint 求解。"
    order: 40
  - id: "parallel"
    title: "并行化与性能"
    description: "阅读 Island 分组、图染色、任务图、Warm Start 和 GPU 路径的工程取舍。"
    order: 50
  - id: "comparison"
    title: "引擎对比"
    description: "在统一维度下比较 Chaos、PhysX、Bullet、Box2D、Jolt 和 Havok 的架构选择。"
    order: 60
  - id: "practice"
    title: "工程实践"
    description: "把源码结论用于解释抖动、堆叠、穿透、质量比和时间步问题。"
    order: 70
---

## 专题定位

这个专题把知识库中的数学文章、通用算法文章和 Unreal Engine 源码文章组织成一条阅读路线。专题页面负责说明上下文和顺序，文章负责保留完整推导与源码证据，避免在多个页面复制同一套内容。

## 阅读方式

建议先完成“理论基础”，再阅读 Chaos 总体架构。之后按照碰撞、约束、并行化的顺序深入。引擎对比阶段用于建立设计取舍，工程实践阶段用于把源码结论映射到实际问题。

## 源码范围

专题默认以 `Engine/Source/Runtime/Experimental/Chaos` 为核心范围。文章中出现的源码路径、类名和函数名需要结合具体 Unreal Engine 版本复核；跨版本结论会单独标注。
