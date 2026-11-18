
export type SandboxMode = "hover" | "attitude" | "force" | "pid" | "mixer";
export type Vec3 = [number, number, number];
export type Motors = [number, number, number, number];

export const GRAVITY = 9.81;
export const MAX_THRUST = 7;
export const STEP = 1 / 120;
export const ARM = 0.46;
const MOTOR_TAU = 0.15;
const REACTION_ARM = 0.028;
const MIN_HEIGHT = 0.15;
const MAX_HEIGHT = 4.4;

export const ROTORS = [
  { name: "M1", position: [-ARM, 0, -ARM], spin: 1 },
  { name: "M2", position: [ARM, 0, -ARM], spin: -1 },
  { name: "M3", position: [ARM, 0, ARM], spin: 1 },
  { name: "M4", position: [-ARM, 0, ARM], spin: -1 },
] as const;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function hoverRpm(mass: number) {
  return Math.sqrt(mass * GRAVITY / (4 * MAX_THRUST));
}

export function thrustDirection(pitch: number, roll: number, yaw: number): Vec3 {
  const p = pitch * Math.PI / 180;
  const r = roll * Math.PI / 180;
  const y = yaw * Math.PI / 180;
  const x = Math.sin(r);
  const z = -Math.sin(p) * Math.cos(r);
  return [Math.cos(y) * x + Math.sin(y) * z, Math.cos(p) * Math.cos(r), -Math.sin(y) * x + Math.cos(y) * z];
}

export function mixMotors(collective: number, roll: number, pitch: number, yaw: number) {
  const raw = ROTORS.map(({ position: [x, , z], spin }) =>
    collective + Math.sign(x) * roll - Math.sign(z) * pitch - spin * yaw,
  ) as Motors;
  const thrust = raw.map((value) => clamp(value, 0, 1) * MAX_THRUST) as Motors;
  let rollTorque = 0;
  let pitchTorque = 0;
  let yawTorque = 0;
  ROTORS.forEach(({ position: [x, , z], spin }, i) => {
    rollTorque += x * thrust[i];
    pitchTorque -= z * thrust[i];
    yawTorque -= spin * REACTION_ARM * thrust[i];
  });
  return { raw, thrust, rollTorque, pitchTorque, yawTorque };
}

export function makeExperiment(mode: SandboxMode) {
  return {
    mode,
    mass: 1.2,
    rpm: hoverRpm(1.2),
    pitch: 24,
    roll: 0,
    yaw: 0,
    compensate: true,
    force: 3.6,
    drag: false,
    target: 2.2,
    kp: 6,
    ki: 2,
    kd: 5,
    bias: true,
    collective: 0.50,
    mixRoll: 0,
    mixPitch: 0,
    mixYaw: 0.16,
  };
}

export type Experiment = ReturnType<typeof makeExperiment>;

export function makeFlightState(experiment: Experiment) {
  const { mode, mass, pitch, roll, yaw, compensate, rpm, target } = experiment;
  const direction = thrustDirection(pitch, roll, yaw);
  const initialRpm = mode === "attitude"
    ? Math.min(1, hoverRpm(mass) / Math.sqrt(compensate ? direction[1] : 1))
    : mode === "hover" ? rpm : hoverRpm(mass);
  return {
    position: [0, mode === "pid" ? 0.5 : 1.48, 0] as Vec3,
    velocity: [0, 0, 0] as Vec3,
    acceleration: [0, 0, 0] as Vec3,
    pose: mode === "attitude" ? [pitch, roll, yaw] as Vec3 : [0, 0, 0] as Vec3,
    direction: mode === "attitude" ? direction : [0, 1, 0] as Vec3,
    rpm: initialRpm,
    motors: [initialRpm, initialRpm, initialRpm, initialRpm] as Motors,
    thrust: 4 * MAX_THRUST * initialRpm ** 2,
    verticalThrust: 4 * MAX_THRUST * initialRpm ** 2,
    applied: [0, 0, 0] as Vec3,
    commandedForce: [0, 0, 0] as Vec3,
    forceUntil: 0,
    gustUntil: 0,
    time: 0,
    integral: 0,
    history: [{ t: 0, height: 0.5, target }],
  };
}

export type FlightState = ReturnType<typeof makeFlightState>;

export function stepFlight(state: FlightState, experiment: Experiment, dt: number) {
  const { mode, mass } = experiment;
  const weight = mass * GRAVITY;
  state.time += dt;
  if (mode === "mixer") {
    const { thrust } = mixMotors(experiment.collective, experiment.mixRoll, experiment.mixPitch, experiment.mixYaw);
    for (let i = 0; i < 4; i++) state.motors[i] = Math.sqrt(thrust[i] / MAX_THRUST);
    state.thrust = thrust.reduce((sum, value) => sum + value, 0);
    state.verticalThrust = state.thrust;
    return;
  }

  if (mode === "force") {
    const released = state.time > state.forceUntil + 1e-9;
    const drag = experiment.drag ? 0.55 : 0;
    for (const axis of [0, 2] as const) {
      state.applied[axis] = released ? 0 : state.commandedForce[axis];
      state.acceleration[axis] = (state.applied[axis] - drag * state.velocity[axis]) / mass;
      state.velocity[axis] += state.acceleration[axis] * dt;
      state.position[axis] += state.velocity[axis] * dt;
    }
    state.thrust = state.verticalThrust = weight;
    state.motors.fill(hoverRpm(mass));
    return;
  }

  let targetRpm = experiment.rpm;
  let external = 0;
  if (mode === "attitude") {
    const angleAlpha = 1 - Math.exp(-dt / 0.12);
    state.pose[0] += (experiment.pitch - state.pose[0]) * angleAlpha;
    state.pose[1] += (experiment.roll - state.pose[1]) * angleAlpha;
    const yawError = ((experiment.yaw - state.pose[2] + 540) % 360) - 180;
    state.pose[2] = ((state.pose[2] + yawError * angleAlpha + 540) % 360) - 180;
    state.direction = thrustDirection(...state.pose);
    targetRpm = Math.min(1, hoverRpm(mass) / Math.sqrt(experiment.compensate ? state.direction[1] : 1));
  }

  if (mode === "pid") {
    const error = experiment.target - state.position[1];
    const candidateIntegral = clamp(state.integral + error * dt, -4, 4);
    const feedback = weight + experiment.kp * error - experiment.kd * state.velocity[1];
    const requested = feedback + experiment.ki * candidateIntegral;
    if (!(requested > 4 * MAX_THRUST && error > 0) && !(requested < 0 && error < 0)) {
      state.integral = candidateIntegral;
    }
    targetRpm = Math.sqrt(clamp((feedback + experiment.ki * state.integral) / (4 * MAX_THRUST), 0, 1));
    external = (experiment.bias ? -1.8 : 0) + (state.time < state.gustUntil ? -6 : 0);
    state.applied[1] = external;
  }

  state.rpm += (targetRpm - state.rpm) * (1 - Math.exp(-dt / MOTOR_TAU));
  state.motors.fill(state.rpm);
  state.thrust = 4 * MAX_THRUST * state.rpm ** 2;
  state.verticalThrust = state.thrust * state.direction[1];
  state.acceleration[0] = state.thrust * state.direction[0] / mass;
  state.acceleration[1] = (state.verticalThrust - weight + external) / mass;
  state.acceleration[2] = state.thrust * state.direction[2] / mass;

  if (mode !== "attitude") {
    const verticalDrag = mode === "pid" ? 0.65 : 0;
    state.velocity[1] += (state.acceleration[1] - verticalDrag * state.velocity[1] / mass) * dt;
    const height = state.position[1] + state.velocity[1] * dt;
    state.position[1] = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
    if (height !== state.position[1]) {
      state.velocity[1] = 0;
      state.acceleration[1] = 0;
    }
  }

  if (mode === "pid" && state.time - state.history.at(-1)!.t >= 0.045) {
    state.history.push({ t: state.time, height: state.position[1], target: experiment.target });
    while (state.history.length > 1 && state.history[1].t < state.time - 12) state.history.shift();
  }
}
