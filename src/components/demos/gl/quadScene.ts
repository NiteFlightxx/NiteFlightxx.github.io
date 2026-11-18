
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GRAVITY, MAX_THRUST, ROTORS, type Experiment, type FlightState, type Vec3 } from "../droneSandboxLogic";

export type ViewPreset = "orbit" | "top" | "side";

const PALETTE = {
  shell: 0xdce4e7,
  edge: 0x161f28,
  metal: 0x5e6870,
  orange: 0xe85429,
  floor: 0xe7e6df,
  thrust: 0x087b64,
  gravity: 0xd15632,
  force: 0x9b42ba,
  velocity: 0x2866af,
} as const;

function buildDrone() {
  const root = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: PALETTE.shell, metalness: 0.27, roughness: 0.32 });
  const edge = new THREE.MeshStandardMaterial({ color: PALETTE.edge, metalness: 0.24, roughness: 0.52 });
  const metal = new THREE.MeshStandardMaterial({ color: PALETTE.metal, metalness: 0.57, roughness: 0.38 });
  const orange = new THREE.MeshStandardMaterial({ color: PALETTE.orange, metalness: 0.22, roughness: 0.42 });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x1d3648, metalness: 0.45, roughness: 0.10, clearcoat: 1 });
  const prop = new THREE.MeshStandardMaterial({ color: 0x303942, metalness: 0.22, roughness: 0.5 });
  const blur = [0x537d75, 0xbd6b49].map((color) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
  }));

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    return object;
  }

  const outline = new THREE.Shape();
  outline.moveTo(-0.135, -0.34);
  outline.lineTo(0.135, -0.34);
  outline.lineTo(0.225, -0.10);
  outline.lineTo(0.185, 0.24);
  outline.lineTo(0.11, 0.32);
  outline.lineTo(-0.11, 0.32);
  outline.lineTo(-0.185, 0.24);
  outline.lineTo(-0.225, -0.10);
  outline.closePath();
  const enclosure = new THREE.ExtrudeGeometry(outline, {
    depth: 0.056, bevelThickness: 0.024, bevelSize: 0.022, bevelSegments: 3, steps: 1,
  });
  enclosure.rotateX(Math.PI / 2);
  root.add(mesh(enclosure, edge, 0, 0.025, 0));
  root.add(mesh(enclosure, shell, 0, 0.103, 0));
  root.add(
    mesh(new THREE.BoxGeometry(0.13, 0.01, 0.22), edge, 0, 0.126, 0.075),
    mesh(new THREE.BoxGeometry(0.13, 0.012, 0.025), orange, 0, 0.128, -0.057),
    mesh(new THREE.BoxGeometry(0.18, 0.095, 0.085), edge, 0, -0.041, -0.295),
  );
  const optic = mesh(new THREE.CylinderGeometry(0.036, 0.043, 0.031, 24), lens, 0, -0.036, -0.349);
  optic.rotation.x = Math.PI / 2;
  root.add(optic);
  for (let i = 0; i < 5; i++) {
    root.add(mesh(new THREE.BoxGeometry(0.073, 0.006, 0.009), metal, 0, 0.133, 0.008 + i * 0.032));
  }

  const motorShell = new THREE.CylinderGeometry(0.074, 0.08, 0.093, 24);
  const motorCap = new THREE.CylinderGeometry(0.037, 0.043, 0.02, 20);
  const guard = new THREE.TorusGeometry(0.264, 0.012, 8, 52);
  const ringAccent = new THREE.TorusGeometry(0.264, 0.014, 8, 36, Math.PI * 0.62);
  const disk = new THREE.RingGeometry(0.075, 0.251, 48);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.022, 0.012);
  bladeShape.bezierCurveTo(-0.026, 0.078, -0.062, 0.21, -0.027, 0.247);
  bladeShape.bezierCurveTo(0.006, 0.24, 0.026, 0.11, 0.026, 0.02);
  bladeShape.closePath();
  const bladeMesh = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.003, bevelEnabled: false });
  bladeMesh.rotateX(Math.PI / 2);
  const motors = ROTORS.map(({ position: [x, , z], spin }, index) => {
    const armLength = Math.hypot(x, z);
    const boom = mesh(new THREE.BoxGeometry(0.09, 0.062, armLength), edge, x * 0.5, -0.002, z * 0.5);
    const brace = mesh(new THREE.BoxGeometry(0.043, 0.012, armLength * 0.48), metal, x * 0.55, 0.036, z * 0.55);
    boom.rotation.y = brace.rotation.y = Math.atan2(x, z);
    const braceBand = mesh(new THREE.BoxGeometry(0.091, 0.068, 0.042), orange, x * 0.70, 0, z * 0.70);
    braceBand.rotation.y = boom.rotation.y;
    root.add(boom, brace, braceBand);
    const motor = new THREE.Group();
    motor.position.set(x, 0, z);
    motor.add(mesh(motorShell, metal, 0, 0.03, 0), mesh(motorCap, edge, 0, 0.11, 0));
    const ring = mesh(guard, edge, 0, 0.076, 0);
    ring.rotation.x = -Math.PI / 2;
    const accent = mesh(ringAccent, index < 2 ? orange : metal, 0, 0.077, 0);
    accent.rotation.set(-Math.PI / 2, 0, index % 2 ? 3.3 : 0.8);
    const propellers = new THREE.Group();
    propellers.position.y = 0.093;
    const bladeA = mesh(bladeMesh, prop, 0, 0, 0);
    const bladeB = mesh(bladeMesh, prop, 0, 0, 0);
    bladeB.rotation.y = Math.PI;
    propellers.add(bladeA, bladeB);
    const rotorBlur = mesh(disk, blur[spin > 0 ? 0 : 1].clone(), 0, 0.100, 0);
    rotorBlur.rotation.x = -Math.PI / 2;
    rotorBlur.castShadow = false;
    motor.add(ring, accent, propellers, rotorBlur);
    root.add(motor);
    return { propellers, blur: rotorBlur, spin, marker: new THREE.Vector3(x, 0.23, z) };
  });
  blur.forEach((material) => material.dispose());
  return { root, motors };
}

export class QuadScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.05, 120);
  private controls: OrbitControls;
  private drone = buildDrone();
  private grid: THREE.GridHelper;
  private floor: THREE.Mesh;
  private platform = new THREE.Group();
  private shadow = new THREE.DirectionalLight(0xfff4dc, 3.3);
  private view = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private groundPoint = new THREE.Vector3();
  private pointer = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private anchors = ROTORS.map(() => ({ x: 0, y: 0 }));
  private trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x597fa5 }));
  private trailValues = new Float32Array(150 * 3);
  private trailCount = 0;
  private lastTrail = -1;
  private lastTime = 0;
  private width = 0;
  private height = 0;
  private lastMode?: Experiment["mode"];
  private lastPreset?: ViewPreset;

  private arrows = {
    thrust: new THREE.ArrowHelper(undefined, undefined, 1, PALETTE.thrust),
    gravity: new THREE.ArrowHelper(undefined, undefined, 1, PALETTE.gravity),
    force: new THREE.ArrowHelper(undefined, undefined, 1, PALETTE.force),
    velocity: new THREE.ArrowHelper(undefined, undefined, 1, PALETTE.velocity),
    collective: ROTORS.map((_, i) => new THREE.ArrowHelper(undefined, undefined, 1, i % 2 ? PALETTE.orange : PALETTE.thrust)),
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(PALETTE.floor);
    this.scene.fog = new THREE.FogExp2(PALETTE.floor, 0.052);
    this.scene.add(new THREE.HemisphereLight(0xf6fbff, 0xb5a799, 2.1));
    this.shadow.position.set(-3, 7, -4);
    this.shadow.castShadow = true;
    this.shadow.shadow.mapSize.set(1024, 1024);
    this.shadow.shadow.bias = -0.0004;
    this.shadow.shadow.normalBias = 0.018;
    Object.assign(this.shadow.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 22 });
    this.shadow.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.shadow, this.shadow.target);
    const rim = new THREE.DirectionalLight(0xc7e3ff, 1.5);
    rim.position.set(4, 4, 3);
    this.scene.add(rim);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.96 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.grid = new THREE.GridHelper(96, 96, 0xbabbb2, 0xc9c9bf);
    this.grid.position.y = 0.004;
    this.scene.add(this.grid);
    this.buildPlatform();
    this.trail.geometry.setAttribute("position", new THREE.BufferAttribute(this.trailValues, 3).setUsage(THREE.DynamicDrawUsage));
    this.trail.frustumCulled = false;
    this.trail.geometry.setDrawRange(0, 0);
    this.scene.add(this.trail, this.drone.root, this.arrows.thrust, this.arrows.gravity,
      this.arrows.force, this.arrows.velocity, ...this.arrows.collective);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.8;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.rotateSpeed = 0.62;
    this.controls.target.set(0, 1.05, 0);
    this.camera.position.set(3.1, 3.0, 4.0);
    this.controls.update();
  }

  private buildPlatform() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.71, 1.74, 0.065, 80),
      new THREE.MeshStandardMaterial({ color: 0xbebfb5, roughness: 0.84 }),
    );
    base.position.y = 0.031;
    base.receiveShadow = true;
    this.platform.add(base);
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(1.64, 80),
      new THREE.MeshStandardMaterial({ color: 0xd8d9d0, roughness: 0.86 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.065;
    top.receiveShadow = true;
    this.platform.add(top);
    const marking = new THREE.MeshBasicMaterial({ color: 0x8b938b });
    const accent = new THREE.MeshBasicMaterial({ color: PALETTE.orange });
    for (const [inner, outer, material] of [
      [1.19, 1.207, marking], [1.46, 1.472, accent], [0.43, 0.443, marking],
    ] as const) {
      const circle = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 88), material);
      circle.rotation.x = -Math.PI / 2;
      circle.position.y = 0.069;
      this.platform.add(circle);
    }
    const mark = new THREE.PlaneGeometry(0.023, 0.084);
    mark.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const tick = new THREE.Mesh(mark, i % 6 === 0 ? accent : marking);
      tick.position.set(Math.sin(angle) * 1.35, 0.070, Math.cos(angle) * 1.35);
      tick.rotation.y = angle;
      this.platform.add(tick);
    }
    for (const angle of [0, Math.PI / 2]) {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.014), marking);
      cross.rotation.set(-Math.PI / 2, 0, angle);
      cross.position.y = 0.07;
      this.platform.add(cross);
    }
    this.scene.add(this.platform);
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height || (width === this.width && height === this.height)) return;
    const previousFit = this.fit();
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (!this.lastPreset) return;
    this.view.copy(this.camera.position).sub(this.controls.target).multiplyScalar(this.fit() / previousFit);
    this.camera.position.copy(this.controls.target).add(this.view);
  }

  private fit() {
    return Math.max(1, 0.92 / this.camera.aspect);
  }

  setView(preset: ViewPreset) {
    this.resize();
    const fit = this.fit();
    const offsets = {
      orbit: [3.15, 2.27, -4.12],
      top: [0, 6.05, 0.001],
      side: [5.6, 0.75, 0],
    } as const;
    const [x, y, z] = offsets[preset];
    this.view.set(x, y, z).multiplyScalar(fit);
    this.camera.position.copy(this.controls.target).add(this.view);
    this.controls.update();
    this.lastPreset = preset;
  }

  setOrbitEnabled(enabled: boolean) {
    this.controls.enableRotate = enabled;
  }

  aimForce(clientX: number, clientY: number, position: Vec3): Vec3 {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(2 * (clientX - bounds.left) / bounds.width - 1, 1 - 2 * (clientY - bounds.top) / bounds.height);
    this.ray.setFromCamera(this.pointer, this.camera);
    if (!this.ray.ray.intersectPlane(this.ground, this.groundPoint)) return [0, 0, 0];
    const x = this.groundPoint.x - position[0];
    const z = this.groundPoint.z - position[2];
    const length = Math.hypot(x, z);
    return length > 0.08 ? [x / length, 0, z / length] : [0, 0, 0];
  }

  private arrow(arrow: THREE.ArrowHelper, origin: THREE.Vector3, x: number, y: number, z: number, scale: number) {
    this.direction.set(x, y, z);
    const size = this.direction.length();
    const length = Math.min(2.15, size * scale);
    arrow.visible = length >= 0.045;
    if (!arrow.visible) return;
    arrow.position.copy(origin);
    arrow.setDirection(this.direction.multiplyScalar(1 / size));
    arrow.setLength(length, Math.min(0.16, length * 0.38), 0.075);
  }

  draw(state: FlightState, experiment: Experiment, dt: number, vectors: boolean) {
    this.resize();
    const { position: [x, y, z], pose: [pitch, roll, yaw], direction, thrust, applied, velocity, time } = state;
    if (this.lastMode !== experiment.mode || time < this.lastTime) {
      this.lastMode = experiment.mode;
      this.trailCount = 0;
      this.lastTrail = -1;
      this.trail.geometry.setDrawRange(0, 0);
    }
    this.lastTime = time;
    const trackingY = Math.max(0.95, y * 0.67);
    this.view.set(x, trackingY, z).sub(this.controls.target).multiplyScalar(1 - Math.exp(-9 * dt));
    this.controls.target.add(this.view);
    this.camera.position.add(this.view);
    this.controls.update();
    this.floor.position.set(Math.round(x / 10) * 10, 0, Math.round(z / 10) * 10);
    this.grid.position.set(this.floor.position.x, 0.004, this.floor.position.z);
    this.shadow.position.set(x - 3, 7, z - 4);
    this.shadow.target.position.set(x, 0, z);
    this.drone.root.position.set(x, y, z);
    this.drone.root.rotation.set(THREE.MathUtils.degToRad(-pitch), THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(-roll), "YXZ");
    this.drone.root.updateMatrixWorld(true);
    const mixer = experiment.mode === "mixer";
    this.drone.motors.forEach(({ propellers, blur, marker, spin }, i) => {
      const rpm = state.motors[i];
      propellers.rotation.y += spin * dt * (3 + 30 * rpm) * rpm;
      blur.material.opacity = rpm * 0.25;
      propellers.visible = rpm < 0.86;
      const origin = this.origin.copy(marker).applyMatrix4(this.drone.root.matrixWorld);
      const arrow = this.arrows.collective[i];
      this.arrow(arrow, origin, 0, vectors && mixer ? rpm ** 2 * MAX_THRUST : 0, 0, 0.22);
      if (mixer) {
        origin.y += arrow.visible ? Math.min(1.55, 0.22 * rpm ** 2 * MAX_THRUST) * 0.85 : 0.14;
        origin.project(this.camera);
        this.anchors[i].x = (origin.x * 0.5 + 0.5) * this.width;
        this.anchors[i].y = (0.5 - origin.y * 0.5) * this.height;
      }
    });

    this.origin.set(x, y + 0.10, z);
    const showBodyForces = vectors && !mixer;
    const visibleThrust = showBodyForces ? thrust : 0;
    this.arrow(this.arrows.thrust, this.origin,
      direction[0] * visibleThrust, direction[1] * visibleThrust, direction[2] * visibleThrust, 0.073);
    this.origin.y = y - 0.08;
    this.arrow(this.arrows.gravity, this.origin, 0, showBodyForces ? -experiment.mass * GRAVITY : 0, 0, 0.073);
    this.arrow(this.arrows.force, this.origin, vectors ? applied[0] : 0, vectors ? applied[1] : 0, vectors ? applied[2] : 0, 0.22);
    this.origin.y = y + 0.035;
    const planar = vectors && experiment.mode === "force";
    this.arrow(this.arrows.velocity, this.origin, planar ? velocity[0] : 0, 0, planar ? velocity[2] : 0, 0.54);

    if (planar && (this.trailCount === 0 || Math.hypot(velocity[0], velocity[2]) > 0.08) && time - this.lastTrail >= 0.06) {
      if (this.trailCount === this.trailValues.length / 3) {
        this.trailValues.copyWithin(0, 3);
        this.trailCount--;
      }
      this.trailValues.set([x, 0.083, z], this.trailCount++ * 3);
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.geometry.setDrawRange(0, this.trailCount);
      this.lastTrail = time;
    }
    this.trail.visible = planar;
    this.renderer.render(this.scene, this.camera);
    return this.anchors;
  }

  dispose() {
    this.controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.shadow.dispose();
    this.renderer.dispose();
  }
}
