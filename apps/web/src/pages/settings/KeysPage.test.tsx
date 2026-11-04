import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const setup = () =>
  render(
    <QueryClientProvider client={qc}>
      <KeysPage />
    </QueryClientProvider>,
  );

test('KeysPage shows plaintext after create and hides it after close', async () => {
  setup();
  expect(await screen.findAllByTestId('key-row')).toHaveLength(1);
  await userEvent.type(screen.getByTestId('key-create-name'), 'new');
  await userEvent.click(screen.getByTestId('key-create-submit'));
  expect(await screen.findByTestId('key-plaintext')).toHaveTextContent('dtk_secret_plaintext');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByTestId('key-plaintext')).toBeNull());
  expect(document.body.textContent).not.toContain('dtk_secret_plaintext');
  expect(
    JSON.stringify(
      qc
        .getMutationCache()
        .getAll()
        .map((m) => m.state),
    ),
  ).not.toContain('dtk_secret_plaintext');
});

test('Escape closes the key dialog and clears the plaintext', async () => {
  setup();
  await screen.findAllByTestId('key-row');
  await userEvent.type(screen.getByTestId('key-create-name'), 'new');
  await userEvent.click(screen.getByTestId('key-create-submit'));
  await screen.findByTestId('key-plaintext');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByTestId('key-plaintext')).toBeNull());
  expect(screen.getByTestId('key-create-submit')).toHaveFocus();
});

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  window.getSelection()?.removeAllRanges();
});

async function openPlaintext() {
  setup();
  await screen.findAllByTestId('key-row');
  await userEvent.type(screen.getByTestId('key-create-name'), 'new');
  await userEvent.click(screen.getByTestId('key-create-submit'));
  await screen.findByTestId('key-plaintext');
}

const manualHint = /press Ctrl\+C/;

test('copy writes the key to the clipboard when it is available', async () => {
  const writeText = vi.fn(async () => undefined);
  setClipboard({ writeText });
  await openPlaintext();
  await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(writeText).toHaveBeenCalledWith('dtk_secret_plaintext');
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  expect(screen.queryByText(manualHint)).toBeNull();
});

test('without a clipboard (plain HTTP) copy selects the key and explains Ctrl/Cmd+C', async () => {
  setClipboard(undefined);
  await openPlaintext();
  await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await screen.findByText(manualHint)).toBeInTheDocument();
  expect(window.getSelection()?.toString()).toBe('dtk_secret_plaintext');
});

test('a failing clipboard write falls back to selecting the key', async () => {
  setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error('denied'))) });
  await openPlaintext();
  await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await screen.findByText(manualHint)).toBeInTheDocument();
  expect(window.getSelection()?.toString()).toBe('dtk_secret_plaintext');
});
