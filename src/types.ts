import type { ProjectCategory, ProjectStatus } from './lib/taxonomy';

// ---- Projects: 已完成或具有工程价值的系统 ----
export interface ProjectMetric {
  label: string;
  value: string;
}

export interface Project {
  id: string;
  title: string;
  category: ProjectCategory;
  status: ProjectStatus;
  year?: string; // release year shown on the card
  articleSlug: string; // slug of the knowledge article with the deep dive
  topicSlug?: string; // optional curated topic page for multi-article projects
  overview: string; // 项目概述
  architecture: string; // 技术架构
  challenges: string; // 核心难点
  solution: string; // 解决方案
  outcomes: string; // 项目成果
  references: string[]; // 参考资料
  tech: string[];
  metrics: ProjectMetric[];
  codeSnippet?: string;
  visualPrompt?: string; // optional descriptive text for visuals
  mediaUrl?: string; // Bilibili demo video — full URL (https://www.bilibili.com/video/BVxxxx) or bare bvid (BVxxxx)
}

export type ArticleTopicRole =
  | "theory"
  | "source"
  | "algorithm"
  | "comparison"
  | "practice"
  | "experiment";

export interface ArticleTopicRef {
  id: string;
  stage: string;
  role: ArticleTopicRole;
  order: number;
}

export type ArticleKind = ArticleTopicRole;
export type ArticleLevel = "foundation" | "intermediate" | "advanced";
export type ArticlePageType = "guide" | "concept" | "source-analysis" | "project" | "interactive";

export interface KnowledgeSource {
  title: string;
  url: string;
}

export interface KnowledgePath {
  id: string;
  title: string;
  description: string;
  articles: string[];
}

export interface KnowledgeDomain {
  id: string;
  categoryKey: string;
  title: string;
  excerpt: string;
  articleCount: number;
  subtopicCount: number;
  featured: string[];
  learningPaths: KnowledgePath[];
}

export interface ContentTopicSummary {
  id: string;
  title: string;
  excerpt: string;
  categoryKey: string;
  status: "active" | "planned" | "archived";
  stageCount: number;
  articleCount: number;
}

// ---- Shared runtime shape for Markdown-backed content (Knowledge) ----
// The knowledge loader returns objects satisfying this interface so
// ArticleViewer can render them.
export interface ContentArticle {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  date: string; // localized display string, e.g. "2026年5月14日"
  category: string; // localized display label
  categoryKey?: string; // raw enum key (e.g. "Physics"), for subtopic cascading lookup
  subtopic?: string; // localized subtopic label (e.g. "飞控系统")
  tags: string[];
  readTime?: string; // estimated reading time
  topics?: ArticleTopicRef[];
  kind?: ArticleKind;
  level?: ArticleLevel;
  prerequisites?: string[];
  nextArticles?: string[];
  aliases?: string[];
  pageType?: ArticlePageType;
  sources?: KnowledgeSource[];
  related?: string[];
  featured?: boolean;
  searchText?: string; // lowercased body text, lazily loaded for full-text search
}

export interface KnowledgeManifestEntry {
  slug: string;
  title: string;
  summary: string;
  category: string;
  categoryLabel: string;
  subtopic?: string;
  subtopicLabel?: string;
  tags: string[];
  aliases: string[];
  pageType: ArticlePageType;
  difficulty: ArticleLevel;
  updatedAt: string;
  readTime?: string;
  sources: KnowledgeSource[];
  related: string[];
  featured: boolean;
  url: string;
}

export interface KnowledgeGraphNode {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  categoryLabel: string;
  pageType: ArticlePageType | "topic";
  url: string;
  degree: number;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  type: "link" | "prerequisite" | "next" | "related" | "topic";
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  generatedAt: string;
}

export interface KnowledgeStats {
  articleCount: number;
  categoryCount: number;
  subtopicCount: number;
  learningPathCount: number;
  orphanCount: number;
  noBacklinkCount: number;
  formulaCount: number;
  mermaidCount: number;
  interactiveCount: number;
  categories: Record<string, number>;
  subtopics: Record<string, number>;
  recentlyUpdated: string[];
}

// ---- Skill matrix (Archive) ----
export interface SkillCategory {
  name: string;
  skills: { name: string; details: string }[];
}
