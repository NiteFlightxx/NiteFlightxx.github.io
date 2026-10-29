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
const knowledge = read('knowledge/library/index.html');
const documentHome = read('knowledge/index.html');
const order = JSON.parse(fs.readFileSync(path.join(root, 'src/data/reading-order.json'), 'utf8'));
const forbidden = /学完能做什么|练习与验收|手动完成|我已完成本课|查看课程|课程目录|课节完成与导航|规划中/;
assert.match(documentHome, /class="article-body /);
assert.match(documentHome, /动力学总览：刚体、软体与流体的共同脉络/);
assert.match(documentHome, /class="physics-atlas"/);
assert.match(documentHome, /知识库文档目录/);
assert.ok(documentHome.includes('href="https://niteflightxx.github.io/knowledge/physics-simulation-overview/"'), 'Overview alias must use its canonical URL');
assert.doesNotMatch(documentHome, forbidden);
assert.doesNotMatch(documentHome, /data-pagefind-body/);
const firstDocument = read('knowledge/' + order[0].sections[0].articles[0] + '/index.html');
const navigation = firstDocument.match(/<nav class="document-navigation"[\s\S]*?<\/nav>/)?.[0];
assert.ok(navigation, 'Ordered document navigation must be server rendered');
let previousPosition = -1;
for (const group of order) {
  for (const section of group.sections) for (const slug of section.articles) {
    assert.ok(publicSlugs.has(slug), 'Only public documents may enter navigation');
    const position = navigation.indexOf('href="/knowledge/' + slug + '/"');
    assert.ok(position > previousPosition, 'Reading order mismatch: ' + slug);
    previousPosition = position;
  }
}
for (const group of order.filter(group => ['engineering-math', 'rigid-body-physics', 'character-animation'].includes(group.id))) {
  const slug = group.sections[0].articles[0];
  const canonical = read('knowledge/' + slug + '/index.html');
  assert.match(canonical, /data-pagefind-body/);
  assert.match(canonical, /class="katex/);
  assert.doesNotMatch(canonical, forbidden);
  const aliases = ['knowledge/courses/' + group.id + '/'];
  if (group.domain) aliases.push('knowledge/domain/' + group.domain + '/');
  for (const alias of aliases) {
    const html = read(alias + 'index.html');
    assert.match(html, /class="article-body /);
    assert.match(html, /知识库文档目录/);
    assert.doesNotMatch(html, /data-pagefind-body/);
    assert.doesNotMatch(html, forbidden);
    assert.ok(html.includes('href="https://niteflightxx.github.io/knowledge/' + slug + '/"'), 'Alias must use the canonical article URL');
  }
}
const physicsDomain = read('knowledge/domain/physics/index.html');
assert.ok(physicsDomain.includes('href="https://niteflightxx.github.io/knowledge/physics-simulation-overview/"'));
for (const slug of ['continuum-mechanics','deformable-body-dynamics','fluid-dynamics','multiphysics-coupling']) {
  const html = read('knowledge/' + slug + '/index.html');
  assert.match(html, /<svg\b[^>]*role="img"/, slug + ': physical explanation needs a rendered diagram');
  assert.match(html, /<figcaption>/, slug + ': diagram needs a caption');
}
for (const group of order) for (const section of group.sections) {
  section.articles.forEach((slug, index) => {
    const html = read('knowledge/' + slug + '/index.html');
    const adjacent = html.match(/<nav class="document-adjacent"[\s\S]*?<\/nav>/)?.[0];
    if (section.mode === 'reference') assert.equal(adjacent, undefined, slug + ': references must not force an unrelated next document');
    else {
      for (const neighbor of [section.articles[index - 1], section.articles[index + 1]].filter(Boolean)) {
        assert.ok(adjacent?.includes('href="/knowledge/' + neighbor + '/"'), slug + ': missing sequential neighbor ' + neighbor);
      }
    }
  });
}
assert.match(home, /精选研究/);
assert.match(home, /探索网站/);
assert.match(home, /studio-shell/);
assert.doesNotMatch(home, /<canvas\b|avbd\/avbd\.js|createAvbdModule/);
assert.equal((knowledge.match(/class="browser-article"/g) ?? []).length, manifest.length, 'Public articles must render without client JavaScript');
assert.match(knowledge, /aria-label="搜索知识库"|搜索知识库/);
for (const legacy of ['course-math-points-vectors', 'course-animation-pose-spaces', 'course-physics-state-timestep']) {
  const html = read(`knowledge/${legacy}/index.html`);
  assert.match(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /data-pagefind-body/);
}

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
