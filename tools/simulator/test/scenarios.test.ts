import { describe, expect, it } from 'vitest';
import { createScenarioState, scenarioTick, walkerPath } from '../src/scenarios';

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
    const cams = new Set(positions.filter((p) => p.objectId).map((p) => p.deviceId));
    expect(cams).toEqual(new Set(['cam-1f-01', 'cam-2f-01', 'cam-3f-01']));
  });
});
