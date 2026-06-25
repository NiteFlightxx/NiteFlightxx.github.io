import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Cpu, Activity, Database, Check, Copy, FileCode, Zap } from "lucide-react";
import { Project } from "../types";

interface ProjectDetailModalProps {
  project: Project;
  onClose: () => void;
  lang: "zh" | "en";
}

export default function ProjectDetailModal({ project, onClose, lang }: ProjectDetailModalProps) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (project.codeSnippet) {
      navigator.clipboard.writeText(project.codeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
              {lang === "zh" ? "系统核心工程日志 // " : "ENGINEERING LOG // "}{project.category.replace(" ", "_").toUpperCase()}
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

        {/* Modal content body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
          {/* Top Title and Summary Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="font-display font-medium text-xl md:text-3xl text-white tracking-tight">
                {project.title}
              </h2>
              <p className="text-sm md:text-base text-gray-300 leading-relaxed font-sans font-light">
                {project.extendedDetails}
              </p>
              
              <div className="flex flex-wrap gap-1.5 pt-2">
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

            {/* Performance KPI Cards (Linear style) */}
            <div className="space-y-3">
              <span className="font-mono text-[9px] text-gray-500 tracking-wider block uppercase">
                {lang === "zh" ? "物理求解器核心性能指标" : "CRITICAL SOLVER METRICS"}
              </span>
              
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                {project.metrics.map((metric, idx) => (
                  <div
                    key={metric.label}
                    className="p-4 rounded-xl bg-brand-gray-900 border border-white/5 flex flex-col justify-between"
                  >
                    <span className="text-[10px] font-mono text-gray-500 uppercase">
                      {metric.label}
                    </span>
                    <span className="text-base md:text-lg font-display font-medium text-white tracking-wide mt-1">
                      {metric.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Code block & Visual Prompt Split Section */}
          {project.codeSnippet && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-gray-500 tracking-wider uppercase flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-brand-accent-orange" />
                  {lang === "zh" ? "核心算法控制与数值推导实现" : "CORE ALGORITHMIC IMPLEMENTATION"}
                </span>
                
                <button
                  onClick={copyCode}
                  className="px-2.5 py-1 text-[10px] font-mono border border-white/5 hover:border-white/10 bg-brand-black hover:bg-white/5 rounded text-gray-400 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" /> {lang === "zh" ? "已复制" : "COPIED"}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> {lang === "zh" ? "复制代码" : "COPY CODE"}
                    </>
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

          {/* Simulated Cinematic Viewport prompt */}
          <div className="p-5 rounded-xl bg-brand-gray-900 border border-white/5 space-y-3">
            <div className="flex items-center gap-2 text-gray-400 font-mono text-[10px]">
              <Zap className="w-3.5 h-3.5 text-brand-accent-orange" />
              <span>{lang === "zh" ? "电影级光线追踪视口仿真元数据" : "CINEMATIC RAYTRACED VIEWPORT METADATA"}</span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed italic font-serif">
              "{project.visualPrompt}"
            </p>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between items-center text-[9px] font-mono text-gray-500">
              <span>POST_PROCESS: FILM_GRAIN [0.15]</span>
              <span>SAMPLING: DLSS_3.7_PRESET_G</span>
              <span>RENDERER: SUB_LUMEN_ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Footer toolbar */}
        <div className="glass-panel border-t border-white/5 py-4 px-6 md:px-8 flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>VANCE ENGINE EXTENSION PROTOCOL // 0x7FBA</span>
          <button
            onClick={onClose}
            className="text-white hover:text-brand-accent-orange transition-colors cursor-pointer uppercase"
          >
            {lang === "zh" ? "关闭流视窗" : "CLOSE STREAM"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
