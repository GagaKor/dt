import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { devices, floors } from '../src/db/schema.js';
import { createTestApp, loginCookie, repoPath, type TestApp } from './helpers.js';

const BOUNDARY = 'dtboundary';
function multipart(buf: Buffer, filename = 'model.glb') {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return {
    payload: Buffer.concat([head, buf, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

let t: TestApp;
let cookie: string;
beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
});
afterEach(() => t.close());

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) => t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

async function createSite(name = 'Sample Office') {
  const res = await call('POST', '/api/sites', { name });
  return res.json() as { id: string; name: string; modelVersion: number | null };
}

async function upload(siteId: string, buf: Buffer) {
  const m = multipart(buf);
  return t.app.inject({
    method: 'PUT',
    url: `/api/sites/${siteId}/model`,
    headers: { cookie, ...m.headers },
    payload: m.payload,
  });
}

const sample = () => readFile(repoPath('samples', 'office-3f.glb'));

describe('sites', () => {
  test('requires admin (401 without cookie)', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/sites' });
    expect(res.statusCode).toBe(401);
  });

  test('creates, lists, renames, deletes site', async () => {
    const created = await call('POST', '/api/sites', { name: 'A' });
    expect(created.statusCode).toBe(201);
    const site = created.json();
    expect(site.modelVersion).toBeNull();
    expect((await call('GET', '/api/sites')).json()).toHaveLength(1);
    const renamed = await call('PATCH', `/api/sites/${site.id}`, { name: 'B' });
    expect(renamed.json().name).toBe('B');
    expect((await call('DELETE', `/api/sites/${site.id}`)).statusCode).toBe(204);
    expect((await call('GET', '/api/sites')).json()).toHaveLength(0);
    expect((await call('PATCH', `/api/sites/${site.id}`, { name: 'C' })).statusCode).toBe(404);
  });

  test('uploading sample returns version 1 and three suggested floors', async () => {
    const site = await createSite();
    const res = await upload(site.id, await sample());
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.site.modelVersion).toBe(1);
    expect(body.floorSuggestion).toHaveLength(3);
    expect(body.floorSuggestion[0]).toEqual({ elevationMin: 0, elevationMax: 4 });
  });

  test('second upload bumps version and removes the old object', async () => {
    const site = await createSite();
    const buf = await sample();
    await upload(site.id, buf);
    await expect(t.deps.storage.get(`sites/${site.id}/model-v1.glb`)).resolves.toBeDefined();
    const res = await upload(site.id, buf);
    expect(res.json().site.modelVersion).toBe(2);
    await expect(t.deps.storage.get(`sites/${site.id}/model-v1.glb`)).rejects.toThrow();
    await expect(t.deps.storage.get(`sites/${site.id}/model-v2.glb`)).resolves.toBeDefined();
  });

  test('garbage upload → 422 not_glb', async () => {
    const site = await createSite();
    const res = await upload(site.id, Buffer.from('this is not a glb file at all'));
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('not_glb');
  });

  test('upload over MAX_MODEL_MB → 413', async () => {
    await t.close();
    t = await createTestApp({ config: { MAX_MODEL_MB: 1 } as never });
    cookie = await loginCookie(t.app);
    const site = await createSite();
    const res = await upload(site.id, Buffer.alloc(2 * 1024 * 1024, 1));
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('model_too_large');
  });

  test('model download starts with glTF and is immutable when v matches', async () => {
    const site = await createSite();
    await upload(site.id, await sample());
    const hit = await call('GET', `/api/sites/${site.id}/model?v=1`);
    expect(hit.statusCode).toBe(200);
    expect(hit.headers['content-type']).toBe('model/gltf-binary');
    expect(hit.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(hit.rawPayload.subarray(0, 4).toString()).toBe('glTF');
    const miss = await call('GET', `/api/sites/${site.id}/model?v=9`);
    expect(miss.headers['cache-control']).toBe('no-cache');
    const none = await createSite('Empty');
    const res = await call('GET', `/api/sites/${none.id}/model`);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('no_model');
  });
});

describe('floors', () => {
  const three = [
    { name: '1F', elevationMin: 0, elevationMax: 4 },
    { name: '2F', elevationMin: 4, elevationMax: 8 },
    { name: '3F', elevationMin: 8, elevationMax: 12 },
  ];

  test('PUT floors stores sorted floors', async () => {
    const site = await createSite();
    const res = await call('PUT', `/api/sites/${site.id}/floors`, three);
    expect(res.statusCode).toBe(200);
    expect(res.json().map((f: { sortOrder: number }) => f.sortOrder)).toEqual([0, 1, 2]);
    const list = (await call('GET', `/api/sites/${site.id}/floors`)).json();
    expect(list.map((f: { name: string }) => f.name)).toEqual(['1F', '2F', '3F']);
  });

  test('PUT updates by id, creates new, deletes missing', async () => {
    const site = await createSite();
    const first = (await call('PUT', `/api/sites/${site.id}/floors`, three)).json();
    const res = await call('PUT', `/api/sites/${site.id}/floors`, [
      { ...first[0], name: 'Ground' },
      { name: 'Roof', elevationMin: 4, elevationMax: 6 },
    ]);
    const out = res.json();
    expect(out.map((f: { name: string }) => f.name)).toEqual(['Ground', 'Roof']);
    expect(out[0].id).toBe(first[0].id);
  });

  test('overlapping floors → 400 invalid_floors with overlap issue', async () => {
    const site = await createSite();
    const res = await call('PUT', `/api/sites/${site.id}/floors`, [
      { name: 'A', elevationMin: 0, elevationMax: 5 },
      { name: 'B', elevationMin: 4, elevationMax: 8 },
    ]);
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('invalid_floors');
    expect(body.details).toContainEqual({ code: 'overlap', index: 1 });
  });

  test('refuses to drop a floor that devices use', async () => {
    const site = await createSite();
    const stored = (await call('PUT', `/api/sites/${site.id}/floors`, three)).json();
    await t.deps.db.insert(devices).values({
      id: 'cam-1',
      siteId: site.id,
      floorId: stored[2].id,
      type: 'camera',
      name: 'Cam',
      posX: 0,
      posY: 0,
      posZ: 9,
    });
    const res = await call('PUT', `/api/sites/${site.id}/floors`, [
      { ...stored[0], name: 'Renamed' },
    ]);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('floor_in_use');
    expect(res.json().details.deviceIds).toEqual(['cam-1']);
    const rows = await t.deps.db.select().from(floors).where(eq(floors.siteId, site.id));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === stored[0].id)?.name).toBe('1F');
  });

  test('deleting a site cascades floors', async () => {
    const site = await createSite();
    await call('PUT', `/api/sites/${site.id}/floors`, three);
    await upload(site.id, await sample());
    await call('DELETE', `/api/sites/${site.id}`);
    expect(await t.deps.db.select().from(floors)).toHaveLength(0);
    await expect(t.deps.storage.get(`sites/${site.id}/model-v1.glb`)).rejects.toThrow();
  });
});
