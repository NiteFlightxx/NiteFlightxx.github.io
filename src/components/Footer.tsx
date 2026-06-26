import React, { useState, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import Logo from "./Logo";
import { UI_TRANSLATIONS } from "../translations";

interface FooterProps {
  lang: "zh" | "en";
  theme: "dark" | "light";
}

export default function Footer({ lang, theme }: FooterProps) {
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
    <footer className={`w-full border-t py-12 px-6 md:px-12 select-none transition-colors duration-300 ${
      theme === "light"
        ? "bg-slate-50 border-slate-200 text-slate-800"
        : "bg-brand-black border-white/5 text-gray-100"
    }`}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch justify-between gap-8">
        {/* Left: Metadata */}
        <div className="flex flex-col justify-between gap-4 md:max-w-md">
          <div className="flex items-center gap-2">
            <Logo className="w-4 h-4 text-brand-accent-orange" />
            <span className="font-display font-medium text-xs tracking-wider text-white">
              NITE SYSTEMS INC.
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed font-sans">
            {lang === "zh"
              ? "专攻高性能 C++ 方案、GPU 并行计算，以及为虚幻引擎深度研发定制骨骼动画图表。致力于探索实时交互媒体与物理模拟的终极边界。"
              : "Specializing in high-performance C++ solutions, GPU computing, and custom skeletal animation graphs for Unreal Engine. Focused on pushing the boundaries of real-time interactive media."}
          </p>
          <span className="text-[10px] font-mono text-gray-600">
            © {new Date().getFullYear()} {lang === "zh" ? "Nite。保留所有计算权利。" : "Nite. All computational rights reserved."}
          </span>
        </div>

        {/* Right: Technical Stats & Links */}
        <div className="flex flex-col justify-between items-start md:items-end gap-6 text-left md:text-right">
          {/* Diagnostic Console */}
          <div className="px-4 py-3 rounded-lg bg-brand-charcoal border border-white/5 font-mono text-[10px] text-gray-500 leading-relaxed w-full md:w-auto min-w-[240px]">
            <div className="flex items-center justify-between border-b border-white/5 pb-1 mb-1 text-gray-400 font-semibold">
              <span>{lang === "zh" ? "系统诊断数据" : "SYSTEM DIAGNOSTICS"}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="flex justify-between gap-6">
              <span>{lang === "zh" ? "驱动:" : "DRIVER:"}</span>
              <span className="text-gray-300">D3D12 AGILITY SDK 1.6</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>{lang === "zh" ? "求解器:" : "SOLVER:"}</span>
              <span className="text-gray-300">CHAOS DYNAMICS v5.5</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>{lang === "zh" ? "计时器:" : "TIMER:"}</span>
              <span className="text-brand-accent-orange font-medium">{time || (lang === "zh" ? "正在初始化..." : "INITIALIZING...")}</span>
            </div>
          </div>

          {/* Social Nav */}
          <div className="flex items-center flex-wrap gap-4 text-xs font-mono text-gray-400">
            <a
              href="mailto:contact@nite.tech"
              className="flex items-center gap-0.5 hover:text-white transition-colors duration-200 group"
            >
              Email <ArrowUpRight className="w-3 h-3 text-gray-500 group-hover:text-brand-accent-orange transition-colors" />
            </a>
            <span className="text-white/10 select-none">•</span>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 hover:text-white transition-colors duration-200 group"
            >
              GitHub <ArrowUpRight className="w-3 h-3 text-gray-500 group-hover:text-brand-accent-orange transition-colors" />
            </a>
            <span className="text-white/10 select-none">•</span>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 hover:text-white transition-colors duration-200 group"
            >
              LinkedIn <ArrowUpRight className="w-3 h-3 text-gray-500 group-hover:text-brand-accent-orange transition-colors" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
