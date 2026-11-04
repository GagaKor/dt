import type { Device, Floor } from '@dt/shared';
import { useTranslation } from 'react-i18next';

export interface DeviceListProps {
  devices: Device[];
  floors: Floor[];
  selectedId: string | null;
  onSelect(d: Device): void;
}

const rowClass = (active: boolean) =>
  `grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-2 py-1 text-left text-sm ${
    active
      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
      : 'hover:bg-slate-100 dark:hover:bg-slate-700'
  }`;

export function DeviceList({ devices, floors, selectedId, onSelect }: DeviceListProps) {
  const { t } = useTranslation();
  const floorName = new Map(floors.map((f) => [f.id, f.name]));

  if (devices.length === 0) return <p className="text-sm text-slate-500">{t('devices.empty')}</p>;
  return (
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
            <span className="truncate font-mono">{d.id}</span>
            <span className="truncate">{d.name}</span>
            <span>{t(`devices.types.${d.type}`)}</span>
            <span>{floorName.get(d.floorId) ?? '-'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
