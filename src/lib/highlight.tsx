import React from "react";

/**
 * Highlight occurrences of `query` within `text` by wrapping them in <mark>.
 *
 * Used by KnowledgeView to mark matched search terms in titles and excerpts.
 * Matching is case-insensitive and substring-based (not tokenized) so it works
 * for both English ("IK") and Chinese ("飞控") queries. When `query` is empty
 * or whitespace, the original text is returned untouched.
 *
 * The <mark> elements carry the `search-highlight` class so index.css can style
 * them (lime background + dark text) without affecting KaTeX or other <mark>
 * usages elsewhere.
 */
export function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;

  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQ, cursor);
    if (idx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={key++} className="search-highlight">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    cursor = idx + q.length;
  }

  return <>{parts}</>;
}
