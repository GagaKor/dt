import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-1 text-sm ${
    isActive
      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
      : 'hover:bg-slate-200 dark:hover:bg-slate-700'
  }`;

/** Tabs between the settings pages that are not tied to one site. */
export function SettingsNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.settingsSections')} className="flex gap-1 px-6 pt-4">
      <NavLink to="/settings/sites" end className={linkClass}>
        {t('pages.sites')}
      </NavLink>
      <NavLink to="/settings/keys" className={linkClass}>
        {t('pages.keys')}
      </NavLink>
      <NavLink to="/settings/integration" className={linkClass}>
        {t('pages.docs')}
      </NavLink>
    </nav>
  );
}
