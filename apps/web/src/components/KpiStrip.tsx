import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKpi } from '../api/queries';
import type { RealtimeStatus } from '../realtime/socket';
import {
  realtimeNow,
  useRealtimeStore,
  visibleObjectCount,
  type ClientObject,
} from '../realtime/store';

export interface KpiStripProps {
  siteId: string;
}

const NO_OBJECTS = new Map<string, ClientObject>();
// Fades need a clock even when no message arrives.
const TICK_MS = 1_000;

const STATUS_DOT: Record<RealtimeStatus, string> = {
  open: 'bg-green-500',
  connecting: 'bg-amber-400',
  closed: 'bg-slate-400',
};

function Metric(p: { label: string; value: number | undefined; testId: string; alert?: boolean }) {
  return (
    <div className="flex min-w-36 flex-col rounded border border-slate-200 px-3 py-1 dark:border-slate-700">
      <span className="text-xs text-slate-500 dark:text-slate-400">{p.label}</span>
      <span
        data-testid={p.testId}
        className={`text-2xl font-semibold tabular-nums ${p.alert ? 'text-red-600 dark:text-red-400' : ''}`}
      >
        {p.value ?? '–'}
      </span>
    </div>
  );
}

export function KpiStrip({ siteId }: KpiStripProps) {
  const { t } = useTranslation();
  const kpi = useKpi(siteId);
  const unacked = useRealtimeStore((s) => s.sites.find((x) => x.siteId === siteId)?.unacked);
  const objects = useRealtimeStore((s) => (s.siteId === siteId ? s.objects : NO_OBJECTS));
  const status = useRealtimeStore((s) => s.status);
  const [now, setNow] = useState(realtimeNow);

  useEffect(() => {
    const timer = setInterval(() => setNow(realtimeNow()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const visible = useMemo(() => visibleObjectCount(objects, now), [objects, now]);
  const unackedValue = unacked ?? kpi.data?.unacked;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
      <Metric
        label={t('monitor.kpi.unacked')}
        value={unackedValue}
        testId="kpi-unacked"
        alert={!!unackedValue}
      />
      <Metric label={t('monitor.kpi.today')} value={kpi.data?.todayEvents} testId="kpi-today" />
      <Metric label={t('monitor.kpi.objects')} value={visible} testId="kpi-objects" />
      <span
        role="status"
        data-testid="realtime-status"
        data-state={status}
        className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        {t(`monitor.status.${status}`)}
      </span>
    </div>
  );
}
