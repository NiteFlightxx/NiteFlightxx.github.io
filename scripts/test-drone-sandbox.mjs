
import assert from "node:assert/strict";
import {
  GRAVITY, MAX_THRUST, STEP, hoverRpm, makeExperiment, makeFlightState, mixMotors, stepFlight, thrustDirection,
} from "../src/components/demos/droneSandboxLogic.ts";

function run(experiment, state, seconds) {
  for (let i = 0; i < seconds / STEP; i++) stepFlight(state, experiment, STEP);
}

function near(actual, expected, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " is outside tolerance of " + expected);
}

const hover = makeExperiment("hover");
const hoverState = makeFlightState(hover);
run(hover, hoverState, 2);
near(hoverState.thrust, hover.mass * GRAVITY);
near(hoverState.velocity[1], 0);

hover.rpm = 0.8;
stepFlight(hoverState, hover, STEP);
assert.ok(hoverState.rpm < hover.rpm && hoverState.acceleration[1] > 0, "motor speed gradually approaches the target");
near(hoverRpm(2.4) ** 2 * 4 * MAX_THRUST, 2.4 * GRAVITY);

const attitude = makeExperiment("attitude");
const tiltState = makeFlightState(attitude);
run(attitude, tiltState, 1);
near(tiltState.verticalThrust, attitude.mass * GRAVITY);
near(Math.abs(tiltState.acceleration[2]), GRAVITY * Math.tan(attitude.pitch * Math.PI / 180));
assert.ok(thrustDirection(0, 18, 0)[0] > 0.30);
assert.ok(thrustDirection(18, 0, 0)[2] < -0.30);
near(Math.hypot(...thrustDirection(29, -19, 72)), 1);
attitude.compensate = false;
run(attitude, tiltState, 2);
assert.ok(tiltState.verticalThrust < attitude.mass * GRAVITY);

const force = makeExperiment("force");
const forceState = makeFlightState(force);
forceState.commandedForce = [3.6, 0, 0];
forceState.forceUntil = 0.8;
run(force, forceState, 1);
near(forceState.velocity[0], 2.4);
near(forceState.acceleration[0], 0);
run(force, forceState, 1);
near(forceState.velocity[0], 2.4);
force.drag = true;
run(force, forceState, 1);
assert.ok(forceState.velocity[0] < 2.4);

const pid = makeExperiment("pid");
pid.ki = 0;
const pdState = makeFlightState(pid);
run(pid, pdState, 18);
near(pid.target - pdState.position[1], 1.8 / pid.kp, 0.01);
pid.ki = 2;
const pidState = makeFlightState(pid);
run(pid, pidState, 18);
near(pidState.position[1], pid.target, 0.03);
assert.ok(pidState.history.length <= 12 / 0.045 + 2);

const pureYaw = mixMotors(0.5, 0, 0, 0.2);
near(pureYaw.thrust.reduce((total, thrust) => total + thrust, 0), 2 * MAX_THRUST);
near(pureYaw.rollTorque, 0);
near(pureYaw.pitchTorque, 0);
assert.ok(pureYaw.yawTorque > 0);
const saturated = mixMotors(0.9, 0, 0, 0.6);
assert.ok(saturated.raw.some((value) => value > 1));
assert.ok(saturated.thrust.every((value) => value >= 0 && value <= MAX_THRUST));

console.log("Drone sandbox: hover equilibrium, thrust direction, inertia, PID recovery and mixer saturation passed.");
