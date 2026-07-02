import React from "react";
import { Cpu } from "lucide-react";
import type { SkillCategory } from "../types";
import { UI_TRANSLATIONS } from "../translations";

interface ArchiveViewProps {
  skills: SkillCategory[];
  lang: "zh" | "en";
}

// 五条核心描述 — 档案概览的主体内容，中英双语。
const PROFILE_PILLARS = [
  {
    labelZh: "核心方向",
    labelEn: "Core Direction",
    zh: "专注于 Unreal Engine 角色运动技术，研究动画、程序动画、角色物理与实时交互系统。",
    en: "Focused on Unreal Engine character motion technology, researching animation, procedural animation, character physics, and real-time interaction systems.",
  },
  {
    labelZh: "设计理念",
    labelEn: "Design Philosophy",
    zh: "通过动画、物理模拟与控制算法的协同，构建真实、自然且富有表现力的角色运动体验。",
    en: "Through the synergy of animation, physics simulation, and control algorithms, building authentic, natural, and expressive character motion experiences.",
  },
  {
    labelZh: "工程实践",
    labelEn: "Engineering Practice",
    zh: "深入探索 Active Ragdoll、程序动画、Chaos Physics、实时交互等角色技术，并关注运动表现的设计与调校。",
    en: "Deeply exploring character technologies such as Active Ragdoll, procedural animation, Chaos Physics, and real-time interaction, with attention to the design and tuning of motion performance.",
  },
  {
    labelZh: "底层研究",
    labelEn: "Foundational Research",
    zh: "持续研究 Unreal Engine 源码、实时物理仿真与控制理论，从底层原理到工程实践不断完善角色运动系统。",
    en: "Continuously studying Unreal Engine source, real-time physics simulation, and control theory, refining the character motion system from underlying principles to engineering practice.",
  },
  {
    labelZh: "最终目标",
    labelEn: "Ultimate Goal",
    zh: "致力于让角色真正感知环境、遵循物理规律，并与玩家和游戏世界建立可信、自然的实时交互。",
    en: "Committed to making characters truly perceive their environment, follow physical laws, and build credible, natural real-time interactions with players and the game world.",
  },
];

export default function ArchiveView({ skills, lang }: ArchiveViewProps) {
  const t = UI_TRANSLATIONS[lang];

  return (
    <div className="space-y-20 pb-20 select-none" id="archive-view-container">
      {/* Profile Overview — 技术方向 / 研究兴趣 / 专业领域 */}
      <section className="max-w-4xl mx-auto px-6">
        <div className="space-y-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {t.profileOverview}
          </span>
          <h1 className="font-display font-black text-4xl md:text-5xl text-white tracking-tighter leading-tight">
            {t.narrativeHeadline}
          </h1>
          <div className="space-y-5">
            {PROFILE_PILLARS.map((p) => (
              <div key={p.labelZh} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-brand-accent-lime" />
                  <span className="font-mono text-[10px] text-brand-accent-lime uppercase tracking-widest">
                    {lang === "zh" ? p.labelZh : p.labelEn}
                  </span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed font-sans font-light pl-3">
                  {lang === "zh" ? p.zh : p.en}
                </p>
              </div>
            ))}
          </div>
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
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-brand-accent-lime select-none">›</span>
                      <span className="text-gray-300 group-hover:text-white transition-colors">{skill.name}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed font-sans group-hover:text-gray-400 transition-colors pl-4">
                      {skill.details}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
