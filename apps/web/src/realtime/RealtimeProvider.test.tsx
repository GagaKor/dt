import type { Alarm, Site } from '@dt/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FakeWebSocket } from './fakeWebSocket';
import { RealtimeProvider, streamedSiteId } from './RealtimeProvider';
import { useRealtimeStore } from './store';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  apiFetch,
}));

const sites: Site[] = [
  { id: 's1', name: 'Annex', modelVersion: null, createdAt: '2026-11-04T00:00:00.000Z' },
  { id: 's2', name: 'Sample Office', modelVersion: 1, createdAt: '2026-11-04T00:00:00.000Z' },
];
const T0 = '2026-11-04T01:00:00.000Z';
const alarm: Alarm = {
  id: 'A1',
  siteId: 's2',
  floorId: 'f1',
  deviceId: 'cam-1',
  deviceName: null,
  integrationKeyId: 'k1',
  integrationKeyName: 'sim',
  eventType: 'intrusion',
  objectId: null,
  objectType: null,
  severity: 'critical',
  count: 1,
  firstOccurredAt: T0,
  lastOccurredAt: T0,
  lastReceivedAt: T0,
  x: null,
  y: null,
  acknowledgedAt: null,
  ackNote: null,
};

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/sites') return sites;
    throw new Error(`unexpected request ${path}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useRealtimeStore.getState().reset();
});

// `siteId` is what ShellLayout reads from the URL; `path` is the page being shown.
function setup(siteId?: string, path = siteId ? `/sites/${siteId}/monitor` : '/settings/keys') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <RealtimeProvider siteId={siteId}>
          <p>page</p>
        </RealtimeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const ws = FakeWebSocket.instances[0]!;
  act(() => ws.open());
  return { invalidate, view, ws };
}

const subscribe = (siteId: string) => JSON.stringify({ type: 'subscribe', siteId });

test('streams the site in the URL and applies its messages', async () => {
  const { ws, invalidate } = setup('s2');
  expect(FakeWebSocket.instances).toHaveLength(1);
  expect(ws.url).toMatch(/^ws:\/\/[^/]+\/api\/ws$/);
  await waitFor(() => expect(ws.sent).toEqual([subscribe('s2')]));
  expect(useRealtimeStore.getState()).toMatchObject({ siteId: 's2', status: 'open' });

  act(() => ws.receive({ type: 'alarm', alarm, created: true }));
  expect(useRealtimeStore.getState().alarms.size).toBe(1);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['kpi', 's2'] });
});

test('pages without a site stream the first site', async () => {
  const { ws } = setup();
  await waitFor(() => expect(ws.sent).toEqual([subscribe('s1')]));
});

const notice = (siteId: string) => ({
  type: 'summary',
  sites: [],
  newAlarm: {
    alarmId: `n-${siteId}`,
    siteId,
    siteName: siteId,
    severity: 'critical',
    eventType: 'intrusion',
  },
});
const toastSites = () => useRealtimeStore.getState().toasts.map((t) => t.siteId);

test('on a page without a site, alarms of the subscribed first site still toast', async () => {
  const { ws } = setup();
  await waitFor(() => expect(ws.sent).toEqual([subscribe('s1')]));
  expect(useRealtimeStore.getState().viewedSiteId).toBeNull();
  act(() => ws.receive(notice('s1')));
  expect(toastSites()).toEqual(['s1']);
});

test("on a site's monitor only the other sites toast", async () => {
  const { ws } = setup('s1');
  await waitFor(() => expect(ws.sent).toEqual([subscribe('s1')]));
  expect(useRealtimeStore.getState().viewedSiteId).toBe('s1');
  act(() => ws.receive(notice('s1')));
  expect(toastSites()).toEqual([]);
  act(() => ws.receive(notice('s2')));
  expect(toastSites()).toEqual(['s2']);
});

test("a site's settings page streams that site but does not count as viewing it", async () => {
  const { ws } = setup('s2', '/settings/sites/s2');
  await waitFor(() => expect(ws.sent).toEqual([subscribe('s2')]));
  act(() => ws.receive(notice('s2')));
  expect(toastSites()).toEqual(['s2']);
});

test('unmounting closes the connection and clears the store', async () => {
  const { ws, view } = setup('s2');
  await waitFor(() => expect(ws.sent).toHaveLength(1));
  act(() => ws.receive({ type: 'alarm', alarm, created: true }));
  view.unmount();
  expect(ws.closedWith).toBe(1000);
  expect(useRealtimeStore.getState()).toMatchObject({ siteId: null, status: 'closed' });
  expect(useRealtimeStore.getState().alarms.size).toBe(0);
});

test('an unauthenticated close re-checks the session', async () => {
  const { ws, invalidate } = setup('s2');
  act(() => ws.serverClose(4401));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] });
});

test('an unknown site close marks the site as refused', async () => {
  const { ws } = setup('s2');
  await waitFor(() => expect(ws.sent).toHaveLength(1));
  act(() => ws.serverClose(4404));
  expect(useRealtimeStore.getState().rejectedSiteId).toBe('s2');
});

test('streamedSiteId prefers an existing URL site, then the first site', () => {
  expect(streamedSiteId('s2', undefined)).toBeNull();
  expect(streamedSiteId('s2', ['s1', 's2'])).toBe('s2');
  expect(streamedSiteId('gone', ['s1', 's2'])).toBeNull();
  expect(streamedSiteId(undefined, ['s1', 's2'])).toBe('s1');
  expect(streamedSiteId(undefined, [])).toBeNull();
});
