/**
 * Unified 3D drone sandbox — one WebGL scene, five interaction modes mapped
 * to the article chapters: 悬停 / 姿态 / 受力 / PID / 混控.
 *
 * The 3D scene runs a single rAF loop; each mode owns its physics slice in
 * a persistent sim ref (switching tabs preserves gains/attitude etc.), pushes
 * drone state + arrows into the QuadScene, then renders. The PID mode also
 * draws a small 2D response-curve strip; the mixer mode keeps the compact
 * 4×4 sign-matrix DOM.
 */
import React, { useEffect, useRef, useState } from "react";
import { QuadScene, type ViewPreset } from "./gl/quadScene";
import { useRaf } from "./useRaf";
import { INK, label as canvasLabel } from "./droneDraw";
import { DemoSlider, DemoButton } from "./DemoShell";

type Mode = "hover" | "attitude" | "force" | "pid" | "mixer";

const MODES: Array<{ key: Mode; label: string; view: ViewPreset; formula: string }> = [
  { key: "hover",    label: "悬停",   view: "follow", formula: "T = k·ω²  ·  ΣT = mg" },
  { key: "attitude", label: "姿态",   view: "tilt",   formula: "a = g·tanθ  ·  偏航 = 对角桨组反扭矩差" },
  { key: "force",    label: "受力",   view: "top",    formula: "m·dv/dt = ΣF + mg" },
  { key: "pid",      label: "PID",    view: "side",   formula: "u = Kp·e + Ki·∫e·dt + Kd·de/dt" },
  { key: "mixer",    label: "混控",   view: "follow", formula: "motor = A · [Throttle, Roll, Pitch, Yaw]ᵀ" },
];

const MIX: number[][] = [
  [ 1,  1,  1,  1],
  [ 1, -1, -1,  1],
  [-1, -1,  1,  1],
  [ 1, -1,  1, -1],
];
const MOTOR_NAMES = ["FL", "FR", "RR", "RL"];

/** Altitude [0..1] → world Y in scene units. */
const yOf = (z: number) => 0.3 + z * 2.05;

export default function DroneSandbox() {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<QuadScene | null>(null);

  const [mode, setMode] = useState<Mode>("hover");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ---- Per-mode UI state (persist across tab switches) ----
  const [throttle, setThrottle] = useState(1.0);
  const [pitch, setPitch] = useState(18);
  const [roll, setRoll] = useState(0);
  const [yaw, setYaw] = useState(0);
  const [kp, setKp] = useState(2.2);
  const [ki, setKi] = useState(0);
  const [kd, setKd] = useState(0);
  const [wishes, setWishes] = useState<number[]>([1.0, 0, 0, 0]);
  const [readout, setReadout] = useState("拖动油门，或拖拽旋转视角 🎮");

  const ui = useRef({ throttle, pitch, roll, yaw, kp, ki, kd, wishes });
  ui.current = { throttle, pitch, roll, yaw, kp, ki, kd, wishes };

  // ---- Persistent simulation slices ----
  const sim = useRef({
    hover: { z: 0.3, v: 0 },
    force: { x: 0, z: 0, vx: 0, vz: 0, trailT: 0 },
    pid: { z: 0.12, v: 0, ie: 0, t: 0, gust: 0, gustT: -9, hist: [] as Array<{ t: number; z: number }> },
  });
  const pointer = useRef<{ active: boolean; gx: number; gz: number }>({ active: false, gx: 0, gz: 0 });

  // ---- Scene lifecycle + mode wiring ----
  useEffect(() => {
    if (!cvRef.current) return;
    const scene = new QuadScene(cvRef.current);
    sceneRef.current = scene;
    const m = MODES.find((x) => x.key === modeRef.current)!;
    scene.setView(m.view);
    scene.setRotateEnabled(m.key !== "force");
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setView(MODES.find((m) => m.key === mode)!.view);
    scene.setRotateEnabled(mode !== "force");
    scene.clearTrail();
  }, [mode]);

  const setPointerForce = (e: React.PointerEvent<HTMLCanvasElement>, active: boolean) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const hit = scene.pointerToGround(e.clientX, e.clientY);
    if (hit) pointer.current = { active, gx: hit.x, gz: hit.z };
    else if (!active) pointer.current.active = false;
  };

  // ---- Single rAF loop: physics per mode → scene → render ----
  useRaf((dt) => {
    const scene = sceneRef.current;
    const cv = cvRef.current;
    if (!scene || !cv) return;
    scene.resize();
    const m = modeRef.current;
    const u = ui.current;

    if (m === "hover") {
      const s = sim.current.hover;
      const a = 1.15 * (u.throttle - 1);
      s.v += a * dt;
      s.z = Math.min(0.92, Math.max(0.06, s.z + s.v * dt));
      if (s.z <= 0.06) s.v = Math.max(0, s.v);
      if (s.z >= 0.92) s.v = Math.min(0, s.v);
      const y = yOf(s.z);
      scene.setDrone({ position: { x: 0, y, z: 0 }, pitch: 0, roll: 0, yaw: 0,
        motors: [u.throttle, u.throttle, u.throttle, u.throttle] });
      scene.setTargetRing(yOf(0.72));
      const up = { x: 0, y: 1, z: 0 };
      scene.setArrow("thrust", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: up, len: 0.35 + u.throttle * 0.85 });
      scene.setArrow("gravity", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: { x: 0, y: -1, z: 0 }, len: 1.2 });
      scene.setArrow("velocity", { dir: null, len: 0 });
      scene.setArrow("force", { dir: null, len: 0 });
      const msg = u.throttle > 1.03 ? "ΣT > mg → 上升" : u.throttle < 0.97 ? "ΣT < mg → 下降" : "ΣT ≈ mg → 悬停";
      setReadoutThrottled(`${msg} · 高度 ${(s.z * 100) | 0}% · 油门 ${(u.throttle * 100) | 0}%`);
    } else if (m === "attitude") {
      // Kinematic pose demo: drone bobs gently at mid altitude
      const t = performance.now() / 1000;
      const z = 0.55 + Math.sin(t * 0.7) * 0.02;
      const y = yOf(z);
      const mix: [number, number, number, number] = [
        1 + u.roll * 0.02 + u.yaw * 0.03,
        1 - u.roll * 0.02 - u.yaw * 0.03,
        1 + u.roll * 0.02 - u.yaw * 0.03,
        1 - u.roll * 0.02 + u.yaw * 0.03,
      ];
      scene.setDrone({ position: { x: 0, y, z: 0 }, pitch: u.pitch, roll: u.roll, yaw: u.yaw, motors: mix });
      scene.setTargetRing(null);
      // Thrust along body-up; its world direction includes the tilt
      const rad = (u.pitch * Math.PI) / 180;
      const radR = (u.roll * Math.PI) / 180;
      const upWorld = {
        x: Math.sin(rad) * 1 + 0, // nose-down pitch pushes thrust +X (forward)
        y: Math.cos(rad) * Math.cos(radR),
        z: 0,
      };
      // Simplify: horizontal component from pitch (X) and roll (Z, "screen" left/right)
      const hX = Math.sin(rad);
      const hZ = -Math.sin(radR) * 0; // roll shown as tilt; motion direction text only
      scene.setArrow("thrust", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: upWorld, len: 1.45 });
      scene.setArrow("velocity", { origin: { x: 0, y: y, z: 0 }, dir: { x: hX, y: 0, z: hZ }, len: Math.abs(hX) * 1.1 + Math.abs(Math.sin(radR)) * 1.1, color: "#96c8ff" });
      scene.setArrow("gravity", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: { x: 0, y: -1, z: 0 }, len: 1.2, alpha: 0.55 });
      scene.setArrow("force", { dir: null, len: 0 });
      const dirPitch = u.pitch > 2 ? "向前移动" : u.pitch < -2 ? "向后移动" : "";
      const dirRoll = u.roll > 2 ? "向右侧移动" : u.roll < -2 ? "向左侧移动" : "";
      const msg = [dirPitch, dirRoll].filter(Boolean).join(" + ") || "机身放平 = 无水平力";
      setReadoutThrottled(`俯仰 ${u.pitch | 0}° · 滚转 ${u.roll | 0}° · 偏航 ${u.yaw > 0 ? "+" : ""}${u.yaw.toFixed(1)} → ${msg}`);
    } else if (m === "force") {
      const s = sim.current.force;
      let fx = 0, fz = 0;
      if (pointer.current.active) {
        const dx = pointer.current.gx - s.x, dz = pointer.current.gz - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.12) {
          const mag = Math.min(d * 1.5, 7.5);
          fx = (dx / d) * mag;
          fz = (dz / d) * mag;
        }
      }
      s.vx += (fx * dt) * 1.6;
      s.vz += (fz * dt) * 1.6;
      // drag-free Newton: no damping; bounce at arena walls
      const R = 2.3;
      s.x = Math.max(-R, Math.min(R, s.x + s.vx * dt));
      s.z = Math.max(-R, Math.min(R, s.z + s.vz * dt));
      if (Math.abs(s.x) === R) s.vx *= -0.65;
      if (Math.abs(s.z) === R) s.vz *= -0.65;
      s.trailT += dt;
      if (s.trailT > 0.07 && (Math.abs(s.vx) + Math.abs(s.vz)) > 0.25) {
        s.trailT = 0;
        scene.pushTrail({ x: s.x, y: 0, z: s.z });
      }
      const y = yOf(0.55);
      scene.setDrone({ position: { x: s.x, y, z: s.z }, pitch: 0, roll: 0, yaw: 0,
        motors: [1, 1, 1, 1] });
      scene.setTargetRing(null);
      if (pointer.current.active && (Math.abs(fx) + Math.abs(fz)) > 0.05) {
        scene.setArrow("force", { origin: { x: s.x, y: y - 0.05, z: s.z }, dir: { x: fx, y: 0, z: fz }, len: 0.4 + Math.min(1, Math.hypot(fx, fz) / 7.5) * 0.9, color: "#fbbf24" });
      } else scene.setArrow("force", { dir: null, len: 0 });
      const vmag = Math.hypot(s.vx, s.vz);
      if (vmag > 0.3) {
        scene.setArrow("velocity", { origin: { x: s.x, y, z: s.z }, dir: { x: s.vx, y: 0, z: s.vz }, len: 0.35 + Math.min(1.1, vmag * 0.14), color: "#96c8ff" });
      } else scene.setArrow("velocity", { dir: null, len: 0 });
      scene.setArrow("thrust", { origin: { x: s.x, y: y - 0.05, z: s.z }, dir: { x: 0, y: 1, z: 0 }, len: 1.2, alpha: 0.55 });
      scene.setArrow("gravity", { dir: null, len: 0 });
      const msg = pointer.current.active
        ? "施加外力中：a = F/m，速度正在改变"
        : vmag > 0.3 ? "松手了——没有力就没有加速度，保持匀速直线（牛顿第一定律）" : "按住地面任意处施力 · 当前静止";
      setReadoutThrottled(msg);
    } else if (m === "pid") {
      const target = 0.72;
      const s = sim.current.pid;
      const g = 2.0;
      const e = target - s.z;
      s.ie = Math.max(-1.5, Math.min(1.5, s.ie + e * dt));
      const uo = u.kp * e + u.ki * s.ie + u.kd * -s.v;
      const thrust = Math.max(0.25, Math.min(1.9, 1 + uo));
      let a = (thrust - 1) * g;
      const sinceGust = s.t - s.gustT;
      if (sinceGust < 0.7) a += s.gust * (1 - sinceGust / 0.7);
      s.v += a * dt;
      s.z = Math.min(0.95, Math.max(0.02, s.z + s.v * dt));
      if (s.z <= 0.02) s.v = Math.max(0, s.v);
      if (s.z >= 0.95) s.v = Math.min(0, s.v);
      s.t += dt;
      s.hist.push({ t: s.t, z: s.z });
      const cutoff = s.t - 9;
      while (s.hist.length > 2 && s.hist[1].t < cutoff) s.hist.shift();

      const y = yOf(s.z);
      scene.setDrone({ position: { x: 0, y, z: 0 }, pitch: Math.max(-14, Math.min(14, s.v * 6)), roll: 0, yaw: 0,
        motors: [thrust, thrust, thrust, thrust] });
      scene.setTargetRing(yOf(target));
      scene.setArrow("thrust", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: { x: 0, y: 1, z: 0 }, len: 0.35 + thrust * 0.85 });
      scene.setArrow("gravity", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: { x: 0, y: -1, z: 0 }, len: 1.2, alpha: 0.55 });
      scene.setArrow("velocity", { dir: null, len: 0 });
      scene.setArrow("force", { dir: null, len: 0 });
      const settled = Math.abs(target - s.z) < 0.01 && Math.abs(s.v) < 0.03;
      setReadoutThrottled(settled ? "已到位并稳住 ✅" : `误差 e = ${((target - s.z) * 100).toFixed(0)}% · 追赶中${Math.abs(s.v) > 0.35 ? "（超调震荡）" : ""}`);

      // ---- 2D response strip ----
      const pc = plotRef.current;
      const pctx = pc?.getContext("2d");
      if (pc && pctx) {
        const w = pc.clientWidth, h = pc.clientHeight;
        if (w && pc.width !== Math.round(w * 2)) {
          pc.width = Math.round(w * 2);
          pc.height = Math.round(h * 2);
          pctx.setTransform(2, 0, 0, 2, 0, 0);
        }
        pctx.clearRect(0, 0, w, h);
        pctx.strokeStyle = INK.grid;
        pctx.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
          const yy = (h * i) / 5;
          pctx.beginPath(); pctx.moveTo(0, yy); pctx.lineTo(w, yy); pctx.stroke();
        }
        const yP = (z: number) => h - 4 - z * (h - 8);
        pctx.fillStyle = "rgba(251,191,36,0.10)";
        pctx.fillRect(0, yP(target + 0.03), w, yP(target - 0.03) - yP(target + 0.03));
        pctx.setLineDash([6, 4]);
        pctx.strokeStyle = "rgba(251,191,36,0.75)";
        pctx.beginPath(); pctx.moveTo(0, yP(target)); pctx.lineTo(w, yP(target)); pctx.stroke();
        pctx.setLineDash([]);
        if (s.gustT >= 0) {
          const gx = ((s.gustT - (s.t - 9)) / 9) * w;
          if (gx >= 0) {
            pctx.strokeStyle = "rgba(248,113,113,0.6)";
            pctx.beginPath(); pctx.moveTo(gx, 0); pctx.lineTo(gx, h); pctx.stroke();
            canvasLabel(pctx, "风", gx + 6, 10, INK.danger, 9, "left");
          }
        }
        pctx.strokeStyle = INK.thrust;
        pctx.lineWidth = 2;
        pctx.beginPath();
        const t0 = s.t - 9;
        s.hist.forEach((pt, i) => {
          const x = ((pt.t - t0) / 9) * w;
          if (i === 0) pctx.moveTo(x, yP(pt.z));
          else pctx.lineTo(x, yP(pt.z));
        });
        pctx.stroke();
      }
    } else {
      // mixer: kinematic hover showing mixed motors
      const t = performance.now() / 1000;
      const y = yOf(0.55 + Math.sin(t * 0.7) * 0.02);
      const raw = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) raw[j] += MIX[i][j] * u.wishes[i];
      const motors = raw.map((v) => Math.max(0, Math.min(1.6, u.wishes[0] + 0.45 * v))) as [number, number, number, number];
      scene.setDrone({ position: { x: 0, y, z: 0 }, pitch: 0, roll: 0, yaw: 0, motors });
      scene.setTargetRing(null);
      scene.setArrow("thrust", { origin: { x: 0, y: y - 0.05, z: 0 }, dir: { x: 0, y: 1, z: 0 }, len: 0.35 + u.wishes[0] * 0.85, alpha: 0.8 });
      scene.setArrow("gravity", { dir: null, len: 0 });
      scene.setArrow("velocity", { dir: null, len: 0 });
      scene.setArrow("force", { dir: null, len: 0 });
      setReadoutThrottled(`电机：${motors.map((v) => `${(v * 100) | 0}%`).join(" / ")}`);
    }

    scene.render(dt);
  });

  // Throttle readout updates to ~5 Hz (avoid re-render storms)
  const readoutRef = useRef({ last: 0, val: "" });
  function setReadoutThrottled(msg: string) {
    const now = performance.now();
    if (msg === readoutRef.current.val && now - readoutRef.current.last < 2000) return;
    if (now - readoutRef.current.last < 200) return;
    readoutRef.current = { last: now, val: msg };
    setReadout(msg);
  }

  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <div className="my-8 overflow-hidden rounded-xl border border-border-subtle bg-[#0b0d0c] select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-primary" />
          <span className="font-mono text-[11px] tracking-widest text-accent-primary uppercase">
            3D 沙盒 · 四旋翼无人机
          </span>
        </div>
        <span className="hidden sm:block font-mono text-[10px] text-text-faint">
          拖拽旋转 · 滚轮缩放
        </span>
      </div>

      {/* 3D canvas */}
      <div className="relative">
        <canvas
          ref={cvRef}
          className={`h-[380px] w-full touch-none bg-[#0b0d0c] ${mode === "force" ? "cursor-crosshair" : "cursor-grab"}`}
          onPointerDown={(e) => { if (mode === "force") { e.currentTarget.setPointerCapture(e.pointerId); setPointerForce(e, true); } }}
          onPointerMove={(e) => { if (mode === "force" && pointer.current.active) setPointerForce(e, true); }}
          onPointerUp={(e) => { if (mode === "force") setPointerForce(e, false); }}
          onPointerLeave={(e) => { if (mode === "force") setPointerForce(e, false); }}
        />
        {/* Live readout chip */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/10 bg-black/55 px-3 py-1.5 font-mono text-[11px] text-text-secondary backdrop-blur">
          {readout}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex flex-wrap gap-1.5 border-y border-white/10 bg-white/[0.02] px-4 py-2.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`rounded-md px-4 py-1.5 font-mono text-[11px] tracking-wide transition-colors cursor-pointer ${
              mode === m.key
                ? "border border-accent-primary/40 bg-accent-primary/15 text-accent-primary"
                : "border border-white/10 bg-white/5 text-text-muted hover:bg-white/10"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode controls */}
      <div className="px-4 py-4">
        {mode === "hover" && (
          <div className="flex flex-wrap items-end gap-5">
            <DemoSlider label="油门 Throttle" value={throttle} min={0} max={1.6} step={0.01}
              onChange={setThrottle} format={(v) => `${(v * 100) | 0}%`} />
            <div className="flex gap-2 pb-1">
              <DemoButton primary onClick={() => setThrottle(1)}>悬停 = 100%</DemoButton>
              <DemoButton onClick={() => (sim.current.hover = { z: 0.06, v: 0 })}>回地面</DemoButton>
            </div>
          </div>
        )}
        {mode === "attitude" && (
          <div className="flex flex-wrap items-end gap-5">
            <DemoSlider label="俯仰 Pitch" value={pitch} min={-30} max={30} step={1} onChange={setPitch} format={(v) => `${v | 0}°`} />
            <DemoSlider label="滚转 Roll" value={roll} min={-30} max={30} step={1} onChange={setRoll} format={(v) => `${v | 0}°`} />
            <DemoSlider label="偏航 Yaw" value={yaw} min={-2} max={2} step={0.1} onChange={setYaw}
              format={(v) => (v === 0 ? "0" : `${v > 0 ? "顺时针" : "逆时针"} ${Math.abs(v).toFixed(1)}`)} />
            <div className="flex gap-2 pb-1">
              <DemoButton primary onClick={() => setPitch(18)}>向前飞</DemoButton>
              <DemoButton onClick={() => { setPitch(0); setRoll(0); setYaw(0); }}>回正</DemoButton>
            </div>
          </div>
        )}
        {mode === "force" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-muted">
              按住地面任意处施加一个朝向该点的力；松手后动量保持（牛顿第一定律）。此页签下拖拽不再旋转相机，可用滚轮缩放。
            </p>
            <DemoButton onClick={() => {
              sim.current.force = { x: 0, z: 0, vx: 0, vz: 0, trailT: 0 };
              sceneRef.current?.clearTrail();
            }}>重置</DemoButton>
          </div>
        )}
        {mode === "pid" && (
          <>
            <canvas ref={plotRef} className="mb-4 h-24 w-full rounded-lg border border-white/10 bg-[#0b0d0c]" />
            <div className="flex flex-wrap items-end gap-5">
              <DemoSlider label="Kp 比例（现在）" value={kp} min={0} max={6} step={0.1} onChange={setKp} format={(v) => v.toFixed(1)} />
              <DemoSlider label="Ki 积分（过去）" value={ki} min={0} max={3} step={0.05} onChange={setKi} format={(v) => v.toFixed(2)} />
              <DemoSlider label="Kd 微分（未来）" value={kd} min={0} max={4} step={0.1} onChange={setKd} format={(v) => v.toFixed(1)} />
              <div className="flex flex-wrap gap-2 pb-1">
                <DemoButton primary onClick={() => { const s = sim.current.pid; s.gustT = s.t; s.gust = 1.6; }}>来一阵风 🌬</DemoButton>
                <DemoButton onClick={() => { sim.current.pid = { z: 0.12, v: 0, ie: 0, t: 0, gust: 0, gustT: -9, hist: [] }; }}>重跑</DemoButton>
                <DemoButton onClick={() => { setKp(2.2); setKi(0); setKd(0); }}>只有 P</DemoButton>
                <DemoButton onClick={() => { setKp(2.8); setKi(1.2); setKd(2.4); }}>教科书整定 ✨</DemoButton>
              </div>
            </div>
          </>
        )}
        {mode === "mixer" && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {["总距 Throttle", "滚转 Roll", "俯仰 Pitch", "偏航 Yaw"].map((n, i) => (
                <DemoSlider key={n} label={n} value={wishes[i]} min={i === 0 ? 0 : -1} max={i === 0 ? 1.6 : 1}
                  step={0.05} onChange={(v) => setWishes((w) => w.map((x, k) => (k === i ? v : x)))}
                  format={(v) => (i === 0 ? `${(v * 100) | 0}%` : v === 0 ? "0" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`)} />
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[260px] border-collapse font-mono text-[11px]">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left text-text-faint">愿望 ╲ 电机</th>
                    {MOTOR_NAMES.map((n) => <th key={n} className="px-2 py-1 text-center text-accent-secondary">{n}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MIX.map((row, i) => (
                    <tr key={i} className={wishes[i] !== 0 ? "" : "opacity-45"}>
                      <td className="px-2 py-1 whitespace-nowrap text-text-secondary">
                        {["Throttle", "Roll", "Pitch", "Yaw"][i]}
                      </td>
                      {row.map((sign, j) => {
                        const c = MIX[i][j] * wishes[i];
                        const lit = Math.abs(c) > 0.02;
                        return (
                          <td key={j} className="px-1 py-1 text-center">
                            <span className={`inline-flex h-6 w-10 items-center justify-center rounded border tabular-nums ${
                              !lit ? "border-white/10 text-text-faint"
                                : c > 0 ? "border-accent-primary/50 bg-accent-primary/15 text-accent-primary"
                                : "border-[#96c8ff]/50 bg-[#96c8ff]/10 text-[#96c8ff]"
                            }`}>
                              {sign > 0 ? "+" : "−"}{lit ? Math.abs(c).toFixed(2) : "·"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] leading-relaxed text-text-faint">
                绿=加转速，蓝=减转速。3D 里各电机的发光盘颜色实时对应：加速（绿）/减速（蓝）/维持（灰）。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer formula */}
      <div className="border-t border-white/5 px-4 py-2 font-mono text-[11px] text-text-faint">
        {activeMode.formula}
      </div>
    </div>
  );
}
