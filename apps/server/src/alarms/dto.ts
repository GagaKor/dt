import type { Alarm, ObjectType, Severity } from '@dt/shared';
import { desc, eq, type SQL } from 'drizzle-orm';
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

export async function queryAlarmDtos(
  db: Db,
  where: SQL | undefined,
  limit: number,
): Promise<Alarm[]> {
  const rows = await db
    .select({ alarm: alarms, deviceName: devices.name, keyName: integrationKeys.name })
    .from(alarms)
    .leftJoin(devices, eq(devices.id, alarms.deviceId))
    .innerJoin(integrationKeys, eq(integrationKeys.id, alarms.integrationKeyId))
    .where(where)
    .orderBy(desc(alarms.lastReceivedAt), desc(alarms.id))
    .limit(limit);
  return rows.map((r) =>
    toAlarmDto(r.alarm, { deviceName: r.deviceName, integrationKeyName: r.keyName }),
  );
}

export async function loadAlarmDto(db: Db, id: string): Promise<Alarm | null> {
  const [dto] = await queryAlarmDtos(db, eq(alarms.id, id), 1);
  return dto ?? null;
}
