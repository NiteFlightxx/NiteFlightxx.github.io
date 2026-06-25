import React, { useState } from "react";
import { motion } from "motion/react";
import { Search, Calendar, Clock, ArrowRight, Tag } from "lucide-react";
import type { BlogArticle } from "../types";
import BorderGlow from "./BorderGlow";

interface BlogViewProps {
  articles: BlogArticle[];
  onSelectArticle: (article: BlogArticle) => void;
  lang: "zh" | "en";
}

export default function BlogView({ articles, onSelectArticle, lang }: BlogViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Derive unique tags from all articles
  const allTags = Array.from(new Set(articles.flatMap((art) => art.tags)));

  const filteredArticles = articles.filter((art) => {
    const matchesSearch =
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (art.searchText ?? "").includes(searchQuery.toLowerCase());
    
    const matchesTag = selectedTag ? art.tags.includes(selectedTag) : true;
    
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-12 pb-20 select-none" id="blog-view-container">
      {/* Intro Header */}
      <div className="max-w-4xl mx-auto text-center space-y-4 px-6">
        <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">
          {lang === "zh" ? "技术经验记录档案" : "FIELD KNOWLEDGE RECORDERS"}
        </span>
        <h1 className="font-display font-black text-4xl md:text-6xl text-white tracking-tighter">
          {lang === "zh" ? "技术研究日志" : "Technical Logs"}
        </h1>
        <p className="font-sans text-sm md:text-base text-gray-400 max-w-xl mx-auto font-light leading-relaxed">
          {lang === "zh"
            ? "深入研究图形 API、物理自步算法、CPU 缓存对齐及着色器优化的底层细节。专为游戏开发者与引擎架构师倾心编写。"
            : "Deep dives into graphics APIs, physics sub-stepping algorithms, memory cache alignments, and shader optimizations written for other game developers and engineers."}
        </p>
      </div>

      {/* Search & Tag Filter Bar (Vercel styled) */}
      <div className="max-w-4xl mx-auto px-6 space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          {/* Custom Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder={lang === "zh" ? "搜寻着色器、物理模拟、C++ 网关代码..." : "Search shaders, physics, C++ netcode..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-brand-charcoal text-white pl-10 pr-4 py-2.5 rounded-lg border border-white/5 focus:border-brand-accent-orange/40 focus:outline-none text-xs font-mono transition-all duration-300 shadow-inner"
              id="search-input"
            />
          </div>

          {/* Quick Clear Controls */}
          {(searchQuery || selectedTag) && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedTag(null);
              }}
              className="text-[10px] font-mono text-brand-accent-orange hover:text-white transition-colors cursor-pointer self-center border border-brand-accent-orange/20 bg-brand-accent-orange/5 px-3 py-2 rounded-lg"
              id="clear-filters-btn"
            >
              {lang === "zh" ? "重置过滤器" : "RESET FILTERS"}
            </button>
          )}
        </div>

        {/* Dynamic Tag list */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-b border-white/5 py-4">
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mr-2 flex items-center gap-1">
            <Tag className="w-3 h-3" /> {lang === "zh" ? "按标签检索:" : "Filter Tag:"}
          </span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded text-[9px] font-mono uppercase transition-colors cursor-pointer ${
              selectedTag === null
                ? "bg-brand-gray-800 text-white border border-white/10"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}
          >
            {lang === "zh" ? "全部日志" : "All Logs"}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 rounded text-[9px] font-mono uppercase transition-colors cursor-pointer ${
                selectedTag === tag
                  ? "bg-brand-gray-800 text-white border border-white/10 animate-pulse-slow"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Search results List (Staggered layout) */}
      <div className="max-w-4xl mx-auto px-6 space-y-4">
        {filteredArticles.length > 0 ? (
          filteredArticles.map((art) => (
            <motion.div
              key={art.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="group cursor-pointer"
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
                <div
                  onClick={() => onSelectArticle(art)}
                  className="p-6 md:p-8 flex flex-col gap-4"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-brand-accent-lime uppercase tracking-wider font-semibold">
                      {lang === "zh" ? art.category.replace("Physics Simulation", "物理模拟").replace("Real-time Rendering", "实时渲染").replace("Animation Technical Art", "动画技术美术").replace("Gameplay Systems", "游戏玩法系统") : art.category}
                    </span>
                    <div className="flex items-center gap-3 text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {art.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {art.readTime}
                      </span>
                    </div>
                  </div>

                  <h2 className="font-display font-semibold text-lg md:text-xl text-white group-hover:text-brand-accent-lime transition-colors tracking-wide">
                    {art.title}
                  </h2>

                  <p className="text-xs md:text-sm text-gray-400 leading-relaxed font-sans font-light">
                    {art.excerpt}
                  </p>

                  <div className="flex items-center justify-between font-mono text-[9px] text-gray-500 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      {art.tags.map((t) => (
                        <span key={t} className="text-gray-600 bg-brand-black/60 px-1.5 py-0.5 rounded text-[8px]">
                          #{t.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    
                    <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1">
                      {lang === "zh" ? "深入日志" : "EXAMINE LOG"} <ArrowRight className="w-3 h-3 text-brand-accent-lime" />
                    </span>
                  </div>
                </div>
              </BorderGlow>
            </motion.div>
          ))
        ) : (
          <div className="p-12 text-center border border-white/5 rounded-xl bg-brand-charcoal space-y-2">
            <p className="text-sm font-mono text-gray-400">
              {lang === "zh" ? "未发现匹配的技术日志" : "NO CORRESPONDING TECHNICAL LOGS FOUND"}
            </p>
            <p className="text-xs text-gray-600">
              {lang === "zh" ? "请优化您的搜寻词汇，或切换至其他检索标签。" : "Please refine your search parameters or select a different tag."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
