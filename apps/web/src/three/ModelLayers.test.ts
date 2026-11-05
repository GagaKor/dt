import type { Floor } from '@dt/shared';
import { expect, test } from 'vitest';
import { layerRange } from './ModelLayers';

const floors = [
  { id: 'f1', elevationMin: 0, elevationMax: 4 },
  { id: 'f2', elevationMin: 4, elevationMax: 8 },
] as Floor[];

test('a given range overrides the selected floor', () => {
  expect(layerRange(floors, 'f1', { elevationMin: 2, elevationMax: 5 })).toEqual({
    elevationMin: 2,
    elevationMax: 5,
  });
});

test('without a range the selected floor is used, and nothing when none is selected', () => {
  expect(layerRange(floors, 'f2', null)).toEqual({ elevationMin: 4, elevationMax: 8 });
  expect(layerRange(floors, null, undefined)).toBeNull();
  expect(layerRange(floors, 'missing', null)).toBeNull();
});
