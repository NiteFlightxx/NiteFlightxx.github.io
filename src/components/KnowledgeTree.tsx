import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Clock3, FolderTree, Star } from 'lucide-react';
import type { ContentArticle } from '../types';
import { READER_STATE_EVENT, readReaderState, updateReaderState } from '../lib/readerState';

const BASE_URL = import.meta.env.BASE_URL;

interface Props {
  articles: ContentArticle[];
  currentSlug?: string;
}

export default function KnowledgeTree({ articles, currentSlug }: Props) {
  const [version, setVersion] = useState(0);
  const state = readReaderState();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(state.expandedFolders));

  useEffect(() => {
    const sync = () => setVersion((value) => value + 1);
    window.addEventListener(READER_STATE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(READER_STATE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const groups = useMemo(() => {
    const categoryMap = new Map<string, Map<string, ContentArticle[]>>();
    for (const article of articles) {
      const category = article.category;
      const subtopic = article.subtopic ?? '其他';
      if (!categoryMap.has(category)) categoryMap.set(category, new Map());
      const subtopics = categoryMap.get(category)!;
      if (!subtopics.has(subtopic)) subtopics.set(subtopic, []);
      subtopics.get(subtopic)!.push(article);
    }
    return [...categoryMap.entries()];
  }, [articles]);

  useEffect(() => {
    if (!currentSlug) return;
    const current = articles.find((article) => article.slug === currentSlug);
    if (!current) return;
    const keys = [current.category, `${current.category}/${current.subtopic ?? '其他'}`];
    setExpanded((previous) => new Set([...previous, ...keys]));
  }, [currentSlug, articles]);

  const toggle = (key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      updateReaderState((reader) => ({ ...reader, expandedFolders: [...next] }));
      return next;
    });
  };

  const reader = readReaderState();
  const quickItems = [
    { icon: Star, label: '收藏', count: reader.favorites.length },
    { icon: Clock3, label: '最近阅读', count: reader.recents.length },
  ];

  return (
    <nav className="knowledge-tree glass-panel overflow-hidden rounded-xl border border-border-subtle" aria-label="知识目录" data-reader-version={version}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-text-muted"><FolderTree className="h-4 w-4 text-accent-primary" />知识目录</span>
        <a href={`${BASE_URL}knowledge/`} className="text-[10px] text-text-faint hover:text-accent-primary">全部</a>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-border-subtle p-3">
        {quickItems.map(({ icon: Icon, label, count }) => (
          <a key={label} href={`${BASE_URL}knowledge/?scope=${label === '收藏' ? 'favorites' : 'recents'}`} className="rounded-lg border border-border-subtle bg-surface-base/40 px-3 py-2 hover:border-accent-primary/30">
            <span className="flex items-center gap-1.5 text-[10px] text-text-muted"><Icon className="h-3 w-3" />{label}</span>
            <strong className="mt-1 block font-mono text-sm text-text-primary">{count}</strong>
          </a>
        ))}
      </div>
      <div className="max-h-[calc(100vh-18rem)] overflow-y-auto px-2 py-3">
        {groups.map(([category, subtopics]) => {
          const categoryOpen = expanded.has(category);
          const count = [...subtopics.values()].reduce((sum, items) => sum + items.length, 0);
          return (
            <div key={category} className="mb-1">
              <button onClick={() => toggle(category)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-secondary hover:bg-surface-raised/50 hover:text-text-primary" aria-expanded={categoryOpen}>
                <ChevronDown className={`h-3.5 w-3.5 text-text-faint transition-transform ${categoryOpen ? '' : '-rotate-90'}`} />
                <span className="min-w-0 flex-1 truncate font-semibold">{category}</span>
                <span className="font-mono text-[9px] text-text-faint">{count}</span>
              </button>
              {categoryOpen && [...subtopics.entries()].map(([subtopic, items]) => {
                const key = `${category}/${subtopic}`;
                const open = expanded.has(key);
                return (
                  <div key={key} className="ml-3 border-l border-border-subtle pl-2">
                    <button onClick={() => toggle(key)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-text-muted hover:text-text-primary" aria-expanded={open}>
                      <ChevronDown className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`} />
                      <span className="min-w-0 flex-1 truncate">{subtopic}</span>
                      <span className="font-mono text-[8px] text-text-faint">{items.length}</span>
                    </button>
                    {open && items.map((article) => (
                      <a key={article.slug} href={`${BASE_URL}knowledge/${article.slug}/`} aria-current={article.slug === currentSlug ? 'page' : undefined} className={`flex items-start gap-2 rounded px-2 py-1.5 text-[11px] leading-relaxed ${article.slug === currentSlug ? 'bg-accent-primary/10 text-accent-primary' : 'text-text-faint hover:bg-surface-raised/40 hover:text-text-secondary'}`}>
                        <BookOpen className="mt-0.5 h-3 w-3 shrink-0" /><span>{article.title.replace(/详解\s+—\s+.*/, '详解')}</span>
                      </a>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
