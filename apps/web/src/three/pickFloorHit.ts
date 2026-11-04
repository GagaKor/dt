import type { FloorRange } from '@dt/shared';
import type { Intersection } from 'three';
import { floorVisibleBand } from './floorClipping';

// Raycasts ignore clipping planes, so hits on the clipped-away ceiling or other
// floors must be dropped here.
export function pickFloorHit<T extends Intersection>(
  hits: readonly T[],
  f: FloorRange | null,
): T | null {
  if (!f) return hits[0] ?? null;
  const { lo, hi } = floorVisibleBand(f);
  return hits.find((h) => h.point.y >= lo && h.point.y <= hi) ?? null;
}
