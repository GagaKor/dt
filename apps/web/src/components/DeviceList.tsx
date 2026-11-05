import type { Device, Floor } from '@dt/shared';
import { useTranslation } from 'react-i18next';
import { PencilIcon } from './icons';

export interface DeviceListProps {
  devices: Device[];
  floors: Floor[];
  selectedId: string | null;
  onSelect(d: Device): void;
}

const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem_2.5rem_1rem] items-center gap-2';

const rowClass = (active: boolean) =>
  `group ${COLUMNS} w-full cursor-pointer rounded-md border px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
    active
      ? 'border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100'
      : 'border-transparent hover:border-slate-300 hover:bg-white dark:hover:border-slate-500 dark:hover:bg-slate-800'
  }`;

export function DeviceList({ devices, floors, selectedId, onSelect }: DeviceListProps) {
  const { t } = useTranslation();
  const floorName = new Map(floors.map((f) => [f.id, f.name]));

  if (devices.length === 0) return <p className="text-sm text-slate-500">{t('devices.empty')}</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-slate-500 dark:text-slate-400">{t('devices.listHint')}</p>
      <div
        aria-hidden
        className={`${COLUMNS} border-b border-slate-200 px-2 pb-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400`}
      >
        <span>{t('devices.columns.id')}</span>
        <span>{t('devices.columns.name')}</span>
        <span>{t('devices.columns.type')}</span>
        <span>{t('devices.columns.floor')}</span>
      </div>
      <ul aria-label={t('devices.list')} className="flex flex-col gap-0.5">
        {devices.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              data-testid="device-row"
              aria-pressed={d.id === selectedId}
              onClick={() => onSelect(d)}
              className={rowClass(d.id === selectedId)}
            >
              <span className="truncate font-mono text-xs">{d.id}</span>
              <span className="truncate">{d.name}</span>
              <span>{t(`devices.types.${d.type}`)}</span>
              <span>{floorName.get(d.floorId) ?? '-'}</span>
              <PencilIcon className="size-3.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
