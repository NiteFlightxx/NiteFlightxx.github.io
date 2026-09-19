/**
 * Shared 2D canvas drawing primitives for the drone-basics interactive demos.
 *
 * Everything is a plain function over a CanvasRenderingContext2D — no React,
 * no DOM. Panels call these inside their rAF loop with layout metrics they
 * own. Colors are fixed dark-panel values (the demo shells render on a dark
 * surface in both site themes, mirroring how article code blocks stay dark).
 */

export const INK = {
  bg: "#0b0d0c",
  grid: "rgba(255,255,255,0.055)",
  frame: "rgba(255,255,255,0.10)",
  thrust: "#bcfd49", // lime — thrust / control output
  gravity: "#8b93a1", // gray — weight
  velocity: "#96c8ff", // ice blue — velocity / state
  target: "#fbbf24", // amber — setpoint / target line
  body: "#e2e8f0", // hull strokes
  motor: "#9ca3af",
  danger: "#f87171",
  text: "#c9c9c9",
  faint: "#737a85",
} as const;

/** Draw an arrow from -> to with a triangular head. */
export function arrow(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number, tx: number, ty: number,
  color: string, width = 2, head = 7,
) {
  const dx = tx - fx, dy = ty - fy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return;
  const ux = dx / len, uy = dy / len;
  const bx = tx - ux * head, by = ty - uy * head;
  const px = -uy, py = ux;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx + px * head * 0.55, by + py * head * 0.55);
  ctx.lineTo(bx - px * head * 0.55, by - py * head * 0.55);
  ctx.closePath();
  ctx.fill();
}

/** Dashed reference arrow (e.g. force components). */
export function dashedArrow(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number, tx: number, ty: number,
  color: string, width = 1.5, head = 6,
) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  arrow(ctx, fx, fy, tx, ty, color, width, head);
  ctx.restore();
}

/** Label with a small dark backing chip for legibility. */
export function label(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color: string = INK.text, size = 11, align: CanvasTextAlign = "center",
) {
  ctx.save();
  ctx.font = `${size}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  const ax = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.fillStyle = "rgba(8,10,9,0.72)";
  ctx.fillRect(ax - 4, y - size * 0.75, w + 8, size * 1.5);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Ground hatch strip at the bottom of a viewport. */
export function ground(ctx: CanvasRenderingContext2D, w: number, h: number, y: number) {
  ctx.save();
  ctx.strokeStyle = INK.frame;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.strokeStyle = INK.grid;
  ctx.lineWidth = 1;
  const step = 14;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y + 8);
    ctx.stroke();
  }
  void h;
  ctx.restore();
}

/**
 * Side/front view of a quadcopter, tilted by `tiltDeg` (positive = nose up
 * when drawn left-to-right). `thrust` is normalized total thrust where 1.0
 * hovers (arrow scales with it). Draws: hull, two booms, motors with spinning
 * blade lines, thrust vector along body-up, and returns nothing.
 */
export function drawQuadSide(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tiltDeg: number,
  thrust: number,
  opts: { bladeBoost?: number; scale?: number } = {},
) {
  const s = opts.scale ?? 1;
  const boom = 42 * s;
  const r = Math.hypot(boom, 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((tiltDeg * Math.PI) / 180);

  // Booms
  ctx.strokeStyle = INK.body;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-boom, 0);
  ctx.lineTo(boom, 0);
  ctx.stroke();

  // Center hull
  ctx.fillStyle = "#1c211e";
  ctx.strokeStyle = INK.body;
  ctx.lineWidth = 2;
  roundRect(ctx, -13 * s, -9 * s, 26 * s, 18 * s, 5 * s);
  ctx.fill();
  ctx.stroke();

  // Motors + blades (blade length grows with |thrust|)
  for (const mx of [-boom, boom]) {
    ctx.beginPath();
    ctx.arc(mx, -4 * s, 5 * s, 0, Math.PI * 2);
    ctx.fillStyle = INK.motor;
    ctx.fill();

    const blade = (10 + (opts.bladeBoost ?? 0) + Math.abs(thrust) * 9) * s;
    ctx.strokeStyle = "rgba(226,232,240,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - blade, -4 * s);
    ctx.lineTo(mx + blade, -4 * s);
    ctx.stroke();
    // Slight disc halo so it reads as a spinning prop
    ctx.strokeStyle = "rgba(188,253,73,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, -4 * s, blade, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Thrust vector along body-up (drawn un-rotated from center)
  const upx = Math.sin((-tiltDeg * Math.PI) / 180);
  const upy = -Math.cos((-tiltDeg * Math.PI) / 180);
  const tLen = thrust * 56 * s;
  if (Math.abs(thrust) > 0.02) {
    arrow(ctx, cx - upx * 8, cy - upy * 8, cx + upx * tLen, cy + upy * tLen, INK.thrust, 2.5, 8);
  }
  void r;
}

/** Rounded-rect path helper. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Top view of a quadcopter in X configuration. `motors` are normalized
 * speeds [0..1.4] in order [front-left, front-right, rear-right, rear-left]
 * (clockwise around the frame). Each motor draws a disc whose glow scales
 * with speed, plus a spin-direction arc when `showSpin` is set. `yawDeg`
 * rotates the whole frame. Returns the four motor screen positions.
 */
export function drawQuadTop(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  motors: [number, number, number, number],
  yawDeg: number,
  opts: { scale?: number; spinDirs?: [number, number, number, number]; showSpin?: boolean; highlight?: number } = {},
) {
  const s = opts.scale ?? 1;
  const arm = 40 * s;
  const spin: [number, number, number, number] = opts.spinDirs ?? [1, -1, 1, -1];
  // FL, FR, RR, RL corners at ±45°
  const corners: Array<[number, number]> = [
    [-arm, -arm], [arm, -arm], [arm, arm], [-arm, arm],
  ];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((yawDeg * Math.PI) / 180);

  // Booms
  ctx.strokeStyle = INK.body;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(corners[0][0], corners[0][1]);
  ctx.lineTo(corners[2][0], corners[2][1]);
  ctx.moveTo(corners[1][0], corners[1][1]);
  ctx.lineTo(corners[3][0], corners[3][1]);
  ctx.stroke();

  // Center hull
  ctx.fillStyle = "#1c211e";
  ctx.strokeStyle = INK.body;
  ctx.lineWidth = 1.6;
  roundRect(ctx, -10 * s, -10 * s, 20 * s, 20 * s, 5 * s);
  ctx.fill();
  ctx.stroke();
  // Nose marker
  ctx.fillStyle = INK.thrust;
  ctx.beginPath();
  ctx.moveTo(0, -15 * s);
  ctx.lineTo(-4 * s, -8 * s);
  ctx.lineTo(4 * s, -8 * s);
  ctx.closePath();
  ctx.fill();

  const positions: Array<[number, number]> = [];
  corners.forEach(([mx, my], i) => {
    const speed = motors[i];
    positions.push([mx, my]);
    const r = (6 + speed * 6) * s;
    // Glow disc
    if (speed > 0.05) {
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 1.9);
      g.addColorStop(0, `rgba(188,253,73,${0.05 + speed * 0.22})`);
      g.addColorStop(1, "rgba(188,253,73,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Motor disc
    ctx.beginPath();
    ctx.arc(mx, my, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = i === opts.highlight ? INK.thrust : INK.motor;
    ctx.fill();
    // Spin arc when requested
    if (opts.showSpin && speed > 0.05) {
      const a0 = spin[i] > 0 ? -0.6 : Math.PI - 0.6;
      ctx.strokeStyle = "rgba(150,200,255,0.85)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(mx, my, r, a0, a0 + 1.7, spin[i] < 0);
      ctx.stroke();
      // Arrow head on the arc end
      const a1 = a0 + 1.7;
      const hx = mx + Math.cos(a1) * r;
      const hy = my + Math.sin(a1) * r;
      const tangent = spin[i] > 0 ? a1 + Math.PI / 2 : a1 - Math.PI / 2;
      ctx.fillStyle = "rgba(150,200,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(tangent) * 4, hy + Math.sin(tangent) * 4);
      ctx.lineTo(hx + Math.cos(a1) * 3.5, hy + Math.sin(a1) * 3.5);
      ctx.lineTo(hx - Math.cos(a1) * 3.5, hy - Math.sin(a1) * 3.5);
      ctx.closePath();
      ctx.fill();
    }
  });
  ctx.restore();
  return positions;
}
