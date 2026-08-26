import { getCollection } from 'astro:content';
import { knowledgeCategoryZh, knowledgeSubtopicZh } from './taxonomy';
import type { ContentArticle } from '../types';

function formatZhDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** Load only the metadata required by the homepage and knowledge feed. */
export async function loadKnowledge(): Promise<ContentArticle[]> {
  const entries = await getCollection('knowledge', (entry) => !entry.data.draft);
  entries.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  return entries.map((entry) => {
    const categoryKey = entry.data.category;
    const subtopicKey = entry.data.subtopic ?? '';

    return {
      id: entry.slug,
      slug: entry.slug,
      title: entry.data.title,
      excerpt: entry.data.excerpt,
      date: formatZhDate(entry.data.date),
      category: knowledgeCategoryZh(categoryKey),
      categoryKey,
      subtopic: subtopicKey ? knowledgeSubtopicZh(categoryKey, subtopicKey) : undefined,
      tags: entry.data.tags,
      readTime: entry.data.readTime,
    };
  });
}
