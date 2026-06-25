import React, { useState } from "react";
import { motion } from "motion/react";
import { FileSpreadsheet, Copy, Check, FileCode, Landmark, Terminal, Zap } from "lucide-react";
import { ResearchNote } from "../types";
import MathRenderer from "./MathRenderer";
import BorderGlow from "./BorderGlow";

interface ResearchViewProps {
  researchNotes: ResearchNote[];
  lang: "zh" | "en";
}

export default function ResearchView({ researchNotes, lang }: ResearchViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-16 pb-20 select-none" id="research-view-container">
      {/* Intro Header */}
      <div className="max-w-4xl mx-auto text-center space-y-4 px-6">
        <span className="font-mono text-[10px] text-brand-accent-orange uppercase tracking-widest">
          {lang === "zh" ? "物理与图像算法数理推导验证" : "MATHEMATICAL & ALGORITHMIC DERIVATIONS"}
        </span>
        <h1 className="font-display font-black text-4xl md:text-6xl text-white tracking-tighter">
          {lang === "zh" ? "学术研究手册" : "Research Notebook"}
        </h1>
        <p className="font-sans text-sm md:text-base text-gray-400 max-w-xl mx-auto font-light leading-relaxed">
          {lang === "zh"
            ? "深入浅出的学术化研究推导、精确数值求解方案以及解析力学证明，为高精度骨骼运动与物理流体仿真保驾护航。"
            : "Scholarly deep dives, analytical formulations, and numerical solution designs supporting complex graphics, skeletal kinetics, and simulation pipelines."}
        </p>
      </div>

      {/* Main Notebook Feed */}
      <div className="max-w-4xl mx-auto px-6 space-y-16">
        {researchNotes.map((note) => (
          <motion.section
            key={note.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative"
          >
            <BorderGlow
              edgeSensitivity={30}
              glowColor="76 95 64"
              backgroundColor="#121214"
              borderRadius={16}
              glowRadius={50}
              glowIntensity={1.2}
              coneSpread={20}
              colors={["#bcfd49", "#6366f1", "#4f46e5"]}
              fillOpacity={0.16}
              className="w-full"
            >
              <div className="p-8 space-y-6 relative overflow-hidden">
                {/* Note Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-brand-accent-lime" />
                    <span className="font-mono text-[10px] text-gray-500 tracking-wider">
                      {lang === "zh" ? "数理备忘录 // 卷_" : "MEMORANDUM // VOL_"}{note.id.toUpperCase().substring(0, 4)}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-gray-500">{note.date.toUpperCase()}</span>
                </div>

                {/* Title */}
                <h2 className="font-display font-medium text-lg md:text-2xl text-white tracking-wide hover:text-brand-accent-lime transition-colors">
                  {note.title}
                </h2>

                {/* Mathematical Equation Block */}
                {note.mathFormula && (
                  <div className="space-y-2">
                    <span className="font-mono text-[8px] text-gray-500 tracking-wider block uppercase">
                      {note.mathLabel || (lang === "zh" ? "核心控制方程" : "GOVERNING EQUATION")}
                    </span>
                    <MathRenderer formulaKey={note.id} />
                  </div>
                )}

                {/* Problem & Solution Split Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-brand-accent-lime uppercase font-medium">
                      {lang === "zh" ? "核心数值挑战 (Problem):" : "The Computational Problem:"}
                    </span>
                    <p className="text-xs md:text-sm text-gray-300 leading-relaxed font-sans font-light">
                      {note.problem}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-emerald-500 uppercase font-medium">
                      {lang === "zh" ? "工程解决方案 (Solution):" : "The Engineering Solution:"}
                    </span>
                    <p className="text-xs md:text-sm text-gray-300 leading-relaxed font-sans font-light">
                      {note.solution}
                    </p>
                  </div>
                </div>

                {/* Technical Implementation details */}
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block">
                    {lang === "zh" ? "代码实现细节与性能优化" : "IMPLEMENTATION METHODOLOGY"}
                  </span>
                  <p className="text-xs md:text-sm text-gray-400 leading-relaxed font-sans font-light">
                    {note.implementationDetails}
                  </p>
                </div>

                {/* Embedded Source Code Blocks */}
                {(note.cppCode || note.hlslCode) && (
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] text-gray-500 tracking-wider uppercase flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-brand-accent-lime" />
                        {lang === "zh" ? "数值求解器源码片段" : "SOLVER IMPLEMENTATION CODE"}
                      </span>

                      <button
                        onClick={() => copyCode(note.id, (note.cppCode || note.hlslCode) as string)}
                        className="px-2 py-0.5 text-[9px] font-mono border border-white/5 hover:border-white/10 bg-brand-black hover:bg-white/5 rounded text-gray-400 hover:text-white transition-all cursor-pointer flex items-center gap-1"
                      >
                        {copiedId === note.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" /> {lang === "zh" ? "已复制" : "COPIED"}
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> {lang === "zh" ? "复制代码" : "COPY SOURCE"}
                          </>
                        )}
                      </button>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-brand-black/40 overflow-hidden shadow-inner">
                      <div className="px-4 py-2 bg-brand-black/80 border-b border-white/5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-accent-lime" />
                        <span className="font-mono text-[9px] text-gray-500">
                          {note.cppCode ? "SolverImplementation.cpp" : "ShaderKernel.hlsl"}
                        </span>
                      </div>
                      <pre className="p-4 overflow-x-auto text-xs font-mono text-gray-300 leading-relaxed bg-brand-charcoal/30 select-text max-h-[300px]">
                        <code>{note.cppCode || note.hlslCode}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </BorderGlow>
          </motion.section>
        ))}
      </div>
    </div>
  );
}
