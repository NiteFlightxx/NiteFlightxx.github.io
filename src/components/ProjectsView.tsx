import { ArrowUpRight } from 'lucide-react';
import type { ContentArticle, KnowledgeDomain, Project } from '../types';
import type { ProjectStatus } from '../lib/taxonomy';
import { projectStatusZh } from '../lib/taxonomy';
import { RESEARCH_WORKS } from '../data/researchWorks';
import ResearchCards from './ResearchCards';
import BorderGlow from './effects/BorderGlow';

const BASE = import.meta.env.BASE_URL;
export const STATUS_BADGE: Record<ProjectStatus,string> = {completed:'text-accent-primary',experimental:'text-accent-secondary',archived:'text-text-faint'};
interface ProjectsViewProps { projects:Project[];articles:ContentArticle[];domains:KnowledgeDomain[];onSelectProject:(project:Project)=>void;lang:'zh'|'en'; }

export default function ProjectsView({projects,articles,onSelectProject}:ProjectsViewProps) {
  return <div className="studio-shell studio-research" id="projects-view-container"><header className="studio-page-intro"><h1>项目与研究</h1><p>物理仿真、动画与控制系统的实现记录。</p></header>
    <div className="studio-section-heading"><div><h2>研究记录</h2></div><span className="eyebrow">{RESEARCH_WORKS.length} 项研究</span></div>
    <ResearchCards articles={articles}/>
    <section className="studio-section"><div className="studio-section-heading"><div><h2>交互与源码专题</h2></div><a className="quiet-link" href={`${BASE}knowledge/`}>查阅相关知识 <ArrowUpRight size={15}/></a></div><div className="studio-project-grid">{projects.map(project=><BorderGlow as="button" type="button" borderRadius={12} className="studio-project-card" key={project.id} onClick={()=>onSelectProject(project)}><div className="work-card-top"><span>{project.topicSlug?'源码专题':'交互实验'} / {project.year}</span><ArrowUpRight size={17}/></div><h3>{project.title}</h3><p>{project.overview}</p><span className="project-status">{projectStatusZh(project.status)}</span></BorderGlow>)}</div></section>
  </div>;
}
