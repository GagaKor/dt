import { FUTURE_TOLERANCE_MS, PositionBatchSchema } from '@dt/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import type { ObjectUpsert } from './eventService.js';

export async function registerPositionRoutes(app: FastifyInstance, clock: () => Date) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/ingest/positions',
    {
      bodyLimit: 1024 * 1024,
      onRequest: app.requireIntegrationKey,
      schema: {
        security: [{ integrationKey: [] }],
        body: PositionBatchSchema,
        response: { 202: z.object({ accepted: z.number() }) },
      },
    },
    async (req, reply) => {
      const key = req.integrationKey;
      if (!key) throw new HttpError(401, 'missing_key', 'Integration key required');
      const messages = Array.isArray(req.body) ? req.body : [req.body];

      const devices = await app.deviceDirectory.getMany([
        ...new Set(messages.map((m) => m.deviceId)),
      ]);
      const missing = [...new Set(messages.map((m) => m.deviceId))].filter(
        (id) => !devices.has(id),
      );
      if (missing.length > 0)
        throw new HttpError(404, 'unknown_device', 'Unknown device', { deviceIds: missing });

      const limit = clock().getTime() + FUTURE_TOLERANCE_MS;
      if (messages.some((m) => new Date(m.measuredAt).getTime() > limit))
        throw new HttpError(400, 'measured_at_in_future', 'measuredAt is too far in the future');

      const inputs: ObjectUpsert[] = messages.map((m) => {
        const d = devices.get(m.deviceId)!;
        return {
          integrationKeyId: key.id,
          deviceId: m.deviceId,
          siteId: d.siteId,
          floorId: d.floorId,
          x: m.x,
          y: m.y,
          objectId: m.objectId ?? null,
          objectType: m.objectType ?? null,
        };
      });
      app.objectStore.upsertMany(inputs);
      return reply.status(202).send({ accepted: inputs.length });
    },
  );
}
