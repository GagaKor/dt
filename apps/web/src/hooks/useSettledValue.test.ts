import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useSettledValue } from './useSettledValue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('returns the first value at once and later values once they stop changing', () => {
  const { result, rerender } = renderHook(({ v }) => useSettledValue(v, 150), {
    initialProps: { v: 'a' },
  });
  expect(result.current).toBe('a');
  rerender({ v: 'b' });
  act(() => vi.advanceTimersByTime(100));
  rerender({ v: 'c' });
  act(() => vi.advanceTimersByTime(100));
  // 'b' never settled: 'c' arrived within 150 ms.
  expect(result.current).toBe('a');
  act(() => vi.advanceTimersByTime(50));
  expect(result.current).toBe('c');
});
