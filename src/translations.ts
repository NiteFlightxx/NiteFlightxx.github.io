/**
 * Content data for the Personal Exploration Workshop site.
 * Skeleton/placeholder content — to be filled in during content redesign.
 * Research data has been migrated to the Markdown knowledge collection
 * (src/content/knowledge); only projects/skills/timeline remain as data
 * objects here.
 */

export const UI_TRANSLATIONS = {
  zh: {
    // Hero
    role: "Physical Animation Engineer",
    title: "个人探索工坊",
    statement: "探索动画、物理与世界的实时交互",
    exploreWork: "探索项目",
    viewProfile: "查看档案",
    scrollHint: "向下探索",
    // Home sections
    featuredSystems: "精选系统",
    recentKnowledge: "最新知识",
    viewAllProjects: "查看全部项目",
    viewAllKnowledge: "查看全部知识",
    // Knowledge section labels
    knowledgeTag: "分类",
    knowledgeDate: "日期",
    knowledgeReadTime: "阅读时间",
    // Projects
    filterSpecialization: "筛选分类:",
    all: "全部",
    examine: "分析",
    metricsTitle: "性能指标",
    engineeringLog: "工程日志",
    // Project detail sections
    overview: "项目概述",
    architecture: "技术架构",
    challenges: "核心难点",
    solution: "解决方案",
    outcomes: "项目成果",
    references: "参考资料",
    techStack: "技术栈",
    // Knowledge
    searchPlaceholder: "搜索引擎、物理、动画、C++ 代码...",
    resetFilters: "重置筛选",
    filterTag: "标签筛选:",
    filterCategory: "分类筛选:",
    filterSubtopic: "主题筛选:",
    allArticles: "全部",
    allSubtopics: "全部主题",
    noArticlesFound: "未找到匹配内容",
    refineSearch: "请优化搜索关键词或选择其他标签。",
    // Article viewer
    backToFeed: "返回列表",
    share: "分享",
    copied: "已复制",
    copyCode: "复制代码",
    closeStream: "关闭",
    // Archive
    profileOverview: "档案概览",
    narrativeHeadline: "构建技术与运动交汇的系统。",
    techDirection: "技术方向",
    researchInterest: "研究兴趣",
    expertise: "专业领域",
    systemProficiencies: "技能矩阵",
    techStackProfile: "技术栈画像",
    // Footer / diagnostics
    allRightsReserved: "Nite。保留所有计算权利。",
    systemDiagnostics: "系统诊断数据",
    diagnosticsDriver: "驱动:",
    diagnosticsSolver: "求解器:",
    diagnosticsTimer: "计时器:",
    compileStatus: "UE5.8 编译",
    compileActive: "编译就绪"
  },
  en: {
    // Hero
    role: "Physical Animation Engineer",
    title: "Personal Exploration Workshop",
    statement: "Exploring real-time interaction between animation, physics, and the world",
    exploreWork: "Explore Projects",
    viewProfile: "View Archive",
    scrollHint: "Scroll to explore",
    // Home sections
    featuredSystems: "Featured Systems",
    recentKnowledge: "Recent Knowledge",
    viewAllProjects: "View All Projects",
    viewAllKnowledge: "View All Knowledge",
    // Knowledge section labels
    knowledgeTag: "Category",
    knowledgeDate: "Date",
    knowledgeReadTime: "Read Time",
    // Projects
    filterSpecialization: "Filter Category:",
    all: "All",
    examine: "Examine",
    metricsTitle: "Performance Metrics",
    engineeringLog: "Engineering Log",
    // Project detail sections
    overview: "Overview",
    architecture: "Architecture",
    challenges: "Key Challenges",
    solution: "Solution",
    outcomes: "Outcomes",
    references: "References",
    techStack: "Tech Stack",
    // Knowledge
    searchPlaceholder: "Search engine, physics, animation, C++...",
    resetFilters: "Reset Filters",
    filterTag: "Filter Tag:",
    filterCategory: "Filter Category:",
    filterSubtopic: "Filter Subtopic:",
    allArticles: "All",
    allSubtopics: "All Subtopics",
    noArticlesFound: "No matching content found",
    refineSearch: "Refine your search or select a different tag.",
    // Article viewer
    backToFeed: "Back to List",
    share: "Share",
    copied: "Copied",
    copyCode: "Copy Code",
    closeStream: "Close",
    // Archive
    profileOverview: "Profile Overview",
    narrativeHeadline: "Building systems where technology and motion meet.",
    techDirection: "Tech Direction",
    researchInterest: "Research Interest",
    expertise: "Expertise",
    systemProficiencies: "Skill Matrix",
    techStackProfile: "Tech Stack Profile",
    // Footer / diagnostics
    allRightsReserved: "Nite. All computational rights reserved.",
    systemDiagnostics: "System Diagnostics",
    diagnosticsDriver: "Driver:",
    diagnosticsSolver: "Solver:",
    diagnosticsTimer: "Timer:",
    compileStatus: "UE5.8 Compile",
    compileActive: "Compile Ready"
  }
};

// ---- Projects: 已完成或具有工程价值的系统（骨架占位） ----
export const PROJECTS_ZH = [
  {
    id: "drone-basics-interactive",
    title: "无人机基础原理 — 3D 交互沙盒",
    category: "Simulation" as const,
    status: "completed" as const,
    year: "2026",
    articleSlug: "quadcopter-basics-interactive",
    overview:
      "面向所有读者的无人机科普：一个可以拖拽旋转的 3D 沙盒贯穿全文，五个页签对应五个知识章节——悬停（推力 vs 重力）、姿态（倾斜移动与差速转向）、受力（按住地面体验牛顿定律）、PID（真实积分的定高调参台）与混控（4×4 符号矩阵）。把抽象公式变成看得见、摸得到的物理直觉。",
    architecture:
      "单一 WebGL 沙盒基于 OGL 构建：手写轨道相机（拖拽旋转/滚轮缩放/页签预设视角动画）、四旋翼分层模型（机身/臂/电机/差速旋翼动画/按转速变色的发光盘）、3D 箭头矢量（推力/重力/速度/外力）、程序化网格地面（着色器绘制格线与降落环）、地面射线拾取（指针反投影实现按住施力）。五种模式的物理仿真（牛顿积分/定高 PID/混控矩阵）与渲染共用单 rAF 循环；PID 响应曲线为 2D 叠加条。组件经文章占位符由通用 DemoMount 渐进挂载，文章保持纯静态 Markdown + KaTeX。",
    challenges:
      "科普的难点不是写公式，而是让没学过控制理论的读者在 30 秒内建立直觉；同时单个沙盒要在五个知识模式间无缝切换且互不干扰状态，3D 相机的拖拽旋转又要与「按住地面施力」的手势不冲突。",
    solution:
      "每个页签只保留一条可操作的因果链（一个滑块或一次按住对应一个物理量），相机在受力页签自动让位给施力手势并锁定到俯视预设；物理模型做真实数值积分但量纲刻意简化为可读节奏；PID 面板还原测量微分与积分限幅等真实工程细节，让「只有 P 的稳态误差」和「风扰下 I 项回推」成为可观察现象。",
    outcomes:
      "一个沙盒讲完四旋翼入门的全部核心因果链：升力 → 姿态 → 牛顿定律 → PID → 混控，作为深度文章（AircraftLab 技术详解）的科普前哨；通用挂载机制可被后续任何文章复用以嵌入交互组件。",
    references: [
      "交互式文章：/knowledge/quadcopter-basics-interactive/",
      "进阶阅读：/knowledge/quadcopter-flight-control-math/",
    ],
    tech: ["React", "OGL/WebGL", "KaTeX", "数值积分"],
    metrics: [
      { label: "3D 沙盒", value: "1 个 · 5 模式" },
      { label: "渲染技术", value: "WebGL (OGL)" },
      { label: "物理仿真", value: "实时数值积分" },
      { label: "阅读门槛", value: "零基础" },
    ],
    visualPrompt: "把『倾斜才能移动』和『P 有稳态误差』这类只有动手才记得住的物理直觉，做成网页上转得动的 3D 沙盒。",
  },
];

// ---- Skill matrix: 档案技能矩阵（按 UE 技术领域划分） ----
export const SKILLS_ZH = [
  {
    name: "动画系统",
    skills: [
      { name: "Animation Blueprint", details: "状态机、混合与骨骼控制节点的组合编排，驱动角色姿态、状态切换与运动表现。" },
      { name: "IK", details: "从单链 IK 到全身 IK 求解器的选型与调参，覆盖雅可比法与位置动力学两条范式。" },
      { name: "Control Rig", details: "在 RigGraph 中以 RigUnit 形式组织骨骼控制逻辑，实现程序化、可复用的绑定与求解。" },
    ],
  },
  {
    name: "物理引擎",
    skills: [
      { name: "Chaos", details: "在 Chaos 物理引擎下定义角色刚体行为、约束与碰撞，平衡物理可信度与实时性能。" },
      { name: "Forward Dynamics", details: "基于力与质量的物理建模，通过求解外力作用下的加速度与状态演化，模拟碰撞、重力、弹性与摩擦等物理行为，从而驱动物体在时间维度上的真实运动响应。" },
      { name: "Inverse Dynamics", details: "基于目标运动状态或期望轨迹，反向求解系统所需的力、力矩或控制输入，用于生成满足约束条件的驱动行为，实现对运动结果的控制与约束。" },
      { name: "Constraint", details: "刚体约束求解与运动刚度控制，维持骨骼长度、关节限位与柔性表现。" },
      { name: "Cloth", details: "布料与软体模拟，为角色二级运动提供贴合物理规律的动态形变。" },
    ],
  },
  {
    name: "数学与仿真",
    skills: [
      { name: "Control Theory", details: "以级联 PID 与反馈控制为骨架，建立角色运动与物理系统的目标跟踪与稳定闭环。" },
      { name: "Quaternion", details: "四元数旋转表示与 Swing-Twist 分解、球面插值，支撑骨骼朝向求解与限位。" },
      { name: "Jacobian", details: "雅可比矩阵与阻尼最小二乘，将末端目标映射为关节增量，统一 IK 与约束求解的数学骨架。" },
      { name: "Numerical Methods", details: "数值积分、迭代求解与极分解，在实时性与精度之间为物理仿真选择合适方法。" },
    ],
  },
];
