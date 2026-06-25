import React, { useState } from "react";
import { motion } from "motion/react";
import { Calendar, ArrowRight } from "lucide-react";
import type { ContentArticle } from "../types";
import { labTopicZh, type LabTopic } from "../lib/taxonomy";
import ResearchMap from "./ResearchMap";
import BorderGlow from "./BorderGlow";
import { UI_TRANSLATIONS } from "../translations";

interface LabViewProps {
  experiments: ContentArticle[];
  onSelectExperiment: (exp: ContentArticle) => void;
  lang: "zh" | "en";
}

export default function LabView({ experiments, onSelectExperiment, lang }: LabViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const [filterTopic, setFilterTopic] = useState<LabTopic | null>(null);

  // Lab articles surface their `topic` as a localized `category` (see loadLab), so
  // the filter compares against the localized label rather than the raw enum.
  const filtered = filterTopic
    ? experiments.filter((e) => e.category === labTopicZh(filterTopic))
    : experiments;

  return (
    <div className="space-y-12 pb-20 select-none" id="lab-view-container">
      {/* Intro Header */}
      <div className="max-w-4xl mx-auto text-center space-y-4 px-6">
        <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">
          {lang === "zh" ? "研究记录 · 数学推导 · 原型开发" : "RESEARCH · DERIVATION · PROTOTYPING"}
        </span>
        <h1 className="font-display font-black text-4xl md:text-6xl text-white tracking-tighter">
          {lang === "zh" ? "实验室" : "Lab"}
        </h1>
        <p className="font-sans text-sm md:text-base text-gray-400 max-w-xl mx-auto font-light leading-relaxed">
          {lang === "zh"
            ? "展示思考过程而非结论。包含数学推导、算法探索、实验验证与原型开发，强调研究过程。"
            : "Showing the process of thinking, not just conclusions. Math derivations, algorithm exploration, and prototyping."}
        </p>
      </div>

      {/* Research Map tree */}
      <div className="max-w-5xl mx-auto px-6">
        <ResearchMap activeDomain={filterTopic} onSelectDomain={setFilterTopic} lang={lang} />
      </div>

      {/* Experiment cards */}
      <div className="max-w-4xl mx-auto px-6 space-y-4">
        {filtered.length > 0 ? (
          filtered.map((exp) => (
            <motion.div
              key={exp.id}
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
                <div onClick={() => onSelectExperiment(exp)} className="p-6 md:p-8 flex flex-col gap-4">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-brand-accent-lime uppercase tracking-wider font-semibold">
                      {exp.category}
                    </span>
                    <div className="flex items-center gap-3 text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {exp.date}
                      </span>
                    </div>
                  </div>

                  <h2 className="font-display font-semibold text-lg md:text-xl text-white group-hover:text-brand-accent-lime transition-colors tracking-wide">
                    {exp.title}
                  </h2>

                  {exp.excerpt && (
                    <p className="text-xs md:text-sm text-gray-400 leading-relaxed font-sans font-light">
                      {exp.excerpt}
                    </p>
                  )}

                  <div className="flex items-center justify-between font-mono text-[9px] text-gray-500 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-1.5">
                      {exp.tags.map((tag) => (
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
            </motion.div>
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
