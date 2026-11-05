import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Ray,
  Vector3,
  type InstancedMesh,
  type Material,
  type Mesh,
  type Object3D,
  type Quaternion,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/** Something rays can be cast against. Distances are in model metres. */
export interface Occluder {
  /** Distance to the first surface along a model-space ray, up to `far`; null if none. */
  distance(origin: Vector3, direction: Vector3, far: number): number | null;
  /** Frees the occluder's own geometry. */
  dispose?(): void;
}

// Surfaces closer than this are the one a device is mounted on (placement keeps it 0.1 m off);
// rays start past it, so a camera against a wall still stops at that wall's far side.
const NEAR_M = 0.05;
// Rays end this far short of the surface they hit, so the drawn range does not flicker against it.
const SURFACE_GAP_M = 0.02;

/** Glass and other see-through surfaces do not stop a camera's view. */
function seeThrough(m: Material | undefined): boolean {
  if (!m || !m.visible) return true;
  if (m.transparent && m.opacity < 0.9) return true;
  return ((m as Material & { transmission?: number }).transmission ?? 0) > 0;
}

interface Source {
  mesh: Mesh;
  /** Index (or vertex) ranges drawn with an opaque material. */
  ranges: { start: number; count: number }[];
  matrices: Matrix4[];
}

function opaqueSource(mesh: Mesh): Source | null {
  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute('position');
  if (!position) return null;
  const total = geometry.getIndex()?.count ?? position.count;
  let ranges: Source['ranges'];
  if (Array.isArray(mesh.material) && geometry.groups.length > 0) {
    const materials = mesh.material;
    ranges = geometry.groups
      .filter((g) => !seeThrough(materials[g.materialIndex ?? 0]))
      .map((g) => ({ start: g.start, count: Math.min(g.count, total - g.start) }));
  } else {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    ranges = seeThrough(material) ? [] : [{ start: 0, count: total }];
  }
  if (ranges.length === 0) return null;
  const instanced = mesh as InstancedMesh;
  const matrices = instanced.isInstancedMesh
    ? Array.from({ length: instanced.count }, (_, i) => {
        const m = new Matrix4();
        instanced.getMatrixAt(i, m);
        return m.premultiply(mesh.matrixWorld);
      })
    : [mesh.matrixWorld.clone()];
  return { mesh, ranges, matrices };
}

/**
 * The visible, opaque surfaces of a model baked into one model-space triangle soup with a single
 * BVH, so each ray is one query however many meshes the model has. Faces count from both sides,
 * since glTF walls are often single planes. Glass parts of multi-material meshes are left out.
 */
export function createOccluder(root: Object3D): Occluder {
  root.updateMatrixWorld(true);
  const sources: Source[] = [];
  root.traverseVisible((o) => {
    if (!(o as Mesh).isMesh) return;
    const source = opaqueSource(o as Mesh);
    if (source) sources.push(source);
  });

  let vertices = 0;
  for (const s of sources)
    vertices += s.matrices.length * s.ranges.reduce((n, r) => n + r.count, 0);
  if (vertices < 3) return { distance: () => null };

  const array = new Float32Array(vertices * 3);
  const v = new Vector3();
  let k = 0;
  for (const { mesh, ranges, matrices } of sources) {
    const geometry = mesh.geometry as BufferGeometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    for (const matrix of matrices) {
      for (const { start, count } of ranges) {
        for (let i = start; i < start + count; i++) {
          v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
          array[k++] = v.x;
          array[k++] = v.y;
          array[k++] = v.z;
        }
      }
    }
  }
  const soup = new BufferGeometry();
  soup.setAttribute('position', new BufferAttribute(array, 3));
  const bvh = new MeshBVH(soup);

  const ray = new Ray();
  return {
    distance(origin, direction, far) {
      if (far <= NEAR_M) return null;
      ray.set(origin, direction);
      const hit = bvh.raycastFirst(ray, DoubleSide, NEAR_M, far);
      return hit ? hit.distance : null;
    },
    dispose: () => soup.dispose(),
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
      const hit = occluder?.distance(origin, world, max) ?? null;
      const d = hit === null ? max : Math.max(0, hit - SURFACE_GAP_M);
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
