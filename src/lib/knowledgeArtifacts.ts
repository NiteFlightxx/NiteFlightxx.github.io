import type { CollectionEntry } from 'astro:content';
import { knowledgeCategoryZh, knowledgeSubtopicZh } from './taxonomy';
import type {
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeManifestEntry,
  KnowledgeStats,
} from '../types';

type KnowledgeEntry = CollectionEntry<'knowledge'>;
type TopicEntry = CollectionEntry<'topics'>;

const knowledgeLinkPattern = /\]\((?:https?:\/\/niteflightxx\.github\.io)?\/?knowledge\/([^/#?\s)]+)\/?(?:#[^)\s]+)?\)/gi;

export interface KnowledgeArtifacts {
  manifest: KnowledgeManifestEntry[];
  graph: KnowledgeGraph;
  backlinks: Record<string, string[]>;
  outgoing: Record<string, string[]>;
  stats: KnowledgeStats;
}

export function extractKnowledgeLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const match of markdown.matchAll(knowledgeLinkPattern)) {
    if (match[1]) links.add(decodeURIComponent(match[1]).toLowerCase());
  }
  return [...links];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function buildKnowledgeArtifacts(
  entries: KnowledgeEntry[],
  topics: TopicEntry[] = [],
  learningPathCount = 0,
): KnowledgeArtifacts {
  const published = entries.filter((entry) => !entry.data.draft);
  const slugSet = new Set(published.map((entry) => entry.slug));
  const baseURL = import.meta.env.BASE_URL;

  const manifest: KnowledgeManifestEntry[] = published
    .map((entry) => {
      const linked = extractKnowledgeLinks(entry.body).filter((slug) => slugSet.has(slug));
      return {
        slug: entry.slug,
        title: entry.data.title,
        summary: entry.data.excerpt,
        category: entry.data.category,
        categoryLabel: knowledgeCategoryZh(entry.data.category),
        subtopic: entry.data.subtopic,
        subtopicLabel: knowledgeSubtopicZh(entry.data.category, entry.data.subtopic),
        tags: entry.data.tags,
        aliases: entry.data.aliases,
        pageType: entry.data.pageType,
        difficulty: entry.data.level,
        updatedAt: entry.data.date,
        readTime: entry.data.readTime,
        sources: entry.data.sources,
        related: unique([...entry.data.related, ...linked]),
        featured: entry.data.featured,
        url: `${baseURL}knowledge/${entry.slug}/`,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const outgoing: Record<string, string[]> = {};
  const backlinks: Record<string, string[]> = Object.fromEntries(published.map((entry) => [entry.slug, []]));
  const edges: KnowledgeGraphEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (source: string, target: string, type: KnowledgeGraphEdge['type']) => {
    if (source === target) return;
    const key = `${source}\u0000${target}\u0000${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, type });
  };

  for (const entry of published) {
    const markdownLinks = extractKnowledgeLinks(entry.body).filter((slug) => slugSet.has(slug));
    const explicitRelated = entry.data.related.filter((slug) => slugSet.has(slug));
    const prerequisites = entry.data.prerequisites.filter((slug) => slugSet.has(slug));
    const nextArticles = entry.data.nextArticles.filter((slug) => slugSet.has(slug));
    const linked = unique([...markdownLinks, ...explicitRelated, ...prerequisites, ...nextArticles]);
    outgoing[entry.slug] = linked;
    for (const target of linked) backlinks[target].push(entry.slug);
    markdownLinks.forEach((target) => addEdge(entry.slug, target, 'link'));
    explicitRelated.forEach((target) => addEdge(entry.slug, target, 'related'));
    prerequisites.forEach((target) => addEdge(entry.slug, target, 'prerequisite'));
    nextArticles.forEach((target) => addEdge(entry.slug, target, 'next'));
    entry.data.topics.forEach((topic) => addEdge(entry.slug, `topic:${topic.id}`, 'topic'));
  }

  Object.values(backlinks).forEach((links) => links.sort());

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const nodes: KnowledgeGraphNode[] = manifest.map((entry) => ({
    id: entry.slug,
    slug: entry.slug,
    title: entry.title,
    summary: entry.summary,
    category: entry.category,
    categoryLabel: entry.categoryLabel,
    pageType: entry.pageType,
    url: entry.url,
    degree: degree.get(entry.slug) ?? 0,
  }));

  for (const topic of topics) {
    const id = `topic:${topic.slug}`;
    if (!edges.some((edge) => edge.target === id || edge.source === id)) continue;
    nodes.push({
      id,
      slug: topic.slug,
      title: topic.data.title,
      summary: topic.data.excerpt,
      category: topic.data.category,
      categoryLabel: knowledgeCategoryZh(topic.data.category),
      pageType: 'topic',
      url: `${baseURL}projects/${topic.slug}/`,
      degree: degree.get(id) ?? 0,
    });
  }

  const categories: Record<string, number> = {};
  const subtopics: Record<string, number> = {};
  let formulaCount = 0;
  let mermaidCount = 0;
  let interactiveCount = 0;
  for (const entry of published) {
    categories[entry.data.category] = (categories[entry.data.category] ?? 0) + 1;
    subtopics[entry.data.subtopic] = (subtopics[entry.data.subtopic] ?? 0) + 1;
    formulaCount += (entry.body.match(/\$\$|\\\[/g) ?? []).length;
    mermaidCount += (entry.body.match(/```mermaid/g) ?? []).length;
    if (entry.data.pageType === 'interactive' || /data-demo=/.test(entry.body)) interactiveCount += 1;
  }

  const stats: KnowledgeStats = {
    articleCount: published.length,
    categoryCount: Object.keys(categories).length,
    subtopicCount: Object.keys(subtopics).length,
    learningPathCount,
    orphanCount: published.filter((entry) => (outgoing[entry.slug]?.length ?? 0) === 0 && backlinks[entry.slug].length === 0).length,
    noBacklinkCount: published.filter((entry) => backlinks[entry.slug].length === 0).length,
    formulaCount,
    mermaidCount,
    interactiveCount,
    categories,
    subtopics,
    recentlyUpdated: manifest.slice(0, 8).map((entry) => entry.slug),
  };

  return {
    manifest,
    graph: { nodes, edges, generatedAt: new Date().toISOString() },
    backlinks,
    outgoing,
    stats,
  };
}
