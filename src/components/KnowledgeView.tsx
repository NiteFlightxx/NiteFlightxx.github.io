import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { ArrowUpRight, BookOpen, Bookmark, Clock3, Grid2X2, List, Network, Search, X } from 'lucide-react';
import type { ContentArticle } from '../types';
import { KNOWLEDGE_CATEGORIES } from '../lib/taxonomy';
import { highlight } from '../lib/highlight';
import { compactTitle } from '../lib/research';
import { useReaderState } from '../lib/useReaderState';
import KnowledgeTree from './KnowledgeTree';

const BASE = import.meta.env.BASE_URL;
type Scope = 'all' | 'favorites' | 'recents';
type SortMode = 'date' | 'title' | 'recommended';
interface KnowledgeViewProps { articles: ContentArticle[]; lang: 'zh' | 'en'; }

export default function KnowledgeView({ articles }: KnowledgeViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [subtopic, setSubtopic] = useState('all');
  const [scope, setScope] = useState<Scope>('all');
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [sort, setSort] = useState<SortMode>('date');
  const [difficulty, setDifficulty] = useState('all');
  const [contentType, setContentType] = useState('all');
  const [bodyIndex, setBodyIndex] = useState<Record<string, string>>({});
  const reader = useReaderState();

  useEffect(() => {
    const sync = () => {
      const selected = new URLSearchParams(window.location.search).get('scope');
      setScope(selected === 'favorites' || selected === 'recents' ? selected : 'all');
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (!query.trim() || Object.keys(bodyIndex).length > 0) return;
    const controller = new AbortController();
    fetch(BASE + 'knowledge-index.json', { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Record<string, string>> : {})
      .then(setBodyIndex)
      .catch(() => { /* metadata search stays available */ });
    return () => controller.abort();
  }, [query, bodyIndex]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    articles.forEach((article) => counts.set(article.category, (counts.get(article.category) ?? 0) + 1));
    const order: string[] = ['物理', '动画', '数学', ...Object.values(KNOWLEDGE_CATEGORIES)];
    return [...counts.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [articles]);
  const subtopics = useMemo(() => [...new Set(articles.filter((article) => category === 'all' || article.category === category).map((article) => article.subtopic).filter((value): value is string => Boolean(value)))], [articles, category]);
  const fuse = useMemo(() => new Fuse(articles.map((article) => ({ ...article, searchText: bodyIndex[article.slug] ?? '' })), {
    keys: [{ name: 'title', weight: .45 }, { name: 'aliases', weight: .25 }, { name: 'tags', weight: .15 }, { name: 'excerpt', weight: .1 }, { name: 'searchText', weight: .05 }],
    threshold: .38, ignoreLocation: true,
  }), [articles, bodyIndex]);
  const recentOrder = useMemo(() => new Map(reader.recents.map((entry, index) => [entry.slug, index])), [reader.recents]);
  // The loader has already sorted by the real date; do not sort localized date strings.
  const dateOrder = useMemo(() => new Map(articles.map((article, index) => [article.slug, index])), [articles]);
  const visibleSlugs = useMemo(() => new Set(articles.map((article) => article.slug)), [articles]);
  const filtered = useMemo(() => {
    let result = query.trim() ? fuse.search(query.trim()).map((item) => item.item) : [...articles];
    if (scope === 'favorites') result = result.filter((article) => reader.favorites.includes(article.slug));
    if (scope === 'recents') result = result.filter((article) => recentOrder.has(article.slug));
    if (category !== 'all') result = result.filter((article) => article.category === category);
    if (subtopic !== 'all') result = result.filter((article) => article.subtopic === subtopic);
    if (difficulty !== 'all') result = result.filter((article) => article.level === difficulty);
    if (contentType !== 'all') result = result.filter((article) => article.pageType === contentType);
    return result.sort((a, b) => {
      if (scope === 'recents') return (recentOrder.get(a.slug) ?? 999) - (recentOrder.get(b.slug) ?? 999);
      if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      if (sort === 'recommended') return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
      if (query.trim()) return 0; // retain Fuse relevance within the filtered set
      return (dateOrder.get(a.slug) ?? 0) - (dateOrder.get(b.slug) ?? 0);
    });
  }, [articles, bodyIndex, category, contentType, dateOrder, difficulty, fuse, query, reader.favorites, recentOrder, scope, sort, subtopic]);
  const chooseCategory = (value: string) => { setCategory(value); setSubtopic('all'); };
  const chooseScope = (value: Scope) => {
    setScope(value);
    const url = new URL(window.location.href);
    if (value === 'all') url.searchParams.delete('scope'); else url.searchParams.set('scope', value);
    history.pushState(null, '', url);
  };
  const resetFilters = () => { setQuery(''); chooseCategory('all'); setDifficulty('all'); setContentType('all'); chooseScope('all'); };
  const scopes = [
    { id: 'all' as const, icon: BookOpen, label: '全部知识', count: articles.length },
    { id: 'favorites' as const, icon: Bookmark, label: '我的收藏', count: reader.favorites.filter((slug) => visibleSlugs.has(slug)).length },
    { id: 'recents' as const, icon: Clock3, label: '最近阅读', count: reader.recents.filter((entry) => visibleSlugs.has(entry.slug)).length },
  ];

  return (
    <div className="workspace-shell knowledge-browser">
      <aside className="browser-sidebar">
        <div className="sidebar-group"><span className="eyebrow">我的知识</span>{scopes.map(({ id, icon: Icon, label, count }) => <button type="button" className="sidebar-link" aria-pressed={scope === id} onClick={() => chooseScope(id)} key={id}><Icon size={16} />{label}<span>{count}</span></button>)}</div>
        <a className="sidebar-link" href={`${BASE}knowledge/`}>← 返回文档阅读</a>
        <KnowledgeTree articles={articles} showQuickLinks={false} />
        <a className="sidebar-link graph-sidebar-link" href={BASE + 'knowledge/graph/'}><Network size={16} />知识图谱<ArrowUpRight size={13} /></a>
        <p className="sidebar-note">收藏与阅读记录仅保存在当前浏览器。</p>
      </aside>
      <div className="workspace-main">
        <header className="page-heading"><div><span className="eyebrow">Document index</span><h1>{scope === 'favorites' ? '我的收藏' : scope === 'recents' ? '最近阅读' : '全部文档'}</h1><p>{articles.length} 篇文档 · {categories.length} 个领域</p></div><a className="quiet-link" href={BASE + 'knowledge/graph/'}><Network size={15} />知识图谱<ArrowUpRight size={14} /></a></header>
        <div className="browser-mobile-scopes">{scopes.map(({ id, label, count }) => <button key={id} type="button" aria-pressed={scope === id} onClick={() => chooseScope(id)}>{label}<span>{count}</span></button>)}</div>
        <label className="browser-search"><Search size={18} /><span className="sr-only">搜索知识库</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文、标签或 UE 类型…" />{query && <button type="button" aria-label="清除关键词" onClick={() => setQuery('')}><X size={16} /></button>}</label>
        <div className="browser-categories"><button type="button" aria-pressed={category === 'all'} onClick={() => chooseCategory('all')}>全部领域<span>{articles.length}</span></button>{categories.map(([name, count]) => <button type="button" key={name} aria-pressed={category === name} onClick={() => chooseCategory(name)}>{name}<span>{count}</span></button>)}</div>
        {category !== 'all' && <div className="browser-subtopics"><button type="button" aria-pressed={subtopic === 'all'} onClick={() => setSubtopic('all')}>全部子主题</button>{subtopics.map((name) => <button type="button" key={name} aria-pressed={subtopic === name} onClick={() => setSubtopic(name)}>{name}</button>)}</div>}
        <div className="browser-toolbar">
          <span className="browser-result-count" role="status">{filtered.length} 篇内容</span>
          <div className="browser-controls">
            <select aria-label="按难度筛选" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">全部难度</option><option value="foundation">基础</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select>
            <select aria-label="按内容类型筛选" value={contentType} onChange={(event) => setContentType(event.target.value)}><option value="all">全部类型</option><option value="guide">指南</option><option value="concept">概念</option><option value="source-analysis">源码分析</option><option value="project">项目</option><option value="interactive">交互演示</option></select>
            <select aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="date">{query.trim() ? '相关度优先' : '最近收录'}</option><option value="recommended">推荐优先</option><option value="title">标题排序</option></select>
            <div className="view-toggle"><button type="button" aria-label="列表视图" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} /></button><button type="button" aria-label="卡片视图" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><Grid2X2 size={16} /></button></div>
          </div>
        </div>
        {filtered.length === 0 ? <div className="browser-empty"><BookOpen size={26} /><h2>{scope === 'favorites' ? '尚无匹配的收藏' : scope === 'recents' ? '尚无匹配的阅读记录' : '没有找到匹配内容'}</h2><p>{scope === 'favorites' ? '可以在文章页收藏内容，或调整当前筛选。' : '尝试其他关键词，或浏览全部知识。'}</p><button type="button" onClick={resetFilters}>浏览全部知识<ArrowUpRight size={14} /></button></div> :
          <div className={'browser-results ' + (view === 'cards' ? 'browser-card-view' : 'browser-list-view')}>
            {filtered.map((article) => <a className="browser-article" key={article.slug} href={BASE + 'knowledge/' + article.slug + '/'}>
              <div className="browser-article-main"><span className="note-meta">{article.category}{article.subtopic ? ' / ' + article.subtopic : ''}</span><h2>{highlight(compactTitle(article.title), query)}</h2>{article.excerpt && <p>{highlight(article.excerpt, query)}</p>}<div className="browser-article-tags">{article.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
              <div className="browser-article-end"><span>{article.date}</span><span>{article.readTime}</span><ArrowUpRight size={16} /></div>
            </a>)}
          </div>}
      </div>
    </div>
  );
}
