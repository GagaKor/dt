import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { alarms, integrationKeys } from '../src/db/schema.js';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';

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

async function setup(name = 'Sample Office') {
  const site = (await call('POST', '/api/sites', { name })).json() as { id: string };
  const floors = (
    await call('PUT', `/api/sites/${site.id}/floors`, [
      { name: '1F', elevationMin: 0, elevationMax: 3 },
      { name: '2F', elevationMin: 3, elevationMax: 6 },
    ])
  ).json() as { id: string }[];
  return { siteId: site.id, f1: floors[0]!.id, f2: floors[1]!.id };
}

const body = (s: { siteId: string; f1: string }, over: Record<string, unknown> = {}) => ({
  id: 'cam-1',
  siteId: s.siteId,
  floorId: s.f1,
  type: 'camera',
  name: 'Cam 1',
  position: [1, 1.5, -2],
  ...over,
});

describe('devices', () => {
  test('camera gets default hfov 90 and range 10', async () => {
    const s = await setup();
    const res = await call('POST', '/api/devices', body(s));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'cam-1', hfovDeg: 90, rangeM: 10, yawDeg: 0 });
    const list = await call('GET', `/api/sites/${s.siteId}/devices`);
    expect(list.json()).toHaveLength(1);
  });

  test('sensor stores null hfov and range', async () => {
    const s = await setup();
    const res = await call(
      'POST',
      '/api/devices',
      body(s, { id: 's-1', type: 'sensor', hfovDeg: 60, rangeM: 5 }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ hfovDeg: null, rangeM: null });
  });

  test('device id is unique across sites (409 device_id_taken)', async () => {
    const a = await setup('A');
    const b = await setup('B');
    expect((await call('POST', '/api/devices', body(a))).statusCode).toBe(201);
    const res = await call('POST', '/api/devices', body(b));
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('device_id_taken');
  });

  test('floor from another site → 400 floor_not_in_site', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const res = await call('POST', '/api/devices', body(a, { floorId: b.f1 }));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('floor_not_in_site');
  });

  test('position below floor → 400 position_outside_floor', async () => {
    const s = await setup();
    const res = await call('POST', '/api/devices', body(s, { position: [0, -1, 0] }));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('position_outside_floor');
  });

  test('yaw 450 is stored as 90', async () => {
    const s = await setup();
    const res = await call('POST', '/api/devices', body(s, { yawDeg: 450 }));
    expect(res.json().yawDeg).toBe(90);
    const neg = await call('PATCH', '/api/devices/cam-1', { yawDeg: -90 });
    expect(neg.json().yawDeg).toBe(270);
  });

  test('rejects out-of-range hfov, range and pitch', async () => {
    const s = await setup();
    for (const over of [{ hfovDeg: 5 }, { rangeM: 101 }, { pitchDeg: 91 }]) {
      const res = await call('POST', '/api/devices', body(s, over));
      expect(res.statusCode).toBe(400);
    }
  });

  test('patch moves device to another floor and directory reflects it', async () => {
    const s = await setup();
    await call('POST', '/api/devices', body(s));
    const before = await t.app.deviceDirectory.get('cam-1');
    expect(before?.floorId).toBe(s.f1);

    const bad = await call('PATCH', '/api/devices/cam-1', { floorId: s.f2 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('position_outside_floor');

    const res = await call('PATCH', '/api/devices/cam-1', {
      floorId: s.f2,
      position: [1, 4, -2],
    });
    expect(res.statusCode).toBe(200);
    const after = await t.app.deviceDirectory.get('cam-1');
    expect(after).toMatchObject({ floorId: s.f2, siteId: s.siteId, position: [1, 4, -2] });
    expect((await t.app.deviceDirectory.getMany(['cam-1', 'nope'])).size).toBe(1);
  });

  test('deleting a device keeps its alarms', async () => {
    const s = await setup();
    await call('POST', '/api/devices', body(s));
    const [key] = await t.deps.db
      .insert(integrationKeys)
      .values({ name: 'k', keyHash: randomUUID(), keyPrefix: 'dtk_', defaultSeverity: 'critical' })
      .returning();
    const now = new Date();
    await t.deps.db.insert(alarms).values({
      siteId: s.siteId,
      floorId: s.f1,
      deviceId: 'cam-1',
      integrationKeyId: key!.id,
      eventType: 'intrusion',
      severity: 'major',
      count: 1,
      firstOccurredAt: now,
      lastOccurredAt: now,
      lastReceivedAt: now,
    });
    const del = await call('DELETE', '/api/devices/cam-1');
    expect(del.statusCode).toBe(204);
    expect(await t.app.deviceDirectory.get('cam-1')).toBeNull();
    const rows = await t.deps.db.select().from(alarms).where(eq(alarms.deviceId, 'cam-1'));
    expect(rows).toHaveLength(1);
    expect((await call('DELETE', '/api/devices/cam-1')).statusCode).toBe(404);
  });
});
