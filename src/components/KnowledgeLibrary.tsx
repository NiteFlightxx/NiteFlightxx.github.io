import React, { useEffect, useMemo, useState } from "react";
import Fuse from "fuse.js";
import type { ArticleKind, ArticleLevel, ContentArticle } from "../types";

const BASE_URL = import.meta.env.BASE_URL;
const kindLabels: Record<ArticleKind, string> = { theory: "理论", source: "源码", algorithm: "算法", comparison: "对比", practice: "实践", experiment: "实验" };
const levelLabels: Record<ArticleLevel, string> = { foundation: "基础", intermediate: "中级", advanced: "高级" };

export default function KnowledgeLibrary({ articles }: { articles: ContentArticle[] }) {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("domain") ?? "");
  const [kind, setKind] = useState<ArticleKind | "">((params.get("kind") as ArticleKind) || "");
  const [level, setLevel] = useState<ArticleLevel | "">((params.get("level") as ArticleLevel) || "");
  const categories = useMemo(() => [...new Set(articles.map((article) => article.categoryKey).filter(Boolean) as string[])], [articles]);
  const fuse = useMemo(() => new Fuse(articles, { keys: [{ name: "title", weight: 0.5 }, { name: "tags", weight: 0.2 }, { name: "excerpt", weight: 0.3 }], threshold: 0.35, ignoreLocation: true }), [articles]);
  const results = useMemo(() => {
    const found = query.trim() ? fuse.search(query).map((item) => item.item) : articles;
    return found.filter((article) => (!category || article.categoryKey === category) && (!kind || article.kind === kind) && (!level || article.level === level));
  }, [articles, category, fuse, kind, level, query]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (category) next.set("domain", category);
    if (kind) next.set("kind", kind);
    if (level) next.set("level", level);
    const nextUrl = `${window.location.pathname}${next.toString() ? `?${next}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [category, kind, level, query]);

  return <div className="space-y-7" id="knowledge-library">
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、摘要或标签…" aria-label="搜索文章" className="rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none" />
      <a href={`${BASE_URL}knowledge/`} className="rounded-lg border border-border-subtle px-4 py-3 text-center text-xs font-mono text-text-muted hover:border-accent-primary/40 hover:text-text-primary">知识库首页</a>
    </div>
    <div className="flex flex-wrap gap-2">
      <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary"><option value="">全部领域</option>{categories.map((value) => <option key={value} value={value}>{articles.find((article) => article.categoryKey === value)?.category ?? value}</option>)}</select>
      <select value={kind} onChange={(event) => setKind(event.target.value as ArticleKind | "")} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary"><option value="">全部类型</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select value={level} onChange={(event) => setLevel(event.target.value as ArticleLevel | "")} className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-xs text-text-primary"><option value="">全部难度</option>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <span className="self-center text-[10px] font-mono text-text-faint">找到 {results.length} 篇</span>
    </div>
    <div className="space-y-2">
      {results.map((article) => <a key={article.slug} href={`${BASE_URL}knowledge/${article.slug}/`} className="group flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-card p-5 hover:border-accent-primary/40 transition-colors"><div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-text-faint"><span className="text-accent-primary">{article.category}</span><span>/</span><span>{article.subtopic}</span><span className="ml-auto">{kindLabels[article.kind ?? "theory"]} · {levelLabels[article.level ?? "intermediate"]}</span></div><h2 className="font-display font-semibold text-base text-text-primary group-hover:text-accent-primary">{article.title}</h2><p className="text-xs text-text-muted leading-relaxed">{article.excerpt}</p><div className="text-[10px] font-mono text-text-faint">{article.date} · {article.readTime}</div></a>)}
      {results.length === 0 && <div className="rounded-xl border border-dashed border-border-subtle p-10 text-center text-sm text-text-muted">没有匹配的文章。尝试减少筛选条件。</div>}
    </div>
  </div>;
}
