import { ArrowRight, ArrowUpRight, BookOpen, Search } from 'lucide-react';
import type { Project, ContentArticle, KnowledgeDomain } from '../types';
import { compactTitle, getResearchAreas } from '../lib/research';
import { readingGroups, articleHref } from '../lib/readingOrder';
import { useReaderState } from '../lib/useReaderState';
import ResearchSidebar from './ResearchSidebar';
import ResearchDiagram from './ResearchDiagram';

const BASE = import.meta.env.BASE_URL;

interface HomeViewProps {
  projects: Project[];
  knowledgeArticles: ContentArticle[];
  knowledgeDomains: KnowledgeDomain[];
  onSelectProject: (project: Project) => void;
  setActiveTab: (tab: string) => void;
  lang: 'zh' | 'en';
}

export default function HomeView({ projects, knowledgeArticles, knowledgeDomains, onSelectProject }: HomeViewProps) {
  const areas = getResearchAreas(knowledgeArticles, knowledgeDomains);
  const groups = readingGroups(knowledgeArticles);
  const reader = useReaderState();
  const bySlug = new Map(knowledgeArticles.map((article) => [article.slug, article]));
  const recents = reader.recents.filter((entry) => bySlug.has(entry.slug)).slice(0, 3);

  return (
    <div className="workspace-shell" id="home-view-container">
      <ResearchSidebar domains={knowledgeDomains} articles={knowledgeArticles} />
      <div className="workspace-main">
        <header className="page-heading">
          <div><span className="eyebrow">Research notebook</span><h1>研究概览</h1><p>实时物理 · 动画系统 · 工程数学</p></div>
          <a className="quiet-link" href={BASE + 'knowledge/'}>浏览知识库<ArrowUpRight size={15} /></a>
        </header>

        <button className="home-search" type="button" onClick={() => window.dispatchEvent(new Event('nite:open-command-palette'))}>
          <Search size={19} /><span>查找概念、源码与研究笔记</span><kbd>Ctrl / ⌘ K</kbd>
        </button>

        <section aria-labelledby="research-heading" className="home-section">
          <div className="section-heading"><h2 id="research-heading">研究方向</h2><a className="quiet-link" href={BASE + '#projects'}>全部专题<ArrowRight size={14} /></a></div>
          <div className="research-cards">
            {areas.map((area) => (
              <a className="research-card" key={area.id} href={area.domain ? BASE + 'knowledge/domain/' + area.domain.id + '/' : BASE + 'knowledge/' + area.articles[0].slug + '/'}>
                <div className="research-card-top"><span className="eyebrow">{area.number} / {area.label}</span><ArrowUpRight size={16} /></div>
                <ResearchDiagram kind={area.id} />
                <div><h3>{area.title}</h3><p>{area.description}</p><div className="research-keywords">{area.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div></div>
              </a>
            ))}
          </div>
        </section>

        <div className="home-reading-grid">
          <section aria-labelledby="notes-heading" className="home-section">
            <div className="section-heading"><h2 id="notes-heading">最近收录</h2><a className="quiet-link" href={BASE + 'knowledge/library/'}>全部文章<ArrowRight size={14} /></a></div>
            <div className="note-list">
              {knowledgeArticles.slice(0, 6).map((article, index) => (
                <a key={article.slug} className="note-row" href={BASE + 'knowledge/' + article.slug + '/'}>
                  <span className="note-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="note-copy"><span className="note-meta">{article.category}{article.subtopic ? ' / ' + article.subtopic : ''}</span><h3>{compactTitle(article.title)}</h3>{article.excerpt && <p>{article.excerpt}</p>}</div>
                  <div className="note-end"><span>{article.date}</span><ArrowUpRight size={16} /></div>
                </a>
              ))}
            </div>
          </section>

          <aside className="home-context">
            {recents.length > 0 && <section className="context-section" aria-labelledby="continue-heading">
              <div className="section-heading"><h2 id="continue-heading">继续阅读</h2><a className="quiet-link" href={BASE + 'knowledge/library/?scope=recents'}>历史<ArrowRight size={13} /></a></div>
              {recents.map((entry) => {
                const article = bySlug.get(entry.slug)!;
                const progress = Math.round(Math.max(0, Math.min(100, reader.progress[entry.slug] ?? 0)));
                return <a className="continue-entry" key={entry.slug} href={BASE + 'knowledge/' + article.slug + '/'}><span>{compactTitle(article.title)}</span><div className="continue-progress"><div style={{ width: progress + '%' }} /></div><small>已读 {progress}%</small></a>;
              })}
            </section>}
            <section className="context-section" aria-labelledby="paths-heading">
              <div className="section-heading"><h2 id="paths-heading">顺序阅读</h2><BookOpen size={15} /></div>
              {groups.slice(0, 3).map(group => <a className="path-link" key={group.id} href={articleHref(group.sections[0].articles[0].slug)}><div><h3>{group.title}</h3><span>{group.sections.reduce((n, section) => n + section.articles.length, 0)} 篇文档</span></div><ArrowUpRight size={14} /></a>)}
            </section>
            {projects.length > 0 && <section className="context-section" aria-labelledby="projects-heading">
              <div className="section-heading"><h2 id="projects-heading">项目与实验</h2></div>
              {projects.map((project) => <button type="button" className="path-link" key={project.id} onClick={() => onSelectProject(project)}><div><h3>{project.title}</h3><span>{project.tech.slice(0, 2).join(' / ')}</span></div><ArrowUpRight size={14} /></button>)}
            </section>}
          </aside>
        </div>
      </div>
    </div>
  );
}
