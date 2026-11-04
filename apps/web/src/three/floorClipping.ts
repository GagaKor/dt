import { FLOOR_BASE_SLACK_M, FLOOR_CEILING_CUT_M, type FloorRange } from '@dt/shared';
import { Plane, Vector3 } from 'three';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

export function floorVisibleBand(f: FloorRange): { lo: number; hi: number } {
  return { lo: f.elevationMin - FLOOR_BASE_SLACK_M, hi: f.elevationMax - FLOOR_CEILING_CUT_M };
}

// three.js keeps the side of a plane where distanceToPoint >= 0.
// `inside` is used with clipIntersection=false (all must hold), `outside` with
// clipIntersection=true (one must hold), so the two layers never overlap.
export function floorClipPlanes(f: FloorRange): { inside: Plane[]; outside: Plane[] } {
  const { lo, hi } = floorVisibleBand(f);
  return {
    inside: [new Plane(UP.clone(), -lo), new Plane(DOWN.clone(), hi)],
    outside: [new Plane(DOWN.clone(), lo), new Plane(UP.clone(), -hi)],
  };
}

export function floorAtElevation<T extends FloorRange>(floors: readonly T[], y: number): T | null {
  return (
    floors.find(
      (f) => y >= f.elevationMin - FLOOR_BASE_SLACK_M && y < f.elevationMax - FLOOR_BASE_SLACK_M,
    ) ?? null
  );
}
