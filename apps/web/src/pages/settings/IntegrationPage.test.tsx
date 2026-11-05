import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import '../../i18n';
import { IntegrationPage } from './IntegrationPage';

afterEach(() => vi.restoreAllMocks());

const setup = () =>
  render(
    <MemoryRouter>
      <IntegrationPage />
    </MemoryRouter>,
  );

test('opens Swagger in a new tab and downloads the OpenAPI document', () => {
  setup();
  const swagger = screen.getByRole('link', { name: 'Open Swagger' });
  expect(swagger).toHaveAttribute('href', '/api/docs');
  expect(swagger).toHaveAttribute('target', '_blank');
  expect(swagger.getAttribute('rel')).toContain('noopener');
  const spec = screen.getByRole('link', { name: 'Download OpenAPI JSON' });
  expect(spec).toHaveAttribute('href', '/api/openapi.json');
  expect(spec).toHaveAttribute('download', 'cutaway-openapi.json');
});

test('downloads the integration guide bundled with the app', async () => {
  const blobs: Blob[] = [];
  const names: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    blobs.push(b as Blob);
    return 'blob:guide';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Download integration guide' }));
  expect(names).toEqual(['cutaway-integration-guide.md']);
  expect(await blobs[0]!.text()).toContain('# 연동 가이드');
  await userEvent.click(screen.getByRole('button', { name: 'Download model specification' }));
  expect(names[1]).toBe('cutaway-model-spec.md');
  expect(await blobs[1]!.text()).toContain('# 3D 모델 규격');
});

test('shows where to send messages and which header to use', () => {
  setup();
  const origin = window.location.origin;
  expect(screen.getByText(`POST ${origin}/api/ingest/events`)).toBeInTheDocument();
  expect(screen.getByText(`POST ${origin}/api/ingest/positions`)).toBeInTheDocument();
  expect(screen.getByText(/Authorization: Bearer/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Manage integration keys' })).toHaveAttribute(
    'href',
    '/settings/keys',
  );
});
