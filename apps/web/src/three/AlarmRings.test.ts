import type { Alarm, Device } from '@dt/shared';
import { expect, test } from 'vitest';
import { SEVERITY_COLOR } from '../components/severityStyles';
import { alarmRings } from './AlarmRings';

const device = { id: 'cam-1', floorId: 'f2', position: [0, 7, 0] } as unknown as Device;
const alarm = (id: string, severity: Alarm['severity'], floorId = 'f2') =>
  ({ id, deviceId: 'cam-1', floorId, severity, x: 1, y: 2 }) as Alarm;
const flat = () => 4;

test('each ring takes its severity color, like the alarm panel', () => {
  const rings = alarmRings([alarm('a', 'critical'), alarm('b', 'major')], [device], flat, null);
  expect(rings.map((r) => [r.id, r.color])).toEqual([
    ['a', SEVERITY_COLOR.critical],
    ['b', SEVERITY_COLOR.major],
  ]);
});

test('more severe rings draw on top where alarms overlap', () => {
  const [critical, major, info] = alarmRings(
    [alarm('a', 'critical'), alarm('b', 'major'), alarm('c', 'info')],
    [device],
    flat,
    null,
  );
  expect(critical!.renderOrder).toBeGreaterThan(major!.renderOrder);
  expect(major!.renderOrder).toBeGreaterThan(info!.renderOrder);
});

test('with a floor selected, only that floor gets rings', () => {
  const rings = alarmRings(
    [alarm('a', 'critical', 'f1'), alarm('b', 'major')],
    [device],
    flat,
    'f2',
  );
  expect(rings.map((r) => r.id)).toEqual(['b']);
});
