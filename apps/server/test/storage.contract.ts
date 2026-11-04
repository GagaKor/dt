import { expect, test } from 'vitest';
import type { ObjectStorage } from '../src/storage/types.js';

async function readAll(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export function runStorageContract(name: string, make: () => Promise<ObjectStorage>) {
  test(`${name}: put then get returns identical bytes`, async () => {
    const s = await make();
    const body = new Uint8Array([0, 1, 2, 253, 254, 255]);
    await s.put('models/a/b.glb', body, 'model/gltf-binary');
    expect(new Uint8Array(await readAll(await s.get('models/a/b.glb')))).toEqual(body);
  });

  test(`${name}: delete makes get reject`, async () => {
    const s = await make();
    await s.put('k', new Uint8Array([1]), 'application/octet-stream');
    await s.delete('k');
    await expect(s.get('k')).rejects.toThrow();
  });

  test(`${name}: delete of a missing key does not throw`, async () => {
    const s = await make();
    await expect(s.delete('missing')).resolves.toBeUndefined();
  });

  test(`${name}: rejects keys that escape the root`, async () => {
    const s = await make();
    await expect(s.put('../evil', new Uint8Array([1]), 'x/y')).rejects.toThrow();
  });
}
