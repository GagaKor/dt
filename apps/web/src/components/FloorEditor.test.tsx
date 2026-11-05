import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
