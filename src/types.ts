import type { ProjectCategory } from './lib/taxonomy';

// ---- Projects: 已完成或具有工程价值的系统 ----
export interface ProjectMetric {
  label: string;
  value: string;
}

export interface Project {
  id: string;
  title: string;
  category: ProjectCategory;
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
  mediaUrl?: string;
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
  html: string; // pre-rendered HTML (Markdown + KaTeX)
  searchText: string; // plain-text body for search
}

// ---- Skill matrix (Archive) ----
export interface SkillCategory {
  name: string;
  skills: { name: string; proficiency: number; details: string }[];
}

// ---- Career timeline (Archive) ----
export interface TimelineEvent {
  year: string;
  role: string;
  company: string;
  project: string; // 涉及项目
  description: string;
  outcomes: string[]; // 成果
  highlights: string[];
}
