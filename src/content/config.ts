import { defineCollection, z } from 'astro:content';

// Category vocabularies (mirror src/lib/taxonomy.ts). Kept inline so the zod
// schema produces precise literal unions for the generated content types.
const KNOWLEDGE_CATEGORIES = [
  'Engine',
  'Physics',
  'Animation',
  'Rendering',
  'Gameplay',
  'AI',
  'Mathematics',
] as const;

const LAB_TOPICS = ['Simulation', 'Motion', 'Rendering', 'Gameplay', 'AI'] as const;

// 受控子主题词表：每个分类下的固定子主题枚举。
// 与 KNOWLEDGE_CATEGORIES 一一对应，作者只能从此列表中选取 subtopic，
// 避免 tags 式的自由膨胀。新增子主题需在此处与 taxonomy.ts 同步登记。
const KNOWLEDGE_SUBTOPICS = {
  Engine: [
    'SourceArchitecture',
    'ModuleSystem',
    'MemoryManagement',
    'JobSystem',
    'AssetPipeline',
    'ReflectionSerialization',
  ],
  Physics: [
    'ConstraintSolver',
    'ChaosPhysics',
    'Collision',
    'RigidBodyDynamics',
    'VehicleDynamics',
    'FlightController',
    'Fluid',
  ],
  Animation: [
    'AnimationNode',
    'ControlRigIK',
    'Retargeting',
    'MotionMatching',
    'PoseSearch',
    'ProceduralAnimation',
  ],
  Rendering: ['RDG', 'Shader', 'Nanite', 'Lumen', 'Material', 'PostProcess'],
  Gameplay: ['GAS', 'Combat', 'Interaction', 'StateMachine', 'Networking'],
  AI: ['Agent', 'BehaviorTree', 'Pathfinding', 'MCP', 'RAG'],
  Mathematics: [
    'LinearAlgebra',
    'Calculus',
    'Optimization',
    'NumericalMethods',
    'Probability',
    'DifferentialEquations',
  ],
} as const satisfies Record<(typeof KNOWLEDGE_CATEGORIES)[number], readonly string[]>;

// 把每个分类下的子主题枚举并起来，构成 subtopic 字段的合法取值集合。
// 展开成可变数组并断言为元组类型，以满足 z.enum 对 [string, ...string[]] 的签名要求。
const ALL_KNOWLEDGE_SUBTOPICS = [
  ...Object.values(KNOWLEDGE_SUBTOPICS).flat(),
] as [string, ...string[]];

// 知识库 — 知识沉淀 / 技术分析 / 经验总结 / 教学内容
const knowledge = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.string(), // ISO date, e.g. 2026-05-14
    category: z.enum(KNOWLEDGE_CATEGORIES),
    subtopic: z.enum(ALL_KNOWLEDGE_SUBTOPICS).optional(), // 受控子主题（见 KNOWLEDGE_SUBTOPICS），迁移期可选
    tags: z.array(z.string()),
    readTime: z.string(), // display string, e.g. "阅读约12分钟"
    draft: z.boolean().optional().default(false),
  }),
});

// 实验室 — 研究记录 / 数学推导 / 算法探索 / 原型开发
const lab = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.string(), // ISO date
    topic: z.enum(LAB_TOPICS),
    tags: z.array(z.string()),
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { knowledge, lab };
