import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const root = process.cwd();
const domainDir = path.join(root, 'src', 'content', 'knowledgeDomains');
const articleDir = path.join(root, 'src', 'content', 'knowledge');
const files = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.md'));
const articleSlugs = new Set(files(articleDir).filter((name) => name !== '_template.md').map((name) => name.replace(/\.md$/, '')));
const errors = [];
const ids = new Set();

for (const file of files(articleDir)) {
  if (file === '_template.md') continue;
  const slug = file.replace(/\.md$/, '');
  const data = matter(fs.readFileSync(path.join(articleDir, file), 'utf8')).data;
  for (const relation of ['prerequisites', 'nextArticles']) {
    for (const target of Array.isArray(data[relation]) ? data[relation] : []) {
      if (!articleSlugs.has(target)) errors.push(`${slug}: unknown ${relation} article ${target}`);
    }
  }
}

for (const file of files(domainDir)) {
  const slug = file.replace(/\.md$/, '');
  const data = matter(fs.readFileSync(path.join(domainDir, file), 'utf8')).data;
  if (ids.has(slug)) errors.push(`duplicate domain id: ${slug}`);
  ids.add(slug);
  const referenced = [...(Array.isArray(data.featured) ? data.featured : [])];
  for (const pathEntry of Array.isArray(data.learningPaths) ? data.learningPaths : []) {
    referenced.push(...(Array.isArray(pathEntry.articles) ? pathEntry.articles : []));
  }
  for (const article of referenced) {
    if (!articleSlugs.has(article)) errors.push(`${slug}: unknown article ${article}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Knowledge navigation audit passed: ${ids.size} domain(s), ${articleSlugs.size} article(s) available.`);
}
