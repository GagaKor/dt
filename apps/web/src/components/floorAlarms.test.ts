import type { Alarm, Device } from '@dt/shared';
import { expect, test } from 'vitest';
import { summarizeAlarmsByFloor } from './floorAlarms';

const alarm = (
  id: string,
  floorId: string | null,
  severity: Alarm['severity'],
  deviceId = 'cam-1',
) => ({ id, floorId, severity, deviceId }) as Alarm;
const devices = new Map([['cam-2', { floorId: 'f2' } as Device]]);

test('counts alarms per floor, falling back to the reporting device floor', () => {
  const summary = summarizeAlarmsByFloor(
    [alarm('a', 'f1', 'minor'), alarm('b', 'f1', 'info'), alarm('c', null, 'major', 'cam-2')],
    devices,
  );
  expect(summary.get('f1')?.count).toBe(2);
  expect(summary.get('f2')?.count).toBe(1);
});

test('keeps the most severe level of each floor', () => {
  const summary = summarizeAlarmsByFloor(
    [alarm('a', 'f1', 'minor'), alarm('b', 'f1', 'critical'), alarm('c', 'f1', 'major')],
    devices,
  );
  expect(summary.get('f1')).toEqual({ count: 3, severity: 'critical' });
});

test('skips alarms whose floor is unknown', () => {
  const summary = summarizeAlarmsByFloor([alarm('a', null, 'critical', 'gone')], devices);
  expect(summary.size).toBe(0);
});
