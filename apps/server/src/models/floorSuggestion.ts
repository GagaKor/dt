import type { bbox, Document, Node } from '@gltf-transform/core';
import { getBounds } from '@gltf-transform/functions';
import type { FloorSuggestion } from '@dt/shared';

const BIN_M = 0.1;
const UP_NORMAL_Y = 0.95;
const CANDIDATE_RATIO = 0.2;
const MERGE_WITHIN_M = 1.5;
const TOP_GAP_M = 2;
const TRIANGLES = 4;

// Roof split: a height map of the topmost surface decides whether a non-flat roof covers most of
// the top floor, and where its lowest part (the eaves) is.
const ROOF_CELL_MIN_M = 0.5;
const ROOF_GRID_CELLS = 250_000;
const ROOF_BASE_SLACK_M = 0.05;
const ROOF_CLUSTER_GAP_M = 1.0;
const ROOF_MIN_SHARE = 0.5;
const ROOF_START_PERCENTILE = 0.02;
const ROOF_STEPS_PER_M = 10;
const ROOF_MIN_HEIGHT_M = 0.1;
/** Twice the XZ-projected area below which a triangle counts as vertical (a wall). */
const VERTICAL_XZ_AREA2 = 1e-9;
const EPS = 1e-6;

interface HeightGrid {
  minX: number;
  minZ: number;
  cell: number;
  nx: number;
  nz: number;
  /** Highest surface over each cell centre, -Infinity where nothing covers it. */
  top: Float64Array;
}

interface Scan {
  areas: Map<number, number>;
  grid: HeightGrid | null;
}

function createGrid(bounds: bbox): HeightGrid | null {
  const [minX, , minZ] = bounds.min;
  const [maxX, , maxZ] = bounds.max;
  const w = maxX - minX;
  const d = maxZ - minZ;
  if (!Number.isFinite(w) || !Number.isFinite(d) || w < 0 || d < 0) return null;
  // The last term keeps the cell count bounded for very long, thin extents.
  const cell = Math.max(
    ROOF_CELL_MIN_M,
    Math.sqrt((w * d) / ROOF_GRID_CELLS),
    Math.max(w, d) / ROOF_GRID_CELLS,
  );
  const nx = Math.max(1, Math.ceil(w / cell));
  const nz = Math.max(1, Math.ceil(d / cell));
  return { minX, minZ, cell, nx, nz, top: new Float64Array(nx * nz).fill(-Infinity) };
}

/**
 * One pass over every triangle in world space: bins the upward-facing area by height and
 * rasterizes the topmost surface into a grid over the XZ bounds.
 */
function scan(doc: Document, bounds: bbox): Scan {
  const areas = new Map<number, number>();
  const grid = createGrid(bounds);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return { areas, grid };

  const visit = (node: Node): void => {
    const mesh = node.getMesh();
    if (mesh) addMesh(mesh.listPrimitives(), node.getWorldMatrix(), areas, grid);
    for (const child of node.listChildren()) visit(child);
  };
  for (const child of scene.listChildren()) visit(child);
  return { areas, grid };
}

function addMesh(
  prims: ReturnType<NonNullable<ReturnType<Node['getMesh']>>['listPrimitives']>,
  m: ArrayLike<number>,
  areas: Map<number, number>,
  grid: HeightGrid | null,
): void {
  const local = [0, 0, 0];
  for (const prim of prims) {
    if (prim.getMode() !== TRIANGLES) continue;
    const position = prim.getAttribute('POSITION');
    if (!position) continue;
    const vertexCount = position.getCount();
    const p = new Float64Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      position.getElement(i, local);
      const x = local[0]!,
        y = local[1]!,
        z = local[2]!;
      p[i * 3] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      p[i * 3 + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      p[i * 3 + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
    }
    const indices = prim.getIndices()?.getArray() ?? null;
    const count = indices ? indices.length : vertexCount;
    for (let t = 0; t + 2 < count; t += 3) {
      const a = 3 * (indices ? indices[t]! : t);
      const b = 3 * (indices ? indices[t + 1]! : t + 1);
      const c = 3 * (indices ? indices[t + 2]! : t + 2);
      const ux = p[b]! - p[a]!,
        uy = p[b + 1]! - p[a + 1]!,
        uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!,
        vy = p[c + 1]! - p[a + 1]!,
        vz = p[c + 2]! - p[a + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len !== 0 && ny / len >= UP_NORMAL_Y) {
        const bin = Math.round((p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3 / BIN_M);
        areas.set(bin, (areas.get(bin) ?? 0) + len / 2);
      }
      // ny is minus twice the triangle's signed area projected onto XZ.
      if (grid && Math.abs(ny) > VERTICAL_XZ_AREA2) rasterize(grid, p, a, b, c);
    }
  }
}

function rasterize(g: HeightGrid, p: Float64Array, a: number, b: number, c: number): void {
  const ax = p[a]!,
    ay = p[a + 1]!,
    az = p[a + 2]!;
  const bx = p[b]!,
    by = p[b + 1]!,
    bz = p[b + 2]!;
  const cx = p[c]!,
    cy = p[c + 1]!,
    cz = p[c + 2]!;
  // Cells whose centres (min + (i + 0.5) * cell) fall in the triangle's XZ box.
  const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - g.minX) / g.cell - 0.5));
  const i1 = Math.min(g.nx - 1, Math.floor((Math.max(ax, bx, cx) - g.minX) / g.cell - 0.5));
  const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - g.minZ) / g.cell - 0.5));
  const k1 = Math.min(g.nz - 1, Math.floor((Math.max(az, bz, cz) - g.minZ) / g.cell - 0.5));
  const sign = (bx - ax) * (cz - az) - (cx - ax) * (bz - az) > 0 ? 1 : -1;
  for (let k = k0; k <= k1; k++) {
    const z = g.minZ + (k + 0.5) * g.cell;
    const row = k * g.nx;
    for (let i = i0; i <= i1; i++) {
      const x = g.minX + (i + 0.5) * g.cell;
      const wa = sign * ((bx - x) * (cz - z) - (cx - x) * (bz - z));
      const wb = sign * ((cx - x) * (az - z) - (ax - x) * (cz - z));
      const wc = sign * ((ax - x) * (bz - z) - (bx - x) * (az - z));
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const y = (wa * ay + wb * by + wc * cy) / (wa + wb + wc);
      if (y > g.top[row + i]!) g.top[row + i] = y;
    }
  }
}

/**
 * Where a non-flat roof above `base` starts, if it covers most of what stands at or above `base`:
 * the low end (2nd percentile, rounded down to 0.1 m) of the largest group of topmost heights more
 * than TOP_GAP_M above `base`. A small penthouse or plant room on a roof terrace returns null.
 */
function roofStart(grid: HeightGrid, base: number): number | null {
  let reference = 0;
  let above = 0;
  for (const h of grid.top) {
    if (h >= base - ROOF_BASE_SLACK_M) reference++;
    if (h > base + TOP_GAP_M) above++;
  }
  if (above === 0) return null;
  const heights = new Float64Array(above);
  let n = 0;
  for (const h of grid.top) if (h > base + TOP_GAP_M) heights[n++] = h;
  heights.sort();

  let best = 0;
  let bestSize = 0;
  let start = 0;
  for (let i = 1; i <= above; i++) {
    if (i < above && heights[i]! - heights[i - 1]! <= ROOF_CLUSTER_GAP_M) continue;
    if (i - start > bestSize) {
      best = start;
      bestSize = i - start;
    }
    start = i;
  }
  if (bestSize < reference * ROOF_MIN_SHARE) return null;
  const low = heights[best + Math.floor((bestSize - 1) * ROOF_START_PERCENTILE)]!;
  return Math.floor(low * ROOF_STEPS_PER_M + 1e-3) / ROOF_STEPS_PER_M;
}

export function suggestFloors(doc: Document, known?: bbox): FloorSuggestion[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!known && !scene) return [];
  const bounds = known ?? getBounds(scene!);
  const minY = bounds.min[1];
  const maxY = bounds.max[1];
  const { areas, grid } = scan(doc, bounds);
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

  const floors: FloorSuggestion[] = [];
  // Reference level of a last range that runs up to the model top; null when it ends at a level.
  let base: number | null = null;
  if (levels.length < 2) {
    floors.push({ elevationMin: minY, elevationMax: maxY });
    base = levels[0]?.y ?? minY;
  } else {
    for (let i = 0; i + 1 < levels.length; i++) {
      floors.push({ elevationMin: levels[i]!.y, elevationMax: levels[i + 1]!.y });
    }
    const top = levels[levels.length - 1]!.y;
    if (maxY - top >= TOP_GAP_M) {
      floors.push({ elevationMin: top, elevationMax: maxY });
      base = top;
    }
  }
  if (base === null || !grid) return floors;

  const roof = roofStart(grid, base);
  if (roof === null || roof - base < TOP_GAP_M - EPS || maxY - roof < ROOF_MIN_HEIGHT_M - EPS) {
    return floors;
  }
  floors[floors.length - 1]!.elevationMax = roof;
  floors.push({ elevationMin: roof, elevationMax: maxY, roof: true });
  return floors;
}
