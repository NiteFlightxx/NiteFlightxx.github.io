import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ContentArticle, KnowledgeDomain, Project } from '../types';
import type { ProjectStatus } from '../lib/taxonomy';
import { projectStatusZh } from '../lib/taxonomy';
import { compactTitle, getResearchAreas } from '../lib/research';
import ResearchDiagram from './ResearchDiagram';
import ResearchSidebar from './ResearchSidebar';

const BASE = import.meta.env.BASE_URL;
export const STATUS_BADGE: Record<ProjectStatus, string> = {
  completed: 'bg-accent-primary/15 text-accent-primary border-accent-primary/30',
  experimental: 'bg-accent-secondary/15 text-accent-secondary border-accent-secondary/30',
  archived: 'bg-text-faint/10 text-text-faint border-text-faint/25',
};

interface ProjectsViewProps {
  projects: Project[];
  articles: ContentArticle[];
  domains: KnowledgeDomain[];
  onSelectProject: (project: Project) => void;
  lang: 'zh' | 'en';
}

export default function ProjectsView({ projects, articles, domains, onSelectProject }: ProjectsViewProps) {
  const areas = getResearchAreas(articles, domains);
  return (
    <div className="workspace-shell" id="projects-view-container">
      <ResearchSidebar domains={domains} articles={articles} />
      <div className="workspace-main">
        <header className="page-heading"><div><span className="eyebrow">Research index</span><h1>研究专题</h1><p>按研究问题组织原理、源码与实践。</p></div></header>
        <div className="research-index">
          {areas.map((area) => <section className="research-index-section" key={area.id} id={area.id}>
            <div className="research-index-intro"><span className="eyebrow">{area.number} / {area.label}</span><h2>{area.title}</h2><p>{area.description}</p><ResearchDiagram kind={area.id} />{area.domain && <a className="quiet-link" href={BASE + 'knowledge/domain/' + area.domain.id + '/'}>阅读相关文档<ArrowRight size={14} /></a>}</div>
            <div className="research-index-articles">{area.articles.map((article, index) => <a key={article.slug} href={BASE + 'knowledge/' + article.slug + '/'}><span className="note-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{compactTitle(article.title)}</h3><p>{article.excerpt}</p></div><ArrowUpRight size={16} /></a>)}</div>
          </section>)}
        </div>
        <section className="home-section">
          <div className="section-heading"><h2>项目与实验</h2><span className="eyebrow">{projects.length} 项</span></div>
          <div className="project-index">{projects.map((project) => <button type="button" key={project.id} className="project-index-card" onClick={() => onSelectProject(project)}>
            <div className="project-index-meta"><span className={'rounded border px-2 py-1 text-[10px] ' + STATUS_BADGE[project.status]}>{projectStatusZh(project.status)}</span><span>{project.year}</span><ArrowUpRight size={16} /></div>
            <h3>{project.title}</h3><p>{project.overview}</p><div className="research-keywords">{project.tech.map((tech) => <span key={tech}>{tech}</span>)}</div>
          </button>)}</div>
        </section>
      </div>
    </div>
  );
}
