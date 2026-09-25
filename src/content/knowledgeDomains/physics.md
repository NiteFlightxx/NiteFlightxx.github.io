---
category: "Physics"
title: "物理知识"
excerpt: "从经典力学、微分方程和数值积分开始，逐步进入碰撞、约束、流体、变分求解与 Chaos 源码。"
featured: ["classical-mechanics", "pbd-xpbd-math", "ue-chaos-physics-engine"]
learningPaths:
  - id: "realtime-physics"
    title: "实时物理主路线"
    description: "按经典力学 → 时间积分 → 碰撞 → 约束 → Chaos 总览的顺序学习。"
    articles: ["mathematical-notation-reference", "calculus-foundations", "classical-mechanics", "differential-equations", "numerical-integration-methods", "collision-detection-gjk-epa-sat", "pbd-xpbd-math", "physics_constraints_deep_dive", "ue-chaos-physics-engine"]
  - id: "chaos-source"
    title: "Chaos 源码路线"
    description: "完成主路线后，进入窄相、同步、布料和 GPU 分支。"
    articles: ["ue-chaos-physics-engine", "gjk-collision-detection", "chaos-kinematic-sync", "chaos-cloth", "gpu-physics-plugin"]
  - id: "deformable-and-fluid"
    title: "软体与流体分支"
    description: "先掌握 PDE，再按流体或变分求解方向进入高级专题。"
    articles: ["partial-differential-equations", "sph-fluid-simulation", "pbf-fluid-simulation", "vbd-avbd-math", "avbd-demo3d-implementation", "position-based-elastic-rods"]
  - id: "flight-control"
    title: "飞行控制分支"
    description: "用交互基础建立直觉，再进入动力学、PID 和仿真控制实现。"
    articles: ["quadcopter-basics-interactive", "quadcopter-flight-control-math"]
---

物理知识按“先能解释，再能实现，最后能读源码”的顺序组织。专题页负责上下文和分支选择，文章正文负责唯一的推导、源码证据或实验结果。
