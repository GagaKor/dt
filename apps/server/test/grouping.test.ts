import { expect, test } from 'vitest';
import { decideAlarm, situationKey } from '../src/alarms/grouping.js';

const t0 = new Date('2026-11-04T00:00:00Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

test('merges at exactly 10s', () =>
  expect(decideAlarm({ id: 'a', lastReceivedAt: t0 }, at(10_000))).toEqual({
    kind: 'merge',
    alarmId: 'a',
  }));
test('creates after 10s', () =>
  expect(decideAlarm({ id: 'a', lastReceivedAt: t0 }, at(10_001))).toEqual({ kind: 'create' }));
test('creates when none', () => expect(decideAlarm(null, t0)).toEqual({ kind: 'create' }));
test('objectId null differs from a value', () => {
  const b = { integrationKeyId: 'k', deviceId: 'd', eventType: 'e' };
  expect(situationKey({ ...b, objectId: null })).not.toBe(situationKey({ ...b, objectId: 'x' }));
  expect(situationKey({ ...b, objectId: null })).toBe(situationKey({ ...b, objectId: null }));
});
