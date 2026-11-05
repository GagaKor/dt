import type { FloorRange } from '@dt/shared';
import { Plane, Vector3 } from 'three';

/**
 * World clipping planes that keep a camera's viewing pyramid inside its floor's height range, so it
 * neither reaches through the slab into the floor below nor rises into the floor above.
 * Null when the floor is unknown.
 */
export function frustumClipPlanes(floor: FloorRange | undefined): Plane[] | null {
  if (!floor) return null;
  return [
    new Plane(new Vector3(0, 1, 0), -floor.elevationMin),
    new Plane(new Vector3(0, -1, 0), floor.elevationMax),
  ];
}
