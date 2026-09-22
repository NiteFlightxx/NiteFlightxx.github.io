import assert from "node:assert/strict";
import {
  MODE_LESSONS,
  getModeProgress,
  getNextMode,
  getRenderDpr,
  getAttitudeThrustDirection,
  getMotorVisualState,
  getDigitalTwinVisualProfile,
} from "../src/components/demos/droneSandboxLogic.ts";

assert.deepEqual(
  getModeProgress("hover"),
  { index: 1, total: 5 },
  "hover should be the first lesson",
);
assert.equal(getNextMode("pid"), "mixer", "PID should advance to mixer");
assert.equal(getNextMode("mixer"), null, "mixer should be the final lesson");
assert.equal(MODE_LESSONS[2].key, "force", "lesson order should match the article");
assert.equal(getRenderDpr(3, false), 1.75, "high-DPI displays should cap render scale");
assert.equal(getRenderDpr(3, true), 1.25, "reduced motion should use a lower render scale");
assert.ok(getAttitudeThrustDirection(18, 0, 0).z < -0.3, "nose-down pitch should push toward the nose (-Z)");
assert.ok(getAttitudeThrustDirection(0, 18, 0).x > 0.3, "right-down roll should push toward +X");
assert.equal(getMotorVisualState(1.2), "active", "faster motors should use the active visual state");
assert.equal(getMotorVisualState(0.8), "braking", "slower motors should use the braking visual state");
assert.equal(getMotorVisualState(1.0), "neutral", "hover motors should use the neutral visual state");
assert.deepEqual(
  getDigitalTwinVisualProfile(),
  { gridFadeStart: 2.8, gridFadeEnd: 8.5, ghostAlpha: 0.18, calibrationRadius: 1.65 },
  "the digital-twin visual profile should keep the viewport restrained",
);

console.log("drone sandbox logic: ok");
