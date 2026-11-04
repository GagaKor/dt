import { expect, test } from 'vitest';
import { objectOpacity } from './fade';

test('hold then linear fade', () => {
  expect([0, 1000, 2500, 4000, 5000].map(objectOpacity)).toEqual([1, 1, 0.5, 0, 0]);
});

test('a timestamp slightly ahead of now counts as fresh', () => {
  expect(objectOpacity(-50)).toBe(1);
});
