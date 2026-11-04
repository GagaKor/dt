import type { Alarm, ObjectStateWire, ServerMessage, SiteSummary } from '@dt/shared';
import { beforeEach, expect, test } from 'vitest';
import { MAX_TOASTS, useRealtimeStore, visibleObjectCount } from './store';

const obj = (key: string, over: Partial<ObjectStateWire> = {}): ObjectStateWire => ({
  key,
  siteId: 's1',
  floorId: 'f1',
  deviceId: 'cam-1',
  x: 1,
  y: 2,
  objectId: key,
  objectType: 'person',
  ageMs: 0,
  ...over,
});

const T0 = '2026-11-04T01:00:00.000Z';
const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 'A1',
  siteId: 's1',
  floorId: 'f1',
  deviceId: 'cam-1',
  deviceName: 'Lobby camera',
  integrationKeyId: 'k1',
  integrationKeyName: 'sim',
  eventType: 'intrusion',
  objectId: null,
  objectType: null,
  severity: 'critical',
  count: 1,
  firstOccurredAt: T0,
  lastOccurredAt: T0,
  lastReceivedAt: T0,
  x: 1,
  y: 2,
  acknowledgedAt: null,
  ackNote: null,
  ...over,
});

const site = (siteId: string, unacked = 0): SiteSummary => ({
  siteId,
  siteName: `Site ${siteId}`,
  unacked,
});

const snapshot = (
  siteId: string,
  over: Partial<Extract<ServerMessage, { type: 'snapshot' }>> = {},
): ServerMessage => ({ type: 'snapshot', siteId, objects: [], alarms: [], sites: [], ...over });

const notice = (siteId: string, alarmId = `n-${siteId}`): ServerMessage => ({
  type: 'summary',
  sites: [site('s1', 1), site('s2', 1)],
  newAlarm: {
    alarmId,
    siteId,
    siteName: `Site ${siteId}`,
    severity: 'critical',
    eventType: 'intrusion',
  },
});

const state = () => useRealtimeStore.getState();

beforeEach(() => state().reset());

test('snapshot replaces stale objects', () => {
  const s = useRealtimeStore.getState();
  s.apply({ type: 'objects', siteId: 's1', objects: [obj('old')] }, 0);
  s.apply(
    {
      type: 'snapshot',
      siteId: 's1',
      objects: [obj('new', { ageMs: 500 })],
      alarms: [],
      sites: [],
    },
    10_000,
  );
  expect([...useRealtimeStore.getState().objects.keys()]).toEqual(['new']);
  expect(useRealtimeStore.getState().objects.get('new')!.lastSeenMs).toBe(9_500);
});

test('ping messages leave the state untouched', () => {
  state().apply(snapshot('s1', { alarms: [alarm()], sites: [site('s1', 1)] }), 0);
  const before = state();
  state().apply({ type: 'ping', t: 1 }, 10);
  expect(state()).toBe(before);
});

test('snapshot sets the site, alarms and site summary', () => {
  state().apply(snapshot('s1', { alarms: [alarm()], sites: [site('s1', 1)] }), 0);
  expect(state().siteId).toBe('s1');
  expect([...state().alarms.keys()]).toEqual(['A1']);
  expect(state().sites).toEqual([site('s1', 1)]);
});

test('objects messages upsert with lastSeenMs = now and ignore other sites', () => {
  state().apply(snapshot('s1', { objects: [obj('a', { ageMs: 100 })] }), 1_000);
  state().apply(
    { type: 'objects', siteId: 's1', objects: [obj('a', { x: 5, ageMs: 150 }), obj('b')] },
    2_000,
  );
  state().apply({ type: 'objects', siteId: 's2', objects: [obj('c', { siteId: 's2' })] }, 2_000);
  const objects = state().objects;
  expect([...objects.keys()].sort()).toEqual(['a', 'b']);
  expect(objects.get('a')).toMatchObject({ x: 5, lastSeenMs: 2_000 });
  expect(objects.get('b')!.lastSeenMs).toBe(2_000);
});

test('acked alarm leaves the map', () => {
  state().apply(snapshot('s1'), 0);
  state().apply({ type: 'alarm', alarm: alarm(), created: true }, 0);
  expect(state().alarms.size).toBe(1);
  state().apply({ type: 'alarm', alarm: alarm({ count: 2 }), created: false }, 0);
  expect(state().alarms.get('A1')!.count).toBe(2);
  state().apply(
    { type: 'alarm', alarm: alarm({ acknowledgedAt: '2026-11-04T01:01:00.000Z' }), created: false },
    0,
  );
  expect(state().alarms.size).toBe(0);
});

test('alarms of other sites are ignored', () => {
  state().apply(snapshot('s1'), 0);
  state().apply({ type: 'alarm', alarm: alarm({ id: 'B1', siteId: 's2' }), created: true }, 0);
  expect(state().alarms.size).toBe(0);
});

test('summary toast only for sites not being viewed', () => {
  state().apply(snapshot('s1'), 0);
  state().setViewedSite('s1');
  state().apply(notice('s1'), 0);
  expect(state().toasts).toHaveLength(0);
  state().apply(notice('s2'), 0);
  expect(state().toasts).toHaveLength(1);
  expect(state().toasts[0]).toMatchObject({ siteId: 's2', siteName: 'Site s2' });
  expect(state().sites).toEqual([site('s1', 1), site('s2', 1)]);
});

test('the subscribed site still toasts while no site is being viewed', () => {
  state().watch('s1');
  state().apply(snapshot('s1'), 0);
  state().apply(notice('s1'), 0);
  expect(state().toasts).toHaveLength(1);
  expect(state().toasts[0]).toMatchObject({ siteId: 's1' });
});

test('viewing a site only silences that site', () => {
  state().watch('s1');
  state().setViewedSite('s2');
  state().apply(notice('s2'), 0);
  expect(state().toasts).toHaveLength(0);
  state().apply(notice('s1'), 0);
  expect(state().toasts.map((t) => t.siteId)).toEqual(['s1']);
  state().setViewedSite(null);
  state().apply(notice('s2', 'later'), 0);
  expect(state().toasts.map((t) => t.siteId)).toEqual(['s1', 's2']);
});

test('summary without a notice only replaces the sites', () => {
  state().apply(snapshot('s1'), 0);
  state().apply({ type: 'summary', sites: [site('s1', 4)], newAlarm: null }, 0);
  expect(state().sites).toEqual([site('s1', 4)]);
  expect(state().toasts).toHaveLength(0);
});

test('toasts are de-duplicated, capped and dismissable', () => {
  state().apply(snapshot('s1'), 0);
  state().apply(notice('s2', 'x'), 0);
  state().apply(notice('s2', 'x'), 0);
  expect(state().toasts).toHaveLength(1);
  for (let i = 0; i < MAX_TOASTS + 2; i++) state().apply(notice('s2', `n${i}`), 0);
  expect(state().toasts).toHaveLength(MAX_TOASTS);
  expect(state().toasts.at(-1)!.id).toBe(`n${MAX_TOASTS + 1}`);
  state().dismissToast(`n${MAX_TOASTS + 1}`);
  expect(state().toasts.map((t) => t.id)).not.toContain(`n${MAX_TOASTS + 1}`);
});

test('prune drops objects older than 4000ms', () => {
  state().apply(snapshot('s1', { objects: [obj('a')] }), 0);
  const before = state().objects;
  state().prune(3_999);
  expect(state().objects.has('a')).toBe(true);
  expect(state().objects).toBe(before);
  state().prune(4_000);
  expect(state().objects.has('a')).toBe(false);
});

test('watch switches site and drops the previous site data', () => {
  state().apply(snapshot('s1', { objects: [obj('a')], alarms: [alarm()] }), 0);
  state().watch('s1');
  expect(state().objects.size).toBe(1);
  state().watch('s2');
  expect(state().siteId).toBe('s2');
  expect(state().objects.size).toBe(0);
  expect(state().alarms.size).toBe(0);
  // A late snapshot of the old site must not take the store back.
  state().apply(snapshot('s1', { objects: [obj('a')], sites: [site('s1', 3)] }), 0);
  expect(state().siteId).toBe('s2');
  expect(state().objects.size).toBe(0);
  expect(state().sites).toEqual([site('s1', 3)]);
});

test('a refused site is remembered until it is watched again', () => {
  state().watch('s9');
  state().reject('s9');
  expect(state().rejectedSiteId).toBe('s9');
  state().watch('s1');
  expect(state().rejectedSiteId).toBe('s9');
  state().watch('s9');
  expect(state().rejectedSiteId).toBeNull();
});

test('visibleObjectCount counts objects that still have opacity', () => {
  state().apply(snapshot('s1', { objects: [obj('a'), obj('b', { ageMs: 3_999 })] }), 4_000);
  expect(visibleObjectCount(state().objects, 4_000)).toBe(2);
  expect(visibleObjectCount(state().objects, 4_001)).toBe(1);
});

test('snapshotSiteId is set only by a snapshot and cleared by watch', () => {
  state().watch('s1');
  expect(state().snapshotSiteId).toBeNull();
  state().apply(snapshot('s1'), 0);
  expect(state().snapshotSiteId).toBe('s1');
  state().watch('s2');
  expect(state().snapshotSiteId).toBeNull();
});
