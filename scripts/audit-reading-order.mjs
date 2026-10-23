import assert from 'node:assert/strict';
import fs from 'node:fs';
import matter from 'gray-matter';
import ts from 'typescript';

const order = JSON.parse(fs.readFileSync('src/data/reading-order.json', 'utf8'));
const articles = fs.readdirSync('src/content/knowledge').filter(f => f.endsWith('.md') && !f.startsWith('_')).map(f => ({ slug: f.slice(0, -3), ...matter(fs.readFileSync(`src/content/knowledge/${f}`, 'utf8')).data })).filter(a => !a.draft && !a.redirectTo);
const visible = new Set(articles.map(a => a.slug));
const groups = new Set();
const assigned = new Set();
for (const group of order) {
  assert.ok(group.id && group.title && group.sections.length);
  assert.ok(!groups.has(group.id), `Duplicate document group ${group.id}`); groups.add(group.id);
  for (const section of group.sections) {
    assert.ok(section.title && section.articles.length);
    for (const slug of section.articles) {
      assert.ok(visible.has(slug), `Missing/public document ${slug}`);
      assert.ok(!assigned.has(slug), `Document appears twice in reading order: ${slug}`); assigned.add(slug);
    }
  }
}
assert.equal(assigned.size, visible.size, 'Public documents need an explicit reading position');
// Verify the same lightweight model functions used by the interactive documents.
const modelSource = fs.readFileSync('src/lib/courseModels.ts', 'utf8');
const js = ts.transpileModule(modelSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
for (const x of [-80, 0, 70, 100]) {
  assert.deepEqual(model.pointsModel(x).displacement, [30, 40, 0]);
  assert.equal(model.pointsModel(x).length, 50);
}
for (const h of [.25, .1, .02]) assert.ok(Math.abs(model.motionModel(2, h, Math.round(1 / h)).position - 2) < 1e-12);
for (const x of [50, 100, 130, 200]) {
  assert.deepEqual(model.poseModel(x).foot, [x + 20, 0, 0]);
  assert.deepEqual(model.poseModel(x).footLocal, [20, 0, -90]);
}
console.log(`Reading-order audit passed: ${order.length} groups, ${assigned.size} public documents, no duplicates; 3 interactive models verified.`);
