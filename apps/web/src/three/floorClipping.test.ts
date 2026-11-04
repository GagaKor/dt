import { Vector3, type Plane } from 'three';
import { expect, test } from 'vitest';
import { floorAtElevation, floorClipPlanes, floorVisibleBand } from './floorClipping';

const f = { elevationMin: 0, elevationMax: 4 };
const visible = (planes: Plane[], union: boolean, y: number) => {
  const d = planes.map((p) => p.distanceToPoint(new Vector3(0, y, 0)) >= 0);
  return union ? d.some(Boolean) : d.every(Boolean);
};

test('visible band trims the base slack and the ceiling cut', () => {
  expect(floorVisibleBand(f)).toEqual({ lo: -0.05, hi: 3.5 });
});

test('inside band is [-0.05, 3.5]', () => {
  const { inside } = floorClipPlanes(f);
  expect(visible(inside, false, 0)).toBe(true);
  expect(visible(inside, false, 3.4)).toBe(true);
  expect(visible(inside, false, 3.9)).toBe(false);
  expect(visible(inside, false, -0.1)).toBe(false);
});

test('outside is the complement', () => {
  const { outside } = floorClipPlanes(f);
  expect(visible(outside, true, 3.9)).toBe(true);
  expect(visible(outside, true, 1)).toBe(false);
});

test('floorAtElevation maps a height to the floor that owns it', () => {
  const floors = [
    { id: 'f2', elevationMin: 4, elevationMax: 8 },
    { id: 'f1', elevationMin: 0, elevationMax: 4 },
  ];
  expect(floorAtElevation(floors, 0)?.id).toBe('f1');
  expect(floorAtElevation(floors, 3.99999)?.id).toBe('f2');
  expect(floorAtElevation(floors, 6)?.id).toBe('f2');
  expect(floorAtElevation(floors, 9)).toBeNull();
  expect(floorAtElevation(floors, -1)).toBeNull();
});
