import type { Floor } from '@dt/shared';
import { Raycaster, Vector3, type Object3D } from 'three';
import { floorVisibleBand } from './floorClipping';
import { pickFloorHit } from './pickFloorHit';

const CELL_M = 0.5;
const DOWN = new Vector3(0, -1, 0);

export type FloorSurfaceResolver = (floorId: string, x: number, y: number) => number;

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
    origin.set(cx * CELL_M, hi, -cy * CELL_M);
    raycaster.set(origin, DOWN);
    raycaster.far = hi - lo + 1e-3;
    const hit = pickFloorHit(raycaster.intersectObject(root, true), floor);
    const surface = hit ? hit.point.y : floor.elevationMin;
    cache.set(key, surface);
    return surface;
  };
}
