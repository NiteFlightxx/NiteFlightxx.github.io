import React, { useState, useMemo, useEffect } from "react";
import Fuse from "fuse.js";
import { motion } from "motion/react";
import { Search, Calendar, Clock, ArrowRight, Tag, BookOpen, Layers, Route } from "lucide-react";
import type { ArticleKind, ContentArticle, ContentTopicSummary, KnowledgeDomain } from "../types";
import BorderGlow from "./BorderGlow";
import { UI_TRANSLATIONS } from "../translations";
import { KNOWLEDGE_CATEGORIES, knowledgeSubtopicsFor } from "../lib/taxonomy";
import { highlight } from "../lib/highlight";

const BASE_URL = import.meta.env.BASE_URL;

interface KnowledgeViewProps {
  articles: ContentArticle[];
  domains: KnowledgeDomain[];
  topics: ContentTopicSummary[];
  lang: "zh" | "en";
}

export default function KnowledgeView({ articles, domains, topics, lang }: KnowledgeViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<ArticleKind | null>(null);
  const [bodyIndex, setBodyIndex] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!searchQuery.trim() || bodyIndex) return;

    const controller = new AbortController();
    fetch(`${BASE_URL}knowledge-index.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Search index request failed: ${response.status}`);
        return response.json() as Promise<Record<string, string>>;
      })
      .then(setBodyIndex)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      });

    return () => controller.abort();
  }, [searchQuery, bodyIndex]);

  // Categories present in the data, in the canonical KNOWLEDGE_CATEGORIES order.
  const availableCategories = useMemo(() => {
    const present = new Set(articles.map((a) => a.categoryKey).filter(Boolean) as string[]);
    return Object.entries(KNOWLEDGE_CATEGORIES).filter(([key]) => present.has(key));
  }, [articles]);

  // Cascading subtopics for the currently selected category.
  const availableSubtopics = useMemo(() => {
    if (!selectedCategoryKey) return [];
    return Object.entries(knowledgeSubtopicsFor(selectedCategoryKey));
  }, [selectedCategoryKey]);

  // Once the lazily-fetched body index arrives, merge searchText into the
  // articles so Fuse can match against full body text. Until then (or when no
  // query has been typed yet) articles carry no searchText and search falls
  // back to title/tags/excerpt only.
  const searchableArticles = useMemo(() => {
    if (!bodyIndex) return articles;
    return articles.map((a) =>
      bodyIndex[a.slug] ? { ...a, searchText: bodyIndex[a.slug] } : a,
    );
  }, [articles, bodyIndex]);

  // Fuse instance is rebuilt when the searchable article set changes (i.e. when
  // the body index loads). Weighted keys: title is the strongest signal, then
  // tags, excerpt, and finally the full text body. ignoreLocation + low
  // threshold make Fuse work for long Chinese text where the match may be far
  // from the start.
  const fuse = useMemo(
    () =>
      new Fuse(searchableArticles, {
        keys: [
          { name: "title", weight: 0.5 },
          { name: "tags", weight: 0.3 },
          { name: "excerpt", weight: 0.2 },
          { name: "searchText", weight: 0.1 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 1,
      }),
    [searchableArticles],
  );

  // Search runs through Fuse when there is a query; otherwise the full list
  // is used (category/subtopic filters still apply). Results are then narrowed
  // by the active category/subtopic chips.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return articles;
    return fuse.search(q).map((r) => r.item);
  }, [searchQuery, fuse, articles]);

  const filteredArticles = searchResults.filter((art) => {
    const matchesCategory = selectedCategoryKey
      ? art.categoryKey === selectedCategoryKey
      : true;

    const matchesSubtopic = selectedSubtopic ? art.subtopic === selectedSubtopic : true;
    const matchesKind = selectedKind ? art.kind === selectedKind : true;

    return matchesCategory && matchesSubtopic && matchesKind;
  });

  const hasFilters = searchQuery || selectedCategoryKey || selectedSubtopic || selectedKind;
  // Keep the original knowledge tab article-first: the list is visible as
  // soon as the user switches tabs. Domain/topic cards remain available from
  // the dedicated routes, while filters stay in the same page as the articles.
  const portalMode = false;
  const articleBySlug = useMemo(() => new Map(articles.map((article) => [article.slug, article])), [articles]);
  const kindLabels: Record<ArticleKind, string> = {
    theory: "理论",
    source: "源码",
    algorithm: "算法",
    comparison: "对比",
    practice: "实践",
    experiment: "实验",
  };
  const kindCounts = useMemo(() => {
    const counts = new Map<ArticleKind, number>();
    for (const article of articles) counts.set(article.kind ?? "theory", (counts.get(article.kind ?? "theory") ?? 0) + 1);
    return counts;
  }, [articles]);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategoryKey(null);
    setSelectedSubtopic(null);
    setSelectedKind(null);
  };

  const selectCategory = (key: string | null) => {
    setSelectedCategoryKey(key);
    setSelectedSubtopic(null); // cascading reset
  };

  const selectKind = (kind: ArticleKind | null) => {
    setSelectedKind(kind);
  };

  // Chip renderer shared by both filter rows.
  const Chip = ({
    active,
    label,
    onClick,
    pulse,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
    pulse?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-[9px] font-mono uppercase transition-colors cursor-pointer ${
        active
          ? `bg-surface-raised text-text-primary border border-border-subtle ${pulse ? "animate-pulse-slow" : ""}`
          : "text-text-faint hover:text-text-secondary hover:bg-surface-raised/20"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-12 pb-20 select-none" id="knowledge-view-container">
      {/* Intro Header */}
      <div className="max-w-4xl mx-auto text-center space-y-4 px-6">
        <span className="font-mono text-[10px] text-accent-primary uppercase tracking-widest">
          {lang === "zh" ? "知识沉淀 · 技术分析 · 教学内容" : "KNOWLEDGE · ANALYSIS · TEACHING"}
        </span>
        <h1 className="font-display font-black text-4xl md:text-6xl text-text-primary tracking-tighter">
          {lang === "zh" ? "知识库" : "Knowledge"}
        </h1>
        <p className="font-sans text-sm md:text-base text-text-muted max-w-xl mx-auto font-light leading-relaxed">
          {lang === "zh"
            ? "理解与解释技术。涵盖引擎、物理、动画与数学领域的技术沉淀。"
            : "Explain and understand technology across engine, physics, animation and math."}
        </p>
      </div>

      {/* Search entry */}
      <div className="max-w-4xl mx-auto px-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              className="w-full bg-surface-card text-text-primary pl-10 pr-4 py-2.5 rounded-lg border border-border-subtle focus:border-accent-primary/40 focus:outline-none text-xs font-mono transition-all duration-300 shadow-inner"
              id="search-input"
              aria-label={t.searchPlaceholder}
            />
          </div>

          {/* Clear controls */}
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[10px] font-mono text-accent-primary hover:text-text-primary transition-colors cursor-pointer self-center border border-accent-primary/20 bg-accent-primary/5 px-3 py-2 rounded-lg"
              id="clear-filters-btn"
            >
              {t.resetFilters}
            </button>
          )}
          {portalMode && (
            <button
              type="button"
              onClick={() => undefined}
              className="text-[10px] font-mono text-accent-primary hover:text-text-primary transition-colors self-center border border-accent-primary/20 bg-accent-primary/5 px-3 py-2 rounded-lg"
            >
              浏览全部文章
            </button>
          )}
        </div>
      </div>

      {portalMode ? (
        <div className="max-w-5xl mx-auto px-6 space-y-14">
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-accent-primary uppercase tracking-widest">
                  <Layers className="w-3 h-3" /> 按领域浏览
                </div>
                <h2 className="mt-2 font-display font-bold text-2xl text-text-primary">知识领域</h2>
              </div>
              <span className="text-[10px] font-mono text-text-faint">{domains.length} 个入口</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {domains.map((domain) => (
                <a key={domain.id} href={`${BASE_URL}knowledge/domain/${domain.id}/`} className="group p-5 rounded-xl border border-border-subtle bg-surface-card hover:border-accent-primary/40 transition-colors">
                  <div className="flex items-center justify-between text-[10px] font-mono text-text-faint">
                    <span className="text-accent-primary">{domain.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <p className="mt-3 text-xs text-text-muted leading-relaxed line-clamp-2">{domain.excerpt}</p>
                  <div className="mt-4 flex gap-3 text-[9px] font-mono text-text-faint">
                    <span>{domain.articleCount} 篇文章</span>
                    <span>{domain.subtopicCount} 个子主题</span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {topics.length > 0 && (
            <section className="space-y-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-accent-primary uppercase tracking-widest">
                    <BookOpen className="w-3 h-3" /> 按专题浏览
                  </div>
                  <h2 className="mt-2 font-display font-bold text-2xl text-text-primary">专题研究</h2>
                </div>
                <span className="text-[10px] font-mono text-text-faint">项目上下文</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topics.map((topic) => (
                  <a key={topic.id} href={`${BASE_URL}projects/${topic.id}/`} className="group p-6 rounded-xl border border-accent-primary/20 bg-accent-primary/5 hover:border-accent-primary/50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display font-semibold text-lg text-text-primary group-hover:text-accent-primary transition-colors">{topic.title}</h3>
                      <ArrowRight className="w-4 h-4 text-accent-primary group-hover:translate-x-1 transition-transform" />
                    </div>
                    <p className="mt-3 text-sm text-text-muted leading-relaxed line-clamp-2">{topic.excerpt}</p>
                    <div className="mt-4 flex gap-3 text-[9px] font-mono text-text-faint">
                      <span>{topic.stageCount} 个阶段</span>
                      <span>{topic.articleCount} 篇关联文章</span>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {domains.some((domain) => domain.learningPaths.length > 0) && (
            <section className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-accent-primary uppercase tracking-widest">
                  <Route className="w-3 h-3" /> 按路线学习
                </div>
                <h2 className="mt-2 font-display font-bold text-2xl text-text-primary">学习路线</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {domains.flatMap((domain) => domain.learningPaths.map((path) => (
                  <div key={`${domain.id}-${path.id}`} className="p-5 rounded-xl border border-border-subtle bg-surface-card">
                    <div className="text-[9px] font-mono text-accent-primary uppercase tracking-widest">{domain.title}</div>
                    <h3 className="mt-2 font-display font-semibold text-base text-text-primary">{path.title}</h3>
                    <p className="mt-2 text-xs text-text-muted leading-relaxed">{path.description}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {path.articles.slice(0, 5).map((slug, index) => {
                        const article = articleBySlug.get(slug);
                        if (!article) return null;
                        return (
                          <a key={slug} href={`${BASE_URL}knowledge/${slug}/`} className="text-[9px] font-mono text-text-faint hover:text-accent-primary transition-colors">
                            {index > 0 && <span className="mr-1.5 text-border-strong">→</span>}{article.title.replace(/详解\s+—\s+.*/, '详解')}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )))}
              </div>
            </section>
          )}

          <section className="space-y-5">
            <div>
              <div className="text-[10px] font-mono text-accent-primary uppercase tracking-widest">Article Types</div>
              <h2 className="mt-2 font-display font-bold text-2xl text-text-primary">按文章类型浏览</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(kindLabels) as ArticleKind[]).map((kind) => (
                <button type="button" key={kind} onClick={() => selectKind(kind)} className="px-3 py-2 rounded-lg border border-border-subtle bg-surface-card hover:border-accent-primary/40 transition-colors text-left">
                  <span className="block text-xs font-display font-semibold text-text-primary">{kindLabels[kind]}</span>
                  <span className="block mt-1 text-[9px] font-mono text-text-faint">{kindCounts.get(kind) ?? 0} 篇</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono text-accent-primary uppercase tracking-widest">Recent Notes</div>
                <h2 className="mt-2 font-display font-bold text-2xl text-text-primary">最近更新</h2>
              </div>
              <button type="button" className="text-[10px] font-mono text-text-muted hover:text-accent-primary transition-colors">浏览全部 →</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {articles.slice(0, 6).map((article) => (
                <a key={article.id} href={`${BASE_URL}knowledge/${article.slug}/`} className="group p-4 rounded-xl border border-border-subtle bg-surface-card hover:border-accent-primary/30 transition-colors">
                  <div className="flex items-center justify-between text-[9px] font-mono text-text-faint"><span className="text-accent-primary">{article.category}</span><span>{article.date}</span></div>
                  <h3 className="mt-2 text-sm font-display font-semibold text-text-primary group-hover:text-accent-primary transition-colors">{article.title}</h3>
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <>
        {/* Search & Filter Bar */}
        <div className="max-w-4xl mx-auto px-6 space-y-4">

        {/* Row 1: Category (primary axis) */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-b border-border-subtle py-4">
          <span className="text-[10px] font-mono text-text-faint uppercase tracking-widest mr-2">
            {t.filterCategory}
          </span>
          <Chip active={selectedCategoryKey === null} label={t.allArticles} onClick={() => selectCategory(null)} />
          {availableCategories.map(([key, label]) => (
            <Chip
              key={key}
              active={selectedCategoryKey === key}
              label={label}
              onClick={() => selectCategory(key)}
              pulse
            />
          ))}
        </div>

        {/* Row 2: Subtopic (cascading, only when a category is selected) */}
        {selectedCategoryKey && availableSubtopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-4 -mt-1">
            <span className="text-[10px] font-mono text-text-faint uppercase tracking-widest mr-2 flex items-center gap-1">
              <Tag className="w-3 h-3" /> {t.filterSubtopic}
            </span>
            <Chip active={selectedSubtopic === null} label={t.allSubtopics} onClick={() => setSelectedSubtopic(null)} />
            {availableSubtopics.map(([key, label]) => (
              <Chip
                key={key}
                active={selectedSubtopic === label}
                label={label}
                onClick={() => setSelectedSubtopic(label)}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pb-4 -mt-1">
          <span className="text-[10px] font-mono text-text-faint uppercase tracking-widest mr-2">文章类型</span>
          <Chip active={selectedKind === null} label="全部类型" onClick={() => selectKind(null)} />
          {(Object.keys(kindLabels) as ArticleKind[]).map((kind) => (
            <Chip key={kind} active={selectedKind === kind} label={`${kindLabels[kind]} ${kindCounts.get(kind) ?? 0}`} onClick={() => selectKind(kind)} />
          ))}
        </div>
        </div>

      {/* Article list */}
      <div className="max-w-4xl mx-auto px-6 space-y-4">
        {filteredArticles.length > 0 ? (
          filteredArticles.map((art) => (
            <motion.a
              href={`${BASE_URL}knowledge/${art.slug}`}
              key={art.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="group block"
            >
              <BorderGlow
                edgeSensitivity={30}
                glowColor="76 95 64"
                backgroundColor="#121214"
                borderRadius={12}
                glowRadius={45}
                glowIntensity={1.15}
                coneSpread={20}
                colors={["#bcfd49", "#6366f1", "#4f46e5"]}
                fillOpacity={0.16}
                className="w-full"
              >
                <div className="p-6 md:p-8 flex flex-col gap-4">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-accent-primary uppercase tracking-wider font-semibold">
                        {art.category}
                      </span>
                      {art.subtopic && (
                        <span className="text-text-faint uppercase tracking-wider">
                          / {art.subtopic}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-text-faint">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {art.date}
                      </span>
                      {art.readTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {art.readTime}
                        </span>
                      )}
                    </div>
                  </div>

                  <h2 className="font-display font-semibold text-lg md:text-xl text-text-primary group-hover:text-accent-primary transition-colors tracking-wide">
                    {highlight(art.title, searchQuery)}
                  </h2>

                  {art.excerpt && (
                    <p className="text-xs md:text-sm text-text-muted leading-relaxed font-sans font-light">
                      {highlight(art.excerpt, searchQuery)}
                    </p>
                  )}

                  <div className="flex items-center justify-between font-mono text-[9px] text-text-faint pt-4 border-t border-border-subtle">
                    <div className="flex items-center gap-1.5">
                      {art.tags.map((tag) => (
                        <span key={tag} className="text-text-faint bg-surface-base/60 px-1.5 py-0.5 rounded text-[8px]">
                          #{tag.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <span className="text-text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1">
                      {t.examine} <ArrowRight className="w-3 h-3 text-accent-primary" />
                    </span>
                  </div>
                </div>
              </BorderGlow>
            </motion.a>
          ))
        ) : (
          <div className="p-12 text-center border border-border-subtle rounded-xl bg-surface-card space-y-2">
            <p className="text-sm font-mono text-text-muted">{t.noArticlesFound}</p>
            <p className="text-xs text-text-faint">{t.refineSearch}</p>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
