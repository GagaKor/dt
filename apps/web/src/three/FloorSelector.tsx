import type { Floor } from '@dt/shared';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '../state/viewStore';

export interface FloorSelectorProps {
  floors: Floor[];
  className?: string;
}

const optionClass = (active: boolean) =>
  `w-full rounded px-3 py-1 text-left text-sm font-medium ${
    active
      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
      : 'hover:bg-slate-200 dark:hover:bg-slate-700'
  }`;

export function FloorSelector({ floors, className = '' }: FloorSelectorProps) {
  const { t } = useTranslation();
  const selectedId = useViewStore((s) => s.selectedFloorId);
  const setSelectedFloor = useViewStore((s) => s.setSelectedFloor);
  const current = floors.some((f) => f.id === selectedId) ? selectedId : null;
  const topDown = [...floors].sort((a, b) => b.elevationMin - a.elevationMin);
  const options = [
    { id: null, label: t('viewer.allFloors') },
    ...topDown.map((f) => ({ id: f.id, label: f.name })),
  ];

  return (
    <div
      role="group"
      aria-label={t('viewer.floors')}
      className={`flex flex-col gap-0.5 rounded border border-slate-300 bg-white/90 p-1 shadow-sm dark:border-slate-600 dark:bg-slate-800/90 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.id ?? ''}
          type="button"
          data-testid="floor-option"
          aria-pressed={current === o.id}
          onClick={() => setSelectedFloor(o.id)}
          className={optionClass(current === o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
