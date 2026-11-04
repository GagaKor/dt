import { BufferGeometry, Float32BufferAttribute, MathUtils } from 'three';

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
