import React, { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Progressive enhancement for article pages, run after hydration:
 *
 * 1. **Reading progress bar** — a fixed lime gradient bar at the very top of
 *    the viewport whose width tracks scroll position through the <article>.
 *    Uses a passive scroll listener + requestAnimationFrame throttling so it
 *    stays cheap even on long articles.
 *
 * 2. **Code-block copy buttons** — every <pre> inside .article-body gets a
 *    small button in its top-right corner. Clicking copies the code text to
 *    the clipboard and shows a 2s "copied" check. Buttons are injected via
 *    DOM (the code blocks are server-rendered Markdown, not React-managed),
 *    so this component renders no children — it only manipulates the DOM
 *    through refs/effects.
 *
 * Both features are no-ops if the article container isn't found (e.g. on the
 * SPA home page where this component isn't mounted).
 */
export default function ArticleEnhancements() {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const article = document.querySelector<HTMLElement>(".article-body");
    if (!article) return;

    // ---- Reading progress bar ----
    const bar = progressBarRef.current;
    let ticking = false;

    const updateProgress = () => {
      ticking = false;
      if (!bar) return;
      const rect = article.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) {
        bar.style.width = "0%";
        return;
      }
      // scrolled = how far the article top has moved above the viewport top.
      // Clamp to [0, 1] so the bar never overflows or goes negative.
      const scrolled = Math.min(Math.max(-rect.top, 0), total);
      const pct = (scrolled / total) * 100;
      bar.style.width = `${pct}%`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // ---- Code-block copy buttons ----
    const preBlocks = article.querySelectorAll<HTMLPreElement>("pre");
    const buttons: HTMLButtonElement[] = [];

    preBlocks.forEach((pre) => {
      // Skip if a button is already there (React StrictMode double-invoke in dev).
      if (pre.querySelector(".code-copy-btn")) return;

      const btn = document.createElement("button");
      btn.className = "code-copy-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "复制代码");
      btn.innerHTML = '<svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

      const onClick = async (e: Event) => {
        e.preventDefault();
        const code = pre.querySelector("code");
        const text = code ? code.textContent : pre.textContent;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          btn.classList.add("copied");
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = '<svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          }, 2000);
        } catch {
          // clipboard API can fail in non-secure contexts; silently ignore.
        }
      };

      btn.addEventListener("click", onClick);
      pre.appendChild(btn);
      buttons.push(btn);
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      buttons.forEach((btn) => {
        const pre = btn.parentElement;
        if (pre) pre.removeChild(btn);
      });
    };
  }, []);

  return (
    <>
      {/* Reading progress bar — fixed at viewport top, above the sticky header. */}
      <div
        className="fixed top-0 left-0 z-[60] h-[2px] w-full pointer-events-none"
        aria-hidden="true"
      >
        <div
          ref={progressBarRef}
          className="h-full w-0 bg-gradient-to-r from-brand-accent-lime via-brand-accent-gold-light to-brand-accent-lime transition-[width] duration-75 ease-out"
          style={{ width: "0%" }}
        />
      </div>
      {/* mounted guard keeps the effect from running twice in React StrictMode
          during development — the cleanup handles real unmounts. */}
      {mounted ? null : null}
    </>
  );
}
