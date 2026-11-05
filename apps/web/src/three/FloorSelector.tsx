import type { Floor } from '@dt/shared';
import { useTranslation } from 'react-i18next';
import type { FloorAlarmSummary } from '../components/floorAlarms';
import { SEVERITY_BADGE } from '../components/severityStyles';
import { toggleClass } from '../components/ui';
import { useViewStore } from '../state/viewStore';

export interface FloorSelectorProps {
  floors: Floor[];
  className?: string;
  /** Unacknowledged alarms per floor ID; floors with alarms get a count badge. */
  alarms?: ReadonlyMap<string, FloorAlarmSummary>;
}

const optionClass = (active: boolean) => `${toggleClass(active)} w-full`;

export function FloorSelector({ floors, className = '', alarms }: FloorSelectorProps) {
  const { t } = useTranslation();
  const selectedId = useViewStore((s) => s.selectedFloorId);
  const setSelectedFloor = useViewStore((s) => s.setSelectedFloor);
  const showOthers = useViewStore((s) => s.showOtherFloors);
  const setShowOthers = useViewStore((s) => s.setShowOtherFloors);
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
      className={`flex min-w-24 flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1.5 shadow-md dark:border-slate-600 dark:bg-slate-800/95 ${className}`}
    >
      <span aria-hidden className="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        {t('viewer.floors')}
      </span>
      {options.map((o) => {
        const summary = o.id === null ? undefined : alarms?.get(o.id);
        return (
          <button
            key={o.id ?? ''}
            type="button"
            data-testid="floor-option"
            aria-pressed={current === o.id}
            aria-label={
              summary
                ? `${o.label} ${t('viewer.floorAlarms', { count: summary.count })}`
                : undefined
            }
            onClick={() => setSelectedFloor(o.id)}
            className={`${optionClass(current === o.id)} ${summary ? 'justify-between' : ''}`}
          >
            {o.label}
            {summary && (
              <span
                aria-hidden
                data-testid="floor-alarm-count"
                className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${SEVERITY_BADGE[summary.severity]}`}
              >
                {summary.count}
              </span>
            )}
          </button>
        );
      })}
      {current !== null && (
        <label className="mt-0.5 flex items-center gap-1.5 rounded-md border-t border-slate-200 px-1 pt-1.5 text-xs dark:border-slate-600">
          <input
            type="checkbox"
            data-testid="floor-show-others"
            checked={showOthers}
            onChange={(e) => setShowOthers(e.target.checked)}
          />
          {t('viewer.showOtherFloors')}
        </label>
      )}
    </div>
  );
}
