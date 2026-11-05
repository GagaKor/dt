import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { frustumClipPlanes } from './cameraFrustum';

test('the frustum clip planes keep only the part inside its floor height range', () => {
  const planes = frustumClipPlanes({ elevationMin: 4, elevationMax: 8 })!;
  const inside = (y: number) => planes.every((p) => p.distanceToPoint(new Vector3(0, y, 0)) >= 0);
  expect(inside(4.1)).toBe(true);
  expect(inside(7.9)).toBe(true);
  expect(inside(3.9)).toBe(false);
  expect(inside(8.1)).toBe(false);
  expect(frustumClipPlanes(undefined)).toBeNull();
});
