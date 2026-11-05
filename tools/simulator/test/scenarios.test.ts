import { describe, expect, it } from 'vitest';
import { createScenarioState, scenarioTick, walkerPath, type SimDevice } from '../src/scenarios';

const BOUNDS = { x: [-18, 18] as [number, number], y: [-8, 8] as [number, number] };

describe('walkerPath', () => {
  it('walker stays in bounds for 10 minutes', () => {
    for (const seed of [1, 2, 3]) {
      const at = walkerPath(seed, BOUNDS);
      for (let t = 0; t <= 600_000; t += 500) {
        const p = at(t);
        expect(p.x).toBeGreaterThanOrEqual(-18);
        expect(p.x).toBeLessThanOrEqual(18);
        expect(p.y).toBeGreaterThanOrEqual(-8);
        expect(p.y).toBeLessThanOrEqual(8);
      }
    }
  });

  it('same seed gives same path', () => {
    const a = walkerPath(7, BOUNDS);
    const b = walkerPath(7, BOUNDS);
    const c = walkerPath(8, BOUNDS);
    for (const t of [0, 1000, 12_345, 99_999]) expect(a(t)).toEqual(b(t));
    expect(a(30_000)).not.toEqual(c(30_000));
  });
});

describe('scenarioTick', () => {
  it('tick at 15000 has one intrusion with objectId and coords', () => {
    const { events } = scenarioTick(createScenarioState(), 15_000);
    const intrusions = events.filter((e) => e.eventType === 'intrusion');
    expect(intrusions).toHaveLength(1);
    expect(intrusions[0]!.objectId).toMatch(/^p-\d+$/);
    expect(typeof intrusions[0]!.x).toBe('number');
    expect(typeof intrusions[0]!.y).toBe('number');
  });

  it('tick at 20000 has one smoke without coords and severity major', () => {
    const { events } = scenarioTick(createScenarioState(), 20_000);
    const smoke = events.filter((e) => e.eventType === 'smoke');
    expect(smoke).toHaveLength(1);
    expect(smoke[0]!.severity).toBe('major');
    expect(smoke[0]!.x).toBeUndefined();
    expect(smoke[0]!.y).toBeUndefined();
    expect(smoke[0]!.deviceId).toMatch(/^sensor-/);
  });

  it('each tick has state.people tracked positions (6 by default, 300 when set)', () => {
    const tracked = (n?: number) =>
      scenarioTick(
        createScenarioState(n === undefined ? {} : { people: n }),
        3000,
      ).positions.filter((p) => p.objectId);
    expect(tracked()).toHaveLength(6);
    expect(tracked(300)).toHaveLength(300);
  });

  it('uses the camera of each person floor and sends one anonymous position every 5s', () => {
    const { positions } = scenarioTick(createScenarioState(), 5000);
    const anon = positions.filter((p) => !p.objectId);
    expect(anon).toHaveLength(1);
    expect(anon[0]!.deviceId).toMatch(/^sensor-/);
    // People are spread over the cameras of their floor.
    const cams = new Set(positions.filter((p) => p.objectId).map((p) => p.deviceId));
    expect(cams).toEqual(
      new Set(['cam-1f-01', 'cam-2f-01', 'cam-3f-01', 'cam-1f-02', 'cam-2f-02', 'cam-3f-02']),
    );
  });
});

// The sample's devices: cameras at x = ±12 on the corridor, looking along it; two sensors per floor.
const sampleDevices = (): SimDevice[] =>
  [1, 2, 3].flatMap((floor) => [
    {
      id: `cam-${floor}f-01`,
      floor,
      type: 'camera' as const,
      x: -12,
      y: 0,
      yawDeg: 90,
      hfovDeg: 90,
      rangeM: 10,
    },
    {
      id: `cam-${floor}f-02`,
      floor,
      type: 'camera' as const,
      x: 12,
      y: 0,
      yawDeg: 270,
      hfovDeg: 90,
      rangeM: 10,
    },
    { id: `sensor-${floor}f-01`, floor, type: 'sensor' as const, x: -5, y: 6 },
    { id: `sensor-${floor}f-02`, floor, type: 'sensor' as const, x: 5, y: -6 },
  ]);

/** Whether a plan point lies in a camera's horizontal field of view and range. */
function seenBy(cam: SimDevice, p: { x: number; y: number }): boolean {
  const dx = p.x - cam.x!;
  const dy = p.y - cam.y!;
  const yaw = (cam.yawDeg! * Math.PI) / 180;
  // Yaw turns from plan +y toward +x.
  const along = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  const across = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const angle = (Math.atan2(Math.abs(across), along) * 180) / Math.PI;
  return Math.hypot(dx, dy) <= cam.rangeM! + 1e-6 && angle <= cam.hfovDeg! / 2 + 1e-6;
}

describe('detections stay where the reporting device can see', () => {
  const devices = sampleDevices();
  const byId = new Map(devices.map((d) => [d.id, d]));

  it('every tracked person is inside the field of view of the camera that reports them', () => {
    const state = createScenarioState({ people: 30, devices });
    for (let t = 0; t <= 600_000; t += 7_000) {
      for (const p of scenarioTick(state, t).positions.filter((q) => q.objectId)) {
        const cam = byId.get(p.deviceId)!;
        expect(cam.type).toBe('camera');
        expect(seenBy(cam, p as { x: number; y: number }), `${p.objectId} at ${t} ms`).toBe(true);
        expect(Math.abs(p.x!)).toBeLessThanOrEqual(18);
        expect(Math.abs(p.y!)).toBeLessThanOrEqual(8);
      }
    }
  });

  it('an intrusion comes from the camera that sees the person, at their position', () => {
    const state = createScenarioState({ people: 12, devices });
    const { events, positions } = scenarioTick(state, 15_000);
    const intrusion = events.find((e) => e.eventType === 'intrusion')!;
    const seen = positions.find((p) => p.objectId === intrusion.objectId)!;
    expect(intrusion.deviceId).toBe(seen.deviceId);
    expect([intrusion.x, intrusion.y]).toEqual([seen.x, seen.y]);
    expect(seenBy(byId.get(intrusion.deviceId)!, intrusion as { x: number; y: number })).toBe(true);
  });

  it('anonymous detections from a sensor lie within 3 m of it', () => {
    const state = createScenarioState({ devices });
    for (let t = 5_000; t <= 300_000; t += 5_000) {
      const anon = scenarioTick(state, t).positions.find((p) => !p.objectId)!;
      const sensor = byId.get(anon.deviceId)!;
      expect(Math.hypot(anon.x! - sensor.x!, anon.y! - sensor.y!)).toBeLessThanOrEqual(3 + 1e-6);
    }
  });
});
