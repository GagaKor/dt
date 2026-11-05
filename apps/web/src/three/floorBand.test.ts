import { Box3, Vector3 } from 'three';
import { expect, test } from 'vitest';
import { floorBandBox } from './floorBand';

test('band spans the model footprint with padding, between the range heights', () => {
  const bounds = new Box3(new Vector3(-20, -0.2, -10), new Vector3(20, 13.4, 12));
  const box = floorBandBox(bounds, { elevationMin: 4, elevationMax: 8 }, 0.5);
  expect(box.center).toEqual([0, 6, 1]);
  expect(box.size).toEqual([41, 4, 23]);
});
