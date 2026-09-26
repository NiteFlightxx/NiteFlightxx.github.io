import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import katex from 'katex';

const root = process.cwd();
const knowledgeDir = path.join(root, 'src', 'content', 'knowledge');
const domainDir = path.join(root, 'src', 'content', 'knowledgeDomains');
const files = fs.readdirSync(knowledgeDir).filter((name) => name.endsWith('.md') && !name.startsWith('_'));
const errors = [];
const warnings = [];
const records = new Map();

const report = (collection, file, message) => collection.push(`${file}: ${message}`);
const stripCode = (markdown) => markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
const slugifyHeading = (value) => value.trim().toLocaleLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-');

for (const filename of files) {
  const slug = path.basename(filename, '.md').toLocaleLowerCase();
  const source = fs.readFileSync(path.join(knowledgeDir, filename), 'utf8');
  const parsed = matter(source);
  if (records.has(slug)) report(errors, filename, `slug 与 ${records.get(slug).filename} 重复`);
  records.set(slug, { filename, data: parsed.data, body: parsed.content });
  for (const field of ['title', 'excerpt', 'date', 'category', 'subtopic', 'tags', 'readTime']) {
    if (parsed.data[field] === undefined || parsed.data[field] === '') report(errors, filename, `缺少 frontmatter 字段 ${field}`);
  }
  if (parsed.data.draft === true) continue;

  const body = stripCode(parsed.content);
  const headings = [...body.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({ depth: match[1].length, text: match[2].trim() }));
  let previousDepth = 1;
  const headingIds = new Map();
  for (const heading of headings) {
    if (heading.depth === 1) report(errors, filename, `正文不应再包含 h1：${heading.text}`);
    if (heading.depth > previousDepth + 1) report(errors, filename, `标题层级从 h${previousDepth} 跳到 h${heading.depth}：${heading.text}`);
    previousDepth = heading.depth;
    const id = slugifyHeading(heading.text);
    // rehype-slug follows GitHub-style suffixing for repeated labels. Mirror
    // that behavior here so repeated subsection names do not become duplicate
    // DOM ids while still exercising every generated anchor.
    const occurrence = headingIds.get(id) ?? 0;
    headingIds.set(id, occurrence + 1);
  }

  const internalLinks = [...body.matchAll(/\]\((?:https?:\/\/niteflightxx\.github\.io)?\/?knowledge\/([^/#?\s)]+)\/?(?:#[^)\s]+)?\)/gi)];
  records.get(slug).links = internalLinks.map((match) => decodeURIComponent(match[1]).toLocaleLowerCase());

  for (const sourceEntry of parsed.data.sources ?? []) {
    try {
      const url = new URL(sourceEntry.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch { report(errors, filename, `来源 URL 无效：${sourceEntry.url ?? '(empty)'}`); }
  }

  const formulas = [];
  for (const match of body.matchAll(/\$\$([\s\S]*?)\$\$/g)) formulas.push({ source: match[1], displayMode: true });
  for (const match of body.replace(/\$\$[\s\S]*?\$\$/g, '').matchAll(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g)) formulas.push({ source: match[1], displayMode: false });
  for (const formula of formulas) {
    try { katex.renderToString(formula.source.trim(), { throwOnError: true, strict: false, displayMode: formula.displayMode }); }
    catch (error) { report(errors, filename, `LaTeX 无法解析：${String(error.message).slice(0, 160)}`); }
  }
}

const publicSlugs = new Set([...records].filter(([, record]) => record.data.draft !== true).map(([slug]) => slug));
for (const [, record] of records) {
  if (record.data.draft === true) continue;
  const relationships = [...(record.links ?? []), ...(record.data.related ?? []), ...(record.data.prerequisites ?? []), ...(record.data.nextArticles ?? [])];
  for (const target of new Set(relationships)) {
    if (!publicSlugs.has(String(target).toLocaleLowerCase())) report(errors, record.filename, `知识关系指向不存在或未公开页面：${target}`);
  }
}

if (fs.existsSync(domainDir)) {
  for (const filename of fs.readdirSync(domainDir).filter((name) => name.endsWith('.md'))) {
    const parsed = matter(fs.readFileSync(path.join(domainDir, filename), 'utf8'));
    for (const learningPath of parsed.data.learningPaths ?? []) {
      const seen = new Set();
      for (const article of learningPath.articles ?? []) {
        if (!publicSlugs.has(String(article).toLocaleLowerCase())) report(errors, filename, `学习路径 ${learningPath.id} 引用了不存在页面：${article}`);
        if (seen.has(article)) report(errors, filename, `学习路径 ${learningPath.id} 重复引用 ${article}`);
        seen.add(article);
      }
    }
  }
}

for (const [, record] of records) {
  if (record.data.draft === true) continue;
  if ((record.links ?? []).length === 0 && (record.data.related ?? []).length === 0 && (record.data.prerequisites ?? []).length === 0 && (record.data.nextArticles ?? []).length === 0) report(warnings, record.filename, '没有站内知识关系，图谱中可能成为孤立节点');
}

if (warnings.length) console.warn(`静态知识审计提示（${warnings.length}）：\n- ${warnings.join('\n- ')}`);
if (errors.length) {
  console.error(`静态知识审计失败（${errors.length}）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`静态知识审计通过：${publicSlugs.size} 篇公开文章，0 个阻断错误。`);
