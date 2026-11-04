import { AlarmSchema, type Alarm } from '@dt/shared';
import { and, desc, eq, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { alarms, devices, integrationKeys } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { EventService } from '../ingest/eventService.js';
import { loadAlarmDto, toAlarmDto } from './dto.js';

const ListQuery = z.object({
  siteId: z.uuid(),
  state: z.enum(['unacked', 'acked', 'all']).default('unacked'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime({ offset: true }).optional(),
});
const AckBody = z.object({ note: z.string().max(500).optional() }).nullish();
const idParams = z.object({ id: z.uuid() });

export async function registerAlarmRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  events: EventService,
): Promise<void> {
  const { db } = deps;
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = app.requireAdmin;

  typed.get(
    '/api/alarms',
    { preHandler, schema: { querystring: ListQuery, response: { 200: z.array(AlarmSchema) } } },
    async (req): Promise<Alarm[]> => {
      const q = req.query;
      const conds: SQL[] = [eq(alarms.siteId, q.siteId)];
      if (q.state === 'unacked') conds.push(isNull(alarms.acknowledgedAt));
      if (q.state === 'acked') conds.push(isNotNull(alarms.acknowledgedAt));
      if (q.before) conds.push(lt(alarms.lastReceivedAt, new Date(q.before)));
      const rows = await db
        .select({ alarm: alarms, deviceName: devices.name, keyName: integrationKeys.name })
        .from(alarms)
        .leftJoin(devices, eq(devices.id, alarms.deviceId))
        .innerJoin(integrationKeys, eq(integrationKeys.id, alarms.integrationKeyId))
        .where(and(...conds))
        .orderBy(desc(alarms.lastReceivedAt), desc(alarms.id))
        .limit(q.limit);
      return rows.map((r) =>
        toAlarmDto(r.alarm, { deviceName: r.deviceName, integrationKeyName: r.keyName }),
      );
    },
  );

  typed.post(
    '/api/alarms/:id/ack',
    { preHandler, schema: { params: idParams, body: AckBody, response: { 200: AlarmSchema } } },
    async (req): Promise<Alarm> => {
      const { id } = req.params;
      const [row] = await db.select().from(alarms).where(eq(alarms.id, id));
      if (!row) throw new HttpError(404, 'alarm_not_found', 'Alarm not found');
      if (!row.acknowledgedAt) {
        // Guarded so a concurrent first ack cannot overwrite the recorded time.
        await db
          .update(alarms)
          .set({ acknowledgedAt: deps.clock(), ackNote: req.body?.note ?? null })
          .where(and(eq(alarms.id, id), isNull(alarms.acknowledgedAt)));
      }
      const dto = await loadAlarmDto(db, id);
      if (!dto) throw new HttpError(404, 'alarm_not_found', 'Alarm not found');
      events.publishAlarm(dto, false);
      return dto;
    },
  );
}
