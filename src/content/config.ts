import { defineCollection, z } from 'astro:content';

// Shared category vocabulary used across projects, blog, and research.
const CATEGORIES = [
  'Physics Simulation',
  'Real-time Rendering',
  'Gameplay Systems',
  'Animation Technical Art',
] as const;

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    date: z.string(),            // ISO date, e.g. 2026-05-14
    category: z.enum(CATEGORIES),
    tags: z.array(z.string()),
    readTime: z.string(),        // display string, e.g. "阅读约12分钟"
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = { blog };
