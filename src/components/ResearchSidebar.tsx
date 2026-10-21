import { ArrowUpRight, BookOpen, Bookmark, Clock3, Network } from 'lucide-react';
import type { ContentArticle, KnowledgeDomain } from '../types';
import { useReaderState } from '../lib/useReaderState';
import { readingGroups, articleHref } from '../lib/readingOrder';

const BASE = import.meta.env.BASE_URL;

export default function ResearchSidebar({ articles }: { domains: KnowledgeDomain[]; articles: ContentArticle[] }) {
  const groups = readingGroups(articles);
  const reader = useReaderState();
  const visible = new Set(articles.map((article) => article.slug));
  const favorites = reader.favorites.filter((slug) => visible.has(slug)).length;
  const recents = reader.recents.filter((entry) => visible.has(entry.slug)).length;
  return (
    <aside className="research-sidebar" aria-label="研究导航">
      <div className="sidebar-group">
        <span className="eyebrow">浏览</span>
        <a className="sidebar-link" href={`${BASE}knowledge/`}><BookOpen size={16} />知识库<span>{articles.length}</span></a>
        <a className="sidebar-link" href={`${BASE}knowledge/library/`}>全部文档</a>
        <a className="sidebar-link" href={`${BASE}knowledge/graph/`}><Network size={16} />知识图谱<ArrowUpRight size={12} /></a>
      </div>
      <div className="sidebar-group">
        <span className="eyebrow">文档分组</span>
        {groups.map(group => <a className="sidebar-link" key={group.id} href={articleHref(group.sections[0].articles[0].slug)}><span className="domain-mark" aria-hidden="true" />{group.title}<span>{group.sections.reduce((n, section) => n + section.articles.length, 0)}</span></a>)}
      </div>
      <div className="sidebar-group">
        <span className="eyebrow">我的阅读</span>
        <a className="sidebar-link" href={`${BASE}knowledge/library/?scope=favorites`}><Bookmark size={16} />收藏<span>{favorites}</span></a>
        <a className="sidebar-link" href={`${BASE}knowledge/library/?scope=recents`}><Clock3 size={16} />最近阅读<span>{recents}</span></a>
      </div>
      <p className="sidebar-note">阅读记录仅保存在当前浏览器。</p>
    </aside>
  );
}
