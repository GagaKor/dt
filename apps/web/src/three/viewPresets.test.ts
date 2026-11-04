import { Box3, Vector3 } from 'three';
import { expect, test } from 'vitest';
import { obliqueView, topView } from './viewPresets';

const bounds = new Box3(new Vector3(-20, 0, -10), new Vector3(20, 12, 10));

test('oblique view looks at the model center from above and the south', () => {
  const { position, target } = obliqueView(bounds);
  expect(target.toArray()).toEqual([0, 6, 0]);
  expect(position.y).toBeGreaterThan(bounds.max.y);
  expect(position.z).toBeGreaterThan(bounds.max.z);
});

test('top view of a floor looks straight down at its base', () => {
  const { position, target } = topView(bounds, { elevationMin: 4, elevationMax: 8 });
  expect(target.y).toBe(4);
  expect(position.y).toBeGreaterThan(7.5);
  expect(position.x).toBeCloseTo(target.x, 6);
  expect(position.z).toBeCloseTo(target.z, 2);
});

test('top view without a floor frames the whole model', () => {
  const { position, target } = topView(bounds, null);
  expect(target.y).toBe(0);
  expect(position.y).toBeGreaterThan(bounds.max.y);
});
