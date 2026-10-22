import { ArrowRight, ArrowUpRight, BookOpen, Boxes, MoveUpRight } from 'lucide-react';
import type { Project, ContentArticle, KnowledgeDomain } from '../types';
import { compactTitle } from '../lib/research';
import { useReaderState } from '../lib/useReaderState';
import { RESEARCH_WORKS } from '../data/researchWorks';
import { TOY_CASES } from '../data/toys';
import ResearchDiagram from './ResearchDiagram';
import StudioIllustration from './StudioIllustration';

const BASE = import.meta.env.BASE_URL;
interface HomeViewProps {
  projects: Project[]; knowledgeArticles: ContentArticle[]; knowledgeDomains: KnowledgeDomain[];
  onSelectProject: (project: Project) => void; setActiveTab: (tab: string) => void; lang: 'zh' | 'en';
}

export default function HomeView({ knowledgeArticles }: HomeViewProps) {
  const reader = useReaderState();
  const bySlug = new Map(knowledgeArticles.map(article=>[article.slug,article]));
  const recents = reader.recents.filter(entry=>bySlug.has(entry.slug)).slice(0,2);
  const toy = TOY_CASES[0];
  return <div className="studio-shell" id="home-view-container">
    <section className="studio-hero" aria-labelledby="studio-title">
      <div className="studio-hero-copy"><span className="studio-eyebrow"><i/> INDEPENDENT RESEARCH & EXPERIMENTS</span><h1 id="studio-title">让原理，<br/>成为可以运行的<em>系统。</em></h1><p>我是 Nite，探索实时物理、动画与控制系统。<br/>在这里记录原理、实现，以及让想法变得具体的小实验。</p><div className="studio-hero-foot"><span>UNREAL ENGINE</span><span>PHYSICS</span><span>ANIMATION</span></div></div>
      <div className="studio-hero-art"><StudioIllustration/><span className="studio-art-note">从一个问题出发，回到可以验证的实现。</span></div>
    </section>
    <nav className="studio-entry-strip" aria-label="探索网站"><a href={`${BASE}research/`}><span className="entry-index">01</span><div><strong>研究 <ArrowUpRight size={17}/></strong><span>工程实现与研究记录</span></div><Boxes size={21}/></a><a href={`${BASE}knowledge/`}><span className="entry-index">02</span><div><strong>知识 <ArrowUpRight size={17}/></strong><span>查找原理、推导与源码笔记</span></div><BookOpen size={21}/></a><a href={`${BASE}about/`}><span className="entry-index">03</span><div><strong>TOY <ArrowUpRight size={17}/></strong><span>动手体验，建立一点直觉</span></div><MoveUpRight size={22}/></a></nav>
    <section className="studio-section" aria-labelledby="research-heading"><div className="studio-section-heading"><div><span className="eyebrow">Selected work</span><h2 id="research-heading">精选研究</h2></div><a className="quiet-link" href={`${BASE}research/`}>全部研究 <ArrowRight size={15}/></a></div><div className="studio-work-grid">{RESEARCH_WORKS.map((work,index)=><a className="studio-work-card" key={work.id} href={`${BASE}${work.href}`}><div className="work-card-top"><span>{String(index+1).padStart(2,'0')} / {work.field}</span><ArrowUpRight size={16}/></div><div className={`studio-work-art art-${work.diagram}`}><ResearchDiagram kind={work.diagram}/></div><div className="studio-work-copy"><span className="work-kind">{work.kind}</span><h3>{work.name}</h3><p>{work.description}</p><div className="work-tags">{work.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div></a>)}</div></section>
    <div className="studio-bottom-grid">
      <section aria-labelledby="notes-heading"><div className="studio-section-heading"><div><span className="eyebrow">Notes & discoveries</span><h2 id="notes-heading">最近收录</h2></div><a className="quiet-link" href={`${BASE}knowledge/`}>全部笔记 <ArrowRight size={15}/></a></div><div className="studio-notes">{knowledgeArticles.slice(0,4).map((article,index)=><a className="studio-note" key={article.slug} href={`${BASE}knowledge/${article.slug}/`}><span className="note-number">{String(index+1).padStart(2,'0')}</span><div><span className="note-meta">{article.category}{article.subtopic?` / ${article.subtopic}`:''}</span><h3>{compactTitle(article.title)}</h3></div><ArrowUpRight size={16}/></a>)}</div></section>
      {toy&&<section className="studio-toy" aria-labelledby="toy-heading"><div className="studio-section-heading"><div><span className="eyebrow">A playground for ideas</span><h2 id="toy-heading">一点好玩的</h2></div><a className="quiet-link" href={`${BASE}about/`}>TOY <ArrowRight size={15}/></a></div><a className="studio-toy-card" href={`${BASE}${toy.href}`}><div className="studio-toy-cover" aria-hidden="true"><svg viewBox={toy.preview.viewBox} preserveAspectRatio="xMidYMid meet"><image href={`${BASE}${toy.preview.src}`} width={toy.preview.width} height={toy.preview.height}/></svg></div><div><span className="eyebrow">001 / {toy.category}</span><h3>{toy.accent && toy.title.endsWith(toy.accent) ? <>{toy.title.slice(0, -toy.accent.length)}<em>{toy.accent}</em></> : toy.title}</h3><span className="studio-toy-action">撕开一张全息通行证 <ArrowUpRight size={16}/></span></div></a></section>}
    </div>
    {recents.length>0&&<section className="studio-continue" aria-label="继续阅读"><span className="eyebrow">上次读到这里</span>{recents.map(entry=><a key={entry.slug} href={`${BASE}knowledge/${entry.slug}/`}>{compactTitle(bySlug.get(entry.slug)!.title)}<span>{Math.round(reader.progress[entry.slug]??0)}% <ArrowUpRight size={13}/></span></a>)}</section>}
  </div>;
}
