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
