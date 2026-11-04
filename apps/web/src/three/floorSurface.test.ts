import type { Floor } from '@dt/shared';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { expect, test } from 'vitest';
import { createFloorSurfaceResolver, createFloorYResolver } from './floorSurface';

const SLAB_THICKNESS = 0.2;

function slabs(tops: number[]): Group {
  const root = new Group();
  for (const top of tops) {
    const slab = new Mesh(new BoxGeometry(40, SLAB_THICKNESS, 20), new MeshBasicMaterial());
    slab.position.set(0, top - SLAB_THICKNESS / 2, 0);
    root.add(slab);
  }
  return root;
}

function floor(id: string, elevationMin: number, elevationMax: number): Floor {
  return { id, siteId: 's1', name: id.toUpperCase(), elevationMin, elevationMax, sortOrder: 0 };
}

test('floor surface finds the slab of each floor and falls back', () => {
  const root = slabs([0, 4]);
  const floors = [floor('f1', 0, 4), floor('f2', 4, 8)];
  const surf = createFloorSurfaceResolver(root, floors);
  expect(surf('f1', 0, 0)).toBeCloseTo(0, 3);
  expect(surf('f2', 0, 0)).toBeCloseTo(4, 3);
  expect(surf('f1', 100, 100)).toBe(0);
});

function box(x: number, z: number, bottom: number, top: number, size = 2): Mesh {
  const m = new Mesh(new BoxGeometry(size, top - bottom, size), new MeshBasicMaterial());
  m.position.set(x, (top + bottom) / 2, z);
  return m;
}

test('plan y maps to model -Z', () => {
  const root = new Group();
  root.add(box(0, -10, 0, 0.3));
  const surf = createFloorSurfaceResolver(root, [floor('f1', 0, 4)]);
  expect(surf('f1', 0, 10)).toBeCloseTo(0.3, 3);
  expect(surf('f1', 0, -10)).toBe(0);
});

test('furniture tops above the step tolerance are not the floor', () => {
  const root = slabs([0]);
  root.add(box(0, 0, 0, 0.75));
  root.add(box(4, 0, 2.2, 2.4));
  const surf = createFloorSurfaceResolver(root, [floor('f1', 0, 4)]);
  expect(surf('f1', 0, 0)).toBeCloseTo(0, 3);
  expect(surf('f1', 4, 0)).toBeCloseTo(0, 3);
});

test('a raised area within 0.5 m counts as floor, one above it does not', () => {
  const root = new Group();
  root.add(box(0, 0, 0, 0.45));
  root.add(box(4, 0, 0, 0.6));
  const surf = createFloorSurfaceResolver(root, [floor('f1', 0, 4)]);
  expect(surf('f1', 0, 0)).toBeCloseTo(0.45, 3);
  expect(surf('f1', 4, 0)).toBe(0);
});

test('results are cached per 0.5 m cell', () => {
  const root = slabs([0]);
  const surf = createFloorSurfaceResolver(root, [floor('f1', 0, 4)]);
  expect(surf('f1', 0, 0)).toBeCloseTo(0, 3);
  root.children[0]!.position.y += 0.3;
  root.updateMatrixWorld(true);
  expect(surf('f1', 0.2, -0.2)).toBeCloseTo(0, 3);
  expect(surf('f1', 1, 0)).toBeCloseTo(0.3, 3);
});

test('unknown floor id falls back to 0', () => {
  const surf = createFloorSurfaceResolver(slabs([0]), [floor('f1', 2, 4)]);
  expect(surf('nope', 0, 0)).toBe(0);
});

test('floor Y resolver: surface with a model, floor base without one, null when unknown', () => {
  const floors = [floor('f1', 0, 4), floor('f2', 4, 8)];
  const root = new Group();
  root.add(box(0, 0, 4, 4.3));
  const withModel = createFloorYResolver(root, floors);
  expect(withModel('f2', 0, 0)).toBeCloseTo(4.3, 3);
  expect(withModel('f1', 0, 0)).toBe(0);
  expect(withModel('gone', 0, 0)).toBeNull();
  const withoutModel = createFloorYResolver(null, floors);
  expect(withoutModel('f2', 0, 0)).toBe(4);
  expect(withoutModel('gone', 0, 0)).toBeNull();
});
