import {
  REALTIME_CLOSE_CODES,
  type Alarm,
  type ClientMessage,
  type NewAlarmNotice,
  type ObjectStateWire,
  type ServerMessage,
  type Severity,
  type SiteSummary,
} from '@dt/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import { queryAlarmDtos } from '../alarms/dto.js';
import type { Db } from '../db/client.js';
import { alarms, sites } from '../db/schema.js';
import type { AlarmPublisher } from '../ingest/eventService.js';
import type { ObjectStore } from '../objects/objectStore.js';

export const SNAPSHOT_ALARM_LIMIT = 200;
// A client this far behind is dropped; it reconnects and gets a fresh snapshot.
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const NOTICE_SEVERITIES: ReadonlySet<Severity> = new Set(['critical', 'major']);

const ClientMessageSchema = z.object({
  type: z.literal('subscribe'),
  siteId: z.uuid(),
}) satisfies z.ZodType<ClientMessage>;

export interface RealtimeHubDeps {
  db: Db;
  objects: ObjectStore;
  intervalMs: number;
  /** Ping period; session expiry is checked on the same tick. */
  heartbeatMs: number;
  /** Epoch ms. */
  clock: () => number;
  log?: Pick<FastifyBaseLogger, 'error'>;
}

interface Client {
  siteId: string | null;
  /** Session expiry, epoch ms; the socket is closed with 4401 once it passes. */
  sessionExp: number;
}

export class RealtimeHub implements AlarmPublisher {
  private readonly clients = new Map<WebSocket, Client>();
  private readonly pendingObjects = new Map<string, Map<string, ObjectStateWire>>();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly heartbeatTimer: NodeJS.Timeout;
  // Snapshots and alarm pushes run one at a time, in call order, so no client can see an
  // older alarm state or summary after a newer one.
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(private readonly d: RealtimeHubDeps) {
    this.heartbeatTimer = setInterval(() => this.heartbeat(), d.heartbeatMs);
  }

  handleConnection(socket: WebSocket, sessionExp: number): void {
    if (this.closed) {
      socket.close(1001, 'server shutting down');
      return;
    }
    const client: Client = { siteId: null, sessionExp };
    this.clients.set(socket, client);
    const drop = () => this.clients.delete(socket);
    socket.on('close', drop);
    socket.on('error', drop);
    socket.on('message', (data, isBinary) => {
      const msg = isBinary ? null : parseClientMessage(data.toString());
      if (!msg) {
        socket.close(REALTIME_CLOSE_CODES.badMessage, 'malformed message');
        return;
      }
      this.enqueue(() => this.subscribe(socket, client, msg.siteId));
    });
  }

  alarmChanged(alarm: Alarm, created: boolean): void {
    if (this.closed) return;
    this.enqueue(async () => {
      this.sendToSite(alarm.siteId, { type: 'alarm', alarm, created });
      // A merge into an unacknowledged alarm cannot change any site's unacked count.
      if (!created && alarm.acknowledgedAt === null) return;
      const summary = await this.loadSummary();
      const site = summary.find((s) => s.siteId === alarm.siteId);
      const newAlarm: NewAlarmNotice | null =
        created && site && NOTICE_SEVERITIES.has(alarm.severity)
          ? {
              alarmId: alarm.id,
              siteId: alarm.siteId,
              siteName: site.siteName,
              severity: alarm.severity,
              eventType: alarm.eventType,
            }
          : null;
      this.broadcast({ type: 'summary', sites: summary, newAlarm });
    });
  }

  objectsChanged(siteId: string, states: ObjectStateWire[]): void {
    // Unwatched sites need no buffer: a later subscriber reads the store in its snapshot.
    if (this.closed || states.length === 0 || !this.hasSubscriber(siteId)) return;
    let buffer = this.pendingObjects.get(siteId);
    if (!buffer) {
      buffer = new Map();
      this.pendingObjects.set(siteId, buffer);
    }
    for (const state of states) buffer.set(state.key, state);
    this.flushTimer ??= setTimeout(() => this.flushObjects(), this.d.intervalMs);
  }

  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.heartbeatTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pendingObjects.clear();
    for (const socket of this.clients.keys()) socket.close(1001, 'server shutting down');
    this.clients.clear();
    await this.queue;
  }

  private async subscribe(socket: WebSocket, client: Client, siteId: string): Promise<void> {
    if (socket.readyState !== WebSocket.OPEN) return;
    try {
      const summary = await this.loadSummary();
      if (!summary.some((s) => s.siteId === siteId)) {
        socket.close(REALTIME_CLOSE_CODES.unknownSite, 'unknown site');
        return;
      }
      const unacked = await queryAlarmDtos(
        this.d.db,
        and(eq(alarms.siteId, siteId), isNull(alarms.acknowledgedAt)),
        SNAPSHOT_ALARM_LIMIT,
      );
      if (socket.readyState !== WebSocket.OPEN) return;
      // Switched only now, together with reading the object store, so nothing for the new
      // site reaches the client before its snapshot.
      client.siteId = siteId;
      this.send(socket, {
        type: 'snapshot',
        siteId,
        objects: this.d.objects.listSite(siteId),
        alarms: unacked,
        sites: summary,
      });
    } catch (err) {
      this.d.log?.error({ err, siteId }, 'realtime snapshot failed');
      socket.close(1011, 'snapshot failed');
    }
  }

  private heartbeat(): void {
    const now = this.d.clock();
    for (const [socket, c] of this.clients) {
      if (c.sessionExp > now) continue;
      this.clients.delete(socket);
      socket.close(REALTIME_CLOSE_CODES.unauthenticated, 'session expired');
    }
    this.broadcast({ type: 'ping', t: now });
  }

  private loadSummary(): Promise<SiteSummary[]> {
    return this.d.db
      .select({ siteId: sites.id, siteName: sites.name, unacked: count(alarms.id) })
      .from(sites)
      .leftJoin(alarms, and(eq(alarms.siteId, sites.id), isNull(alarms.acknowledgedAt)))
      .groupBy(sites.id)
      .orderBy(sites.name, sites.id);
  }

  private flushObjects(): void {
    this.flushTimer = null;
    for (const [siteId, buffer] of this.pendingObjects) {
      if (buffer.size > 0) {
        this.sendToSite(siteId, { type: 'objects', siteId, objects: [...buffer.values()] });
      }
    }
    this.pendingObjects.clear();
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue
      .then(() => (this.closed ? undefined : task()))
      .catch((err: unknown) => this.d.log?.error({ err }, 'realtime task failed'));
  }

  private hasSubscriber(siteId: string): boolean {
    for (const c of this.clients.values()) if (c.siteId === siteId) return true;
    return false;
  }

  private sendToSite(siteId: string, msg: ServerMessage): void {
    let data: string | null = null;
    for (const [socket, c] of this.clients) {
      if (c.siteId !== siteId) continue;
      data ??= JSON.stringify(msg);
      this.sendRaw(socket, data);
    }
  }

  private broadcast(msg: ServerMessage): void {
    if (this.clients.size === 0) return;
    const data = JSON.stringify(msg);
    for (const socket of this.clients.keys()) this.sendRaw(socket, data);
  }

  private send(socket: WebSocket, msg: ServerMessage): void {
    this.sendRaw(socket, JSON.stringify(msg));
  }

  private sendRaw(socket: WebSocket, data: string): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.clients.delete(socket);
      socket.terminate();
      return;
    }
    socket.send(data);
  }
}

function parseClientMessage(text: string): ClientMessage | null {
  try {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
