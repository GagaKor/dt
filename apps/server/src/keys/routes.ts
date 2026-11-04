import {
  CreatedIntegrationKeySchema,
  IntegrationKeySchema,
  SEVERITIES,
  type IntegrationKey,
} from '@dt/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { integrationKeys } from '../db/schema.js';
import { HttpError } from '../errors.js';
import {
  generateKey,
  parseBearer,
  type IntegrationKeyRecord,
  type KeyAuthenticator,
} from './keyAuth.js';

declare module 'fastify' {
  interface FastifyInstance {
    keyAuth: KeyAuthenticator;
    requireIntegrationKey: preHandlerAsyncHookHandler;
  }
  interface FastifyRequest {
    integrationKey?: IntegrationKeyRecord;
  }
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(100),
  defaultSeverity: z.enum(SEVERITIES).optional(),
});
const PatchBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  defaultSeverity: z.enum(SEVERITIES).optional(),
});
const idParams = z.object({ id: z.uuid() });

type KeyRow = typeof integrationKeys.$inferSelect;

function toKey(r: KeyRow): IntegrationKey {
  return {
    id: r.id,
    name: r.name,
    prefix: r.keyPrefix,
    defaultSeverity: r.defaultSeverity as IntegrationKey['defaultSeverity'],
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  };
}

export async function registerKeyRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  keyAuth: KeyAuthenticator,
): Promise<void> {
  const { db } = deps;
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = app.requireAdmin;

  app.decorate('keyAuth', keyAuth);
  const requireIntegrationKey: preHandlerAsyncHookHandler = async (req) => {
    if (!parseBearer(req.headers.authorization))
      throw new HttpError(401, 'missing_key', 'Bearer integration key required');
    const record = await keyAuth.authenticate(req.headers.authorization);
    if (!record) throw new HttpError(401, 'invalid_key', 'Invalid or revoked integration key');
    req.integrationKey = record;
  };
  app.decorate('requireIntegrationKey', requireIntegrationKey);

  typed.get(
    '/api/integration-keys',
    { preHandler, schema: { response: { 200: z.array(IntegrationKeySchema) } } },
    async () => {
      const rows = await db
        .select()
        .from(integrationKeys)
        .orderBy(asc(integrationKeys.createdAt), asc(integrationKeys.id));
      return rows.map(toKey);
    },
  );

  typed.post(
    '/api/integration-keys',
    { preHandler, schema: { body: CreateBody, response: { 201: CreatedIntegrationKeySchema } } },
    async (req, reply) => {
      const k = generateKey();
      const [row] = await db
        .insert(integrationKeys)
        .values({
          name: req.body.name,
          keyHash: k.hash,
          keyPrefix: k.prefix,
          defaultSeverity: req.body.defaultSeverity ?? 'critical',
        })
        .returning();
      keyAuth.invalidate();
      return reply.status(201).send({ ...toKey(row as KeyRow), key: k.plaintext });
    },
  );

  typed.patch(
    '/api/integration-keys/:id',
    {
      preHandler,
      schema: { params: idParams, body: PatchBody, response: { 200: IntegrationKeySchema } },
    },
    async (req) => {
      const { name, defaultSeverity } = req.body;
      const [cur] = await db
        .select()
        .from(integrationKeys)
        .where(eq(integrationKeys.id, req.params.id));
      if (!cur) throw new HttpError(404, 'key_not_found', 'Integration key not found');
      const [row] = await db
        .update(integrationKeys)
        .set({
          name: name ?? cur.name,
          defaultSeverity: defaultSeverity ?? cur.defaultSeverity,
        })
        .where(eq(integrationKeys.id, cur.id))
        .returning();
      keyAuth.invalidate();
      return toKey(row as KeyRow);
    },
  );

  typed.delete(
    '/api/integration-keys/:id',
    { preHandler, schema: { params: idParams, response: { 204: z.null() } } },
    async (req, reply) => {
      const [cur] = await db
        .select()
        .from(integrationKeys)
        .where(eq(integrationKeys.id, req.params.id));
      if (!cur) throw new HttpError(404, 'key_not_found', 'Integration key not found');
      if (!cur.revokedAt) {
        await db
          .update(integrationKeys)
          .set({ revokedAt: deps.clock() })
          .where(eq(integrationKeys.id, cur.id));
        keyAuth.invalidate();
      }
      return reply.status(204).send(null);
    },
  );
}
