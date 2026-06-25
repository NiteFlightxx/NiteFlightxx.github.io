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

// 知识库 — 知识沉淀 / 技术分析 / 经验总结 / 教学内容
const knowledge = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.string(), // ISO date, e.g. 2026-05-14
    category: z.enum(KNOWLEDGE_CATEGORIES),
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
