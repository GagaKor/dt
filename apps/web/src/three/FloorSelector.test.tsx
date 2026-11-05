import type { Floor } from '@dt/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';
import '../i18n';
import { useViewStore } from '../state/viewStore';
import { FloorSelector } from './FloorSelector';

const floor = (id: string, name: string, elevationMin: number, sortOrder: number): Floor => ({
  id,
  siteId: 's1',
  name,
  elevationMin,
  elevationMax: elevationMin + 4,
  sortOrder,
});
const floors = [floor('a', '1F', 0, 0), floor('b', '2F', 4, 1), floor('c', '3F', 8, 2)];

beforeEach(() => useViewStore.setState({ selectedFloorId: null, showOtherFloors: false }));

test('lists All first, then floors from the top down', () => {
  render(<FloorSelector floors={floors} />);
  const labels = screen.getAllByTestId('floor-option').map((b) => b.textContent);
  expect(labels).toEqual(['All', '3F', '2F', '1F']);
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
});

test('clicking a floor selects it and All clears it', async () => {
  render(<FloorSelector floors={floors} />);
  await userEvent.click(screen.getByRole('button', { name: '2F' }));
  expect(useViewStore.getState().selectedFloorId).toBe('b');
  expect(screen.getByRole('button', { name: '2F' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(useViewStore.getState().selectedFloorId).toBeNull();
});

test('a selected floor offers to show the other floors, off by default', async () => {
  render(<FloorSelector floors={floors} />);
  expect(screen.queryByRole('checkbox', { name: 'Show other floors' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '2F' }));
  const toggle = screen.getByRole('checkbox', { name: 'Show other floors' });
  expect(toggle).not.toBeChecked();
  await userEvent.click(toggle);
  expect(useViewStore.getState().showOtherFloors).toBe(true);
  expect(toggle).toBeChecked();
});

test('shows how many unacknowledged alarms each floor has, coloured by the most severe', () => {
  render(
    <FloorSelector floors={floors} alarms={new Map([['b', { count: 3, severity: 'major' }]])} />,
  );
  const badges = screen.getAllByTestId('floor-alarm-count');
  expect(badges).toHaveLength(1);
  expect(badges[0]).toHaveTextContent('3');
  expect(badges[0]).toHaveClass('bg-orange-500');
  expect(screen.getByRole('button', { name: '2F 3 unacknowledged alarms' })).toBeVisible();
  expect(screen.getByRole('button', { name: '1F' })).toBeVisible();
});
