import { readFile } from 'node:fs/promises';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS,
  KHRDracoMeshCompression,
  KHRTextureBasisu,
} from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
import { expect, test, vi } from 'vitest';
import { suggestFloors } from '../src/models/floorSuggestion.js';
import { ModelError, processModel } from '../src/models/processModel.js';
import { repoPath } from './helpers.js';

const sample = () => readFile(repoPath('samples', 'office-3f.glb')).then((b) => new Uint8Array(b));

async function ioWithMeshopt(): Promise<NodeIO> {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

async function extensionsOf(glb: Uint8Array): Promise<string[]> {
  const doc = await (await ioWithMeshopt()).readBinary(glb);
  return doc
    .getRoot()
    .listExtensionsUsed()
    .map((e) => e.extensionName);
}

function brokenGlb(): Uint8Array {
  const json = new TextEncoder().encode('{"asset": {"version": "2.0"'.padEnd(20, ' '));
  const padded = new Uint8Array(Math.ceil(json.length / 4) * 4).fill(0x20);
  padded.set(json);
  const out = new Uint8Array(12 + 8 + padded.length);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode('glTF'), 0);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  return out;
}

async function dracoEncode(glb: Uint8Array): Promise<Uint8Array> {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });
  const doc = await io.readBinary(glb);
  doc
    .createExtension(KHRDracoMeshCompression)
    .setRequired(true)
    .setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER });
  return io.writeBinary(doc);
}

async function withExtension(name: 'KHR_texture_basisu'): Promise<Uint8Array> {
  expect(name).toBe('KHR_texture_basisu');
  const doc = new Document();
  doc.createBuffer();
  const ext = doc.createExtension(KHRTextureBasisu);
  const tex = doc.createTexture('t').setMimeType('image/ktx2').setImage(new Uint8Array(16));
  doc.createMaterial('m').setBaseColorTexture(tex);
  void ext;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc);
}

async function scaled(glb: Uint8Array, factor: number): Promise<Uint8Array> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(glb);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  const root = doc.createNode('scaleRoot').setScale([factor, factor, factor]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    root.addChild(child);
  }
  scene.addChild(root);
  return io.writeBinary(doc);
}

async function singleBox(size: number): Promise<Uint8Array> {
  const h = size / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const faces: [number[], number[]][] = [
    [
      [-h, h, -h, h, h, -h, h, h, h, -h, h, h],
      [0, 2, 1, 0, 3, 2],
    ],
    [
      [-h, -h, -h, h, -h, -h, h, -h, h, -h, -h, h],
      [0, 1, 2, 0, 2, 3],
    ],
  ];
  for (const [p, i] of faces) {
    const base = positions.length / 3;
    positions.push(...p);
    indices.push(...i.map((n) => n + base));
  }
  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer),
    );
  const mesh = doc.createMesh('box').addPrimitive(prim);
  const node = doc.createNode('box').setMesh(mesh);
  doc.createScene('s').addChild(node);
  return new NodeIO().writeBinary(doc);
}

test('suggests three floors for the sample office', async () => {
  const r = await processModel(await sample());
  expect(r.floorSuggestion.map((f) => [f.elevationMin, f.elevationMax])).toEqual([
    [expect.closeTo(0, 1), expect.closeTo(4, 1)],
    [expect.closeTo(4, 1), expect.closeTo(8, 1)],
    [expect.closeTo(8, 1), expect.closeTo(12, 1)],
  ]);
  expect(r.warnings).toEqual([]);
  expect(r.bounds.max[0]).toBeCloseTo(20, 1);
});
test('output is meshopt-compressed glb', async () => {
  const r = await processModel(await sample());
  expect(await extensionsOf(r.glb)).toContain('EXT_meshopt_compression');
});
test('rejects non-glb bytes', async () => {
  await expect(processModel(new TextEncoder().encode('hello'))).rejects.toMatchObject({
    code: 'not_glb',
  });
});
test('rejects glb with broken json chunk', async () => {
  const err = await processModel(brokenGlb()).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ModelError);
  expect(err).toMatchObject({ code: 'invalid_gltf' });
  expect((err as ModelError).details.length).toBeGreaterThan(0);
});
test('accepts draco input and drops draco from output', async () => {
  const r = await processModel(await dracoEncode(await sample()));
  expect(await extensionsOf(r.glb)).not.toContain('KHR_draco_mesh_compression');
  expect(r.floorSuggestion).toHaveLength(3);
});
test('rejects basisu textures', async () => {
  await expect(processModel(await withExtension('KHR_texture_basisu'))).rejects.toMatchObject({
    code: 'unsupported_extension',
  });
});
test('warns when model looks like centimeters', async () => {
  expect((await processModel(await scaled(await sample(), 100))).warnings).toContain(
    'units_suspect_too_large',
  );
});
test('tiny single box falls back to one floor and warns', async () => {
  const r = await processModel(await singleBox(1));
  expect(r.floorSuggestion).toHaveLength(1);
  expect(r.warnings).toContain('units_suspect_too_small');
});

test('processing a model prints nothing below warnings to the console', async () => {
  const spies = (['log', 'info', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
  try {
    await processModel(await sample());
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});

type V3 = [number, number, number];

/** Appends the planar quad a-b-c-d as two triangles, wound so its normal points along `dir`. */
function quad(out: number[], dir: V3, a: V3, b: V3, c: V3, d: V3): void {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const flip = n[0]! * dir[0] + n[1]! * dir[1] + n[2]! * dir[2] < 0;
  for (const p of flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]) out.push(...p);
}

/** Closed box between corners `lo` and `hi`, every face wound outward. */
function box(out: number[], lo: V3, hi: V3): void {
  const corner = (i: number): V3 => [
    i & 1 ? hi[0] : lo[0],
    i & 2 ? hi[1] : lo[1],
    i & 4 ? hi[2] : lo[2],
  ];
  const faces = [
    [2, 3, 7, 6],
    [0, 1, 5, 4],
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 4, 6, 2],
    [1, 5, 7, 3],
  ];
  for (const face of faces) {
    const [a, b, c, d] = face.map(corner) as [V3, V3, V3, V3];
    // a and c are opposite corners, so this points from the box centre to the face centre.
    const outward: V3 = [
      a[0] + c[0] - lo[0] - hi[0],
      a[1] + c[1] - lo[1] - hi[1],
      a[2] + c[2] - lo[2] - hi[2],
    ];
    quad(out, outward, a, b, c, d);
  }
}

/** Hall walls of the given height around [x0, x1] x [z0, z1], 0.2 m thick, inside the outline. */
function walls(out: number[], x0: number, x1: number, z0: number, z1: number, h: number): void {
  const t = 0.2;
  box(out, [x0, 0, z0], [x1, h, z0 + t]);
  box(out, [x0, 0, z1 - t], [x1, h, z1]);
  box(out, [x0, 0, z0 + t], [x0 + t, h, z1 - t]);
  box(out, [x1 - t, 0, z0 + t], [x1, h, z1 - t]);
}

/**
 * Gable roof over [x0, x1] x [z0, z1], ridge along X, built from narrow sheets the way real roofs
 * are, so the slope never collects enough upward area in one height bin to read as a level.
 */
function gableRoof(
  out: number[],
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  eave: number,
  ridge: number,
): void {
  const zm = (z0 + z1) / 2;
  const sheets = 12;
  for (const ze of [z0, z1]) {
    for (let k = 0; k < sheets; k++) {
      const za = ze + ((zm - ze) * k) / sheets;
      const zb = ze + ((zm - ze) * (k + 1)) / sheets;
      const ya = eave + ((ridge - eave) * k) / sheets;
      const yb = eave + ((ridge - eave) * (k + 1)) / sheets;
      quad(out, [0, 1, 0], [x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb]);
    }
  }
}

function docOf(positions: number[]): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
    );
  const node = doc.createNode('building').setMesh(doc.createMesh('building').addPrimitive(prim));
  doc.createScene('s').addChild(node);
  return doc;
}

const range = (min: number, max: number, roof?: true) => ({
  elevationMin: expect.closeTo(min, 1),
  elevationMax: expect.closeTo(max, 1),
  ...(roof ? { roof } : {}),
});

test('splits a gable roof off the floor above a mezzanine at the eaves', () => {
  const t: number[] = [];
  box(t, [-30, -0.2, -20], [30, 0, 20]);
  box(t, [-30, 4.8, -20], [-10, 5, 20]);
  walls(t, -30, 30, -20, 20, 10);
  gableRoof(t, -30, 30, -20, 20, 10, 12);
  expect(suggestFloors(docOf(t))).toEqual([range(0, 5), range(5, 10), range(10, 12, true)]);
});

test('leaves a flat-roof building alone when the top range ends below the model top', () => {
  const t: number[] = [];
  for (const y of [0, 4, 8, 12]) box(t, [-15, y - 0.2, -10], [15, y, 10]);
  walls(t, -15, 15, -10, 10, 12);
  for (const x of [-8, 0, 8]) box(t, [x, 12, -2], [x + 2, 13.5, 0]);
  expect(suggestFloors(docOf(t))).toEqual([range(0, 4), range(4, 8), range(8, 12)]);
});

test('does not split a roof terrace for a small penthouse', () => {
  const t: number[] = [];
  for (const y of [0, 4, 8]) box(t, [-15, y - 0.2, -10], [15, y, 10]);
  walls(t, -15, 15, -10, 10, 9);
  box(t, [-4, 8, -5], [4, 11.5, 5]);
  box(t, [-1, 11.5, -1], [1, 12.7, 1]);
  expect(suggestFloors(docOf(t))).toEqual([range(0, 4), range(4, 8), range(8, 12.7)]);
});

test('splits a single-level hall at the eaves despite a low canopy and a lower yard', () => {
  const t: number[] = [];
  box(t, [-30, -0.2, -20], [30, 0, 20]);
  box(t, [-30, -1.4, 20], [30, -1.2, 40]);
  box(t, [-20, 4.2, 20], [20, 4.5, 24]);
  walls(t, -30, 30, -20, 20, 10);
  gableRoof(t, -30, 30, -20, 20, 10, 12);
  expect(suggestFloors(docOf(t))).toEqual([range(-1.4, 10), range(10, 12, true)]);
});

test('suggested heights come out in whole centimetres, the top range still reaching the model top', () => {
  const t: number[] = [];
  // A flat roof at 13.15 lands in bin 131, and 131 * 0.1 is 13.100000000000001. A mast takes the
  // model top to 15.15, which float32 stores as 15.149999618...
  box(t, [-15, -0.2, -10], [15, 0, 10]);
  box(t, [-15, 6.8, -10], [15, 7, 10]);
  walls(t, -15, 15, -10, 10, 7);
  box(t, [-14, 7, -9], [14, 13.15, 9]);
  box(t, [-0.5, 13.15, -0.5], [0.5, 15.15, 0.5]);
  const floors = suggestFloors(docOf(t));
  for (const f of floors) {
    expect(f.elevationMin).toBe(Math.round(f.elevationMin * 100) / 100);
    expect(f.elevationMax).toBe(Math.round(f.elevationMax * 100) / 100);
  }
  expect(floors.map((f) => [f.elevationMin, f.elevationMax])).toEqual([
    [0, 7],
    [7, 13.1],
    [13.1, 15.15],
  ]);
});

test('a model top a float32 step above a centimetre ends there, not a centimetre higher', () => {
  const t: number[] = [];
  box(t, [-15, -0.2, -10], [15, 0, 10]);
  box(t, [-15, 3.8, -10], [15, 4, 10]);
  box(t, [-0.5, 4, -0.5], [0.5, 29.7, 0.5]); // 29.7 is stored as 29.700000762...
  expect(suggestFloors(docOf(t)).at(-1)?.elevationMax).toBe(29.7);
});
