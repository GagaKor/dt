import type { Device, Floor, FloorInput, ModelUploadResult } from '@dt/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../../api/client';
import '../../i18n';
import { useFloorDraftStore } from '../../state/floorDraftStore';
import { SiteDetailPage } from './SiteDetailPage';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', async (orig) => ({
  ...(await orig<typeof import('../../api/client')>()),
  apiFetch,
}));
const uploadModel = vi.hoisted(() => vi.fn());
vi.mock('../../api/uploadModel', () => ({ uploadModel }));

const site = { id: 's1', name: 'Depot', modelVersion: null, createdAt: '2026-11-06T00:00:00Z' };
const ground: Floor = {
  id: 'f1',
  siteId: 's1',
  name: 'Ground',
  elevationMin: 0,
  elevationMax: 4,
  sortOrder: 0,
};
const camera: Device = {
  id: 'cam-1',
  siteId: 's1',
  floorId: 'f1',
  type: 'camera',
  name: 'Gate',
  position: [0, 2, 0],
  yawDeg: 0,
  pitchDeg: 0,
  hfovDeg: 90,
  rangeM: 10,
};
const uploaded: ModelUploadResult = {
  site: { ...site, modelVersion: 1 },
  warnings: [],
  floorSuggestion: [
    { elevationMin: 0, elevationMax: 5 },
    { elevationMin: 5, elevationMax: 11.1 },
    { elevationMin: 11.1, elevationMax: 13.15, roof: true },
  ],
};

let savedFloors: Floor[];
let devices: Device[];
let putFloors: (body: FloorInput[]) => Promise<Floor[]>;

beforeEach(() => {
  useFloorDraftStore.setState({ drafts: {} });
  sessionStorage.clear();
  savedFloors = [ground];
  devices = [];
  putFloors = async (body) =>
    (savedFloors = body.map((f, i) => ({ siteId: 's1', sortOrder: i, ...f, id: f.id ?? `n${i}` })));
  apiFetch.mockReset();
  apiFetch.mockImplementation(
    async (path: string, init?: { method?: string; json?: FloorInput[] }) => {
      if (path === '/api/sites') return [site];
      if (path === '/api/sites/s1/floors')
        return init?.method === 'PUT' ? putFloors(init.json!) : savedFloors;
      if (path === '/api/sites/s1/devices') return devices;
      throw new Error(`unexpected ${path}`);
    },
  );
  uploadModel.mockReset();
  uploadModel.mockResolvedValue(uploaded);
});

const setup = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/settings/sites/s1']}>
        <Routes>
          <Route path="/settings/sites/:siteId" element={<SiteDetailPage />} />
          <Route path="/settings/sites/:siteId/devices" element={<p>device placement</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const floorNames = () =>
  screen
    .getAllByTestId('floor-row')
    .map((row) => (row.querySelector('input') as HTMLInputElement).value);
const floorPuts = () => apiFetch.mock.calls.filter(([, init]) => init?.method === 'PUT');
const upload = () =>
  userEvent.upload(
    screen.getByTestId('model-file-input'),
    new File(['glb'], 'depot.glb', { type: 'model/gltf-binary' }),
  );

test('uploading a model fills in the suggested floors when no devices are placed yet', async () => {
  setup();
  await waitFor(() => expect(floorNames()).toEqual(['Ground']));
  await upload();
  await waitFor(() => expect(floorNames()).toEqual(['1F', '2F', 'Roof']));
  expect(
    screen.getByText('Filled in 3 floors found in the model. Save to keep them.'),
  ).toBeVisible();
  expect(screen.queryByTestId('floor-apply-suggestion')).toBeNull();
  expect(floorPuts()).toHaveLength(0);
});

test('uploading keeps the floors devices sit on and offers the suggestion instead', async () => {
  devices = [camera];
  setup();
  await waitFor(() => expect(floorNames()).toEqual(['Ground']));
  await upload();
  expect(await screen.findByTestId('floor-apply-suggestion')).toBeVisible();
  expect(floorNames()).toEqual(['Ground']);
});

test('unsaved floor edits survive leaving the page and can be reverted', async () => {
  const first = setup();
  await waitFor(() => expect(floorNames()).toEqual(['Ground']));
  const name = screen.getAllByTestId('floor-row')[0]!.querySelector('input')!;
  await userEvent.clear(name);
  await userEvent.type(name, 'Lobby');
  first.unmount();

  setup();
  await waitFor(() => expect(floorNames()).toEqual(['Lobby']));
  expect(await screen.findByText('Unsaved changes')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Revert' }));
  expect(floorNames()).toEqual(['Ground']);
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

test('with unsaved floors, the devices button saves them before opening device placement', async () => {
  setup();
  await waitFor(() => expect(floorNames()).toEqual(['Ground']));
  await upload();
  await waitFor(() => expect(floorNames()).toEqual(['1F', '2F', 'Roof']));
  await userEvent.click(screen.getByRole('button', { name: 'Save and place devices' }));
  expect(await screen.findByText('device placement')).toBeVisible();
  expect(floorPuts()).toHaveLength(1);
  expect(floorPuts()[0]![1].json.map((f: FloorInput) => f.name)).toEqual(['1F', '2F', 'Roof']);
  expect(useFloorDraftStore.getState().drafts.s1).toBeUndefined();
});

test('when that save fails, the page stays open with the reason and the draft', async () => {
  devices = [camera];
  putFloors = () =>
    Promise.reject(new ApiError(409, 'floor_in_use', 'in use', { deviceIds: ['cam-1'] }));
  setup();
  await waitFor(() => expect(floorNames()).toEqual(['Ground']));
  await upload();
  await userEvent.click(await screen.findByTestId('floor-apply-suggestion'));
  await userEvent.click(screen.getByRole('button', { name: 'Save and place devices' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('cam-1');
  expect(screen.queryByText('device placement')).toBeNull();
  expect(floorNames()).toEqual(['1F', '2F', 'Roof']);
});

test('without changes the devices button only opens device placement', async () => {
  setup();
  await waitFor(() => expect(floorNames()).toEqual(['Ground']));
  await userEvent.click(screen.getByRole('link', { name: 'Place devices' }));
  expect(await screen.findByText('device placement')).toBeVisible();
  expect(floorPuts()).toHaveLength(0);
});
