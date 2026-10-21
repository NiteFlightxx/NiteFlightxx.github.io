import { ArrowUpRight, BookOpen, Bookmark, Clock3, Network } from 'lucide-react';
import type { ContentArticle, KnowledgeDomain } from '../types';
import { domainLabel, researchDomains } from '../lib/research';
import { useReaderState } from '../lib/useReaderState';

const BASE = import.meta.env.BASE_URL;

export default function ResearchSidebar({ domains, articles }: { domains: KnowledgeDomain[]; articles: ContentArticle[] }) {
  const reader = useReaderState();
  const visible = new Set(articles.map((article) => article.slug));
  const favorites = reader.favorites.filter((slug) => visible.has(slug)).length;
  const recents = reader.recents.filter((entry) => visible.has(entry.slug)).length;
  return (
    <aside className="research-sidebar" aria-label="研究导航">
      <div className="sidebar-group">
        <span className="eyebrow">浏览</span>
        <a className="sidebar-link" href={`${BASE}knowledge/`}><BookOpen size={16} />全部知识<span>{articles.length}</span></a>
        <a className="sidebar-link" href={`${BASE}knowledge/graph/`}><Network size={16} />知识图谱<ArrowUpRight size={12} /></a>
      </div>
      <div className="sidebar-group">
        <span className="eyebrow">知识领域</span>
        {researchDomains(domains).map((domain) => (
          <a className="sidebar-link" key={domain.id} href={`${BASE}knowledge/domain/${domain.id}/`}><span className="domain-mark" aria-hidden="true" />{domainLabel(domain.title)}<span>{domain.articleCount}</span></a>
        ))}
      </div>
      <div className="sidebar-group">
        <span className="eyebrow">我的阅读</span>
        <a className="sidebar-link" href={`${BASE}knowledge/?scope=favorites`}><Bookmark size={16} />收藏<span>{favorites}</span></a>
        <a className="sidebar-link" href={`${BASE}knowledge/?scope=recents`}><Clock3 size={16} />最近阅读<span>{recents}</span></a>
      </div>
      <p className="sidebar-note">阅读记录仅保存在当前浏览器。</p>
    </aside>
  );
}
