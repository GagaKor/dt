import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../api/client';
import { useSites } from '../api/queries';
import { setLang, type Lang } from '../i18n';

export interface AppShellProps {
  siteId?: string;
  badgeCount: number;
  children: ReactNode;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1.5 text-sm font-medium ${
    isActive
      ? 'bg-slate-200 dark:bg-slate-700'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;

export function AppShell({ siteId, badgeCount, children }: AppShellProps) {
  const { t, i18n } = useTranslation();
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
        <span className="text-lg font-bold tracking-tight">dt</span>
        <select
          aria-label={t('nav.site')}
          className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
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
          <NavLink to="/settings/sites" className={tabClass}>
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
                className={`px-2 py-1 first:rounded-l last:rounded-r border border-slate-300 dark:border-slate-600 ${
                  lang === l ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : ''
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
