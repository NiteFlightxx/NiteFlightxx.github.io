---
category: "Animation"
title: "动画知识"
excerpt: "从空间与导数基础开始，逐步进入动画节点、IK、重定向和 Motion Matching 源码。"
featured: ["ue-animation-node-math", "predictive-foot-ik", "motion-matching-pose-search-source-guide"]
learningPaths:
  - id: "animation-foundation"
    title: "动画数学与空间"
    description: "复用线性代数、Jacobian 和动画节点文章，先建立局部/组件空间与导数直觉。"
    articles: ["ue-linear-algebra-guide", "jacobian-matrix", "ue-animation-node-math"]
  - id: "ik-and-retargeting"
    title: "IK 与重定向"
    description: "从动画节点进入 FullBodyIK，再阅读 IK Retargeter 的 Op 栈和约束。"
    articles: ["ue-animation-node-math", "ue-fullbody-ik-math", "ik-retargeter-ops-math"]
  - id: "predictive-foot-contact"
    title: "预测式 Foot IK 与接触规划"
    description: "在骨骼空间与动画节点基础上，逐步建立接触时间、未来落点、候选约束和骨盆补偿，再选择全身 IK Solver。"
    articles: ["ue-linear-algebra-guide", "ue-animation-node-math", "predictive-foot-ik", "ue-fullbody-ik-math"]
  - id: "motion-search"
    title: "Motion Matching 与 Pose Search"
    description: "先理解动画节点的姿态数据流，再进入 Query、Cost 和 Blend Stack 源码。"
    articles: ["ue-animation-node-math", "motion-matching-pose-search-source-guide"]
---

动画路线把数学、节点和源码分成连续积木。IK 与重定向共享空间和 Jacobian 基础；预测式 Foot IK 先负责未来接触规划，再把目标交给可选 Solver；Motion Matching 是完成基础后的另一条源码分支。
