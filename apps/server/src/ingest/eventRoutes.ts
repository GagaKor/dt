import { EventMessageSchema } from '@dt/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import type { EventService } from './eventService.js';

const ResultSchema = z.object({
  status: z.enum(['created', 'merged', 'duplicate']),
  alarmId: z.string(),
});

export async function registerEventRoutes(app: FastifyInstance, service: EventService) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/ingest/events',
    {
      preHandler: app.requireIntegrationKey,
      schema: { body: EventMessageSchema, response: { 200: ResultSchema, 201: ResultSchema } },
    },
    async (req, reply) => {
      if (!req.integrationKey) throw new HttpError(401, 'missing_key', 'Integration key required');
      const result = await service.ingest(req.integrationKey, req.body);
      return reply.status(result.status === 'created' ? 201 : 200).send(result);
    },
  );
}
