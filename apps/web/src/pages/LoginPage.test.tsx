import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, test, vi } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import { LoginPage } from './LoginPage';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  apiFetch,
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
});

test('submits credentials and navigates to / on success', async () => {
  apiFetch.mockResolvedValue(undefined);
  setup();
  await userEvent.type(screen.getByTestId('login-username'), 'admin');
  await userEvent.type(screen.getByTestId('login-password'), 'secret-pass');
  await userEvent.click(screen.getByTestId('login-submit'));
  await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument());
  expect(apiFetch).toHaveBeenCalledWith('/api/auth/login', {
    method: 'POST',
    json: { username: 'admin', password: 'secret-pass' },
  });
});

test('shows login.invalid message on 401', async () => {
  apiFetch.mockImplementation(async () => {
    throw new ApiError(401, 'invalid_credentials', 'Invalid');
  });
  setup();
  await userEvent.type(screen.getByTestId('login-username'), 'admin');
  await userEvent.type(screen.getByTestId('login-password'), 'bad');
  await userEvent.click(screen.getByTestId('login-submit'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
});

test('shows the product name as the heading', () => {
  setup();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cutaway');
});
