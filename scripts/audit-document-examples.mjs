import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the exact published examples: never maintain a parallel integrator.
async function example(slug, marker) {
  const body = fs.readFileSync(`src/content/knowledge/${slug}.md`, 'utf8').replace(/\r\n/g, '\n');
  const code = [...body.matchAll(/~~~js\n([\s\S]*?)\n~~~/g)]
    .map(match => match[1]).find(code => code.startsWith(`// ${marker}\n`));
  assert.ok(code, `${slug}: missing executable example ${marker}`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { step, advance, harmonicEnergy } = await example('numerical-integration-methods', 'knowledge-numerics-example');
const near = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
for (const [method, x] of [['euler', -.45], ['symplectic', -.55], ['verlet', -.5], ['midpoint', -.5], ['rk4', -.5]]) {
  const state = advance(method, { x: 0, v: 0 }, 1, 10, () => -1);
  near(state.x, x); near(state.v, -1);
}
const oscillator = x => -x;
for (const [method, order] of [['euler', 1], ['symplectic', 1], ['verlet', 2], ['midpoint', 2], ['rk4', 4]]) {
  const error = count => {
    const s = advance(method, { x: 1, v: 0 }, 1, count, oscillator);
    return Math.hypot(s.x - Math.cos(1), s.v + Math.sin(1));
  };
  const observed = Math.log2(error(20) / error(40));
  assert.ok(Math.abs(observed - order) < .15, `${method}: observed order ${observed}`);
}
const first = step('symplectic', { x: 1, v: 0 }, 0, .1, oscillator);
near(first.x, .99); near(first.v, -.1); near(harmonicEnergy(first), .49505);
const bounded = advance('symplectic', { x: 1, v: 0 }, 100, 1000, oscillator);
assert.ok(harmonicEnergy(bounded) < .6);
const unstable = advance('symplectic', { x: 1, v: 0 }, 30, 10, oscillator);
assert.ok(harmonicEnergy(unstable) > 1e6);
let state = { x: 1, v: 0 };
const modified = s => harmonicEnergy(s) - .05 * s.x * s.v;
for (let n = 0; n < 1000; n++) {
  state = step('symplectic', state, .1*n, .1, oscillator);
  near(modified(state), .5);
}
// Check the published decay and variable-target caveat separately.
const decay = (x, target, lambda, h) => target + (x - target) * Math.exp(-lambda*h);
near(decay(decay(10, 3, 2, .1), 3, 2, .2), decay(10, 3, 2, .3));
assert.ok(Math.abs(decay(decay(10, 3, 2, .1), 7, 2, .2) - decay(10, 7, 2, .3)) > .1);
near(1 + .3 * -10, -2); near(1 / (1 - .3 * -10), .25);
assert.throws(() => step('rk4', { x: 0, v: 0 }, 0, 0, oscillator));
assert.throws(() => advance('rk4', { x: 0, v: 0 }, 1, 0, oscillator));

const { axisEscape } = await example('collision-detection-gjk-epa-sat', 'knowledge-sat-example');
assert.deepEqual(axisEscape(0, 10, 4, 6), { separated: false, depth: 6, sign: 1 });
assert.deepEqual(axisEscape(0, 2, 1, 3), { separated: false, depth: 1, sign: 1 });
assert.deepEqual(axisEscape(1, 3, 0, 2), { separated: false, depth: 1, sign: -1 });
assert.deepEqual(axisEscape(0, 1, 2, 3), { separated: true });
assert.deepEqual(axisEscape(0, 1, 1, 2), { separated: false, depth: 0, sign: 1 });
assert.throws(() => axisEscape(2, 1, 0, 3));
console.log('Document examples passed: 5 integrators, observed convergence orders, energy counterexample, fixed-target decay, SAT containment and degeneracies. Not an engine runtime test.');
