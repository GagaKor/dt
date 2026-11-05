import type { FloorRange } from '@dt/shared';
import type { Box3 } from 'three';

export interface BandBox {
  center: [number, number, number];
  size: [number, number, number];
}

/** Box over the model's footprint (plus `pad` metres on each side) between a range's heights. */
export function floorBandBox(bounds: Box3, range: FloorRange, pad = 0.5): BandBox {
  const { min, max } = bounds;
  return {
    center: [
      (min.x + max.x) / 2,
      (range.elevationMin + range.elevationMax) / 2,
      (min.z + max.z) / 2,
    ],
    size: [
      max.x - min.x + 2 * pad,
      range.elevationMax - range.elevationMin,
      max.z - min.z + 2 * pad,
    ],
  };
}
