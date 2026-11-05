import { DeviceIdSchema, modelToPlan, type DeviceCreate, type DeviceType } from '@dt/shared';
import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { buttonClass } from './ui';

export type DeviceFormField = 'id' | 'name' | 'yawDeg' | 'pitchDeg' | 'hfovDeg' | 'rangeM';
/** Error codes (keys under `devices.error`) per field; `form` holds errors without a field. */
export type DeviceFormErrors = Partial<Record<DeviceFormField | 'form', string>>;

export interface DeviceFormProps {
  value: DeviceCreate;
  onChange(v: DeviceCreate): void;
  onSave(): void;
  /** Server-side errors; client-side range checks are added by the form itself. */
  errors?: DeviceFormErrors;
  /** Only a device that has not been saved yet may change its id. */
  isNew?: boolean;
  saving?: boolean;
}

// Mirrors the server's device route validation.
export const DEVICE_LIMITS = {
  pitchDeg: { min: -90, max: 90 },
  hfovDeg: { min: 10, max: 170 },
  rangeM: { min: 1, max: 100 },
} as const;
export const DEFAULT_HFOV_DEG = 90;
export const DEFAULT_RANGE_M = 10;

const SERVER_CODES = new Set([
  'floor_not_in_site',
  'position_outside_floor',
  'validation_error',
  'device_not_found',
]);

type Limited = keyof typeof DEVICE_LIMITS;

function checkRange(v: number | null | undefined, field: Limited): string | undefined {
  if (typeof v !== 'number' || Number.isNaN(v)) return 'required';
  const { min, max } = DEVICE_LIMITS[field];
  return v < min || v > max ? 'out_of_range' : undefined;
}

export function validateDevice(v: DeviceCreate): DeviceFormErrors {
  const out: DeviceFormErrors = {};
  if (!DeviceIdSchema.safeParse(v.id).success) out.id = 'invalid_id';
  if (!v.name.trim()) out.name = 'required';
  if (typeof v.yawDeg !== 'number' || !Number.isFinite(v.yawDeg)) out.yawDeg = 'required';
  const fields: Limited[] = v.type === 'camera' ? ['pitchDeg', 'hfovDeg', 'rangeM'] : ['pitchDeg'];
  for (const f of fields) {
    const code = checkRange(v[f], f);
    if (code) out[f] = code;
  }
  return out;
}

export function apiErrorToFormErrors(e: unknown): DeviceFormErrors {
  if (e instanceof ApiError) {
    if (e.code === 'device_id_taken') return { id: e.code };
    if (SERVER_CODES.has(e.code)) return { form: e.code };
  }
  return { form: 'unknown' };
}

const inputClass =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm read-only:bg-slate-100 aria-invalid:border-red-500 dark:border-slate-600 dark:bg-slate-800 dark:read-only:bg-slate-700';

const num = (s: string) => (s === '' ? Number.NaN : Number(s));
const shown = (v: number | null | undefined) =>
  typeof v === 'number' && !Number.isNaN(v) ? v : '';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function DeviceForm({
  value,
  onChange,
  onSave,
  errors = {},
  isNew = false,
  saving = false,
}: DeviceFormProps) {
  const { t } = useTranslation();
  const local = validateDevice(value);
  const invalid = Object.keys(local).length > 0;
  const message = (field: DeviceFormField | 'form') => {
    const code = local[field as DeviceFormField] ?? errors[field];
    if (!code) return undefined;
    const limits = field in DEVICE_LIMITS ? DEVICE_LIMITS[field as Limited] : {};
    return t(`devices.error.${code}`, { ...limits, defaultValue: t('devices.error.unknown') });
  };
  const patch = (p: Partial<DeviceCreate>) => onChange({ ...value, ...p });
  const a11y = (id: string, field: DeviceFormField) => {
    const err = message(field);
    return {
      id,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${id}-error` : undefined,
    };
  };

  const setType = (type: DeviceType) =>
    patch(
      type === 'camera'
        ? {
            type,
            hfovDeg: value.hfovDeg ?? DEFAULT_HFOV_DEG,
            rangeM: value.rangeM ?? DEFAULT_RANGE_M,
          }
        : { type, hfovDeg: null, rangeM: null },
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invalid && !saving) onSave();
  };

  const [px, py, pz] = value.position;
  const plan = modelToPlan({ X: px, Z: pz });
  const formError = message('form');

  const slider = (field: 'hfovDeg' | 'rangeM', id: string, label: string, step: number) => {
    const { min, max } = DEVICE_LIMITS[field];
    const v = value[field];
    return (
      <Field id={id} label={label} error={message(field)}>
        <div className="flex items-center gap-2">
          <input
            type="range"
            aria-label={label}
            min={min}
            max={max}
            step={step}
            value={typeof v === 'number' && !Number.isNaN(v) ? v : min}
            onChange={(e) => patch({ [field]: Number(e.target.value) })}
            className="min-w-0 flex-1"
          />
          <input
            {...a11y(id, field)}
            type="number"
            min={min}
            max={max}
            step={step}
            value={shown(v)}
            onChange={(e) => patch({ [field]: num(e.target.value) })}
            className={`${inputClass} w-20`}
          />
        </div>
      </Field>
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-3">
        <Field id="device-form-id" label={t('devices.id')} error={message('id')}>
          <input
            {...a11y('device-form-id', 'id')}
            data-testid="device-form-id"
            readOnly={!isNew}
            value={value.id}
            onChange={(e) => patch({ id: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="device-form-name" label={t('devices.name')} error={message('name')}>
          <input
            {...a11y('device-form-name', 'name')}
            data-testid="device-form-name"
            value={value.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field id="device-form-type" label={t('devices.type')}>
          <select
            id="device-form-type"
            value={value.type}
            onChange={(e) => setType(e.target.value as DeviceType)}
            className={inputClass}
          >
            <option value="camera">{t('devices.types.camera')}</option>
            <option value="sensor">{t('devices.types.sensor')}</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="device-form-yaw" label={t('devices.yaw')} error={message('yawDeg')}>
            <input
              {...a11y('device-form-yaw', 'yawDeg')}
              data-testid="device-form-yaw"
              type="number"
              step={1}
              value={shown(value.yawDeg)}
              onChange={(e) => patch({ yawDeg: num(e.target.value) })}
              className={inputClass}
            />
          </Field>
          <Field id="device-form-pitch" label={t('devices.pitch')} error={message('pitchDeg')}>
            <input
              {...a11y('device-form-pitch', 'pitchDeg')}
              type="number"
              min={DEVICE_LIMITS.pitchDeg.min}
              max={DEVICE_LIMITS.pitchDeg.max}
              step={1}
              value={shown(value.pitchDeg)}
              onChange={(e) => patch({ pitchDeg: num(e.target.value) })}
              className={inputClass}
            />
          </Field>
        </div>
        {value.type === 'camera' && (
          <>
            {slider('hfovDeg', 'device-form-hfov', t('devices.hfov'), 1)}
            {slider('rangeM', 'device-form-range', t('devices.range'), 0.5)}
          </>
        )}
        <p className="text-xs text-slate-500">
          {t('devices.position', { x: plan.x.toFixed(2), y: plan.y.toFixed(2), h: py.toFixed(2) })}
        </p>
        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}
        <button
          type="submit"
          data-testid="device-form-save"
          disabled={invalid || saving}
          className={`${buttonClass('primary', 'md')} self-start`}
        >
          {t('common.save')}
        </button>
      </fieldset>
    </form>
  );
}
