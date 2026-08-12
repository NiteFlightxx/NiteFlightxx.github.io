import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const entries = await getCollection('knowledge', (entry) => !entry.data.draft);
  const index = Object.fromEntries(
    entries.map((entry) => [entry.slug, entry.body.toLowerCase()]),
  );

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
