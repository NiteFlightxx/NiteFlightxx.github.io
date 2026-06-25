import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Terminal, Menu, X, Github, Linkedin, Cpu, Sun, Moon } from "lucide-react";
import { UI_TRANSLATIONS } from "../translations";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}

const NAV_ITEMS = [
  { id: "home", labelZh: "首页" },
  { id: "projects", labelZh: "项目" },
  { id: "knowledge", labelZh: "知识库" },
  { id: "lab", labelZh: "实验室" },
  { id: "archive", labelZh: "档案" },
];

export default function Header({
  activeTab,
  setActiveTab,
  theme,
  setTheme,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = UI_TRANSLATIONS.zh;

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-white/10 px-6 py-4.5 md:px-12 select-none shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Branding */}
        <div 
          onClick={() => setActiveTab("home")}
          className="flex items-center gap-3 cursor-pointer group"
          id="nav-logo"
        >
          <div className="relative w-9 h-9 rounded bg-brand-gray-800 border border-white/15 flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:border-brand-accent-orange/50">
            <Cpu className="w-5 h-5 text-gray-200 transition-colors duration-300 group-hover:text-brand-accent-orange" />
            <div className="absolute inset-0 bg-gradient-to-tr from-brand-accent-orange/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-black text-base tracking-widest text-white group-hover:text-brand-accent-orange transition-colors duration-300">
              NITE
            </span>
            <span className="text-[10px] font-mono text-gray-400 tracking-widest leading-none mt-0.5">
              物理、动画工程师
            </span>
          </div>
        </div>

        {/* Center: Navigation Links */}
        <nav className="hidden md:flex items-center gap-3 bg-brand-black/80 border border-brand-accent-lime/20 rounded-full px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`relative px-6 py-2.5 text-base font-bold tracking-wider transition-all duration-300 rounded-full cursor-pointer flex items-center justify-center ${
                  isActive 
                    ? "text-brand-accent-lime drop-shadow-[0_0_10px_rgba(188,253,73,0.3)]" 
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavBackground"
                    className="absolute inset-0 bg-brand-gray-800/95 border border-brand-accent-lime/40 rounded-full -z-10 shadow-[0_0_20px_rgba(188,253,73,0.15)]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {item.labelZh}
              </button>
            );
          })}
        </nav>

        {/* Right: Actions / Socials */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5"
            aria-label="GitHub Profile"
            id="social-github"
          >
            <Github className="w-4 h-4" />
          </a>
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5"
            aria-label="LinkedIn Profile"
            id="social-linkedin"
          >
            <Linkedin className="w-4 h-4" />
          </a>

          {/* Theme switcher */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 text-gray-400 hover:text-white transition-colors duration-200 rounded-lg hover:bg-white/5 cursor-pointer"
            aria-label="Toggle Theme"
            id="theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <span className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-accent-orange/10 border border-brand-accent-orange/20 text-[10px] font-mono text-brand-accent-orange font-medium tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-accent-orange animate-pulse" />
            {t.compileStatus}
          </div>
        </div>

        {/* Mobile: Hamburger Trigger */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-accent-orange/10 border border-brand-accent-orange/20 text-[9px] font-mono text-brand-accent-orange">
            <span className="w-1 h-1 rounded-full bg-brand-accent-orange animate-pulse" />
            UE5.5
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-gray-400 hover:text-white transition-colors duration-200"
            aria-label="Toggle Mobile Menu"
            id="mobile-menu-toggle"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="md:hidden absolute top-[73px] left-0 right-0 glass-panel border-b border-white/5 px-6 py-6 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`mobile-nav-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left py-2.5 px-4 rounded-lg text-base font-bold tracking-wide transition-all ${
                      isActive 
                        ? "bg-brand-gray-800 text-brand-accent-lime border border-brand-accent-lime/30 shadow-[0_2px_10px_rgba(188,253,73,0.1)]" 
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {item.labelZh}
                  </button>
                );
              })}
            </div>
            
            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between px-3 text-xs text-gray-500">
              <span className="font-mono">系统设置</span>
              <div className="flex items-center gap-2">
                {/* Theme switcher */}
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="p-1.5 border border-white/10 hover:border-white/20 bg-brand-black/30 hover:bg-white/5 rounded text-gray-300 hover:text-white transition-colors cursor-pointer"
                  aria-label="Toggle Theme"
                  id="mobile-theme-toggle"
                >
                  {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between px-3 text-xs text-gray-500">
              <span className="font-mono">LINKS</span>
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Github className="w-4 h-4" />
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <Linkedin className="w-4 h-4" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
