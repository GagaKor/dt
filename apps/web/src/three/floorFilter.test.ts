import { expect, test } from 'vitest';
import { isOnSelectedFloor } from './floorFilter';

test('everything is shown when no floor is selected', () => {
  expect(isOnSelectedFloor('f1', null)).toBe(true);
  expect(isOnSelectedFloor(null, null)).toBe(true);
});

test('only the selected floor is shown when one is selected', () => {
  expect(isOnSelectedFloor('f2', 'f2')).toBe(true);
  expect(isOnSelectedFloor('f1', 'f2')).toBe(false);
  // Without a floor it cannot be shown as being on the selected one.
  expect(isOnSelectedFloor(null, 'f2')).toBe(false);
});
