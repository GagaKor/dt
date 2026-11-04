import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';
import { listenWsUrl, WsClient } from './wsClient.js';

// Lets a test stall the next alarm DTO load right after it read the row, widening the
// window in which a concurrent ack could overtake that publish.
const hooks = vi.hoisted(() => ({ afterNextLoad: null as null | (() => Promise<void>) }));
vi.mock('../src/alarms/dto.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/alarms/dto.js')>();
  return {
    ...mod,
    loadAlarmDto: async (...args: Parameters<typeof mod.loadAlarmDto>) => {
      const dto = await mod.loadAlarmDto(...args);
      const hook = hooks.afterNextLoad;
      hooks.afterNextLoad = null;
      await hook?.();
      return dto;
    },
  };
});

let t: TestApp;
let cookie: string;
let auth: string;
let siteId: string;
let client: WsClient;

const admin = (method: 'POST' | 'PUT', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

beforeEach(async () => {
  t = await createTestApp();
  cookie = await loginCookie(t.app);
  siteId = ((await admin('POST', '/api/sites', { name: 'Sample Office' })).json() as { id: string })
    .id;
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
  auth = `Bearer ${((await admin('POST', '/api/integration-keys', { name: 'Hub' })).json() as { key: string }).key}`;
  client = await WsClient.connect(await listenWsUrl(t.app), cookie);
  await client.subscribe(siteId);
});
afterEach(async () => {
  hooks.afterNextLoad = null;
  await client?.close();
  await t.close();
});

const ingest = () =>
  t.app.inject({
    method: 'POST',
    url: '/api/ingest/events',
    headers: { authorization: auth },
    payload: { deviceId: 'cam-1', eventType: 'intrusion', occurredAt: t.clock.now().toISOString() },
  });

test('an ack racing a merge leaves the client on the acknowledged state', async () => {
  const { alarmId } = (await ingest()).json() as { alarmId: string };
  await client.waitFor('alarm', (m) => m.alarm.id === alarmId);

  let reached!: () => void;
  const mergeLoaded = new Promise<void>((r) => (reached = r));
  hooks.afterNextLoad = async () => {
    reached();
    await new Promise((r) => setTimeout(r, 150));
  };
  t.clock.advance(1_000);
  const merge = ingest();
  await mergeLoaded;
  const ack = admin('POST', `/api/alarms/${alarmId}/ack`, {});
  const [mergeRes, ackRes] = await Promise.all([merge, ack]);
  expect(mergeRes.json()).toMatchObject({ status: 'merged', alarmId });
  expect(ackRes.statusCode).toBe(200);

  const statesOf = () => client.ofType('alarm').filter((m) => m.alarm.id === alarmId);
  await client.waitFor('alarm', () => statesOf().length >= 3);
  const states = statesOf();
  expect(states.map((m) => m.alarm.count)).toEqual([1, 2, 2]);
  expect(states.at(-1)!.alarm.acknowledgedAt).not.toBeNull();
});
