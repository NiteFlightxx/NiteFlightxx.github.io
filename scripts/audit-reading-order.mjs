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
    assert.ok(['sequence', 'reference'].includes(section.mode), 'Every section needs an explicit reading mode');
    for (const [slug, note] of Object.entries(section.notes ?? {})) {
      assert.ok(section.articles.includes(slug) && typeof note === 'string' && note.trim(), 'Reading note must describe an article in its section');
    }
    for (const slug of section.articles) {
      assert.ok(visible.has(slug), `Missing/public document ${slug}`);
      assert.ok(!assigned.has(slug), `Document appears twice in reading order: ${slug}`); assigned.add(slug);
    }
  }
}
assert.equal(assigned.size, visible.size, 'Public documents need an explicit reading position');
// Exercise the actual navigation model, including boundaries and reference sections.
const navigationSource = fs.readFileSync('src/lib/readingOrder.ts', 'utf8')
  .replace("import order from '../data/reading-order.json';", 'const order = ' + JSON.stringify(order) + ';')
  .replace('import.meta.env.BASE_URL', "'/'");
const navigationJs = ts.transpileModule(navigationSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const navigation = await import(`data:text/javascript;base64,${Buffer.from(navigationJs).toString('base64')}`);
const actualGroups = navigation.readingGroups(articles);
for (const group of actualGroups) for (const section of group.sections) {
  section.articles.forEach((article, index) => {
    const context = navigation.readingContext(actualGroups, article.slug);
    assert.equal(context.section.title, section.title);
    assert.equal(context.previous?.slug, section.mode === 'sequence' ? section.articles[index - 1]?.slug : undefined);
    assert.equal(context.next?.slug, section.mode === 'sequence' ? section.articles[index + 1]?.slug : undefined);
    assert.equal(context.position, section.mode === 'sequence' ? index + 1 : undefined);
  });
}
const mainline = order.find(group => group.id === 'simulation-foundations').sections[0].articles;
assert.equal(mainline[0], 'physics-simulation-overview');
mainline.forEach((slug, index) => {
  const article = articles.find(article => article.slug === slug);
  assert.deepEqual(article.prerequisites, index ? [mainline[index - 1]] : [], slug + ': mainline prerequisite mismatch');
  assert.deepEqual(article.nextArticles, mainline.slice(index + 1, index + 2), slug + ': mainline next mismatch');
});
const filtered = navigation.readingGroups(articles.filter(article => article.slug !== mainline[2]));
assert.equal(navigation.readingContext(filtered, mainline[1]).next, undefined);
assert.equal(navigation.readingContext(filtered, 'not-published'), undefined);
for (const groupId of ['rigid-body-physics','deformables','fluids','multiphysics']) {
  assert.ok(order.find(group => group.id === groupId)?.sections[0].articles.length, groupId + ': model branch needs a complete entry document');
}
for (const slug of ['deformable-body-dynamics','fluid-dynamics','multiphysics-coupling']) {
  assert.deepEqual(articles.find(a => a.slug === slug).prerequisites, ['continuum-mechanics']);
}
assert.equal(navigation.readingContext(actualGroups, 'continuum-mechanics').next, undefined, 'Common foundations must let readers choose a model');
assert.equal(navigation.readingContext(actualGroups, '2d-physics-engine').next, undefined, 'Rigid branch must not force readers through other models');
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
