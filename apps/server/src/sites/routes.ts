import multipart from '@fastify/multipart';
import { FloorInputSchema, FloorSchema, ModelUploadResultSchema, SiteSchema } from '@dt/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { sites } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { ModelError, processModel } from '../models/processModel.js';
import {
  commitModelVersion,
  getSiteRow,
  listFloors,
  modelKeyFor,
  replaceFloors,
  toSite,
} from './service.js';

const params = z.object({ siteId: z.uuid() });
const tooLarge = (max: number) => new HttpError(413, 'model_too_large', `Model exceeds ${max} MB`);

export async function registerSiteRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { db, storage, config } = deps;
  const maxBytes = config.MAX_MODEL_MB * 1024 * 1024;
  await app.register(multipart, { limits: { fileSize: maxBytes, files: 1 } });

  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = app.requireAdmin;

  typed.get(
    '/api/sites',
    { preHandler, schema: { response: { 200: z.array(SiteSchema) } } },
    async () => {
      const rows = await db.select().from(sites).orderBy(sites.createdAt);
      return rows.map(toSite);
    },
  );

  typed.post(
    '/api/sites',
    {
      preHandler,
      schema: {
        body: z.object({ name: z.string().trim().min(1).max(200) }),
        response: { 201: SiteSchema },
      },
    },
    async (req, reply) => {
      const [row] = await db.insert(sites).values({ name: req.body.name }).returning();
      return reply.status(201).send(toSite(row!));
    },
  );

  typed.patch(
    '/api/sites/:siteId',
    {
      preHandler,
      schema: {
        params,
        body: z.object({ name: z.string().trim().min(1).max(200) }),
        response: { 200: SiteSchema },
      },
    },
    async (req) => {
      const [row] = await db
        .update(sites)
        .set({ name: req.body.name })
        .where(eq(sites.id, req.params.siteId))
        .returning();
      if (!row) throw new HttpError(404, 'site_not_found', 'Site not found');
      return toSite(row);
    },
  );

  typed.delete(
    '/api/sites/:siteId',
    { preHandler, schema: { params, response: { 204: z.null() } } },
    async (req, reply) => {
      const [row] = await db.delete(sites).where(eq(sites.id, req.params.siteId)).returning();
      if (!row) throw new HttpError(404, 'site_not_found', 'Site not found');
      if (row.modelKey) {
        try {
          await storage.delete(row.modelKey);
        } catch (err) {
          req.log.warn({ err, key: row.modelKey }, 'failed to delete model object');
        }
      }
      return reply.status(204).send(null);
    },
  );

  typed.put(
    '/api/sites/:siteId/model',
    { preHandler, schema: { params, response: { 200: ModelUploadResultSchema } } },
    async (req) => {
      const { siteId } = req.params;
      const site = await getSiteRow(db, siteId);

      let input: Buffer;
      try {
        const file = await req.file();
        if (!file) throw new HttpError(400, 'file_required', 'Multipart field "file" is required');
        input = await file.toBuffer();
        if (file.file.truncated) throw tooLarge(config.MAX_MODEL_MB);
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE')
          throw tooLarge(config.MAX_MODEL_MB);
        throw err;
      }

      let processed;
      try {
        processed = await processModel(input);
      } catch (err) {
        if (err instanceof ModelError) throw new HttpError(422, err.code, err.message, err.details);
        throw err;
      }

      const nextVersion = (site.modelVersion ?? 0) + 1;
      const key = modelKeyFor(siteId, nextVersion);
      await storage.put(key, processed.glb, 'model/gltf-binary');
      const updated = await commitModelVersion(db, siteId, site.modelVersion, key);
      if (!updated) {
        await storage.delete(key).catch(() => undefined);
        throw new HttpError(409, 'model_conflict', 'Model was changed concurrently, retry');
      }
      if (site.modelKey) {
        try {
          await storage.delete(site.modelKey);
        } catch (err) {
          req.log.warn({ err, key: site.modelKey }, 'failed to delete previous model object');
        }
      }
      return {
        site: toSite(updated),
        floorSuggestion: processed.floorSuggestion,
        warnings: processed.warnings,
      };
    },
  );

  typed.get(
    '/api/sites/:siteId/model',
    {
      preHandler,
      schema: { params, querystring: z.object({ v: z.coerce.number().int().optional() }) },
    },
    async (req, reply) => {
      const site = await getSiteRow(db, req.params.siteId);
      if (!site.modelKey || site.modelVersion === null)
        throw new HttpError(404, 'no_model', 'Site has no model');
      const stream = await storage.get(site.modelKey);
      return reply
        .header('Content-Type', 'model/gltf-binary')
        .header(
          'Cache-Control',
          req.query.v === site.modelVersion ? 'private, max-age=31536000, immutable' : 'no-cache',
        )
        .send(stream);
    },
  );

  typed.get(
    '/api/sites/:siteId/floors',
    { preHandler, schema: { params, response: { 200: z.array(FloorSchema) } } },
    async (req) => {
      await getSiteRow(db, req.params.siteId);
      return listFloors(db, req.params.siteId);
    },
  );

  typed.put(
    '/api/sites/:siteId/floors',
    {
      preHandler,
      schema: { params, body: z.array(FloorInputSchema), response: { 200: z.array(FloorSchema) } },
    },
    async (req) => {
      await getSiteRow(db, req.params.siteId);
      return replaceFloors(db, req.params.siteId, req.body);
    },
  );
}
