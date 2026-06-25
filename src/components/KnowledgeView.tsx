import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { Search, Calendar, Clock, ArrowRight, Tag } from "lucide-react";
import type { ContentArticle } from "../types";
import BorderGlow from "./BorderGlow";
import { UI_TRANSLATIONS } from "../translations";
import { KNOWLEDGE_CATEGORIES, knowledgeSubtopicsFor } from "../lib/taxonomy";

const BASE_URL = import.meta.env.BASE_URL;

interface KnowledgeViewProps {
  articles: ContentArticle[];
  lang: "zh" | "en";
}

export default function KnowledgeView({ articles, lang }: KnowledgeViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);

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

  const filteredArticles = articles.filter((art) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      art.title.toLowerCase().includes(q) ||
      (art.excerpt ?? "").toLowerCase().includes(q) ||
      (art.searchText ?? "").includes(q);

    const matchesCategory = selectedCategoryKey
      ? art.categoryKey === selectedCategoryKey
      : true;

    const matchesSubtopic = selectedSubtopic ? art.subtopic === selectedSubtopic : true;

    return matchesSearch && matchesCategory && matchesSubtopic;
  });

  const hasFilters = searchQuery || selectedCategoryKey || selectedSubtopic;

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategoryKey(null);
    setSelectedSubtopic(null);
  };

  const selectCategory = (key: string | null) => {
    setSelectedCategoryKey(key);
    setSelectedSubtopic(null); // cascading reset
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
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-[9px] font-mono uppercase transition-colors cursor-pointer ${
        active
          ? `bg-brand-gray-800 text-white border border-white/10 ${pulse ? "animate-pulse-slow" : ""}`
          : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-12 pb-20 select-none" id="knowledge-view-container">
      {/* Intro Header */}
      <div className="max-w-4xl mx-auto text-center space-y-4 px-6">
        <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">
          {lang === "zh" ? "知识沉淀 · 技术分析 · 教学内容" : "KNOWLEDGE · ANALYSIS · TEACHING"}
        </span>
        <h1 className="font-display font-black text-4xl md:text-6xl text-white tracking-tighter">
          {lang === "zh" ? "知识库" : "Knowledge"}
        </h1>
        <p className="font-sans text-sm md:text-base text-gray-400 max-w-xl mx-auto font-light leading-relaxed">
          {lang === "zh"
            ? "理解与解释技术。涵盖引擎、物理、动画、渲染、玩法、AI 与数学领域的技术沉淀。"
            : "Explain and understand technology across engine, physics, animation, rendering, gameplay, AI and math."}
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="max-w-4xl mx-auto px-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-brand-charcoal text-white pl-10 pr-4 py-2.5 rounded-lg border border-white/5 focus:border-brand-accent-orange/40 focus:outline-none text-xs font-mono transition-all duration-300 shadow-inner"
              id="search-input"
            />
          </div>

          {/* Clear controls */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-[10px] font-mono text-brand-accent-orange hover:text-white transition-colors cursor-pointer self-center border border-brand-accent-orange/20 bg-brand-accent-orange/5 px-3 py-2 rounded-lg"
              id="clear-filters-btn"
            >
              {t.resetFilters}
            </button>
          )}
        </div>

        {/* Row 1: Category (primary axis) */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-b border-white/5 py-4">
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mr-2">
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
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mr-2 flex items-center gap-1">
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
      </div>

      {/* Article list */}
      <div className="max-w-4xl mx-auto px-6 space-y-4">
        {filteredArticles.length > 0 ? (
          filteredArticles.map((art) => (
            <motion.a
              href={`${BASE_URL}knowledge/${art.slug}`}
              target="_blank"
              rel="noopener noreferrer"
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
                      <span className="text-brand-accent-lime uppercase tracking-wider font-semibold">
                        {art.category}
                      </span>
                      {art.subtopic && (
                        <span className="text-gray-500 uppercase tracking-wider">
                          / {art.subtopic}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-gray-500">
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

                  <h2 className="font-display font-semibold text-lg md:text-xl text-white group-hover:text-brand-accent-lime transition-colors tracking-wide">
                    {art.title}
                  </h2>

                  {art.excerpt && (
                    <p className="text-xs md:text-sm text-gray-400 leading-relaxed font-sans font-light">
                      {art.excerpt}
                    </p>
                  )}

                  <div className="flex items-center justify-between font-mono text-[9px] text-gray-500 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      {art.tags.map((tag) => (
                        <span key={tag} className="text-gray-600 bg-brand-black/60 px-1.5 py-0.5 rounded text-[8px]">
                          #{tag.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1">
                      {t.examine} <ArrowRight className="w-3 h-3 text-brand-accent-lime" />
                    </span>
                  </div>
                </div>
              </BorderGlow>
            </motion.a>
          ))
        ) : (
          <div className="p-12 text-center border border-white/5 rounded-xl bg-brand-charcoal space-y-2">
            <p className="text-sm font-mono text-gray-400">{t.noArticlesFound}</p>
            <p className="text-xs text-gray-600">{t.refineSearch}</p>
          </div>
        )}
      </div>
    </div>
  );
}
