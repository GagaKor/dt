import { Vector3, type Intersection } from 'three';
import { expect, test } from 'vitest';
import { pickFloorHit } from './pickFloorHit';

const f = { elevationMin: 0, elevationMax: 4 };
const at = (...ys: number[]) => ys.map((y) => ({ point: new Vector3(0, y, 0) })) as Intersection[];

test('pickFloorHit skips ceiling hits', () => {
  const hits = [
    { point: new Vector3(0, 3.9, 0) },
    { point: new Vector3(0, 0, 0) },
  ] as Intersection[];
  expect(pickFloorHit(hits, f)?.point.y).toBe(0);
});

test('without a floor the first hit wins', () => {
  expect(pickFloorHit(at(3.9, 0), null)?.point.y).toBe(3.9);
});

test('band edges are inclusive and misses return null', () => {
  expect(pickFloorHit(at(-0.05), f)?.point.y).toBe(-0.05);
  expect(pickFloorHit(at(3.5), f)?.point.y).toBe(3.5);
  expect(pickFloorHit(at(7, -1), f)).toBeNull();
  expect(pickFloorHit([], null)).toBeNull();
});
