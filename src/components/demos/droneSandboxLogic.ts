export type SandboxMode = "hover" | "attitude" | "force" | "pid" | "mixer";

export const MODE_LESSONS: Array<{ key: SandboxMode; title: string; short: string; observe: string; action: string }> = [
  { key: "hover", title: "悬停", short: "推力对抗重力", observe: "观察绿色推力与灰色重力的长度", action: "把油门调到 100%，让两根箭头接近等长" },
  { key: "attitude", title: "姿态", short: "倾斜才会移动", observe: "观察机身倾斜后推力箭头出现水平分量", action: "把俯仰推到 18°，看无人机向前倾" },
  { key: "force", title: "受力", short: "力改变速度", observe: "观察施力方向与蓝色速度轨迹", action: "按住地面任意位置施力，然后松手" },
  { key: "pid", title: "PID", short: "反馈让它听话", observe: "观察高度曲线如何追上黄色目标线", action: "先点“只有 P”，再逐步加入 Ki 与 Kd" },
  { key: "mixer", title: "混控", short: "愿望变成转速", observe: "观察矩阵符号如何改变四个电机", action: "拖动 Roll 或 Pitch，看绿/蓝电机反馈" },
];

export function getModeProgress(mode: SandboxMode) {
  const index = MODE_LESSONS.findIndex((lesson) => lesson.key === mode);
  return { index: index < 0 ? 1 : index + 1, total: MODE_LESSONS.length };
}

export function getNextMode(mode: SandboxMode): SandboxMode | null {
  const index = MODE_LESSONS.findIndex((lesson) => lesson.key === mode);
  return MODE_LESSONS[index + 1]?.key ?? null;
}

export function getRenderDpr(devicePixelRatio: number, reducedMotion: boolean) {
  const base = Math.min(1.75, Math.max(1, devicePixelRatio || 1));
  return reducedMotion ? Math.min(1.25, base) : base;
}

export function getAttitudeThrustDirection(pitch: number, roll: number, yaw = 0) {
  const p = pitch * Math.PI / 180;
  const r = roll * Math.PI / 180;
  const y = yaw * Math.PI / 180;
  const x2 = Math.sin(r) * Math.cos(p);
  const y2 = Math.cos(r) * Math.cos(p);
  const z2 = -Math.sin(p);
  return {
    x: x2 * Math.cos(y) - z2 * Math.sin(y),
    y: y2,
    z: x2 * Math.sin(y) + z2 * Math.cos(y),
  };
}

export type MotorVisualState = "active" | "braking" | "neutral";

export function getMotorVisualState(speed: number): MotorVisualState {
  if (speed > 1.02) return "active";
  if (speed < 0.98) return "braking";
  return "neutral";
}

export function getDigitalTwinVisualProfile() {
  return {
    gridFadeStart: 2.8,
    gridFadeEnd: 8.5,
    ghostAlpha: 0.18,
    calibrationRadius: 1.65,
  } as const;
}
