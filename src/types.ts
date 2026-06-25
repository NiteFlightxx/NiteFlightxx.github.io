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

// ---- Shared runtime shape for Markdown-backed content (Knowledge + Lab) ----
// Both loaders return objects satisfying this interface so ArticleViewer can be
// reused for both knowledge articles and lab experiments.
export interface ContentArticle {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  date: string; // localized display string, e.g. "2026年5月14日"
  category: string; // localized display label
  tags: string[];
  readTime?: string; // Knowledge has it; Lab does not
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
