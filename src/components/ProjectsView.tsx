import { ArrowUpRight } from 'lucide-react';
import type { ContentArticle, KnowledgeDomain, Project } from '../types';
import type { ProjectStatus } from '../lib/taxonomy';
import { projectStatusZh } from '../lib/taxonomy';
import { RESEARCH_WORKS } from '../data/researchWorks';
import ResearchDiagram from './ResearchDiagram';

const BASE = import.meta.env.BASE_URL;
export const STATUS_BADGE: Record<ProjectStatus,string> = {completed:'text-accent-primary',experimental:'text-accent-secondary',archived:'text-text-faint'};
interface ProjectsViewProps { projects:Project[];articles:ContentArticle[];domains:KnowledgeDomain[];onSelectProject:(project:Project)=>void;lang:'zh'|'en'; }

export default function ProjectsView({projects,onSelectProject}:ProjectsViewProps) {
  return <div className="studio-shell studio-research" id="projects-view-container"><header className="studio-page-intro"><span className="studio-eyebrow"><i/> WORK & RESEARCH</span><h1>在问题与实现之间，<br/><em>持续探索。</em></h1><p>自主项目、算法研究与源码阅读。<br/>记录系统如何工作，也保留取舍与验证的边界。</p></header>
    <div className="studio-section-heading"><div><span className="eyebrow">Systems & ideas</span><h2>研究记录</h2></div><span className="eyebrow">{String(RESEARCH_WORKS.length).padStart(2,'0')} SELECTED WORKS</span></div>
    <div className="studio-research-list">{RESEARCH_WORKS.map((work,index)=><a href={`${BASE}${work.href}`} className="studio-research-row" key={work.id}><div className={`studio-work-art art-${work.diagram}`}><ResearchDiagram kind={work.diagram}/><span className="research-art-number">{String(index+1).padStart(2,'0')}</span></div><div className="research-row-copy"><span className="eyebrow">{work.kind} / {work.field}</span><h2>{work.name}</h2><h3>{work.title}</h3><p>{work.description}</p><div className="work-tags">{work.tags.map(tag=><span key={tag}>{tag}</span>)}</div><span className="research-row-action">阅读研究记录 <ArrowUpRight size={16}/></span></div></a>)}</div>
    <section className="studio-section"><div className="studio-section-heading"><div><span className="eyebrow">Further explorations</span><h2>交互与源码专题</h2></div><a className="quiet-link" href={`${BASE}knowledge/`}>查阅相关知识 <ArrowUpRight size={15}/></a></div><div className="studio-project-grid">{projects.map(project=><button className="studio-project-card" key={project.id} onClick={()=>onSelectProject(project)}><div className="work-card-top"><span>{project.topicSlug?'源码专题':'交互实验'} / {project.year}</span><ArrowUpRight size={17}/></div><h3>{project.title}</h3><p>{project.overview}</p><span className="project-status">{projectStatusZh(project.status)}</span></button>)}</div></section>
  </div>;
}
