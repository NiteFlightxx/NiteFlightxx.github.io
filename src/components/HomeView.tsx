import React from "react";
import { motion } from "motion/react";
import type { Variants } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { Project, ContentArticle, KnowledgeDomain } from "../types";
import { projectCategoryZh, projectStatusZh } from "../lib/taxonomy";
import { UI_TRANSLATIONS } from "../translations";
import BorderGlow from "./BorderGlow";
import { STATUS_BADGE } from "./ProjectsView";
import AvbdViewport from "./AvbdViewport";

const BASE_URL = import.meta.env.BASE_URL;

interface HomeViewProps {
  projects: Project[];
  knowledgeArticles: ContentArticle[];
  knowledgeDomains: KnowledgeDomain[];
  onSelectProject: (project: Project) => void;
  setActiveTab: (tab: string) => void;
  lang: "zh" | "en";
}

export default function HomeView({
  projects,
  knowledgeArticles,
  knowledgeDomains,
  onSelectProject,
  setActiveTab,
  lang,
}: HomeViewProps) {
  const t = UI_TRANSLATIONS[lang];
  const zh = lang === "zh";

  const featured = projects.slice(0, 2);
  const recentKnowledge = knowledgeArticles.slice(0, 4);

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
      className="space-y-20 pb-24"
      id="home-view-container"
    >
      {/* ===== AVBD interactive physics viewport ===== */}
      <AvbdViewport />

      {/* ===== Knowledge domains and learning paths ===== */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-10">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-border-subtle pb-5">
          <div><span className="font-mono text-[10px] uppercase tracking-widest text-accent-primary">Learning routes</span><h2 className="mt-2 font-display font-black text-3xl md:text-5xl text-text-primary tracking-tight">知识领域与学习路径</h2></div>
          <a href={`${BASE_URL}knowledge/`} className="group flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-text-primary">全部知识 <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5" /></a>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {knowledgeDomains.filter((domain) => domain.articleCount > 0).map((domain) => (
            <motion.a variants={itemVariants} key={domain.id} href={`${BASE_URL}knowledge/domain/${domain.id}/`} className="group flex min-h-56 flex-col rounded-2xl border border-border-subtle bg-surface-card/70 p-5 transition-all hover:-translate-y-1 hover:border-accent-primary/30">
              <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-text-faint"><span>{domain.articleCount} articles</span><span>{domain.subtopicCount} topics</span></div>
              <h3 className="mt-6 font-display text-xl font-bold text-text-primary group-hover:text-accent-primary">{domain.title}</h3>
              <p className="mt-3 line-clamp-3 text-xs leading-6 text-text-muted">{domain.excerpt}</p>
              <div className="mt-auto border-t border-border-subtle pt-4 text-[10px] text-text-faint">{domain.learningPaths.length > 0 ? `${domain.learningPaths.length} 条推荐学习路径` : '按子主题浏览'}<ArrowRight className="ml-2 inline h-3 w-3" /></div>
            </motion.a>
          ))}
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
