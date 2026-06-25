/**
 * Single source of truth for all category taxonomies + the Research Map tree.
 * Views import from here instead of re-declaring categories inline.
 */

// ---- Project categories (6) ----
export const PROJECT_CATEGORIES = {
  Simulation: "物理模拟",
  Motion: "运动与动画",
  Rendering: "渲染",
  Gameplay: "玩法系统",
  Tools: "工具链",
  AI: "智能系统",
} as const;
export type ProjectCategory = keyof typeof PROJECT_CATEGORIES;

// ---- Knowledge categories (7) ----
export const KNOWLEDGE_CATEGORIES = {
  Engine: "引擎",
  Physics: "物理",
  Animation: "动画",
  Rendering: "渲染",
  Gameplay: "玩法",
  AI: "智能",
  Mathematics: "数学",
} as const;
export type KnowledgeCategory = keyof typeof KNOWLEDGE_CATEGORIES;

// ---- Lab topics (5 domains, mirrors the Research Map top level) ----
export const LAB_TOPICS = {
  Simulation: "物理模拟",
  Motion: "运动与动画",
  Rendering: "渲染",
  Gameplay: "玩法系统",
  AI: "智能系统",
} as const;
export type LabTopic = keyof typeof LAB_TOPICS;

// ---- Archive skill matrix categories (6) ----
export const SKILL_CATEGORIES = {
  EngineProgramming: "引擎编程",
  PhysicsSimulation: "物理模拟",
  AnimationSystems: "动画系统",
  Rendering: "渲染",
  GameplayArchitecture: "玩法架构",
  AITooling: "AI 工具链",
} as const;

// ---- Research Map tree ----
export interface ResearchMapNode {
  name: string;
  labelZh: string;
}
export interface ResearchMapDomain {
  domain: LabTopic;
  labelZh: string;
  items: ResearchMapNode[];
}

export const RESEARCH_MAP: ResearchMapDomain[] = [
  {
    domain: "Simulation",
    labelZh: LAB_TOPICS.Simulation,
    items: [
      { name: "Constraint Solver", labelZh: "约束求解器" },
      { name: "Chaos", labelZh: "Chaos 物理" },
      { name: "Vehicle", labelZh: "载具动力学" },
      { name: "Flight Controller", labelZh: "飞控系统" },
    ],
  },
  {
    domain: "Motion",
    labelZh: LAB_TOPICS.Motion,
    items: [
      { name: "Motion Matching", labelZh: "运动匹配" },
      { name: "Pose Search", labelZh: "姿态搜索" },
      { name: "Control Rig", labelZh: "控制绑定" },
      { name: "Procedural Animation", labelZh: "程序化动画" },
    ],
  },
  {
    domain: "Gameplay",
    labelZh: LAB_TOPICS.Gameplay,
    items: [
      { name: "GAS", labelZh: "游戏能力系统" },
      { name: "Combat", labelZh: "战斗系统" },
      { name: "Interaction", labelZh: "交互系统" },
    ],
  },
  {
    domain: "Rendering",
    labelZh: LAB_TOPICS.Rendering,
    items: [
      { name: "RDG", labelZh: "渲染依赖图" },
      { name: "Shader", labelZh: "着色器" },
      { name: "Nanite", labelZh: "Nanite 几何" },
    ],
  },
  {
    domain: "AI",
    labelZh: LAB_TOPICS.AI,
    items: [
      { name: "Agent", labelZh: "智能体" },
      { name: "MCP", labelZh: "模型上下文协议" },
      { name: "RAG", labelZh: "检索增强生成" },
    ],
  },
];

// Display helper used by views (looks up the localized label for any enum value).
export function projectCategoryZh(c: string): string {
  return (PROJECT_CATEGORIES as Record<string, string>)[c] ?? c;
}
export function knowledgeCategoryZh(c: string): string {
  return (KNOWLEDGE_CATEGORIES as Record<string, string>)[c] ?? c;
}
export function labTopicZh(t: string): string {
  return (LAB_TOPICS as Record<string, string>)[t] ?? t;
}
