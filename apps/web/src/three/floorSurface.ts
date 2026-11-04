import type { Floor } from '@dt/shared';
import { Raycaster, Vector3, type Object3D } from 'three';
import { floorVisibleBand } from './floorClipping';

const CELL_M = 0.5;
// Surfaces up to this far above elevationMin (steps, raised floors) count as the floor;
// anything higher (desks, shelves, ducts) is skipped.
const FLOOR_STEP_TOLERANCE_M = 0.5;
const DOWN = new Vector3(0, -1, 0);

export type FloorSurfaceResolver = (floorId: string, x: number, y: number) => number;
/** Model Y of a floor's surface at plan (x, y), or null when the floor is unknown. */
export type FloorYResolver = (floorId: string, x: number, y: number) => number | null;

/** Returns the model Y of the walkable surface of a floor at plan (x, y). */
export function createFloorSurfaceResolver(root: Object3D, floors: Floor[]): FloorSurfaceResolver {
  const byId = new Map(floors.map((f) => [f.id, f]));
  const cache = new Map<string, number>();
  const raycaster = new Raycaster();
  const origin = new Vector3();
  root.updateMatrixWorld(true);

  return (floorId, x, y) => {
    const floor = byId.get(floorId);
    if (!floor) return 0;
    const cx = Math.round(x / CELL_M);
    const cy = Math.round(y / CELL_M);
    const key = `${floorId}:${cx}:${cy}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const { lo, hi } = floorVisibleBand(floor);
    const top = floor.elevationMin + FLOOR_STEP_TOLERANCE_M;
    origin.set(cx * CELL_M, hi, -cy * CELL_M);
    raycaster.set(origin, DOWN);
    raycaster.far = hi - lo + 1e-3;
    // Hits come sorted top-down, so the highest surface inside the step window wins.
    const hit = raycaster
      .intersectObject(root, true)
      .find((h) => h.point.y >= lo && h.point.y <= top);
    const surface = hit ? hit.point.y : floor.elevationMin;
    cache.set(key, surface);
    return surface;
  };
}

/**
 * Floor heights for markers: the surface under (x, y) once the model is loaded, the floor's base
 * before that. Create a new one whenever the scene or the floors change.
 */
export function createFloorYResolver(root: Object3D | null, floors: Floor[]): FloorYResolver {
  const byId = new Map(floors.map((f) => [f.id, f]));
  const surface = root ? createFloorSurfaceResolver(root, floors) : null;
  return (floorId, x, y) => {
    const floor = byId.get(floorId);
    if (!floor) return null;
    return surface ? surface(floorId, x, y) : floor.elevationMin;
  };
}
