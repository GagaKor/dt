import type { Alarm, Device, Floor } from '@dt/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlarmsAck, useDevices, useFloors } from '../api/queries';
import { useRealtimeStore } from '../realtime/store';
import { useViewStore } from '../state/viewStore';
import { alarmFloorId, alarmPoint } from '../three/alarmPoint';
import { focusView } from '../three/viewPresets';
import { CheckIcon, LocateIcon, NoteIcon } from './icons';
import { SEVERITY_BAR } from './severityStyles';
import { buttonClass, inputClass } from './ui';

export interface AlarmPanelProps {
  siteId: string;
}

const NO_ALARMS = new Map<string, Alarm>();
const ACK_NOTE_MAX = 500;

/** Newest first by the time the server received the alarm, like the server's lists. */
export function sortAlarms(alarms: Iterable<Alarm>): Alarm[] {
  return [...alarms].sort(
    (a, b) => Date.parse(b.lastReceivedAt) - Date.parse(a.lastReceivedAt) || (b.id > a.id ? 1 : -1),
  );
}

function useTimeFormat(lang: string): (iso: string) => string {
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(lang, { timeStyle: 'medium' });
    const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' });
    return (iso: string) => {
      const d = new Date(iso);
      return d.toDateString() === new Date().toDateString() ? time.format(d) : dateTime.format(d);
    };
  }, [lang]);
}

interface AlarmItemProps {
  alarm: Alarm;
  floorName: string | undefined;
  time: string;
  onFocus(alarm: Alarm): void;
}

function AlarmItem({ alarm, floorName, time, onFocus }: AlarmItemProps) {
  const { t } = useTranslation();
  const ack = useAlarmsAck();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const submit = () => ack.mutate({ id: alarm.id, note: note.trim() || undefined });

  return (
    <li data-testid="alarm-item" className="flex border-b border-slate-200 dark:border-slate-700">
      <span aria-hidden className={`w-1.5 shrink-0 ${SEVERITY_BAR[alarm.severity]}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={() => onFocus(alarm)}
          title={t('monitor.alarms.locate')}
          className="group -mx-1.5 flex cursor-pointer flex-col gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-700/60"
        >
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{alarm.eventType}</span>
            {alarm.count > 1 && (
              <span
                data-testid="alarm-count"
                className="shrink-0 rounded bg-slate-200 px-1.5 text-xs font-semibold tabular-nums dark:bg-slate-700"
              >
                ×{alarm.count}
              </span>
            )}
            <time
              dateTime={alarm.lastOccurredAt}
              className="ml-auto shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400"
            >
              {time}
            </time>
          </span>
          <span className="flex items-center gap-2">
            <span className="truncate text-xs text-slate-600 dark:text-slate-300">
              {t(`severity.${alarm.severity}`)} · {alarm.deviceName ?? alarm.deviceId} ·{' '}
              {floorName ?? t('monitor.alarms.noFloor')}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 opacity-70 group-hover:opacity-100 dark:text-blue-300">
              <LocateIcon className="size-3.5" />
              {t('monitor.alarms.locateShort')}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          {noteOpen ? (
            <input
              aria-label={t('monitor.alarms.note')}
              placeholder={t('monitor.alarms.note')}
              value={note}
              maxLength={ACK_NOTE_MAX}
              disabled={ack.isPending}
              autoFocus
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className={`${inputClass('xs')} min-w-0 flex-1`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className={buttonClass('secondary', 'xs')}
            >
              <NoteIcon className="size-3.5" />
              {t('monitor.alarms.addNote')}
            </button>
          )}
          <button
            type="button"
            data-testid="alarm-ack"
            disabled={ack.isPending}
            onClick={submit}
            className={`${buttonClass('primary', 'xs')} ml-auto`}
          >
            <CheckIcon className="size-3.5" />
            {t('monitor.alarms.ack')}
          </button>
        </div>
        {ack.isError && (
          <p role="alert" className="text-xs text-red-600">
            {t('monitor.alarms.ackError')}
          </p>
        )}
      </div>
    </li>
  );
}

/** Unacknowledged alarms of the watched site; clicking one moves the 3D view to it. */
export function AlarmPanel({ siteId }: AlarmPanelProps) {
  const { t, i18n } = useTranslation();
  const alarmMap = useRealtimeStore((s) => (s.siteId === siteId ? s.alarms : NO_ALARMS));
  const total = useRealtimeStore((s) => s.sites.find((x) => x.siteId === siteId)?.unacked);
  const floors = useFloors(siteId);
  const devices = useDevices(siteId);
  const formatTime = useTimeFormat(i18n.language);

  const alarms = useMemo(() => sortAlarms(alarmMap.values()), [alarmMap]);
  const floorById = useMemo(
    () => new Map<string, Floor>((floors.data ?? []).map((f) => [f.id, f])),
    [floors.data],
  );
  const deviceById = useMemo(
    () => new Map<string, Device>((devices.data ?? []).map((d) => [d.id, d])),
    [devices.data],
  );
  // The list follows the floor picked in the 3D view, so one floor's situation reads on its own.
  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const floor = selectedFloorId ? floorById.get(selectedFloorId) : undefined;
  const floorOf = (a: Alarm) => alarmFloorId(a, deviceById.get(a.deviceId));
  const shown = floor ? alarms.filter((a) => floorOf(a) === floor.id) : alarms;
  const elsewhere = alarms.length - shown.length;

  const focus = (alarm: Alarm) => {
    const view = useViewStore.getState();
    view.setSelectedFloor(alarm.floorId);
    // Outside the canvas the floor's base height is close enough for a camera target.
    const point = alarmPoint(
      alarm,
      deviceById.get(alarm.deviceId),
      (floorId) => floorById.get(floorId)?.elevationMin ?? null,
    );
    if (point) view.requestFlyTo(focusView(point));
  };

  return (
    <section aria-labelledby="alarm-panel-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <h2 id="alarm-panel-title" className="font-semibold">
          {t('monitor.alarms.title')}
        </h2>
        {floor && (
          <span className="rounded bg-slate-800 px-1.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            {floor.name}
          </span>
        )}
        {total !== undefined && total > alarms.length && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('monitor.alarms.partial', { shown: alarms.length, total })}
          </span>
        )}
        {floor && (
          <span className="ml-auto flex items-center gap-2 self-center">
            {elsewhere > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t('monitor.alarms.otherFloors', { count: elsewhere })}
              </span>
            )}
            <button
              type="button"
              onClick={() => useViewStore.getState().setSelectedFloor(null)}
              className={buttonClass('secondary', 'xs')}
            >
              {t('monitor.alarms.showAllFloors')}
            </button>
          </span>
        )}
      </header>
      {shown.length === 0 ? (
        <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
          {floor
            ? t('monitor.alarms.emptyOnFloor', { floor: floor.name })
            : t('monitor.alarms.empty')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((a) => (
            <AlarmItem
              key={a.id}
              alarm={a}
              floorName={floorById.get(floorOf(a) ?? '')?.name}
              time={formatTime(a.lastOccurredAt)}
              onFocus={focus}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
