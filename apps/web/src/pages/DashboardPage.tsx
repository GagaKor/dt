import { SEVERITIES, type StatsResponse } from '@dt/shared';
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError } from '../api/client';
import { useStats } from '../api/queries';
import { SEVERITY_COLOR } from '../components/severityStyles';
import { useRealtimeStore } from '../realtime/store';
import { customRange, rangeForPreset, type Preset, type StatsRange } from './dashboard/range';
import { buttonClass, inputClass, toggleClass } from '../components/ui';

export const REFETCH_MIN_INTERVAL_MS = 5_000;
const PRESETS: Preset[] = ['today', '7d', '30d'];
const BAR_COLOR = '#6366f1';
const TOP_DEVICES = 10;

type Mode = Preset | 'custom';

const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** `YYYY-MM-DDTHH:mm` of a Date in the browser's local time, the format of datetime-local. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Card(p: { title: string; children: ReactNode; className?: string }) {
  return (
    <section
      aria-label={p.title}
      className={`rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 ${p.className ?? ''}`}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{p.title}</h2>
      {p.children}
    </section>
  );
}

function Chart(p: { children: ReactElement<object>; height?: number }) {
  return (
    <div className="text-slate-600 dark:text-slate-300" style={{ height: p.height ?? 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        {p.children}
      </ResponsiveContainer>
    </div>
  );
}

const tick = { fill: 'currentColor', fontSize: 12 };
const grid = <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />;

function bucketLabel(bucketStart: string, bucket: 'hour' | 'day'): string {
  return bucket === 'day'
    ? bucketStart.slice(5, 10)
    : `${bucketStart.slice(5, 10)} ${bucketStart.slice(11, 16)}`;
}

function Charts({ stats, range }: { stats: StatsResponse; range: StatsRange }) {
  const { t } = useTranslation();
  const total = stats.timeseries.reduce((sum, b) => sum + b.count, 0);
  const maxType = Math.max(1, ...stats.byType.map((r) => r.count));

  const series = stats.timeseries.map((b) => ({
    label: bucketLabel(b.bucketStart, range.bucket),
    count: b.count,
  }));
  const severity = SEVERITIES.map((s) => ({
    key: s,
    label: t(`severity.${s}`),
    count: stats.bySeverity.find((r) => r.severity === s)?.count ?? 0,
  }));
  const devices = stats.byDevice.slice(0, TOP_DEVICES).map((d) => ({
    label: d.deviceName ?? t('dashboard.deviceDeleted', { id: d.deviceId }),
    count: d.count,
  }));
  const floors = stats.byFloor.map((f) => ({
    label: f.floorName ?? t('dashboard.unknownFloor'),
    count: f.count,
  }));
  const countName = t('dashboard.count');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title={t('dashboard.timeseries')} className="lg:col-span-2">
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          {t('dashboard.total')}:{' '}
          <span
            data-testid="stats-timeseries-total"
            className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100"
          >
            {total}
          </span>
        </p>
        <Chart>
          <BarChart data={series}>
            {grid}
            <XAxis dataKey="label" tick={tick} stroke="currentColor" />
            <YAxis allowDecimals={false} tick={tick} stroke="currentColor" width={36} />
            <Tooltip />
            <Bar dataKey="count" name={countName} fill={BAR_COLOR} isAnimationActive={false} />
          </BarChart>
        </Chart>
      </Card>

      <Card title={t('dashboard.byType')}>
        {stats.byType.length === 0 ? (
          <p className="text-sm text-slate-500">{t('dashboard.empty')}</p>
        ) : (
          <ul data-testid="stats-bytype" className="flex flex-col gap-2">
            {stats.byType.map((r) => (
              <li
                key={r.eventType}
                className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-sm"
              >
                <span className="truncate" title={r.eventType}>
                  {r.eventType}
                </span>
                <span aria-hidden className="h-3 rounded-sm bg-slate-100 dark:bg-slate-700">
                  <span
                    className="block h-full rounded-sm"
                    style={{ width: `${(r.count / maxType) * 100}%`, background: BAR_COLOR }}
                  />
                </span>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('dashboard.bySeverity')}>
        <Chart>
          <BarChart data={severity}>
            {grid}
            <XAxis dataKey="label" tick={tick} stroke="currentColor" />
            <YAxis allowDecimals={false} tick={tick} stroke="currentColor" width={36} />
            <Tooltip />
            <Bar dataKey="count" name={countName} isAnimationActive={false}>
              {severity.map((s) => (
                <Cell key={s.key} fill={SEVERITY_COLOR[s.key]} />
              ))}
            </Bar>
          </BarChart>
        </Chart>
      </Card>

      <Card title={t('dashboard.byDevice')}>
        <Chart height={Math.max(120, devices.length * 28 + 30)}>
          <BarChart data={devices} layout="vertical">
            {grid}
            <XAxis type="number" allowDecimals={false} tick={tick} stroke="currentColor" />
            <YAxis dataKey="label" type="category" width={120} tick={tick} stroke="currentColor" />
            <Tooltip />
            <Bar dataKey="count" name={countName} fill={BAR_COLOR} isAnimationActive={false} />
          </BarChart>
        </Chart>
      </Card>

      <Card title={t('dashboard.byFloor')}>
        <Chart>
          <BarChart data={floors}>
            {grid}
            <XAxis dataKey="label" tick={tick} stroke="currentColor" />
            <YAxis allowDecimals={false} tick={tick} stroke="currentColor" width={36} />
            <Tooltip />
            <Bar dataKey="count" name={countName} fill={BAR_COLOR} isAnimationActive={false} />
          </BarChart>
        </Chart>
      </Card>

      <Card title={t('dashboard.unacked')}>
        <p
          data-testid="stats-unacked"
          className={`text-4xl font-semibold tabular-nums ${stats.unacked ? 'text-red-600 dark:text-red-400' : ''}`}
        >
          {stats.unacked}
        </p>
      </Card>
    </div>
  );
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { siteId } = useParams();
  const tz = useMemo(browserTz, []);
  const [mode, setMode] = useState<Mode>('today');
  const [range, setRange] = useState<StatsRange>(() => rangeForPreset('today', new Date(), tz));
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const custom = customRange(fromInput, toInput, tz);

  const stats = useStats({ siteId, ...range, tz });
  const refetchRef = useRef(stats.refetch);
  refetchRef.current = stats.refetch;
  const lastFetchRef = useRef(0);
  useEffect(() => {
    lastFetchRef.current = Date.now();
  }, [stats.dataUpdatedAt, stats.errorUpdatedAt]);

  // A new alarm changes the stats; throttle so an alarm burst costs one request per window.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const seen = new Set(useRealtimeStore.getState().alarms.keys());
    const fire = () => {
      timer = null;
      void refetchRef.current();
    };
    const unsubscribe = useRealtimeStore.subscribe((s) => {
      if (s.siteId !== siteId) return;
      let created = false;
      for (const id of s.alarms.keys()) {
        if (!seen.has(id)) {
          seen.add(id);
          created = true;
        }
      }
      if (!created || timer) return;
      const wait = Math.max(0, lastFetchRef.current + REFETCH_MIN_INTERVAL_MS - Date.now());
      timer = setTimeout(fire, wait);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [siteId]);

  const pickPreset = (p: Preset) => {
    setMode(p);
    setRange(rangeForPreset(p, new Date(), tz));
  };
  const openCustom = () => {
    if (!fromInput || !toInput) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setFromInput(toLocalInput(start));
      setToInput(toLocalInput(now));
    }
    setMode('custom');
  };
  const refresh = () => {
    // A preset's boundaries move with the clock (midnight rollover).
    if (mode !== 'custom') {
      const next = rangeForPreset(mode, new Date(), tz);
      if (next.from !== range.from || next.to !== range.to) {
        setRange(next);
        return;
      }
    }
    void stats.refetch();
  };

  const code = stats.error instanceof ApiError ? stats.error.code : null;
  const errorText = stats.error
    ? code && i18n.exists(`dashboard.error.${code}`)
      ? t(`dashboard.error.${code}`)
      : t('dashboard.loadError')
    : null;

  const btn = (active: boolean) => toggleClass(active);
  const input = inputClass();

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">{t('dashboard.title')}</h1>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={mode === p}
            onClick={() => pickPreset(p)}
            className={btn(mode === p)}
          >
            {t(`dashboard.presets.${p}`)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={mode === 'custom'}
          onClick={openCustom}
          className={btn(mode === 'custom')}
        >
          {t('dashboard.presets.custom')}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={stats.isFetching}
          className={`${buttonClass('secondary')} ml-auto`}
        >
          {t('dashboard.refresh')}
        </button>
      </header>

      {mode === 'custom' && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom) setRange(custom);
          }}
        >
          <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
            {t('dashboard.from')}
            <input
              type="datetime-local"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500 dark:text-slate-400">
            {t('dashboard.to')}
            <input
              type="datetime-local"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className={input}
            />
          </label>
          <button type="submit" disabled={!custom} className={buttonClass('primary', 'md')}>
            {t('dashboard.apply')}
          </button>
        </form>
      )}

      {errorText && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorText}
        </p>
      )}
      {stats.data ? (
        <Charts stats={stats.data} range={range} />
      ) : (
        !stats.error && <p className="text-slate-500">{t('app.loading')}</p>
      )}
    </div>
  );
}
