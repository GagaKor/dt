import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OBJECTS_BROADCAST_INTERVAL_MS } from '@dt/shared';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { registerAuth } from './auth/session.js';
import { HttpError } from './errors.js';
import { KeyedMutex } from './lib/keyedMutex.js';
import { DeviceDirectory } from './devices/directory.js';
import { registerAlarmRoutes } from './alarms/routes.js';
import { EventService } from './ingest/eventService.js';
import { registerEventRoutes } from './ingest/eventRoutes.js';
import { registerPositionRoutes } from './ingest/positionRoutes.js';
import { ObjectStore } from './objects/objectStore.js';
import { RealtimeHub } from './realtime/hub.js';
import { registerRealtimeRoutes } from './realtime/routes.js';
import { registerDeviceRoutes } from './devices/routes.js';
import { KeyAuthenticator } from './keys/keyAuth.js';
import { registerKeyRoutes } from './keys/routes.js';
import { registerSiteRoutes } from './sites/routes.js';
import { registerStatsRoutes } from './stats/routes.js';
import type { ObjectStorage } from './storage/types.js';

export interface AppDeps {
  config: Config;
  db: Db;
  storage: ObjectStorage;
  clock: () => Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    deviceDirectory: DeviceDirectory;
    eventService: EventService;
    objectStore: ObjectStore;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: deps.config.LOG_LEVEL },
    bodyLimit: deps.config.MAX_MODEL_MB * 1024 * 1024,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply
        .status(err.statusCode)
        .send({ code: err.code, message: err.message, details: err.details });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'Request validation failed',
        details: err.validation,
      });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({ code: 'bad_request', message: (err as Error).message });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ code: 'internal_error', message: 'Internal server error' });
  });
  const webDist = deps.config.WEB_DIST_DIR;
  // Read once: reply.sendFile inside the not-found handler runs on a reply static already used.
  const indexHtml = webDist ? await readFile(resolve(webDist, 'index.html')) : undefined;
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '';
    const isApi = path === '/api' || path.startsWith('/api/');
    if (indexHtml && req.method === 'GET' && !isApi)
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-cache')
        .send(indexHtml);
    return reply.status(404).send({ code: 'not_found', message: 'Route not found' });
  });

  if (webDist) await app.register(fastifyStatic, { root: resolve(webDist) });

  await app.register(swagger, {
    openapi: { info: { title: 'dt API', version: '0.1.0' } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await registerAuth(app, deps);

  const deviceDirectory = new DeviceDirectory(deps.db);
  app.decorate('deviceDirectory', deviceDirectory);
  const mutex = new KeyedMutex();
  await registerSiteRoutes(app, deps, mutex, deviceDirectory);
  await registerDeviceRoutes(app, deps, deviceDirectory);

  await registerKeyRoutes(app, deps, new KeyAuthenticator(deps.db));

  const objectStore = new ObjectStore(
    () => deps.clock().getTime(),
    () => undefined,
    app.log,
  );
  app.decorate('objectStore', objectStore);
  const sweepTimer = setInterval(() => objectStore.sweep(), 1000);
  app.addHook('onClose', async () => clearInterval(sweepTimer));

  const hub = new RealtimeHub({
    db: deps.db,
    objects: objectStore,
    intervalMs: OBJECTS_BROADCAST_INTERVAL_MS,
    log: app.log,
  });
  objectStore.setOnChange((siteId, states) => hub.objectsChanged(siteId, states));
  app.addHook('onClose', () => hub.close());

  const eventService = new EventService({
    db: deps.db,
    devices: deviceDirectory,
    mutex,
    objects: objectStore,
    publisher: hub,
    clock: deps.clock,
    log: app.log,
  });
  app.decorate('eventService', eventService);
  await registerEventRoutes(app, eventService);
  await registerPositionRoutes(app, deps.clock);
  await registerAlarmRoutes(app, deps, eventService);
  await registerRealtimeRoutes(app, deps, hub);
  await registerStatsRoutes(app, deps);

  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.get(
    '/api/health',
    { schema: { response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  return app;
}
