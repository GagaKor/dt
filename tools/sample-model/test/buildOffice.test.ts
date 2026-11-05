import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBounds, type Document } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import { expect, test } from 'vitest';
import { buildOfficeDocument, writeOfficeGlb } from '../src/buildOffice';

const doc = buildOfficeDocument();
const material = (d: Document, name: string) =>
  d
    .getRoot()
    .listMaterials()
    .find((m) => m.getName() === name);

test('groups the model by floor and roof', () => {
  const top = doc.getRoot().getDefaultScene()!.listChildren();
  expect(top.map((n) => n.getName())).toEqual(['F1', 'F2', 'F3', 'Roof']);
  const names = doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName());
  expect(names).toEqual(
    expect.arrayContaining(['F1_Slab', 'F1_Glass', 'F2_Desk', 'F2_Stair', 'F3_Wood', 'Roof_Roof']),
  );
});

test('glass is see-through and each floor has its own carpet color', () => {
  const glass = material(doc, 'Glass')!;
  expect(glass.getAlphaMode()).toBe('BLEND');
  expect(glass.getAlpha()).toBeLessThan(0.5);
  const carpets = ['Carpet 1F', 'Carpet 2F', 'Carpet 3F'].map((n) =>
    material(doc, n)!.getBaseColorFactor().join(','),
  );
  expect(new Set(carpets).size).toBe(3);
});

test('bounds keep the 40 x 20 m footprint and three 4 m floors', () => {
  const { min, max } = getBounds(doc.getRoot().getDefaultScene()!);
  [-20, -0.2, -10].forEach((v, i) => expect(min[i]).toBeCloseTo(v, 3));
  expect(max[0]).toBeCloseTo(20, 3);
  expect(max[1]).toBeGreaterThan(12);
  expect(max[1]).toBeLessThan(14);
  expect(max[2]).toBeGreaterThanOrEqual(10);
});

test('large upward-facing areas sit only at 0, 4, 8 and 12 m', () => {
  // Mirrors the server's floor suggestion: 0.1 m bins, candidates hold >= 20% of the largest bin.
  const areas = new Map<number, number>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!;
      const idx = prim.getIndices()!;
      for (let t = 0; t < idx.getCount(); t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => pos.getElement(idx.getScalar(t + k), [0, 0, 0]));
        const u = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
        const v = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
        const n = [
          u[1]! * v[2]! - u[2]! * v[1]!,
          u[2]! * v[0]! - u[0]! * v[2]!,
          u[0]! * v[1]! - u[1]! * v[0]!,
        ];
        const len = Math.hypot(n[0]!, n[1]!, n[2]!);
        if (len === 0 || n[1]! / len < 0.95) continue;
        const bin = Math.round((a![1]! + b![1]! + c![1]!) / 3 / 0.1);
        areas.set(bin, (areas.get(bin) ?? 0) + len / 2);
      }
    }
  }
  const max = Math.max(...areas.values());
  const candidates = [...areas].filter(([, a]) => a >= max * 0.2).map(([bin]) => bin);
  expect(candidates.sort((p, q) => p - q)).toEqual([0, 40, 80, 120]);
});

test('written glb validates and stays small', async () => {
  const out = join(await mkdtemp(join(tmpdir(), 'dt-')), 'o.glb');
  await writeOfficeGlb(out);
  const bytes = await readFile(out);
  const report = await validateBytes(new Uint8Array(bytes));
  expect(report.issues.numErrors).toBe(0);
  expect(bytes.byteLength).toBeLessThan(1_000_000);
});
