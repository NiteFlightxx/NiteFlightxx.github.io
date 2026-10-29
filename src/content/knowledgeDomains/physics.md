---
category: "Physics"
title: "动力学与物理模拟"
excerpt: "共同基础连接刚体、可变形体、流体与耦合，数值方法作为共享工具逐层深入。"
featured: ["physics-simulation-overview", "deformable-body-dynamics", "fluid-dynamics"]
learningPaths:
  - id: "realtime-physics"
    title: "物理模拟共同基础"
    description: "总览 → 质点的状态、动量与能量 → 连续介质的场、应力与材料关系。"
    articles: ["physics-simulation-overview", "particle-dynamics", "continuum-mechanics"]
  - id: "rigid-body"
    title: "刚体动力学"
    description: "保持形状的整体运动 → 接触与摩擦 → 小型时间步实现。"
    articles: ["rigid-body-dynamics", "contact-response-and-manifolds", "2d-physics-engine"]
  - id: "deformables"
    title: "可变形体与软体"
    description: "先理解形变、材料与离散，再按体积、布料、壳或杆选择专题。"
    articles: ["deformable-body-dynamics", "chaos-cloth", "position-based-elastic-rods", "jgs2-gpu-elastodynamics"]
  - id: "fluids"
    title: "流体动力学"
    description: "先理解流动、压力、黏性与边界；网格、粒子和混合方法平行，SPH/PBF 为现有深入路线。"
    articles: ["fluid-dynamics", "sph-fluid-simulation", "pbf-fluid-simulation"]
  - id: "coupling"
    title: "模型之间的耦合"
    description: "通过界面运动、反作用和时间尺度协调刚体、软体与流体。"
    articles: ["multiphysics-coupling"]
  - id: "shared-methods"
    title: "共享理论与数值工具"
    description: "按问题查阅理论表述、时间离散、约束、位置方法与变分求解。"
    articles: ["classical-mechanics", "numerical-integration-methods", "physics_constraints_deep_dive", "pbd-xpbd-vbd-avbd-comparison", "pbd-xpbd-math", "vbd-avbd-math", "collision-detection-gjk-epa-sat"]
  - id: "chaos-source"
    title: "引擎与源码参考"
    description: "将模型与数值职责映射到具体版本的数据和执行链。"
    articles: ["ue-chaos-physics-engine", "gjk-collision-detection", "chaos-kinematic-sync", "avbd-demo3d-implementation", "three-avbd-gpu-solver", "gpu-physics-plugin"]
  - id: "flight-control"
    title: "飞行控制"
    description: "将动力学连接到控制输入与仿真反馈。"
    articles: ["quadcopter-basics-interactive", "quadcopter-flight-control-math"]
---

共同基础不预设所有材料都保持刚体形状。模型分支回答状态与材料是什么，离散和求解工具回答如何计算，耦合回答不同模型如何交换作用。每个公开入口都有实际正文，原始源码证据与运行结论继续在各实现文档中分别维护。
