import { expect, test } from 'vitest';
import { FLOOR_PITCH, officeLayout, STAIR_OPENING, type Box } from '../src/layout';

const boxes = officeLayout();
const base = (b: Box) =>
  b.group === 'Roof' ? 3 * FLOOR_PITCH : (Number(b.group[1]) - 1) * FLOOR_PITCH;
/** Strict overlap; boxes that only touch (within 1 µm) do not count. */
const overlaps = (b: Box, min: number[], max: number[]) =>
  [0, 1, 2].every((i) => b.min[i]! < max[i]! - 1e-6 && b.max[i]! > min[i]! + 1e-6);

test('every box has a positive size', () => {
  for (const b of boxes) for (let i = 0; i < 3; i++) expect(b.max[i]).toBeGreaterThan(b.min[i]!);
});

test('stays inside the 40 x 20 m footprint and less than 2 m above the roof', () => {
  // Floor suggestion adds a floor above the roof when the model rises 2 m or more past it.
  // Only the entrance canopy (1F, metal) reaches past the south wall, by 2 m.
  for (const b of boxes) {
    const canopy = b.group === 'F1' && b.part === 'metal' && b.max[2] > 10;
    expect(b.min[0]).toBeGreaterThanOrEqual(-20);
    expect(b.max[0]).toBeLessThanOrEqual(20);
    expect(b.min[2]).toBeGreaterThanOrEqual(canopy ? 10 : -10);
    expect(b.max[2]).toBeLessThanOrEqual(canopy ? 12 : 10);
    expect(b.max[1]).toBeLessThan(3 * FLOOR_PITCH + 2);
  }
});

test('only stairs are walkable between 5 and 50 cm above any floor', () => {
  // The viewer puts object markers on the highest surface up to 0.5 m above the floor.
  const floors = [0, FLOOR_PITCH, 2 * FLOOR_PITCH];
  const offenders = boxes.filter((b) => {
    if (b.part === 'stair') return false;
    return floors.some((y) => b.max[1] > y + 0.05 + 1e-9 && b.max[1] <= y + 0.5 + 1e-9);
  });
  expect(offenders).toEqual([]);
});

test('furniture does not cut into walls, glass, the facade or the core', () => {
  const furniture = new Set<Box['part']>([
    'desk',
    'chair',
    'wood',
    'fabric',
    'plant',
    'pot',
    'screen',
  ]);
  const structure = new Set<Box['part']>(['wall', 'glass', 'mullion', 'facade', 'core']);
  const hits = boxes
    .filter((f) => furniture.has(f.part))
    .flatMap((f) =>
      boxes
        .filter((s) => s.group === f.group && structure.has(s.part) && overlaps(f, s.min, s.max))
        .map((s) => ({ furniture: f, structure: s })),
    );
  expect(hits).toEqual([]);
});

test('the corridor stays clear on every floor', () => {
  // Simulator cameras sit at x = ±12 on the corridor axis and look along it.
  for (const floor of ['F1', 'F2', 'F3'] as const) {
    const y0 = base({ group: floor } as Box);
    const blocking = boxes.filter(
      (b) =>
        b.group === floor &&
        b.part !== 'slab' &&
        b.part !== 'carpet' &&
        overlaps(b, [-18, y0 + 0.05, -0.75], [18, y0 + 3.4, 0.75]),
    );
    expect(blocking).toEqual([]);
  }
});

test('upper slabs leave an opening above the stairs', () => {
  const { x0, x1, z0, z1 } = STAIR_OPENING;
  for (const floor of ['F2', 'F3'] as const) {
    const covering = boxes.filter(
      (b) => b.group === floor && b.part === 'slab' && overlaps(b, [x0, -1e3, z0], [x1, 1e3, z1]),
    );
    expect(covering).toEqual([]);
  }
});

test('floors 1 and 2 have a two-flight stair up, floor 3 does not', () => {
  const steps = (g: Box['group']) => boxes.filter((b) => b.group === g && b.part === 'stair');
  // 22 steps plus the landing.
  expect(steps('F1')).toHaveLength(23);
  expect(steps('F2')).toHaveLength(23);
  expect(steps('F3')).toHaveLength(0);
  const tops = steps('F1').map((b) => b.max[1]);
  expect(Math.max(...tops)).toBeCloseTo(FLOOR_PITCH, 6);
});
