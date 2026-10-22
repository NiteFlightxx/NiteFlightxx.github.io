export type Spring = { a: number; b: number; rest: number; stiffness: number; type: 'structural' | 'shear' | 'bend' | 'seam'; active: boolean; column: number };

export const COLS = 25, ROWS = 36, UPPER_SEAM_ROW = 24, LOWER_SEAM_ROW = 25;
export const WIDTH = 3.2, HEIGHT = 5.44;
export const rowUV = (row: number) => row <= UPPER_SEAM_ROW ? 1 - row / UPPER_SEAM_ROW * .72 : .28 - (row - LOWER_SEAM_ROW) / (ROWS - 1 - LOWER_SEAM_ROW) * .28;

/** A split, 900-particle cardstock sheet. Only breakable fibers join the two islands. */
export class VerletPaperEngine {
  positions = new Float32Array(COLS * ROWS * 3);
  previous = new Float32Array(COLS * ROWS * 3);
  rest = new Float32Array(COLS * ROWS * 3);
  springs: Spring[] = [];
  torn = new Set<number>();
  detached = false;
  grab: { vertex: number; x: number; y: number; z: number } | null = null;
  time = 0;
  onSnap?: (column: number, count: number) => void;

  constructor() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = (r * COLS + c) * 3;
      this.positions[i] = (c / (COLS - 1) - .5) * WIDTH;
      // The seam has two coincident rows, with independent indices and particles.
      this.positions[i + 1] = (rowUV(r) - .5) * HEIGHT;
      this.positions[i + 2] = .025 * Math.sin(c / 24 * Math.PI);
    }
    this.previous.set(this.positions); this.rest.set(this.positions);
    const add = (r: number, c: number, rr: number, cc: number, type: Spring['type'], stiffness: number) => {
      if (rr >= ROWS || cc < 0 || cc >= COLS) return;
      const cross = r <= UPPER_SEAM_ROW && rr >= LOWER_SEAM_ROW;
      if (cross && type !== 'seam') return;
      const a = r * COLS + c, b = rr * COLS + cc;
      const rest = Math.hypot(...[0, 1, 2].map(k => this.positions[a * 3 + k] - this.positions[b * 3 + k]));
      this.springs.push({ a, b, rest, stiffness, type, active: true, column: c });
    };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      add(r, c, r, c + 1, 'structural', .94);
      add(r, c, r + 1, c, r === UPPER_SEAM_ROW ? 'seam' : 'structural', .94);
      add(r, c, r + 1, c + 1, 'shear', .82);
      add(r, c, r + 1, c - 1, 'shear', .82);
      for (const [hop, stiffness] of [[2, .76], [4, .56]]) {
        add(r, c, r + hop, c, 'bend', stiffness);
        add(r, c, r, c + hop, 'bend', stiffness);
      }
    }
  }

  sever(column: number) {
    if (this.torn.has(column) || column < 0 || column >= COLS) return;
    this.torn.add(column);
    for (const s of this.springs) {
      if (s.column === column && Math.floor(s.a / COLS) <= UPPER_SEAM_ROW && Math.floor(s.b / COLS) >= LOWER_SEAM_ROW) s.active = false;
    }
    for (let r = 21; r < 29; r++) {
      const i = (r * COLS + column) * 3;
      const curl = r <= 24 ? .045 : -.09;
      this.positions[i + 2] += curl;
      this.previous[i + 2] -= curl * .45;
    }
    if (this.torn.size === COLS) {
      this.detached = true;
      for (let r = 25; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 3;
        this.previous[i + 1] += .045;
        this.previous[i + 2] += .018 * (c / 24 - .3);
      }
      this.grab = null;
    }
    this.onSnap?.(column, this.torn.size);
  }

  step(dt: number) {
    const step = Math.min(dt, 1 / 30); this.time += step;
    const p = this.positions, old = this.previous;
    for (let v = COLS; v < COLS * ROWS; v++) {
      const i = v * 3, r = Math.floor(v / COLS), stub = r >= 25 && this.detached;
      for (let k = 0; k < 3; k++) {
        const current = p[i + k], velocity = (current - old[i + k]) * (stub ? .989 : .945);
        const gravity = k === 1 ? (stub ? -6.5 : -.45) * step * step : 0;
        const cutEdge = this.torn.has(v % COLS) && Math.abs(r - 24.5) < 4;
        const edgeCurl = k === 2 && cutEdge ? (r <= 24 ? .16 : -.24) * Math.exp(-Math.abs(r - 24.5) * .7) : 0;
        const restoring = stub ? 0 : (this.rest[i + k] + edgeCurl - current) * (r <= 24 ? .004 : .00035);
        const flutter = stub && k === 2 ? Math.sin(this.time * 9 + v * .11) * .75 * step * step : 0;
        p[i + k] += velocity + gravity + restoring + flutter;
        old[i + k] = current;
      }
      if (stub && p[i + 1] < -3.63) { p[i + 1] = -3.63; old[i] = p[i] - (p[i] - old[i]) * .8; old[i + 1] = p[i + 1]; }
    }
    for (let iteration = 0; iteration < 10; iteration++) {
      for (const s of this.springs) {
        if (!s.active) continue;
        const a = s.a * 3, b = s.b * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const length = Math.hypot(dx, dy, dz) || 1;
        const correction = (length - s.rest) / length * s.stiffness * .5;
        const wa = s.a < COLS ? 0 : 1, wb = s.b < COLS ? 0 : 1;
        p[a] += dx * correction * wa; p[a + 1] += dy * correction * wa; p[a + 2] += dz * correction * wa;
        p[b] -= dx * correction * wb; p[b + 1] -= dy * correction * wb; p[b + 2] -= dz * correction * wb;
      }
      for (let c = 0; c < COLS; c++) for (let k = 0; k < 3; k++) p[c * 3 + k] = this.rest[c * 3 + k];
      if (this.grab) {
        const { vertex, x, y, z } = this.grab;
        for (let v = COLS; v < ROWS * COLS; v++) {
          const distance = Math.hypot(v % COLS - vertex % COLS, Math.floor(v / COLS) - Math.floor(vertex / COLS));
          if (distance > 4) continue;
          const weight = Math.exp(-distance * distance / 5) * .26;
          const i = v * 3, g = vertex * 3;
          p[i] += (x + this.rest[i] - this.rest[g] - p[i]) * weight;
          p[i + 1] += (y + this.rest[i + 1] - this.rest[g + 1] - p[i + 1]) * weight;
          p[i + 2] += (z - p[i + 2]) * weight;
        }
      }
    }
  }
}
