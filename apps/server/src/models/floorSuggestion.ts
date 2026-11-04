import type { Document, Node } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import type { FloorRange } from '@dt/shared';

const BIN_M = 0.1;
const UP_NORMAL_Y = 0.95;
const CANDIDATE_RATIO = 0.2;
const MERGE_WITHIN_M = 1.5;
const TOP_GAP_M = 2;
const TRIANGLES = 4;

type Vec3 = [number, number, number];

function collectUpFacingAreaByBin(doc: Document): Map<number, number> {
  const areas = new Map<number, number>();
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return areas;

  const visit = (node: Node): void => {
    const mesh = node.getMesh();
    if (mesh) addMesh(mesh.listPrimitives(), node.getWorldMatrix(), areas);
    for (const child of node.listChildren()) visit(child);
  };
  for (const child of scene.listChildren()) visit(child);
  return areas;
}

function addMesh(
  prims: ReturnType<NonNullable<ReturnType<Node['getMesh']>>['listPrimitives']>,
  m: ArrayLike<number>,
  areas: Map<number, number>,
): void {
  for (const prim of prims) {
    if (prim.getMode() !== TRIANGLES) continue;
    const position = prim.getAttribute('POSITION');
    if (!position) continue;
    const indices = prim.getIndices();
    const count = indices ? indices.getCount() : position.getCount();
    const world: Vec3[] = [];
    const vertex = (i: number): Vec3 => {
      let v = world[i];
      if (!v) {
        const [x = 0, y = 0, z = 0] = position.getElement(i, [0, 0, 0]);
        v = [
          m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
          m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
          m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
        ];
        world[i] = v;
      }
      return v;
    };
    for (let t = 0; t + 2 < count; t += 3) {
      const ia = indices ? indices.getScalar(t) : t;
      const ib = indices ? indices.getScalar(t + 1) : t + 1;
      const ic = indices ? indices.getScalar(t + 2) : t + 2;
      const a = vertex(ia);
      const b = vertex(ib);
      const c = vertex(ic);
      const ux = b[0] - a[0],
        uy = b[1] - a[1],
        uz = b[2] - a[2];
      const vx = c[0] - a[0],
        vy = c[1] - a[1],
        vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len === 0 || ny / len < UP_NORMAL_Y) continue;
      const bin = Math.round((a[1] + b[1] + c[1]) / 3 / BIN_M);
      areas.set(bin, (areas.get(bin) ?? 0) + len / 2);
    }
  }
}

export function suggestFloors(doc: Document, known?: { minY: number; maxY: number }): FloorRange[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!known && !scene) return [];
  const bounds = known ?? { minY: getBounds(scene!).min[1], maxY: getBounds(scene!).max[1] };
  const areas = collectUpFacingAreaByBin(doc);
  const maxArea = Math.max(0, ...areas.values());
  const candidates = [...areas.entries()]
    .filter(([, area]) => area >= maxArea * CANDIDATE_RATIO)
    .map(([bin, area]) => ({ y: bin * BIN_M, area }))
    .sort((p, q) => p.y - q.y);

  const levels: { y: number; area: number }[] = [];
  for (const c of candidates) {
    const last = levels[levels.length - 1];
    if (last && c.y - last.y <= MERGE_WITHIN_M) {
      if (c.area > last.area) levels[levels.length - 1] = c;
    } else {
      levels.push(c);
    }
  }

  if (levels.length < 2) return [{ elevationMin: bounds.minY, elevationMax: bounds.maxY }];

  const floors: FloorRange[] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    floors.push({ elevationMin: levels[i]!.y, elevationMax: levels[i + 1]!.y });
  }
  const top = levels[levels.length - 1]!.y;
  if (bounds.maxY - top >= TOP_GAP_M) floors.push({ elevationMin: top, elevationMax: bounds.maxY });
  return floors;
}
