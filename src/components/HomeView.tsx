import React from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { ArrowRight, Calendar } from "lucide-react";
import type { Project, ContentArticle } from "../types";
import { projectCategoryZh } from "../lib/taxonomy";
import { UI_TRANSLATIONS } from "../translations";
import BorderGlow from "./BorderGlow";

interface HomeViewProps {
  projects: Project[];
  knowledgeArticles: ContentArticle[];
  labExperiments: ContentArticle[];
  onSelectProject: (project: Project) => void;
  onSelectArticle: (article: ContentArticle) => void;
  onSelectExperiment: (experiment: ContentArticle) => void;
  setActiveTab: (tab: string) => void;
  heroImageUrl: string;
  lang: "zh" | "en";
}

export default function HomeView({
  projects,
  knowledgeArticles,
  labExperiments,
  onSelectProject,
  onSelectArticle,
  onSelectExperiment,
  setActiveTab,
  heroImageUrl,
  lang,
}: HomeViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const zh = lang === "zh";

  // Aggregated highlights (by content value, not by source)
  const featured = projects.slice(0, 2);
  const recentKnowledge = knowledgeArticles.slice(0, 2);
  const currentExperiments = labExperiments.slice(0, 2);
  // Research timeline: most recent lab experiments by date
  const researchTimeline = labExperiments.slice(0, 4);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.05 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-24 pb-20"
      id="home-view-container"
    >
      {/* ===== Hero ===== */}
      <section className="relative min-h-[85vh] flex items-center justify-center pt-12 select-none">
        <div className="absolute inset-0 overflow-hidden -z-10 flex items-center justify-center">
          <div className="absolute w-[500px] h-[500px] bg-brand-accent-orange/5 glow-ambient -top-20" />
          <div className="absolute w-[600px] h-[400px] bg-white/5 glow-ambient bottom-10" />
          <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />
          <div className="absolute right-0 top-1/4 w-full max-w-[650px] aspect-video opacity-10 blur-xl pointer-events-none">
            <img src={heroImageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-full" />
          </div>
        </div>

        <div className="w-full max-w-5xl mx-auto px-6 text-center space-y-8 relative z-10">
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-brand-accent-lime/30 bg-brand-charcoal/90 text-xs font-mono tracking-widest text-brand-accent-lime uppercase shadow-[0_4px_20px_rgba(188,253,73,0.1)]"
          >
            <span className="w-2 h-2 rounded-full bg-brand-accent-lime animate-pulse" />
            {t.role}
          </motion.div>

          <div className="space-y-4">
            <motion.h1
              variants={itemVariants}
              className="font-display font-black text-6xl md:text-9xl tracking-tighter leading-none bg-gradient-to-r from-white via-brand-accent-gold-light to-brand-accent-lime bg-clip-text text-transparent drop-shadow-[0_4px_15px_rgba(188,253,73,0.15)]"
            >
              NITE
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className="font-sans font-bold text-lg md:text-2xl text-brand-accent-gold-light tracking-widest uppercase leading-normal"
            >
              {t.title}
            </motion.p>
          </div>

          <motion.p
            variants={itemVariants}
            className="font-sans text-2xl md:text-4xl text-gray-100 max-w-4xl mx-auto font-normal leading-relaxed tracking-wide italic font-serif"
          >
            {t.statement}
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <button
              onClick={() => setActiveTab("projects")}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-brand-accent-lime hover:bg-white text-black font-extrabold text-sm tracking-widest uppercase transition-all duration-300 shadow-[0_4px_25px_rgba(188,253,73,0.25)] flex items-center justify-center gap-2 cursor-pointer"
              id="hero-explore-projects"
            >
              {t.exploreWork} <ArrowRight className="w-4.5 h-4.5 stroke-[2.5]" />
            </button>
            <button
              onClick={() => setActiveTab("archive")}
              className="w-full sm:w-auto px-8 py-4 rounded-full border border-brand-accent-lime/40 bg-brand-charcoal hover:bg-brand-gray-900/80 hover:border-brand-accent-lime transition-all duration-300 text-sm text-brand-accent-lime font-bold tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              id="hero-view-profile"
            >
              {t.viewProfile}
            </button>
          </motion.div>
        </div>
      </section>

      {/* ===== Featured Systems (from Projects) ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-8">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-white/5 pb-4">
          <div className="space-y-1">
            <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.featuredSystems}</h2>
          </div>
          <button
            onClick={() => setActiveTab("projects")}
            className="group flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors cursor-pointer"
            id="view-all-projects-btn"
          >
            {t.viewAllProjects} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {featured.map((proj) => (
            <motion.div
              key={proj.id}
              variants={itemVariants}
              onClick={() => onSelectProject(proj)}
              className="group cursor-pointer"
            >
              <BorderGlow
                edgeSensitivity={35}
                glowColor="76 95 64"
                backgroundColor="#121214"
                borderRadius={20}
                glowRadius={60}
                glowIntensity={1.3}
                coneSpread={22}
                colors={["#bcfd49", "#6366f1", "#4f46e5"]}
                fillOpacity={0.2}
                className="h-full"
              >
                <div className="flex flex-col h-full justify-between">
                  <div className="p-6 md:p-8 space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs font-mono text-brand-accent-lime">
                        <span>{(zh ? projectCategoryZh(proj.category) : proj.category).toUpperCase()}</span>
                      </div>
                      <h3 className="font-display font-bold text-xl md:text-2xl text-white group-hover:text-brand-accent-lime transition-colors">
                        {proj.title}
                      </h3>
                      <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-3">{proj.overview}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-4 border-t border-white/5 mt-auto">
                      {proj.tech.slice(0, 4).map((techItem) => (
                        <span key={techItem} className="px-2 py-0.5 text-[8px] font-mono bg-brand-black text-gray-500 border border-white/5 rounded">
                          {techItem}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </BorderGlow>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ===== Recent Knowledge (from Knowledge) ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-8">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-white/5 pb-4">
          <div className="space-y-1">
            <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.recentKnowledge}</h2>
          </div>
          <button
            onClick={() => setActiveTab("knowledge")}
            className="group flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors cursor-pointer"
            id="view-all-knowledge-btn"
          >
            {t.viewAllKnowledge} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </motion.div>

        <div className="space-y-4">
          {recentKnowledge.map((art) => (
            <BorderGlow
              key={art.id}
              edgeSensitivity={30}
              glowColor="76 95 64"
              backgroundColor="#121214"
              borderRadius={12}
              glowRadius={40}
              glowIntensity={1.1}
              coneSpread={20}
              colors={["#bcfd49", "#6366f1", "#4f46e5"]}
              fillOpacity={0.15}
              className="group cursor-pointer"
            >
              <div onClick={() => onSelectArticle(art)} className="p-6 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-brand-accent-lime">{art.category.toUpperCase()}</span>
                  <span className="text-gray-500">{art.date}</span>
                </div>
                <h3 className="font-display font-bold text-lg md:text-xl text-white group-hover:text-brand-accent-lime transition-colors">
                  {art.title}
                </h3>
                {art.excerpt && (
                  <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-2">{art.excerpt}</p>
                )}
                {art.readTime && (
                  <div className="font-mono text-[9px] text-gray-500 pt-2 border-t border-white/5">
                    {art.readTime}
                  </div>
                )}
              </div>
            </BorderGlow>
          ))}
        </div>
      </section>

      {/* ===== Current Experiments (from Lab) ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-8">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-white/5 pb-4">
          <div className="space-y-1">
            <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.currentExperiments}</h2>
          </div>
          <button
            onClick={() => setActiveTab("lab")}
            className="group flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors cursor-pointer"
            id="view-all-experiments-btn"
          >
            {t.viewAllExperiments} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {currentExperiments.map((exp) => (
            <BorderGlow
              key={exp.id}
              edgeSensitivity={30}
              glowColor="76 95 64"
              backgroundColor="#121214"
              borderRadius={12}
              glowRadius={45}
              glowIntensity={1.15}
              coneSpread={20}
              colors={["#bcfd49", "#6366f1", "#4f46e5"]}
              fillOpacity={0.16}
              className="group cursor-pointer"
            >
              <div onClick={() => onSelectExperiment(exp)} className="p-6 md:p-8 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-brand-accent-lime">{exp.category.toUpperCase()}</span>
                  <span className="text-gray-500">{exp.date}</span>
                </div>
                <h3 className="font-display font-bold text-lg md:text-xl text-white group-hover:text-brand-accent-lime transition-colors">
                  {exp.title}
                </h3>
                {exp.excerpt && (
                  <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-2">{exp.excerpt}</p>
                )}
                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1 font-mono text-[9px]">
                  {t.experiment} <ArrowRight className="w-3 h-3 text-brand-accent-lime" />
                </span>
              </div>
            </BorderGlow>
          ))}
        </div>
      </section>

      {/* ===== Research Timeline (recent lab experiments by date) ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-8">
        <motion.div variants={itemVariants} className="space-y-2 border-b border-white/5 pb-4">
          <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.researchTimeline}</h2>
        </motion.div>

        <div className="relative border-l border-white/5 pl-6 space-y-6 ml-4">
          {researchTimeline.map((exp) => (
            <motion.div
              key={exp.id}
              variants={itemVariants}
              className="relative space-y-2"
            >
              <span className="absolute -left-[31px] top-1.5 w-2 h-2 rounded-full bg-brand-accent-orange ring-4 ring-brand-black" />
              <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                <Calendar className="w-3 h-3 text-gray-600" />
                <span>{exp.date}</span>
                <span className="text-brand-accent-lime uppercase tracking-wider">{exp.category}</span>
              </div>
              <h3 className="font-display font-bold text-sm text-white hover:text-brand-accent-lime transition-colors cursor-pointer" onClick={() => onSelectExperiment(exp)}>
                {exp.title}
              </h3>
              {exp.excerpt && (
                <p className="text-xs text-gray-400 leading-relaxed font-sans font-light line-clamp-1">{exp.excerpt}</p>
              )}
            </motion.div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
