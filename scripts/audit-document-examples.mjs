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
const { fall, oscillator: exactOscillator } = await example('particle-dynamics', 'knowledge-particle-example');
const dropped = fall(.5);
near(dropped.x, .775); near(dropped.v, -4.9);
near(dropped.kinetic, 24.01); near(dropped.potential, 15.19);
for (const t of [0, .2, .5]) {
  const falling = fall(t);
  near(falling.kinetic + falling.potential, 39.2);
  const vibrating = exactOscillator(t);
  near(vibrating.energy, 1);
}
// Check arbitrary initial velocity and the physical damping law, not only zero-velocity examples.
near(exactOscillator(0, { x0: .7, v0: 1.2 }).v, 1.2);
near(exactOscillator(0, { x0: .7, v0: 1.2, critical: true }).v, 1.2);
for (const t of [.1, .6, 1.2]) {
  const eps = 1e-6, options = { x0: .7, v0: 1.2, critical: true };
  const before = exactOscillator(t - eps, options), after = exactOscillator(t + eps, options);
  const at = exactOscillator(t, options);
  near((after.x - before.x) / (2*eps), at.v, 1e-8);
  near(2 * (after.v - before.v) / (2*eps), -8*at.x - 8*at.v, 1e-8);
  near((after.energy - before.energy) / (2*eps), -8*at.v*at.v, 1e-8);
}
assert.throws(() => fall(1, { mass: 0 }), /invalid/);
assert.throws(() => exactOscillator(1, { stiffness: 0 }), /invalid/);
const { response, cross } = await example('rigid-body-dynamics', 'knowledge-rigid-example');
const pushed = response();
pushed.inertia.forEach((v,i) => near(v, [1/3,5/6,5/6][i]));
assert.deepEqual(pushed.acceleration, [0,5,0]);
assert.deepEqual(pushed.torque, [0,0,10]);
near(pushed.angularAcceleration[2]/60, .2);
assert.deepEqual(response({ arm: [0,0,0] }).angularAcceleration, [0,0,0]);
const spinning = response({ omega: [1,2,0], force: [0,0,0] });
near(spinning.angularAcceleration[2], -1.2);
const coupling = cross([1,2,0], spinning.angularMomentum);
spinning.angularAcceleration.forEach((a,i) => near(spinning.inertia[i]*a + coupling[i], 0));
assert.deepEqual(response({ sides: [1,1,1], omega: [1,2,3], force: [0,0,0] }).angularAcceleration, [0,0,0]);
assert.throws(() => response({ sides: [1,0,1] }), /invalid/);
const { materialVolume } = await example('continuum-mechanics', 'knowledge-continuum-example');
for (const stretch of [[1,1,1],[2,1,1],[2,.5,1],[1.1,1,1]]) {
  const sample = materialVolume(1000,.01,stretch);
  near(sample.mass,10);
  near(sample.density*sample.J,1000);
}
near(materialVolume(1000,.01,[2,.5,1]).density,1000);
assert.throws(() => materialVolume(1000,.01,[1,0,1]), /invalid/);
const { elasticEnergy } = await example('deformable-body-dynamics', 'knowledge-deformable-example');
const identity = [[1,0,0],[0,1,0],[0,0,1]];
const rotation = [[0,-1,0],[1,0,0],[0,0,1]];
near(elasticEnergy(identity).energy,0); near(elasticEnergy(rotation).energy,0);
const stretch = [[1.1,0,0],[0,1,0],[0,0,1]];
const rotatedStretch = rotation.map(row => stretch[0].map((_,j) => row.reduce((s,v,k) => s+v*stretch[k][j],0)));
near(elasticEnergy(stretch).strain[0][0],.105);
near(elasticEnergy(stretch).density,16.5375);
near(elasticEnergy(stretch).energy,.0165375);
near(elasticEnergy(rotatedStretch).energy,elasticEnergy(stretch).energy);
assert.throws(() => elasticEnergy(identity,{mu:-1}),/invalid/);
const { projectClosedPair, hydrostaticPressure } = await example('fluid-dynamics', 'knowledge-fluid-example');
for (const q of [-2,0,3]) {
  const projection = projectClosedPair(q,1000,.1,.01);
  projection.divergence.forEach(d => near(d,0));
  near(projection.faces[1],0);
  near(projectClosedPair(projection.faces[1],1000,.1,.01).faces[1],0);
}
near(projectClosedPair(3,1000,.1,.01).pressure[1],30000);
near(hydrostaticPressure(1000,9.8,.5),4900);
assert.throws(() => projectClosedPair(1,1000,.1,0),/invalid/);
const { inelasticExchange } = await example('multiphysics-coupling', 'knowledge-coupling-example');
for (const [mA,vA,mB,vB] of [[.5,2,2,0],[3,-4,2,5],[1,2,1,2]]) {
  const exchange=inelasticExchange(mA,vA,mB,vB);
  near(exchange.impulseA+exchange.impulseB,0);
  near((mA+mB)*exchange.velocity,mA*vA+mB*vB);
  near(exchange.beforeEnergy-exchange.afterEnergy,.5*mA*mB/(mA+mB)*(vA-vB)**2);
}
near(inelasticExchange(.5,2,2,0).impulseB,.8);
assert.throws(() => inelasticExchange(0,1,2,1),/invalid/);
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
const { solve, residual, benchmark } = await example('iterative-linear-solvers', 'knowledge-linear-example');
const { A, b, exact } = benchmark;
for (const method of ['jacobi', 'gs', 'sor', 'cg', 'pcg']) {
  const result = solve(A, b, { method, omega: method === 'sor' ? 1.2 : 1, maxIterations: 150 });
  assert.ok(result.converged, method);
  result.x.forEach((v, i) => near(v, exact[i], 1e-8));
  assert.ok(Math.hypot(...residual(A, b, result.x)) < 2e-9);
  assert.equal(solve(A, b, { method, x0: exact }).history.length, 1, `${method}: zero initial residual`);
}
const jacobi = solve(A, b, { method: 'jacobi', maxIterations: 2 }).history;
near(jacobi[1].x[0], 2.25); near(jacobi[1].x[1], 8 / 3);
near(jacobi[2].x[0], 19 / 12); near(jacobi[2].x[1], 23 / 12);
const gs = solve(A, b, { method: 'gs', maxIterations: 2 }).history;
near(gs[1].x[0], 2.25); near(gs[1].x[1], 23 / 12);
near(gs[2].x[0], 85 / 48); near(gs[2].x[1], 299 / 144);
assert.throws(() => solve([[0]], [1]), /zero diagonal/);
assert.throws(() => solve([[-1]], [1], { method: 'cg' }), /nonpositive curvature/);
assert.throws(() => solve([[1]], [NaN]), /invalid input/);
assert.equal(solve(A, b, { maxIterations: 0 }).converged, false);
// SPD alone does not guarantee unweighted Jacobi convergence.
const coupled = [[1, .9, .9], [.9, 1, .9], [.9, .9, 1]];
const divergent = solve(coupled, [1, 1, 1], { maxIterations: 8 });
assert.ok(divergent.history.at(-1).residual > divergent.history[0].residual);
assert.ok(solve(coupled, [1, 1, 1], { method: 'gs', maxIterations: 300 }).converged);

const { distanceUpdate } = await example('pbd-xpbd-math', 'knowledge-xpbd-example');
let distance = distanceUpdate([0, 0, 0], [2, 0, 0], 1, 1, 1, 0, 1);
near(distance.a[0], .5); near(distance.b[0], 1.5);
distance = distanceUpdate([0, 0, 0], [2, 0, 0], 0, 1, 1, 0, 1);
near(distance.a[0], 0); near(distance.b[0], 1);
distance = distanceUpdate([0, 0, 0], [2, 0, 0], 0, 1, 1, 1, 1);
near(distance.b[0], 1.5); near(distance.lambda, -.5);
const balanced = distanceUpdate(distance.a, distance.b, 0, 1, 1, 1, 1, distance.lambda);
near(balanced.b[0], 1.5); near(balanced.lambda, -.5);
assert.equal(distanceUpdate([0, 0, 0], [2, 0, 0], 0, 0, 1, 0, 1).status, 'fixed');
assert.throws(() => distanceUpdate([0, 0, 0], [0, 0, 0], 1, 1, 1, 0, 1), /undefined/);
assert.throws(() => distanceUpdate([0, 0, 0], [1, 0, 0], 0, 1, 1, 0, 0), /input/);

const { candidatePairs } = await example('2d-physics-engine', 'knowledge-grid-example');
const boxes = [
  { min: [-2, -2], max: [2, 2] },
  { min: [-1, -1], max: [0, 0] },
  { min: [10, 10], max: [11, 11] },
];
assert.deepEqual(candidatePairs(boxes, 1), [[0, 1]]);
assert.deepEqual(candidatePairs([boxes[2]], 1), []);
assert.throws(() => candidatePairs(boxes, 0), /cell size/);
assert.throws(() => candidatePairs([{ min: [2, 2], max: [1, 1] }], 1), /AABB/);
const { springComparison, hardConstraint } = await example('pbd-xpbd-vbd-avbd-comparison', 'knowledge-solver-comparison-example');
const compared = springComparison();
near(compared.exact[0], 1/3); near(compared.exact[1], 5/3);
const vbdExpected = [[.5,1.75],[.375,1.6875],[.34375,1.671875],[.3359375,1.66796875]];
let previousEnergy = 50, previousResidual = Infinity;
compared.history.forEach((row, i) => {
  row.xpbd.forEach((value, j) => near(value, compared.exact[j]));
  row.vbd.forEach((value, j) => near(value, vbdExpected[i][j]));
  near(row.pbd[1]-row.pbd[0]-1, .5**(i+1));
  assert.ok(row.energy < previousEnergy && row.residual < previousResidual);
  previousEnergy = row.energy; previousResidual = row.residual;
});
near(compared.lambda, -1/3);
for (const config of [
  { h: .05, mass: 2, stiffness: 40 },
  { h: .2, mass: .5, stiffness: 10 },
  { h: .01, mass: 3, stiffness: 20 }
]) {
  const sample = springComparison({ ...config, sweeps: 160 });
  const row = sample.history.at(-1);
  row.xpbd.forEach((value, j) => near(value, sample.exact[j]));
  row.vbd.forEach((value, j) => near(value, sample.exact[j]));
  // Independently check discrete force balance, not just two code paths agreeing.
  const a = config.mass/config.h**2;
  const c = row.xpbd[1]-row.xpbd[0]-1;
  near(a*row.xpbd[0]-config.stiffness*c, 0, 1e-8);
  near(a*(row.xpbd[1]-2)+config.stiffness*c, 0, 1e-8);
  near(c+sample.alphaT*sample.lambda, 0);
  near(row.xpbd[0]+row.xpbd[1], 2);
}
assert.deepEqual(springComparison({strength:1,sweeps:1}).history[0].pbd, [.5,1.5]);
const augmented = hardConstraint();
near(augmented.penaltyOnly, 1.5);
augmented.history.forEach((row, i) => {
  near(row.x, 1+.5**(i+1));
  near(row.dual, 100*(1-.5**(i+1)));
  near(100*(row.x-2)+row.dual, 0);
});
near(hardConstraint({rounds:40}).history.at(-1).x, 1);
assert.throws(() => springComparison({h:0}), /invalid/);
assert.throws(() => springComparison({mass:0}), /invalid/);
assert.throws(() => springComparison({stiffness:Infinity}), /invalid/);
assert.throws(() => springComparison({sweeps:1.5}), /invalid/);
assert.throws(() => springComparison({strength:-1}), /invalid/);
assert.throws(() => hardConstraint({penalty:0}), /invalid/);
assert.throws(() => hardConstraint({rounds:0}), /invalid/);
const { nonlinearResidual } = await example('pbd-xpbd-vbd-avbd-comparison', 'knowledge-xpbd-nonlinear-residual-example');
const nonlinear = nonlinearResidual();
nonlinear.rc.forEach(value => near(value, 0, 1e-12));
assert.ok(Math.max(...nonlinear.rx.map(Math.abs)) > .3, 'XPBD constraint residual alone must not imply full force balance');
const later = nonlinearResidual(2000);
later.x.forEach((value, i) => near(value, nonlinear.x[i]));
assert.throws(() => nonlinearResidual(0), /invalid/);
console.log('Document examples passed: dynamics, materials, integration, linear solvers, XPBD, grid candidates and published PBD/XPBD/VBD/ALM comparisons. Not an engine runtime test.');
