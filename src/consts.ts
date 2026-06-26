// Single source of truth for site-wide metadata (SEO / Open Graph / sitemap).
// `url` must match the deployed Pages URL with NO trailing slash.
export const SITE = {
  url: 'https://niteflightxx.github.io',
  title: 'Nite | 个人研发实验室',
  shortTitle: 'Nite',
  description:
    'Unreal Engine 工程师的个人作品与知识库站点。工程能力 · 研究能力 · 系统设计能力。涵盖引擎、物理、动画、渲染的深度技术分析与原型实验。',
  author: 'Nite',
  locale: 'zh_CN',
  // Social preview image (1200×630 recommended). Served from /public.
  ogImage: '/og-image.jpg',
  ogImageAlt: 'Nite — 个人研发实验室',
} as const;
