import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { ServerMessage } from '@dt/shared';

type Msg<K extends ServerMessage['type']> = Extract<ServerMessage, { type: K }>;

export async function listenWsUrl(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return `ws://127.0.0.1:${port}/api/ws`;
}

export class WsClient {
  readonly messages: ServerMessage[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  private readonly listeners = new Set<() => void>();

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
      for (const l of [...this.listeners]) l();
    });
    socket.on('error', () => undefined);
    this.closed = new Promise((resolve) =>
      socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    );
  }

  static connect(url: string, cookie?: string): Promise<WsClient> {
    const socket = new WebSocket(url, cookie ? { headers: { cookie } } : {});
    const client = new WsClient(socket);
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(client));
      socket.once('unexpected-response', (_req, res) => {
        reject(new Error(`unexpected response ${res.statusCode}`));
        socket.terminate();
      });
      void client.closed.then(({ code }) => reject(new Error(`closed before open (${code})`)));
    });
  }

  send(msg: unknown): void {
    this.socket.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  ofType<K extends ServerMessage['type']>(type: K, from = 0): Msg<K>[] {
    return this.messages.slice(from).filter((m): m is Msg<K> => m.type === type);
  }

  waitFor<K extends ServerMessage['type']>(
    type: K,
    pred: (m: Msg<K>) => boolean = () => true,
    opts: { from?: number; timeoutMs?: number } = {},
  ): Promise<Msg<K>> {
    const find = () => this.ofType(type, opts.from).find(pred);
    const hit = find();
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      const check = () => {
        const m = find();
        if (m) {
          done();
          resolve(m);
        }
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`timed out waiting for ${type}`));
      }, opts.timeoutMs ?? 3_000);
      this.listeners.add(check);
    });
  }

  async subscribe(siteId: string): Promise<Msg<'snapshot'>> {
    const from = this.messages.length;
    this.send({ type: 'subscribe', siteId });
    return this.waitFor('snapshot', (m) => m.siteId === siteId, { from });
  }

  async close(): Promise<void> {
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
    await this.closed;
  }
}
