import { Euler, MathUtils, Matrix3, Quaternion, Vector3, type Intersection } from 'three';

const FORWARD = new Vector3(0, 0, -1);
const PLACEMENT_OFFSET_M = 0.1;

const normalizeYaw = (deg: number): number => ((deg % 360) + 360) % 360;

/** Model rotation of a device: yaw from plan +y toward +x, pitch positive up (Euler 'YXZ'). */
export function deviceQuaternion(yawDeg: number, pitchDeg: number): Quaternion {
  const e = new Euler(MathUtils.degToRad(pitchDeg), MathUtils.degToRad(-yawDeg), 0, 'YXZ');
  return new Quaternion().setFromEuler(e);
}

/** Inverse of deviceQuaternion; any roll is dropped, which keeps the facing direction intact. */
export function yawPitchFromQuaternion(q: Quaternion): { yawDeg: number; pitchDeg: number } {
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  return {
    yawDeg: normalizeYaw(MathUtils.radToDeg(-e.y)),
    pitchDeg: MathUtils.radToDeg(e.x),
  };
}

export function forwardVector(yawDeg: number, pitchDeg: number): Vector3 {
  return FORWARD.clone().applyQuaternion(deviceQuaternion(yawDeg, pitchDeg));
}

/**
 * Where a device clicked onto a surface goes: slightly off the surface along its world normal,
 * on the side the ray came from (glTF faces may be single-sided or flipped).
 */
export function placementPosition(
  hit: Intersection,
  rayDirection: Vector3,
  offset = PLACEMENT_OFFSET_M,
): Vector3 {
  const normal = hit.face
    ? hit.face.normal
        .clone()
        .applyNormalMatrix(new Matrix3().getNormalMatrix(hit.object.matrixWorld))
    : rayDirection.clone().negate().normalize();
  if (normal.dot(rayDirection) > 0) normal.negate();
  return hit.point.clone().addScaledVector(normal, offset);
}
