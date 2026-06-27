import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Check, Copy, FileCode, ArrowRight, ArrowUpRight, BookOpen, Github, ExternalLink } from "lucide-react";
import type { Project } from "../types";
import { projectCategoryZh, projectStatusZh } from "../lib/taxonomy";
import { UI_TRANSLATIONS } from "../translations";

// Site base path (GitHub Pages sub-path aware), same convention as KnowledgeView.
const BASE_URL = import.meta.env.BASE_URL;

// Extract a Bilibili bvid from either a full URL (https://www.bilibili.com/video/BV1xQja61EQU/)
// or a bare bvid (BV1xQja61EQU). Returns null if no valid bvid is found, so the
// caller can silently skip rendering the video block.
function resolveBilibiliBvid(input: string): string | null {
  const m = input.match(/(BV[\w]{10})/);
  return m ? m[1] : null;
}

interface ProjectDetailModalProps {
  project: Project;
  onClose: () => void;
  lang: "zh" | "en";
}

export default function ProjectDetailModal({ project, onClose, lang }: ProjectDetailModalProps) {
  const t = UI_TRANSLATIONS[lang];
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (project.codeSnippet) {
      navigator.clipboard.writeText(project.codeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const zh = lang === "zh";
  const catLabel = zh ? projectCategoryZh(project.category) : project.category;
  const statusLabel = zh ? projectStatusZh(project.status) : project.status;
  const articleUrl = `${BASE_URL}knowledge/${project.articleSlug}/`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-black/90 backdrop-blur-md p-4 md:p-8 overflow-y-auto"
      id="project-detail-modal"
    >
      {/* Background closer */}
      <div className="absolute inset-0 -z-10 cursor-pointer" onClick={onClose} />

      {/* Modal Card wrapper */}
      <motion.div
        initial={{ scale: 0.95, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 15, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        className="w-full max-w-5xl bg-brand-charcoal border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:max-h-[90vh]"
      >
        {/* Header toolbar */}
        <div className="glass-panel border-b border-white/5 py-4 px-6 md:px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-accent-orange animate-pulse" />
            <span className="font-mono text-[10px] text-gray-400 tracking-widest uppercase">
              {t.engineeringLog} // {catLabel.toUpperCase()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-white/5 hover:border-white/10 text-gray-400 hover:text-white bg-brand-black/20 hover:bg-white/5 transition-all cursor-pointer"
            aria-label="Close modal"
            id="project-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal content body — 8-section structure */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
          {/* Title + category + status */}
          <div className="space-y-3 border-b border-white/5 pb-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-brand-accent-lime uppercase tracking-widest">
                {catLabel}
              </span>
              <span className="px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider text-gray-400 border-gray-500/30 bg-gray-500/15">
                {statusLabel}
              </span>
              {project.year && (
                <span className="text-[10px] font-mono text-gray-500">{project.year}</span>
              )}
            </div>
            <h2 className="font-display font-medium text-xl md:text-3xl text-white tracking-tight">
              {project.title}
            </h2>
            {/* Tech stack */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {project.tech.map((techItem) => (
                <span
                  key={techItem}
                  className="px-2 py-0.5 text-[9px] font-mono bg-brand-black text-gray-400 border border-white/5 rounded"
                >
                  {techItem}
                </span>
              ))}
            </div>
          </div>

          {/* Demo video — Bilibili embed (rendered only when a valid bvid resolves) */}
          {(() => {
            const bvid = project.mediaUrl ? resolveBilibiliBvid(project.mediaUrl) : null;
            if (!bvid) return null;
            const src = `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&autoplay=0`;
            return (
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] text-brand-accent-lime uppercase tracking-widest">
                  {lang === "zh" ? "演示视频" : "Demo Video"}
                </h3>
                <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-brand-black">
                  <iframe
                    src={src}
                    title={project.title}
                    loading="lazy"
                    scrolling="no"
                    frameBorder={0}
                    allowFullScreen
                    className="block w-full aspect-video"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            );
          })()}

          {/* 1. Overview */}
          <div className="space-y-2">
            <h3 className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">{t.overview}</h3>
            <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{project.overview}</p>
          </div>

          {/* 2. Architecture */}
          <div className="space-y-2">
            <h3 className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">{t.architecture}</h3>
            <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{project.architecture}</p>
          </div>

          {/* 3. Challenges & 4. Solution split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">{t.challenges}</h3>
              <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{project.challenges}</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] text-brand-accent-lime uppercase tracking-widest">{t.solution}</h3>
              <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{project.solution}</p>
            </div>
          </div>

          {/* 5. Performance metrics */}
          <div className="space-y-3">
            <span className="font-mono text-[9px] text-gray-500 tracking-wider block uppercase">{t.metricsTitle}</span>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {project.metrics.map((metric) => (
                <div key={metric.label} className="p-4 rounded-xl bg-brand-gray-900 border border-white/5 flex flex-col justify-between">
                  <span className="text-[10px] font-mono text-gray-500 uppercase">{metric.label}</span>
                  <span className="text-base md:text-lg font-display font-medium text-white tracking-wide mt-1">{metric.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Code snippet */}
          {project.codeSnippet && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-gray-500 tracking-wider uppercase flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-brand-accent-orange" />
                  {lang === "zh" ? "核心代码实现" : "CORE IMPLEMENTATION"}
                </span>
                <button
                  onClick={copyCode}
                  className="px-2.5 py-1 text-[10px] font-mono border border-white/5 hover:border-white/10 bg-brand-black hover:bg-white/5 rounded text-gray-400 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                >
                  {copied ? (
                    <><Check className="w-3 h-3 text-emerald-500" /> {t.copied}</>
                  ) : (
                    <><Copy className="w-3 h-3" /> {t.copyCode}</>
                  )}
                </button>
              </div>

              <div className="rounded-xl border border-white/5 bg-brand-black/40 overflow-hidden shadow-lg">
                <div className="px-4 py-2 bg-brand-black/80 border-b border-white/5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-accent-orange" />
                  <span className="font-mono text-[10px] text-gray-500">
                    {project.tech.includes("HLSL") ? "ComputeShader.hlsl" : "SkeletalSolverNode.cpp"}
                  </span>
                </div>
                <pre className="p-4 overflow-x-auto text-xs font-mono text-gray-300 leading-relaxed bg-brand-charcoal/30 select-text max-h-[300px]">
                  <code>{project.codeSnippet}</code>
                </pre>
              </div>
            </div>
          )}

          {/* 7. Outcomes */}
          <div className="space-y-2">
            <h3 className="font-mono text-[10px] text-brand-accent-lime uppercase tracking-widest">{t.outcomes}</h3>
            <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{project.outcomes}</p>
          </div>

          {/* 8. References — external links render as cards, plain text stays as list */}
          {project.references.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">{t.references}</h3>
              <div className="space-y-2">
                {project.references.map((ref, idx) => {
                  // Resolve a link from the reference string. Supports:
                  //  - Markdown link [text](url) — friendly text + url; internal paths
                  //    (starting with "/") are prefixed with BASE_URL.
                  //  - Bare http(s):// URL — the URL is both the href and the display text.
                  // No link found → render as a plain-text list item (no card).
                  const mdLink = ref.match(/\[([^\]]+)\]\(([^)]+)\)/);
                  const bare = !mdLink && ref.match(/(https?:\/\/[^\s)]+)/);
                  if (mdLink) {
                    const [full, text, url] = mdLink;
                    const [before, after] = ref.split(full);
                    const isExternal = /^https?:\/\//.test(url);
                    const href = isExternal ? url : `${BASE_URL}${url.replace(/^\/+/, "")}`;
                    const isGitHub = /github\.com/i.test(url);
                    const Icon = isGitHub ? Github : ExternalLink;
                    return (
                      <a key={idx} href={href} target="_blank" rel="noopener noreferrer"
                         className="group flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-brand-black/30 hover:bg-brand-black/50 hover:border-white/20 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono text-xs text-white truncate">
                              {before}<span className="text-brand-accent-lime">{text}</span>{after}
                            </span>
                            <span className="font-mono text-[9px] text-gray-500 truncate mt-0.5">{href}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-brand-accent-lime group-hover:translate-x-0.5 transition-all shrink-0" />
                      </a>
                    );
                  }
                  if (bare) {
                    const url = bare[1];
                    const [before, after] = ref.split(url);
                    const isGitHub = /github\.com/i.test(url);
                    const Icon = isGitHub ? Github : ExternalLink;
                    return (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                         className="group flex items-center justify-between gap-4 p-4 rounded-xl border border-white/10 bg-brand-black/30 hover:bg-brand-black/50 hover:border-white/20 transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono text-xs text-white truncate">
                              <span className="text-gray-400">{before}</span><span className="text-brand-accent-lime">{url}</span><span className="text-gray-400">{after}</span>
                            </span>
                            <span className="font-mono text-[9px] text-gray-500 truncate mt-0.5">{(() => { try { return new URL(url).hostname; } catch { return url; } })()}</span>
                          </div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-brand-accent-lime group-hover:translate-x-0.5 transition-all shrink-0" />
                      </a>
                    );
                  }
                  // Plain-text reference — no link, keep the original list style.
                  return (
                    <div key={idx} className="text-xs text-gray-400 font-mono flex items-start gap-2 px-1">
                      <span className="text-gray-600 select-none">›</span>
                      <span>{ref}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 9. Deep-dive exit — prominent link to the knowledge article */}
          <div className="pt-4 border-t border-white/5">
            <a
              href={articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-4 p-5 rounded-xl border border-brand-accent-lime/30 bg-brand-accent-lime/5 hover:bg-brand-accent-lime/10 hover:border-brand-accent-lime/50 transition-all"
              id="project-read-deep-dive"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-brand-accent-lime shrink-0" />
                <div className="flex flex-col">
                  <span className="font-display font-bold text-base text-white">
                    {lang === "zh" ? "阅读完整技术详解" : "Read the Full Deep Dive"}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 mt-0.5">
                    {lang === "zh" ? "数学推导 · 代码落地 · 设计决策" : "Math derivations · code · design rationale"}
                  </span>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-brand-accent-lime group-hover:translate-x-1 transition-transform shrink-0" />
            </a>
          </div>
        </div>

        {/* Footer toolbar */}
        <div className="glass-panel border-t border-white/5 py-4 px-6 md:px-8 flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>NITE ENGINE EXTENSION PROTOCOL // 0x7FBA</span>
          <button
            onClick={onClose}
            className="text-white hover:text-brand-accent-orange transition-colors cursor-pointer uppercase"
          >
            {t.closeStream}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
