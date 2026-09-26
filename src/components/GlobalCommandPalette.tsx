import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Clock3, Command, CornerDownLeft, Network, Search, X } from 'lucide-react';
import type { KnowledgeManifestEntry } from '../types';
import { readReaderState, updateReaderState } from '../lib/readerState';

const BASE_URL = import.meta.env.BASE_URL;

interface PaletteResult {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  meta: string;
}

function fallbackSearch(entries: KnowledgeManifestEntry[], query: string): PaletteResult[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries
    .map((entry) => {
      const haystack = [entry.title, entry.summary, entry.categoryLabel, entry.subtopicLabel, ...entry.tags, ...entry.aliases]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? (entry.title.toLocaleLowerCase().includes(term) ? 4 : 1) : 0), 0);
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ entry }) => ({
      id: entry.slug,
      title: entry.title,
      excerpt: entry.summary,
      url: entry.url,
      meta: `${entry.categoryLabel} · ${entry.subtopicLabel ?? entry.pageType}`,
    }));
}

function highlightMatch(value: string, query: string): React.ReactNode {
  const term = query.trim();
  if (!term) return value;
  const index = value.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0) return value;
  return <>{value.slice(0, index)}<mark className="rounded bg-accent-primary/20 px-0.5 text-accent-primary">{value.slice(index, index + term.length)}</mark>{value.slice(index + term.length)}</>;
}

export default function GlobalCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<KnowledgeManifestEntry[]>([]);
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('nite:open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('nite:open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (entries.length > 0) return;
    fetch(`${BASE_URL}knowledge-manifest.json`)
      .then((response) => response.json() as Promise<KnowledgeManifestEntry[]>)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [open, entries.length]);

  const defaultResults = useMemo<PaletteResult[]>(() => {
    const manifestBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
    return readReaderState().recents.slice(0, 6).map((recent) => {
      const entry = manifestBySlug.get(recent.slug);
      return {
        id: recent.slug,
        title: recent.title,
        excerpt: entry?.summary ?? '最近阅读的知识页面',
        url: recent.url,
        meta: `最近阅读 · ${recent.category ?? entry?.categoryLabel ?? '知识库'}`,
      };
    });
  }, [entries, open]);

  const quickLinks = useMemo<PaletteResult[]>(() => [
    { id: 'knowledge', title: '浏览全部知识', excerpt: '按领域、子主题、收藏与最近阅读筛选', url: `${BASE_URL}knowledge/`, meta: '常用入口' },
    { id: 'graph', title: '打开知识图谱', excerpt: '查看文章、专题与知识关系', url: `${BASE_URL}knowledge/graph/`, meta: '常用入口' },
    ...entries.filter((entry) => entry.featured).slice(0, 4).map((entry) => ({ id: entry.slug, title: entry.title, excerpt: entry.summary, url: entry.url, meta: `精选 · ${entry.categoryLabel}` })),
  ], [entries]);

  useEffect(() => {
    const normalized = query.trim();
    setActive(0);
    if (!normalized) {
      setResults(defaultResults.length > 0 ? defaultResults : quickLinks);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const pagefind = await import(/* @vite-ignore */ `${BASE_URL}pagefind/pagefind.js`);
        const search = await pagefind.search(normalized);
        const loaded = await Promise.all(search.results.slice(0, 12).map((result: { data: () => Promise<any> }) => result.data()));
        if (!cancelled) {
          setResults(loaded.map((item: any, index: number) => ({
            id: item.url || String(index),
            title: item.meta?.title || item.sub_results?.[0]?.title || '未命名页面',
            excerpt: item.excerpt || '',
            url: item.url,
            meta: item.meta?.category || '全文搜索',
          })));
        }
      } catch {
        if (!cancelled) setResults(fallbackSearch(entries, normalized));
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, entries, defaultResults, quickLinks]);

  const navigate = (result: PaletteResult) => {
    const q = query.trim();
    if (q) {
      updateReaderState((state) => ({ ...state, searchHistory: [q, ...state.searchHistory.filter((item) => item !== q)].slice(0, 8) }));
    }
    window.location.assign(result.url);
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      navigate(results[active]);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh] md:pt-[14vh]" role="dialog" aria-modal="true" aria-label="全局搜索">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="关闭搜索" />
      <section className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border-strong bg-surface-card shadow-[0_30px_100px_rgba(0,0,0,.65)]">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <Search className="h-5 w-5 text-accent-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder="搜索文章、源码类型、公式或项目…"
            className="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-faint"
          />
          <kbd className="hidden rounded border border-border-subtle px-2 py-1 font-mono text-[10px] text-text-faint sm:block">ESC</kbd>
          <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary" aria-label="关闭"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[62vh] overflow-y-auto p-3">
          {!query && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-text-faint">
              <Clock3 className="h-3.5 w-3.5" />{defaultResults.length > 0 ? '最近阅读' : '常用入口'}
            </div>
          )}
          {results.length > 0 ? results.map((result, index) => (
            <button
              key={`${result.id}-${index}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => navigate(result)}
              className={`flex w-full items-start gap-4 rounded-xl px-4 py-3 text-left transition-colors ${index === active ? 'bg-surface-raised text-text-primary' : 'text-text-secondary hover:bg-surface-raised/60'}`}
            >
              <BookOpen className={`mt-1 h-4 w-4 shrink-0 ${index === active ? 'text-accent-primary' : 'text-text-faint'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-bold">{highlightMatch(result.title, query)}</span>
                <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-text-muted" dangerouslySetInnerHTML={{ __html: result.excerpt }} />
                <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-wider text-text-faint">{result.meta}</span>
              </span>
              {index === active && <CornerDownLeft className="mt-1 h-4 w-4 shrink-0 text-accent-primary" />}
            </button>
          )) : (
            <div className="px-5 py-10 text-center text-sm text-text-muted">没有找到匹配内容</div>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-3 font-mono text-[9px] uppercase tracking-wider text-text-faint">
          <span className="flex items-center gap-2"><Command className="h-3 w-3" />↑↓ 选择 · Enter 打开</span>
          <a href={`${BASE_URL}knowledge/graph/`} className="flex items-center gap-1.5 hover:text-accent-primary"><Network className="h-3 w-3" />知识图谱</a>
        </footer>
      </section>
    </div>
  );
}
