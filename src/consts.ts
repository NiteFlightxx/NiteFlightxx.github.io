// Single source of truth for site-wide metadata (SEO / Open Graph / sitemap).
// `url` must match the deployed Pages URL with NO trailing slash.
export const SITE = {
  url: 'https://niteflightxx.github.io',
  title: 'Nite | 实时物理与动画研究笔记',
  shortTitle: 'Nite',
  description:
    '关于实时物理、动画系统与工程数学的个人研究笔记，记录 Unreal Engine 源码分析、算法原理与实验实践。',
  author: 'Nite',
  locale: 'zh_CN',
  // Social preview image (1200×630 recommended). Served from /public.
  ogImage: '/og-image.jpg',
  ogImageAlt: 'Nite — 实时物理与动画研究笔记',
} as const;
