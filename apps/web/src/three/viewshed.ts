import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Mesh,
  Ray,
  Vector3,
  type Material,
  type Object3D,
  type Quaternion,
} from 'three';

/** Something rays can be cast against. Distances are in model metres. */
export interface Occluder {
  /** Distance to the first surface along a model-space ray, up to `far`; null if none. */
  distance(origin: Vector3, direction: Vector3, far: number): number | null;
}

// Hits closer than this are the surface a device is mounted on (placement keeps it 0.1 m off).
const NEAR_M = 0.05;

// Glass and other see-through surfaces do not stop a camera's view.
const seeThrough = (m: Material) => !m.visible || (m.transparent && m.opacity < 0.9);

interface Target {
  mesh: Mesh;
  box: Box3;
  inverse: Matrix4;
}

/**
 * Opaque, visible meshes of a model as an occluder. Faces count from both sides, since glTF
 * walls are often single planes. Uses the meshes' BVH (built here if missing).
 */
export function createOccluder(root: Object3D): Occluder {
  root.updateMatrixWorld(true);
  const targets: Target[] = [];
  root.traverseVisible((o) => {
    if (!(o instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every(seeThrough)) return;
    const geometry = o.geometry as BufferGeometry;
    if (!geometry.boundsTree) geometry.computeBoundsTree();
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    targets.push({
      mesh: o,
      box: geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld),
      inverse: o.matrixWorld.clone().invert(),
    });
  });

  const ray = new Ray();
  const local = new Ray();
  const point = new Vector3();
  return {
    distance(origin, direction, far) {
      ray.set(origin, direction);
      let best: number | null = null;
      for (const t of targets) {
        if (!ray.intersectsBox(t.box)) continue;
        local.copy(ray).applyMatrix4(t.inverse);
        const hit = t.mesh.geometry.boundsTree!.raycastFirst(local, DoubleSide);
        if (!hit) continue;
        const d = point.copy(hit.point).applyMatrix4(t.mesh.matrixWorld).distanceTo(origin);
        if (d < NEAR_M || d > far) continue;
        if (best === null || d < best) best = d;
      }
      return best;
    },
  };
}

export interface ViewshedOptions {
  hfovDeg: number;
  rangeM: number;
  /** Width over height of the image. */
  aspect?: number;
  /** Device pose in the model, used to cast rays. */
  position: readonly [number, number, number];
  quaternion: Quaternion;
  occluder: Occluder | null;
  /** Rays across and down the image. */
  cols?: number;
  rows?: number;
}

export interface Viewshed {
  /** Closed volume: apex at the origin, a far surface where each ray stopped, and the sides. */
  surface: BufferGeometry;
  /** Line segments: apex to the four corners and around the far surface. */
  outline: BufferGeometry;
}

/**
 * What a camera can see, in device space (looking down -Z): its viewing pyramid with each ray
 * cut short where the model blocks it. Without an occluder it is the plain pyramid.
 */
export function viewshedGeometry({
  hfovDeg,
  rangeM,
  aspect = 16 / 9,
  position,
  quaternion,
  occluder,
  cols = 24,
  rows = 14,
}: ViewshedOptions): Viewshed {
  const hw = rangeM * Math.tan(MathUtils.degToRad(hfovDeg) / 2);
  const hh = hw / aspect;
  const origin = new Vector3(...position);
  const local = new Vector3();
  const world = new Vector3();

  const positions = [0, 0, 0];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      local.set((2 * i) / cols - 1, 1 - (2 * j) / rows, 0);
      local.set(local.x * hw, local.y * hh, -rangeM);
      const max = local.length();
      local.divideScalar(max);
      world.copy(local).applyQuaternion(quaternion);
      const d = occluder?.distance(origin, world, max) ?? max;
      positions.push(local.x * d, local.y * d, local.z * d);
    }
  }

  const at = (i: number, j: number) => 1 + j * (cols + 1) + i;
  const index: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      index.push(a, b, c, a, c, d);
    }
  }
  // Boundary of the far surface, clockwise from the top-left corner.
  const loop: number[] = [];
  for (let i = 0; i < cols; i++) loop.push(at(i, 0));
  for (let j = 0; j < rows; j++) loop.push(at(cols, j));
  for (let i = cols; i > 0; i--) loop.push(at(i, rows));
  for (let j = rows; j > 0; j--) loop.push(at(0, j));
  loop.forEach((p, k) => index.push(0, p, loop[(k + 1) % loop.length]!));

  const surface = new BufferGeometry();
  surface.setAttribute('position', new Float32BufferAttribute(positions, 3));
  surface.setIndex(index);

  const vertex = (n: number) => positions.slice(n * 3, n * 3 + 3);
  const lines: number[] = [];
  for (const corner of [at(0, 0), at(cols, 0), at(cols, rows), at(0, rows)])
    lines.push(...vertex(0), ...vertex(corner));
  loop.forEach((p, k) => lines.push(...vertex(p), ...vertex(loop[(k + 1) % loop.length]!)));
  const outline = new BufferGeometry();
  outline.setAttribute('position', new Float32BufferAttribute(lines, 3));

  return { surface, outline };
}
