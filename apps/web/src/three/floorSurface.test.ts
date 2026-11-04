import type { Floor } from '@dt/shared';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { expect, test } from 'vitest';
import { createFloorSurfaceResolver } from './floorSurface';

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

test('plan y maps to model -Z', () => {
  const root = new Group();
  const pad = new Mesh(new BoxGeometry(2, SLAB_THICKNESS, 2), new MeshBasicMaterial());
  pad.position.set(0, 1 - SLAB_THICKNESS / 2, -10);
  root.add(pad);
  const surf = createFloorSurfaceResolver(root, [floor('f1', 0, 4)]);
  expect(surf('f1', 0, 10)).toBeCloseTo(1, 3);
  expect(surf('f1', 0, -10)).toBe(0);
});

test('results are cached per 0.5 m cell', () => {
  const root = slabs([0]);
  const surf = createFloorSurfaceResolver(root, [floor('f1', 0, 4)]);
  expect(surf('f1', 0, 0)).toBeCloseTo(0, 3);
  root.children[0]!.position.y += 1;
  root.updateMatrixWorld(true);
  expect(surf('f1', 0.2, -0.2)).toBeCloseTo(0, 3);
  expect(surf('f1', 1, 0)).toBeCloseTo(1, 3);
});

test('unknown floor id falls back to 0', () => {
  const surf = createFloorSurfaceResolver(slabs([0]), [floor('f1', 2, 4)]);
  expect(surf('nope', 0, 0)).toBe(0);
});
