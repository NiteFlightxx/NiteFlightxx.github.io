---
category: "Animation"
title: "动画知识"
excerpt: "从空间与导数基础开始，逐步进入动画节点、IK、重定向和 Motion Matching 源码。"
featured: ["ue-animation-node-math", "ue-fullbody-ik-math", "motion-matching-pose-search-source-guide"]
learningPaths:
  - id: "animation-foundation"
    title: "动画数学与空间"
    description: "复用线性代数、Jacobian 和动画节点文章，先建立局部/组件空间与导数直觉。"
    articles: ["ue-linear-algebra-guide", "jacobian-matrix", "ue-animation-node-math"]
  - id: "ik-and-retargeting"
    title: "IK 与重定向"
    description: "从动画节点进入 FullBodyIK，再阅读 IK Retargeter 的 Op 栈和约束。"
    articles: ["ue-animation-node-math", "ue-fullbody-ik-math", "ik-retargeter-ops-math"]
  - id: "motion-search"
    title: "Motion Matching 与 Pose Search"
    description: "先理解动画节点的姿态数据流，再进入 Query、Cost 和 Blend Stack 源码。"
    articles: ["ue-animation-node-math", "motion-matching-pose-search-source-guide"]
---

动画路线把数学、节点和源码分成连续积木。IK 与重定向共享同一套空间和 Jacobian 基础，Motion Matching 则作为完成基础后的源码分支。
