import { expect, test } from 'vitest';
import type { z } from 'zod';
import { EventMessageSchema, PositionBatchSchema, PositionMessageSchema } from '../src/index';

const base = { deviceId: 'cam-1', eventType: 'intrusion', occurredAt: '2026-11-04T09:00:00+09:00' };
const ok = (s: z.ZodTypeAny, v: unknown) => s.safeParse(v).success;

test('event requires deviceId, eventType, occurredAt', () => {
  expect(ok(EventMessageSchema, base)).toBe(true);
  for (const k of ['deviceId', 'eventType', 'occurredAt'] as const) {
    const { [k]: _omit, ...rest } = base;
    expect(ok(EventMessageSchema, rest)).toBe(false);
  }
});
test('occurredAt must carry a timezone', () => {
  expect(ok(EventMessageSchema, { ...base, occurredAt: '2026-11-04T09:00:00' })).toBe(false);
  expect(ok(EventMessageSchema, { ...base, occurredAt: '2026-11-04T00:00:00Z' })).toBe(true);
});
test('severity limited to four levels', () => {
  expect(ok(EventMessageSchema, { ...base, severity: 'urgent' })).toBe(false);
  expect(ok(EventMessageSchema, { ...base, severity: 'major' })).toBe(true);
});
test('x and y come together', () => {
  expect(ok(EventMessageSchema, { ...base, x: 1 })).toBe(false);
  expect(ok(EventMessageSchema, { ...base, x: 1, y: 2 })).toBe(true);
});
test('string limits', () => {
  expect(ok(EventMessageSchema, { ...base, deviceId: 'cam 1' })).toBe(false);
  expect(ok(EventMessageSchema, { ...base, deviceId: 'a'.repeat(65) })).toBe(false);
  expect(ok(EventMessageSchema, { ...base, eventType: 'e'.repeat(65) })).toBe(false);
  expect(ok(EventMessageSchema, { ...base, objectId: 'o'.repeat(129) })).toBe(false);
});
test('objectType limited to person/vehicle/object', () => {
  expect(ok(EventMessageSchema, { ...base, objectType: 'animal' })).toBe(false);
});
test('position requires x and y', () => {
  const p = { deviceId: 'cam-1', x: 1, y: 2, measuredAt: '2026-11-04T00:00:00Z' };
  expect(ok(PositionMessageSchema, p)).toBe(true);
  expect(ok(PositionMessageSchema, { ...p, x: undefined })).toBe(false);
});
test('position batch accepts single or 1..1000', () => {
  const p = { deviceId: 'cam-1', x: 1, y: 2, measuredAt: '2026-11-04T00:00:00Z' };
  expect(ok(PositionBatchSchema, p)).toBe(true);
  expect(ok(PositionBatchSchema, [])).toBe(false);
  expect(ok(PositionBatchSchema, Array(1000).fill(p))).toBe(true);
  expect(ok(PositionBatchSchema, Array(1001).fill(p))).toBe(false);
});
