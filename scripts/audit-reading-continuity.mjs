import assert from 'node:assert/strict';
import fs from 'node:fs';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';

// Structure checks do not prove that a mathematical argument is complete.
// Review the definitions, steps and example in each substantive edit as well.
const root = 'src/content/knowledge';
const parser = unified().use(remarkParse).use(remarkMath);
const navigationPages = new Set(['physics-simulation-overview']);
let articles = 0;
let links = 0;
const paragraphs = new Map();
const plain = node => node.value ?? (node.children ?? []).map(plain).join('');
const visit = (node, fn) => { fn(node); for (const child of node.children ?? []) visit(child, fn); };
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
  const slug = file.slice(0, -3);
  const { data, content } = matter(fs.readFileSync(root + '/' + file, 'utf8'));
  if (data.draft || data.redirectTo) continue;
  articles++;
  let optional = false;
  const targets = new Set();
  const nodes = parser.parse(content).children;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'heading' && node.depth === 2) optional = plain(node) === '延伸查阅';
    if (node.type === 'heading') {
      const following = nodes.slice(i + 1);
      const stop = following.findIndex(n => n.type === 'heading' && n.depth <= node.depth);
      const section = stop < 0 ? following : following.slice(0, stop);
      const substantive = section.some(n => !['heading', 'thematicBreak'].includes(n.type)
        && !(n.type === 'html' && /^(?:\s*<span\b[^>]*><\/span>\s*)+$/.test(n.value)));
      assert.ok(substantive, slug + ': empty section ' + plain(node));
    }
    visit(node, child => {
      if (child.type === 'link' && /^\/knowledge\//.test(child.url)) {
        links++;
        assert.ok(optional || navigationPages.has(slug),
          slug + ': article hand-off inside main text: ' + plain(child));
        if (optional) {
          const target = child.url.split('#')[0].replace(/\/$/, '');
          assert.ok(!targets.has(target), slug + ': duplicate optional article ' + target);
          targets.add(target);
        }
      }
      if (child.type === 'paragraph') {
        const text = plain(child);
        assert.doesNotMatch(text, /阅读前建议|基础理论请先读|不在本文重复推导|形成交叉引用/,
          slug + ': prerequisite detour instruction');
        if (!optional && text.length >= 180 && !/\$\$|<|>/.test(text)) {
          const normalized = text.replace(/\s+/g, '');
          const owner = paragraphs.get(normalized);
          assert.ok(!owner || owner === slug, slug + ': duplicate long paragraph also in ' + owner);
          paragraphs.set(normalized, slug);
        }
      }
    });
  }
}
console.log('Reading continuity passed: ' + articles + ' articles, ' + links
  + ' optional/navigation links; no body hand-offs, duplicate end links or empty sections.');
