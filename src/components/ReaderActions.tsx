import React, { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { clearReaderState, readReaderState, READER_STATE_EVENT, updateReaderState } from '../lib/readerState';

interface Props {
  slug: string;
  title: string;
  category: string;
  url: string;
}

function applyFontScale(scale: number) {
  document.documentElement.style.setProperty('--reader-font-size', `${0.9 * scale}rem`);
  document.documentElement.style.setProperty('--reader-font-size-desktop', `${1.025 * scale}rem`);
  document.documentElement.style.setProperty('--reader-small-font-size', `${0.85 * scale}rem`);
}

export default function ReaderActions({ slug, title, category, url }: Props) {
  const [favorite, setFavorite] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fontScale, setFontScale] = useState(1);

  useEffect(() => {
    const state = readReaderState();
    setFavorite(state.favorites.includes(slug));
    setProgress(Math.round(state.progress[slug] ?? 0));
    setFontScale(state.fontScale);
    applyFontScale(state.fontScale);
    updateReaderState((current) => ({
      ...current,
      recents: [{ slug, title, category, url, visitedAt: Date.now() }, ...current.recents.filter((entry) => entry.slug !== slug)].slice(0, 24),
    }));
    const syncState = () => {
      const current = readReaderState();
      setFavorite(current.favorites.includes(slug));
      setProgress(Math.round(current.progress[slug] ?? 0));
      setFontScale(current.fontScale);
      applyFontScale(current.fontScale);
    };
    window.addEventListener(READER_STATE_EVENT, syncState);
    window.addEventListener('storage', syncState);

    let frame = 0;
    let lastWritten = Math.round(state.progress[slug] ?? 0);
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const article = document.querySelector<HTMLElement>('.article-body');
        if (!article) return;
        const start = article.offsetTop;
        const available = Math.max(article.offsetHeight - window.innerHeight, 1);
        const value = Math.max(0, Math.min(100, ((window.scrollY - start + 120) / available) * 100));
        const rounded = Math.round(value);
        setProgress(rounded);
        if (rounded !== lastWritten) {
          lastWritten = rounded;
          updateReaderState((current) => ({ ...current, progress: { ...current.progress, [slug]: rounded } }));
        }
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener(READER_STATE_EVENT, syncState);
      window.removeEventListener('storage', syncState);
      window.cancelAnimationFrame(frame);
    };
  }, [slug, title, category, url]);

  const toggleFavorite = () => {
    const next = !favorite;
    setFavorite(next);
    updateReaderState((state) => ({
      ...state,
      favorites: next ? [slug, ...state.favorites.filter((item) => item !== slug)] : state.favorites.filter((item) => item !== slug),
    }));
  };

  const resetProgress = () => {
    setProgress(0);
    updateReaderState((state) => ({ ...state, progress: { ...state.progress, [slug]: 0 } }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeFontScale = (delta: number) => {
    const next = Math.max(0.9, Math.min(1.2, Number((fontScale + delta).toFixed(2))));
    setFontScale(next);
    applyFontScale(next);
    updateReaderState((state) => ({ ...state, fontScale: next }));
  };

  const clearLocalState = () => {
    clearReaderState();
    setFavorite(false);
    setProgress(0);
    setFontScale(1);
    applyFontScale(1);
  };

  return (
    <section className="glass-panel rounded-xl border border-border-subtle p-4" aria-label="阅读状态">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-faint">阅读进度</span>
        <strong className="font-mono text-xs text-accent-primary">{progress}%</strong>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-raised"><div className="h-full bg-accent-primary transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={toggleFavorite} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] ${favorite ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}>
          {favorite ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}{favorite ? '已收藏' : '收藏'}
        </button>
        <button onClick={resetProgress} className="flex items-center justify-center gap-1.5 rounded-lg border border-border-subtle px-2 py-2 text-[11px] text-text-muted hover:text-text-primary"><RotateCcw className="h-3.5 w-3.5" />重读</button>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
        <span className="flex items-center text-[10px] text-text-faint">正文字号 {Math.round(fontScale * 100)}%</span>
        <button onClick={() => changeFontScale(-0.05)} className="rounded-lg border border-border-subtle p-2 text-text-muted hover:text-text-primary" aria-label="减小正文字号"><Minus className="h-3.5 w-3.5" /></button>
        <button onClick={() => changeFontScale(0.05)} className="rounded-lg border border-border-subtle p-2 text-text-muted hover:text-text-primary" aria-label="增大正文字号"><Plus className="h-3.5 w-3.5" /></button>
      </div>
      <button onClick={clearLocalState} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[9px] text-text-faint hover:bg-surface-raised/50 hover:text-text-muted"><Trash2 className="h-3 w-3" />清除收藏、历史与阅读偏好</button>
      <p className="mt-3 text-[9px] leading-relaxed text-text-faint">状态仅保存在当前浏览器，不会上传。</p>
    </section>
  );
}
