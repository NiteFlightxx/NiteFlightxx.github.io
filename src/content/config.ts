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
    'VFXSystem',
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

const ARTICLE_TOPIC_ROLES = [
  'theory',
  'source',
  'algorithm',
  'comparison',
  'practice',
  'experiment',
] as const;

const ARTICLE_KINDS = ['theory', 'source', 'algorithm', 'comparison', 'practice', 'experiment'] as const;
const ARTICLE_LEVELS = ['foundation', 'intermediate', 'advanced'] as const;
const ARTICLE_PAGE_TYPES = ['guide', 'concept', 'source-analysis', 'project', 'interactive'] as const;

const knowledgeSource = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

const articleTopic = z.object({
  id: z.string().min(1),
  stage: z.string().min(1),
  role: z.enum(ARTICLE_TOPIC_ROLES),
  order: z.number().int().nonnegative(),
});

const topicStage = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  order: z.number().int().nonnegative(),
});

// 知识库 — 知识沉淀 / 技术分析 / 经验总结 / 教学内容
const knowledge = defineCollection({
  type: 'content',
  schema: z
    .object({
      title: z.string().min(1).regex(/详解\s+—\s+/, 'title must use "[主题]详解 — [副标题]"'),
      excerpt: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD'),
      category: z.enum(KNOWLEDGE_CATEGORIES),
      subtopic: z.enum(ALL_KNOWLEDGE_SUBTOPICS),
      tags: z.array(z.string().min(1)).min(3).max(6),
      readTime: z.string().regex(/^阅读约\d+分钟$/, 'readTime must use 阅读约N分钟'),
      draft: z.boolean().optional().default(false),
      topics: z.array(articleTopic).default([]),
      kind: z.enum(ARTICLE_KINDS).default('theory'),
      level: z.enum(ARTICLE_LEVELS).default('intermediate'),
      prerequisites: z.array(z.string().min(1)).default([]),
      nextArticles: z.array(z.string().min(1)).default([]),
      aliases: z.array(z.string().min(1)).default([]),
      pageType: z.enum(ARTICLE_PAGE_TYPES).default('guide'),
      sources: z.array(knowledgeSource).default([]),
      related: z.array(z.string().min(1)).default([]),
      featured: z.boolean().default(false),
    })
    .superRefine((value, ctx) => {
      const allowed = KNOWLEDGE_SUBTOPICS[value.category] as readonly string[];
      if (!allowed.includes(value.subtopic)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subtopic'],
          message: `subtopic ${value.subtopic} is not valid for category ${value.category}`,
        });
      }
    }),
});

const topics = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string().min(1),
    excerpt: z.string().min(1),
    category: z.enum(KNOWLEDGE_CATEGORIES),
    status: z.enum(['active', 'planned', 'archived']).default('active'),
    engine: z.string().optional(),
    engineVersion: z.string().optional(),
    sourceRoot: z.string().optional(),
    stages: z.array(topicStage).min(1),
    tags: z.array(z.string().min(1)).min(1),
  }),
});

const knowledgePath = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  articles: z.array(z.string().min(1)).min(1),
});

const knowledgeDomains = defineCollection({
  type: 'content',
  schema: z.object({
    category: z.enum(KNOWLEDGE_CATEGORIES),
    title: z.string().min(1),
    excerpt: z.string().min(1),
    featured: z.array(z.string().min(1)).default([]),
    learningPaths: z.array(knowledgePath).default([]),
  }),
});

export const collections = { knowledge, topics, knowledgeDomains };
