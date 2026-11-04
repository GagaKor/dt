import {
  FUTURE_TOLERANCE_MS,
  maxSeverity,
  type Alarm,
  type EventMessage,
  type ObjectType,
  type Severity,
} from '@dt/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { decideAlarm, situationKey, type SituationParts } from '../alarms/grouping.js';
import { loadAlarmDto } from '../alarms/dto.js';
import type { Db } from '../db/client.js';
import { alarms, events } from '../db/schema.js';
import type { DeviceDirectory } from '../devices/directory.js';
import { HttpError } from '../errors.js';
import type { IntegrationKeyRecord } from '../keys/keyAuth.js';
import type { KeyedMutex } from '../lib/keyedMutex.js';

export interface ObjectUpsert {
  integrationKeyId: string;
  deviceId: string;
  siteId: string;
  floorId: string;
  x: number;
  y: number;
  objectId: string | null;
  objectType: ObjectType | null;
}

export interface ObjectSink {
  upsert(input: ObjectUpsert): void;
}

export interface AlarmPublisher {
  alarmChanged(alarm: Alarm, created: boolean): void;
}

export interface IngestEventResult {
  status: 'created' | 'merged' | 'duplicate';
  alarmId: string;
}

export interface EventServiceDeps {
  db: Db;
  devices: DeviceDirectory;
  mutex: KeyedMutex;
  objects: ObjectSink;
  publisher: AlarmPublisher;
  clock: () => Date;
  log: Pick<FastifyBaseLogger, 'error'>;
}

const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string }).code === '23505' ||
  (err as { cause?: { code?: string } }).cause?.code === '23505';

export class EventService {
  constructor(private readonly d: EventServiceDeps) {}

  setObjectSink(objects: ObjectSink): void {
    this.d.objects = objects;
  }

  setPublisher(publisher: AlarmPublisher): void {
    this.d.publisher = publisher;
  }

  // Callers hold the situation lock so publishes for one alarm leave in commit order.
  // Failures are only logged: the change is already committed and a 500 would invite a retry.
  publishAlarm(alarm: Alarm, created: boolean): void {
    try {
      this.d.publisher.alarmChanged(alarm, created);
    } catch (err) {
      this.d.log.error({ err, alarmId: alarm.id }, 'alarm publish failed');
    }
  }

  withSituationLock<T>(parts: SituationParts, fn: () => Promise<T>): Promise<T> {
    return this.d.mutex.run(`alarm:${situationKey(parts)}`, fn);
  }

  private async publishCommitted(alarmId: string, created: boolean): Promise<void> {
    let dto: Alarm | null;
    try {
      dto = await loadAlarmDto(this.d.db, alarmId);
    } catch (err) {
      this.d.log.error({ err, alarmId }, 'alarm publish failed');
      return;
    }
    if (dto) this.publishAlarm(dto, created);
  }

  async ingest(key: IntegrationKeyRecord, msg: EventMessage): Promise<IngestEventResult> {
    const { db } = this.d;
    const device = await this.d.devices.get(msg.deviceId);
    if (!device) throw new HttpError(404, 'unknown_device', 'Unknown device');

    const occurredAt = new Date(msg.occurredAt);
    if (occurredAt.getTime() > this.d.clock().getTime() + FUTURE_TOLERANCE_MS)
      throw new HttpError(400, 'occurred_at_in_future', 'occurredAt is too far in the future');

    const severity: Severity = msg.severity ?? key.defaultSeverity;
    const objectId = msg.objectId ?? null;
    const objectType = msg.objectType ?? null;
    const hasPosition = msg.x !== undefined && msg.y !== undefined;

    const findDuplicate = async (): Promise<IngestEventResult | null> => {
      if (msg.eventId === undefined) return null;
      const [dup] = await db
        .select({ alarmId: events.alarmId })
        .from(events)
        .where(and(eq(events.integrationKeyId, key.id), eq(events.externalEventId, msg.eventId)));
      return dup ? { status: 'duplicate', alarmId: dup.alarmId } : null;
    };

    const situation: SituationParts = {
      integrationKeyId: key.id,
      deviceId: msg.deviceId,
      eventType: msg.eventType,
      objectId,
    };

    let outcome: IngestEventResult | null;
    try {
      outcome = await this.withSituationLock(situation, async () => {
        const dup = await findDuplicate();
        if (dup) return dup;

        // Taken inside the lock so lastReceivedAt never moves backwards for one situation.
        const receivedAt = this.d.clock();
        const [existing] = await db
          .select()
          .from(alarms)
          .where(
            and(
              eq(alarms.integrationKeyId, key.id),
              eq(alarms.deviceId, msg.deviceId),
              eq(alarms.eventType, msg.eventType),
              objectId === null ? isNull(alarms.objectId) : eq(alarms.objectId, objectId),
            ),
          )
          .orderBy(desc(alarms.lastReceivedAt))
          .limit(1);
        const decision = decideAlarm(existing ?? null, receivedAt);

        const alarmId = await db.transaction(async (tx) => {
          let id: string;
          if (decision.kind === 'merge' && existing) {
            id = existing.id;
            await tx
              .update(alarms)
              .set({
                count: existing.count + 1,
                severity: maxSeverity(existing.severity as Severity, severity),
                lastOccurredAt:
                  occurredAt > existing.lastOccurredAt ? occurredAt : existing.lastOccurredAt,
                lastReceivedAt: receivedAt,
                ...(hasPosition ? { x: msg.x, y: msg.y } : {}),
                ...(objectType ? { objectType } : {}),
              })
              .where(eq(alarms.id, id));
          } else {
            const [row] = await tx
              .insert(alarms)
              .values({
                siteId: device.siteId,
                floorId: device.floorId,
                deviceId: msg.deviceId,
                integrationKeyId: key.id,
                eventType: msg.eventType,
                objectId,
                objectType,
                severity,
                count: 1,
                firstOccurredAt: occurredAt,
                lastOccurredAt: occurredAt,
                lastReceivedAt: receivedAt,
                x: msg.x ?? null,
                y: msg.y ?? null,
              })
              .returning({ id: alarms.id });
            id = (row as { id: string }).id;
          }
          await tx.insert(events).values({
            alarmId: id,
            integrationKeyId: key.id,
            externalEventId: msg.eventId ?? null,
            deviceId: msg.deviceId,
            eventType: msg.eventType,
            severity,
            occurredAt,
            receivedAt,
            x: msg.x ?? null,
            y: msg.y ?? null,
            objectId,
            objectType,
          });
          return id;
        });
        const created = decision.kind === 'create';
        await this.publishCommitted(alarmId, created);
        return { status: created ? 'created' : 'merged', alarmId };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      outcome = null;
    }

    if (outcome === null) {
      const dup = await findDuplicate();
      if (!dup) throw new HttpError(409, 'conflict', 'Conflicting event');
      return dup;
    }
    if (outcome.status === 'duplicate') return outcome;

    if (hasPosition) {
      try {
        this.d.objects.upsert({
          integrationKeyId: key.id,
          deviceId: msg.deviceId,
          siteId: device.siteId,
          floorId: device.floorId,
          x: msg.x as number,
          y: msg.y as number,
          objectId,
          objectType,
        });
      } catch (err) {
        this.d.log.error({ err, alarmId: outcome.alarmId }, 'object upsert from event failed');
      }
    }
    return outcome;
  }
}
