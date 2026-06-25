import React from "react";
import { motion } from "motion/react";
import { ShieldCheck, Cpu, Award, Milestone, Calendar, ArrowUpRight } from "lucide-react";
import type { SkillCategory, TimelineEvent } from "../types";
import BorderGlow from "./BorderGlow";

interface AboutViewProps {
  skills: SkillCategory[];
  timeline: TimelineEvent[];
  lang: "zh" | "en";
}

export default function AboutView({ skills, timeline, lang }: AboutViewProps) {
  return (
    <div className="space-y-20 pb-20 select-none" id="about-view-container">
      {/* Narrative Headline */}
      <section className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        <div className="md:col-span-2 space-y-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {lang === "zh" ? "个人履历概要" : "PROFILE OVERVIEW"}
          </span>
          <h1 className="font-display font-black text-4xl md:text-5xl text-white tracking-tighter leading-tight">
            {lang === "zh"
              ? "构建大规模高交互物理模拟与实时图形渲染系统。"
              : "Architecting interactive physics and rendering at scale."}
          </h1>
          <div className="font-sans text-sm md:text-base text-gray-300 leading-relaxed font-light space-y-4">
            <p>
              {lang === "zh"
                ? "我是 Marcus Vance，一名拥有超过 8 年虚幻引擎底层研发经验的资深物理模拟与技术美术专家。我的核心工作聚焦于在虚幻引擎5（UE5）中高度定制流体求解器、结构力学形变算法，以及针对客户端/服务器网络预测进行物理复制优化。"
                : "I am Marcus Vance, a Lead Physics and Technical Art Engineer with over 8 years of experience building custom low-level solutions for real-time applications. My work focuses on integrating fluid solvers, structural dynamics, and predictive gameplay logic directly inside Unreal Engine 5."}
            </p>
            <p>
              {lang === "zh"
                ? "行走在数值分析与图像渲染管线的交汇边缘，我常年编写定制化的 C++ 引擎子系统、Niagara GPU 粒子行为模式，和精简版 HLSL 计算着色器，力求在严苛的游戏实时帧率预算中交付兼具技术细节与视觉震撼的动力学物理表现。"
                : "Working at the intersection of mathematical physics and rendering pipelines, I expand game engine capabilities by authoring custom C++ subsystems, Niagara modules, and HLSL compute shaders. I specialize in designing systems that achieve high performance under strict render budgets."}
            </p>
          </div>
        </div>

        {/* Floating Quick Summary Card (Apple styled) */}
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
                {lang === "zh" ? "核心档案速览" : "ENGINEER SUMMARY"}
              </span>
              <div className="space-y-3 font-sans text-xs text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-500">{lang === "zh" ? "专业研发资历:" : "EXPERIENCE:"}</span>
                  <span className="font-mono font-medium">{lang === "zh" ? "8年+ 资深研发" : "8+ YEARS"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{lang === "zh" ? "核心着色/语言:" : "LANGUAGE:"}</span>
                  <span className="font-mono font-medium">C++ / HLSL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{lang === "zh" ? "目标硬体平台:" : "PLATFORMS:"}</span>
                  <span className="font-mono font-medium">PC / PS5 / XSX</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{lang === "zh" ? "现居地区:" : "LOCATION:"}</span>
                  <span className="font-mono font-medium">{lang === "zh" ? "美国加州洛杉矶" : "LOS ANGELES, CA"}</span>
                </div>
              </div>
            </div>
          </BorderGlow>
        </div>
      </section>

      {/* Interactive Core Skill Profiles (Linear Matrix style) */}
      <section className="max-w-5xl mx-auto px-6 space-y-10">
        <div className="space-y-2 border-b border-white/5 pb-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {lang === "zh" ? "系统特长矩阵" : "SYSTEM PROFICIENCIES"}
          </span>
          <h2 className="font-display font-medium text-2xl text-white tracking-tight">
            {lang === "zh" ? "专业技术栈 profile" : "Technical Stack Profile"}
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
                    {/* Progress Bar Track */}
                    <div className="h-1.5 w-full bg-brand-charcoal rounded-full overflow-hidden border border-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${skill.proficiency}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-white group-hover:bg-brand-accent-orange transition-colors duration-300"
                      />
                    </div>
                    {/* Tooltip Description */}
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

      {/* Professional Timeline / Career Path */}
      <section className="max-w-4xl mx-auto px-6 space-y-12">
        <div className="space-y-2 border-b border-white/5 pb-4">
          <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest block">
            {lang === "zh" ? "职业生涯足迹编年史" : "PROFESSIONAL TIMELINE"}
          </span>
          <h2 className="font-display font-medium text-2xl text-white tracking-tight">
            {lang === "zh" ? "生涯时间线记录" : "Career Chronology"}
          </h2>
        </div>

        <div className="relative border-l border-white/5 pl-6 space-y-12 ml-4">
          {timeline.map((event, idx) => (
            <motion.div
              key={event.company}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="relative space-y-3"
            >
              {/* Timeline dot */}
              <span className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-brand-accent-orange ring-4 ring-brand-black" />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm tracking-wide">{event.role}</span>
                  <span className="text-gray-500">@</span>
                  <span className="text-gray-300 text-sm font-display font-medium flex items-center gap-0.5">
                    {event.company}
                  </span>
                </div>
                <span className="text-gray-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-600" /> {event.year}
                </span>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed font-sans font-light">
                {event.description}
              </p>

              {/* Highlights List */}
              <ul className="space-y-1.5 pl-4 pt-1">
                {event.highlights.map((hl, hlIdx) => (
                  <li key={hlIdx} className="text-xs text-gray-300 flex items-start gap-2 leading-relaxed">
                    <span className="text-brand-accent-orange font-mono text-[10px] mt-0.5 select-none">›</span>
                    <span className="font-light">{hl}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
