import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { registerAuth } from './auth/session.js';
import { HttpError } from './errors.js';
import { KeyedMutex } from './lib/keyedMutex.js';
import { DeviceDirectory } from './devices/directory.js';
import { registerDeviceRoutes } from './devices/routes.js';
import { registerSiteRoutes } from './sites/routes.js';
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
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send({ code: 'not_found', message: 'Route not found' }),
  );

  await app.register(swagger, {
    openapi: { info: { title: 'dt API', version: '0.1.0' } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await registerAuth(app, deps);

  const deviceDirectory = new DeviceDirectory(deps.db);
  app.decorate('deviceDirectory', deviceDirectory);
  await registerSiteRoutes(app, deps, new KeyedMutex(), deviceDirectory);
  await registerDeviceRoutes(app, deps, deviceDirectory);

  const typed = app.withTypeProvider<ZodTypeProvider>();
  typed.get(
    '/api/health',
    { schema: { response: { 200: z.object({ status: z.literal('ok') }) } } },
    async () => ({ status: 'ok' as const }),
  );
  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  return app;
}
