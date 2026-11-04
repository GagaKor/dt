import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Alarm, StatsResponse } from '@dt/shared';
import { cloneElement, type ReactElement } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import { useRealtimeStore } from '../realtime/store';
import { DashboardPage } from './DashboardPage';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  apiFetch,
}));
// jsdom has no layout, so the responsive wrapper would render nothing.
vi.mock('recharts', async (orig) => ({
  ...(await orig<typeof import('recharts')>()),
  ResponsiveContainer: ({
    children,
  }: {
    children: ReactElement<{ width: number; height: number }>;
  }) => cloneElement(children, { width: 400, height: 200 }),
}));

const SITE_B = '22222222-2222-4222-8222-222222222222';
const SITE = '11111111-1111-4111-8111-111111111111';

const stats: StatsResponse = {
  timeseries: [
    { bucketStart: '2026-11-04T09:00', count: 1 },
    { bucketStart: '2026-11-04T10:00', count: 3 },
  ],
  byType: [
    { eventType: 'intrusion', count: 3 },
    { eventType: 'fire', count: 1 },
  ],
  bySeverity: [
    { severity: 'critical', count: 1 },
    { severity: 'info', count: 3 },
  ],
  byDevice: [
    { deviceId: 'cam-1', deviceName: 'Lobby', count: 3 },
    { deviceId: 'cam-gone', deviceName: null, count: 1 },
  ],
  byFloor: [
    { floorId: 'f1', floorName: '1F', count: 3 },
    { floorId: null, floorName: null, count: 1 },
  ],
  unacked: 2,
};

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/sites/${SITE}/dashboard`]}>
        <Routes>
          <Route
            path="/sites/:siteId/dashboard"
            element={
              <>
                <Link to={`/sites/${SITE_B}/dashboard`}>to-b</Link>
                <DashboardPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastQuery = () => {
  const url = apiFetch.mock.calls.at(-1)![0] as string;
  return new URLSearchParams(url.split('?')[1]);
};

beforeEach(() => {
  apiFetch.mockReset();
  useRealtimeStore.getState().reset();
});

test('renders total and byType rows from mocked stats', async () => {
  apiFetch.mockResolvedValue(stats);
  setup();
  await waitFor(() => expect(screen.getByTestId('stats-timeseries-total')).toHaveTextContent('4'));
  const byType = screen.getByTestId('stats-bytype');
  expect(within(byType).getByText('intrusion')).toBeInTheDocument();
  expect(byType).toHaveTextContent(/intrusion\s*3/);
  expect(byType).toHaveTextContent(/fire\s*1/);
});

test('requests today with the browser timezone and offset boundaries by default', async () => {
  apiFetch.mockResolvedValue(stats);
  setup();
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  const q = lastQuery();
  expect(q.get('siteId')).toBe(SITE);
  expect(q.get('bucket')).toBe('hour');
  expect(q.get('tz')).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(q.get('from')).toMatch(/T00:00:00[+-]\d\d:\d\d$/);
});

test('switching to a 7 day preset requests day buckets', async () => {
  apiFetch.mockResolvedValue(stats);
  setup();
  await screen.findByText('Intrusion'.toLowerCase());
  await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
  await waitFor(() => expect(lastQuery().get('bucket')).toBe('day'));
});

test('shows deleted devices and unknown floors with labels, and the unacked count', async () => {
  apiFetch.mockResolvedValue(stats);
  setup();
  expect(await screen.findByText('cam-gone (deleted)')).toBeInTheDocument();
  expect(screen.getByText('Unknown floor')).toBeInTheDocument();
  expect(screen.getByTestId('stats-unacked')).toHaveTextContent('2');
});

test('shows the translated server error code', async () => {
  apiFetch.mockRejectedValue(new ApiError(400, 'range_too_long', 'too long'));
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent(/too long for this resolution/);
});

test('refetches when a new alarm arrives, at most once per 5 seconds', async () => {
  apiFetch.mockResolvedValue(stats);
  setup();
  await screen.findByText('intrusion');
  expect(apiFetch).toHaveBeenCalledTimes(1);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const alarm = (id: string) =>
      ({
        id,
        siteId: SITE,
        acknowledgedAt: null,
        lastReceivedAt: new Date().toISOString(),
      }) as Alarm;
    useRealtimeStore.setState({ siteId: SITE });
    await act(async () => {
      useRealtimeStore.setState({ alarms: new Map([['a1', alarm('a1')]]) });
      useRealtimeStore.setState({
        alarms: new Map([
          ['a1', alarm('a1')],
          ['a2', alarm('a2')],
        ]),
      });
    });
    // The first fetch just happened, so the refetch is deferred rather than immediate.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(apiFetch).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test('drops the previous site stats while the new site loads', async () => {
  apiFetch.mockResolvedValueOnce(stats);
  setup();
  await waitFor(() => expect(screen.getByTestId('stats-timeseries-total')).toHaveTextContent('4'));
  apiFetch.mockReturnValue(new Promise(() => {}));
  await userEvent.click(screen.getByText('to-b'));
  await waitFor(() => expect(lastQuery().get('siteId')).toBe(SITE_B));
  expect(screen.queryByTestId('stats-timeseries-total')).not.toBeInTheDocument();
  expect(screen.queryByTestId('stats-bytype')).not.toBeInTheDocument();
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});
