import React from "react";
import { motion } from "motion/react";
import { ArrowRight, Cpu, Zap, Activity, ShieldAlert, Binary } from "lucide-react";
import { Project, BlogArticle, ResearchNote } from "../types";
import MathRenderer from "./MathRenderer";
import { UI_TRANSLATIONS } from "../translations";
import BorderGlow from "./BorderGlow";

interface HomeViewProps {
  projects: Project[];
  articles: BlogArticle[];
  researchNotes: ResearchNote[];
  onSelectProject: (project: Project) => void;
  onSelectArticle: (article: BlogArticle) => void;
  setActiveTab: (tab: string) => void;
  heroImageUrl: string;
  lang: "zh" | "en";
}

export default function HomeView({
  projects,
  articles,
  researchNotes,
  onSelectProject,
  onSelectArticle,
  setActiveTab,
  heroImageUrl,
  lang
}: HomeViewProps) {
  const t = UI_TRANSLATIONS[lang];

  // Select specific elements for home view highlights
  const featured = projects.slice(0, 2);
  const latestArticles = articles.slice(0, 2);
  const featuredResearch = researchNotes[0];

  const coreCompetenciesData = lang === "zh" ? [
    {
      title: "物理模拟",
      desc: "欧拉与拉格朗日流体求解器、自定义多子步 Chaos 力学、动力学布娃娃物理耦合、肌肉变形及高精度碰撞数学。",
      icon: Activity
    },
    {
      title: "动画技术美术",
      desc: "Control Rig 骨骼节点集成、解析解弹簧关节、多向运动匹配、复杂动画状态机以及程序化骨骼分层叠加。",
      icon: Binary
    },
    {
      title: "玩法系统研发",
      desc: "多人游戏物理与技能复制、客户端预测输入网络预测机制、服务器倒带延迟补偿判定，以及 GAS 技能系统极致优化。",
      icon: ShieldAlert
    },
    {
      title: "实时图形渲染",
      desc: "HLSL 计算着色器模块、大气多重散射体积光射线步进、Niagara 粒子 GPU 着色器拓展、着色器指令优化及性能剖析。",
      icon: Cpu
    }
  ] : [
    {
      title: "Physics Simulation",
      desc: "Eulerian and Lagrangian fluid solvers, custom sub-stepped Chaos forces, ragdoll coupling, soft body muscle deformation, and collision math.",
      icon: Activity
    },
    {
      title: "Animation Tech Art",
      desc: "Control Rig integrations, analytical spring-joint solvers, multi-directional Motion Matching, state machines, and procedural skeleton layering.",
      icon: Binary
    },
    {
      title: "Gameplay Systems",
      desc: "Multiplayer combat replication, predictive input netcode, server-rewind lag compensation, and Gameplay Ability System (GAS) optimization.",
      icon: ShieldAlert
    },
    {
      title: "Real-time Rendering",
      desc: "Direct HLSL compute shader modules, volumetric sky raymarching, Niagara system GPU extensions, shader optimization, and frame profiling.",
      icon: Cpu
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-24 pb-20"
      id="home-view-container"
    >
      {/* Cinematic Hero Section */}
      <section className="relative min-h-[85vh] flex items-center justify-center pt-12 select-none">
        {/* Subtle background glow illustration (dynamic backdrop) */}
        <div className="absolute inset-0 overflow-hidden -z-10 flex items-center justify-center">
          <div className="absolute w-[500px] h-[500px] bg-brand-accent-orange/5 glow-ambient -top-20" />
          <div className="absolute w-[600px] h-[400px] bg-white/5 glow-ambient bottom-10" />
          
          {/* Subtle textured grid overlay */}
          <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />

          {/* Cinematic hero image blurred background */}
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
              MARCUS VANCE
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

          <motion.div 
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6"
          >
            <button
              onClick={() => setActiveTab("projects")}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-brand-accent-lime hover:bg-white text-black font-extrabold text-sm tracking-widest uppercase transition-all duration-300 shadow-[0_4px_25px_rgba(188,253,73,0.25)] flex items-center justify-center gap-2 cursor-pointer"
              id="hero-explore-projects"
            >
              {t.exploreWork} <ArrowRight className="w-4.5 h-4.5 stroke-[2.5]" />
            </button>
            <button
              onClick={() => setActiveTab("about")}
              className="w-full sm:w-auto px-8 py-4 rounded-full border border-brand-accent-lime/40 bg-brand-charcoal hover:bg-brand-gray-900/80 hover:border-brand-accent-lime transition-all duration-300 text-sm text-brand-accent-lime font-bold tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              id="hero-view-profile"
            >
              {t.viewProfile}
            </button>
          </motion.div>
        </div>
      </section>

      {/* Core Engineering Disciplines (Apple bento-box style) */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-8 select-none">
        <motion.div variants={itemVariants} className="space-y-2">
          <span className="font-mono text-xs text-brand-accent-lime uppercase tracking-widest">{t.disciplineMatrix}</span>
          <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.coreCompetencies}</h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {coreCompetenciesData.map((item, idx) => (
            <motion.div
              key={item.title}
              variants={itemVariants}
              className="flex"
            >
              <BorderGlow
                edgeSensitivity={30}
                glowColor="76 95 64"
                backgroundColor="#121214"
                borderRadius={16}
                glowRadius={50}
                glowIntensity={1.2}
                coneSpread={20}
                colors={["#bcfd49", "#84cc16", "#6366f1"]}
                fillOpacity={0.15}
                className="w-full"
              >
                <div className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded bg-brand-gray-900 border border-white/5 flex items-center justify-center">
                    <item.icon className="w-6 h-6 text-brand-accent-lime" />
                  </div>
                  <h3 className="font-display font-bold text-base md:text-lg text-white tracking-wide">{item.title}</h3>
                  <p className="text-sm text-gray-300 leading-relaxed font-sans font-light">{item.desc}</p>
                </div>
              </BorderGlow>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Projects Highlight */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto space-y-8">
        <motion.div variants={itemVariants} className="flex items-end justify-between border-b border-white/5 pb-4">
          <div className="space-y-1">
            <span className="font-mono text-xs text-brand-accent-lime uppercase tracking-widest">{t.selectedLogs}</span>
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
                  {/* Text Card */}
                  <div className="p-6 md:p-8 space-y-4 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs font-mono text-brand-accent-lime">
                        <span>{lang === "zh" ? proj.category.replace("Physics Simulation", "物理模拟").replace("Real-time Rendering", "实时渲染").replace("Animation Technical Art", "动画技术美术").replace("Gameplay Systems", "游戏玩法系统").toUpperCase() : proj.category.toUpperCase()}</span>
                        <span>[{lang === "zh" ? "点击查看画像" : "CLICK TO PROFILE"}]</span>
                      </div>
                      
                      <h3 className="font-display font-bold text-xl md:text-2xl text-white group-hover:text-brand-accent-lime transition-colors">
                        {proj.title}
                      </h3>
                      
                      <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-3">
                        {proj.description}
                      </p>

                      {/* Visual Prompt Quote block */}
                      {proj.visualPrompt && (
                        <div className="text-xs text-gray-400 italic border-l-2 border-brand-accent-lime/40 pl-3 py-0.5 leading-relaxed bg-brand-black/20 rounded-r pr-2 font-serif">
                          "{proj.visualPrompt}"
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-4 border-t border-white/5 mt-auto">
                      {proj.tech.slice(0, 4).map((techItem) => (
                        <span
                          key={techItem}
                          className="px-2 py-0.5 text-[8px] font-mono bg-brand-black text-gray-500 border border-white/5 rounded"
                        >
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

      {/* Latest Blog Post Highlight & Research Split Section */}
      <section className="px-6 md:px-12 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-12">
        
        {/* Left 2 Columns: Latest Articles */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-end justify-between border-b border-white/5 pb-4">
            <div className="space-y-1">
              <span className="font-mono text-xs text-brand-accent-lime uppercase tracking-widest">{t.knowledgeSharing}</span>
              <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.technicalLogs}</h2>
            </div>
            <button
              onClick={() => setActiveTab("blog")}
              className="group flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors cursor-pointer"
              id="view-all-logs-btn"
            >
              {t.viewAllLogs} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <div className="space-y-4">
            {latestArticles.map((art) => (
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
                <div
                  onClick={() => onSelectArticle(art)}
                  className="p-6 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-brand-accent-lime">{lang === "zh" ? art.category.replace("Physics Simulation", "物理模拟").replace("Real-time Rendering", "实时渲染").replace("Animation Technical Art", "动画技术美术").replace("Gameplay Systems", "游戏玩法系统").toUpperCase() : art.category.toUpperCase()}</span>
                    <span className="text-gray-500">{art.date}</span>
                  </div>

                  <h3 className="font-display font-bold text-lg md:text-xl text-white group-hover:text-brand-accent-lime transition-colors">
                    {art.title}
                  </h3>

                  <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-2">
                    {art.excerpt}
                  </p>

                  <div className="flex items-center justify-between font-mono text-[9px] text-gray-500 pt-2 border-t border-white/5">
                    <span>{lang === "zh" ? "预计阅读时间: " + art.readTime : "ESTIMATED " + art.readTime.toUpperCase()}</span>
                    <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-1">
                      {t.readLog} <ArrowRight className="w-3 h-3 text-brand-accent-lime" />
                    </span>
                  </div>
                </div>
              </BorderGlow>
            ))}
          </div>
        </div>

        {/* Right 1 Column: Research Notes Preview */}
        <div className="space-y-8">
          <div className="flex items-end justify-between border-b border-white/5 pb-4">
            <div className="space-y-1">
              <span className="font-mono text-xs text-brand-accent-lime uppercase tracking-widest">{t.academics}</span>
              <h2 className="font-display font-black text-2xl md:text-4.5xl text-white tracking-tight">{t.activeResearch}</h2>
            </div>
            <button
              onClick={() => setActiveTab("research")}
              className="group flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors cursor-pointer"
              id="view-research-btn"
            >
              {t.explore} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

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
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-brand-accent-lime">{lang === "zh" ? "数学推导验证" : "MATHEMATICAL PROOF"}</span>
                <span className="text-gray-500">{lang === "zh" ? "2026年6月" : "JUNE 2026"}</span>
              </div>

              <h3 className="font-display font-bold text-base md:text-lg text-white">
                {featuredResearch.title}
              </h3>

              <p className="text-sm text-gray-300 leading-relaxed font-sans line-clamp-3">
                {featuredResearch.problem}
              </p>

              {/* Injected LaTex formula preview */}
              <div className="py-2">
                <MathRenderer formulaKey="quaternion-damper" centered={false} />
              </div>

              <button
                onClick={() => setActiveTab("research")}
                className="w-full py-2 rounded-lg border border-white/5 bg-brand-black/60 hover:bg-white/5 transition-all text-[10px] font-mono text-gray-400 hover:text-white cursor-pointer tracking-wider uppercase text-center"
                id="home-open-proof-btn"
              >
                {t.examineFullDerivation}
              </button>
            </div>
          </BorderGlow>
        </div>
      </section>
    </motion.div>
  );
}
