import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../consts';

// Prerendered at build time (output: 'static'). Auto-updates as Markdown
// content is added — no dependency, no manual maintenance.
export const GET: APIRoute = async () => {
  const [knowledge, topics, domains] = await Promise.all([
    getCollection('knowledge', (e) => !e.data.draft),
    getCollection('topics'),
    getCollection('knowledgeDomains'),
  ]);

  const today = new Date().toISOString().split('T')[0];

  const urls: { loc: string; lastmod?: string }[] = [
    { loc: `${SITE.url}/`, lastmod: today },
  ];
  for (const e of knowledge) {
    urls.push({ loc: `${SITE.url}/knowledge/${e.slug}/`, lastmod: e.data.date });
  }
  for (const e of topics) {
    urls.push({ loc: `${SITE.url}/projects/${e.slug}/`, lastmod: today });
  }
  urls.push({ loc: `${SITE.url}/knowledge/`, lastmod: today });
  urls.push({ loc: `${SITE.url}/knowledge/domains/`, lastmod: today });
  urls.push({ loc: `${SITE.url}/knowledge/paths/`, lastmod: today });
  urls.push({ loc: `${SITE.url}/knowledge/library/`, lastmod: today });
  for (const e of domains) {
    urls.push({ loc: `${SITE.url}/knowledge/domain/${e.slug}/`, lastmod: today });
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>${
            u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''
          }\n  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
