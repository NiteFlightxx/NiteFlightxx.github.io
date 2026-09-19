import React from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { Project, ContentArticle } from "../types";
import { projectCategoryZh, projectStatusZh } from "../lib/taxonomy";
import { UI_TRANSLATIONS } from "../translations";
import BorderGlow from "./BorderGlow";
import { STATUS_BADGE } from "./ProjectsView";

const BASE_URL = import.meta.env.BASE_URL;

interface HomeViewProps {
  projects: Project[];
  knowledgeArticles: ContentArticle[];
  onSelectProject: (project: Project) => void;
  setActiveTab: (tab: string) => void;
  lang: "zh" | "en";
}

export default function HomeView({
  projects,
  knowledgeArticles,
  onSelectProject,
  setActiveTab,
  lang,
}: HomeViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const zh = lang === "zh";

  const featured = projects.slice(0, 2);
  const recentKnowledge = knowledgeArticles.slice(0, 2);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.08 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-28 pb-24"
      id="home-view-container"
    >
      {/* ===== Hero — centered with breathing space ===== */}
      <section className="relative min-h-[85svh] md:min-h-[90vh] flex items-center justify-center select-none overflow-hidden">
        {/* Geometric art from Nite_BG, drawn as native SVG */}
        <div className="absolute inset-0 -z-10">
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 1440 900"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            {/* Left: large blocky N — the Nite signature shape */}
            <g transform="translate(-40, 180) scale(2.6)" fill="#f3f4f6" opacity="0.035">
              <path d="M15,102 L23,113 L36,128 L49,143 L49,293 L42,308 L27,323 L15,336 Z" />
              <path d="M0,0 L8,35 L22,63 L38,84 L59,105 L80,126 L101,147 L122,168 L143,189 L164,210 L185,231 L205,252 L226,273 L247,294 L269,315 L290,336 L311,357 L317,357 L300,308 L280,280 L253,252 L232,231 L211,210 L190,189 L169,168 L148,147 L127,126 L106,105 L85,84 L64,63 L43,42 L22,21 L1,0 Z" />
              <path d="M303,43 L303,253 L304,267 L289,248 L276,233 L269,218 L269,83 L278,68 L293,53 L303,43 Z" />
            </g>
            {/* N outline trace for definition */}
            <g transform="translate(-40, 180) scale(2.6)" fill="none" stroke="#bcfd49" strokeWidth="0.6" opacity="0.1">
              <path d="M15,102 L23,113 L36,128 L49,143 L49,293 L42,308 L27,323 L15,336 Z" />
              <path d="M0,0 L8,35 L22,63 L38,84 L59,105 L80,126 L101,147 L122,168 L143,189 L164,210 L185,231 L205,252 L226,273 L247,294 L269,315 L290,336 L311,357 L317,357 L300,308 L280,280 L253,252 L232,231 L211,210 L190,189 L169,168 L148,147 L127,126 L106,105 L85,84 L64,63 L43,42 L22,21 L1,0 Z" />
              <path d="M303,43 L303,253 L304,267 L289,248 L276,233 L269,218 L269,83 L278,68 L293,53 L303,43 Z" />
            </g>

            {/* Right: vertical accent line */}
            <line x1="1330" y1="60" x2="1330" y2="840" stroke="#bcfd49" strokeWidth="1.5" opacity="0.15" />

            {/* Right: three rectangular bands */}
            <rect x="1360" y="160" width="70" height="22" fill="#f3f4f6" opacity="0.05" rx="1" />
            <rect x="1360" y="430" width="70" height="22" fill="#bcfd49" opacity="0.08" rx="1" />
            <rect x="1360" y="700" width="70" height="22" fill="#f3f4f6" opacity="0.05" rx="1" />
          </svg>

          {/* Ambient glow */}
          <div className="absolute w-[500px] h-[500px] bg-accent-primary/5 glow-ambient -top-20" />
          <div className="absolute w-[600px] h-[400px] bg-surface-raised/20 glow-ambient bottom-10" />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />
          {/* Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,rgba(6,6,6,0.8)_100%)] pointer-events-none" />
        </div>

        {/* Hero content — centered with generous breathing space */}
        <div className="w-full max-w-3xl mx-auto px-6 text-center relative z-10">
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-accent-primary/30 bg-surface-card/90 text-xs font-mono tracking-widest text-accent-primary uppercase shadow-[0_4px_20px_rgba(188,253,73,0.1)]"
          >
            <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
            {t.role}
          </motion.div>

          <div className="mt-10 space-y-5">
            <motion.h1
              variants={itemVariants}
              className="font-display font-black text-6xl md:text-9xl tracking-tighter leading-none bg-gradient-to-r from-text-primary via-accent-primary-hover to-accent-primary bg-clip-text text-transparent drop-shadow-[0_4px_15px_rgba(188,253,73,0.15)]"
            >
              NITE
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className="font-sans font-bold text-lg md:text-2xl text-accent-primary-hover tracking-widest uppercase"
            >
              {t.title}
            </motion.p>
          </div>

          <motion.p
            variants={itemVariants}
            className="mt-8 font-sans text-xl md:text-3xl text-text-primary max-w-2xl mx-auto font-medium leading-relaxed tracking-wide"
          >
            {t.statement}
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <button
              type="button"
              onClick={() => setActiveTab("projects")}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-accent-primary hover:bg-surface-card text-black font-extrabold text-sm tracking-widest uppercase transition-all duration-300 shadow-[0_4px_25px_rgba(188,253,73,0.25)] flex items-center justify-center gap-2 cursor-pointer"
              id="hero-explore-projects"
            >
              {t.exploreWork} <ArrowRight className="w-4.5 h-4.5 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("archive")}
              className="w-full sm:w-auto px-8 py-4 rounded-full border border-accent-primary/40 bg-surface-card hover:bg-surface-raised/80 hover:border-accent-primary transition-all duration-300 text-sm text-accent-primary font-bold tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              id="hero-view-profile"
            >
              {t.viewProfile}
            </button>
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            variants={itemVariants}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-text-faint"
          >
            <span className="text-[10px] font-mono tracking-widest uppercase">{t.scrollHint}</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </motion.div>
        </div>
      </section>

      {/* ===== Featured Systems ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-10">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-border-subtle pb-5">
          <h2 className="font-display font-black text-3xl md:text-5xl text-text-primary tracking-tight">{t.featuredSystems}</h2>
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            className="group flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            id="view-all-projects-btn"
          >
            {t.viewAllProjects} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {featured.map((proj) => (
            <motion.button
              type="button"
              key={proj.id}
              variants={itemVariants}
              onClick={() => onSelectProject(proj)}
              className="group cursor-pointer text-left w-full rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-accent-lime"
            >
              <BorderGlow
                edgeSensitivity={35}
                glowColor="76 95 64"
                backgroundColor="#121214"
                borderRadius={24}
                glowRadius={60}
                glowIntensity={1.3}
                coneSpread={22}
                colors={["#bcfd49", "#6366f1", "#4f46e5"]}
                fillOpacity={0.2}
                className="h-full"
              >
                <div className="flex flex-col h-full justify-between">
                  <div className="p-7 md:p-9 space-y-5 flex-1 flex flex-col justify-between">
                    <div className="space-y-5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider ${STATUS_BADGE[proj.status]}`}>
                            {zh ? projectStatusZh(proj.status) : proj.status}
                          </span>
                          <span className="text-accent-primary">{(zh ? projectCategoryZh(proj.category) : proj.category).toUpperCase()}</span>
                        </div>
                        {proj.year && <span className="text-text-faint">{proj.year}</span>}
                      </div>
                      <h3 className="font-display font-bold text-2xl md:text-3xl text-text-primary group-hover:text-accent-primary transition-colors">
                        {proj.title}
                      </h3>
                      <p className="text-sm md:text-base text-text-secondary leading-relaxed font-sans line-clamp-4">{proj.overview}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-5 border-t border-border-subtle mt-auto">
                      {proj.tech.slice(0, 4).map((techItem) => (
                        <span key={techItem} className="px-2 py-0.5 text-[8px] font-mono bg-surface-base text-text-faint border border-border-subtle rounded">
                          {techItem}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </BorderGlow>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ===== Recent Knowledge ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-10">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-border-subtle pb-5">
          <h2 className="font-display font-black text-3xl md:text-5xl text-text-primary tracking-tight">{t.recentKnowledge}</h2>
          <button
            type="button"
            onClick={() => setActiveTab("knowledge")}
            className="group flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-text-primary transition-colors cursor-pointer"
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
              borderRadius={14}
              glowRadius={40}
              glowIntensity={1.1}
              coneSpread={20}
              colors={["#bcfd49", "#6366f1", "#4f46e5"]}
              fillOpacity={0.15}
              className="group cursor-pointer"
            >
              <a href={`${BASE_URL}knowledge/${art.slug}`} className="block p-6 md:p-7 flex flex-col justify-between gap-5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-accent-primary">{art.category.toUpperCase()}</span>
                  <span className="text-text-faint">{art.date}</span>
                </div>
                <h3 className="font-display font-bold text-xl md:text-2xl text-text-primary group-hover:text-accent-primary transition-colors">
                  {art.title}
                </h3>
                {art.excerpt && (
                  <p className="text-sm md:text-base text-text-secondary leading-relaxed font-sans line-clamp-2">{art.excerpt}</p>
                )}
                {art.readTime && (
                  <div className="font-mono text-[9px] text-text-faint pt-3 border-t border-border-subtle">
                    {art.readTime}
                  </div>
                )}
              </a>
            </BorderGlow>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
