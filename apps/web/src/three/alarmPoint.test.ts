import type { Alarm, Device } from '@dt/shared';
import { expect, test } from 'vitest';
import { alarmFloorId, alarmPoint } from './alarmPoint';

const device: Device = {
  id: 'cam-1',
  siteId: 's1',
  floorId: 'f2',
  type: 'camera',
  name: 'Lobby camera',
  position: [3, 6.8, -4],
  yawDeg: 0,
  pitchDeg: 0,
  hfovDeg: 90,
  rangeM: 10,
};
const at = (over: Partial<Alarm>) =>
  ({ floorId: 'f1', deviceId: 'cam-1', x: null, y: null, ...over }) as Pick<
    Alarm,
    'floorId' | 'deviceId' | 'x' | 'y'
  >;
const floorY = (floorId: string) => (floorId === 'f1' ? 0.2 : floorId === 'f2' ? 4 : null);

test('an alarm with coordinates sits on its floor surface at plan (x, -y)', () => {
  expect(alarmPoint(at({ x: 5, y: 2 }), device, floorY)).toEqual([5, 0.2, -2]);
});

test('without its own floor the device floor is used', () => {
  expect(alarmPoint(at({ x: 5, y: 2, floorId: null }), device, floorY)).toEqual([5, 4, -2]);
});

test('an unknown floor falls back to the device height', () => {
  expect(alarmPoint(at({ x: 5, y: 2, floorId: 'gone' }), device, floorY)).toEqual([5, 6.8, -2]);
  expect(alarmPoint(at({ x: 5, y: 2, floorId: 'gone' }), undefined, floorY)).toBeNull();
});

test('an alarm without coordinates sits at the device', () => {
  expect(alarmPoint(at({}), device, floorY)).toEqual([3, 6.8, -4]);
  expect(alarmPoint(at({}), undefined, floorY)).toBeNull();
});

test('an alarm belongs to its own floor, else to its device floor', () => {
  const device = { floorId: 'dev-floor' } as Device;
  expect(alarmFloorId({ floorId: 'f2' }, device)).toBe('f2');
  expect(alarmFloorId({ floorId: null }, device)).toBe('dev-floor');
  expect(alarmFloorId({ floorId: null }, undefined)).toBeNull();
});
