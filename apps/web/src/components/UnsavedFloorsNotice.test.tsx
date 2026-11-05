import type { Floor } from '@dt/shared';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, test } from 'vitest';
import '../i18n';
import { useFloorDraftStore } from '../state/floorDraftStore';
import { UnsavedFloorsNotice } from './UnsavedFloorsNotice';

const saved: Floor[] = [
  { id: 'f1', siteId: 's1', name: 'Ground', elevationMin: 0, elevationMax: 4, sortOrder: 0 },
];
const show = () =>
  render(
    <MemoryRouter>
      <UnsavedFloorsNotice siteId="s1" floors={saved} />
    </MemoryRouter>,
  );

beforeEach(() => useFloorDraftStore.setState({ drafts: {} }));

test('points back to the floor settings while that site has unsaved floor changes', () => {
  useFloorDraftStore.getState().setDraft('s1', [{ name: '1F', elevationMin: 0, elevationMax: 5 }]);
  show();
  expect(screen.getByRole('status')).toHaveTextContent('Floor changes are not saved yet');
  expect(screen.getByRole('link', { name: 'Go to floors' })).toHaveAttribute(
    'href',
    '/settings/sites/s1',
  );
});

test('says nothing when the draft matches the saved floors or belongs to another site', () => {
  useFloorDraftStore
    .getState()
    .setDraft('s1', [{ id: 'f1', name: 'Ground', elevationMin: 0, elevationMax: 4 }]);
  useFloorDraftStore.getState().setDraft('s2', [{ name: '1F', elevationMin: 0, elevationMax: 5 }]);
  const { container } = show();
  expect(container).toBeEmptyDOMElement();
});
