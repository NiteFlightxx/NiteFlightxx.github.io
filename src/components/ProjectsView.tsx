import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sliders, ArrowUpRight } from "lucide-react";
import type { Project } from "../types";
import type { ProjectStatus } from "../lib/taxonomy";
import { PROJECT_CATEGORIES, projectCategoryZh, projectStatusZh } from "../lib/taxonomy";
import { UI_TRANSLATIONS } from "../translations";
import BorderGlow from "./BorderGlow";

// Status → badge styling. Exported so HomeView featured cards reuse the same look.
export const STATUS_BADGE: Record<ProjectStatus, string> = {
  completed: "bg-brand-accent-lime/15 text-brand-accent-lime border-brand-accent-lime/30",
  experimental: "bg-brand-accent-orange/15 text-brand-accent-orange border-brand-accent-orange/30",
  archived: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

interface ProjectsViewProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  lang: "zh" | "en";
}

export default function ProjectsView({ projects, onSelectProject, lang }: ProjectsViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categoryEntries = Object.entries(PROJECT_CATEGORIES);

  const filteredProjects = selectedCategory === "All"
    ? projects
    : projects.filter((p) => p.category === selectedCategory);

  return (
    <div className="space-y-12 pb-20 select-none" id="projects-view-container">
      {/* Intro Header */}
      <div className="max-w-4xl mx-auto text-center space-y-4 px-6">
        <span className="font-mono text-xs text-brand-accent-lime uppercase tracking-widest">
          {lang === "zh" ? "已完成 · 具有工程价值的系统" : "ENGINEERED SYSTEMS"}
        </span>
        <h1 className="font-display font-black text-4xl md:text-6xl text-white tracking-tighter">
          {lang === "zh" ? "项目" : "Projects"}
        </h1>
        <p className="font-serif italic text-xl md:text-2xl text-brand-accent-gold-light tracking-wide">
          {t.capabilityTagline}
        </p>
        <p className="font-sans text-base md:text-lg text-gray-300 max-w-2xl mx-auto font-light leading-relaxed">
          {lang === "zh"
            ? "以工程实现为核心的真实系统集合，而非作品展示。"
            : "Real systems centered on engineering implementation, not a portfolio showcase."}
        </p>
      </div>

      {/* Categories Toolbar Filter */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-2 text-sm font-mono text-gray-300">
            <Sliders className="w-4.5 h-4.5 text-brand-accent-lime" />
            <span>{t.filterSpecialization}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-brand-charcoal/40 p-1.5 border border-white/5 rounded-lg">
            <button
              onClick={() => setSelectedCategory("All")}
              className={`px-4 py-2 text-xs font-mono tracking-wider uppercase rounded-md cursor-pointer transition-all duration-200 ${
                selectedCategory === "All"
                  ? "bg-brand-gray-800 text-brand-accent-lime border border-brand-accent-lime/30 shadow-lg"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              }`}
              id="filter-btn-all"
            >
              {t.all}
            </button>
            {categoryEntries.map(([id, labelZh]) => {
              const isActive = selectedCategory === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedCategory(id)}
                  className={`px-4 py-2 text-xs font-mono tracking-wider uppercase rounded-md cursor-pointer transition-all duration-200 ${
                    isActive
                      ? "bg-brand-gray-800 text-brand-accent-lime border border-brand-accent-lime/30 shadow-lg"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                  id={`filter-btn-${id.toLowerCase()}`}
                >
                  {lang === "zh" ? labelZh : id}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filtered Grid */}
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          <AnimatePresence mode="popLayout">
            {filteredProjects.map((proj) => (
              <motion.div
                layout
                key={proj.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onSelectProject(proj)}
                className="group cursor-pointer"
              >
                <BorderGlow
                  edgeSensitivity={35}
                  glowColor="76 95 64"
                  backgroundColor="#121214"
                  borderRadius={20}
                  glowRadius={55}
                  glowIntensity={1.25}
                  coneSpread={22}
                  colors={["#bcfd49", "#6366f1", "#4f46e5"]}
                  fillOpacity={0.18}
                  className="h-full"
                >
                  <div className="flex flex-col h-full justify-between">
                    {/* Info block */}
                    <div className="p-6 md:p-8 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider ${STATUS_BADGE[proj.status]}`}>
                              {lang === "zh" ? projectStatusZh(proj.status) : proj.status}
                            </span>
                            <span className="text-brand-accent-lime uppercase tracking-wider font-semibold">
                              {lang === "zh" ? projectCategoryZh(proj.category) : proj.category}
                            </span>
                            {proj.year && <span className="text-gray-500">{proj.year}</span>}
                          </div>
                          <span className="text-gray-400 group-hover:text-white transition-colors flex items-center gap-1">
                            {t.examine} <ArrowUpRight className="w-3.5 h-3.5 text-brand-accent-lime" />
                          </span>
                        </div>

                        <h3 className="font-display font-bold text-xl md:text-2xl text-white group-hover:text-brand-accent-lime transition-colors">
                          {proj.title}
                        </h3>

                        <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-3">
                          {proj.overview}
                        </p>

                        {/* Visual Prompt Quote block */}
                        {proj.visualPrompt && (
                          <div className="text-xs text-gray-400 italic border-l-2 border-brand-accent-lime/40 pl-3 py-0.5 leading-relaxed bg-brand-black/20 rounded-r pr-2 font-serif">
                            "{proj.visualPrompt}"
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 pt-4 mt-auto">
                        {/* Split metric grid */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                          {proj.metrics.slice(0, 2).map((m) => (
                            <div key={m.label} className="flex flex-col">
                              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">{m.label}</span>
                              <span className="text-xs font-mono text-white font-semibold">{m.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1">
                          {proj.tech.map((techItem) => (
                            <span
                              key={techItem}
                              className="px-2 py-0.5 text-[9px] font-mono bg-brand-black text-gray-400 border border-white/5 rounded"
                            >
                              {techItem}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </BorderGlow>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
