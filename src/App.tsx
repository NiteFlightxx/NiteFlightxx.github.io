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
import KnowledgeView from "./components/KnowledgeView";
import LabView from "./components/LabView";
import ArchiveView from "./components/ArchiveView";
import ProjectDetailModal from "./components/ProjectDetailModal";
import DynamicLinesBg from "./components/DynamicLinesBg";
import SideRays from "./components/SideRays";

// Data records (Chinese-only after migration; English datasets removed)
import {
  PROJECTS_ZH,
  SKILLS_ZH,
  TIMELINE_ZH,
} from "./translations";
import type { Project, ContentArticle } from "./types";

// Asset references
import heroImage from "./assets/images/hero_cinematic_rendering_1782300621428.jpg";
const HERO_IMAGE_URL: string = heroImage.src;

interface AppProps {
  // Markdown-backed content (pre-rendered HTML + KaTeX at build time by Astro)
  knowledgeArticles?: ContentArticle[];
  labExperiments?: ContentArticle[];
}

export default function App({ knowledgeArticles = [], labExperiments = [] }: AppProps) {
  // Initial tab from the URL hash (e.g. "#knowledge") so article-page "back" links
  // land on the originating feed tab. Falls back to "home" for unknown/empty hashes.
  const validTabs = ["home", "projects", "knowledge", "lab", "archive"];
  const hashTab = typeof window !== "undefined"
    ? window.location.hash.replace(/^#/, "")
    : "";
  const [activeTab, setActiveTab] = useState<string>(
    validTabs.includes(hashTab) ? hashTab : "home"
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Fixed locale: the English datasets were removed during migration.
  const lang = "zh" as const;

  const projects = PROJECTS_ZH as Project[];
  const knowledge = knowledgeArticles;
  const experiments = labExperiments;
  const skills = SKILLS_ZH;
  const timeline = TIMELINE_ZH;

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) || null : null;

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
            knowledgeArticles={knowledge}
            labExperiments={experiments}
            onSelectProject={(proj) => setSelectedProjectId(proj.id)}
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
      case "knowledge":
        return (
          <KnowledgeView
            articles={knowledge}
            lang={lang}
          />
        );
      case "lab":
        return (
          <LabView
            experiments={experiments}
            lang={lang}
          />
        );
      case "archive":
        return (
          <ArchiveView
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

      {/* Cybernetic dynamic lines background */}
      <DynamicLinesBg theme={theme} />

      {/* Primary Sticky Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
    </div>
  );
}

