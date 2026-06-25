import React, { useEffect, useMemo, useRef, useState } from "react";
import { List, ChevronDown } from "lucide-react";

interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

interface ArticleTocProps {
  headings: TocHeading[];
  lang: "zh" | "en";
}

/**
 * Left-side table of contents for article pages.
 * Mirrors the Header nav active-state language: lime text + glow + left border.
 * Scroll-spy via IntersectionObserver tracks the heading nearest the viewport top.
 *
 * Hierarchy is collapsible per H2 section: each `##` heading owns the `###`
 * entries that follow it, and its chevron toggles just those children open/
 * closed (the whole list is never hidden at once). Body entries use Source Han
 * Sans CN (font-sans); only the small "目录" label keeps font-mono.
 */
export default function ArticleToc({ headings, lang }: ArticleTocProps) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3);

  // Group: each H2 owns the H3s that follow it until the next H2.
  const groups = useMemo(() => {
    const result: { h2: TocHeading; children: TocHeading[] }[] = [];
    let current: { h2: TocHeading; children: TocHeading[] } | null = null;
    for (const item of items) {
      if (item.depth === 2) {
        current = { h2: item, children: [] };
        result.push(current);
      } else if (current) {
        current.children.push(item);
      }
    }
    return result;
  }, [items]);

  // Map every H3 slug -> its parent H2 slug (for auto-expand on scroll-spy).
  const parentOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) {
      for (const c of g.children) map[c.slug] = g.h2.slug;
    }
    return map;
  }, [groups]);

  // Which H2 sections are collapsed (default: all expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeSlug, setActiveSlug] = useState<string>(items[0]?.slug ?? "");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    // Track which heading is closest to the top of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = visible[0].target.id;
          setActiveSlug(id);
          // Auto-expand the parent H2 if the active H3 is currently hidden,
          // so scroll-spy never points at an invisible entry.
          const parent = parentOf[id];
          if (parent) {
            setCollapsed((prev) => {
              if (!prev.has(parent)) return prev;
              const next = new Set(prev);
              next.delete(parent);
              return next;
            });
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    observerRef.current = observer;

    items.forEach((item) => {
      const el = document.getElementById(item.slug);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, slug: string) => {
    e.preventDefault();
    const el = document.getElementById(slug);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${slug}`);
    }
  };

  const toggle = (slug: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <nav
      className="glass-panel border border-white/5 rounded-xl select-none overflow-hidden"
      aria-label="table of contents"
    >
      {/* Header label (static — folding happens per H2 below, not here) */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
        <List className="w-3.5 h-3.5 text-brand-accent-lime" />
        <span className="font-mono text-[13px] text-gray-400 uppercase tracking-widest">
          {lang === "zh" ? "目录" : "Contents"}
        </span>
      </div>

      <ul className="px-3 py-3 max-h-[calc(100vh-220px)] overflow-y-auto">
        {groups.map((group) => {
          const isH2Active = activeSlug === group.h2.slug;
          const isCollapsed = collapsed.has(group.h2.slug);
          const hasChildren = group.children.length > 0;
          return (
            <li key={group.h2.slug} className="mb-1">
              {/* H2 row: chevron toggle (only when it has children) + link */}
              <div className="flex items-start gap-1">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggle(group.h2.slug)}
                    className="mt-1 flex-shrink-0 text-gray-500 hover:text-brand-accent-lime transition-colors"
                    aria-label={isCollapsed ? "展开" : "折叠"}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-300 ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                    />
                  </button>
                ) : (
                  <span className="w-3 flex-shrink-0 mt-1" />
                )}
                <a
                  href={`#${group.h2.slug}`}
                  onClick={(e) => scrollTo(e, group.h2.slug)}
                  className={`flex-1 block py-2 pr-2 pl-2 text-[15px] font-sans leading-relaxed transition-all duration-300 border-l-2 ${
                    isH2Active
                      ? "text-brand-accent-lime border-brand-accent-lime drop-shadow-[0_0_8px_rgba(188,253,73,0.35)]"
                      : "text-gray-200 border-transparent hover:text-white"
                  }`}
                >
                  {group.h2.text}
                </a>
              </div>

              {/* H3 children — animated collapse per H2 section */}
              <div
                className={`grid transition-all duration-300 ease-out ${
                  isCollapsed
                    ? "grid-rows-[0fr] opacity-0"
                    : "grid-rows-[1fr] opacity-100"
                }`}
              >
                <div className="overflow-hidden">
                  <ul className="pl-4">
                    {group.children.map((child) => {
                      const isActive = activeSlug === child.slug;
                      return (
                        <li key={child.slug}>
                          <a
                            href={`#${child.slug}`}
                            onClick={(e) => scrollTo(e, child.slug)}
                            className={`block py-2 pr-2 pl-3 text-[14px] font-sans leading-relaxed transition-all duration-300 border-l-2 ${
                              isActive
                                ? "text-brand-accent-lime border-brand-accent-lime drop-shadow-[0_0_8px_rgba(188,253,73,0.35)]"
                                : "text-gray-400 border-transparent hover:text-gray-200 hover:border-white/20"
                            }`}
                          >
                            {child.text}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
