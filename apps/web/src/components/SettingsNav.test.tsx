import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';
import '../i18n';
import { SettingsNav } from './SettingsNav';

test('links the settings pages and marks the current one', () => {
  render(
    <MemoryRouter initialEntries={['/settings/integration']}>
      <SettingsNav />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Sites' })).toHaveAttribute('href', '/settings/sites');
  expect(screen.getByRole('link', { name: 'Integration keys' })).toHaveAttribute(
    'href',
    '/settings/keys',
  );
  const docs = screen.getByRole('link', { name: 'Integration docs' });
  expect(docs).toHaveAttribute('href', '/settings/integration');
  expect(docs).toHaveAttribute('aria-current', 'page');
});
