import {
  QueryClientProvider,
  useMutation,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import '../i18n';
import { RequireAuth } from '../components/RequireAuth';
import { LoginPage } from '../pages/LoginPage';
import { ApiError } from './client';
import { meKey } from './queries';
import { createQueryClient } from './queryClient';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  apiFetch,
}));

let sessionValid: boolean;
const unauthenticated = () => new ApiError(401, 'unauthenticated', 'Authentication required');

beforeEach(() => {
  sessionValid = true;
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/login') {
      sessionValid = true;
      return undefined;
    }
    if (!sessionValid) throw unauthenticated();
    if (path === '/api/auth/me') return { username: 'admin' };
    if (path === '/api/sites') return [];
    if (path === '/api/alarms/a1/ack') return {};
    throw new Error(`unexpected request ${path}`);
  });
});

function Monitor() {
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => apiFetch('/api/sites') });
  const ack = useMutation({
    mutationFn: () => apiFetch('/api/alarms/a1/ack', { method: 'POST', json: {} }),
  });
  return (
    <div>
      <p>monitor</p>
      <button type="button" onClick={() => ack.mutate()}>
        ack
      </button>
      <button type="button" onClick={() => void sites.refetch()}>
        reload
      </button>
    </div>
  );
}

function setup(qc: QueryClient = createQueryClient()) {
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Monitor />
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

const meCalls = () => apiFetch.mock.calls.filter(([p]) => p === '/api/auth/me').length;

test('a 401 from a mutation sends the user to the login page', async () => {
  setup();
  expect(await screen.findByText('monitor')).toBeInTheDocument();
  sessionValid = false;
  await userEvent.click(screen.getByRole('button', { name: 'ack' }));
  expect(await screen.findByTestId('login-username')).toBeInTheDocument();
});

test('a 401 from a query sends the user to the login page', async () => {
  setup();
  expect(await screen.findByText('monitor')).toBeInTheDocument();
  sessionValid = false;
  await userEvent.click(screen.getByRole('button', { name: 'reload' }));
  expect(await screen.findByTestId('login-username')).toBeInTheDocument();
});

test('logging in again after the session expired returns to the app', async () => {
  setup();
  expect(await screen.findByText('monitor')).toBeInTheDocument();
  sessionValid = false;
  await userEvent.click(screen.getByRole('button', { name: 'ack' }));
  await screen.findByTestId('login-username');
  await userEvent.type(screen.getByTestId('login-username'), 'admin');
  await userEvent.type(screen.getByTestId('login-password'), 'test-password');
  await userEvent.click(screen.getByTestId('login-submit'));
  expect(await screen.findByText('monitor')).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByText('monitor')).toBeInTheDocument();
});

test('the me query reporting 401 itself does not trigger another check', async () => {
  sessionValid = false;
  setup();
  await screen.findByTestId('login-username');
  await new Promise((r) => setTimeout(r, 50));
  expect(meCalls()).toBe(1);
});

test('errors other than 401 leave the session alone', async () => {
  const qc = setup();
  expect(await screen.findByText('monitor')).toBeInTheDocument();
  apiFetch.mockImplementationOnce(async () => {
    throw new ApiError(403, 'forbidden', 'nope');
  });
  await userEvent.click(screen.getByRole('button', { name: 'ack' }));
  await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.status).toBe('error'));
  expect(qc.getQueryData(meKey)).toEqual({ username: 'admin' });
  expect(screen.getByText('monitor')).toBeInTheDocument();
});
