import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildKnowledgeArtifacts } from '../lib/knowledgeArtifacts';

export const GET: APIRoute = async () => {
  const [knowledge, topics] = await Promise.all([getCollection('knowledge'), getCollection('topics')]);
  const { graph } = buildKnowledgeArtifacts(knowledge, topics);
  return new Response(JSON.stringify(graph), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
