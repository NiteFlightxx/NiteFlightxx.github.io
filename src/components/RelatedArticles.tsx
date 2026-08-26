import React from "react";
import { ArrowRight } from "lucide-react";
import type { ContentArticle } from "../types";

interface RelatedArticlesProps {
  articles: ContentArticle[];
  lang: "zh" | "en";
}

const BASE_URL = import.meta.env.BASE_URL;

/**
 * "Related articles" section rendered at the bottom of each article page.
 *
 * The related list is computed at build time in [slug].astro (via
 * getRelatedArticles) and passed in as plain data — this component only
 * handles presentation. Cards reuse the same dark-panel + lime-accent
 * visual language as the KnowledgeView feed but stay lightweight (no
 * BorderGlow canvas) since this is a secondary reading-time affordance.
 */
export default function RelatedArticles({ articles, lang }: RelatedArticlesProps) {
  if (articles.length === 0) return null;

  const heading = lang === "zh" ? "相关文章" : "Related Articles";

  return (
    <section className="mt-16 pt-10 border-t border-white/5">
      <div className="flex items-center gap-2 mb-6">
        <span className="w-1 h-1 rounded-full bg-brand-accent-lime" />
        <span className="font-mono text-[10px] text-brand-accent-lime uppercase tracking-widest">
          {heading}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {articles.map((art) => (
          <a
            key={art.id}
            href={`${BASE_URL}knowledge/${art.slug}`}
            className="group block p-5 rounded-xl border border-white/5 bg-brand-charcoal hover:border-brand-accent-lime/30 transition-all duration-300"
          >
            <div className="flex items-center justify-between text-[9px] font-mono mb-3">
              <span className="text-brand-accent-lime uppercase tracking-wider">
                {art.category}
              </span>
              {art.readTime && (
                <span className="text-gray-500">{art.readTime}</span>
              )}
            </div>

            <h3 className="font-display font-semibold text-sm text-white group-hover:text-brand-accent-lime transition-colors leading-snug mb-2 line-clamp-2">
              {art.title}
            </h3>

            {art.excerpt && (
              <p className="text-[11px] text-gray-500 leading-relaxed font-sans line-clamp-2">
                {art.excerpt}
              </p>
            )}

            <div className="flex items-center gap-1 mt-3 text-[9px] font-mono text-gray-600 group-hover:text-brand-accent-lime transition-colors">
              {lang === "zh" ? "阅读" : "Read"}
              <ArrowRight className="w-3 h-3" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
