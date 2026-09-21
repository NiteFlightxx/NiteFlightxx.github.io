/**
 * Interactive-demo shell + slider primitives shared by every drone panel.
 * Shells render on dark surfaces in both site themes (same convention as
 * article code blocks), so canvas colors can stay fixed.
 */
import React from "react";

export function DemoShell({
  title, hint, children, footer,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="my-8 overflow-hidden rounded-xl border border-border-subtle bg-[#0b0d0c] select-none">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-primary" />
        <span className="font-mono text-[11px] tracking-widest text-accent-primary uppercase">
          交互演示 · {title}
        </span>
      </div>
      {hint && (
        <p className="border-b border-white/5 px-4 py-2.5 text-xs leading-relaxed text-text-muted">
          {hint}
        </p>
      )}
      <div className="p-4">{children}</div>
      {footer && (
        <div className="border-t border-white/5 px-4 py-2 text-[11px] font-mono text-text-faint">
          {footer}
        </div>
      )}
    </div>
  );
}

export function DemoSlider({
  label, value, min, max, step, onChange, format, accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  accent?: string;
}) {
  return (
    <label className="flex min-w-[140px] flex-1 flex-col gap-1.5">
      <span className="flex items-baseline justify-between font-mono text-[11px] text-text-secondary">
        <span>{label}</span>
        <span style={{ color: accent }} className="font-semibold tabular-nums">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-accent-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/70"
        style={{ accentColor: accent ?? "var(--color-accent-primary, #bcfd49)" }}
      />
    </label>
  );
}

export function DemoButton({
  children, onClick, primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-mono text-[11px] tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/70 ${
        primary
          ? "border-accent-primary/40 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25"
          : "border-white/15 bg-white/5 text-text-secondary hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
