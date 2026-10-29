import fs from 'node:fs';
import assert from 'node:assert/strict';
import matter from 'gray-matter';

const directory = 'src/content/knowledge';
const aliases = JSON.parse(fs.readFileSync('src/data/knowledge-legacy-anchors.json', 'utf8'));
let articles = 0;
for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.md') && !file.startsWith('_'))) {
  const slug = file.slice(0, -3);
  const { data, content } = matter(fs.readFileSync(`${directory}/${file}`, 'utf8'));
  if (data.draft || data.redirectTo) continue;
  articles++;
  assert.ok(data.pageType, `${slug}: pageType must be explicit`);
  assert.ok(Array.isArray(data.sources), `${slug}: sources must be explicit, even when citations are in the body`);
  if (data.kind === 'source') assert.equal(data.pageType, 'source-analysis', `${slug}: source kind/pageType mismatch`);
  if (data.pageType === 'source-analysis') assert.equal(data.kind, 'source', `${slug}: source-analysis kind mismatch`);
  let fence = null, previousDepth = 1;
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) {
        assert.ok(match[2].trim(), `${slug}: unlabelled code fence`);
        fence = match[1];
      } else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (!heading) continue;
    const depth = heading[1].length, title = heading[2];
    assert.ok(depth >= 2 && depth <= previousDepth + 1, `${slug}: invalid heading depth: ${line}`);
    previousDepth = depth;
    assert.doesNotMatch(title, /^(?:[一二三四五六七八九十百]+[、．.]|\d+\.\d+(?:\.\d+)*[.、．]?\s|\d+[.、．]\s)/, `${slug}: manual heading number`);
    assert.doesNotMatch(title, /积木|学习位置|本文模块|万能算法|黄金法则/, `${slug}: obsolete heading boilerplate`);
  }
  assert.equal(fence, null, `${slug}: unclosed code fence`);
  for (const [oldId, target] of Object.entries(aliases[slug] ?? {})) {
    assert.ok(oldId && target && oldId !== target, `${slug}: invalid anchor migration`);
  }
}
console.log(`Document style passed: ${articles} canonical articles, explicit metadata, semantic headings and labelled fences.`);
