import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Alarm } from '@dt/shared';
import { events } from '../src/db/schema.js';
import { EventService, type ObjectUpsert } from '../src/ingest/eventService.js';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';

let t: TestApp;
let cookie: string;
let keyId: string;
let auth: string;
beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
  const site = (await admin('POST', '/api/sites', { name: 'Sample Office' })).json() as {
    id: string;
  };
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
    id: string;
    key: string;
  };
  keyId = key.id;
  auth = `Bearer ${key.key}`;
  siteId = site.id;
});
afterEach(() => t.close());

let siteId: string;
const admin = (
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) => t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const post = (payload: Record<string, unknown>, authorization: string | null = auth) =>
  t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: authorization ? { authorization } : {},
    payload,
  });
const evt = (over: Record<string, unknown> = {}) => ({
  deviceId: 'cam-1',
  eventType: 'intrusion',
  occurredAt: t.clock.now().toISOString(),
  ...over,
});
const listAlarms = async (state = 'all') =>
  (await admin('GET', `/api/alarms?siteId=${siteId}&state=${state}`)).json() as Alarm[];

describe('POST /api/ingest/events', () => {
  test('no key -> 401', async () => {
    expect((await post(evt(), null)).statusCode).toBe(401);
  });

  test('revoked key -> 401', async () => {
    await admin('DELETE', `/api/integration-keys/${keyId}`);
    expect((await post(evt())).statusCode).toBe(401);
  });

  test('unknown device -> 404 unknown_device', async () => {
    const res = await post(evt({ deviceId: 'nope' }));
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('unknown_device');
  });

  test('severity urgent -> 400 validation_error', async () => {
    const res = await post(evt({ severity: 'urgent' }));
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_error');
  });

  test('rejects occurredAt more than 5 minutes ahead', async () => {
    const at = (min: number) => new Date(t.clock.now().getTime() + min * 60_000).toISOString();
    const bad = await post(evt({ occurredAt: at(6) }));
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('occurred_at_in_future');
    expect((await post(evt({ occurredAt: at(4) }))).statusCode).toBe(201);
  });

  test('missing severity uses key default (critical, then minor after PATCH)', async () => {
    expect((await post(evt())).statusCode).toBe(201);
    expect((await listAlarms())[0]!.severity).toBe('critical');
    await admin('PATCH', `/api/integration-keys/${keyId}`, { defaultSeverity: 'minor' });
    t.clock.advance(11_000);
    expect((await post(evt())).statusCode).toBe(201);
    expect((await listAlarms())[0]!.severity).toBe('minor');
  });

  test('second message within 10s merges: count 2, severity max', async () => {
    const a = await post(evt({ severity: 'minor' }));
    expect(a.statusCode).toBe(201);
    t.clock.advance(5_000);
    const b = await post(evt({ severity: 'major' }));
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual({ status: 'merged', alarmId: a.json().alarmId });
    const [alarm, ...rest] = await listAlarms();
    expect(rest).toHaveLength(0);
    expect(alarm).toMatchObject({ count: 2, severity: 'major' });
  });

  test('message after 11s creates a new alarm', async () => {
    await post(evt());
    t.clock.advance(11_000);
    const b = await post(evt());
    expect(b.json().status).toBe('created');
    expect(await listAlarms()).toHaveLength(2);
  });

  test('acked alarm keeps merging silently', async () => {
    const a = await post(evt());
    const acked = (await admin('POST', `/api/alarms/${a.json().alarmId}/ack`, {})).json() as Alarm;
    t.clock.advance(5_000);
    const b = await post(evt());
    expect(b.json().status).toBe('merged');
    const [alarm] = await listAlarms();
    expect(alarm!.count).toBe(2);
    expect(alarm!.acknowledgedAt).toBe(acked.acknowledgedAt);
    expect(await listAlarms('unacked')).toHaveLength(0);
  });

  test('duplicate eventId -> 200 duplicate, count stays 1', async () => {
    const a = await post(evt({ eventId: 'e-1' }));
    t.clock.advance(1_000);
    const b = await post(evt({ eventId: 'e-1' }));
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual({ status: 'duplicate', alarmId: a.json().alarmId });
    expect((await listAlarms())[0]!.count).toBe(1);
  });

  test('different objectId -> separate alarms', async () => {
    await post(evt({ objectId: 'p-1' }));
    await post(evt({ objectId: 'p-2' }));
    await post(evt());
    expect(await listAlarms()).toHaveLength(3);
  });

  test('merges 20 concurrent identical events into one alarm', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => post(evt())));
    expect(results.map((r) => r.statusCode).sort()).toEqual([...Array<number>(19).fill(200), 201]);
    const all = await listAlarms();
    expect(all).toHaveLength(1);
    expect(all[0]!.count).toBe(20);
    const rows = await t.deps.db.select().from(events).where(eq(events.alarmId, all[0]!.id));
    expect(rows).toHaveLength(20);
  });

  test('merge with an older occurredAt keeps the original firstOccurredAt', async () => {
    const first = t.clock.now().toISOString();
    await post(evt());
    t.clock.advance(5_000);
    const older = new Date(t.clock.now().getTime() - 60_000).toISOString();
    expect((await post(evt({ occurredAt: older }))).json().status).toBe('merged');
    const [alarm] = await listAlarms();
    expect(alarm).toMatchObject({ count: 2, firstOccurredAt: first, lastOccurredAt: first });
  });

  test('a throwing publisher does not fail a committed ingest', async () => {
    t.app.eventService.setPublisher({
      alarmChanged: () => {
        throw new Error('publisher down');
      },
    });
    t.app.eventService.setObjectSink({
      upsert: () => {
        throw new Error('sink down');
      },
    });
    const res = await post(evt({ x: 1, y: 2 }));
    expect(res.statusCode).toBe(201);
    const [alarm, ...rest] = await listAlarms();
    expect(rest).toHaveLength(0);
    expect(alarm!.id).toBe(res.json().alarmId);
  });

  test('concurrent identical eventId yields one event', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post(evt({ eventId: 'same' }))),
    );
    expect(results.filter((r) => r.json().status === 'duplicate')).toHaveLength(4);
    expect((await listAlarms())[0]!.count).toBe(1);
  });
});

describe('EventService extension points', () => {
  test('event with x,y calls objects.upsert; without x,y does not; publisher notified', async () => {
    const upserts: ObjectUpsert[] = [];
    const published: [Alarm, boolean][] = [];
    const svc = new EventService({
      db: t.deps.db,
      devices: t.app.deviceDirectory,
      mutex: new (await import('../src/lib/keyedMutex.js')).KeyedMutex(),
      objects: { upsert: (i) => void upserts.push(i) },
      publisher: { alarmChanged: (a, c) => void published.push([a, c]) },
      clock: t.deps.clock,
      log: t.app.log,
    });
    const key = { id: keyId, name: 'Hub', defaultSeverity: 'critical' as const };
    const base = {
      deviceId: 'cam-1',
      eventType: 'intrusion',
      occurredAt: t.clock.now().toISOString(),
    };
    await svc.ingest(key, { ...base, x: 1.5, y: 2.5, objectId: 'p-1', objectType: 'person' });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      integrationKeyId: keyId,
      deviceId: 'cam-1',
      siteId,
      x: 1.5,
      y: 2.5,
      objectId: 'p-1',
      objectType: 'person',
    });
    await svc.ingest(key, { ...base, eventType: 'other' });
    expect(upserts).toHaveLength(1);
    expect(published.map(([, c]) => c)).toEqual([true, true]);
  });
});
