import type { FloorRange } from '@dt/shared';
import { BufferGeometry, Float32BufferAttribute, MathUtils, Plane, Vector3 } from 'three';

/**
 * Viewing pyramid in device space (looking down -Z): vertex 0 is the apex at the origin,
 * vertices 1–4 the base rectangle at z = -range.
 */
export function cameraFrustumGeometry(
  hfovDeg: number,
  rangeM: number,
  aspect = 16 / 9,
): BufferGeometry {
  const hw = rangeM * Math.tan(MathUtils.degToRad(hfovDeg) / 2);
  const hh = hw / aspect;
  const z = -rangeM;
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0, 0, -hw, hh, z, hw, hh, z, hw, -hh, z, -hw, -hh, z], 3),
  );
  geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 1, 3, 2, 1, 4, 3]);
  return geo;
}

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
