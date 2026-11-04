import type { EventMessage, PositionMessage } from '@dt/shared';
import { ingest, type Timed } from './api';
import type { SimConfig } from './config';
import { walkerPath } from './scenarios';

const POSITIONS_PER_SEC = 500;
const BATCH_INTERVAL_MS = 100;
const EVENTS_PER_SEC = 20;
const LOAD_OBJECTS = 500;

export interface EndpointStats {
  requests: number;
  messages: number;
  errors: Record<string, number>;
  latencies: number[];
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export async function loadTest(cfg: SimConfig, seconds: number): Promise<number> {
  const cams = cfg.devices.filter((d) => d.type === 'camera');
  const sensors = cfg.devices.filter((d) => d.type === 'sensor');
  const walkers = Array.from({ length: LOAD_OBJECTS }, (_, i) => walkerPath(i + 1));
  const runId = Date.now().toString(36);
  const stats: Record<'positions' | 'events', EndpointStats> = {
    positions: { requests: 0, messages: 0, errors: {}, latencies: [] },
    events: { requests: 0, messages: 0, errors: {}, latencies: [] },
  };
  const inflight = new Set<Promise<void>>();
  const record = (name: keyof typeof stats, messages: number, p: Promise<Timed>) => {
    const s = stats[name];
    s.requests++;
    s.messages += messages;
    const done = p.then((r) => {
      s.latencies.push(r.ms);
      if (r.status < 200 || r.status >= 300) s.errors[r.status] = (s.errors[r.status] ?? 0) + 1;
    });
    inflight.add(done);
    void done.finally(() => inflight.delete(done));
  };

  const perBatch = (POSITIONS_PER_SEC * BATCH_INTERVAL_MS) / 1000;
  const start = performance.now();
  const startEpoch = Date.now();
  let batch = 0;
  let eventN = 0;

  const sendBatch = () => {
    const tMs = performance.now() - start;
    const iso = new Date(startEpoch + tMs).toISOString();
    const msgs: PositionMessage[] = [];
    for (let k = 0; k < perBatch; k++) {
      const i = (batch * perBatch + k) % LOAD_OBJECTS;
      const p = walkers[i]!(tMs);
      msgs.push({
        deviceId: cams[i % cams.length]!.id,
        objectId: `load-${i + 1}`,
        objectType: 'person',
        x: p.x,
        y: p.y,
        measuredAt: iso,
      });
    }
    batch++;
    record('positions', msgs.length, ingest(cfg.url, cfg.key, '/api/ingest/positions', msgs));
  };

  const sendEvent = () => {
    const n = eventN++;
    const msg: EventMessage = {
      deviceId: sensors[n % sensors.length]!.id,
      eventType: `load-${n % 5}`,
      occurredAt: new Date().toISOString(),
      severity: 'info',
      eventId: `load-${runId}-${n}`,
    };
    record('events', 1, ingest(cfg.url, cfg.key, '/api/ingest/events', msg));
  };

  console.log(
    `[load] ${seconds}s: ${POSITIONS_PER_SEC} positions/s (batches of ${perBatch}), ${EVENTS_PER_SEC} events/s`,
  );
  // Fixed-schedule loop (not setInterval) so a slow tick does not reduce the offered rate.
  const posEnd = start + seconds * 1000;
  let nextPos = start;
  let nextEvt = start;
  while (performance.now() < posEnd) {
    const now = performance.now();
    while (nextPos <= now) {
      sendBatch();
      nextPos += BATCH_INTERVAL_MS;
    }
    while (nextEvt <= now) {
      sendEvent();
      nextEvt += 1000 / EVENTS_PER_SEC;
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  await Promise.all(inflight);
  const elapsed = (performance.now() - start) / 1000;

  let totalErrors = 0;
  const rows = (Object.keys(stats) as (keyof typeof stats)[]).map((name) => {
    const s = stats[name];
    const sorted = [...s.latencies].sort((a, b) => a - b);
    const errs = Object.values(s.errors).reduce((a, b) => a + b, 0);
    totalErrors += errs;
    return {
      endpoint: name,
      requests: s.requests,
      messages: s.messages,
      'msgs/s': +(s.messages / elapsed).toFixed(1),
      errors:
        errs === 0
          ? '0'
          : Object.entries(s.errors)
              .map(([k, v]) => `${k}x${v}`)
              .join(','),
      'p50 ms': +percentile(sorted, 50).toFixed(1),
      'p95 ms': +percentile(sorted, 95).toFixed(1),
      'p99 ms': +percentile(sorted, 99).toFixed(1),
    };
  });
  console.table(rows);
  console.log(`[load] elapsed ${elapsed.toFixed(1)}s, errors ${totalErrors}`);
  return totalErrors === 0 ? 0 : 1;
}
