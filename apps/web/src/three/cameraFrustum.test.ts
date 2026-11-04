import { expect, test } from 'vitest';
import { cameraFrustumGeometry } from './cameraFrustum';

test('frustum base for hfov 90, range 10', () => {
  const pos = cameraFrustumGeometry(90, 10).getAttribute('position');
  const xs = [1, 2, 3, 4].map((i) => Math.abs(pos.getX(i)));
  const ys = [1, 2, 3, 4].map((i) => Math.abs(pos.getY(i)));
  xs.forEach((x) => expect(x).toBeCloseTo(10));
  ys.forEach((y) => expect(y).toBeCloseTo(5.625));
  [1, 2, 3, 4].forEach((i) => expect(pos.getZ(i)).toBeCloseTo(-10));
});

test('apex sits at the origin and the faces close the pyramid', () => {
  const geo = cameraFrustumGeometry(60, 5, 2);
  const pos = geo.getAttribute('position');
  expect(pos.count).toBe(5);
  expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([0, 0, 0]);
  expect(Math.abs(pos.getY(1))).toBeCloseTo(Math.abs(pos.getX(1)) / 2);
  // 4 sides + 2 base triangles
  expect(geo.getIndex()?.count).toBe(18);
});
