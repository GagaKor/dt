import { FLOOR_BASE_SLACK_M, FLOOR_CEILING_CUT_M, type FloorRange } from '@dt/shared';
import { Plane, Vector3 } from 'three';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);

// Model bounds are float32; a range typed as the model top can sit a hair above or below it.
const TOP_TOLERANCE_M = 0.01;

/**
 * The heights drawn for a floor: from just under its base to just under the slab of the floor
 * above. A range that reaches `modelTop` has nothing above it (its roof is part of it), so it
 * keeps everything up to the top.
 */
export function floorVisibleBand(f: FloorRange, modelTop?: number): { lo: number; hi: number } {
  const lo = f.elevationMin - FLOOR_BASE_SLACK_M;
  if (modelTop !== undefined && f.elevationMax >= modelTop - TOP_TOLERANCE_M)
    return { lo, hi: Math.max(f.elevationMax, modelTop) + 1 };
  return { lo, hi: f.elevationMax - FLOOR_CEILING_CUT_M };
}

// three.js keeps the side of a plane where distanceToPoint >= 0.
// `inside` is used with clipIntersection=false (all must hold), `outside` with
// clipIntersection=true (one must hold), so the two layers never overlap.
export function floorClipPlanes(
  f: FloorRange,
  modelTop?: number,
): { inside: Plane[]; outside: Plane[] } {
  const { lo, hi } = floorVisibleBand(f, modelTop);
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
