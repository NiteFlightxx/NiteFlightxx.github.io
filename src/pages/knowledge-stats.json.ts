import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildKnowledgeArtifacts } from '../lib/knowledgeArtifacts';

export const GET: APIRoute = async () => {
  const [knowledge, topics, domains] = await Promise.all([
    getCollection('knowledge'),
    getCollection('topics'),
    getCollection('knowledgeDomains'),
  ]);
  const learningPathCount = domains.reduce((sum, domain) => sum + domain.data.learningPaths.length, 0);
  const { stats } = buildKnowledgeArtifacts(knowledge, topics, learningPathCount);
  return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
