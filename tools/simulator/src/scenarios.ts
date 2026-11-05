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
  /** Plan position (m). With it, detections stay where the device can sense them. */
  x?: number;
  y?: number;
  /** Camera view: facing (from plan +y toward +x), horizontal field of view and range. */
  yawDeg?: number;
  hfovDeg?: number;
  rangeM?: number;
}

/** Picks a plan point inside an area from a random source. Areas are convex, so straight walks between picks stay inside. */
export type AreaSampler = (rnd: () => number) => { x: number; y: number };

// Share of a camera's field of view and range people walk in, so they are clearly inside it.
const VIEW_ANGLE_SHARE = 0.8;
const VIEW_RANGE_SHARE = 0.9;
// Closer than this a ceiling camera tilted down does not see the floor.
const VIEW_MIN_M = 2;
const SENSOR_RADIUS_M = 3;
const SAMPLE_TRIES = 50;

const inBounds = (b: Bounds, p: { x: number; y: number }) =>
  p.x >= b.x[0] && p.x <= b.x[1] && p.y >= b.y[0] && p.y <= b.y[1];

function boundsSampler(b: Bounds): AreaSampler {
  return (rnd) => ({
    x: b.x[0] + rnd() * (b.x[1] - b.x[0]),
    y: b.y[0] + rnd() * (b.y[1] - b.y[0]),
  });
}

/** Rejection-samples `pick` inside the bounds; falls back to the device position. */
function within(b: Bounds, at: { x: number; y: number }, pick: AreaSampler): AreaSampler {
  return (rnd) => {
    for (let i = 0; i < SAMPLE_TRIES; i++) {
      const p = pick(rnd);
      if (inBounds(b, p)) return p;
    }
    return {
      x: Math.min(b.x[1], Math.max(b.x[0], at.x)),
      y: Math.min(b.y[1], Math.max(b.y[0], at.y)),
    };
  };
}

/**
 * Where a device detects things: in front of a camera within its view, around a sensor, or
 * anywhere in the bounds for devices without a known position (older configs).
 */
export function coverage(device: SimDevice, bounds: Bounds): AreaSampler {
  const { x, y } = device;
  if (x === undefined || y === undefined) return boundsSampler(bounds);
  const at = { x, y };
  const { yawDeg, hfovDeg, rangeM } = device;
  if (device.type === 'camera' && yawDeg !== undefined && hfovDeg && rangeM) {
    const half = ((hfovDeg / 2) * VIEW_ANGLE_SHARE * Math.PI) / 180;
    const yaw = (yawDeg * Math.PI) / 180;
    const far = Math.max(VIEW_MIN_M, rangeM * VIEW_RANGE_SHARE);
    return within(bounds, at, (rnd) => {
      const a = yaw + (2 * rnd() - 1) * half;
      // Uniform over the sector's area rather than bunched near the camera.
      const r = Math.sqrt(VIEW_MIN_M ** 2 + rnd() * (far ** 2 - VIEW_MIN_M ** 2));
      return { x: x + r * Math.sin(a), y: y + r * Math.cos(a) };
    });
  }
  return within(bounds, at, (rnd) => {
    const a = rnd() * 2 * Math.PI;
    const r = SENSOR_RADIUS_M * Math.sqrt(rnd());
    return { x: x + r * Math.cos(a), y: y + r * Math.sin(a) };
  });
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

/** A looping walk through random waypoints of an area (a rectangle or a device's coverage). */
export function walkerPath(
  seed: number,
  area: Bounds | AreaSampler = DEFAULT_BOUNDS,
): (tMs: number) => { x: number; y: number } {
  const rnd = mulberry32(seed * 7919 + 1);
  const sample = typeof area === 'function' ? area : boundsSampler(area);
  const pts = Array.from({ length: WAYPOINTS }, () => sample(rnd));
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

function ofType(state: ScenarioState, floor: number, type: SimDevice['type']): SimDevice[] {
  const list = state.devices.filter((x) => x.floor === floor && x.type === type);
  if (list.length === 0) throw new Error(`no ${type} device on floor ${floor}`);
  return list;
}

export function scenarioTick(
  state: ScenarioState,
  tMs: number,
): { positions: PositionMessage[]; events: EventMessage[] } {
  const iso = new Date(state.startEpochMs + tMs).toISOString();
  const tick = Math.floor(tMs / 1000);
  const floors = [...new Set(state.devices.map((d) => d.floor))].sort((a, b) => a - b);
  const positions: PositionMessage[] = [];
  const people: { id: string; floor: number; deviceId: string; x: number; y: number }[] = [];

  for (let i = 0; i < state.people; i++) {
    // Each person is seen by one camera of their floor and walks only inside its view.
    const floor = floors[i % floors.length]!;
    const cameras = ofType(state, floor, 'camera');
    const camera = cameras[Math.floor(i / floors.length) % cameras.length]!;
    let walk = state.walkers.get(i);
    if (!walk) {
      walk = walkerPath(i + 1, coverage(camera, state.bounds));
      state.walkers.set(i, walk);
    }
    const p = walk(tMs);
    const person = { id: `p-${i + 1}`, floor, deviceId: camera.id, x: round2(p.x), y: round2(p.y) };
    people.push(person);
    positions.push({
      deviceId: camera.id,
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
    // Something unidentified near one of the sensors, rotating over floors and sensors.
    const round = tick / 5;
    const sensors = ofType(state, floors[round % floors.length]!, 'sensor');
    const sensor = sensors[Math.floor(round / floors.length) % sensors.length]!;
    const p = walkerPath(10_000, coverage(sensor, state.bounds))(tMs);
    positions.push({
      deviceId: sensor.id,
      x: round2(p.x),
      y: round2(p.y),
      measuredAt: iso,
    });
  }

  if (every(15_000) && people.length > 0) {
    const who = people[(tick / 15) % people.length]!;
    events.push({
      deviceId: who.deviceId,
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
      deviceId: ofType(state, floors[(tick / 20) % floors.length]!, 'sensor')[0]!.id,
      eventType: 'smoke',
      occurredAt: iso,
      severity: 'major',
      eventId: `${state.scenario}-${tick}-smoke`,
    });
  }

  return { positions, events };
}
