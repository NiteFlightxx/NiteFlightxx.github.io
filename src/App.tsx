/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";

// Sub-components
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomeView from "./components/HomeView";
import ProjectsView from "./components/ProjectsView";
import ArchiveView from "./components/ArchiveView";
import ProjectDetailModal from "./components/ProjectDetailModal";
import GlobalCommandPalette from "./components/GlobalCommandPalette";

// Data records (Chinese-only after migration; English datasets removed)
import {
  PROJECTS_ZH,
  SKILLS_ZH,
} from "./translations";
import type { Project, ContentArticle, KnowledgeDomain } from "./types";
import { MAIN_NAV_ITEMS } from "./lib/siteNavigation";

interface AppProps {
  // Lightweight Markdown metadata; full bodies stay on their article routes.
  knowledgeArticles?: ContentArticle[];
  knowledgeDomains?: KnowledgeDomain[];
}

const VALID_TABS: readonly string[] = MAIN_NAV_ITEMS.map((item) => item.id);

export default function App({ knowledgeArticles = [], knowledgeDomains = [] }: AppProps) {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const navigateToTab = useCallback((tab: string) => {
    if (tab === 'knowledge') { location.assign(`${import.meta.env.BASE_URL}knowledge/`); return; }
    if (!VALID_TABS.includes(tab)) return;
    setActiveTab(tab);
    const nextHash = tab === "home" ? "" : `#${tab}`;
    history.pushState(null, "", `${location.pathname}${location.search}${nextHash}`);
  }, []);

  // Fixed locale: the English datasets were removed during migration.
  const lang = "zh" as const;

  const projects = PROJECTS_ZH as Project[];
  const knowledge = knowledgeArticles;
  const skills = SKILLS_ZH;

  const selectedProject = selectedProjectId ? projects.find(p => p.id === selectedProjectId) || null : null;

  const openProject = useCallback((project: Project) => {
    if (project.topicSlug) {
      window.location.assign(`${import.meta.env.BASE_URL}projects/${project.topicSlug}/`);
      return;
    }
    setSelectedProjectId(project.id);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const tab = window.location.hash.replace(/^#/, "");
      if (tab === 'knowledge') { location.replace(`${import.meta.env.BASE_URL}knowledge/${location.search}`); return; }
      if (tab === 'main-content') return;
      setActiveTab(VALID_TABS.includes(tab) ? tab : "home");
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("hashchange", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("hashchange", syncFromUrl);
    };
  }, []);

  // Smooth scroll to top on page switches
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [activeTab]);

  // Dispatch current view
  const renderCurrentView = () => {
    switch (activeTab) {
      case "home":
        return (
          <HomeView
            projects={projects}
            knowledgeArticles={knowledge}
            knowledgeDomains={knowledgeDomains}
            onSelectProject={openProject}
            setActiveTab={navigateToTab}
            lang={lang}
          />
        );
      case "knowledge":
        return (
          null
        );
      case "projects":
        return (
          <ProjectsView
            projects={projects}
            articles={knowledge}
            domains={knowledgeDomains}
            onSelectProject={openProject}
            lang={lang}
          />
        );
      case "archive":
        return (
          <ArchiveView
            skills={skills}
            lang={lang}
          />
        );
      default:
        return <div className="h-[60vh] flex items-center justify-center font-mono text-xs">VIEW STAGE FAILED // 0xDEAD</div>;
    }
  };

  return (
    <div className="site-app min-h-screen flex flex-col bg-surface-base text-text-primary selection:bg-accent-primary/25">

      {/* Primary Sticky Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={navigateToTab}
      />

      {/* Main Page Stage Area */}
      <main className="flex-grow" id="main-content">
        {renderCurrentView()}
      </main>

      {/* Standard Footer */}
      <Footer lang={lang} />

      <GlobalCommandPalette />

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

