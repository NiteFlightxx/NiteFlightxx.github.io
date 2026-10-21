import assert from 'node:assert/strict';
import fs from 'node:fs';
import matter from 'gray-matter';
import ts from 'typescript';

const courses = JSON.parse(fs.readFileSync('src/data/curriculum.json', 'utf8'));
const articles = new Map(fs.readdirSync('src/content/knowledge').filter(f => f.endsWith('.md') && !f.startsWith('_')).map(file => [file.slice(0, -3), matter(fs.readFileSync(`src/content/knowledge/${file}`, 'utf8')).data]));
const lessons = new Map();
const courseIds = new Set();
const slugs = new Set();
const domains = new Set();
const requiredText = (object, names) => names.forEach(name => assert.ok(typeof object[name] === 'string' && object[name].trim(), `Missing text ${name} in ${object.id}`));
const uniqueList = (list, label) => {
  assert.ok(Array.isArray(list), `${label} must be an array`);
  assert.equal(new Set(list).size, list.length, `${label}: duplicates`);
  list.forEach(item => assert.ok(typeof item === 'string' && item.trim(), `${label}: invalid string`));
};
const publicArticle = slug => { const a = articles.get(slug); assert.ok(a && a.draft !== true, `Missing/public article: ${slug}`); return a; };
for (const course of courses) {
  requiredText(course, ['id', 'domain', 'number', 'title', 'summary', 'boundaries']);
  assert.match(course.id, /^[a-z][a-z0-9-]+$/);
  assert.ok(!courseIds.has(course.id), `Duplicate course ${course.id}`); courseIds.add(course.id);
  assert.ok(!domains.has(course.domain), `Ambiguous domain ${course.domain}`); domains.add(course.domain);
  assert.ok(fs.existsSync(`src/content/knowledgeDomains/${course.domain}.md`), `Unknown domain ${course.domain}`);
  uniqueList(course.entry, `${course.id} entry`); uniqueList(course.outcomes, `${course.id} outcomes`);
  assert.ok(course.entry.length && course.outcomes.length && course.modules.length);
  const modules = new Set();
  let order = 0;
  for (const module of course.modules) {
    requiredText(module, ['id', 'title', 'description']);
    assert.match(module.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(!modules.has(module.id), `Duplicate module ${course.id}/${module.id}`); modules.add(module.id);
    uniqueList(module.materials, `${module.id} materials`); module.materials.forEach(publicArticle);
    assert.ok(module.lessons.length);
    for (const lesson of module.lessons) {
      requiredText(lesson, ['id', 'title', 'goal', 'exercise']);
      assert.match(lesson.id, /^[a-z][a-z0-9-]+$/);
      assert.ok(!lessons.has(lesson.id), `Duplicate lesson ${lesson.id}`);
      assert.ok(!modules.has(lesson.id), `Lesson/module anchor collision ${lesson.id}`);
      uniqueList(lesson.requires, `${lesson.id} requires`);
      assert.ok(['planned', 'published'].includes(lesson.status));
      if (lesson.status === 'published') {
        assert.ok(lesson.articleSlug, `Published without article ${lesson.id}`);
        assert.ok(!slugs.has(lesson.articleSlug), `Ambiguous course context ${lesson.articleSlug}`); slugs.add(lesson.articleSlug);
        const article = publicArticle(lesson.articleSlug);
        assert.equal(article.contentRole, 'lesson', `${lesson.id}: not a teaching article`);
        // Historical syllabus labels are not the live document title source.
        assert.ok(article.title.trim(), `${lesson.id}: missing document title`);
      } else assert.equal(lesson.articleSlug, undefined, `Planned lesson must not expose a fake article: ${lesson.id}`);
      lessons.set(lesson.id, { ...lesson, courseId: course.id, order: order++ });
    }
  }
  for (const module of course.modules) for (const lesson of module.lessons) assert.ok(!modules.has(lesson.id), `Anchor collision ${lesson.id}`);
}
for (const lesson of lessons.values()) for (const id of lesson.requires) {
  const prerequisite = lessons.get(id);
  assert.ok(prerequisite, `Unknown prerequisite ${lesson.id} -> ${id}`);
  if (prerequisite.courseId === lesson.courseId) assert.ok(prerequisite.order < lesson.order, `Prerequisite appears later: ${lesson.id} -> ${id}`);
  if (lesson.status === 'published') assert.equal(prerequisite.status, 'published', `Published lesson needs unpublished prerequisite: ${lesson.id}`);
}
for (const lesson of lessons.values()) if (lesson.status === 'published') {
  const expected = lesson.requires.map(id => lessons.get(id).articleSlug).sort();
  assert.deepEqual([...(articles.get(lesson.articleSlug).prerequisites ?? [])].sort(), expected, `Markdown/curriculum prerequisite drift: ${lesson.id}`);
}
const visited = new Set();
const active = new Set();
function visit(id) {
  assert.ok(!active.has(id), `Prerequisite cycle at ${id}`);
  if (visited.has(id)) return;
  active.add(id); lessons.get(id).requires.forEach(visit); active.delete(id); visited.add(id);
}
for (const id of lessons.keys()) visit(id);
for (const [slug, article] of articles) if (!article.draft && article.contentRole === 'lesson') assert.ok(slugs.has(slug), `Orphan lesson article ${slug}`);

// Run the exact numeric models used by the React labs, without browser APIs.
const modelSource = fs.readFileSync('src/lib/courseModels.ts', 'utf8');
const js = ts.transpileModule(modelSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const models = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
for (const offset of [-80, 0, 70, 100]) {
  const model = models.pointsModel(offset);
  assert.deepEqual(model.displacement, [30, 40, 0]); assert.equal(model.length, 50);
}
for (const h of [.25, .1, .02]) {
  const model = models.motionModel(2, h, Math.round(1 / h));
  assert.ok(Math.abs(model.time - 1) < 1e-12); assert.ok(Math.abs(model.position - 2) < 1e-12);
}
for (const x of [50, 100, 130, 200]) {
  assert.deepEqual(models.poseModel(x).foot, [x + 20, 0, 0]);
  assert.deepEqual(models.poseModel(x).footLocal, [20, 0, -90]);
}
console.log(`Curriculum audit passed: ${courses.length} courses, ${lessons.size} lessons, ${slugs.size} published; prerequisite DAG and all 3 lab models verified.`);
