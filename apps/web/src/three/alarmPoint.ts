import type { Alarm, Device } from '@dt/shared';
import type { FloorYResolver } from './floorSurface';

export type ModelPoint = [number, number, number];

/**
 * Where an alarm is shown in the model: on its floor surface when it has plan coordinates,
 * otherwise at its device. Null when neither can be placed.
 */
export function alarmPoint(
  alarm: Pick<Alarm, 'floorId' | 'deviceId' | 'x' | 'y'>,
  device: Device | undefined,
  floorY: FloorYResolver,
): ModelPoint | null {
  const { x, y } = alarm;
  if (x === null || y === null) return device ? [...device.position] : null;
  const floorId = alarm.floorId ?? device?.floorId ?? null;
  const height = (floorId !== null ? floorY(floorId, x, y) : null) ?? device?.position[1] ?? null;
  return height === null ? null : [x, height, -y];
}
