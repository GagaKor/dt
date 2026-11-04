import websocket from '@fastify/websocket';
import { REALTIME_CLOSE_CODES } from '@dt/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { readSessionFromCookieHeader } from '../auth/session.js';
import type { RealtimeHub } from './hub.js';

export async function registerRealtimeRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  hub: RealtimeHub,
): Promise<void> {
  // Clients only ever send small subscribe messages.
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });

  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const session = readSessionFromCookieHeader(
      req.headers.cookie,
      deps.config.SESSION_SECRET,
      deps.clock(),
    );
    if (!session) {
      socket.close(REALTIME_CLOSE_CODES.unauthenticated, 'unauthenticated');
      return;
    }
    hub.handleConnection(socket, session.exp);
  });
}
