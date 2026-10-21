import assert from 'node:assert/strict';
import fs from 'node:fs';
import matter from 'gray-matter';

const publicArticles = fs.readdirSync('src/content/knowledge')
  .filter(file => file.endsWith('.md') && !file.startsWith('_'))
  .map(file => ({ slug: file.slice(0, -3), data: matter(fs.readFileSync(`src/content/knowledge/${file}`, 'utf8')).data }))
  .filter(({ data }) => !data.draft);
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#([0-9]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
const pages = new Map();
for (const { slug } of publicArticles) {
  const html = fs.readFileSync(`dist/knowledge/${slug}/index.html`, 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map(match => decode(match[1]));
  assert.equal(new Set(ids).size, ids.length, `${slug}: duplicate rendered id`);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${slug}: expected one article title`);
  assert.ok(/<h2\b/.test(html), `${slug}: headings were rendered as prose`);
  assert.ok(!/class="[^"]*\bkatex-error\b/.test(html), `${slug}: invalid rendered formula`);
  pages.set(slug, { html, ids: new Set(ids) });
}
let checked = 0;
for (const [slug, { html, ids }] of pages) {
  for (const match of html.matchAll(/\bhref="([^"]+)"/g)) {
    const href = decode(match[1]);
    if (!href.includes('#')) continue;
    let targetIds, fragment;
    if (href.startsWith('#')) { targetIds = ids; fragment = href.slice(1); }
    else {
      // Only local article links. GitHub source-line fragments are external.
      const link = href.match(/^\/(?:[^/#]+\/)*knowledge\/([^/#?]+)\/?#(.+)$/);
      if (!link || !pages.has(link[1])) continue;
      targetIds = pages.get(link[1]).ids; fragment = link[2];
    }
    if (!fragment) continue;
    assert.ok(targetIds.has(decodeURIComponent(fragment)), `${slug}: broken article anchor ${href}`);
    checked++;
  }
}
console.log(`Article HTML passed: ${pages.size} canonical documents, ${checked} local fragment links, no duplicate ids or KaTeX errors.`);
