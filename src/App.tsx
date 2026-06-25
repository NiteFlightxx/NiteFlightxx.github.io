/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

// Sub-components
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomeView from "./components/HomeView";
import ProjectsView from "./components/ProjectsView";
import BlogView from "./components/BlogView";
import ResearchView from "./components/ResearchView";
import AboutView from "./components/AboutView";
import ProjectDetailModal from "./components/ProjectDetailModal";
import ArticleViewer from "./components/ArticleViewer";
import DynamicLinesBg from "./components/DynamicLinesBg";
import SideRays from "./components/SideRays";

// Data records
import {
  PROJECTS_DATA,
  BLOG_ARTICLES,
  RESEARCH_NOTES,
  SKILL_CATEGORIES,
  CAREER_TIMELINE,
} from "./data";
import {
  UI_TRANSLATIONS,
  PROJECTS_ZH,
  BLOG_ZH,
  RESEARCH_ZH,
  SKILLS_ZH,
  TIMELINE_ZH,
} from "./translations";
import { Project, BlogArticle } from "./types";

// Asset references
import heroImage from "./assets/images/hero_cinematic_rendering_1782300621428.jpg";
const HERO_IMAGE_URL = heroImage;

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  // Map the datasets based on lang
  const projects = lang === "zh" ? (PROJECTS_ZH as Project[]) : PROJECTS_DATA;
  const articles = lang === "zh" ? BLOG_ZH : BLOG_ARTICLES;
  const researchNotes = lang === "zh" ? RESEARCH_ZH : RESEARCH_NOTES;
  const skills = lang === "zh" ? SKILLS_ZH : SKILL_CATEGORIES;
  const timeline = lang === "zh" ? TIMELINE_ZH : CAREER_TIMELINE;

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) || null : null;
  const selectedArticle = selectedArticleId ? articles.find(a => a.id === selectedArticleId) || null : null;

  // Smooth scroll to top on page switches
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  // Dispatch current view
  const renderCurrentView = () => {
    switch (activeTab) {
      case "home":
        return (
          <HomeView
            projects={projects}
            articles={articles}
            researchNotes={researchNotes}
            onSelectProject={(proj) => setSelectedProjectId(proj.id)}
            onSelectArticle={(art) => setSelectedArticleId(art.id)}
            setActiveTab={setActiveTab}
            heroImageUrl={HERO_IMAGE_URL}
            lang={lang}
          />
        );
      case "projects":
        return (
          <ProjectsView
            projects={projects}
            onSelectProject={(proj) => setSelectedProjectId(proj.id)}
            lang={lang}
          />
        );
      case "blog":
        return (
          <BlogView
            articles={articles}
            onSelectArticle={(art) => setSelectedArticleId(art.id)}
            lang={lang}
          />
        );
      case "research":
        return <ResearchView researchNotes={researchNotes} lang={lang} />;
      case "about":
        return (
          <AboutView
            skills={skills}
            timeline={timeline}
            lang={lang}
          />
        );
      default:
        return <div className="h-[60vh] flex items-center justify-center font-mono text-xs">VIEW STAGE FAILED // 0xDEAD</div>;
    }
  };

  return (
    <div className={`relative min-h-screen flex flex-col justify-between transition-colors duration-300 selection:bg-brand-accent-orange/30 selection:text-white ${
      theme === "light" ? "light-theme text-slate-900" : "text-gray-100"
    }`}>
      {/* Fixed Background Color Layer (solves canvas stacking context) */}
      <div className={`fixed inset-0 -z-20 transition-colors duration-300 ${
        theme === "light" ? "bg-white" : "bg-brand-black"
      }`} />

      {/* Global Seamless WebGL Rays Background */}
      <div className="fixed inset-0 -z-15 pointer-events-none opacity-90">
        <SideRays
          speed={2.5}
          rayColor1="#EAB308"
          rayColor2="#96c8ff"
          intensity={2.0}
          spread={2.0}
          origin="top-right"
          tilt={0}
          saturation={1.5}
          blend={0.75}
          falloff={1.6}
          opacity={1.0}
        />
      </div>

      {/* Cinematic Film Grain Overlay (Simulates real-time viewport grain) */}
      <div className="grain-overlay" />

      {/* Cybernetic dynamic lines background */}
      <DynamicLinesBg theme={theme} />

      {/* Primary Sticky Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main Page Stage Area */}
      <main className="flex-grow pt-12 md:pt-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full"
          >
            {renderCurrentView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Standard Footer */}
      <Footer lang={lang} theme={theme} />

      {/* Immersive Modal: Project Specifications */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectDetailModal
            project={selectedProject}
            onClose={() => setSelectedProjectId(null)}
            lang={lang}
          />
        )}
      </AnimatePresence>

      {/* Immersive Drawer: Technical Blog Logs */}
      <AnimatePresence>
        {selectedArticle && (
          <ArticleViewer
            article={selectedArticle}
            onClose={() => setSelectedArticleId(null)}
            lang={lang}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

