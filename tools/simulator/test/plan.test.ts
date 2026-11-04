import { describe, expect, it } from 'vitest';
import type { Device } from '@dt/shared';
import {
  assertCompleteDevices,
  deviceMatches,
  floorsMatchSample,
  planSeedDevices,
  validateSimConfig,
} from '../src/plan';

const floors = [0, 4, 8].map((min, i) => ({
  id: `f${i + 1}`,
  elevationMin: min,
  elevationMax: min + 4,
  sortOrder: i,
}));

describe('planSeedDevices', () => {
  const plan = planSeedDevices(floors);

  it('plans 2 cameras and 2 sensors per floor with the fixed ids', () => {
    expect(plan).toHaveLength(12);
    expect(plan.filter((d) => d.floor === 2).map((d) => d.id)).toEqual([
      'cam-2f-01',
      'cam-2f-02',
      'sensor-2f-01',
      'sensor-2f-02',
    ]);
    assertCompleteDevices(plan, 3);
  });

  it('mounts cameras 3.0 m and sensors 2.8 m above the floor, with plan y = -Z', () => {
    const cam = plan.find((d) => d.id === 'cam-3f-02')!;
    expect(cam.position).toEqual([12, 11, 0]);
    expect([cam.yawDeg, cam.pitchDeg]).toEqual([270, -30]);
    expect(plan.find((d) => d.id === 'sensor-1f-01')!.position).toEqual([-5, 2.8, -6]);
  });
});

describe('seed reuse checks', () => {
  const planned = planSeedDevices(floors)[0]!;
  const existing = (over: Partial<Device>): Device => ({
    id: planned.id,
    siteId: 's',
    floorId: planned.floorId,
    type: planned.type,
    name: 'x',
    position: planned.position,
    yawDeg: 0,
    pitchDeg: 0,
    hfovDeg: null,
    rangeM: null,
    ...over,
  });

  it('detects a reused device on the wrong floor or of the wrong type', () => {
    expect(deviceMatches(existing({}), planned)).toBe(true);
    expect(deviceMatches(existing({ floorId: 'other' }), planned)).toBe(false);
    expect(deviceMatches(existing({ type: 'sensor' }), planned)).toBe(false);
  });

  it('accepts only floors matching the sample model', () => {
    expect(floorsMatchSample(floors)).toBe(true);
    expect(floorsMatchSample(floors.slice(0, 2))).toBe(false);
    expect(floorsMatchSample([])).toBe(false);
    expect(floorsMatchSample(floors.map((f) => ({ ...f, elevationMax: f.elevationMax + 1 })))).toBe(
      false,
    );
  });

  it('rejects an incomplete device set', () => {
    expect(() => assertCompleteDevices([], 3)).toThrow(/floor 1F/);
  });
});

describe('validateSimConfig', () => {
  const base = { url: 'http://x', key: 'k', siteId: 's' };
  const cam = { id: 'c', floor: 1, type: 'camera' as const };
  const sensor = { id: 's', floor: 1, type: 'sensor' as const };

  it('fails with a clear message on an empty config', () => {
    expect(() => validateSimConfig({ ...base, devices: [] }, false)).toThrow(/no cameras/);
  });
  it('requires a sensor only for run', () => {
    expect(() => validateSimConfig({ ...base, devices: [cam] }, true)).toThrow(/no sensors/);
    expect(() => validateSimConfig({ ...base, devices: [cam] }, false)).not.toThrow();
    expect(() => validateSimConfig({ ...base, devices: [cam, sensor] }, true)).not.toThrow();
  });
});
