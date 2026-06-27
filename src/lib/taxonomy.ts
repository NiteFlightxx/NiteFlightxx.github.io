/**
 * Single source of truth for all category taxonomies.
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

// ---- Knowledge subtopics (受控子主题词表) ----
// 每个分类下的固定子主题，与 config.ts 中 KNOWLEDGE_SUBTOPICS 对齐。
// 作者只能从对应分类的子主题列表中选取 subtopic，避免自由膨胀。
// 新增子主题需在此处与 config.ts 同步登记。
export const KNOWLEDGE_SUBTOPICS: Record<KnowledgeCategory, Record<string, string>> = {
  Engine: {
    SourceArchitecture: "源码架构",
    ModuleSystem: "模块系统",
    MemoryManagement: "内存管理",
    JobSystem: "任务系统",
    AssetPipeline: "资产管线",
    ReflectionSerialization: "反射与序列化",
  },
  Physics: {
    ConstraintSolver: "约束求解器",
    ChaosPhysics: "Chaos 物理",
    Collision: "碰撞检测",
    RigidBodyDynamics: "刚体动力学",
    VehicleDynamics: "载具动力学",
    FlightController: "飞控系统",
    Fluid: "流体",
  },
  Animation: {
    AnimationNode: "动画节点",
    ControlRigIK: "控制绑定与 IK",
    Retargeting: "重定向",
    MotionMatching: "运动匹配",
    PoseSearch: "姿态搜索",
    ProceduralAnimation: "程序化动画",
  },
  Rendering: {
    RDG: "渲染依赖图",
    Shader: "着色器",
    Nanite: "Nanite 几何",
    Lumen: "Lumen 光照",
    Material: "材质",
    PostProcess: "后处理",
  },
  Gameplay: {
    GAS: "游戏能力系统",
    Combat: "战斗系统",
    Interaction: "交互系统",
    StateMachine: "状态机",
    Networking: "网络同步",
  },
  AI: {
    Agent: "智能体",
    BehaviorTree: "行为树",
    Pathfinding: "寻路",
    MCP: "模型上下文协议",
    RAG: "检索增强生成",
  },
  Mathematics: {
    LinearAlgebra: "线性代数",
    Calculus: "微积分",
    Optimization: "优化",
    NumericalMethods: "数值方法",
    Probability: "概率统计",
    DifferentialEquations: "微分方程",
  },
};

// ---- Archive skill matrix categories (6) ----
export const SKILL_CATEGORIES = {
  EngineProgramming: "引擎编程",
  PhysicsSimulation: "物理模拟",
  AnimationSystems: "动画系统",
  Rendering: "渲染",
  GameplayArchitecture: "玩法架构",
  AITooling: "AI 工具链",
} as const;

// Display helper used by views (looks up the localized label for any enum value).
export function projectCategoryZh(c: string): string {
  return (PROJECT_CATEGORIES as Record<string, string>)[c] ?? c;
}
export function knowledgeCategoryZh(c: string): string {
  return (KNOWLEDGE_CATEGORIES as Record<string, string>)[c] ?? c;
}
// Look up the localized subtopic label for a (category, subtopic) pair.
// Returns the subtopic key itself if no mapping is found (graceful fallback).
export function knowledgeSubtopicZh(category: string, subtopic: string): string {
  const subtopics = (KNOWLEDGE_SUBTOPICS as Record<string, Record<string, string>>)[category];
  if (!subtopics) return subtopic;
  return subtopics[subtopic] ?? subtopic;
}
// Return the subtopic map for a given category (used by the filter UI to render
// the cascading second row of chips). Empty object if the category is unknown.
export function knowledgeSubtopicsFor(category: string): Record<string, string> {
  return (KNOWLEDGE_SUBTOPICS as Record<string, Record<string, string>>)[category] ?? {};
}
