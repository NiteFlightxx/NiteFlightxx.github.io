import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  Cpu,
  Gauge,
  Layers3,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Project } from "../types";
import DroneSandbox from "./demos/DroneSandbox";

const BASE_URL = import.meta.env.BASE_URL;

interface DroneProjectDetailProps {
  project: Project;
  onClose: () => void;
  lang: "zh" | "en";
}

const PIPELINE = [
  { index: "01", title: "Movement Intent", detail: "Route / Hold / Velocity", icon: Route },
  { index: "02", title: "Trajectory", detail: "Motion Plan / MPCC-style", icon: Activity },
  { index: "03", title: "Flight Control", detail: "Position → Rate PID", icon: SlidersHorizontal },
  { index: "04", title: "Physical Plant", detail: "Allocator → Rotor → Chaos", icon: Cpu },
];

const NAV_ITEMS = [
  ["lab-overview", "概览"],
  ["lab-architecture", "架构"],
  ["lab-decisions", "决策"],
  ["lab-boundaries", "边界"],
] as const;

export default function DroneProjectDetail({ project, onClose, lang }: DroneProjectDetailProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const zh = lang === "zh";
  const basicArticleUrl = `${BASE_URL}knowledge/${project.articleSlug}/`;
  const controlArticleUrl = `${BASE_URL}knowledge/quadcopter-flight-control-math/`;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const jumpTo = (id: string) => {
    dialogRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drone-project-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#060807] text-text-primary"
      id="drone-flight-lab"
    >
      <header className="relative z-30 flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0b0e0c]/95 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-5">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent-primary/30 bg-accent-primary/10 sm:flex">
            <Gauge className="h-4 w-4 text-accent-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.18em] text-accent-primary uppercase md:text-[10px]">
              <span>AIRCRAFT LAB</span><span className="text-text-faint">/</span><span className="text-text-muted">FLIGHT CONTROL</span>
            </div>
            <h2 id="drone-project-title" className="mt-0.5 truncate text-sm font-bold tracking-tight text-white md:text-base">
              {project.title}
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 font-mono text-[9px] text-text-muted lg:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-primary/25 bg-accent-primary/8 px-2.5 py-1 text-accent-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_rgba(188,253,73,0.8)]" /> LIVE LAB
            </span>
            <span>{project.year}</span>
            <span>OGL / WEBGL</span>
          </div>
          <a
            href={controlArticleUrl}
            className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] text-text-secondary transition-colors hover:border-accent-primary/35 hover:text-accent-primary sm:inline-flex"
          >
            <BookOpen className="h-3.5 w-3.5" /> {zh ? "飞控文档" : "Control docs"}
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={zh ? "关闭无人机项目" : "Close drone project"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-text-muted transition-colors hover:border-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <nav className="z-20 flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-[#090b0a] px-3 py-2 lg:hidden" aria-label="项目章节">
        {NAV_ITEMS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => jumpTo(id)} className="shrink-0 rounded-md px-3 py-1.5 font-mono text-[10px] text-text-muted hover:bg-white/[0.05] hover:text-accent-primary">
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_390px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="min-w-0 bg-[#070908] lg:overflow-y-auto">
          <section className="border-b border-white/10 px-4 py-4 md:px-6" aria-label="控制链路">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] tracking-[0.18em] text-text-faint uppercase">SYSTEM SIGNAL PATH</p>
                <p className="mt-1 text-xs text-text-secondary">从任务意图到物理机体，逐层观察输入如何变成运动。</p>
              </div>
              <span className="hidden font-mono text-[9px] text-text-faint md:block">GT → PT / ASYNC PHYSICS</span>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {PIPELINE.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.index} className="group relative min-w-0 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-3 transition-colors hover:border-accent-primary/30 hover:bg-accent-primary/[0.035]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] text-accent-primary">{stage.index}</span>
                      <Icon className="h-3.5 w-3.5 text-text-faint group-hover:text-accent-primary" />
                    </div>
                    <p className="mt-2 truncate text-xs font-semibold text-white">{stage.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[9px] text-text-faint">{stage.detail}</p>
                    {index < PIPELINE.length - 1 && <span className="absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 font-mono text-[10px] text-text-faint xl:block">→</span>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="relative min-h-[560px] border-b border-white/10">
            <div className="pointer-events-none absolute right-4 top-4 z-20 hidden rounded-md border border-white/10 bg-black/45 px-2.5 py-1.5 font-mono text-[9px] text-text-faint backdrop-blur md:block">
              SIM READY · 60 HZ TARGET
            </div>
            <DroneSandbox variant="project" />
          </section>

          <div className="grid gap-px border-b border-white/10 bg-white/10 md:grid-cols-3">
            {[
              ["INPUT", "拖拽视角 / 调节参数"],
              ["OBSERVE", "读取姿态、受力与响应"],
              ["CONNECT", "把现象映射回控制链"],
            ].map(([label, text]) => (
              <div key={label} className="bg-[#0a0c0b] px-5 py-4">
                <p className="font-mono text-[9px] tracking-[0.16em] text-accent-primary">{label}</p>
                <p className="mt-1 text-xs text-text-muted">{text}</p>
              </div>
            ))}
          </div>
        </main>

        <aside className="bg-[#0c0f0d] lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-white/10" aria-label="项目工程说明">
          <div className="hidden border-b border-white/10 p-4 lg:block">
            <p className="mb-2 font-mono text-[9px] tracking-[0.16em] text-text-faint uppercase">PROJECT INDEX</p>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
              {NAV_ITEMS.map(([id, label], index) => (
                <button key={id} type="button" onClick={() => jumpTo(id)} className="rounded-md px-2 py-2 font-mono text-[9px] text-text-muted transition-colors hover:bg-white/[0.05] hover:text-accent-primary">
                  0{index + 1}<span className="mt-0.5 block">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <section id="lab-overview" className="scroll-mt-24 border-b border-white/10 p-5">
            <SectionLabel icon={Gauge}>PROJECT OVERVIEW</SectionLabel>
            <p className="mt-3 text-sm leading-7 text-text-secondary">{project.overview}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {project.metrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="font-mono text-[8px] tracking-[0.12em] text-text-faint uppercase">{metric.label}</p>
                  <p className="mt-1 text-xs font-semibold text-white">{metric.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="lab-architecture" className="scroll-mt-24 border-b border-white/10 p-5">
            <SectionLabel icon={Layers3}>SYSTEM ARCHITECTURE</SectionLabel>
            <p className="mt-3 text-xs leading-6 text-text-muted">{project.architecture}</p>
            <div className="mt-4 space-y-2">
              {[
                ["01", "任务契约", "MovementIntent 统一任务、控制权与完成策略"],
                ["02", "预测参考", "动态可行轨迹 + MPCC 风格有限迭代修正"],
                ["03", "低层闭环", "位置 / 速度 / 姿态 / 角速率串级控制"],
                ["04", "物理执行", "控制分配、旋翼效能与世界 Chaos"],
              ].map(([index, title, detail]) => (
                <div key={index} className="flex gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3">
                  <span className="font-mono text-[9px] text-accent-primary">{index}</span>
                  <div><p className="text-xs font-semibold text-white">{title}</p><p className="mt-1 text-[11px] leading-5 text-text-muted">{detail}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section id="lab-decisions" className="scroll-mt-24 border-b border-white/10 p-5">
            <SectionLabel icon={Boxes}>ENGINEERING DECISIONS</SectionLabel>
            <div className="mt-3 space-y-3">
              <Decision title="一个操作只对应一条因果链" text="把油门、倾角、外力、PID 与混控拆成五个实验，零基础用户不必先理解全部公式。" />
              <Decision title="仿真状态与视角职责分离" text="模式切换保留调参状态；受力模式临时把拖拽手势交给地面射线拾取。" />
              <Decision title="真实结构，教学量纲" text="保留积分、反馈和分配关系，同时控制数值节奏，优先服务可观察性。" />
            </div>
          </section>

          <section id="lab-boundaries" className="scroll-mt-24 border-b border-white/10 p-5">
            <SectionLabel icon={ShieldCheck}>VERIFIED SCOPE</SectionLabel>
            <div className="mt-3 space-y-2">
              <ScopeItem ok text="单一 rAF 驱动物理与 3D 渲染，模式状态彼此隔离" />
              <ScopeItem ok text="控制链语义来自 AircraftLab 当前技术文档" />
              <ScopeItem ok text="桌面端与移动端共用同一交互模型" />
              <ScopeItem text="页面沙盒是教学模型，不是工程级飞行器仿真器" />
              <ScopeItem text="这里的 MPCC 指风格化预测跟踪，不宣称完整联合优化" />
            </div>
          </section>

          <section className="p-5">
            <SectionLabel icon={BookOpen}>READ THE SYSTEM</SectionLabel>
            <div className="mt-3 space-y-2">
              <ResourceLink href={basicArticleUrl} title="无人机基础交互教程" meta="五个实验 · 零基础因果链" />
              <ResourceLink href={controlArticleUrl} title="四旋翼飞控数学" meta="AircraftLab 控制链与公式" />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {project.tech.map((item) => <span key={item} className="rounded border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] text-text-muted">{item}</span>)}
            </div>
          </section>
        </aside>
      </div>
    </motion.div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.16em] text-accent-primary"><Icon className="h-3.5 w-3.5" />{children}</div>;
}

function Decision({ title, text }: { title: string; text: string }) {
  return <div className="border-l border-accent-primary/35 pl-3"><p className="text-xs font-semibold text-white">{title}</p><p className="mt-1 text-[11px] leading-5 text-text-muted">{text}</p></div>;
}

function ScopeItem({ ok = false, text }: { ok?: boolean; text: string }) {
  return <div className="flex items-start gap-2 text-[11px] leading-5 text-text-muted"><CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ok ? "text-accent-primary" : "text-accent-warm"}`} /><span>{text}</span></div>;
}

function ResourceLink({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <a href={href} className="group flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3 transition-colors hover:border-accent-primary/35 hover:bg-accent-primary/[0.035]">
      <div><p className="text-xs font-semibold text-white group-hover:text-accent-primary">{title}</p><p className="mt-1 font-mono text-[9px] text-text-faint">{meta}</p></div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-text-faint group-hover:text-accent-primary" />
    </a>
  );
}
