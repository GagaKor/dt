import type { DeviceCreate } from '@dt/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { ApiError } from '../api/client';
import '../i18n';
import { DeviceForm, apiErrorToFormErrors, validateDevice } from './DeviceForm';

const base: DeviceCreate = {
  id: 'camera-1',
  siteId: 's1',
  floorId: 'f1',
  type: 'camera',
  name: 'camera-1',
  position: [1, 1.2, -2],
  yawDeg: 0,
  pitchDeg: 0,
  hfovDeg: 90,
  rangeM: 10,
};

const noop = () => {};

test('DeviceForm shows error for hfov 200 and disables save', () => {
  render(<DeviceForm value={{ ...base, hfovDeg: 200 }} onChange={noop} onSave={noop} isNew />);
  const hfov = screen.getByRole('spinbutton', { name: 'Horizontal FOV (°)' });
  expect(hfov).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('between 10 and 170');
  expect(screen.getByTestId('device-form-save')).toBeDisabled();
});

function Harness({ onSave }: { onSave(v: DeviceCreate): void }) {
  const [v, setV] = useState(base);
  return <DeviceForm value={v} onChange={setV} onSave={() => onSave(v)} isNew />;
}

test('fixing an out-of-range value clears the error and saves the edited values', async () => {
  const onSave = vi.fn();
  render(<Harness onSave={onSave} />);
  const range = screen.getByRole('spinbutton', { name: 'Range (m)' });
  await userEvent.clear(range);
  await userEvent.type(range, '150');
  expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 100');
  expect(screen.getByTestId('device-form-save')).toBeDisabled();

  await userEvent.clear(range);
  await userEvent.type(range, '25');
  await userEvent.clear(screen.getByTestId('device-form-yaw'));
  await userEvent.type(screen.getByTestId('device-form-yaw'), '45');
  expect(screen.queryByRole('alert')).toBeNull();
  await userEvent.click(screen.getByTestId('device-form-save'));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rangeM: 25, yawDeg: 45 }));
});

test('server device_id_taken is shown next to the id field', () => {
  render(
    <DeviceForm
      value={base}
      onChange={noop}
      onSave={noop}
      errors={{ id: 'device_id_taken' }}
      isNew
    />,
  );
  expect(screen.getByTestId('device-form-id')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('already in use');
});

test('id is fixed for existing devices and sensors have no fov fields', () => {
  render(
    <DeviceForm
      value={{ ...base, type: 'sensor', hfovDeg: null, rangeM: null }}
      onChange={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByTestId('device-form-id')).toHaveAttribute('readonly');
  expect(screen.queryByRole('spinbutton', { name: 'Horizontal FOV (°)' })).toBeNull();
  expect(screen.queryByRole('spinbutton', { name: 'Range (m)' })).toBeNull();
});

test('switching a sensor to camera fills in the default fov and range', async () => {
  const onChange = vi.fn();
  render(
    <DeviceForm
      value={{ ...base, type: 'sensor', hfovDeg: null, rangeM: null }}
      onChange={onChange}
      onSave={noop}
      isNew
    />,
  );
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'camera');
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'camera', hfovDeg: 90, rangeM: 10 }),
  );
});

test('validateDevice mirrors the server rules', () => {
  expect(validateDevice(base)).toEqual({});
  expect(
    validateDevice({ ...base, id: 'bad id', name: ' ', pitchDeg: -91, rangeM: Number.NaN }),
  ).toEqual({ id: 'invalid_id', name: 'required', pitchDeg: 'out_of_range', rangeM: 'required' });
  expect(validateDevice({ ...base, type: 'sensor', hfovDeg: null, rangeM: null })).toEqual({});
});

test('api errors map onto form fields', () => {
  expect(apiErrorToFormErrors(new ApiError(409, 'device_id_taken', ''))).toEqual({
    id: 'device_id_taken',
  });
  expect(apiErrorToFormErrors(new ApiError(400, 'position_outside_floor', ''))).toEqual({
    form: 'position_outside_floor',
  });
  expect(apiErrorToFormErrors(new ApiError(500, 'http_error', ''))).toEqual({ form: 'unknown' });
  expect(apiErrorToFormErrors(new Error('offline'))).toEqual({ form: 'unknown' });
});

test('fields and save are locked while a save is in flight', () => {
  render(<DeviceForm value={base} onChange={noop} onSave={noop} saving isNew />);
  expect(screen.getByTestId('device-form-name')).toBeDisabled();
  expect(screen.getByTestId('device-form-yaw')).toBeDisabled();
  expect(screen.getByTestId('device-form-save')).toBeDisabled();
});
