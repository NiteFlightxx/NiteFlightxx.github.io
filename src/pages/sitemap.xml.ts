import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../consts';

// Prerendered at build time (output: 'static'). Auto-updates as Markdown
// content is added — no dependency, no manual maintenance.
export const GET: APIRoute = async () => {
  const [knowledge, lab] = await Promise.all([
    getCollection('knowledge', (e) => !e.data.draft),
    getCollection('lab', (e) => !e.data.draft),
  ]);

  const today = new Date().toISOString().split('T')[0];

  const urls: { loc: string; lastmod?: string }[] = [
    { loc: `${SITE.url}/`, lastmod: today },
  ];
  for (const e of knowledge) {
    urls.push({ loc: `${SITE.url}/knowledge/${e.slug}/`, lastmod: e.data.date });
  }
  for (const e of lab) {
    urls.push({ loc: `${SITE.url}/lab/${e.slug}/`, lastmod: e.data.date });
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
