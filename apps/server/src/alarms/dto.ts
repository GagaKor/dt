import type { Alarm, ObjectType, Severity } from '@dt/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { alarms, devices, integrationKeys } from '../db/schema.js';

type AlarmRow = typeof alarms.$inferSelect;

export function toAlarmDto(
  row: AlarmRow,
  extras: { deviceName: string | null; integrationKeyName: string },
): Alarm {
  return {
    id: row.id,
    siteId: row.siteId,
    floorId: row.floorId,
    deviceId: row.deviceId,
    deviceName: extras.deviceName,
    integrationKeyId: row.integrationKeyId,
    integrationKeyName: extras.integrationKeyName,
    eventType: row.eventType,
    objectId: row.objectId,
    objectType: row.objectType as ObjectType | null,
    severity: row.severity as Severity,
    count: row.count,
    firstOccurredAt: row.firstOccurredAt.toISOString(),
    lastOccurredAt: row.lastOccurredAt.toISOString(),
    lastReceivedAt: row.lastReceivedAt.toISOString(),
    x: row.x,
    y: row.y,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    ackNote: row.ackNote,
  };
}

export async function loadAlarmDto(db: Db, id: string): Promise<Alarm | null> {
  const [r] = await db
    .select({ alarm: alarms, deviceName: devices.name, keyName: integrationKeys.name })
    .from(alarms)
    .leftJoin(devices, eq(devices.id, alarms.deviceId))
    .innerJoin(integrationKeys, eq(integrationKeys.id, alarms.integrationKeyId))
    .where(eq(alarms.id, id));
  return r
    ? toAlarmDto(r.alarm, { deviceName: r.deviceName, integrationKeyName: r.keyName })
    : null;
}
