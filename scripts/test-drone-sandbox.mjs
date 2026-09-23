import assert from "node:assert/strict";
import {
  MODE_LESSONS,
  getModeProgress,
  getNextMode,
  getRenderDpr,
  getAttitudeThrustDirection,
  getMotorVisualState,
  getDigitalTwinVisualProfile,
  getProjectViewportHeight,
  getProjectCameraProfile,
  getProjectCameraRadius,
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
  {
    gridFadeStart: 3.4,
    gridFadeEnd: 11,
    ghostAlpha: 0.13,
    calibrationRadius: 2.2,
    palette: {
      graphite: "#060606",
      text: "#f3f4f6",
      lime: "#bcfd49",
      ice: "#96c8ff",
      amber: "#fbbf24",
      ready: "#bcfd49",
    },
  },
  "the showcase profile should use the website semantic color tokens",
);
assert.equal(getProjectViewportHeight(1216, 2529), 760, "desktop viewport should use a large cinematic stage");
assert.equal(getProjectViewportHeight(844, 390), 410, "mobile viewport should remain compact enough for controls");
assert.deepEqual(
  getProjectCameraProfile(),
  { radius: 4.45, phi: 1.02, theta: 0.72, targetY: 1.1 },
  "the project camera should frame the drone as the hero object",
);
assert.equal(getProjectCameraRadius(1.88), 4.45, "wide stages should keep the cinematic hero framing");
assert.equal(getProjectCameraRadius(0.95), 5.95, "portrait stages should pull back to keep all four rotors visible");

console.log("drone sandbox logic: ok");
