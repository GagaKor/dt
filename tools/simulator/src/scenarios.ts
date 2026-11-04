import type { EventMessage, PositionMessage } from '@dt/shared';

export interface Bounds {
  x: [number, number];
  y: [number, number];
}

export const DEFAULT_BOUNDS: Bounds = { x: [-18, 18], y: [-8, 8] };

export interface SimDevice {
  id: string;
  floor: number;
  type: 'camera' | 'sensor';
}

export interface ScenarioState {
  scenario: string;
  people: number;
  devices: SimDevice[];
  startEpochMs: number;
  bounds: Bounds;
  walkers: Map<number, (tMs: number) => { x: number; y: number }>;
}

export const FLOOR_COUNT = 3;

export function defaultDevices(floors = FLOOR_COUNT): SimDevice[] {
  const out: SimDevice[] = [];
  for (let n = 1; n <= floors; n++) {
    for (const i of ['01', '02']) {
      out.push({ id: `cam-${n}f-${i}`, floor: n, type: 'camera' });
      out.push({ id: `sensor-${n}f-${i}`, floor: n, type: 'sensor' });
    }
  }
  return out;
}

export function createScenarioState(opts: Partial<ScenarioState> = {}): ScenarioState {
  const startEpochMs = opts.startEpochMs ?? Date.now();
  return {
    // Part of eventId, so a re-run does not dedupe against an earlier run's ticks.
    scenario: opts.scenario ?? `sim-${startEpochMs.toString(36)}`,
    people: opts.people ?? 6,
    devices: opts.devices ?? defaultDevices(),
    startEpochMs,
    bounds: opts.bounds ?? DEFAULT_BOUNDS,
    walkers: new Map(),
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALK_SPEED_MPS = 1.2;
const WAYPOINTS = 6;

export function walkerPath(
  seed: number,
  bounds: Bounds = DEFAULT_BOUNDS,
): (tMs: number) => { x: number; y: number } {
  const rnd = mulberry32(seed * 7919 + 1);
  const pts = Array.from({ length: WAYPOINTS }, () => ({
    x: bounds.x[0] + rnd() * (bounds.x[1] - bounds.x[0]),
    y: bounds.y[0] + rnd() * (bounds.y[1] - bounds.y[0]),
  }));
  const legs = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]!;
    return { from: p, to: q, len: Math.max(Math.hypot(q.x - p.x, q.y - p.y), 1e-6) };
  });
  const total = legs.reduce((s, l) => s + l.len, 0);
  const offset = rnd() * total;
  return (tMs) => {
    let d = (offset + (tMs / 1000) * WALK_SPEED_MPS) % total;
    for (const l of legs) {
      if (d <= l.len) {
        const k = d / l.len;
        return {
          x: l.from.x + (l.to.x - l.from.x) * k,
          y: l.from.y + (l.to.y - l.from.y) * k,
        };
      }
      d -= l.len;
    }
    return { ...pts[0]! };
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function pick(state: ScenarioState, floor: number, type: SimDevice['type']): SimDevice {
  const d = state.devices.find((x) => x.floor === floor && x.type === type);
  if (!d) throw new Error(`no ${type} device on floor ${floor}`);
  return d;
}

export function scenarioTick(
  state: ScenarioState,
  tMs: number,
): { positions: PositionMessage[]; events: EventMessage[] } {
  const iso = new Date(state.startEpochMs + tMs).toISOString();
  const tick = Math.floor(tMs / 1000);
  const floors = [...new Set(state.devices.map((d) => d.floor))].sort((a, b) => a - b);
  const positions: PositionMessage[] = [];
  const people: { id: string; floor: number; x: number; y: number }[] = [];

  for (let i = 0; i < state.people; i++) {
    let walk = state.walkers.get(i);
    if (!walk) {
      walk = walkerPath(i + 1, state.bounds);
      state.walkers.set(i, walk);
    }
    const floor = floors[i % floors.length]!;
    const p = walk(tMs);
    const person = { id: `p-${i + 1}`, floor, x: round2(p.x), y: round2(p.y) };
    people.push(person);
    positions.push({
      deviceId: pick(state, floor, 'camera').id,
      objectId: person.id,
      objectType: 'person',
      x: person.x,
      y: person.y,
      measuredAt: iso,
    });
  }

  const events: EventMessage[] = [];
  const every = (ms: number) => tMs > 0 && tMs % ms === 0;

  if (every(5000)) {
    const p = walkerPath(10_000, state.bounds)(tMs);
    positions.push({
      deviceId: pick(state, floors[(tick / 5) % floors.length]!, 'sensor').id,
      x: round2(p.x),
      y: round2(p.y),
      measuredAt: iso,
    });
  }

  if (every(15_000) && people.length > 0) {
    const who = people[(tick / 15) % people.length]!;
    events.push({
      deviceId: pick(state, who.floor, 'camera').id,
      eventType: 'intrusion',
      occurredAt: iso,
      severity: 'critical',
      x: who.x,
      y: who.y,
      objectId: who.id,
      objectType: 'person',
      eventId: `${state.scenario}-${tick}-intrusion`,
    });
  }

  if (every(20_000)) {
    events.push({
      deviceId: pick(state, floors[(tick / 20) % floors.length]!, 'sensor').id,
      eventType: 'smoke',
      occurredAt: iso,
      severity: 'major',
      eventId: `${state.scenario}-${tick}-smoke`,
    });
  }

  return { positions, events };
}
