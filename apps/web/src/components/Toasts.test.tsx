import type { ServerMessage } from '@dt/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '../i18n';
import { useRealtimeStore } from '../realtime/store';
import { TOAST_MS, Toasts } from './Toasts';

const notice: ServerMessage = {
  type: 'summary',
  sites: [],
  newAlarm: {
    alarmId: 'B1',
    siteId: 's2',
    siteName: 'Warehouse',
    severity: 'critical',
    eventType: 'intrusion',
  },
};

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/sites/s1/monitor']}>
      <Toasts />
      <Where />
    </MemoryRouter>,
  );
  act(() => {
    const s = useRealtimeStore.getState();
    s.watch('s1');
    s.apply(notice, 0);
  });
}

beforeEach(() => useRealtimeStore.getState().reset());
afterEach(() => vi.useRealTimers());

test('a toast names the site and opens its monitor when clicked', async () => {
  setup();
  const toast = screen.getByRole('button', { name: /Warehouse/ });
  expect(toast).toHaveTextContent('intrusion');
  await userEvent.click(toast);
  expect(screen.getByTestId('where')).toHaveTextContent('/sites/s2/monitor');
  expect(useRealtimeStore.getState().toasts).toHaveLength(0);
});

test('a toast closes itself after 10 seconds', () => {
  vi.useFakeTimers();
  setup();
  expect(TOAST_MS).toBe(10_000);
  act(() => vi.advanceTimersByTime(TOAST_MS - 1));
  expect(screen.queryByRole('button', { name: /Warehouse/ })).not.toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('button', { name: /Warehouse/ })).toBeNull();
});

test('the close button dismisses without navigating', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(useRealtimeStore.getState().toasts).toHaveLength(0);
  expect(screen.getByTestId('where')).toHaveTextContent('/sites/s1/monitor');
});
