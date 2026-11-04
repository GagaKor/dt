import type { Alarm, Device, Floor } from '@dt/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import '../i18n';
import { useRealtimeStore } from '../realtime/store';
import { useViewStore } from '../state/viewStore';
import { AlarmPanel } from './AlarmPanel';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  apiFetch,
}));

const floors: Floor[] = [
  { id: 'f1', siteId: 's1', name: '1F', elevationMin: 0, elevationMax: 4, sortOrder: 0 },
  { id: 'f2', siteId: 's1', name: '2F', elevationMin: 4, elevationMax: 8, sortOrder: 1 },
];
const devices: Device[] = [
  {
    id: 'cam-1',
    siteId: 's1',
    floorId: 'f1',
    type: 'camera',
    name: 'Lobby camera',
    position: [1, 3, -1],
    yawDeg: 0,
    pitchDeg: 0,
    hfovDeg: 90,
    rangeM: 10,
  },
];

const T0 = '2026-11-04T01:00:00.000Z';
const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: 'A1',
  siteId: 's1',
  floorId: 'f1',
  deviceId: 'cam-1',
  deviceName: 'Lobby camera',
  integrationKeyId: 'k1',
  integrationKeyName: 'sim',
  eventType: 'intrusion',
  objectId: 'p-1',
  objectType: 'person',
  severity: 'critical',
  count: 1,
  firstOccurredAt: T0,
  lastOccurredAt: T0,
  lastReceivedAt: T0,
  x: 1,
  y: 2,
  acknowledgedAt: null,
  ackNote: null,
  ...over,
});

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === '/api/sites/s1/floors') return floors;
    if (path === '/api/sites/s1/devices') return devices;
    const ack = /^\/api\/alarms\/([^/]+)\/ack$/.exec(path);
    if (ack && init?.method === 'POST')
      return alarm({ id: ack[1], acknowledgedAt: '2026-11-04T01:05:00.000Z' });
    throw new Error(`unexpected request ${path}`);
  });
  useRealtimeStore.getState().reset();
  useViewStore.setState({ selectedFloorId: null, flyTo: null });
});

function setup(alarms: Alarm[]) {
  useRealtimeStore
    .getState()
    .apply({ type: 'snapshot', siteId: 's1', objects: [], alarms, sites: [] }, 0);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AlarmPanel siteId="s1" />
    </QueryClientProvider>,
  );
}

test('shows ×3 and acknowledges', async () => {
  setup([alarm({ id: 'A1', count: 3 })]);
  expect(screen.getByTestId('alarm-count')).toHaveTextContent('×3');
  await userEvent.click(screen.getByTestId('alarm-ack'));
  expect(apiFetch).toHaveBeenCalledWith(
    '/api/alarms/A1/ack',
    expect.objectContaining({ method: 'POST' }),
  );
  await waitFor(() => expect(screen.queryByTestId('alarm-item')).toBeNull());
});

test('lists the newest alarm first with device and floor names', async () => {
  setup([
    alarm({
      id: 'old',
      eventType: 'smoke',
      severity: 'major',
      deviceId: 'sensor-9',
      deviceName: null,
      floorId: 'f2',
      x: null,
      y: null,
    }),
    alarm({ id: 'new', lastReceivedAt: '2026-11-04T02:00:00.000Z' }),
  ]);
  const items = screen.getAllByTestId('alarm-item');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('intrusion');
  expect(items[0]).toHaveTextContent('Lobby camera');
  await waitFor(() => expect(items[0]).toHaveTextContent('1F'));
  expect(items[1]).toHaveTextContent('smoke');
  expect(items[1]).toHaveTextContent('Major');
  expect(items[1]).toHaveTextContent('sensor-9');
  expect(items[1]).toHaveTextContent('2F');
  expect(within(items[1]!).queryByTestId('alarm-count')).toBeNull();
});

test('clicking an alarm selects its floor and flies to its position', async () => {
  setup([alarm({ floorId: 'f2', x: 5, y: 2 })]);
  await waitFor(() => expect(screen.getByTestId('alarm-item')).toHaveTextContent('2F'));
  await userEvent.click(screen.getByRole('button', { name: /intrusion/ }));
  expect(useViewStore.getState().selectedFloorId).toBe('f2');
  expect(useViewStore.getState().flyTo!.target.toArray()).toEqual([5, 4, -2]);
});

test('an alarm without coordinates flies to its device', async () => {
  setup([alarm({ x: null, y: null })]);
  await waitFor(() => expect(screen.getByTestId('alarm-item')).toHaveTextContent('1F'));
  await userEvent.click(screen.getByRole('button', { name: /intrusion/ }));
  expect(useViewStore.getState().flyTo!.target.toArray()).toEqual([1, 3, -1]);
});

test('acknowledging with a note sends the note', async () => {
  setup([alarm()]);
  await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Note (optional)' }), 'checked');
  await userEvent.click(screen.getByTestId('alarm-ack'));
  expect(apiFetch).toHaveBeenCalledWith(
    '/api/alarms/A1/ack',
    expect.objectContaining({ method: 'POST', json: { note: 'checked' } }),
  );
});

test('a failed acknowledgement keeps the alarm and shows an error', async () => {
  setup([alarm()]);
  apiFetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/ack')) throw new Error('boom');
    return path.endsWith('/floors') ? floors : devices;
  });
  await userEvent.click(screen.getByTestId('alarm-ack'));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByTestId('alarm-item')).toBeInTheDocument();
});

test('shows the empty state when the site has no alarms', () => {
  setup([]);
  expect(screen.queryByTestId('alarm-item')).toBeNull();
  expect(screen.getByText('No unacknowledged alarms.')).toBeInTheDocument();
});

test('ignores alarms the store holds for another site', () => {
  useRealtimeStore.getState().apply(
    {
      type: 'snapshot',
      siteId: 's2',
      objects: [],
      alarms: [alarm({ siteId: 's2' })],
      sites: [],
    },
    0,
  );
  expect(useRealtimeStore.getState().alarms.size).toBe(1);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AlarmPanel siteId="s1" />
    </QueryClientProvider>,
  );
  expect(screen.queryByTestId('alarm-item')).toBeNull();
  expect(screen.getByText('No unacknowledged alarms.')).toBeInTheDocument();
});
