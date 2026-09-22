/**
 * OGL-based 3D quadcopter scene for the unified drone sandbox.
 *
 * One instance owns the whole WebGL context: drone model (hull, booms,
 * motors, spinning rotors with per-motor glow discs), procedural grid
 * ground, 3D arrows, a fading trail dot pool, and a small hand-rolled
 * orbit controller (drag-rotate / wheel-zoom / animated view presets).
 * The React sandbox drives it via setDrone/setArrow/... then render(dt).
 *
 * Axes: +X right, +Y up, +Z toward the default camera; drone nose −Z.
 * Every colored mesh gets its own Program instance (OGL programs share
 * uniform values between meshes, so a shared program would couple all
 * motors' glow colors — a factory per mesh avoids that).
 */
import {
  Camera, Color, Cylinder, Box, Mesh, Program, Renderer, Transform,
  Vec3, Quat, Plane, Mat4, Torus,
} from "ogl";
import type { OGLRenderingContext } from "ogl";
import { getDigitalTwinVisualProfile, getMotorVisualState, getRenderDpr } from "../droneSandboxLogic";

type Vec3Like = { x: number; y: number; z: number };

const LAMBERT_VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vViewPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const LAMBERT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 L = normalize(vec3(0.55, 0.8, 0.35));
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    float diff = max(dot(N, L), 0.0);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0);
    vec3 col = uColor * (0.30 + 0.72 * diff) + vec3(0.16, 0.22, 0.18) * rim + vec3(0.18) * spec;
    gl_FragColor = vec4(col, 1.0);
  }
`;
const FLAT_VERT = /* glsl */ `
  attribute vec3 position;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FLAT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAlpha;
  void main() {
    gl_FragColor = vec4(uColor, uAlpha);
  }
`;
const GHOST_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 1.8);
    float face = 0.22 + 0.45 * max(dot(N, normalize(vec3(0.4, 0.8, 0.45))), 0.0);
    vec3 col = uColor * (face + rim * 0.85);
    gl_FragColor = vec4(col, uAlpha * (0.55 + rim * 0.9));
  }
`;
const GROUND_VERT = /* glsl */ `
  attribute vec3 position;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const GROUND_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  void main() {
    float g = abs(fract(vWorld.x) - 0.5);
    float gx = 1.0 - smoothstep(0.44, 0.5, g);
    float gz = 1.0 - smoothstep(0.44, 0.5, abs(fract(vWorld.z) - 0.5));
    float line = max(gx, gz);
    float d = length(vWorld.xz);
    float fade = 1.0 - smoothstep(2.8, 8.5, d);
    float vignette = 1.0 - smoothstep(1.5, 7.8, d);
    vec3 col = mix(vec3(0.025, 0.031, 0.031), vec3(0.085, 0.105, 0.098), line * fade);
    col += vec3(0.012, 0.018, 0.021) * vignette;
    float axis = 1.0 - smoothstep(0.012, 0.026, min(abs(vWorld.x), abs(vWorld.z)));
    col = mix(col, vec3(0.24, 0.31, 0.26), axis * fade * 0.42);
    float ring2 = smoothstep(0.035, 0.02, abs(d - 2.0));
    col = mix(col, vec3(0.12, 0.18, 0.16), ring2 * fade * 0.58);
    float ring = smoothstep(0.035, 0.022, abs(d - 1.0));
    col = mix(col, vec3(0.42, 0.58, 0.28), ring * fade * 0.24);
    float calibration = smoothstep(0.018, 0.008, abs(d - 1.65));
    col = mix(col, vec3(0.34, 0.52, 0.24), calibration * fade * 0.48);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface DroneState {
  position: Vec3Like;
  /** Degrees. Pitch +nose-up, roll +right-down, yaw +clockwise from above. */
  pitch: number;
  roll: number;
  yaw: number;
  /** Normalized motor speeds [FL, FR, RR, RL]; 1.0 = hover. */
  motors: [number, number, number, number];
}

export interface ArrowSpec {
  origin?: Vec3Like;
  dir: Vec3Like | null;
  len: number;
  color?: string;
  alpha?: number;
}

export type ArrowName = "thrust" | "gravity" | "velocity" | "force";
export type ViewPreset = "follow" | "tilt" | "top" | "side";

interface ViewSpec {
  radius: number; phi: number; theta: number; targetY: number;
}
const VIEWS: Record<ViewPreset, ViewSpec> = {
  follow: { radius: 5.4, phi: 1.10, theta: 0.66, targetY: 1.15 },
  tilt:   { radius: 5.0, phi: 1.00, theta: 0.80, targetY: 1.25 },
  top:    { radius: 7.0, phi: 0.55, theta: 0.30, targetY: 0.35 },
  side:   { radius: 5.6, phi: 1.40, theta: 1.60, targetY: 1.25 },
};

const MOTOR_XZ: Array<[number, number]> = [
  [-1, -1], [1, -1], [1, 1], [-1, 1], // FL, FR, RR, RL
];

/** Compact orbit controller with animated presets (drag rotate, wheel zoom). */
class OrbitLite {
  azimuth = 0.66;
  polar = 1.10;
  distance = 5.4;
  target = new Vec3(0, 1.15, 0);
  /** When false (force-application mode) drags don't rotate the camera. */
  rotateEnabled = true;
  private azT = 0.66;
  private poT = 1.10;
  private diT = 5.4;
  private tyT = 1.15;
  private dragId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement, private camera: Camera) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private onDown = (e: PointerEvent) => {
    this.dragId = e.pointerId;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.rotateEnabled) this.canvas.setPointerCapture(e.pointerId);
  };
  private onMove = (e: PointerEvent) => {
    if (this.dragId !== e.pointerId || !this.rotateEnabled) return;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    this.azT -= dx * 0.008;
    this.poT = Math.min(Math.PI / 2 - 0.04, Math.max(0.15, this.poT - dy * 0.006));
  };
  private onUp = (e: PointerEvent) => {
    if (this.dragId === e.pointerId) this.dragId = null;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.diT = Math.min(12, Math.max(2.2, this.diT * (1 + Math.sign(e.deltaY) * 0.09)));
  };

  setView(p: ViewSpec) {
    this.azT = p.theta;
    this.poT = p.phi;
    this.diT = p.radius;
    this.tyT = p.targetY;
  }

  update(k: number) {
    this.azimuth += (this.azT - this.azimuth) * k;
    this.polar += (this.poT - this.polar) * k;
    this.distance += (this.diT - this.distance) * k;
    const ty = this.target.y + (this.tyT - this.target.y) * k;
    this.target.set(0, ty, 0);
    const sp = Math.sin(this.polar);
    this.camera.position.set(
      this.distance * sp * Math.sin(this.azimuth),
      this.distance * Math.cos(this.polar),
      this.distance * sp * Math.cos(this.azimuth),
    ).add(this.target);
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}

export class QuadScene {
  readonly canvas: HTMLCanvasElement;
  private gl: OGLRenderingContext;
  private renderer: Renderer;
  private camera: Camera;
  private controls: OrbitLite;
  private scene = new Transform();

  private droneRoot = new Transform();
  private droneBody = new Transform();
  private twinRoot = new Transform();
  private rotorDiscs: Array<{ node: Transform; marker: Mesh }> = [];
  private glowDiscs: Mesh[] = [];
  private motorRings: Mesh[] = [];
  private calibrationRings: Mesh[] = [];

  private arrows: Record<ArrowName, { group: Transform; shaft: Mesh; head: Mesh; program: Program }>;
  private targetRing: Mesh;

  private trail: Array<{ node: Transform; mesh: Mesh; program: Program; age: number }> = [];
  private trailNext = 0;

  private rotorSpin = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.renderer = new Renderer({ canvas, alpha: true, antialias: true, dpr: getRenderDpr(window.devicePixelRatio, reducedMotion) });
    this.gl = this.renderer.gl;
    // OGL has no setClearColor wrapper; the raw GL call is the documented way.
    this.gl.clearColor(0.043, 0.051, 0.047, 1);

    this.camera = new Camera(this.gl, { fov: 42, near: 0.1, far: 60 });
    this.controls = new OrbitLite(canvas, this.camera);
    // The OGL constructor ran setSize(300,150) which wrote inline px styles;
    // drop them so the CSS class (w-full h-[380px]) owns the display size.
    canvas.style.width = "";
    canvas.style.height = "";

    this.buildGround();
    this.buildCalibrationSpace();
    this.buildDrone();
    this.arrows = {
      thrust: this.buildArrow("#bcfd49"),
      gravity: this.buildArrow("#8b93a1"),
      velocity: this.buildArrow("#96c8ff"),
      force: this.buildArrow("#fbbf24"),
    };
    this.targetRing = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, { radiusTop: 0.55, radiusBottom: 0.55, height: 0.014, radialSegments: 44 }),
      program: this.makeFlat("#fbbf24", 0.5),
    });
    this.targetRing.visible = false;
    this.scene.addChild(this.targetRing);

    for (let i = 0; i < 26; i++) {
      const node = new Transform();
      const mesh = new Mesh(this.gl, {
        geometry: new Cylinder(this.gl, { radiusTop: 0.06, radiusBottom: 0.06, height: 0.02, radialSegments: 10 }),
        program: this.makeFlat("#96c8ff", 0.5),
      });
      mesh.visible = false;
      node.addChild(mesh);
      this.scene.addChild(node);
      this.trail.push({ node, mesh, program: mesh.program as Program, age: 0 });
    }

    this.scene.addChild(this.droneRoot);
    this.scene.addChild(this.twinRoot);
  }

  // ---- Program factories (one per mesh so uniforms stay independent) ----
  private makeLambert(color: string): Program {
    return new Program(this.gl, {
      vertex: LAMBERT_VERT, fragment: LAMBERT_FRAG,
      uniforms: { uColor: { value: new Color(color) } },
    });
  }
  private makeFlat(color: string, alpha: number): Program {
    return new Program(this.gl, {
      vertex: FLAT_VERT, fragment: FLAT_FRAG,
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: alpha } },
    });
  }
  private makeGhost(color: string, alpha: number): Program {
    return new Program(this.gl, {
      vertex: LAMBERT_VERT, fragment: GHOST_FRAG,
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new Color(color) }, uAlpha: { value: alpha } },
    });
  }

  private buildGround() {
    const ground = new Mesh(this.gl, {
      geometry: new Plane(this.gl, { width: 16, height: 16 }),
      program: new Program(this.gl, { vertex: GROUND_VERT, fragment: GROUND_FRAG }),
    });
    ground.rotation.x = -Math.PI / 2;
    this.scene.addChild(ground);
  }

  private buildCalibrationSpace() {
    const profile = getDigitalTwinVisualProfile();
    const ringGeometry = new Torus(this.gl, { radius: profile.calibrationRadius, tube: 0.009, radialSegments: 8, tubularSegments: 64 });
    [
      { radius: 1, color: "#789c5c", alpha: 0.26 },
      { radius: profile.calibrationRadius, color: "#bcfd49", alpha: 0.34 },
      { radius: 2.4, color: "#55766f", alpha: 0.18 },
    ].forEach(({ radius, color, alpha }) => {
      const ring = new Mesh(this.gl, {
        geometry: radius === profile.calibrationRadius ? ringGeometry : new Torus(this.gl, { radius, tube: 0.008, radialSegments: 8, tubularSegments: 64 }),
        program: this.makeFlat(color, alpha),
      });
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.018;
      this.scene.addChild(ring);
      this.calibrationRings.push(ring);
    });

    const axisGeometry = new Box(this.gl, { width: 0.012, height: 0.008, depth: 2.9 });
    const axis = new Mesh(this.gl, { geometry: axisGeometry, program: this.makeFlat("#bcfd49", 0.12) });
    axis.position.set(0, 0.02, 0);
    this.scene.addChild(axis);
    const cross = new Mesh(this.gl, { geometry: new Box(this.gl, { width: 2.9, height: 0.008, depth: 0.012 }), program: this.makeFlat("#96c8ff", 0.08) });
    cross.position.set(0, 0.021, 0);
    this.scene.addChild(cross);
  }

  private buildDrone() {
    this.droneRoot.addChild(this.droneBody);

    const armLen = 1.05;
    const boomGeo = new Box(this.gl, { width: armLen * 1.42, height: 0.065, depth: 0.075 });
    const hullGeo = new Cylinder(this.gl, { radiusTop: 0.34, radiusBottom: 0.43, height: 0.20, radialSegments: 6 });
    const noseGeo = new Box(this.gl, { width: 0.10, height: 0.09, depth: 0.18 });
    const motorGeo = new Cylinder(this.gl, { radiusTop: 0.10, radiusBottom: 0.125, height: 0.15, radialSegments: 20 });
    const discGeo = new Cylinder(this.gl, { radiusTop: 0.36, radiusBottom: 0.36, height: 0.012, radialSegments: 34 });
    const markerGeo = new Box(this.gl, { width: 0.68, height: 0.022, depth: 0.038 });
    const glowGeo = new Cylinder(this.gl, { radiusTop: 0.33, radiusBottom: 0.33, height: 0.02, radialSegments: 30 });
    const ringGeo = new Torus(this.gl, { radius: 0.105, tube: 0.014, radialSegments: 6, tubularSegments: 22 });

    const statusBeacon = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, { radiusTop: 0.075, radiusBottom: 0.075, height: 0.018, radialSegments: 18 }),
      program: this.makeFlat("#bcfd49", 0.9),
    });
    statusBeacon.position.set(0, 0.115, 0.08);
    this.droneBody.addChild(statusBeacon);

    const nose = new Mesh(this.gl, { geometry: noseGeo, program: this.makeLambert("#bcfd49") });
    nose.position.set(0, 0.005, -0.40);
    this.droneBody.addChild(nose);

    const hull = new Mesh(this.gl, { geometry: hullGeo, program: this.makeLambert("#47535b") });
    hull.scale.set(1, 1, 0.82);
    this.droneBody.addChild(hull);

    const canopy = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, { radiusTop: 0.26, radiusBottom: 0.31, height: 0.075, radialSegments: 6 }),
      program: this.makeLambert("#182126"),
    });
    canopy.scale.set(1, 1, 0.82);
    canopy.position.set(0, 0.135, -0.04);
    this.droneBody.addChild(canopy);

    const battery = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, { radiusTop: 0.28, radiusBottom: 0.34, height: 0.09, radialSegments: 6 }),
      program: this.makeLambert("#202b30"),
    });
    battery.scale.set(1, 1, 0.82);
    battery.position.set(0, -0.145, 0.04);
    this.droneBody.addChild(battery);

    const frontLight = new Mesh(this.gl, {
      geometry: new Box(this.gl, { width: 0.12, height: 0.028, depth: 0.028 }),
      program: this.makeFlat("#bcfd49", 0.9),
    });
    frontLight.position.set(0, 0.07, -0.46);
    this.droneBody.addChild(frontLight);

    [-0.22, 0.22].forEach((x) => {
      const skid = new Mesh(this.gl, {
        geometry: new Box(this.gl, { width: 0.04, height: 0.035, depth: 0.9 }),
        program: this.makeLambert("#69777c"),
      });
      skid.position.set(x, -0.37, 0.04);
      this.droneBody.addChild(skid);
      [-0.25, 0.3].forEach((z) => {
        const leg = new Mesh(this.gl, {
          geometry: new Box(this.gl, { width: 0.035, height: 0.30, depth: 0.035 }),
          program: this.makeLambert("#414d50"),
        });
        leg.position.set(x, -0.22, z);
        this.droneBody.addChild(leg);
      });
    });

    MOTOR_XZ.forEach(([mx, mz]) => {
      const boom = new Mesh(this.gl, { geometry: boomGeo, program: this.makeLambert("#2a313c") });
      boom.position.set((mx * armLen) / 2, 0, (mz * armLen) / 2);
      boom.rotation.y = -Math.atan2(mx, mz);
      this.droneBody.addChild(boom);

      const brace = new Mesh(this.gl, { geometry: new Box(this.gl, { width: armLen * 1.24, height: 0.025, depth: 0.12 }), program: this.makeLambert("#69777c") });
      brace.position.set((mx * armLen) / 2, 0.045, (mz * armLen) / 2);
      brace.rotation.y = -Math.atan2(mx, mz);
      this.droneBody.addChild(brace);

      const node = new Transform();
      node.position.set(mx * armLen, 0.06, mz * armLen);
      this.droneBody.addChild(node);

      const motor = new Mesh(this.gl, { geometry: motorGeo, program: this.makeLambert("#2a313c") });
      node.addChild(motor);

      const cap = new Mesh(this.gl, {
        geometry: new Cylinder(this.gl, { radiusTop: 0.12, radiusBottom: 0.12, height: 0.025, radialSegments: 22 }),
        program: this.makeLambert(mx === mz ? "#abc68b" : "#8798a9"),
      });
      cap.position.y = 0.088;
      node.addChild(cap);

      const ring = new Mesh(this.gl, { geometry: ringGeo, program: this.makeFlat("#6e8d52", 0.68) });
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.088;
      node.addChild(ring);
      this.motorRings.push(ring);

      const disc = new Transform();
      disc.position.y = 0.105;
      node.addChild(disc);
      const discMesh = new Mesh(this.gl, { geometry: discGeo, program: this.makeFlat("#8e9aaa", 0.22) });
      disc.addChild(discMesh);
      const marker = new Mesh(this.gl, { geometry: markerGeo, program: this.makeFlat("#d5dae2", 0.78) });
      disc.addChild(marker);
      const secondBlade = new Mesh(this.gl, { geometry: markerGeo, program: this.makeFlat("#d5dae2", 0.55) });
      secondBlade.rotation.y = Math.PI / 2;
      disc.addChild(secondBlade);

      const glow = new Mesh(this.gl, { geometry: glowGeo, program: this.makeFlat("#5c6470", 0.4) });
      glow.position.y = 0.045;
      node.addChild(glow);

      this.rotorDiscs.push({ node: disc, marker });
      this.glowDiscs.push(glow);
    });

    const ghostBody = new Mesh(this.gl, { geometry: hullGeo, program: this.makeGhost("#bcfd49", 0.18) });
    ghostBody.scale.set(1.12, 1.16, 0.92);
    ghostBody.position.y = 0.015;
    this.twinRoot.addChild(ghostBody);
    MOTOR_XZ.forEach(([mx, mz]) => {
      const ghostArm = new Mesh(this.gl, { geometry: boomGeo, program: this.makeGhost("#96c8ff", 0.12) });
      ghostArm.position.set((mx * armLen) / 2, 0.03, (mz * armLen) / 2);
      ghostArm.rotation.y = -Math.atan2(mx, mz);
      this.twinRoot.addChild(ghostArm);
    });
  }

  private buildArrow(color: string) {
    const group = new Transform();
    const shaft = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, { radiusTop: 0.038, radiusBottom: 0.038, height: 1, radialSegments: 12 }),
      program: this.makeFlat(color, 1),
    });
    shaft.position.y = 0.4;
    shaft.scale.set(1, 0.8, 1);
    const head = new Mesh(this.gl, {
      geometry: new Cylinder(this.gl, { radiusTop: 0.005, radiusBottom: 0.13, height: 0.25, radialSegments: 14 }),
      program: this.makeFlat(color, 1),
    });
    head.position.y = 0.9;
    group.addChild(shaft);
    group.addChild(head);
    group.visible = false;
    this.scene.addChild(group);
    return { group, shaft, head, program: shaft.program as Program };
  }

  private aimArrow(a: { group: Transform; program: Program }, spec: ArrowSpec) {
    if (!spec.dir || spec.len < 0.02) {
      a.group.visible = false;
      return;
    }
    a.group.visible = true;
    const d = new Vec3(spec.dir.x, spec.dir.y, spec.dir.z).normalize();
    const up = new Vec3(0, 1, 0);
    const dot = up.dot(d);
    let q: Quat;
    if (dot > 0.9999) q = new Quat();
    else if (dot < -0.9999) q = new Quat().fromAxisAngle(new Vec3(1, 0, 0), Math.PI);
    else {
      const axis = new Vec3().cross(up, d).normalize();
      q = new Quat().fromAxisAngle(axis, Math.acos(Math.min(1, dot)));
    }
    a.group.quaternion.copy(q);
    a.group.position.set(spec.origin?.x ?? 0, spec.origin?.y ?? 0, spec.origin?.z ?? 0);
    a.group.scale.set(1, spec.len, 1);
    if (spec.color) (a.program.uniforms.uColor.value as Color).set(spec.color);
    (a.group.children[1] as Mesh).program = (a.group.children[0] as Mesh).program;
    a.program.uniforms.uAlpha.value = spec.alpha ?? 1;
  }

  setView(p: ViewPreset) {
    this.controls.setView(VIEWS[p]);
  }

  /** Enable/disable drag-rotation (disabled while the force mode owns drags). */
  setRotateEnabled(b: boolean) {
    this.controls.rotateEnabled = b;
  }

  setDrone(st: DroneState) {
    this.droneRoot.position.set(st.position.x, st.position.y, st.position.z);
    this.twinRoot.position.set(st.position.x, st.position.y, st.position.z);
    const deg = Math.PI / 180;
    // Euler order YXZ (OGL default): yaw(Y) then pitch(X) then roll(Z).
    // Nose is −Z: pitch-up = −X rotation; yaw-clockwise = −Y; roll-right = −Z.
    this.droneBody.rotation.set(-st.pitch * deg, -st.yaw * deg, -st.roll * deg);
    this.twinRoot.rotation.set(-st.pitch * deg, -st.yaw * deg, -st.roll * deg);

    MOTOR_XZ.forEach((_, i) => {
      const speed = st.motors[i];
      const glow = this.glowDiscs[i];
      const u = glow.program.uniforms;
      const state = getMotorVisualState(speed);
      if (state === "active") (u.uColor.value as Color).set("#bcfd49");
      else if (state === "braking") (u.uColor.value as Color).set("#96c8ff");
      else (u.uColor.value as Color).set("#697b80");
      u.uAlpha.value = 0.12 + Math.min(1.35, Math.abs(speed)) * 0.4;
      const markerScale = 0.55 + Math.min(1.35, speed) * 0.5;
      this.rotorDiscs[i].marker.scale.set(markerScale, markerScale, markerScale);
      const ringProgram = this.motorRings[i].program as Program;
      const ringColor = state === "active" ? "#bcfd49" : state === "braking" ? "#96c8ff" : "#6e8d52";
      (ringProgram.uniforms.uColor.value as Color).set(ringColor);
      ringProgram.uniforms.uAlpha.value = state === "neutral" ? 0.42 : 0.82;
    });
  }

  setArrow(name: ArrowName, spec: ArrowSpec) {
    this.aimArrow(this.arrows[name], spec);
  }

  setTargetRing(y: number | null, x = 0, z = 0) {
    this.targetRing.visible = y != null;
    if (y != null) this.targetRing.position.set(x, y, z);
  }

  pushTrail(p: Vec3Like) {
    const t = this.trail[this.trailNext];
    this.trailNext = (this.trailNext + 1) % this.trail.length;
    t.node.position.set(p.x, 0.02, p.z);
    t.mesh.visible = true;
    t.age = 1;
  }

  clearTrail() {
    this.trail.forEach((t) => (t.mesh.visible = false));
  }

  resize() {
    const w = Math.round(this.canvas.clientWidth), h = Math.round(this.canvas.clientHeight);
    if (!w || !h) return;
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;
    this.renderer.setSize(w, h);
    // OGL's setSize writes inline px styles that override the Tailwind class
    // (h-[380px] w-full). Clear them so CSS keeps owning the display size.
    this.canvas.style.width = "";
    this.canvas.style.height = "";
  }
  private lastW = 0;
  private lastH = 0;

  /**
   * Unproject a canvas-space pointer onto the ground plane (y=0).
   * Returns null when the ray misses / is parallel to the plane.
   */
  pointerToGround(px: number, py: number): Vec3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((px - rect.left) / rect.width) * 2 - 1;
    const ny = -(((py - rect.top) / rect.height) * 2 - 1);
    this.camera.perspective();
    this.camera.updateMatrixWorld();
    const inv = new Mat4().inverse(this.camera.projectionViewMatrix);
    const apply = (z: number): Vec3 => {
      const m = inv as unknown as number[];
      const x4 = m[0] * nx + m[4] * ny + m[8] * z + m[12];
      const y4 = m[1] * nx + m[5] * ny + m[9] * z + m[13];
      const z4 = m[2] * nx + m[6] * ny + m[10] * z + m[14];
      const w4 = m[3] * nx + m[7] * ny + m[11] * z + m[15];
      return new Vec3(x4 / w4, y4 / w4, z4 / w4);
    };
    const near = apply(-1);
    const far = apply(1);
    const dir = new Vec3().sub(far, near);
    if (Math.abs(dir.y) < 1e-5) return null;
    const t = -near.y / dir.y;
    if (t < 0) return null;
    return new Vec3(near.x + dir.x * t, 0, near.z + dir.z * t);
  }

  render(dt: number) {
    const spinDirs = [1, -1, 1, -1];
    this.rotorSpin += dt * 14;
    this.rotorDiscs.forEach((r, i) => {
      r.node.rotation.y = this.rotorSpin * spinDirs[i] * 1.5;
    });
    this.trail.forEach((t) => {
      if (!t.mesh.visible) return;
      t.age -= dt * 0.3;
      if (t.age <= 0) t.mesh.visible = false;
      else t.program.uniforms.uAlpha.value = t.age * 0.45;
    });
    this.controls.update(Math.min(1, dt * 9));
    this.renderer.render({ scene: this.scene, camera: this.camera });
  }

  dispose() {
    this.controls.dispose();
    this.renderer.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
