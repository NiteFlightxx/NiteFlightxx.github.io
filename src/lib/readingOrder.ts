import order from '../data/reading-order.json';

export interface ReadingArticle { slug: string; title: string; }
export interface ReadingGroup { id: string; title: string; domain?: string; sections: { title: string; articles: ReadingArticle[] }[]; }
export const articleHref = (slug: string) => `${import.meta.env.BASE_URL}knowledge/${slug}/`;

/** Only public entries supplied by the caller can enter navigation. No planned placeholders. */
export function readingGroups(articles: ReadingArticle[]): ReadingGroup[] {
  const bySlug = new Map(articles.map(article => [article.slug, article]));
  const assigned = new Set<string>();
  const groups: ReadingGroup[] = order.map(group => ({ ...group, sections: group.sections.map(section => ({
    title: section.title,
    articles: section.articles.flatMap(slug => {
      const article = bySlug.get(slug);
      if (!article || assigned.has(slug)) return [];
      assigned.add(slug);
      return [article];
    }),
  })).filter(section => section.articles.length) })).filter(group => group.sections.length);
  const other = articles.filter(article => !assigned.has(article.slug)).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  if (other.length) groups.push({ id: 'other', title: '其他文档', sections: [{ title: '文档', articles: other }] });
  return groups;
}
export function readingContext(groups: ReadingGroup[], slug: string) {
  for (const group of groups) {
    const entries = group.sections.flatMap(section => section.articles);
    const index = entries.findIndex(article => article.slug === slug);
    if (index < 0) continue;
    return { group, section: group.sections.find(section => section.articles.some(article => article.slug === slug))!, previous: entries[index - 1], next: entries[index + 1] };
  }
}
export type ReadingContext = NonNullable<ReturnType<typeof readingContext>>;
