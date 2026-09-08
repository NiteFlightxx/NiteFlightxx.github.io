import React, { useState, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import Logo from "./Logo";

interface FooterProps {
  lang: "zh" | "en";
}

export default function Footer({ lang }: FooterProps) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const localStr = now.toLocaleTimeString([], { hour12: false });
      const utcStr = now.toISOString().substring(11, 19);
      setTime(`LOC ${localStr} | UTC ${utcStr}`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="w-full border-t py-12 px-6 md:px-12 select-none transition-colors duration-300 bg-surface-base border-border-subtle text-text-secondary">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch justify-between gap-8">
        {/* Left: Metadata */}
        <div className="flex flex-col justify-between gap-4 md:max-w-md">
          <div className="flex items-center gap-2">
            <Logo className="w-4 h-4 text-accent-primary" />
            <span className="font-display font-medium text-xs tracking-wider text-text-primary">
              NITE — PERSONAL PORTFOLIO
            </span>
          </div>
          <p className="text-xs text-text-faint leading-relaxed font-sans">
            {lang === "zh"
              ? "致力于探索实时交互媒体与物理模拟的终极边界。"
              : "Focused on pushing the boundaries of real-time interactive media and physics simulation."}
          </p>
          <span className="text-[10px] font-mono text-text-faint">
            © {new Date().getFullYear()} {lang === "zh" ? "Nite。保留所有计算权利。" : "Nite. All computational rights reserved."}
          </span>
        </div>

        {/* Right: Technical Stats & Links */}
        <div className="flex flex-col justify-between items-start md:items-end gap-6 text-left md:text-right">
          {/* Diagnostic Console */}
          <div className="px-4 py-3 rounded-lg bg-surface-card border border-border-subtle font-mono text-[10px] text-text-faint leading-relaxed w-full md:w-auto min-w-[240px]">
            <div className="flex items-center justify-between border-b border-border-subtle pb-1 mb-1 text-text-muted font-semibold">
              <span>{lang === "zh" ? "系统诊断数据" : "SYSTEM DIAGNOSTICS"}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-ping" />
            </div>
            <div className="flex justify-between gap-6">
              <span>{lang === "zh" ? "驱动:" : "DRIVER:"}</span>
              <span className="text-text-secondary">D3D12 AGILITY SDK 1.6</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>{lang === "zh" ? "求解器:" : "SOLVER:"}</span>
              <span className="text-text-secondary">CHAOS DYNAMICS v5.5</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>{lang === "zh" ? "计时器:" : "TIMER:"}</span>
              <span className="text-accent-primary font-medium">{time || (lang === "zh" ? "正在初始化..." : "INITIALIZING...")}</span>
            </div>
          </div>

          {/* Social Nav */}
          <div className="flex items-center flex-wrap gap-4 text-xs font-mono text-text-muted">
            <a
              href="mailto:contact@nite.tech"
              className="flex items-center gap-0.5 hover:text-text-primary transition-colors duration-200 group"
            >
              Email <ArrowUpRight className="w-3 h-3 text-text-faint group-hover:text-accent-primary transition-colors" />
            </a>
            <span className="text-text-primary/10 select-none">•</span>
            <a
              href="https://github.com/NiteFlightxx"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 hover:text-text-primary transition-colors duration-200 group"
            >
              GitHub <ArrowUpRight className="w-3 h-3 text-text-faint group-hover:text-accent-primary transition-colors" />
            </a>
            <span className="text-text-primary/10 select-none">•</span>
            <a
              href="https://space.bilibili.com/101356800"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 hover:text-text-primary transition-colors duration-200 group"
            >
              Bilibili <ArrowUpRight className="w-3 h-3 text-text-faint group-hover:text-accent-primary transition-colors" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
