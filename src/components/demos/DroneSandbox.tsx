
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Circle, Compass, Crosshair, Gauge, MoveUpRight, Orbit, Pause, Play, RotateCcw, ScanLine, SlidersHorizontal } from "lucide-react";
import type { QuadScene, ViewPreset } from "./gl/quadScene";
import {
  GRAVITY, MAX_THRUST, ROTORS, STEP, hoverRpm, makeExperiment, makeFlightState, mixMotors, stepFlight,
  type Experiment, type FlightState, type SandboxMode, type Vec3,
} from "./droneSandboxLogic";
import "./droneSandbox.css";

const LESSONS = [
  { key: "hover", label: "悬停", icon: Circle, title: "推力如何平衡重力", hint: "从悬停转速开始，稍微提高四桨转速，观察垂直加速度。", formula: "T = kω² / aᵧ = (ΣT − mg) / m" },
  { key: "attitude", label: "姿态", icon: Orbit, title: "倾斜如何产生水平力", hint: "调整俯仰和滚转，再关闭高度补偿，比较竖直推力和重力。", formula: "Tᵧ = T cos θ / Tₕ = T sin θ" },
  { key: "force", label: "受力", icon: MoveUpRight, title: "力改变的是速度", hint: "在场景中点选方向施力。松开后，在无阻力时观察速度与轨迹。", formula: "a = F / m / Δv = ∫ a dt" },
  { key: "pid", label: "PID", icon: Gauge, title: "反馈如何把高度拉回", hint: "保留持续下扰并调整 Kᵢ，观察目标线与实测曲线的差距。", formula: "T = mg + Kₚe + Kᵢ∫e dt − Kᴅvᵧ" },
  { key: "mixer", label: "混控", icon: SlidersHorizontal, title: "四个电机如何共同施力", hint: "先只调偏航，比较两组对角旋翼。继续增大指令，观察单桨限幅。", formula: "τ = Σ(r × F + τ反) / ω ∝ √T" },
] as const;
const VIEW_BUTTONS = [
  { view: "orbit", icon: Compass, label: "透视" },
  { view: "top", icon: Crosshair, label: "俯视" },
  { view: "side", icon: ScanLine, label: "侧视" },
] as const;
const percent = (n: number) => Math.round(n * 100) + "%";
const number = (value: number, digits = 1) => (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits);
const speedFormat = (n: number) => number(n) + " m/s";
const forceFormat = (n: number) => number(n) + " N";
const angleFormat = (n: number) => n + "°";
const heightFormat = (n: number) => number(n, 2) + " m";

function snapshot(state: FlightState) {
  return {
    height: state.position[1],
    verticalSpeed: state.velocity[1],
    speed: Math.hypot(state.velocity[0], state.velocity[2]),
    acceleration: [...state.acceleration] as Vec3,
    thrust: state.thrust,
    vertical: state.verticalThrust,
    rpm: state.rpm,
    applied: Math.hypot(...state.applied),
  };
}

function drawChart(canvas: HTMLCanvasElement, state: FlightState) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const x = 21;
  const pad = 9;
  const t0 = Math.max(state.time - 12, 0);
  const toY = (value: number) => height - pad - 12 - value / 4.5 * (height - 2 * pad - 12);
  const toX = (time: number) => x + (time - t0) / 12 * (width - x - pad);
  ctx.font = "10px monospace";
  ctx.fillStyle = "#75695c";
  ctx.strokeStyle = "#e1dbcf";
  ctx.lineWidth = 1;
  for (const level of [0, 2, 4]) {
    const y = toY(level);
    ctx.fillText(level + "m", 0, y + 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
  ctx.fillText(number(t0, 0), x, height - 2);
  const endLabel = number(t0 + 12, 0) + " s";
  ctx.fillText(endLabel, width - pad - ctx.measureText(endLabel).width, height - 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, 0, width - x - pad, height - 12);
  ctx.clip();
  for (const [key, color] of [["target", "#bc633e"], ["height", "#087b64"]] as const) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = key === "height" ? 2 : 1.25;
    ctx.setLineDash(key === "target" ? [3, 3] : []);
    for (const [i, sample] of state.history.entries()) {
      const px = toX(sample.t);
      const py = toY(sample[key]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    const last = state.history.at(-1)!;
    if (key === "target") ctx.lineTo(width - pad, toY(last.target));
    ctx.stroke();
  }
  ctx.restore();
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="drone-lab__slider">
      <span><strong>{label}</strong><output>{format(value)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value}
        aria-valuetext={format(value)} onChange={(event) => onChange(event.target.valueAsNumber)} />
    </label>
  );
}

function Toggle({ children, checked, onChange }: { children: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="drone-lab__toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

type Session = { experiment: Experiment; flight: FlightState };

export default function DroneSandbox({ variant = "article" }: { variant?: "article" | "project" }) {
  const [experiment, setExperiment] = useState(() => makeExperiment("hover"));
  const [telemetry, setTelemetry] = useState(() => snapshot(makeFlightState(experiment)));
  const [running, setRunning] = useState(true);
  const [vectors, setVectors] = useState(true);
  const [aiming, setAiming] = useState(false);
  const [view, setView] = useState<ViewPreset>("orbit");
  const [webgl, setWebgl] = useState(true);
  const experimentRef = useRef<Session | null>(null);
  if (!experimentRef.current) experimentRef.current = { experiment, flight: makeFlightState(experiment) };
  const sessions = useRef<Partial<Record<SandboxMode, Session>>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<HTMLCanvasElement>(null);
  const markers = useRef<Array<HTMLSpanElement | null>>([]);
  const sceneRef = useRef<QuadScene | null>(null);
  const ui = useRef({ running, vectors, aiming, view });

  useEffect(() => {
    ui.current = { running, vectors, aiming, view };
  }, [running, vectors, aiming, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: QuadScene | null = null;
    let disposed = false;
    void import("./gl/quadScene").then(({ QuadScene }) => {
      if (disposed) return;
      scene = new QuadScene(canvas);
      scene.setView(ui.current.view);
      scene.setOrbitEnabled(!ui.current.aiming);
      sceneRef.current = scene;
    }).catch(() => {
      if (!disposed) setWebgl(false);
    });

    const contextLost = (event: Event) => {
      event.preventDefault();
      setWebgl(false);
    };
    const contextRestored = () => setWebgl(true);
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(canvas.closest(".drone-lab") ?? canvas);
    let frame = 0;
    let last = 0;
    let report = -Infinity;
    let accumulated = 0;

    const render = (now: number) => {
      const dt = last ? Math.min(0.075, (now - last) / 1000) : 0;
      last = now;
      const { flight, experiment } = experimentRef.current!;
      const active = visible && document.visibilityState === "visible";

      if (active) {
        if (ui.current.running) {
          accumulated += dt;
          while (accumulated >= STEP) {
            stepFlight(flight, experiment, STEP);
            accumulated -= STEP;
          }
        } else {
          accumulated = 0;
          if (experiment.mode === "mixer") stepFlight(flight, experiment, 0);
        }
        if (scene) {
          const points = scene.draw(flight, experiment, ui.current.running ? dt : 0, ui.current.vectors);
          if (experiment.mode === "mixer") {
            points.forEach(({ x, y }, i) => {
              const label = markers.current[i];
              if (label) label.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)";
            });
          }
        }
      }
      if (active && now - report > 85) {
        setTelemetry(snapshot(flight));
        if (plotRef.current) drawChart(plotRef.current, flight);
        report = now;
      }
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setOrbitEnabled(!aiming);
  }, [aiming]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  const mode = experiment.mode;
  const lesson = LESSONS.find((item) => item.key === mode)!;

  function change<K extends keyof Experiment>(key: K, value: Experiment[K]) {
    const session = experimentRef.current!;
    const updated = { ...session.experiment, [key]: value };
    session.experiment = updated;
    setExperiment(updated);
  }

  function selectMode(next: SandboxMode) {
    if (next === mode) return;
    sessions.current[mode] = experimentRef.current!;
    const saved = sessions.current[next];
    const options = saved?.experiment ?? makeExperiment(next);
    const session = saved ?? { experiment: options, flight: makeFlightState(options) };
    experimentRef.current = session;
    setExperiment(options);
    setTelemetry(snapshot(session.flight));
    setAiming(next === "force");
    setView(next === "force" || next === "mixer" ? "top" : "orbit");
  }

  function reset(useDefaults: boolean) {
    const options = useDefaults ? makeExperiment(mode) : experimentRef.current!.experiment;
    const flight = makeFlightState(options);
    experimentRef.current = { experiment: options, flight };
    setExperiment(options);
    setTelemetry(snapshot(flight));
    setRunning(true);
    if (plotRef.current) drawChart(plotRef.current, flight);
  }

  function pulse(direction: Vec3) {
    if (!direction[0] && !direction[2]) return;
    const { flight, experiment } = experimentRef.current!;
    flight.commandedForce = [direction[0] * experiment.force, 0, direction[2] * experiment.force];
    flight.forceUntil = flight.time + 0.8;
    setRunning(true);
  }

  function aim(event: PointerEvent<HTMLCanvasElement>) {
    if (!aiming || mode !== "force" || event.button !== 0 || !sceneRef.current) return;
    pulse(sceneRef.current.aimForce(event.clientX, event.clientY, experimentRef.current!.flight.position));
  }

  const mix = mode === "mixer" ? mixMotors(experiment.collective, experiment.mixRoll, experiment.mixPitch, experiment.mixYaw) : null;
  const weight = experiment.mass * GRAVITY;
  const tiltAcceleration = Math.hypot(telemetry.acceleration[0], telemetry.acceleration[2]);
  const data = mode === "attitude"
    ? [["总推力", forceFormat(telemetry.thrust)], ["竖直推力", forceFormat(telemetry.vertical)], ["水平加速度", number(tiltAcceleration) + " m/s²"]]
    : mode === "force"
    ? [["外力", forceFormat(telemetry.applied)], ["加速度", number(tiltAcceleration) + " m/s²"], ["水平速度", speedFormat(telemetry.speed)]]
    : mode === "pid"
    ? [["目标高度", heightFormat(experiment.target)], ["高度误差", heightFormat(experiment.target - telemetry.height)], ["机体推力", forceFormat(telemetry.thrust)]]
    : mix
    ? [["合推力", forceFormat(mix.thrust.reduce((sum, value) => sum + value, 0))], ["滚 / 俯力矩 · N·m", number(mix.rollTorque, 2) + " / " + number(mix.pitchTorque, 2)], ["偏航力矩", number(mix.yawTorque, 2) + " N·m"]]
    : [["合推力", forceFormat(telemetry.thrust)], ["重力", forceFormat(weight)], ["垂直加速度", number(telemetry.acceleration[1], 2) + " m/s²"]];

  const slider = (key: keyof Experiment, label: string, min: number, max: number, step: number, format = (value: number) => number(value)) =>
    <Slider label={label} value={Number(experiment[key])} min={min} max={max} step={step} format={format} onChange={(value) => change(key, value)} />;

  return (
    <section className={"drone-lab drone-lab--" + variant} aria-label="无人机基础原理交互沙盒">
      {variant === "article" && <div className="drone-lab__article-title">无人机基础原理 <span>3D 交互沙盒</span></div>}
      <div className="drone-lab__toolbar">
        <nav className="drone-lab__mode-nav" aria-label="飞行实验">
          {LESSONS.map(({ key, label, icon: Icon }, index) => (
            <button key={key} type="button" aria-label={"第 " + (index + 1) + " 课：" + label} aria-pressed={mode === key} aria-current={mode === key ? "step" : undefined}
              onClick={() => selectMode(key)}><Icon size={16} aria-hidden="true" />{label}</button>
          ))}
        </nav>
        <div className="drone-lab__actions">
          <button type="button" onClick={() => setRunning(!running)} aria-label={running ? "暂停仿真" : "继续仿真"} title={running ? "暂停仿真" : "继续仿真"}>
            {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}<span>{running ? "暂停" : "继续"}</span>
          </button>
          <button type="button" onClick={() => reset(true)} aria-label="重置实验" title="重置实验">
            <RotateCcw size={16} aria-hidden="true" /><span>重置</span>
          </button>
        </div>
      </div>

      <div className="drone-lab__workbench">
        <div className="drone-lab__observation">
          <div className="drone-lab__viewport">
            <canvas ref={canvasRef} className={aiming ? "is-aiming" : undefined} onPointerDown={aim} aria-label="四旋翼 3D 观测视窗" />
            {!webgl && <div className="drone-lab__fallback" role="status">当前设备无法显示 3D 视图。参数、力学读数和 PID 曲线仍可使用。</div>}
            <div className="drone-lab__hud" aria-label="当前读数">
              <span>{mode === "force" ? "水平速度" : mode === "attitude" || mix ? "合推力" : "当前高度"}</span>
              <strong>{mode === "force" ? speedFormat(telemetry.speed) : mode === "attitude" || mix ? forceFormat(mix ? mix.thrust.reduce((sum, value) => sum + value, 0) : telemetry.thrust) : heightFormat(telemetry.height)}</strong>
            </div>
            {webgl && mix && ROTORS.map(({ name }, i) => <span key={name}
              ref={(element) => { markers.current[i] = element; }}
              className="drone-lab__motor-marker" aria-hidden="true">{name}</span>)}
            <div className="drone-lab__viewport-footer">
              <span>{aiming ? "点选地面方向施力" : "拖拽旋转 · 滚轮或双指缩放"}</span>
              <div className="drone-lab__camera" aria-label="相机视角">
                {VIEW_BUTTONS.map(({ view: preset, label, icon: Icon }) => (
                  <button key={preset} type="button" aria-pressed={preset === view} title={label}
                    aria-label={label + "视角"} onClick={() => {
                      setView(preset);
                      if (preset === view) sceneRef.current?.setView(preset);
                    }}><Icon size={16} aria-hidden="true" /><span>{label}</span></button>
                ))}
              </div>
            </div>
          </div>
          <div className="drone-lab__telemetry" aria-label="飞行数据">
            {data.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </div>
        <aside className="drone-lab__inspector" aria-label={lesson.label + "实验参数"}>
          <div className="drone-lab__inspector-head">
            <h3>{lesson.title}</h3>
            <p>{lesson.hint}</p>
          </div>
          <div className="drone-lab__controls">
            {mode === "hover" && <>
              {slider("rpm", "旋翼目标转速", 0, 1, 0.002, percent)}
              {slider("mass", "机身质量", 0.6, 2.4, 0.05, (n) => number(n, 2) + " kg")}
              <button type="button" className="drone-lab__command" onClick={() => change("rpm", hoverRpm(experiment.mass))}>
                设为悬停转速 <span>{percent(hoverRpm(experiment.mass))}</span>
              </button>
              <div className="drone-lab__pair"><span>实际旋翼转速</span><strong>{percent(telemetry.rpm)}</strong></div>
            </>}
            {mode === "attitude" && <>
              {slider("pitch", "俯仰", -35, 35, 1, angleFormat)}
              {slider("roll", "滚转", -35, 35, 1, angleFormat)}
              {slider("yaw", "航向", -180, 180, 1, angleFormat)}
              <Toggle checked={experiment.compensate} onChange={(value) => change("compensate", value)}>补偿竖直推力</Toggle>
              <div className="drone-lab__pair"><span>重力</span><strong>{forceFormat(weight)}</strong></div>
            </>}
            {mode === "force" && <>
              {slider("force", "施力大小", 0.5, 7, 0.1, forceFormat)}
              {slider("mass", "机身质量", 0.6, 2.4, 0.05, (n) => number(n, 2) + " kg")}
              <Toggle checked={experiment.drag} onChange={(value) => change("drag", value)}>开启空气阻力</Toggle>
              <button type="button" className="drone-lab__command" onClick={() => pulse([1, 0, 0])}>向右施力 <span>0.8 s</span></button>
              {webgl && <button type="button" className="drone-lab__command drone-lab__command--outline" onClick={() => setAiming(!aiming)}>
                {aiming ? "切换为视角旋转" : "切换为点选施力"}
              </button>}
            </>}
            {mode === "pid" && <>
              <div className="drone-lab__chart">
                <div><span><i />实际高度</span><span><i />目标高度</span></div>
                <canvas ref={plotRef} aria-label="最近 12 秒的高度响应曲线" />
              </div>
              {slider("target", "目标高度", 0.8, 3.7, 0.1, heightFormat)}
              <div className="drone-lab__gains">
                {slider("kp", "Kₚ 比例", 0, 12, 0.2)}
                {slider("ki", "Kᵢ 积分", 0, 4, 0.1)}
                {slider("kd", "Kᴅ 微分", 0, 8, 0.2)}
              </div>
              <Toggle checked={experiment.bias} onChange={(value) => change("bias", value)}>持续下扰 1.8 N</Toggle>
              <button type="button" className="drone-lab__command" onClick={() => {
                const flight = experimentRef.current!.flight;
                flight.gustUntil = flight.time + 0.45;
                setRunning(true);
              }}>施加阵风 <span>0.45 s</span></button>
              <button type="button" className="drone-lab__command drone-lab__command--outline" onClick={() => reset(false)}>重跑当前参数</button>
            </>}
            {mix && <>
              {slider("collective", "总距", 0, 1, 0.01, percent)}
              <div className="drone-lab__gains">
                {slider("mixRoll", "滚转", -0.6, 0.6, 0.01, percent)}
                {slider("mixPitch", "俯仰", -0.6, 0.6, 0.01, percent)}
                {slider("mixYaw", "偏航", -0.6, 0.6, 0.01, percent)}
              </div>
              <div className="drone-lab__motors" aria-label="各桨推力">
                {ROTORS.map(({ name, spin }, i) => {
                  const clipped = mix.raw[i] < 0 || mix.raw[i] > 1;
                  return <div key={name} className={clipped ? "is-clipped" : undefined}>
                    <strong>{name} <span>{spin > 0 ? "↻" : "↺"}</span></strong>
                    <progress max={MAX_THRUST} value={mix.thrust[i]} aria-label={name + " 推力"} />
                    <output>{clipped ? "限幅 · " : ""}{forceFormat(mix.thrust[i])}</output>
                  </div>;
                })}
              </div>
            </>}
          </div>
          <div className="drone-lab__reference">
            <code>{lesson.formula}</code>
            <div>
              {mode === "attitude" || mix ? <span className="drone-lab__rig">机体定点展示</span> : null}
              <Toggle checked={vectors} onChange={setVectors}>显示向量</Toggle>
            </div>
            {vectors && mode !== "mixer" && <div className="drone-lab__legend">
              <span className="is-thrust"><i />推力</span><span className="is-gravity"><i />重力</span>
              {(mode === "force" || mode === "pid") && <span className="is-force"><i />外力</span>}
              {mode === "force" && <span className="is-velocity"><i />速度</span>}
            </div>}
          </div>
        </aside>
      </div>
    </section>
  );
}
