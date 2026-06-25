import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import matter from 'gray-matter';
import { knowledgeCategoryZh, labTopicZh } from './taxonomy';
import type { ContentArticle } from '../types';

// Shared Markdown -> HTML pipeline (remark-math + rehype-katex at build time).
const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify);

/** Render a Markdown body to { html, searchText }. */
async function renderMarkdown(body: string): Promise<{ html: string; searchText: string }> {
  const file = await processor.process(body);
  return { html: String(file), searchText: body.toLowerCase() };
}

/** Map an ISO frontmatter date to the localized display string the UI expects. */
function formatZhDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

interface LoadedEntry {
  slug: string;
  isoDate: string; // kept for sorting (avoids re-parsing the localized string)
  data: Record<string, unknown>;
  html: string;
  searchText: string;
}

/** Read all .md files for a pre-resolved glob, skipping `_`-prefixed templates.
 *  The glob itself must be a static literal at each call site (Vite analyzes it at build time). */
async function loadRaw(modules: Record<string, () => Promise<string>>): Promise<LoadedEntry[]> {
  const entries = await Promise.all(
    Object.entries(modules).map(async ([path, loader]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '');
      // Skip template files (underscore-prefixed).
      if (slug.startsWith('_')) return null;
      const raw = (await loader()) as string;
      const { data, content } = matter(raw);
      const { html, searchText } = await renderMarkdown(content);
      return { slug, isoDate: String(data.date ?? ''), data, html, searchText };
    }),
  );
  return entries.filter((e): e is LoadedEntry => e !== null);
}

/** Sort newest-first by ISO date (stable fallback for equal/invalid dates). */
function sortByDateDesc(entries: LoadedEntry[]): LoadedEntry[] {
  return entries.sort((a, b) => {
    const ad = new Date(a.isoDate).getTime();
    const bd = new Date(b.isoDate).getTime();
    if (Number.isNaN(ad) || Number.isNaN(bd)) return 0;
    return bd - ad;
  });
}

/** Load knowledge articles (知识库). */
export async function loadKnowledge(): Promise<ContentArticle[]> {
  const modules = import.meta.glob<string>('/src/content/knowledge/*.md', {
    query: '?raw',
    import: 'default',
  });
  const entries = sortByDateDesc(await loadRaw(modules));
  return entries.map((e) => ({
    id: e.slug,
    slug: e.slug,
    title: String(e.data.title ?? ''),
    excerpt: String(e.data.excerpt ?? ''),
    date: formatZhDate(e.isoDate),
    category: knowledgeCategoryZh(String(e.data.category ?? '')),
    tags: Array.isArray(e.data.tags) ? (e.data.tags as string[]) : [],
    readTime: e.data.readTime ? String(e.data.readTime) : undefined,
    html: e.html,
    searchText: e.searchText,
  }));
}

/** Load lab experiments (实验室). topic is mapped onto `category` for the shared shape. */
export async function loadLab(): Promise<ContentArticle[]> {
  const modules = import.meta.glob<string>('/src/content/lab/*.md', {
    query: '?raw',
    import: 'default',
  });
  const entries = sortByDateDesc(await loadRaw(modules));
  return entries.map((e) => ({
    id: e.slug,
    slug: e.slug,
    title: String(e.data.title ?? ''),
    excerpt: String(e.data.excerpt ?? ''),
    date: formatZhDate(e.isoDate),
    category: labTopicZh(String(e.data.topic ?? '')), // Lab "topic" surfaces as category
    tags: Array.isArray(e.data.tags) ? (e.data.tags as string[]) : [],
    readTime: undefined, // Lab experiments have no read-time estimate
    html: e.html,
    searchText: e.searchText,
  }));
}
