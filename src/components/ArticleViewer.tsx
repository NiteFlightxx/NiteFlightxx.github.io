import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X, Clock, Calendar, ArrowLeft, Check, Share2 } from "lucide-react";
import type { ContentArticle } from "../types";
import { UI_TRANSLATIONS } from "../translations";

interface ArticleViewerProps {
  article: ContentArticle;
  onClose: () => void;
  lang: "zh" | "en";
}

export default function ArticleViewer({ article, onClose, lang }: ArticleViewerProps) {
  const t = UI_TRANSLATIONS[lang];
  const [copied, setCopied] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset scroll of the viewer on article change
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
    setScrollProgress(0);
  }, [article]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const totalScroll = scrollHeight - clientHeight;
    if (totalScroll > 0) {
      setScrollProgress((scrollTop / totalScroll) * 100);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex justify-end bg-brand-black/80 backdrop-blur-sm"
      id="article-viewer-container"
    >
      {/* Background Closer */}
      <div className="absolute inset-0 -z-10 cursor-pointer" onClick={onClose} />

      {/* Main Slide-Over Board */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="w-full max-w-4xl h-full bg-brand-charcoal border-l border-white/5 shadow-2xl flex flex-col overflow-y-auto relative"
      >
        {/* Sticky Scroll Progress Bar */}
        <div className="sticky top-0 left-0 w-full h-[2px] bg-white/5 z-30">
          <div
            className="h-full bg-brand-accent-orange transition-all duration-100 ease-out"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>

        {/* Floating controls */}
        <div className="sticky top-[2px] right-0 left-0 glass-panel border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between z-20">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-xs font-mono text-gray-400 hover:text-white transition-colors group cursor-pointer"
            id="article-back-btn"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            {t.backToFeed}
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={copyLink}
              className="p-2 rounded-lg border border-white/5 hover:border-white/10 text-gray-400 hover:text-white bg-brand-black/20 hover:bg-white/5 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono"
              title="Copy link"
              id="article-copy-btn"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  {t.copied}
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  {t.share}
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-white/5 hover:border-white/10 text-gray-400 hover:text-white bg-brand-black/20 hover:bg-white/5 transition-all cursor-pointer"
              aria-label="Close article"
              id="article-close-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Article Body Content */}
        <article className="flex-1 py-12 px-6 md:px-16 lg:px-24 max-w-4xl mx-auto">
          {/* Header Metadata */}
          <div className="border-b border-white/5 pb-8 mb-8">
            <div className="flex items-center gap-2 text-[10px] font-mono text-brand-accent-orange uppercase tracking-wider mb-3">
              <span>{article.category}</span>
            </div>

            <h1 className="font-display font-medium text-2xl md:text-4xl text-white tracking-tight leading-tight mb-6">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-gray-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-600" />
                {article.date}
              </span>
              {article.readTime && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-600" />
                  {article.readTime}
                </span>
              )}
            </div>
          </div>

          {/* Pre-rendered Markdown + KaTeX HTML from the build step */}
          <div
            className="article-body prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: article.html ?? "" }}
          />

          {/* Tag Cloud */}
          <div className="mt-12 pt-8 border-t border-white/5 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 text-[10px] font-mono bg-brand-gray-800 text-gray-400 border border-white/5 rounded"
              >
                #{tag.toUpperCase()}
              </span>
            ))}
          </div>
        </article>
      </div>
    </motion.div>
  );
}
