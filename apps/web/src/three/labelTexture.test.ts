import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LABEL_CACHE_SIZE, clearLabelTextures, getLabelTexture } from './labelTexture';

// jsdom has no 2D canvas; a recording stub is enough to check the drawing calls.
const fillText = vi.fn();
const ctx = {
  font: '',
  fillStyle: '',
  textBaseline: '',
  measureText: (s: string) => ({ width: s.length * 10 }),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  fillText,
};
beforeEach(() => {
  fillText.mockReset();
  ctx.font = '';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  clearLabelTextures();
  vi.restoreAllMocks();
});

test('returns one cached texture per text drawn with a system font', () => {
  const a = getLabelTexture('p-1');
  expect(getLabelTexture('p-1')).toBe(a);
  expect(getLabelTexture('p-2')).not.toBe(a);
  expect(fillText).toHaveBeenCalledWith('p-1', expect.any(Number), expect.any(Number));
  expect(ctx.font).toMatch(/system-ui/);
  expect(ctx.font).not.toMatch(/url\(/);
  expect(a.userData.aspect).toBeGreaterThan(1);
});

test('falls back to a plain rectangle where roundRect is missing', () => {
  const fillRect = vi.fn();
  const { roundRect: _roundRect, ...withoutRoundRect } = ctx;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ ...withoutRoundRect, fillRect }) as unknown as CanvasRenderingContext2D,
  );
  expect(() => getLabelTexture('no-round-rect')).not.toThrow();
  expect(fillRect).toHaveBeenCalledWith(0, 0, expect.any(Number), expect.any(Number));
  expect(fillText).toHaveBeenCalledWith('no-round-rect', expect.any(Number), expect.any(Number));
});

test('evicts and disposes the least recently used texture beyond 500', () => {
  const first = getLabelTexture('label-0');
  const second = getLabelTexture('label-1');
  const disposed: string[] = [];
  first.addEventListener('dispose', () => disposed.push('label-0'));
  second.addEventListener('dispose', () => disposed.push('label-1'));
  for (let i = 2; i < LABEL_CACHE_SIZE; i++) getLabelTexture(`label-${i}`);
  // Touching label-0 makes label-1 the oldest entry.
  expect(getLabelTexture('label-0')).toBe(first);
  getLabelTexture('overflow');
  expect(disposed).toEqual(['label-1']);
  expect(getLabelTexture('label-0')).toBe(first);
  expect(getLabelTexture('label-1')).not.toBe(second);
});
