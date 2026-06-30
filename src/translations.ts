/**
 * Content data for the Personal R&D Lab site.
 * Skeleton/placeholder content — to be filled in during content redesign.
 * Research data has been migrated to the Markdown knowledge collection
 * (src/content/knowledge); only projects/skills/timeline remain as data
 * objects here.
 */

export const UI_TRANSLATIONS = {
  zh: {
    // Hero
    role: "Unreal Engine 工程师",
    title: "个人研发实验室",
    statement: "探索动画、物理与世界的实时交互",
    exploreWork: "探索项目",
    viewProfile: "查看档案",
    // Home sections
    featuredSystems: "精选系统",
    recentKnowledge: "最新知识",
    viewAllProjects: "查看全部项目",
    viewAllKnowledge: "查看全部知识",
    // Projects
    capabilityTagline: "工程能力 · 研究能力 · 系统设计能力",
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
    experience: "经验:",
    language: "语言:",
    platforms: "平台:",
    location: "地点:",
    systemProficiencies: "技能矩阵",
    techStackProfile: "技术栈画像",
    professionalTimeline: "职业发展时间线",
    careerChronology: "成长轨迹",
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
    role: "Unreal Engine Engineer",
    title: "Personal R&D Lab",
    statement: "Exploring real-time interaction between animation, physics, and the world",
    exploreWork: "Explore Projects",
    viewProfile: "View Archive",
    // Home sections
    featuredSystems: "Featured Systems",
    recentKnowledge: "Recent Knowledge",
    viewAllProjects: "View All Projects",
    viewAllKnowledge: "View All Knowledge",
    // Projects
    capabilityTagline: "Engineering · Research · System Design",
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
    experience: "Experience:",
    language: "Language:",
    platforms: "Platforms:",
    location: "Location:",
    systemProficiencies: "Skill Matrix",
    techStackProfile: "Tech Stack Profile",
    professionalTimeline: "Professional Timeline",
    careerChronology: "Growth Trajectory",
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
    id: "aircraftlab",
    title: "AircraftLab — 四旋翼无人机飞控系统",
    category: "Simulation" as const,
    status: "completed" as const,
    year: "2026",
    articleSlug: "quadcopter-flight-control-math",
    overview:
      "基于 Unreal Engine 5 与 Chaos 物理引擎的四旋翼无人机飞控实验系统。从飞行员摇杆输入到四个电机转速指令，完整实现位置—速度—姿态—角速率的级联 PID 控制链，以及阻尼伪逆加活动集的控制分配（混控）算法，可在物理子步下闭环仿真真实飞行。",
    architecture:
      "采用级联控制架构：位置外环 → 速度内环 → 姿态角外环 → 角速率内环 → 混控 → 电机。状态估计融合 IMU/气压计/GPS/磁力计；控制器输出期望合力与合力矩，经 4×4 控制效率矩阵（Jacobian）与阻尼最小二乘伪逆分配到各旋翼；电机模型含指令 slew 限幅与一阶转速响应。所有飞控逻辑集中在一个 FlightControllerComponent 中（实验性实现，未做框架拆分）。",
    challenges:
      "四旋翼欠驱动（6 自由度仅 4 个独立输入）、强耦合（水平位移只能靠倾斜机身实现）、本质不稳定；控制分配需在 [0,1] 约束下求解，且电机一阶响应与传感器噪声共同限制了内环控制带宽。",
    solution:
      "用时间尺度分离的级联 PID 逐级收窄目标；内环采用测量微分（Derivative on Measurement）避免设定值突变冲击，条件积分法（Clamping）抗积分饱和，微分项串联一阶低通滤波抑制噪声；混控用阻尼伪逆（岭回归正则）抑制奇异与噪声放大，迭代活动集把解投影到可行域并尽量保持合力/力矩平衡。",
    outcomes:
      "支持 Quad / Hex / Octo 多种布局与单桨失效后的自动重配；默认参数针对百公斤级无人机，控制循环 250Hz 闭环；悬停倾斜方程 tan θ = a/g 将期望水平加速度解析映射为目标姿态，打通位置控制到姿态控制的桥梁。",
    references: [
      "GitHub 仓库：https://github.com/NiteFlightxx/AircraftLab",
    ],
    tech: ["UE5", "C++", "Chaos", "级联 PID"],
    metrics: [
      { label: "控制循环频率", value: "250 Hz" },
      { label: "最大倾斜角", value: "35°" },
      { label: "电机最大转速", value: "12000 RPM" },
      { label: "支持布局", value: "Quad/Hex/Octo" },
    ],
    visualPrompt: "从牛顿-欧拉方程到电机指令，一条可推导、可验证的飞控翻译链。",
    mediaUrl: "https://www.bilibili.com/video/BV1xQja61EQU/",
  },
];

// ---- Skill matrix: 档案技能矩阵（按 UE 技术领域划分） ----
export const SKILLS_ZH = [
  {
    name: "动画系统",
    skills: [
      { name: "Animation Blueprint", proficiency: 86, details: "状态机、混合与骨骼控制节点的组合编排，驱动角色姿态、状态切换与运动表现。" },
      { name: "Motion Matching", proficiency: 78, details: "基于姿态搜索的实时运动匹配，从动画库中选取最贴合目标动作的姿态序列。" },
      { name: "IK", proficiency: 88, details: "从单链 IK 到全身 IK 求解器的选型与调参，覆盖雅可比法与位置动力学两条范式。" },
      { name: "Control Rig", proficiency: 84, details: "在 RigGraph 中以 RigUnit 形式组织骨骼控制逻辑，实现程序化、可复用的绑定与求解。" },
      { name: "Motion Warping", proficiency: 80, details: "对动画根运动与目标点进行运行时形变，让预制动作贴合实际环境与交互目标。" },
    ],
  },
  {
    name: "物理引擎",
    skills: [
      { name: "Chaos", proficiency: 85, details: "在 Chaos 物理引擎下定义角色刚体行为、约束与碰撞，平衡物理可信度与实时性能。" },
      { name: "Active Ragdoll", proficiency: 82, details: "以物理模拟驱动角色身体，实现受击反馈、二级运动与自然的身体动力学响应。" },
      { name: "Physical Animation", proficiency: 80, details: "物理与动画的混合驱动，让骨骼在物理响应与动画表现之间平滑过渡。" },
      { name: "Constraint", proficiency: 84, details: "刚体约束求解与运动刚度控制，维持骨骼长度、关节限位与柔性表现。" },
      { name: "Cloth", proficiency: 75, details: "布料与软体模拟，为角色二级运动提供贴合物理规律的动态形变。" },
    ],
  },
  {
    name: "引擎编程",
    skills: [
      { name: "Unreal Engine C++", proficiency: 88, details: "深入 UE C++ 与模块架构，从插件到子系统的设计与扩展，落地角色运动系统。" },
      { name: "源码分析", proficiency: 86, details: "长期阅读 UE 引擎与插件源码，从底层机制理解各子系统的设计取舍与实现路径。" },
      { name: "系统设计", proficiency: 84, details: "运动系统的架构设计，兼顾可扩展性、稳定性与表现力的工程化组织。" },
      { name: "性能优化", proficiency: 82, details: "关注控制循环频率、缓存友好性与子步调度的实时性能调优。" },
    ],
  },
  {
    name: "数学与仿真",
    skills: [
      { name: "Control Theory", proficiency: 86, details: "以级联 PID 与反馈控制为骨架，建立角色运动与物理系统的目标跟踪与稳定闭环。" },
      { name: "Quaternion", proficiency: 84, details: "四元数旋转表示与 Swing-Twist 分解、球面插值，支撑骨骼朝向求解与限位。" },
      { name: "Jacobian", proficiency: 90, details: "雅可比矩阵与阻尼最小二乘，将末端目标映射为关节增量，统一 IK 与约束求解的数学骨架。" },
      { name: "Numerical Methods", proficiency: 87, details: "数值积分、迭代求解与极分解，在实时性与精度之间为物理仿真选择合适方法。" },
    ],
  },
];

// ---- Career timeline: 成长轨迹（骨架占位） ----
export const TIMELINE_ZH = [
  {
    year: "2024 — 至今",
    role: "占位职位待填充",
    company: "占位公司待填充",
    project: "占位项目待填充",
    description: "职责描述待填充。",
    outcomes: ["成果待填充"],
    highlights: ["亮点待填充"],
  },
];
