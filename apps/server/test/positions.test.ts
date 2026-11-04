import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';

let t: TestApp;
let cookie: string;
let auth: string;
let siteId: string;

const admin = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
  const site = (await admin('POST', '/api/sites', { name: 'Sample Office' })).json() as {
    id: string;
  };
  siteId = site.id;
  const floors = (
    await admin('PUT', `/api/sites/${site.id}/floors`, [
      { name: '1F', elevationMin: 0, elevationMax: 3 },
    ])
  ).json() as { id: string }[];
  await admin('POST', '/api/devices', {
    id: 'cam-1',
    siteId: site.id,
    floorId: floors[0]!.id,
    type: 'camera',
    name: 'Cam 1',
    position: [1, 1.5, -2],
  });
  const key = (await admin('POST', '/api/integration-keys', { name: 'Hub' })).json() as {
    key: string;
  };
  auth = `Bearer ${key.key}`;
});
afterEach(() => t.close());

const post = (payload: unknown) =>
  t.app.inject({
    method: 'POST',
    url: '/api/ingest/positions',
    headers: { authorization: auth },
    payload: payload as object,
  });
const pos = (over: Record<string, unknown> = {}) => ({
  deviceId: 'cam-1',
  x: 1,
  y: 2,
  measuredAt: t.clock.now().toISOString(),
  ...over,
});

describe('POST /api/ingest/positions', () => {
  test('single position -> 202 accepted 1', async () => {
    const res = await post(pos({ objectId: 'o1' }));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 1 });
    expect(t.app.objectStore.listSite(siteId)).toHaveLength(1);
  });

  test('array of 3 -> accepted 3', async () => {
    const res = await post([pos(), pos(), pos()]);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: 3 });
    expect(t.app.objectStore.listSite(siteId)).toHaveLength(3);
  });

  test('1001 items -> 400', async () => {
    const res = await post(Array.from({ length: 1001 }, () => pos()));
    expect(res.statusCode).toBe(400);
  });

  test('unknown device among valid ones -> 404, nothing stored', async () => {
    const res = await post([pos(), pos({ deviceId: 'nope' }), pos()]);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'unknown_device', details: { deviceIds: ['nope'] } });
    expect(t.app.objectStore.listSite(siteId)).toHaveLength(0);
  });

  test('measuredAt in the future -> 400, nothing stored', async () => {
    const future = new Date(t.clock.now().getTime() + 600_000).toISOString();
    const res = await post([pos(), pos({ measuredAt: future })]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'measured_at_in_future' });
    expect(t.app.objectStore.listSite(siteId)).toHaveLength(0);
  });

  test('event with objectId and x,y moves the same object as a position with that objectId and key', async () => {
    await post(pos({ objectId: 'o1', x: 1, y: 1 }));
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: auth },
      payload: {
        deviceId: 'cam-1',
        eventType: 'intrusion',
        occurredAt: t.clock.now().toISOString(),
        objectId: 'o1',
        x: 9,
        y: 8,
      },
    });
    expect(res.statusCode).toBe(201);
    const list = t.app.objectStore.listSite(siteId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ x: 9, y: 8, objectId: 'o1' });
  });
});
