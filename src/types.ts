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
  searchText?: string; // lowercased body text, lazily loaded for full-text search
}

// ---- Skill matrix (Archive) ----
export interface SkillCategory {
  name: string;
  skills: { name: string; details: string }[];
}
