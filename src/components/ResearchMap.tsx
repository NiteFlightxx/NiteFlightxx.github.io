import React from "react";
import { Network } from "lucide-react";
import { RESEARCH_MAP } from "../lib/taxonomy";
import type { LabTopic } from "../lib/taxonomy";
import BorderGlow from "./BorderGlow";

interface ResearchMapProps {
  activeDomain: LabTopic | null;
  onSelectDomain: (domain: LabTopic | null) => void;
  lang: "zh" | "en";
}

export default function ResearchMap({ activeDomain, onSelectDomain, lang }: ResearchMapProps) {
  return (
    <BorderGlow
      edgeSensitivity={30}
      glowColor="76 95 64"
      backgroundColor="#121214"
      borderRadius={16}
      glowRadius={50}
      glowIntensity={1.15}
      coneSpread={20}
      colors={["#bcfd49", "#6366f1", "#4f46e5"]}
      fillOpacity={0.14}
      className="w-full"
    >
      <div className="p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-brand-accent-lime" />
            <span className="font-mono text-[10px] text-gray-500 tracking-widest uppercase">
              {lang === "zh" ? "研究地图 // 知识体系" : "RESEARCH MAP // KNOWLEDGE GRAPH"}
            </span>
          </div>
          {activeDomain && (
            <button
              onClick={() => onSelectDomain(null)}
              className="text-[10px] font-mono text-brand-accent-orange hover:text-white transition-colors cursor-pointer"
            >
              {lang === "zh" ? "显示全部" : "SHOW ALL"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {RESEARCH_MAP.map((domain) => {
            const isActive = activeDomain === domain.domain;
            return (
              <div key={domain.domain} className="space-y-2">
                <button
                  onClick={() => onSelectDomain(isActive ? null : domain.domain)}
                  className={`flex items-center gap-2 w-full text-left cursor-pointer transition-colors group ${
                    isActive ? "text-brand-accent-lime" : "text-white hover:text-brand-accent-lime"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full transition-colors ${isActive ? "bg-brand-accent-lime" : "bg-gray-600 group-hover:bg-brand-accent-lime"}`} />
                  <span className="font-display font-bold text-xs md:text-sm tracking-wide uppercase">
                    {domain.labelZh}
                  </span>
                </button>

                <ul className="space-y-1 pl-3.5 border-l border-white/5">
                  {domain.items.map((item, idx) => {
                    const isLast = idx === domain.items.length - 1;
                    return (
                      <li key={item.name} className="flex items-center gap-2 text-[11px] font-mono text-gray-500">
                        <span className="text-gray-700 select-none">{isLast ? "└─" : "├─"}</span>
                        <span>{lang === "zh" ? item.labelZh : item.name}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </BorderGlow>
  );
}
