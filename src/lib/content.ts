import { getCollection } from 'astro:content';
import { KNOWLEDGE_CATEGORIES, knowledgeCategoryZh, knowledgeSubtopicZh } from './taxonomy';
import type { ContentArticle, ContentTopicSummary, KnowledgeDomain, KnowledgePath } from '../types';

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
      topics: entry.data.topics,
      kind: entry.data.kind,
      level: entry.data.level,
      prerequisites: entry.data.prerequisites,
      nextArticles: entry.data.nextArticles,
    };
  });
}

export async function loadKnowledgeDomains(): Promise<KnowledgeDomain[]> {
  const [domains, articles] = await Promise.all([
    getCollection('knowledgeDomains'),
    getCollection('knowledge', (entry) => !entry.data.draft),
  ]);

  return domains
    .map((entry) => {
      const categoryArticles = articles.filter((article) => article.data.category === entry.data.category);
      const subtopics = new Set(categoryArticles.map((article) => article.data.subtopic));
      const learningPaths: KnowledgePath[] = entry.data.learningPaths.map((path) => ({
        id: path.id,
        title: path.title,
        description: path.description,
        articles: path.articles,
      }));
      return {
        id: entry.slug,
        categoryKey: entry.data.category,
        title: entry.data.title,
        excerpt: entry.data.excerpt,
        articleCount: categoryArticles.length,
        subtopicCount: subtopics.size,
        featured: entry.data.featured,
        learningPaths,
      };
    })
    .sort((a, b) => Object.keys(KNOWLEDGE_CATEGORIES).indexOf(a.categoryKey) - Object.keys(KNOWLEDGE_CATEGORIES).indexOf(b.categoryKey));
}

export async function loadTopicSummaries(): Promise<ContentTopicSummary[]> {
  const [topics, articles] = await Promise.all([
    getCollection('topics'),
    getCollection('knowledge', (entry) => !entry.data.draft),
  ]);

  return topics.map((topic) => ({
    id: topic.slug,
    title: topic.data.title,
    excerpt: topic.data.excerpt,
    categoryKey: topic.data.category,
    status: topic.data.status,
    stageCount: topic.data.stages.length,
    articleCount: articles.filter((article) => article.data.topics.some((ref) => ref.id === topic.slug)).length,
  }));
}
