import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBounds } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import { expect, test } from 'vitest';
import { buildOfficeDocument, writeOfficeGlb } from '../src/buildOffice';

test('office has named floors and roof', () => {
  const names = buildOfficeDocument()
    .getRoot()
    .listNodes()
    .map((n) => n.getName());
  expect(names).toEqual(
    expect.arrayContaining(['F1_Slab', 'F2_Slab', 'F3_Slab', 'F1_Walls', 'F3_Walls', 'Roof']),
  );
});

test('office bounds', () => {
  const { min, max } = getBounds(buildOfficeDocument().getRoot().getDefaultScene()!);
  [-20, -0.2, -10].forEach((v, i) => expect(min[i]).toBeCloseTo(v, 3));
  [20, 12, 10].forEach((v, i) => expect(max[i]).toBeCloseTo(v, 3));
});

test('upward-facing slab tops sit at exact heights', () => {
  const doc = buildOfficeDocument();
  const tops = new Set<number>();
  for (const node of doc.getRoot().listNodes()) {
    if (!/Slab$|^Roof$/.test(node.getName())) continue;
    const prim = node.getMesh()!.listPrimitives()[0]!;
    const pos = prim.getAttribute('POSITION')!;
    const nor = prim.getAttribute('NORMAL')!;
    for (let i = 0; i < pos.getCount(); i++) {
      if (nor.getElement(i, [0, 0, 0])[1] === 1) tops.add(pos.getElement(i, [0, 0, 0])[1]!);
    }
  }
  expect([...tops].sort((a, b) => a - b)).toEqual([0, 4, 8, 12]);
});

test('written glb validates and stays small', async () => {
  const out = join(await mkdtemp(join(tmpdir(), 'dt-')), 'o.glb');
  await writeOfficeGlb(out);
  const bytes = await readFile(out);
  expect((await validateBytes(new Uint8Array(bytes))).issues.numErrors).toBe(0);
  expect(bytes.byteLength).toBeLessThan(1_000_000);
});
