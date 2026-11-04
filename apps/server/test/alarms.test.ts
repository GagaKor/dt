import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Alarm } from '@dt/shared';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';

let t: TestApp;
let cookie: string;
let siteId: string;
let auth: string;
beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
  const site = (await admin('POST', '/api/sites', { name: 'Sample Office' })).json() as {
    id: string;
  };
  siteId = site.id;
  const floors = (
    await admin('PUT', `/api/sites/${siteId}/floors`, [
      { name: '1F', elevationMin: 0, elevationMax: 3 },
    ])
  ).json() as { id: string }[];
  await admin('POST', '/api/devices', {
    id: 'cam-1',
    siteId,
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

const admin = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) => t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const ingest = async (eventType: string) =>
  (
    await t.app.inject({
      method: 'POST',
      url: '/api/ingest/events',
      headers: { authorization: auth },
      payload: { deviceId: 'cam-1', eventType, occurredAt: t.clock.now().toISOString() },
    })
  ).json() as { alarmId: string };

const list = async (q = '') =>
  (await admin('GET', `/api/alarms?siteId=${siteId}${q}`)).json() as Alarm[];

describe('alarms API', () => {
  test('requires admin and siteId', async () => {
    expect(
      (await t.app.inject({ method: 'GET', url: `/api/alarms?siteId=${siteId}` })).statusCode,
    ).toBe(401);
    expect((await admin('GET', '/api/alarms')).statusCode).toBe(400);
  });

  test('alarms list newest first with integrationKeyName and deviceName', async () => {
    await ingest('a');
    t.clock.advance(1_000);
    await ingest('b');
    const rows = await list();
    expect(rows.map((r) => r.eventType)).toEqual(['b', 'a']);
    expect(rows[0]).toMatchObject({ integrationKeyName: 'Hub', deviceName: 'Cam 1', siteId });
    expect(await list('&limit=1')).toHaveLength(1);
    expect((await list(`&before=${t.clock.now().toISOString()}`)).map((r) => r.eventType)).toEqual([
      'a',
    ]);
  });

  test('ack sets acknowledgedAt and note; second ack keeps first time', async () => {
    const { alarmId } = await ingest('a');
    const first = await admin('POST', `/api/alarms/${alarmId}/ack`, { note: 'checked' });
    expect(first.statusCode).toBe(200);
    const a1 = first.json() as Alarm;
    expect(a1.acknowledgedAt).toBe(t.clock.now().toISOString());
    expect(a1.ackNote).toBe('checked');
    t.clock.advance(60_000);
    const r2 = await admin('POST', `/api/alarms/${alarmId}/ack`);
    const a2 = r2.json() as Alarm;
    expect(a2.acknowledgedAt).toBe(a1.acknowledgedAt);
    expect(a2.ackNote).toBe('checked');
    expect(await list('&state=acked')).toHaveLength(1);
    expect(await list()).toHaveLength(0);
  });

  test('unknown alarm -> 404 alarm_not_found', async () => {
    const res = await admin('POST', '/api/alarms/00000000-0000-4000-8000-000000000000/ack', {});
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('alarm_not_found');
  });

  test('deleted device alarm is still listed with deviceName null', async () => {
    await ingest('a');
    expect((await admin('DELETE', '/api/devices/cam-1')).statusCode).toBe(204);
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deviceName).toBeNull();
  });
});
