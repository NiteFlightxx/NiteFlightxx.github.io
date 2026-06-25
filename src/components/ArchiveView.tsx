import React from "react";
import { motion } from "motion/react";
import { Cpu, Calendar } from "lucide-react";
import type { SkillCategory, TimelineEvent } from "../types";
import BorderGlow from "./BorderGlow";
import { UI_TRANSLATIONS } from "../translations";

interface ArchiveViewProps {
  skills: SkillCategory[];
  timeline: TimelineEvent[];
  lang: "zh" | "en";
}

export default function ArchiveView({ skills, timeline, lang }: ArchiveViewProps) {
  const t = UI_TRANSLATIONS[lang];

  return (
    <div className="space-y-20 pb-20 select-none" id="archive-view-container">
      {/* Profile Overview — 技术方向 / 研究兴趣 / 专业领域 */}
      <section className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        <div className="md:col-span-2 space-y-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {t.profileOverview}
          </span>
          <h1 className="font-display font-black text-4xl md:text-5xl text-white tracking-tighter leading-tight">
            {t.narrativeHeadline}
          </h1>
          <div className="space-y-3 text-xs font-mono text-gray-400">
            <div className="flex gap-2">
              <span className="text-gray-500 min-w-[64px]">{t.techDirection}:</span>
              <span className="text-gray-300">Unreal Engine · 物理模拟 · 动画系统</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 min-w-[64px]">{t.researchInterest}:</span>
              <span className="text-gray-300">XPBD · Motion Matching · 飞控 · Agent NPC</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 min-w-[64px]">{t.expertise}:</span>
              <span className="text-gray-300">C++ 引擎子系统 · HLSL 计算着色器 · GAS · Chaos</span>
            </div>
          </div>
        </div>

        {/* Quick summary card */}
        <div className="w-full">
          <BorderGlow
            edgeSensitivity={30}
            glowColor="76 95 64"
            backgroundColor="#121214"
            borderRadius={12}
            glowRadius={40}
            glowIntensity={1.1}
            coneSpread={20}
            colors={["#bcfd49", "#6366f1", "#4f46e5"]}
            fillOpacity={0.15}
            className="w-full"
          >
            <div className="p-6 space-y-4">
              <span className="font-mono text-[9px] text-gray-500 uppercase tracking-wider block border-b border-white/5 pb-2">
                {lang === "zh" ? "档案速览" : "ARCHIVE SUMMARY"}
              </span>
              <div className="space-y-3 font-sans text-xs text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.experience}</span>
                  <span className="font-mono font-medium">{lang === "zh" ? "8年+" : "8+ YEARS"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.language}</span>
                  <span className="font-mono font-medium">C++ / HLSL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.platforms}</span>
                  <span className="font-mono font-medium">PC / PS5 / XSX</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t.location}</span>
                  <span className="font-mono font-medium">{lang === "zh" ? "—" : "—"}</span>
                </div>
              </div>
            </div>
          </BorderGlow>
        </div>
      </section>

      {/* Skill Matrix — 6 categories */}
      <section className="max-w-5xl mx-auto px-6 space-y-10">
        <div className="space-y-2 border-b border-white/5 pb-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {t.systemProficiencies}
          </span>
          <h2 className="font-display font-medium text-2xl text-white tracking-tight">
            {t.techStackProfile}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {skills.map((cat) => (
            <div key={cat.name} className="space-y-6">
              <h3 className="font-display font-semibold text-xs text-brand-accent-silver tracking-widest uppercase flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand-accent-orange" />
                {cat.name}
              </h3>

              <div className="space-y-5">
                {cat.skills.map((skill) => (
                  <div key={skill.name} className="space-y-1.5 group">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-gray-300 group-hover:text-white transition-colors">{skill.name}</span>
                      <span className="text-brand-accent-orange font-medium">{skill.proficiency}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-brand-charcoal rounded-full overflow-hidden border border-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${skill.proficiency}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-white group-hover:bg-brand-accent-orange transition-colors duration-300"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed font-sans group-hover:text-gray-400 transition-colors">
                      {skill.details}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Career Timeline — 成长轨迹 */}
      <section className="max-w-4xl mx-auto px-6 space-y-12">
        <div className="space-y-2 border-b border-white/5 pb-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {t.professionalTimeline}
          </span>
          <h2 className="font-display font-medium text-2xl text-white tracking-tight">
            {t.careerChronology}
          </h2>
        </div>

        <div className="relative border-l border-white/5 pl-6 space-y-12 ml-4">
          {timeline.map((event, idx) => (
            <motion.div
              key={event.company + idx}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="relative space-y-3"
            >
              <span className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-brand-accent-orange ring-4 ring-brand-black" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm tracking-wide">{event.role}</span>
                  <span className="text-gray-500">@</span>
                  <span className="text-gray-300 text-sm font-display font-medium">{event.company}</span>
                </div>
                <span className="text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-600" /> {event.year}
                </span>
              </div>

              {event.project && (
                <div className="text-[10px] font-mono text-brand-accent-lime uppercase tracking-wider">
                  {lang === "zh" ? "项目: " : "PROJECT: "}{event.project}
                </div>
              )}

              <p className="text-xs text-gray-400 leading-relaxed font-sans font-light">
                {event.description}
              </p>

              {/* Outcomes */}
              {event.outcomes.length > 0 && (
                <ul className="space-y-1.5 pl-4 pt-1">
                  {event.outcomes.map((outcome, oIdx) => (
                    <li key={oIdx} className="text-xs text-gray-300 flex items-start gap-2 leading-relaxed">
                      <span className="text-brand-accent-lime font-mono text-[10px] mt-0.5 select-none">★</span>
                      <span className="font-light">{outcome}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Highlights */}
              {event.highlights.length > 0 && (
                <ul className="space-y-1.5 pl-4 pt-1">
                  {event.highlights.map((hl, hlIdx) => (
                    <li key={hlIdx} className="text-xs text-gray-300 flex items-start gap-2 leading-relaxed">
                      <span className="text-brand-accent-orange font-mono text-[10px] mt-0.5 select-none">›</span>
                      <span className="font-light">{hl}</span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
