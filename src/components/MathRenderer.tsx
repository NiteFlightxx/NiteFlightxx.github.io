import React from "react";

interface MathRendererProps {
  formulaKey: string;
  centered?: boolean;
}

export default function MathRenderer({ formulaKey, centered = true }: MathRendererProps) {
  // Return semantic high-fidelity HTML renderings of our mathematical formulas
  const renderFormula = () => {
    switch (formulaKey) {
      case "rayleigh":
        return (
          <div className="flex items-center gap-1 font-serif text-lg tracking-wide text-brand-accent-silver select-none">
            <span className="italic">P</span>
            <sub className="text-xs font-sans not-italic">Rayleigh</sub>
            <span className="mx-0.5">(</span>
            <span className="font-sans">θ</span>
            <span className="mx-0.5">) =</span>
            <div className="flex flex-col items-center mx-1 text-xs">
              <span className="border-b border-gray-600 pb-0.5 px-1 font-sans">3</span>
              <span className="pt-0.5 px-1 font-sans">16π</span>
            </div>
            <span className="mx-1">(1 + cos</span>
            <sup className="text-xs font-sans">2</sup>
            <span className="font-sans">θ</span>
            <span>)</span>
          </div>
        );
      case "hg":
        return (
          <div className="flex items-center flex-wrap gap-y-2 font-serif text-lg tracking-wide text-brand-accent-silver select-none">
            <span className="italic">P</span>
            <sub className="text-xs font-sans not-italic">HG</sub>
            <span className="mx-0.5">(</span>
            <span className="italic">g</span>
            <span className="mx-0.5">,</span>
            <span className="font-sans">θ</span>
            <span className="mx-0.5">) =</span>
            <div className="flex flex-col items-center mx-1 text-xs">
              <span className="border-b border-gray-600 pb-0.5 px-1 font-sans">1</span>
              <span className="pt-0.5 px-1 font-sans">4π</span>
            </div>
            <div className="flex flex-col items-center mx-1 text-xs">
              <span className="border-b border-gray-600 pb-0.5 px-1 font-sans">1 - <span className="italic">g</span><sup className="text-[10px]">2</sup></span>
              <span className="pt-0.5 px-1 font-sans">(1 + <span className="italic">g</span><sup className="text-[10px]">2</sup> - 2<span className="italic">g</span> cos θ)<sup className="text-[10px]">3/2</sup></span>
            </div>
          </div>
        );
      case "verlet":
        return (
          <div className="flex items-center gap-1 font-serif text-lg tracking-wide text-brand-accent-silver select-none">
            <span className="italic">x</span>
            <sub className="text-xs font-sans">t + Δt</sub>
            <span className="mx-1">=</span>
            <span className="italic">x</span>
            <sub className="text-xs font-sans">t</sub>
            <span className="mx-1">+</span>
            <span className="italic">v</span>
            <sub className="text-xs font-sans">t</sub>
            <span className="font-sans font-normal">Δt</span>
            <span className="mx-1">+</span>
            <div className="flex flex-col items-center mx-1 text-xs">
              <span className="border-b border-gray-600 pb-0.5 px-1 font-sans">1</span>
              <span className="pt-0.5 px-1 font-sans">2</span>
            </div>
            <span className="italic">a</span>
            <sub className="text-xs font-sans">t</sub>
            <span className="font-sans font-normal">Δt</span>
            <sup className="text-xs font-sans">2</sup>
          </div>
        );
      case "spatial_hash":
        return (
          <div className="flex items-center flex-wrap gap-1 font-mono text-sm tracking-normal text-brand-accent-silver select-none">
            <span className="font-serif italic text-lg">H</span>
            <span>(x, y, z) = ((x × 73856093) ⊕ (y × 19349663) ⊕ (z × 83492791)) mod M</span>
          </div>
        );
      case "quaternion-damper":
        return (
          <div className="flex flex-col md:flex-row md:items-center gap-2 font-serif text-base md:text-lg tracking-wide text-brand-accent-silver select-none">
            <div className="flex items-center gap-1">
              <span className="italic">J</span>
              <span className="italic">θ</span>
              <span className="relative -top-1 font-sans">••</span>
              <span className="mx-1">+</span>
              <span className="italic">C</span>
              <span className="italic">θ</span>
              <span className="relative -top-1 font-sans">•</span>
              <span className="mx-1">+</span>
              <span className="italic">K</span>
              <span className="italic">θ</span>
              <span className="mx-1">= 0</span>
            </div>
            <span className="hidden md:inline mx-2 text-gray-500 font-sans font-light">⟹</span>
            <div className="flex items-center gap-1">
              <span className="italic">q</span>
              <sub className="text-xs font-sans not-italic">next</sub>
              <span className="mx-1">=</span>
              <span className="font-sans font-semibold text-xs bg-brand-gray-700 text-gray-300 px-1 py-0.5 rounded uppercase tracking-wider">Slerp</span>
              <span>(</span>
              <span className="italic">q</span>
              <sub className="text-xs font-sans not-italic">curr</sub>
              <span className="mx-0.5">,</span>
              <span className="italic">q</span>
              <sub className="text-xs font-sans not-italic">target</sub>
              <span className="mx-0.5">,</span>
              <span className="font-sans">α</span>
              <span>)</span>
            </div>
          </div>
        );
      case "gpu-poisson":
        return (
          <div className="flex flex-col items-center gap-3 font-serif text-base tracking-wide text-brand-accent-silver select-none">
            <div className="flex items-center gap-1">
              <span className="font-sans">∇</span>
              <sup className="text-xs font-sans">2</sup>
              <span className="italic">p</span>
              <span className="mx-1">=</span>
              <div className="flex flex-col items-center mx-1 text-xs">
                <span className="border-b border-gray-600 pb-0.5 px-1 font-sans">ρ</span>
                <span className="pt-0.5 px-1 font-sans">Δt</span>
              </div>
              <span className="font-sans">∇</span>
              <span className="mx-1">·</span>
              <span className="font-sans">u</span>
              <sup className="text-xs font-sans">*</sup>
            </div>
            <span className="text-gray-500 font-sans font-light my-0.5">⟹ Iteration Method:</span>
            <div className="flex items-center flex-wrap justify-center gap-1">
              <span className="italic">p</span>
              <sub className="text-[10px] font-sans">i,j,k</sub>
              <sup className="text-[10px] font-sans">k+1</sup>
              <span className="mx-1">=</span>
              <div className="flex flex-col items-center mx-1 text-xs">
                <span className="border-b border-gray-600 pb-0.5 px-1 font-sans">1</span>
                <span className="pt-0.5 px-1 font-sans">6</span>
              </div>
              <span>(</span>
              <span className="italic">p</span><sub className="text-[10px] font-sans">i+1</sub><span className="mx-0.5">+</span>
              <span className="italic">p</span><sub className="text-[10px] font-sans">i-1</sub><span className="mx-0.5">+</span>
              <span className="italic">p</span><sub className="text-[10px] font-sans">j+1</sub><span className="mx-0.5">+</span>
              <span className="italic">p</span><sub className="text-[10px] font-sans">j-1</sub><span className="mx-0.5">+</span>
              <span className="italic">p</span><sub className="text-[10px] font-sans">k+1</sub><span className="mx-0.5">+</span>
              <span className="italic">p</span><sub className="text-[10px] font-sans">k-1</sub>
              <span className="mx-1">-</span>
              <span className="italic">d</span><sup className="text-xs font-sans">2</sup>
              <span className="font-sans font-normal italic">D</span><sub className="text-[10px] font-sans">i,j,k</sub>
              <span>)</span>
            </div>
          </div>
        );
      default:
        return <span className="font-mono text-gray-500">{formulaKey}</span>;
    }
  };

  return (
    <div
      className={`font-sans py-4 px-6 rounded-lg bg-brand-charcoal border border-white/5 shadow-inner overflow-x-auto flex items-center ${
        centered ? "justify-center" : "justify-start"
      }`}
    >
      {renderFormula()}
    </div>
  );
}
