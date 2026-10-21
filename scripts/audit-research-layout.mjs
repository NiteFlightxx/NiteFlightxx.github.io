import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run after `npm run build`. These are static regression checks, not a
// substitute for browser interaction, accessibility or visual verification.
const root = process.cwd();
const dist = path.join(root, 'dist');
const read = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
const manifest = JSON.parse(read('knowledge-manifest.json'));
const publicSlugs = new Set(manifest.map((entry) => entry.slug));
const home = read('index.html');
const knowledge = read('knowledge/index.html');
assert.match(home, /研究概览/);
assert.match(home, /研究专题/);
assert.match(home, /workspace-shell/);
assert.doesNotMatch(home, /<canvas\b|avbd\/avbd\.js|createAvbdModule/);
assert.equal((knowledge.match(/class="browser-article"/g) ?? []).length, manifest.length, 'Public articles must render without client JavaScript');
assert.match(knowledge, /aria-label="搜索知识库"|搜索知识库/);

const researchSource = fs.readFileSync(path.join(root, 'src/lib/research.ts'), 'utf8');
let curatedCount = 0;
for (const list of researchSource.matchAll(/slugs: \[([^\]]+)\]/g)) {
  for (const item of list[1].matchAll(/'([^']+)'/g)) {
    assert.ok(publicSlugs.has(item[1]), `Curated article must be public: ${item[1]}`);
    curatedCount++;
  }
}
assert.ok(curatedCount > 0);

let checkedLinks = 0;
for (const match of home.matchAll(/href="([^"\s]+)"/g)) {
  if (!match[1].startsWith('/')) continue;
  const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://example.test');
  let target = path.join(dist, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
  assert.ok(fs.existsSync(target), `Home link target must exist: ${url.pathname}`);
  if (url.pathname !== '/' && url.hash) {
    const id = decodeURIComponent(url.hash.slice(1));
    assert.ok(fs.readFileSync(target, 'utf8').includes(`id="${id}"`), `Home anchor must exist: ${url.pathname}${url.hash}`);
  }
  checkedLinks++;
}

for (const entry of manifest) {
  const html = read(`knowledge/${entry.slug}/index.html`);
  assert.match(html, /id="main-content"/);
  assert.match(html, /data-pagefind-body/);
  assert.doesNotMatch(html, /class="katex-error"/);
  assert.match(html, /class="article-header /);
}
const appFiles = fs.readdirSync(path.join(dist, '_astro')).filter((name) => /^App\..*\.js$/.test(name));
assert.ok(appFiles.length > 0);
for (const file of appFiles) assert.doesNotMatch(read(`_astro/${file}`), /createAvbdModule|avbd\/avbd\.js/);
console.log(`Research layout audit passed: ${manifest.length} server-rendered articles, ${curatedCount} curated references, ${checkedLinks} home links; no AVBD viewport runtime.`);
