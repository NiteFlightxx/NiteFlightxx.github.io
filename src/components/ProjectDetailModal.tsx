import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Check, Copy, FileCode } from "lucide-react";
import type { Project } from "../types";
import { projectCategoryZh } from "../lib/taxonomy";
import { UI_TRANSLATIONS } from "../translations";

// Site base path (GitHub Pages sub-path aware), same convention as KnowledgeView.
const BASE_URL = import.meta.env.BASE_URL;

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
          {/* Title + category */}
          <div className="space-y-3 border-b border-white/5 pb-6">
            <span className="text-[10px] font-mono text-brand-accent-lime uppercase tracking-widest">
              {catLabel}
            </span>
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

          {/* 7. References */}
          {project.references.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">{t.references}</h3>
              <ul className="space-y-1">
                {project.references.map((ref, idx) => {
                  // Render links inside a reference as clickable anchors. Supports:
                  //  - Markdown link [text](url) — displays the friendly text; internal
                  //    paths (starting with "/") are prefixed with BASE_URL.
                  //  - Bare http(s):// URL — displays the URL itself as the link text.
                  const mdLink = ref.match(/\[([^\]]+)\]\(([^)]+)\)/);
                  if (mdLink) {
                    const [full, text, url] = mdLink;
                    const [before, after] = ref.split(full);
                    const isExternal = /^https?:\/\//.test(url);
                    const href = isExternal
                      ? url
                      : `${BASE_URL}${url.replace(/^\/+/, "")}`;
                    return (
                      <li key={idx} className="text-xs text-gray-400 font-mono flex items-start gap-2">
                        <span className="text-gray-600 select-none">›</span>
                        <span className="break-all">
                          {before}
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-accent-lime hover:underline"
                          >
                            {text}
                          </a>
                          {after}
                        </span>
                      </li>
                    );
                  }
                  const urlMatch = ref.match(/(https?:\/\/[^\s)]+)/);
                  if (urlMatch) {
                    const url = urlMatch[1];
                    const [before, after] = ref.split(url);
                    return (
                      <li key={idx} className="text-xs text-gray-400 font-mono flex items-start gap-2">
                        <span className="text-gray-600 select-none">›</span>
                        <span className="break-all">
                          {before}
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-accent-lime hover:underline"
                          >
                            {url}
                          </a>
                          {after}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={idx} className="text-xs text-gray-400 font-mono flex items-start gap-2">
                      <span className="text-gray-600 select-none">›</span>
                      <span>{ref}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 8. Outcomes */}
          <div className="space-y-2">
            <h3 className="font-mono text-[10px] text-brand-accent-lime uppercase tracking-widest">{t.outcomes}</h3>
            <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{project.outcomes}</p>
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
