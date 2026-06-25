/**
 * Content data for the Personal R&D Lab site.
 * Skeleton/placeholder content — to be filled in during content redesign.
 * Blog and research data have been migrated to Markdown collections
 * (src/content/knowledge + src/content/lab); only projects/skills/timeline
 * remain as data objects here.
 */

export const UI_TRANSLATIONS = {
  zh: {
    // Hero
    role: "Unreal Engine 工程师",
    title: "个人研发实验室",
    statement: "工程能力 · 研究能力 · 系统设计能力",
    exploreWork: "探索项目",
    viewProfile: "查看档案",
    // Home sections
    featuredSystems: "精选系统",
    recentKnowledge: "最新知识",
    currentExperiments: "当前实验",
    researchTimeline: "研究时间线",
    viewAllProjects: "查看全部项目",
    viewAllKnowledge: "查看全部知识",
    viewAllExperiments: "查看全部实验",
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
    // Knowledge / Lab
    searchPlaceholder: "搜索引擎、物理、动画、C++ 代码...",
    resetFilters: "重置筛选",
    filterTag: "标签筛选:",
    allArticles: "全部",
    noArticlesFound: "未找到匹配内容",
    refineSearch: "请优化搜索关键词或选择其他标签。",
    researchMap: "研究地图",
    experiment: "实验",
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
    compileStatus: "UE5.5 编译",
    compileActive: "编译就绪"
  },
  en: {
    // Hero
    role: "Unreal Engine Engineer",
    title: "Personal R&D Lab",
    statement: "Engineering · Research · System Design",
    exploreWork: "Explore Projects",
    viewProfile: "View Archive",
    // Home sections
    featuredSystems: "Featured Systems",
    recentKnowledge: "Recent Knowledge",
    currentExperiments: "Current Experiments",
    researchTimeline: "Research Timeline",
    viewAllProjects: "View All Projects",
    viewAllKnowledge: "View All Knowledge",
    viewAllExperiments: "View All Experiments",
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
    // Knowledge / Lab
    searchPlaceholder: "Search engine, physics, animation, C++...",
    resetFilters: "Reset Filters",
    filterTag: "Filter Tag:",
    allArticles: "All",
    noArticlesFound: "No matching content found",
    refineSearch: "Refine your search or select a different tag.",
    researchMap: "Research Map",
    experiment: "Experiment",
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
    compileStatus: "UE5.5 Compile",
    compileActive: "Compile Ready"
  }
};

// ---- Projects: 已完成或具有工程价值的系统（骨架占位） ----
export const PROJECTS_ZH = [
  {
    id: "placeholder-system",
    title: "占位项目：待填充",
    category: "Simulation" as const,
    overview: "项目概述待填充。说明项目的目标、背景与工程价值。",
    architecture: "技术架构待填充。描述系统设计、模块划分与数据流。",
    challenges: "核心难点待填充。列出该系统解决的关键技术难题。",
    solution: "解决方案待填充。说明针对核心难点采用的工程方法。",
    outcomes: "项目成果待填充。量化或定性描述最终交付效果。",
    references: ["参考链接待填充"],
    tech: ["UE5", "C++"],
    metrics: [
      { label: "执行耗时", value: "— 毫秒" },
      { label: "内存占用", value: "— MB" },
    ],
    visualPrompt: "占位视觉描述待填充。",
  },
];

// ---- Skill matrix: 档案技能矩阵（6 类骨架） ----
export const SKILLS_ZH = [
  {
    name: "引擎编程",
    skills: [
      { name: "C++ 引擎子系统开发", proficiency: 0, details: "待填充。" },
    ],
  },
  {
    name: "物理模拟",
    skills: [
      { name: "Chaos 物理与约束求解", proficiency: 0, details: "待填充。" },
    ],
  },
  {
    name: "动画系统",
    skills: [
      { name: "Motion Matching 与 Control Rig", proficiency: 0, details: "待填充。" },
    ],
  },
  {
    name: "渲染",
    skills: [
      { name: "HLSL 计算着色器与渲染管线", proficiency: 0, details: "待填充。" },
    ],
  },
  {
    name: "玩法架构",
    skills: [
      { name: "GAS 与网络同步", proficiency: 0, details: "待填充。" },
    ],
  },
  {
    name: "AI 工具链",
    skills: [
      { name: "Agent 与 MCP 实践", proficiency: 0, details: "待填充。" },
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
