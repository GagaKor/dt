import { randomUUID } from 'node:crypto';
import { OBJECT_TTL_MS, type ObjectStateWire } from '@dt/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { ObjectSink, ObjectUpsert } from '../ingest/eventService.js';

type OnChange = (siteId: string, states: ObjectStateWire[]) => void;
type Entry = Omit<ObjectStateWire, 'ageMs'> & { lastUpdateMs: number };

export class ObjectStore implements ObjectSink {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly nowMs: () => number,
    private onChange: OnChange,
    private readonly log?: Pick<FastifyBaseLogger, 'error'>,
  ) {}

  setOnChange(fn: OnChange): void {
    this.onChange = fn;
  }

  upsert(input: ObjectUpsert): ObjectStateWire {
    const state = this.apply(input);
    this.notify(state.siteId, [state]);
    return state;
  }

  upsertMany(inputs: ObjectUpsert[]): void {
    const bySite = new Map<string, ObjectStateWire[]>();
    for (const input of inputs) {
      const state = this.apply(input);
      const list = bySite.get(state.siteId);
      if (list) list.push(state);
      else bySite.set(state.siteId, [state]);
    }
    for (const [siteId, states] of bySite) this.notify(siteId, states);
  }

  listSite(siteId: string): ObjectStateWire[] {
    const now = this.nowMs();
    const out: ObjectStateWire[] = [];
    for (const e of this.entries.values()) {
      if (e.siteId === siteId && now - e.lastUpdateMs < OBJECT_TTL_MS) out.push(toWire(e, now));
    }
    return out;
  }

  sweep(): void {
    const now = this.nowMs();
    for (const [key, e] of this.entries) {
      if (now - e.lastUpdateMs >= OBJECT_TTL_MS) this.entries.delete(key);
    }
  }

  // State is already applied; a listener failure must not fail the ingest request.
  private notify(siteId: string, states: ObjectStateWire[]): void {
    try {
      this.onChange(siteId, states);
    } catch (err) {
      this.log?.error({ err, siteId }, 'object change listener failed');
    }
  }

  private apply(input: ObjectUpsert): ObjectStateWire {
    const now = this.nowMs();
    const key =
      input.objectId !== null
        ? `${input.integrationKeyId}:${input.objectId}`
        : `anon:${randomUUID()}`;
    const entry: Entry = {
      key,
      siteId: input.siteId,
      floorId: input.floorId,
      deviceId: input.deviceId,
      x: input.x,
      y: input.y,
      objectId: input.objectId,
      objectType: input.objectType,
      lastUpdateMs: now,
    };
    this.entries.set(key, entry);
    return toWire(entry, now);
  }
}

function toWire({ lastUpdateMs, ...rest }: Entry, now: number): ObjectStateWire {
  return { ...rest, ageMs: now - lastUpdateMs };
}
