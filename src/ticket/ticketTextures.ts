import * as THREE from 'three';
import { NITE_LOGO_HEIGHT, NITE_LOGO_PATHS, NITE_LOGO_WIDTH } from '../lib/brandGeometry';
import { TICKET_EDITIONS } from './ticketContent';

export function ticketTextures(edition: number, zone: string) {
  const width = 1024, height = 1740;
  const make = () => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; };
  const front = make(), back = make(), mask = make();
  const ink = ['#243e35', '#493d24', '#302b50'][edition];
  const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, weight = 500, color = ink) => {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px Arial, "Microsoft YaHei", "PingFang SC", sans-serif`; ctx.fillText(text, x, y);
  };
  const mono = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 20) => { ctx.fillStyle = ink; ctx.font = `${size}px "IBM Plex Mono", "Microsoft YaHei", "PingFang SC", monospace`; ctx.fillText(text, x, y); };
  const logo = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(height / NITE_LOGO_HEIGHT, height / NITE_LOGO_HEIGHT); ctx.fillStyle = ink;
    for (const path of NITE_LOGO_PATHS) ctx.fill(new Path2D(path));
    ctx.restore();
  };
  function base(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = ['#e5e9dc', '#ead8a8', '#d7d0ee'][edition]; ctx.fillRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    for (const [stop, color] of [[0,'#ffffff80'], [.25,'#c0e3de70'], [.44,'#d7c3ef85'], [.65,'#f5f3bc70'], [.85,'#c4e8df65'], [1,'#f9f7ee80']] as [number,string][]) gradient.addColorStop(stop,color);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = `${ink}35`; ctx.lineWidth = 1; ctx.strokeRect(31, 31, width - 62, height - 62);
    for (let i = 0; i < 3000; i++) { const x = (Math.sin(i * 78.233) * 43758.5453) % 1 * width; const y = (Math.sin(i * 12.9898) * 17238.2) % 1 * height; ctx.fillStyle = '#243e3510'; ctx.fillRect(Math.abs(x), Math.abs(y), 1.4, 1.4); }
  }
  const ctx = front.getContext('2d')!; base(ctx);
  logo(ctx, 74, 60, 52); label(ctx, 'NITE', 139, 105, 42, 700); mono(ctx, '独立研究 / 交互实验', 582, 98, 25);
  ctx.fillStyle = ink; ctx.fillRect(74, 160, 876, 2);
  mono(ctx, '第 004 场   /   伦敦', 76, 219, 25);
  label(ctx, 'NITE', 64, 390, 178, 900);
  label(ctx, '光影共振', 64, 541, 139, 800);
  mono(ctx, '光影共振之夜   /   2026', 79, 612, 29);
  const cx = 515, cy = 840;
  // Fine overlapping epitrochoids form a procedural guilloche security rosette.
  ctx.lineWidth = 1.25;
  for (let ring = 0; ring < 50; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= 720; i++) {
      const t = i / 720 * Math.PI * 2, radius = 147 + ring * 1.2 + 37 * Math.cos(t * 7 + ring * .12);
      const x = cx + Math.cos(t) * radius * 1.52, y = cy + Math.sin(t) * radius * .88;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = ring % 3 === 0 ? `${ink}99` : '#7f8c7970'; ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(cx,cy,105,105,0,0,Math.PI*2); ctx.fillStyle = '#eef0dfde'; ctx.fill(); ctx.strokeStyle = `${ink}60`; ctx.stroke();
  logo(ctx, cx - 118 / NITE_LOGO_HEIGHT * NITE_LOGO_WIDTH / 2, cy - 73, 118);
  label(ctx, 'NITE', cx - 35, cy + 80, 29, 600);
  mono(ctx, '光 · 声音 · 同频相遇', 78, 1092, 29);
  mono(ctx, '2026.10.17', 77, 1157, 29); mono(ctx, '18:00 — 深夜', 656, 1157, 27);
  ctx.strokeStyle = `${ink}60`; ctx.setLineDash([9, 12]); ctx.beginPath(); ctx.moveTo(0, 1253); ctx.lineTo(width, 1253); ctx.stroke(); ctx.setLineDash([]);
  mono(ctx, '仅限一人入场', 77, 1305, 26); label(ctx, zone, 73, 1384, 58, 700);
  mono(ctx, 'NITE / 全息通行证', 77, 1441, 27);
  mono(ctx, '№ NITE—004—0817', 77, 1595, 27); mono(ctx, `0${edition + 1} / ${TICKET_EDITIONS[edition].name}`, 77, 1655, 27);
  // Deterministic security code with QR-style finder patterns.
  const qx = 723, qy = 1300, cell = 8, n = 25;
  ctx.fillStyle = '#f5f5e9'; ctx.fillRect(qx - 13, qy - 13, n * cell + 26, n * cell + 26);
  ctx.fillStyle = ink;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const finder = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    let value = Math.sin(x * 133.7 + y * 79.1) > 0;
    for (const [ox, oy] of [[0,0],[18,0],[0,18]]) if (finder(ox,oy)) { const xx = x - ox, yy = y - oy; value = xx === 0 || xx === 6 || yy === 0 || yy === 6 || (xx >= 2 && xx <= 4 && yy >= 2 && yy <= 4); }
    if (value) ctx.fillRect(qx + x * cell, qy + y * cell, cell, cell);
  }
  for (let i = 0; i < 65; i++) { const x = 724 + i * 3.1; ctx.fillRect(x, 1555, i % 3 === 0 ? 2 : 1, 55); }
  mono(ctx, '撕开入场', 754, 1655, 26);
  const b = back.getContext('2d')!; base(b);
  mono(b, 'NITE / 通行证背面', 76, 106, 30); logo(b, 867, 63, 56);
  label(b, '在场，', 70, 366, 132, 800); label(b, '让共振发生。', 70, 510, 116, 800);
  for (let i = 0; i < 48; i++) {
    b.beginPath(); for (let x = 0; x < 900; x += 3) { const y = 760 + Math.sin(x * .012 + i * .11) * (70 + i) + i * 4; if (!x) b.moveTo(x + 62,y); else b.lineTo(x + 62,y); } b.strokeStyle = `${ink}75`; b.stroke();
  }
  mono(b, '一夜相遇，回响不止。', 76, 1120, 31);
  mono(b, 'NITE 光影共振之夜', 76, 1320, 29);
  mono(b, '伦敦 · 圆屋剧场 / 2026.10.17', 76, 1370, 27);
  mono(b, '保留这一刻，撕开新的可能。', 76, 1580, 29);
  mono(b, '仅限一人 / № NITE—004—0817', 76, 1655, 26); logo(b, 870, 1565, 66);
  for (const face of [front, back]) {
    const cut = face.getContext('2d')!;
    cut.globalCompositeOperation = 'destination-in';
    cut.beginPath(); cut.roundRect(0,0,width,height,46); cut.fill();
    cut.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 24; i++) { cut.beginPath(); cut.arc((i+.5)/24*width,1253,6.35,0,Math.PI*2); cut.fill(); }
    for (const x of [0,width]) { cut.beginPath(); cut.arc(x,1253,33,0,Math.PI*2); cut.fill(); }
    cut.globalCompositeOperation = 'source-over';
  }
  const fillMask = (source: HTMLCanvasElement, target: HTMLCanvasElement) => {
  const m = target.getContext('2d')!;
  m.drawImage(source,0,0); const pixels = m.getImageData(0,0,width,height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const dark = pixels.data[i] < 110 ? 1 : 0;
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    pixels.data[i] = dark ? 35 : 210; pixels.data[i+1] = dark ? 220 : 10; pixels.data[i+2] = 100 + y / height * 80 + Math.sin(x / width * Math.PI * 2) * 30;
  }
  m.putImageData(pixels,0,0);
  };
  fillMask(front,mask); const backMask = make(); fillMask(back,backMask);
  const texture = (canvas: HTMLCanvasElement, color = false) => { const t = new THREE.CanvasTexture(canvas); if (color) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { front: texture(front,true), back: texture(back,true), mask: texture(mask), backMask: texture(backMask) };
}
