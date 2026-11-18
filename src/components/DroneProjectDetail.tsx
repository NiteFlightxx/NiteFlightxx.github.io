
import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { BookOpen, FileText, X } from "lucide-react";
import type { Project } from "../types";
import DroneSandbox from "./demos/DroneSandbox";

interface DroneProjectDetailProps {
  project: Project;
  onClose: () => void;
  lang: "zh" | "en";
}

export default function DroneProjectDetail({ project, onClose, lang }: DroneProjectDetailProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const zh = lang === "zh";
  const base = import.meta.env.BASE_URL;
  const [title, subtitle] = project.title.split(" — ");
  const articleLabel = zh ? "阅读基础原理" : "Flight basics";
  const controlLabel = zh ? "阅读飞控数学" : "Control mathematics";

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled])',
      )).filter((element) => !!element.getClientRects().length);
      const first = items.at(0);
      const last = items.at(-1);
      if (event.shiftKey && first && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && last && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <motion.div id="drone-flight-lab" className="drone-project" ref={dialogRef}
      role="dialog" aria-modal="true" aria-labelledby="drone-project-title"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <div className="drone-project__inner">
        <header className="drone-project__header">
          <h2 id="drone-project-title">{title}{subtitle && <span>{subtitle}</span>}</h2>
          <div className="drone-project__links">
            <a href={base + "knowledge/" + project.articleSlug + "/"} title={articleLabel} aria-label={articleLabel}>
              <BookOpen size={16} aria-hidden="true" /><span>{articleLabel}</span>
            </a>
            <a href={base + "knowledge/quadcopter-flight-control-math/"} title={controlLabel} aria-label={controlLabel}>
              <FileText size={16} aria-hidden="true" /><span>{controlLabel}</span>
            </a>
            <button ref={closeButtonRef} className="drone-project__close" type="button" onClick={onClose}
              aria-label={zh ? "关闭无人机项目" : "Close drone project"}>
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>
        <DroneSandbox variant="project" />
      </div>
    </motion.div>
  );
}
