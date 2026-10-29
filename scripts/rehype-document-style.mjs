import fs from 'node:fs';

/** Number headings without changing their text or canonical fragment ids. */
export default function rehypeDocumentStyle() {
  const aliases = JSON.parse(fs.readFileSync(new URL('../src/data/knowledge-legacy-anchors.json', import.meta.url), 'utf8'));
  return (tree, file) => {
    const source = String(file.path ?? file.history?.[0] ?? '').replaceAll('\\', '/');
    const slug = source.match(/\/src\/content\/knowledge\/([^/]+)\.md$/)?.[1];
    if (!slug || slug.startsWith('_')) return;
    const legacy = aliases[slug] ?? {};
    const ids = new Set();
    const counts = Array(7).fill(0);
    const walk = (node, callback) => {
      callback(node);
      for (const child of node.children ?? []) walk(child, callback);
    };
    walk(tree, node => { if (node.properties?.id) ids.add(String(node.properties.id)); });
    const targets = new Map();
    for (const [oldId, target] of Object.entries(legacy)) {
      if (ids.has(oldId)) continue;
      if (!targets.has(target)) targets.set(target, []);
      targets.get(target).push(oldId);
    }
    function transform(parent) {
      if (!parent.children) return;
      parent.children = parent.children.flatMap(node => {
        const depth = node.type === 'element' && /^h[2-6]$/.test(node.tagName) ? Number(node.tagName[1]) : 0;
        if (!depth) { transform(node); return [node]; }
        counts[depth]++;
        counts.fill(0, depth + 1);
        node.properties ??= {};
        node.properties.dataSectionNumber = counts.slice(2, depth + 1).join('.');
        const anchors = (targets.get(String(node.properties.id)) ?? []).map(id => ({
          type: 'element', tagName: 'span', properties: { id, className: ['document-anchor-alias'], ariaHidden: 'true' }, children: [],
        }));
        return [...anchors, node];
      });
    }
    transform(tree);
  };
}
