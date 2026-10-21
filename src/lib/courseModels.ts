export type Vec3 = readonly [number, number, number];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function pointsModel(translationX: number) {
  const p = add([100, 20, 0], [translationX, 0, 0]);
  const q = add([130, 60, 0], [translationX, 0, 0]);
  const displacement = subtract(q, p);
  return { p, q, displacement, length: Math.hypot(...displacement) };
}
export function motionModel(velocity: number, h: number, steps: number) {
  return { time: h * steps, position: velocity * h * steps };
}
export function poseModel(rootX: number) {
  const root: Vec3 = [rootX, 0, 0];
  const pelvis = add(root, [0, 0, 90]);
  const footLocal: Vec3 = [20, 0, -90];
  return { root, pelvis, footLocal, foot: add(pelvis, footLocal) };
}
