import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const root = process.cwd();
const topicDir = path.join(root, 'src', 'content', 'topics');
const articleDir = path.join(root, 'src', 'content', 'knowledge');

const markdownFiles = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.md'));
const topics = new Map();
const errors = [];

for (const file of markdownFiles(topicDir)) {
  const slug = file.replace(/\.md$/, '');
  const data = matter(fs.readFileSync(path.join(topicDir, file), 'utf8')).data;
  if (topics.has(slug)) errors.push(`duplicate topic id: ${slug}`);
  const stages = Array.isArray(data.stages) ? data.stages : [];
  const stageIds = new Set();
  for (const stage of stages) {
    if (stageIds.has(stage.id)) errors.push(`${slug}: duplicate stage ${stage.id}`);
    stageIds.add(stage.id);
  }
  topics.set(slug, data);
}

const articleRefs = new Map();
for (const file of markdownFiles(articleDir)) {
  if (file === '_template.md') continue;
  const slug = file.replace(/\.md$/, '');
  const data = matter(fs.readFileSync(path.join(articleDir, file), 'utf8')).data;
  const refs = Array.isArray(data.topics) ? data.topics : [];
  const seenIds = new Set();
  for (const ref of refs) {
    if (!ref || typeof ref.id !== 'string') {
      errors.push(`${slug}: topic reference is missing id`);
      continue;
    }
    const topic = topics.get(ref.id);
    if (!topic) errors.push(`${slug}: unknown topic ${ref.id}`);
    else if (!Array.isArray(topic.stages) || !topic.stages.some((stage) => stage.id === ref.stage)) {
      errors.push(`${slug}: unknown stage ${ref.id}/${ref.stage}`);
    }
    if (seenIds.has(ref.id)) errors.push(`${slug}: duplicate topic reference ${ref.id}`);
    seenIds.add(ref.id);
    if (!Number.isInteger(ref.order) || ref.order < 0) errors.push(`${slug}: invalid order for ${ref.id}`);
    if (typeof ref.stage !== 'string' || !ref.stage) errors.push(`${slug}: missing stage for ${ref.id}`);
    if (typeof ref.role !== 'string' || !['theory', 'source', 'algorithm', 'comparison', 'practice', 'experiment'].includes(ref.role)) {
      errors.push(`${slug}: invalid role for ${ref.id}`);
    }
    const refsForTopic = articleRefs.get(ref.id) ?? [];
    refsForTopic.push({ slug, stage: ref.stage, order: ref.order });
    articleRefs.set(ref.id, refsForTopic);
  }
}

for (const [id, refs] of articleRefs) {
    const orders = new Map();
    for (const ref of refs) {
    const key = `${ref.stage}:${ref.order}`;
    const duplicate = orders.get(key);
    if (duplicate) errors.push(`${id}: duplicate order ${ref.stage}/${ref.order} (${duplicate}, ${ref.slug})`);
    orders.set(key, ref.slug);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const linkedArticles = [...articleRefs.values()].reduce((sum, refs) => sum + refs.length, 0);
  console.log(`Topic audit passed: ${topics.size} topic(s), ${linkedArticles} article link(s).`);
}
