import type { ContentArticle } from "../types";

/**
 * Score how related `candidate` is to `current`. Higher = more related.
 *
 * Scoring rubric (deliberately simple — no embeddings, all build-time):
 *   +6  same curated topic
 *   +3  same topic stage
 *   +2  same subtopic (e.g. both "FlightController")
 *   +1  same category (e.g. both "Physics")
 *   +1  per shared tag
 *   +0  otherwise
 *
 * Candidates with a score of 0 are still usable as fallbacks (sorted by date)
 * so the UI always has `limit` items to show when the corpus is small.
 */
function relatednessScore(current: ContentArticle, candidate: ContentArticle): number {
  let score = 0;
  const currentTopics = current.topics ?? [];
  const candidateTopics = candidate.topics ?? [];
  for (const currentTopic of currentTopics) {
    const candidateTopic = candidateTopics.find((topic) => topic.id === currentTopic.id);
    if (!candidateTopic) continue;
    score += 6;
    if (candidateTopic.stage === currentTopic.stage) score += 3;
    if (candidateTopic.role === currentTopic.role) score += 1;
  }
  if (current.subtopic && candidate.subtopic && current.subtopic === candidate.subtopic) {
    score += 2;
  }
  if (current.categoryKey && candidate.categoryKey && current.categoryKey === candidate.categoryKey) {
    score += 1;
  }
  const sharedTags = current.tags.filter((t) => candidate.tags.includes(t));
  score += sharedTags.length;
  return score;
}

/**
 * Return up to `limit` articles related to `current`, excluding itself.
 *
 * Strategy: score every candidate, sort by score desc then date desc (newer
 * wins ties), and take the top `limit`. If fewer than `limit` have a positive
 * score, the remainder is filled from the highest-scored zero-score candidates
 * (i.e. same-date-order fallbacks) so the section is never empty when the
 * corpus has enough articles.
 */
export function getRelatedArticles(
  current: ContentArticle,
  all: ContentArticle[],
  limit = 3,
): ContentArticle[] {
  const candidates = all.filter((a) => a.slug !== current.slug);
  if (candidates.length === 0) return [];

  const scored = candidates
    .map((c) => ({ article: c, score: relatednessScore(current, c) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: newer date first (dates are localized strings like
      // "2026年7月15日"; compare by parsing back to a timestamp).
      const ta = parseZhDate(a.article.date);
      const tb = parseZhDate(b.article.date);
      return tb - ta;
    });

  return scored.slice(0, limit).map((s) => s.article);
}

/** Parse a localized date string ("2026年7月15日") back to a timestamp. */
function parseZhDate(s: string): number {
  const m = s.match(/(\d+)年(\d+)月(\d+)日/);
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}
