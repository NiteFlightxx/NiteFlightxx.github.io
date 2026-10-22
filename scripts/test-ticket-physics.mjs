import assert from 'node:assert/strict';
import { VerletPaperEngine, COLS, ROWS, rowUV } from '../src/ticket/VerletPaperEngine.ts';

const engine = new VerletPaperEngine();
assert.equal(engine.positions.length / 3, 900);
assert.equal(COLS * ROWS, 900);
const crossing = engine.springs.filter(s => Math.floor(s.a / COLS) <= 24 && Math.floor(s.b / COLS) >= 25);
assert.equal(crossing.length, 25, 'Only the 25 perforation fibers may bridge the split');
assert(crossing.every(s => s.type === 'seam'));
assert(Math.abs(rowUV(24) - rowUV(25)) < 1e-6, 'Untorn edges must meet without a visible gap');
for (const [type, stiffness] of [['structural', .94], ['shear', .82], ['bend', .76], ['bend', .56]]) {
  assert(engine.springs.some(s => s.type === type && s.stiffness === stiffness));
}
for (let frame = 0; frame < 120; frame++) engine.step(1 / 60);
assert([...engine.positions].every(Number.isFinite));
let snaps = 0;
engine.onSnap = () => snaps++;
engine.sever(0); engine.sever(0);
assert.equal(snaps, 1, 'A fiber must snap only once');
assert.equal(crossing.filter(s => s.active).length, 24);
engine.grab = { vertex: 20 * COLS + 12, x: .3, y: -.5, z: .7 };
for (let frame = 0; frame < 60; frame++) engine.step(1 / 60);
assert([...engine.positions].every(Number.isFinite));
engine.grab = null;
for (let c = 1; c < COLS; c++) engine.sever(c);
assert.equal(engine.detached, true);
assert.equal(snaps, 25);
assert.equal(crossing.filter(s => s.active).length, 0);
const before = engine.positions[30 * COLS * 3 + 1];
for (let frame = 0; frame < 240; frame++) engine.step(1 / 60);
assert([...engine.positions].every(Number.isFinite), 'Detached flutter must remain finite');
assert(engine.positions[30 * COLS * 3 + 1] < before, 'Detached stub falls under gravity');
for (let c = 0; c < COLS; c++) for (let k = 0; k < 3; k++) assert.equal(engine.positions[c * 3 + k], engine.rest[c * 3 + k]);
const fresh = new VerletPaperEngine();
assert.equal(fresh.torn.size, 0); assert.equal(fresh.detached, false);
console.log('Ticket physics passed: topology, four stiffnesses, partial tear, grab stability, detachment, gravity, anchors, and fresh issue.');
