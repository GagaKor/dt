import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kpi, StatsResponse } from '@dt/shared';
import { alarms } from '../src/db/schema.js';
import { getKpi, getStats } from '../src/stats/queries.js';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';

let t: TestApp;
let cookie: string;
let siteId: string;
let floorA: string;
let floorB: string;
beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
  siteId = ((await admin('POST', '/api/sites', { name: 'Sample Office' })).json() as { id: string })
    .id;
  const floors = (
    await admin('PUT', `/api/sites/${siteId}/floors`, [
      { name: '1F', elevationMin: 0, elevationMax: 3 },
      { name: '2F', elevationMin: 3, elevationMax: 6 },
    ])
  ).json() as { id: string }[];
  floorA = floors[0]!.id;
  floorB = floors[1]!.id;
  await admin('POST', '/api/devices', {
    id: 'cam-1',
    siteId,
    floorId: floorA,
    type: 'camera',
    name: 'Cam 1',
    position: [1, 1.5, -2],
  });
  const key = (await admin('POST', '/api/integration-keys', { name: 'Hub' })).json() as {
    id: string;
  };
  const row = (
    deviceId: string,
    floorId: string | null,
    eventType: string,
    severity: string,
    at: string,
    acked = false,
  ) => ({
    siteId,
    floorId,
    deviceId,
    integrationKeyId: key.id,
    eventType,
    severity,
    count: 1,
    firstOccurredAt: new Date(at),
    lastOccurredAt: new Date(at),
    lastReceivedAt: new Date(at),
    acknowledgedAt: acked ? new Date(at) : null,
  });
  await t.deps.db
    .insert(alarms)
    .values([
      row('cam-1', floorA, 'intrusion', 'critical', '2026-11-03T23:30:00+09:00'),
      row('cam-1', floorA, 'intrusion', 'critical', '2026-11-04T00:10:00+09:00', true),
      row('cam-1', floorA, 'intrusion', 'major', '2026-11-04T00:50:00+09:00'),
      row('gone-dev', floorB, 'smoke', 'major', '2026-11-04T13:00:00+09:00'),
    ]);
});
afterEach(() => t.close());

const admin = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const stats = (q: {
  from: string;
  to: string;
  bucket: 'hour' | 'day';
  tz?: string;
}): Promise<StatsResponse> => getStats(t.deps.db, { siteId, tz: 'UTC', ...q });
const kpi = (p: { tz: string; now: Date }): Promise<Kpi> => getKpi(t.deps.db, { siteId, ...p });
const http = (q: Record<string, string>) =>
  admin('GET', `/api/stats?${new URLSearchParams({ siteId, ...q })}`);

describe('stats queries', () => {
  test('hourly buckets in Asia/Seoul with zero fill', async () => {
    const r = await stats({
      from: '2026-11-04T00:00:00+09:00',
      to: '2026-11-04T03:00:00+09:00',
      bucket: 'hour',
      tz: 'Asia/Seoul',
    });
    expect(r.timeseries).toEqual([
      { bucketStart: '2026-11-04T00:00', count: 2 },
      { bucketStart: '2026-11-04T01:00', count: 0 },
      { bucketStart: '2026-11-04T02:00', count: 0 },
    ]);
  });

  test('daily buckets', async () => {
    const r = await stats({
      from: '2026-11-03T00:00:00+09:00',
      to: '2026-11-05T00:00:00+09:00',
      bucket: 'day',
      tz: 'Asia/Seoul',
    });
    expect(r.timeseries.map((b) => b.count)).toEqual([1, 3]);
    expect(r.byType).toEqual([
      { eventType: 'intrusion', count: 3 },
      { eventType: 'smoke', count: 1 },
    ]);
    expect(r.bySeverity).toEqual([
      { severity: 'critical', count: 2 },
      { severity: 'major', count: 2 },
    ]);
    expect(r.unacked).toBe(3);
  });

  test('byDevice orders by count and shows null name for deleted devices', async () => {
    const r = await stats({
      from: '2026-11-03T00:00:00+09:00',
      to: '2026-11-05T00:00:00+09:00',
      bucket: 'day',
      tz: 'Asia/Seoul',
    });
    expect(r.byDevice).toEqual([
      { deviceId: 'cam-1', deviceName: 'Cam 1', count: 3 },
      { deviceId: 'gone-dev', deviceName: null, count: 1 },
    ]);
  });

  test('byFloor carries floor names', async () => {
    const r = await stats({
      from: '2026-11-03T00:00:00+09:00',
      to: '2026-11-05T00:00:00+09:00',
      bucket: 'day',
      tz: 'Asia/Seoul',
    });
    expect(r.byFloor).toEqual([
      { floorId: floorA, floorName: '1F', count: 3 },
      { floorId: floorB, floorName: '2F', count: 1 },
    ]);
  });

  test('kpi today', async () => {
    expect(await kpi({ tz: 'Asia/Seoul', now: new Date('2026-11-04T14:00:00+09:00') })).toEqual({
      unacked: 3,
      todayEvents: 3,
    });
  });
});

describe('stats routes', () => {
  test('requires admin', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/stats/kpi?siteId=${siteId}` });
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/stats and /api/stats/kpi', async () => {
    const res = await http({
      from: '2026-11-03T00:00:00+09:00',
      to: '2026-11-05T00:00:00+09:00',
      bucket: 'day',
      tz: 'Asia/Seoul',
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as StatsResponse).unacked).toBe(3);
    t.clock.set('2026-11-04T14:00:00+09:00');
    cookie = await loginCookie(t.app);
    const k = await admin('GET', `/api/stats/kpi?siteId=${siteId}&tz=Asia%2FSeoul`);
    expect(k.json()).toEqual({ unacked: 3, todayEvents: 3 });
  });

  test('hour range over 31 days -> 400 range_too_long', async () => {
    const res = await http({
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-02T00:00:01Z',
      bucket: 'hour',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('range_too_long');
  });

  test('day range over 366 days -> 400 range_too_long', async () => {
    const res = await http({
      from: '2025-01-01T00:00:00Z',
      to: '2026-01-03T00:00:00Z',
      bucket: 'day',
    });
    expect((res.json() as { code: string }).code).toBe('range_too_long');
  });

  test('bad tz -> 400 invalid_tz', async () => {
    const res = await http({
      from: '2026-11-04T00:00:00Z',
      to: '2026-11-05T00:00:00Z',
      bucket: 'day',
      tz: 'Mars/Base',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('invalid_tz');
    const k = await admin('GET', `/api/stats/kpi?siteId=${siteId}&tz=Mars%2FBase`);
    expect((k.json() as { code: string }).code).toBe('invalid_tz');
  });

  test('from >= to -> 400 invalid_range', async () => {
    const res = await http({
      from: '2026-11-05T00:00:00Z',
      to: '2026-11-05T00:00:00Z',
      bucket: 'day',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code: string }).code).toBe('invalid_range');
  });
});
