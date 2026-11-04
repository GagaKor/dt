import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Alarm } from '@dt/shared';
import { alarms } from '../src/db/schema.js';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';
import { listenWsUrl, WsClient } from './wsClient.js';

let t: TestApp;
let cookie: string;
let auth: string;
let keyId: string;
let url: string;
let siteA: string;
let siteB: string;
let floorA: string;
const clients: WsClient[] = [];

const admin = (method: 'GET' | 'POST' | 'PUT', urlPath: string, payload?: unknown) =>
  t.app.inject({ method, url: urlPath, headers: { cookie }, payload: payload as object });

async function createSite(
  name: string,
  deviceId: string,
): Promise<{ id: string; floorId: string }> {
  const site = (await admin('POST', '/api/sites', { name })).json() as { id: string };
  const floors = (
    await admin('PUT', `/api/sites/${site.id}/floors`, [
      { name: '1F', elevationMin: 0, elevationMax: 3 },
    ])
  ).json() as { id: string }[];
  const floorId = floors[0]!.id;
  await admin('POST', '/api/devices', {
    id: deviceId,
    siteId: site.id,
    floorId,
    type: 'camera',
    name: deviceId,
    position: [1, 1.5, -2],
  });
  return { id: site.id, floorId };
}

beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
  const a = await createSite('Sample Office', 'cam-a');
  siteA = a.id;
  floorA = a.floorId;
  siteB = (await createSite('Sample Warehouse', 'cam-b')).id;
  const key = (await admin('POST', '/api/integration-keys', { name: 'Hub' })).json() as {
    id: string;
    key: string;
  };
  keyId = key.id;
  auth = `Bearer ${key.key}`;
  url = await listenWsUrl(t.app);
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await t.close();
});

const connect = async (sessionCookie: string | null = cookie) => {
  const c = await WsClient.connect(url, sessionCookie ?? undefined);
  clients.push(c);
  return c;
};

const ingest = async (over: Record<string, unknown> = {}) => {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: { authorization: auth },
    payload: {
      deviceId: 'cam-a',
      eventType: 'intrusion',
      occurredAt: t.clock.now().toISOString(),
      ...over,
    },
  });
  expect(res.statusCode).toBeLessThan(300);
  return res.json() as { status: string; alarmId: string };
};

const position = async (over: Record<string, unknown> = {}) => {
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/ingest/positions',
    headers: { authorization: auth },
    payload: {
      deviceId: 'cam-a',
      x: 1,
      y: 2,
      measuredAt: t.clock.now().toISOString(),
      ...over,
    },
  });
  expect(res.statusCode).toBe(202);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unackedOf = (sites: { siteId: string; unacked: number }[], siteId: string) =>
  sites.find((s) => s.siteId === siteId)?.unacked;

describe('GET /api/ws', () => {
  test('rejects connection without session (close 4401)', async () => {
    const anon = await connect(null);
    expect((await anon.closed).code).toBe(4401);
    const forged = await connect('dt_session=forged.value');
    expect((await forged.closed).code).toBe(4401);
  });

  test('subscribe returns snapshot with objects, unacked alarms and site summary', async () => {
    const acked = await ingest({ eventType: 'door' });
    await admin('POST', `/api/alarms/${acked.alarmId}/ack`, {});
    t.clock.advance(1_000);
    const open = await ingest({ eventType: 'intrusion', x: 3, y: 4, objectId: 'p-1' });
    await position({ objectId: 'p-2', objectType: 'person', x: 5, y: 6 });

    const c = await connect();
    const snap = await c.subscribe(siteA);
    expect(snap.alarms.map((a) => a.id)).toEqual([open.alarmId]);
    expect(snap.alarms[0]).toMatchObject({ siteId: siteA, deviceName: 'cam-a' });
    expect(snap.objects.map((o) => o.key).sort()).toEqual([`${keyId}:p-1`, `${keyId}:p-2`]);
    expect(snap.objects.find((o) => o.objectId === 'p-2')).toMatchObject({
      siteId: siteA,
      floorId: floorA,
      x: 5,
      y: 6,
      objectType: 'person',
    });
    expect(snap.sites).toEqual([
      { siteId: siteA, siteName: 'Sample Office', unacked: 1 },
      { siteId: siteB, siteName: 'Sample Warehouse', unacked: 0 },
    ]);
  });

  test('snapshot caps unacked alarms at 200, newest first', async () => {
    const base = t.clock.now().getTime();
    await t.deps.db.insert(alarms).values(
      Array.from({ length: 205 }, (_, i) => {
        const at = new Date(base + i * 1_000);
        return {
          siteId: siteA,
          floorId: floorA,
          deviceId: 'cam-a',
          integrationKeyId: keyId,
          eventType: `e-${i}`,
          severity: 'minor',
          count: 1,
          firstOccurredAt: at,
          lastOccurredAt: at,
          lastReceivedAt: at,
        };
      }),
    );
    const snap = await (await connect()).subscribe(siteA);
    expect(snap.alarms).toHaveLength(200);
    expect(snap.alarms[0]!.eventType).toBe('e-204');
    expect(snap.alarms[199]!.eventType).toBe('e-5');
    expect(unackedOf(snap.sites, siteA)).toBe(205);
  });

  test('new critical alarm: subscriber of that site gets alarm, other-site subscriber gets only summary with newAlarm', async () => {
    const a = await connect();
    const b = await connect();
    await a.subscribe(siteA);
    await b.subscribe(siteB);
    const { alarmId } = await ingest({ severity: 'critical' });

    const pushed = await a.waitFor('alarm', (m) => m.alarm.id === alarmId);
    expect(pushed.created).toBe(true);
    expect(pushed.alarm).toMatchObject({ siteId: siteA, severity: 'critical', count: 1 });

    const summary = await b.waitFor('summary');
    expect(summary.newAlarm).toEqual({
      alarmId,
      siteId: siteA,
      siteName: 'Sample Office',
      severity: 'critical',
      eventType: 'intrusion',
    });
    expect(unackedOf(summary.sites, siteA)).toBe(1);
    expect(unackedOf(summary.sites, siteB)).toBe(0);
    expect(b.ofType('alarm')).toHaveLength(0);
    expect((await a.waitFor('summary')).newAlarm?.alarmId).toBe(alarmId);
  });

  test('minor alarm summary has newAlarm null', async () => {
    const c = await connect();
    await c.subscribe(siteB);
    await ingest({ severity: 'minor' });
    const summary = await c.waitFor('summary');
    expect(summary.newAlarm).toBeNull();
    expect(unackedOf(summary.sites, siteA)).toBe(1);
  });

  test('major alarm fills newAlarm, info does not', async () => {
    const c = await connect();
    await c.subscribe(siteB);
    await ingest({ severity: 'info', eventType: 'heartbeat' });
    const first = await c.waitFor('summary', (m) => unackedOf(m.sites, siteA) === 1);
    expect(first.newAlarm).toBeNull();
    const { alarmId } = await ingest({ severity: 'major', eventType: 'smoke' });
    const second = await c.waitFor('summary', (m) => unackedOf(m.sites, siteA) === 2);
    expect(second.newAlarm).toMatchObject({ alarmId, severity: 'major', eventType: 'smoke' });
  });

  test('five positions within 200ms arrive as one objects message', async () => {
    const c = await connect();
    const snap = await c.subscribe(siteA);
    expect(snap.objects).toEqual([]);
    await Promise.all([1, 2, 3, 4, 5].map((i) => position({ objectId: `o-${i}`, x: i })));
    const msg = await c.waitFor('objects');
    await sleep(350);
    expect(c.ofType('objects')).toHaveLength(1);
    expect(msg.siteId).toBe(siteA);
    expect(msg.objects.map((o) => o.objectId).sort()).toEqual(['o-1', 'o-2', 'o-3', 'o-4', 'o-5']);
  });

  test('same object key within one interval keeps only the latest position', async () => {
    const c = await connect();
    await c.subscribe(siteA);
    for (const x of [1, 2, 3]) await position({ objectId: 'o-1', x });
    const msg = await c.waitFor('objects');
    expect(msg.objects).toHaveLength(1);
    expect(msg.objects[0]).toMatchObject({ key: `${keyId}:o-1`, x: 3 });
  });

  test('ack pushes alarm update and summary with decremented unacked', async () => {
    const c = await connect();
    await c.subscribe(siteA);
    const { alarmId } = await ingest();
    await c.waitFor('summary', (m) => unackedOf(m.sites, siteA) === 1);

    const from = c.messages.length;
    const res = await admin('POST', `/api/alarms/${alarmId}/ack`, { note: 'checked' });
    expect(res.statusCode).toBe(200);
    const update = await c.waitFor('alarm', (m) => m.alarm.id === alarmId, { from });
    expect(update.created).toBe(false);
    expect(update.alarm.acknowledgedAt).toBe((res.json() as Alarm).acknowledgedAt);
    expect(update.alarm.ackNote).toBe('checked');
    const summary = await c.waitFor('summary', () => true, { from });
    expect(unackedOf(summary.sites, siteA)).toBe(0);
    expect(summary.newAlarm).toBeNull();
  });

  test('resubscribing to another site sends its snapshot and stops old site objects', async () => {
    await position({ deviceId: 'cam-b', objectId: 'b-0' });
    const c = await connect();
    await c.subscribe(siteA);
    const snapB = await c.subscribe(siteB);
    expect(snapB.objects.map((o) => o.objectId)).toEqual(['b-0']);
    const from = c.messages.indexOf(snapB);

    await position({ deviceId: 'cam-a', objectId: 'a-1' });
    await position({ deviceId: 'cam-b', objectId: 'b-1' });
    const msg = await c.waitFor('objects', () => true, { from });
    expect(msg.siteId).toBe(siteB);
    expect(c.ofType('objects', from).filter((m) => m.siteId === siteA)).toHaveLength(0);

    await ingest({ deviceId: 'cam-a' });
    await c.waitFor('summary', (m) => unackedOf(m.sites, siteA) === 1, { from });
    expect(c.ofType('alarm', from)).toHaveLength(0);
  });

  test('malformed message closes 4400, unknown site closes 4404', async () => {
    const bad = await connect();
    bad.send('not json');
    expect((await bad.closed).code).toBe(4400);

    const wrongShape = await connect();
    wrongShape.send({ type: 'subscribe', siteId: 'not-a-uuid' });
    expect((await wrongShape.closed).code).toBe(4400);

    const unknown = await connect();
    unknown.send({ type: 'subscribe', siteId: '00000000-0000-4000-8000-000000000000' });
    expect((await unknown.closed).code).toBe(4404);
  });
});
