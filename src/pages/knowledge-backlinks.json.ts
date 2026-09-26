import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildKnowledgeArtifacts } from '../lib/knowledgeArtifacts';

export const GET: APIRoute = async () => {
  const knowledge = await getCollection('knowledge');
  const { backlinks, outgoing } = buildKnowledgeArtifacts(knowledge);
  return new Response(JSON.stringify({ backlinks, outgoing }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
