import React, { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { ArrowRight, BookOpen, Clock3, Grid2X2, List, Network, Search, SlidersHorizontal, Star } from 'lucide-react';
import type { ContentArticle } from '../types';
import { KNOWLEDGE_CATEGORIES } from '../lib/taxonomy';
import { highlight } from '../lib/highlight';
import { readReaderState, READER_STATE_EVENT } from '../lib/readerState';
import KnowledgeTree from './KnowledgeTree';

const BASE_URL = import.meta.env.BASE_URL;
type Scope = 'all' | 'favorites' | 'recents';
type ViewMode = 'cards' | 'list';
type SortMode = 'updated' | 'title' | 'recommended';

interface KnowledgeViewProps { articles: ContentArticle[]; lang: 'zh' | 'en'; }

export default function KnowledgeView({ articles }: KnowledgeViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [subtopic, setSubtopic] = useState('all');
  const [scope, setScope] = useState<Scope>('all');
  const [view, setView] = useState<ViewMode>('cards');
  const [sort, setSort] = useState<SortMode>('updated');
  const [difficulty, setDifficulty] = useState('all');
  const [contentType, setContentType] = useState('all');
  const [readerVersion, setReaderVersion] = useState(0);
  const [bodyIndex, setBodyIndex] = useState<Record<string, string>>({});

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('scope');
    if (selected === 'favorites' || selected === 'recents') setScope(selected);
    const sync = () => setReaderVersion((value) => value + 1);
    window.addEventListener(READER_STATE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(READER_STATE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  useEffect(() => {
    if (!query.trim() || Object.keys(bodyIndex).length > 0) return;
    fetch(`${BASE_URL}knowledge-index.json`)
      .then((response) => response.ok ? response.json() as Promise<Record<string, string>> : {})
      .then(setBodyIndex)
      .catch(() => setBodyIndex({}));
  }, [query, bodyIndex]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    articles.forEach((article) => counts.set(article.category, (counts.get(article.category) ?? 0) + 1));
    const canonical: string[] = Object.values(KNOWLEDGE_CATEGORIES);
    return [...counts.entries()].sort((a, b) => canonical.indexOf(a[0]) - canonical.indexOf(b[0]));
  }, [articles]);

  const subtopics = useMemo(() => {
    const counts = new Map<string, number>();
    articles.filter((article) => category === 'all' || article.category === category).forEach((article) => {
      const name = article.subtopic ?? '其他';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return [...counts.entries()];
  }, [articles, category]);

  const searchable = useMemo(() => articles.map((article) => ({ ...article, searchText: bodyIndex[article.slug] ?? '' })), [articles, bodyIndex]);
  const fuse = useMemo(() => new Fuse(searchable, {
    keys: [{ name: 'title', weight: 0.45 }, { name: 'aliases', weight: 0.25 }, { name: 'tags', weight: 0.15 }, { name: 'excerpt', weight: 0.1 }, { name: 'searchText', weight: 0.05 }],
    threshold: 0.38,
    ignoreLocation: true,
  }), [searchable]);

  const reader = useMemo(() => readReaderState(), [readerVersion]);
  const recentOrder = useMemo(() => new Map(reader.recents.map((item, index) => [item.slug, index])), [reader]);
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
      return b.date.localeCompare(a.date);
    });
  }, [articles, category, contentType, difficulty, fuse, query, reader, recentOrder, scope, sort, subtopic]);

  const chooseCategory = (value: string) => { setCategory(value); setSubtopic('all'); };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pb-20 pt-8 md:px-6">
      <section className="mb-8 overflow-hidden rounded-2xl border border-border-subtle bg-surface-card/70 p-6 md:p-9">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <span className="font-mono text-[10px] uppercase tracking-[.25em] text-accent-primary">Knowledge workspace</span>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-text-muted">收录 Unreal Engine 源码解析、实时物理、动画系统与工程数学专题，重点呈现实现链路、数学依据与可复现的实验结论。</p>
          </div>
          <a href={`${BASE_URL}knowledge/graph/`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent-primary/30 bg-accent-primary/10 px-5 py-3 text-sm font-bold text-accent-primary hover:bg-accent-primary/15"><Network className="h-4 w-4" />打开知识图谱</a>
        </div>
        <label className="mt-7 flex max-w-3xl items-center gap-3 rounded-xl border border-border-strong bg-surface-base/70 px-4 py-3 focus-within:border-accent-primary/50">
          <Search className="h-4 w-4 text-accent-primary" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文、UE 类型、标签或别名…" className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-faint" /><kbd className="hidden rounded border border-border-subtle px-2 py-1 font-mono text-[9px] text-text-faint sm:block">Ctrl K</kbd>
        </label>
      </section>

      <div className="grid gap-7 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <KnowledgeTree articles={articles} />
          <section className="rounded-xl border border-border-subtle bg-surface-card/60 p-4">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-text-faint"><SlidersHorizontal className="h-3.5 w-3.5" />阅读视图</div>
            <div className="grid grid-cols-3 gap-2">
              {([['all', BookOpen, '全部', articles.length], ['favorites', Star, '收藏', reader.favorites.length], ['recents', Clock3, '最近', reader.recents.length]] as const).map(([key, Icon, label, count]) => (
                <button key={key} onClick={() => setScope(key)} className={`rounded-lg border px-2 py-2 text-center ${scope === key ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}><Icon className="mx-auto h-3.5 w-3.5" /><span className="mt-1 block text-[9px]">{label} {count}</span></button>
              ))}
            </div>
          </section>
        </aside>

        <main className="min-w-0">
          <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card/50 p-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => chooseCategory('all')} className={`rounded-full border px-3 py-1.5 text-xs ${category === 'all' ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle text-text-muted'}`}>全部领域 {articles.length}</button>
              {categories.map(([name, count]) => <button key={name} onClick={() => chooseCategory(name)} className={`rounded-full border px-3 py-1.5 text-xs ${category === name ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}>{name} {count}</button>)}
            </div>
            {category !== 'all' && <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3"><button onClick={() => setSubtopic('all')} className={`text-xs ${subtopic === 'all' ? 'text-accent-primary' : 'text-text-muted'}`}>全部子主题</button>{subtopics.map(([name, count]) => <button key={name} onClick={() => setSubtopic(name)} className={`rounded px-2 py-1 text-[11px] ${subtopic === name ? 'bg-surface-raised text-text-primary' : 'text-text-faint hover:text-text-secondary'}`}>{name} {count}</button>)}</div>}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-wider text-text-faint">找到 {filtered.length} 篇内容</p><div className="flex flex-wrap items-center gap-2"><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-muted outline-none"><option value="all">全部难度</option><option value="foundation">基础</option><option value="intermediate">进阶</option><option value="advanced">高级</option></select><select value={contentType} onChange={(event) => setContentType(event.target.value)} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-muted outline-none"><option value="all">全部类型</option><option value="guide">指南</option><option value="concept">概念</option><option value="source-analysis">源码分析</option><option value="project">项目</option><option value="interactive">交互演示</option></select><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-muted outline-none"><option value="updated">最近更新</option><option value="recommended">推荐优先</option><option value="title">标题排序</option></select><div className="flex rounded-lg border border-border-subtle p-1"><button aria-label="卡片视图" onClick={() => setView('cards')} className={`rounded p-1.5 ${view === 'cards' ? 'bg-surface-raised text-accent-primary' : 'text-text-faint'}`}><Grid2X2 className="h-4 w-4" /></button><button aria-label="列表视图" onClick={() => setView('list')} className={`rounded p-1.5 ${view === 'list' ? 'bg-surface-raised text-accent-primary' : 'text-text-faint'}`}><List className="h-4 w-4" /></button></div></div></div>

          {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border-strong p-12 text-center text-sm text-text-muted">当前筛选没有内容。可以清除筛选或换一个关键词。</div> : <div className={view === 'cards' ? 'grid gap-4 md:grid-cols-2' : 'space-y-3'}>{filtered.map((article) => <a key={article.slug} href={`${BASE_URL}knowledge/${article.slug}/`} className={`group rounded-xl border border-border-subtle bg-surface-card/65 transition-all hover:-translate-y-0.5 hover:border-accent-primary/30 ${view === 'cards' ? 'flex min-h-56 flex-col p-5' : 'grid gap-4 p-4 md:grid-cols-[160px_1fr_auto] md:items-center'}`}><div className={view === 'cards' ? 'flex items-center justify-between' : ''}><span className="font-mono text-[9px] uppercase tracking-wider text-accent-primary">{article.category}{article.subtopic ? ` / ${article.subtopic}` : ''}</span>{view === 'cards' && <span className="font-mono text-[9px] text-text-faint">{article.readTime}</span>}</div><div className={view === 'cards' ? 'mt-5 flex-1' : ''}><h2 className="font-display text-lg font-bold leading-snug text-text-primary group-hover:text-accent-primary">{highlight(article.title, query)}</h2>{article.excerpt && <p className="mt-3 line-clamp-3 text-xs leading-6 text-text-muted">{highlight(article.excerpt, query)}</p>}</div><div className={view === 'cards' ? 'mt-5 flex items-end justify-between border-t border-border-subtle pt-4' : 'flex items-center justify-between gap-4 md:justify-end'}><span className="font-mono text-[9px] text-text-faint">{article.date}</span><ArrowRight className="h-4 w-4 text-text-faint transition-transform group-hover:translate-x-1 group-hover:text-accent-primary" /></div></a>)}</div>}
        </main>
      </div>
    </div>
  );
}
