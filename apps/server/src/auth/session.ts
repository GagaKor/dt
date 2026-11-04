import { createHash, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';

export const SESSION_COOKIE = 'dt_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyInstance {
    requireAdmin: preHandlerAsyncHookHandler;
  }
  interface FastifyRequest {
    adminUser?: string;
  }
}

const payloadSchema = z.object({ u: z.string(), exp: z.number() });

export function verifySessionCookie(
  raw: string | undefined,
  secret: string,
  now: Date,
): { username: string } | null {
  if (!raw) return null;
  const result = cookie.unsign(raw, secret);
  if (!result.valid) return null;
  let json: unknown;
  try {
    json = JSON.parse(result.value);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.exp <= now.getTime()) return null;
  return { username: parsed.data.u };
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function registerAuth(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { config, clock } = deps;
  await app.register(cookie);

  const requireAdmin: preHandlerAsyncHookHandler = async (req) => {
    const session = verifySessionCookie(
      req.cookies[SESSION_COOKIE],
      config.SESSION_SECRET,
      clock(),
    );
    if (!session) throw new HttpError(401, 'unauthenticated', 'Authentication required');
    req.adminUser = session.username;
  };
  app.decorate('requireAdmin', requireAdmin);

  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/auth/login',
    {
      schema: {
        body: z.object({ username: z.string(), password: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const { username, password } = req.body;
      // Evaluate both so timing does not reveal which field was wrong.
      const userOk = safeEqual(username, config.ADMIN_USERNAME);
      const passOk = safeEqual(password, config.ADMIN_PASSWORD);
      if (!userOk || !passOk)
        throw new HttpError(401, 'invalid_credentials', 'Invalid username or password');
      const value = JSON.stringify({
        u: config.ADMIN_USERNAME,
        exp: clock().getTime() + SESSION_TTL_MS,
      });
      reply.setCookie(SESSION_COOKIE, cookie.sign(value, config.SESSION_SECRET), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
      });
      return reply.status(204).send(null);
    },
  );

  typed.post(
    '/api/auth/logout',
    { schema: { response: { 204: z.null() } } },
    async (_req, reply) => {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.status(204).send(null);
    },
  );

  typed.get(
    '/api/auth/me',
    {
      preHandler: requireAdmin,
      schema: { response: { 200: z.object({ username: z.string() }) } },
    },
    async (req) => ({ username: req.adminUser as string }),
  );
}
