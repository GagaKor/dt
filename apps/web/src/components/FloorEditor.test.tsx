import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { validateFloorRanges, type FloorInput } from '@dt/shared';
import '../i18n';
import { FloorEditor, applySuggestion } from './FloorEditor';

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
