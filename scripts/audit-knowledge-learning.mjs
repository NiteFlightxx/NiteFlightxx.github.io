import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const root = process.cwd();
const articleDir = path.join(root, 'src', 'content', 'knowledge');
const files = fs.readdirSync(articleDir).filter((name) => name.endsWith('.md') && name !== '_template.md');
const levels = { foundation: 0, intermediate: 1, advanced: 2 };
const kinds = new Set(['theory', 'source', 'algorithm', 'comparison', 'practice', 'experiment']);
const articles = new Map();
const errors = [];

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const source = fs.readFileSync(path.join(articleDir, file), 'utf8');
  const data = matter(source).data;
  if (articles.has(slug)) errors.push(`duplicate article id: ${slug}`);
  articles.set(slug, { data, source });

  if (!kinds.has(data.kind)) errors.push(`${slug}: invalid kind`);
  if (!Object.hasOwn(levels, data.level)) errors.push(`${slug}: invalid level`);
  if (!source.includes('## 学习位置')) errors.push(`${slug}: missing learning position block`);
  for (const relation of ['prerequisites', 'nextArticles']) {
    if (!Array.isArray(data[relation])) errors.push(`${slug}: ${relation} must be an array`);
    for (const target of Array.isArray(data[relation]) ? data[relation] : []) {
      if (!files.some((name) => name.replace(/\.md$/, '') === target)) {
        errors.push(`${slug}: unknown ${relation} article ${target}`);
      }
      if (target === slug) errors.push(`${slug}: self reference in ${relation}`);
    }
  }
}

for (const [slug, { data }] of articles) {
  const current = levels[data.level];
  for (const target of Array.isArray(data.prerequisites) ? data.prerequisites : []) {
    const targetData = articles.get(target)?.data;
    if (targetData && levels[targetData.level] > current) {
      errors.push(`${slug}: prerequisite ${target} is harder than the article`);
    }
  }
  // nextArticles may be a lateral deepening branch (for example, a source
  // overview can point back to an intermediate algorithm article), so its
  // level is intentionally not constrained. The ordered topic/domain routes
  // define the canonical simple-to-hard sequence.
}

const state = new Map();
const visit = (slug, stack = []) => {
  if (state.get(slug) === 'visiting') {
    errors.push(`prerequisite cycle: ${[...stack, slug].join(' -> ')}`);
    return;
  }
  if (state.get(slug) === 'visited') return;
  state.set(slug, 'visiting');
  for (const target of articles.get(slug)?.data.prerequisites ?? []) {
    if (articles.has(target)) visit(target, [...stack, slug]);
  }
  state.set(slug, 'visited');
};
for (const slug of articles.keys()) visit(slug);

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const counts = Object.keys(levels).map((level) => `${level}=${[...articles.values()].filter(({ data }) => data.level === level).length}`);
  console.log(`Knowledge learning audit passed: ${articles.size} articles (${counts.join(', ')}).`);
}
