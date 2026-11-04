import { expect, test } from 'vitest';
import { validateFloorRanges, type FloorInput } from '../src/index';

const f = (name: string, elevationMin: number, elevationMax: number): FloorInput => ({
  name,
  elevationMin,
  elevationMax,
});
const codes = (floors: FloorInput[]) => validateFloorRanges(floors).map((i) => i.code);

test('three well-formed floors are valid', () => {
  expect(validateFloorRanges([f('1F', 0, 4), f('2F', 4, 8), f('3F', 8, 12)])).toEqual([]);
});

test('empty_name', () => {
  expect(validateFloorRanges([f('  ', 0, 4)])).toEqual([{ code: 'empty_name', index: 0 }]);
});

test('duplicate_name', () => {
  expect(validateFloorRanges([f('A', 0, 4), f('A', 4, 8)])).toEqual([
    { code: 'duplicate_name', index: 1 },
  ]);
});

test('min_not_below_max', () => {
  expect(codes([f('A', 4, 4)])).toEqual(['min_not_below_max']);
});

test('overlap', () => {
  expect(validateFloorRanges([f('A', 0, 5), f('B', 4, 8)])).toEqual([
    { code: 'overlap', index: 1 },
  ]);
});

test('not_ascending', () => {
  expect(codes([f('A', 4, 8), f('B', 0, 4)])).toEqual(['not_ascending']);
});

test('too_many', () => {
  const many = Array.from({ length: 51 }, (_, i) => f(`F${i}`, i, i + 1));
  expect(codes(many)).toContain('too_many');
  expect(codes(many.slice(0, 50))).toEqual([]);
});
