import { Mesh, Object3D, Quaternion, Vector3, type Intersection } from 'three';
import { expect, test } from 'vitest';
import {
  deviceQuaternion,
  forwardVector,
  placementPosition,
  yawPitchFromQuaternion,
} from './devicePose';

test('yaw 90 faces plan +x (model +X)', () => {
  const v = forwardVector(90, 0);
  expect(v.x).toBeCloseTo(1);
  expect(v.z).toBeCloseTo(0);
});

test('yaw 0 faces plan +y (model -Z)', () => expect(forwardVector(0, 0).z).toBeCloseTo(-1));

test('pitch -90 faces down', () => expect(forwardVector(0, -90).y).toBeCloseTo(-1));

test('quaternion roundtrip', () => {
  expect(yawPitchFromQuaternion(deviceQuaternion(135, -30))).toEqual({
    yawDeg: expect.closeTo(135, 3),
    pitchDeg: expect.closeTo(-30, 3),
  });
});

test('yaw comes back in [0, 360)', () => {
  expect(yawPitchFromQuaternion(deviceQuaternion(-90, 10)).yawDeg).toBeCloseTo(270, 3);
  expect(yawPitchFromQuaternion(deviceQuaternion(450, 0)).yawDeg).toBeCloseTo(90, 3);
  const { yawDeg } = yawPitchFromQuaternion(deviceQuaternion(0, 0));
  expect(yawDeg).toBeGreaterThanOrEqual(0);
  expect(yawDeg).toBeLessThan(360);
});

test('roll is dropped without changing where the device looks', () => {
  const q = deviceQuaternion(200, 25);
  const rolled = q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.7));
  const { yawDeg, pitchDeg } = yawPitchFromQuaternion(rolled);
  const a = forwardVector(yawDeg, pitchDeg);
  const b = new Vector3(0, 0, -1).applyQuaternion(rolled);
  expect(a.distanceTo(b)).toBeLessThan(1e-6);
});

function hitOn(object: Object3D, point: Vector3, localNormal: Vector3): Intersection {
  object.updateMatrixWorld(true);
  return {
    distance: 1,
    point,
    object,
    face: { a: 0, b: 1, c: 2, normal: localNormal, materialIndex: 0 },
  };
}

test('placement offsets the hit along the world-space face normal', () => {
  const wall = new Mesh();
  wall.rotation.y = Math.PI / 2; // local +Z normal becomes world +X
  const hit = hitOn(wall, new Vector3(2, 1, 3), new Vector3(0, 0, 1));
  const p = placementPosition(hit, new Vector3(-1, 0, 0));
  expect(p.x).toBeCloseTo(2.1);
  expect(p.y).toBeCloseTo(1);
  expect(p.z).toBeCloseTo(3);
});

test('placement stays on the viewer side when the face points away', () => {
  const floor = new Mesh();
  const hit = hitOn(floor, new Vector3(0, 0, 0), new Vector3(0, -1, 0));
  const p = placementPosition(hit, new Vector3(0, -1, 0));
  expect(p.y).toBeCloseTo(0.1);
});

test('placement ignores the object scale when transforming the normal', () => {
  const slab = new Mesh();
  slab.scale.set(1, 5, 1);
  const hit = hitOn(slab, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
  expect(placementPosition(hit, new Vector3(0, -1, 0)).y).toBeCloseTo(0.1);
});
