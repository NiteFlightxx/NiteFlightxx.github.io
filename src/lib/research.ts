import type { ContentArticle, KnowledgeDomain } from '../types';

// Curated entry points into existing public articles, not research-status claims.
const RESEARCH_AREAS = [
  {
    id: 'physics', number: '01', title: '实时物理', label: 'Physics & simulation',
    description: '碰撞检测、约束求解与 GPU 仿真。', keywords: ['AVBD', 'Chaos', 'GPU'],
    slugs: ['vbd-avbd-math', 'three-avbd-gpu-solver', 'gpu-physics-plugin', 'collision-detection-gjk-epa-sat', 'ue-chaos-physics-engine'],
  },
  {
    id: 'animation', number: '02', title: '动画系统', label: 'Animation systems',
    description: '姿态搜索、逆运动学与角色运动。', keywords: ['Motion Matching', 'IK'],
    slugs: ['motion-matching-pose-search-source-guide', 'predictive-foot-ik', 'ue-fullbody-ik-math', 'ue-animation-node-math', 'ik-retargeter-ops-math'],
  },
  {
    id: 'flight', number: '03', title: '飞行控制', label: 'Dynamics & control',
    description: '四旋翼动力学、控制算法与仿真实践。', keywords: ['PID', 'MPCC', 'AircraftLab'],
    slugs: ['quadcopter-flight-control-math', 'quadcopter-basics-interactive'],
  },
] as const;

export function getResearchAreas(articles: ContentArticle[], domains: KnowledgeDomain[] = []) {
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  return RESEARCH_AREAS.map((area) => ({
    ...area,
    articles: area.slugs.flatMap((slug) => bySlug.has(slug) ? [bySlug.get(slug)!] : []),
    domain: domains.find((domain) => domain.id === area.id),
  })).filter((area) => area.articles.length > 0);
}

/** Compact display labels; canonical titles and URLs stay untouched. */
export function compactTitle(title: string): string {
  return title.split(/\s+—\s+/)[0].replace(/详解$/, '').trim();
}

export function domainLabel(title: string): string {
  return title.replace(/知识$/, '');
}

export function researchDomains(domains: KnowledgeDomain[]): KnowledgeDomain[] {
  const priority = ['Physics', 'Animation', 'Mathematics', 'Engine'];
  const rank = (key: string) => priority.includes(key) ? priority.indexOf(key) : priority.length;
  return [...domains].filter((domain) => domain.articleCount > 0).sort((a, b) => rank(a.categoryKey) - rank(b.categoryKey));
}
