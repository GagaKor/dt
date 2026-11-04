import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, test, vi } from 'vitest';
import '../../i18n';
import { KeysPage } from './KeysPage';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', async (orig) => ({
  ...(await orig<typeof import('../../api/client')>()),
  apiFetch,
}));

const row = {
  id: 'k1',
  name: 'cam-gateway',
  prefix: 'dtk_abcd',
  defaultSeverity: 'critical',
  createdAt: '2026-11-04T00:00:00Z',
  revokedAt: null,
};

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method === 'POST')
      return { ...row, id: 'k2', name: 'new', key: 'dtk_secret_plaintext' };
    return [row];
  });
});

test('KeysPage shows plaintext after create and hides it after close', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <KeysPage />
    </QueryClientProvider>,
  );
  expect(await screen.findAllByTestId('key-row')).toHaveLength(1);
  await userEvent.type(screen.getByTestId('key-create-name'), 'new');
  await userEvent.click(screen.getByTestId('key-create-submit'));
  expect(await screen.findByTestId('key-plaintext')).toHaveTextContent('dtk_secret_plaintext');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByTestId('key-plaintext')).toBeNull());
  expect(document.body.textContent).not.toContain('dtk_secret_plaintext');
});
