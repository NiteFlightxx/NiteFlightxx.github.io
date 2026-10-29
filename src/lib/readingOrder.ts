import order from '../data/reading-order.json';

export interface ReadingArticle { slug: string; title: string; }
export interface ReadingSection {
  title: string;
  mode: 'sequence' | 'reference';
  notes?: Record<string, string>;
  articles: ReadingArticle[];
}
export interface ReadingGroup { id: string; title: string; domain?: string; description?: string; sections: ReadingSection[]; }
export const articleHref = (slug: string) => `${import.meta.env.BASE_URL}knowledge/${slug}/`;

/** Only public entries supplied by the caller can enter navigation. No planned placeholders. */
export function readingGroups(articles: ReadingArticle[]): ReadingGroup[] {
  const bySlug = new Map(articles.map(article => [article.slug, article]));
  const assigned = new Set<string>();
  const groups: ReadingGroup[] = order.map(group => ({ ...group, sections: group.sections.map(section => ({
    title: section.title,
    mode: section.mode as ReadingSection['mode'],
    notes: 'notes' in section ? section.notes as Record<string, string> : undefined,
    articles: section.articles.flatMap(slug => {
      const article = bySlug.get(slug);
      if (!article || assigned.has(slug)) return [];
      assigned.add(slug);
      return [article];
    }),
  })).filter(section => section.articles.length) })).filter(group => group.sections.length);
  const other = articles.filter(article => !assigned.has(article.slug)).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  if (other.length) groups.push({ id: 'other', title: '其他文档', sections: [{ title: '文档', mode: 'reference', articles: other }] });
  return groups;
}
export function readingContext(groups: ReadingGroup[], slug: string) {
  for (const group of groups) {
    for (const section of group.sections) {
      const index = section.articles.findIndex(article => article.slug === slug);
      if (index < 0) continue;
      const sequential = section.mode === 'sequence';
      return { group, section, position: sequential ? index + 1 : undefined,
        total: section.articles.length, note: section.notes?.[slug],
        previous: sequential ? section.articles[index - 1] : undefined,
        next: sequential ? section.articles[index + 1] : undefined };
    }
  }
}
export type ReadingContext = NonNullable<ReturnType<typeof readingContext>>;
