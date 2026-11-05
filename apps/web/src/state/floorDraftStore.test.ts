import type { Floor, FloorInput } from '@dt/shared';
import { beforeEach, expect, test } from 'vitest';
import { floorsChanged, useFloorDraftStore } from './floorDraftStore';

const lobby: FloorInput = { name: 'Lobby', elevationMin: 0, elevationMax: 4 };

beforeEach(() => {
  useFloorDraftStore.setState({ drafts: {} });
  sessionStorage.clear();
});

test('keeps one draft per site and clears only that site', () => {
  const { setDraft, clearDraft } = useFloorDraftStore.getState();
  setDraft('s1', [lobby]);
  setDraft('s2', [{ ...lobby, name: 'Hall' }]);
  clearDraft('s1');
  expect(useFloorDraftStore.getState().drafts).toEqual({ s2: [{ ...lobby, name: 'Hall' }] });
});

test('drafts are kept in sessionStorage so a reload does not lose them', () => {
  useFloorDraftStore.getState().setDraft('s1', [lobby]);
  expect(sessionStorage.getItem('dt.floorDrafts')).toContain('"Lobby"');
});

test('floorsChanged compares the editable fields with the saved floors', () => {
  const saved: Floor[] = [
    { id: 'f1', siteId: 's1', name: 'Lobby', elevationMin: 0, elevationMax: 4, sortOrder: 0 },
  ];
  expect(floorsChanged([{ id: 'f1', ...lobby }], saved)).toBe(false);
  expect(floorsChanged([{ id: 'f1', ...lobby, elevationMax: 4.5 }], saved)).toBe(true);
  expect(floorsChanged([{ id: 'f1', ...lobby, name: 'Hall' }], saved)).toBe(true);
  expect(floorsChanged([lobby], saved)).toBe(true);
  expect(floorsChanged([], saved)).toBe(true);
});
