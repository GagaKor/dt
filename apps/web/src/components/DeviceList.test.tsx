import type { Device, Floor } from '@dt/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import '../i18n';
import { DeviceList } from './DeviceList';

const floors: Floor[] = [
  { id: 'f1', siteId: 's1', name: '1F', elevationMin: 0, elevationMax: 4, sortOrder: 0 },
];
const device = (id: string, type: Device['type']): Device => ({
  id,
  siteId: 's1',
  floorId: 'f1',
  type,
  name: `${id} name`,
  position: [0, 1, 0],
  yawDeg: 0,
  pitchDeg: 0,
  hfovDeg: type === 'camera' ? 90 : null,
  rangeM: type === 'camera' ? 10 : null,
});

test('DeviceList shows id, name, type and floor and selects on click', async () => {
  const onSelect = vi.fn();
  const devices = [device('cam-1', 'camera'), device('door-1', 'sensor')];
  render(<DeviceList devices={devices} floors={floors} selectedId="door-1" onSelect={onSelect} />);
  const rows = screen.getAllByTestId('device-row');
  expect(rows).toHaveLength(2);
  for (const text of ['cam-1', 'cam-1 name', 'Camera', '1F']) {
    expect(within(rows[0]!).getByText(text)).toBeInTheDocument();
  }
  expect(rows[1]).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(rows[0]!);
  expect(onSelect).toHaveBeenCalledWith(devices[0]);
});
