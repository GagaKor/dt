import type { Device } from '@dt/shared';
import type { SimConfig } from './config';
import type { SimDevice } from './scenarios';

export const DEFAULT_SITE_NAME = 'Sample Office';

export const SAMPLE_FLOORS = [
  { name: '1F', elevationMin: 0, elevationMax: 4 },
  { name: '2F', elevationMin: 4, elevationMax: 8 },
  { name: '3F', elevationMin: 8, elevationMax: 12 },
];

const CAMERA_X = [-12, 12] as const;
const SENSOR_PLAN_XY: [number, number][] = [
  [-5, 6],
  [5, -6],
];

export interface FloorLike {
  id: string;
  elevationMin: number;
  elevationMax: number;
  sortOrder: number;
}

export interface PlannedDevice extends SimDevice {
  floorId: string;
  name: string;
  position: [number, number, number];
  yawDeg?: number;
  pitchDeg?: number;
}

export function planSeedDevices(floors: FloorLike[]): PlannedDevice[] {
  const out: PlannedDevice[] = [];
  [...floors]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((floor, idx) => {
      const n = idx + 1;
      CAMERA_X.forEach((x, i) =>
        out.push({
          id: `cam-${n}f-0${i + 1}`,
          floor: n,
          type: 'camera',
          floorId: floor.id,
          name: `Camera ${n}F ${i === 0 ? 'west' : 'east'}`,
          position: [x, floor.elevationMin + 3.0, 0],
          yawDeg: i === 0 ? 90 : 270,
          pitchDeg: -30,
        }),
      );
      SENSOR_PLAN_XY.forEach(([x, y], i) =>
        out.push({
          id: `sensor-${n}f-0${i + 1}`,
          floor: n,
          type: 'sensor',
          floorId: floor.id,
          name: `Sensor ${n}F ${i + 1}`,
          // model Z = -plan y
          position: [x, floor.elevationMin + 2.8, -y],
        }),
      );
    });
  return out;
}

export function floorsMatchSample(floors: FloorLike[]): boolean {
  if (floors.length !== SAMPLE_FLOORS.length) return false;
  const sorted = [...floors].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.every(
    (f, i) =>
      f.elevationMin === SAMPLE_FLOORS[i]!.elevationMin &&
      f.elevationMax === SAMPLE_FLOORS[i]!.elevationMax,
  );
}

export function deviceMatches(existing: Device, planned: PlannedDevice): boolean {
  return (
    existing.floorId === planned.floorId &&
    existing.type === planned.type &&
    existing.position.every((v, i) => Math.abs(v - planned.position[i]!) < 1e-6)
  );
}

export function assertCompleteDevices(devices: SimDevice[], floorCount: number): void {
  for (let n = 1; n <= floorCount; n++) {
    const cams = devices.filter((d) => d.floor === n && d.type === 'camera').length;
    const sensors = devices.filter((d) => d.floor === n && d.type === 'sensor').length;
    if (cams !== 2 || sensors !== 2)
      throw new Error(`floor ${n}F has ${cams} cameras and ${sensors} sensors, expected 2 and 2`);
  }
}

export function validateSimConfig(cfg: SimConfig, needSensor: boolean): void {
  const devices = cfg.devices ?? [];
  if (!devices.some((d) => d.type === 'camera'))
    throw new Error('no cameras in .sim.json - run `pnpm sim seed` first');
  if (needSensor && !devices.some((d) => d.type === 'sensor'))
    throw new Error('no sensors in .sim.json - run `pnpm sim seed` first');
}
