import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { X, Clock, Calendar, ArrowLeft, Copy, Check, Share2 } from "lucide-react";
import { BlogArticle } from "../types";
import MathRenderer from "./MathRenderer";

interface ArticleViewerProps {
  article: BlogArticle;
  onClose: () => void;
  lang: "zh" | "en";
}

export default function ArticleViewer({ article, onClose, lang }: ArticleViewerProps) {
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

  // Custom high-fidelity inline parser for structured rendering
  const renderContent = (text: string) => {
    const lines = text.split("\n");
    let inCodeBlock = false;
    let codeLines: string[] = [];
    let codeLang = "";

    return lines.map((line, idx) => {
      // Code Blocks parsing
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const codeContent = codeLines.join("\n");
          codeLines = [];
          return (
            <div key={idx} className="my-6 rounded-lg overflow-hidden border border-white/5 bg-brand-charcoal">
              <div className="flex items-center justify-between px-4 py-2 bg-brand-black/50 border-b border-white/5 font-mono text-[10px] text-gray-500">
                <span>{codeLang.toUpperCase() || "SOURCE"}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(codeContent);
                  }}
                  className="hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Copy className="w-2.5 h-2.5" /> {lang === "zh" ? "复制" : "Copy"}
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-xs font-mono text-gray-300 leading-relaxed bg-brand-black/20">
                <code>{codeContent}</code>
              </pre>
            </div>
          );
        } else {
          inCodeBlock = true;
          codeLang = line.replace("```", "").trim();
          return null;
        }
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return null;
      }

      // Headings
      if (line.startsWith("### ")) {
        return (
          <h3 key={idx} className="font-display font-medium text-lg md:text-xl text-white mt-10 mb-4 tracking-wide border-b border-white/5 pb-2">
            {line.substring(4)}
          </h3>
        );
      }
      if (line.startsWith("#### ")) {
        return (
          <h4 key={idx} className="font-display font-medium text-base text-gray-200 mt-6 mb-3 tracking-wide">
            {line.substring(5)}
          </h4>
        );
      }

      // Ordered Lists
      if (line.match(/^\d+\.\s/)) {
        const itemText = line.replace(/^\d+\.\s/, "");
        return (
          <div key={idx} className="flex gap-2 pl-2 my-2 text-sm text-gray-300 leading-relaxed font-sans">
            <span className="font-mono text-brand-accent-orange text-xs mt-0.5">•</span>
            <span>{itemText}</span>
          </div>
        );
      }

      // Unordered Lists
      if (line.startsWith("- ")) {
        return (
          <div key={idx} className="flex gap-2 pl-4 my-2 text-sm text-gray-300 leading-relaxed font-sans">
            <span className="font-mono text-gray-500 text-xs mt-0.5">▪</span>
            <span>{line.substring(2)}</span>
          </div>
        );
      }

      // Empty Lines
      if (line.trim() === "") {
        return <div key={idx} className="h-3" />;
      }

      // Math Equations
      if (line.includes("$$")) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith("$$") && cleanLine.endsWith("$$")) {
          const formula = cleanLine.replaceAll("$$", "");
          let formulaKey = "";
          if (formula.includes("Rayleigh")) formulaKey = "rayleigh";
          else if (formula.includes("HG")) formulaKey = "hg";
          else if (formula.includes("Verlet") || formula.includes("x_")) formulaKey = "verlet";
          else if (formula.includes("Poisson") || formula.includes("p_")) formulaKey = "gpu-poisson";
          else if (formula.includes("H(x, y, z)")) formulaKey = "spatial_hash";
          
          if (formulaKey) {
            return (
              <div key={idx} className="my-6">
                <MathRenderer formulaKey={formulaKey} />
              </div>
            );
          }
        }
      }

      // Default Paragraph
      return (
        <p key={idx} className="text-sm md:text-base text-gray-300 leading-relaxed my-5 font-normal tracking-wide">
          {line}
        </p>
      );
    });
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
            {lang === "zh" ? "返回技术列表" : "BACK TO FEED"}
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
                  {lang === "zh" ? "链接已复制" : "COPIED"}
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  {lang === "zh" ? "分享链接" : "SHARE"}
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
              <span>{lang === "zh" ? article.category.replace("Physics Simulation", "物理模拟").replace("Real-time Rendering", "实时渲染").replace("Animation Technical Art", "动画技术美术").replace("Gameplay Systems", "游戏玩法系统") : article.category}</span>
              <span>•</span>
              <span>{lang === "zh" ? "深度研究日志" : "TECHNICAL LOG"}</span>
            </div>
            
            <h1 className="font-display font-medium text-2xl md:text-4xl text-white tracking-tight leading-tight mb-6">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono text-gray-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-600" />
                {article.date}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-600" />
                {lang === "zh" ? "预计阅读时长: " + article.readTime : article.readTime}
              </span>
            </div>
          </div>

          {/* Formatted Content */}
          <div className="prose prose-invert max-w-none">
            {renderContent(article.content)}
          </div>

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
