import type { Alarm, Device, Floor } from '@dt/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlarmsAck, useDevices, useFloors } from '../api/queries';
import { useRealtimeStore } from '../realtime/store';
import { useViewStore } from '../state/viewStore';
import { alarmPoint } from '../three/alarmPoint';
import { focusView } from '../three/viewPresets';
import { SEVERITY_BAR } from './severityStyles';

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
          className="flex flex-col gap-0.5 rounded text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
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
          <span className="truncate text-xs text-slate-600 dark:text-slate-300">
            {t(`severity.${alarm.severity}`)} · {alarm.deviceName ?? alarm.deviceId} ·{' '}
            {floorName ?? t('monitor.alarms.noFloor')}
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
              className="min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-2 py-0.5 text-sm dark:border-slate-600"
            />
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="text-xs text-slate-500 hover:underline dark:text-slate-400"
            >
              {t('monitor.alarms.addNote')}
            </button>
          )}
          <button
            type="button"
            data-testid="alarm-ack"
            disabled={ack.isPending}
            onClick={submit}
            className="ml-auto shrink-0 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
          >
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
        {total !== undefined && total > alarms.length && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('monitor.alarms.partial', { shown: alarms.length, total })}
          </span>
        )}
      </header>
      {alarms.length === 0 ? (
        <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
          {t('monitor.alarms.empty')}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {alarms.map((a) => (
            <AlarmItem
              key={a.id}
              alarm={a}
              floorName={
                floorById.get(a.floorId ?? deviceById.get(a.deviceId)?.floorId ?? '')?.name
              }
              time={formatTime(a.lastOccurredAt)}
              onFocus={focus}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
