import type { ServerMessage } from '@dt/shared';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FakeWebSocket } from './fakeWebSocket';
import { connectRealtime, realtimeUrl, type RealtimeStatus } from './socket';

const sockets = () => FakeWebSocket.instances;
const last = () => sockets().at(-1)!;

function setup() {
  const messages: ServerMessage[] = [];
  const statuses: RealtimeStatus[] = [];
  const rejected: unknown[] = [];
  const rt = connectRealtime({
    url: 'ws://host/api/ws',
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onRejected: (r) => rejected.push(r),
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
  });
  return { rt, messages, statuses, rejected };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
});
afterEach(() => vi.useRealTimers());

const subscribeMsg = (siteId: string) => JSON.stringify({ type: 'subscribe', siteId });

test('reconnect resubscribes', async () => {
  const { rt } = setup();
  sockets()[0]!.open();
  rt.subscribe('s1');
  expect(sockets()[0]!.sent).toEqual([subscribeMsg('s1')]);
  sockets()[0]!.serverClose(1006);
  await vi.advanceTimersByTimeAsync(999);
  expect(sockets()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(sockets()).toHaveLength(2);
  sockets()[1]!.open();
  expect(sockets()[1]!.sent).toEqual([subscribeMsg('s1')]);
});

test('a subscribe made before open is sent once the socket opens', () => {
  const { rt } = setup();
  rt.subscribe('s1');
  rt.subscribe('s2');
  expect(last().sent).toEqual([]);
  last().open();
  expect(last().sent).toEqual([subscribeMsg('s2')]);
  rt.subscribe('s2');
  expect(last().sent).toHaveLength(1);
});

test('reconnect delay doubles up to 10s and resets after a successful open', async () => {
  setup();
  const delays: number[] = [];
  for (let i = 0; i < 6; i++) {
    const n = sockets().length;
    last().serverClose(1006);
    let waited = 0;
    while (sockets().length === n) {
      await vi.advanceTimersByTimeAsync(100);
      waited += 100;
    }
    delays.push(waited);
  }
  expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 10_000, 10_000]);

  last().open();
  const n = sockets().length;
  last().serverClose(1006);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sockets()).toHaveLength(n + 1);
});

test('reports status changes', async () => {
  const { statuses } = setup();
  last().open();
  last().serverClose(1006);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(statuses).toEqual(['connecting', 'open', 'closed', 'connecting']);
});

test('forwards parsed server messages and ignores garbage', () => {
  const { messages } = setup();
  last().open();
  const msg: ServerMessage = { type: 'summary', sites: [], newAlarm: null };
  last().receive(msg);
  last().receive('not json');
  last().receive({ hello: 'world' });
  expect(messages).toEqual([msg]);
});

test('unauthenticated close stops reconnecting', async () => {
  const { rt, rejected, statuses } = setup();
  last().open();
  rt.subscribe('s1');
  last().serverClose(4401);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets()).toHaveLength(1);
  expect(rejected).toEqual([{ reason: 'unauthenticated' }]);
  expect(statuses.at(-1)).toBe('closed');
});

test('unknown site close drops that subscription but keeps the connection', async () => {
  const { rt, rejected } = setup();
  last().open();
  rt.subscribe('missing');
  last().serverClose(4404);
  expect(rejected).toEqual([{ reason: 'unknownSite', siteId: 'missing' }]);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(sockets()).toHaveLength(2);
  last().open();
  expect(last().sent).toEqual([]);
  rt.subscribe('s1');
  expect(last().sent).toEqual([subscribeMsg('s1')]);
});

test('close stops the connection for good', async () => {
  const { rt, statuses } = setup();
  last().open();
  rt.close();
  expect(sockets()[0]!.closedWith).toBe(1000);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets()).toHaveLength(1);
  expect(statuses.at(-1)).toBe('closed');
});

test('close during a pending reconnect cancels it', async () => {
  const { rt } = setup();
  last().serverClose(1006);
  rt.close();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(sockets()).toHaveLength(1);
});

test('realtimeUrl follows the page protocol and host', () => {
  expect(realtimeUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe(
    'ws://localhost:5173/api/ws',
  );
  expect(realtimeUrl({ protocol: 'https:', host: 'dt.example.com' })).toBe(
    'wss://dt.example.com/api/ws',
  );
});
