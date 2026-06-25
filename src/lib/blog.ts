import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import matter from 'gray-matter';

export interface BlogArticleData {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  date: string;        // display string, e.g. "2026年5月14日"
  category: string;
  tags: string[];
  readTime: string;
  html: string;        // rendered HTML (Markdown + KaTeX), for the ArticleViewer
  searchText: string;  // plain-text body for BlogView's search box
}

// Glob all markdown files under src/content/blog/. eager: false -> raw strings.
const modules = import.meta.glob<string>('/src/content/blog/*.md', {
  query: '?raw',
  import: 'default',
});

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify);

// Map ISO frontmatter dates to the localized display strings the UI expects.
function formatZhDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// Category -> Chinese display label (kept for parity with the old .replace() hacks).
const CATEGORY_ZH: Record<string, string> = {
  'Physics Simulation': '物理模拟',
  'Real-time Rendering': '实时渲染',
  'Animation Technical Art': '动画技术美术',
  'Gameplay Systems': '游戏玩法系统',
};

export function categoryZh(category: string): string {
  return CATEGORY_ZH[category] ?? category;
}

export async function loadBlogArticles(): Promise<BlogArticleData[]> {
  const entries = await Promise.all(
    Object.entries(modules).map(async ([path, loader]) => {
      const raw = (await loader()) as string;
      const { data, content } = matter(raw);
      const file = await processor.process(content);
      const html = String(file);

      const slug = path.split('/').pop()!.replace(/\.md$/, '');

      return {
        id: slug,
        slug,
        title: data.title,
        excerpt: data.excerpt,
        date: formatZhDate(data.date),
        category: categoryZh(data.category),   // localized so views need no .replace() hacks
        tags: data.tags ?? [],
        readTime: data.readTime,
        html,
        searchText: content.toLowerCase(),
      } satisfies BlogArticleData;
    }),
  );

  // Newest first by ISO date.
  return entries.sort((a, b) => {
    const am = a.date.match(/(\d+)年(\d+)月(\d+)日/);
    const bm = b.date.match(/(\d+)年(\d+)月(\d+)日/);
    if (!am || !bm) return 0;
    const ad = new Date(+am[1], +am[2] - 1, +am[3]).getTime();
    const bd = new Date(+bm[1], +bm[2] - 1, +bm[3]).getTime();
    return bd - ad;
  });
}
