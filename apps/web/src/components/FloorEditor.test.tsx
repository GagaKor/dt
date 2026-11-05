import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { validateFloorRanges, type FloorInput } from '@dt/shared';
import '../i18n';
import { FloorEditor, applySuggestion, editedRange } from './FloorEditor';

test('FloorEditor shows overlap message on the second row', () => {
  const value: FloorInput[] = [
    { name: '1F', elevationMin: 0, elevationMax: 3 },
    { name: '2F', elevationMin: 2, elevationMax: 6 },
  ];
  render(<FloorEditor value={value} onChange={() => {}} issues={validateFloorRanges(value)} />);
  const rows = screen.getAllByTestId('floor-row');
  expect(rows).toHaveLength(2);
  expect(within(rows[0]!).queryByRole('alert')).toBeNull();
  expect(within(rows[1]!).getByRole('alert')).toHaveTextContent('overlaps');
});

test('applying suggestion fills 1F..3F with suggested ranges', () => {
  const out = applySuggestion([
    { elevationMin: 0, elevationMax: 3 },
    { elevationMin: 3, elevationMax: 6 },
    { elevationMin: 6, elevationMax: 9 },
  ]);
  expect(out.map((f) => f.name)).toEqual(['1F', '2F', '3F']);
  expect(out[2]).toMatchObject({ elevationMin: 6, elevationMax: 9 });
});

test('a suggested roof range gets the roof name and does not count as a storey', () => {
  const out = applySuggestion(
    [
      { elevationMin: 5, elevationMax: 11 },
      { elevationMin: 11, elevationMax: 13.15, roof: true },
      { elevationMin: 0, elevationMax: 5 },
    ],
    'Roof',
  );
  expect(out.map((f) => f.name)).toEqual(['1F', '2F', 'Roof']);
  expect(out[2]).toEqual({ name: 'Roof', elevationMin: 11, elevationMax: 13.15 });
});

const twoFloors: FloorInput[] = [
  { name: '1F', elevationMin: 0, elevationMax: 4 },
  { name: '2F', elevationMin: 4, elevationMax: 8 },
];

test('the add button adds a height range and the editor says what a floor is', () => {
  render(<FloorEditor value={[]} onChange={() => {}} issues={[]} />);
  expect(screen.getByRole('button', { name: 'Add floor range' })).toBeInTheDocument();
  expect(screen.getByText(/a floor is a height range/i)).toBeInTheDocument();
});

test('reports the row being edited, or the hovered row while the pointer is over one', async () => {
  const onActive = vi.fn();
  render(
    <FloorEditor value={twoFloors} onChange={() => {}} issues={[]} onActiveChange={onActive} />,
  );
  const rows = screen.getAllByTestId('floor-row');
  await userEvent.click(within(rows[1]!).getByRole('spinbutton', { name: /min/i }));
  expect(onActive).toHaveBeenLastCalledWith(1);
  await userEvent.hover(rows[0]!);
  expect(onActive).toHaveBeenLastCalledWith(0);
  await userEvent.unhover(rows[0]!);
  expect(onActive).toHaveBeenLastCalledWith(1);
  await userEvent.click(document.body);
  expect(onActive).toHaveBeenLastCalledWith(null);
});

test('editedRange returns the row range only when it is complete and ordered', () => {
  expect(editedRange(twoFloors, 1)).toEqual({ name: '2F', elevationMin: 4, elevationMax: 8 });
  expect(editedRange(twoFloors, null)).toBeNull();
  expect(editedRange(twoFloors, 2)).toBeNull();
  expect(editedRange([{ name: 'x', elevationMin: Number.NaN, elevationMax: 4 }], 0)).toBeNull();
  expect(editedRange([{ name: 'x', elevationMin: 4, elevationMax: 4 }], 0)).toBeNull();
});

test('moving focus within a row keeps that row active', async () => {
  const onActive = vi.fn();
  render(
    <FloorEditor value={twoFloors} onChange={() => {}} issues={[]} onActiveChange={onActive} />,
  );
  const row = screen.getAllByTestId('floor-row')[1]!;
  await userEvent.click(within(row).getByRole('spinbutton', { name: /min/i }));
  onActive.mockClear();
  await userEvent.tab();
  expect(within(row).getByRole('spinbutton', { name: /max/i })).toHaveFocus();
  expect(onActive).not.toHaveBeenCalledWith(null);
});

test('removing the focused row stops previewing it', async () => {
  const onActive = vi.fn();
  function Harness() {
    const [rows, setRows] = useState(twoFloors);
    return <FloorEditor value={rows} onChange={setRows} issues={[]} onActiveChange={onActive} />;
  }
  render(<Harness />);
  const first = screen.getAllByTestId('floor-row')[0]!;
  // Keyboard only: a pointer left over the row would keep the row that moves up active.
  act(() => within(first).getByRole('spinbutton', { name: /min/i }).focus());
  expect(onActive).toHaveBeenLastCalledWith(0);
  act(() =>
    within(first)
      .getByRole('button', { name: /remove/i })
      .focus(),
  );
  await userEvent.keyboard('{Enter}');
  expect(screen.getAllByTestId('floor-row')).toHaveLength(1);
  expect(onActive).toHaveBeenLastCalledWith(null);
});
