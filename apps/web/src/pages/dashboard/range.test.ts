import { expect, test } from 'vitest';
import { customRange, rangeForPreset } from './range';

test('today in Asia/Seoul', () => {
  expect(rangeForPreset('today', new Date('2026-11-04T14:00:00+09:00'), 'Asia/Seoul')).toEqual({
    from: '2026-11-04T00:00:00+09:00',
    to: '2026-11-05T00:00:00+09:00',
    bucket: 'hour',
  });
});

test('7d uses day buckets and starts 6 days back', () => {
  const r = rangeForPreset('7d', new Date('2026-11-04T14:00:00+09:00'), 'Asia/Seoul');
  expect(r).toMatchObject({
    from: '2026-10-29T00:00:00+09:00',
    to: '2026-11-05T00:00:00+09:00',
    bucket: 'day',
  });
});

test('30d spans 30 calendar days including today', () => {
  const r = rangeForPreset('30d', new Date('2026-11-04T14:00:00+09:00'), 'Asia/Seoul');
  expect(r).toMatchObject({ from: '2026-10-06T00:00:00+09:00', bucket: 'day' });
});

test('uses the calendar day of the timezone, not UTC', () => {
  // 2026-11-04T20:00Z is already Nov 5 in Seoul and still Nov 4 in New York.
  const now = new Date('2026-11-04T20:00:00Z');
  expect(rangeForPreset('today', now, 'Asia/Seoul').from).toBe('2026-11-05T00:00:00+09:00');
  expect(rangeForPreset('today', now, 'America/New_York').from).toBe('2026-11-04T00:00:00-05:00');
});

test('computes the offset of each boundary across a DST change', () => {
  // US DST ended on 2026-11-01: Oct 30 is -04:00, Nov 2 is -05:00.
  const r = rangeForPreset('7d', new Date('2026-11-04T12:00:00-05:00'), 'America/New_York');
  expect(r.from).toBe('2026-10-29T00:00:00-04:00');
  expect(r.to).toBe('2026-11-05T00:00:00-05:00');
});

test('custom range picks hour up to 2 days and day beyond', () => {
  expect(customRange('2026-11-04T00:00', '2026-11-06T00:00', 'Asia/Seoul')).toEqual({
    from: '2026-11-04T00:00:00+09:00',
    to: '2026-11-06T00:00:00+09:00',
    bucket: 'hour',
  });
  expect(customRange('2026-11-04T00:00', '2026-11-06T00:01', 'Asia/Seoul')?.bucket).toBe('day');
});

test('custom range rejects empty or inverted input', () => {
  expect(customRange('', '2026-11-06T00:00', 'Asia/Seoul')).toBeNull();
  expect(customRange('2026-11-06T00:00', '2026-11-04T00:00', 'Asia/Seoul')).toBeNull();
});
