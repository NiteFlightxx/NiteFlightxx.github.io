import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Prerendered at build time (output: 'static'). Emits /knowledge-index.json —
// a { slug: lowercasedBodyText } map consumed by KnowledgeView's Fuse search so
// the home page doesn't have to inline article bodies (keeps index.html ~50KB
// instead of 11MB). Loaded lazily only when the user types a search query.
export const GET: APIRoute = async () => {
  const entries = await getCollection('knowledge', (e) => !e.data.draft);
  const index: Record<string, string> = {};
  for (const entry of entries) {
    // entry.body is the raw Markdown body (frontmatter stripped) as a string.
    index[entry.slug] = (entry.body ?? '').toLowerCase();
  }
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
