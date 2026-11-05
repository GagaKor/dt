import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client';
import { useSites } from '../api/queries';
import { setLang, type Lang } from '../i18n';
import { useRealtimeStore } from '../realtime/store';
import { Toasts } from './Toasts';
import { buttonClass, inputClass } from './ui';

export interface AppShellProps {
  siteId?: string;
  children: ReactNode;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
    isActive
      ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
  }`;

export function AppShell({ siteId, children }: AppShellProps) {
  const { t, i18n } = useTranslation();
  // Every site's unacknowledged alarms, not only the watched one.
  const badgeCount = useRealtimeStore((s) => s.sites.reduce((n, x) => n + x.unacked, 0));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sites = useSites();
  const current = siteId ?? sites.data?.[0]?.id;
  const lang: Lang = i18n.language === 'ko' ? 'ko' : 'en';

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      qc.clear();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-lg font-bold tracking-tight">{t('app.name')}</span>
        <select
          aria-label={t('nav.site')}
          className={`${inputClass('sm')} pr-8`}
          value={siteId ?? ''}
          onChange={(e) => e.target.value && navigate(`/sites/${e.target.value}/monitor`)}
        >
          <option value="">{t('nav.selectSite')}</option>
          {sites.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <nav className="flex items-center gap-1">
          <NavLink to={current ? `/sites/${current}/monitor` : '/'} className={tabClass}>
            {t('nav.monitor')}
          </NavLink>
          <span
            data-testid="nav-badge"
            title={t('nav.alarms')}
            className={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold ${
              badgeCount > 0
                ? 'bg-red-600 text-white'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
            }`}
          >
            {badgeCount}
          </span>
          <NavLink to={current ? `/sites/${current}/dashboard` : '/'} className={tabClass}>
            {t('nav.dashboard')}
          </NavLink>
          <NavLink
            to="/settings/sites"
            // Every settings page (sites, keys, integration docs) belongs to this tab.
            className={({ isActive }) =>
              tabClass({ isActive: isActive || pathname.startsWith('/settings') })
            }
          >
            {t('nav.settings')}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label={t('nav.language')} className="flex text-xs">
            {(['en', 'ko'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`h-8 border border-slate-300 px-2.5 font-medium transition-colors first:rounded-l-md last:rounded-r-md focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-500 ${
                  lang === l
                    ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={logout} className={buttonClass('secondary', 'sm')}>
            {t('nav.logout')}
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      <Toasts />
    </div>
  );
}
