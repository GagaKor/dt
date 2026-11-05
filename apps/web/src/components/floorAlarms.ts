import { SEVERITIES, type Alarm, type Device, type Severity } from '@dt/shared';
import { alarmFloorId } from '../three/alarmPoint';

export interface FloorAlarmSummary {
  count: number;
  /** The most severe level among the floor's alarms. */
  severity: Severity;
}

const rank = (s: Severity) => SEVERITIES.indexOf(s);

/** Unacknowledged alarms per floor, for the floor picker; alarms with no known floor are left out. */
export function summarizeAlarmsByFloor(
  alarms: Iterable<Alarm>,
  deviceById: ReadonlyMap<string, Pick<Device, 'floorId'>>,
): Map<string, FloorAlarmSummary> {
  const out = new Map<string, FloorAlarmSummary>();
  for (const a of alarms) {
    const floorId = alarmFloorId(a, deviceById.get(a.deviceId));
    if (!floorId) continue;
    const prev = out.get(floorId);
    out.set(floorId, {
      count: (prev?.count ?? 0) + 1,
      severity: prev && rank(prev.severity) <= rank(a.severity) ? prev.severity : a.severity,
    });
  }
  return out;
}
