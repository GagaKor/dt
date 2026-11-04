import { REALTIME_CLOSE_CODES, type ClientMessage, type ServerMessage } from '@dt/shared';

export type RealtimeStatus = 'connecting' | 'open' | 'closed';

export type RealtimeRejection =
  { reason: 'unauthenticated' } | { reason: 'unknownSite'; siteId: string };

export interface RealtimeOptions {
  url: string;
  onMessage(m: ServerMessage): void;
  onStatus(s: RealtimeStatus): void;
  /** The server refused the session (no more reconnects) or the subscribed site. */
  onRejected?(r: RealtimeRejection): void;
  WebSocketImpl?: typeof WebSocket;
}

export interface RealtimeConnection {
  subscribe(siteId: string): void;
  close(): void;
}

export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 10_000;

const OPEN = 1;
const MESSAGE_TYPES: ReadonlySet<string> = new Set(['snapshot', 'objects', 'alarm', 'summary']);

export function realtimeUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/api/ws`;
}

function parse(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;
  try {
    const msg: unknown = JSON.parse(data);
    const type = (msg as { type?: unknown } | null)?.type;
    return typeof type === 'string' && MESSAGE_TYPES.has(type) ? (msg as ServerMessage) : null;
  } catch {
    return null;
  }
}

/** One reconnecting socket; the last subscribed site is subscribed again after every reconnect. */
export function connectRealtime(o: RealtimeOptions): RealtimeConnection {
  const Impl = o.WebSocketImpl ?? WebSocket;
  let ws: WebSocket | null = null;
  let siteId: string | null = null;
  // Site subscribed on the current socket, so repeated calls do not ask for new snapshots.
  let sentSiteId: string | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const sendSubscribe = () => {
    if (!ws || ws.readyState !== OPEN || siteId === null || sentSiteId === siteId) return;
    const msg: ClientMessage = { type: 'subscribe', siteId };
    ws.send(JSON.stringify(msg));
    sentSiteId = siteId;
  };

  const scheduleReconnect = () => {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt++;
    timer = setTimeout(() => {
      timer = null;
      open();
    }, delay);
  };

  const onClosed = (code: number) => {
    ws = null;
    sentSiteId = null;
    o.onStatus('closed');
    if (code === REALTIME_CLOSE_CODES.unauthenticated) {
      stopped = true;
      o.onRejected?.({ reason: 'unauthenticated' });
      return;
    }
    // A malformed subscribe can only mean a bad site ID; retrying it would loop forever.
    const refused =
      code === REALTIME_CLOSE_CODES.unknownSite || code === REALTIME_CLOSE_CODES.badMessage;
    if (refused && siteId !== null) {
      const rejected = siteId;
      siteId = null;
      o.onRejected?.({ reason: 'unknownSite', siteId: rejected });
    }
    scheduleReconnect();
  };

  function open() {
    o.onStatus('connecting');
    const socket = new Impl(o.url);
    ws = socket;
    socket.onopen = () => {
      if (ws !== socket) return;
      attempt = 0;
      o.onStatus('open');
      sendSubscribe();
    };
    socket.onmessage = (e: MessageEvent) => {
      if (ws !== socket) return;
      const msg = parse(e.data);
      if (msg) o.onMessage(msg);
    };
    socket.onclose = (e: CloseEvent) => {
      if (ws === socket && !stopped) onClosed(e.code);
    };
  }

  open();

  return {
    subscribe(id) {
      siteId = id;
      sendSubscribe();
    },
    close() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const socket = ws;
      ws = null;
      socket?.close(1000);
      o.onStatus('closed');
    },
  };
}
