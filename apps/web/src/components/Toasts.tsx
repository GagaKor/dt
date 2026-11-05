import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useRealtimeStore, type Toast } from '../realtime/store';
import { XIcon } from './icons';
import { SEVERITY_BAR } from './severityStyles';
import { iconButtonClass } from './ui';

export const TOAST_MS = 10_000;

function ToastCard({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dismiss = () => useRealtimeStore.getState().dismissToast(toast.id);

  useEffect(() => {
    const timer = setTimeout(() => useRealtimeStore.getState().dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id]);

  return (
    <div className="pointer-events-auto flex overflow-hidden rounded border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
      <span aria-hidden className={`w-1.5 shrink-0 ${SEVERITY_BAR[toast.severity]}`} />
      <button
        type="button"
        onClick={() => {
          dismiss();
          navigate(`/sites/${encodeURIComponent(toast.siteId)}/monitor`);
        }}
        className="flex min-w-0 flex-1 cursor-pointer flex-col px-3 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-slate-700"
      >
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          {t('toast.newAlarm', { severity: t(`severity.${toast.severity}`) })}
        </span>
        <span className="truncate font-medium">{toast.siteName}</span>
        <span className="truncate text-sm text-slate-600 dark:text-slate-300">
          {toast.eventType}
        </span>
      </button>
      <button
        type="button"
        aria-label={t('toast.dismiss')}
        onClick={dismiss}
        className={`${iconButtonClass('ghost', 'sm')} m-1 self-start`}
      >
        <XIcon />
      </button>
    </div>
  );
}

/** New critical/major alarms of sites other than the watched one. */
export function Toasts() {
  const toasts = useRealtimeStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
