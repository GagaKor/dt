import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { tabClass } from './ui';

const linkClass = ({ isActive }: { isActive: boolean }) => tabClass(isActive);

/** Tabs between the settings pages that are not tied to one site. */
export function SettingsNav() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('nav.settingsSections')}
      className="mx-6 mt-2 flex gap-1 border-b border-slate-200 dark:border-slate-700"
    >
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
