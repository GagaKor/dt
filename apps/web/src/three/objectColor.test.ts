import { expect, test } from 'vitest';
import { OBJECT_PALETTE, UNKNOWN_OBJECT_COLOR, objectColor } from './objectColor';

test('null is gray, ids are stable and varied', () => {
  expect(objectColor(null)).toBe('#8a8f99');
  expect(objectColor('p-1')).toBe(objectColor('p-1'));
  expect(
    new Set(Array.from({ length: 10 }, (_, i) => objectColor(`p-${i}`))).size,
  ).toBeGreaterThanOrEqual(5);
});

test('palette has ten colors without gray or the alarm red', () => {
  expect(OBJECT_PALETTE).toHaveLength(10);
  expect(new Set(OBJECT_PALETTE).size).toBe(10);
  expect(OBJECT_PALETTE).not.toContain(UNKNOWN_OBJECT_COLOR);
  expect(OBJECT_PALETTE.map((c) => c.toLowerCase())).not.toContain('#ff4d4f');
  for (let i = 0; i < 200; i++) expect(OBJECT_PALETTE).toContain(objectColor(`id-${i}`));
});
