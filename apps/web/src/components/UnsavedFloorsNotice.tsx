import type { Floor } from '@dt/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { floorsChanged, useFloorDraftStore } from '../state/floorDraftStore';
import { textLinkClass } from './ui';

/** Device placement only knows saved floors; say so while the site's floor edits are pending. */
export function UnsavedFloorsNotice({ siteId, floors }: { siteId: string; floors: Floor[] }) {
  const { t } = useTranslation();
  const draft = useFloorDraftStore((s) => s.drafts[siteId]);
  if (!draft || !floorsChanged(draft, floors)) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      {t('devices.unsavedFloors')}{' '}
      <Link to={`/settings/sites/${siteId}`} className={textLinkClass}>
        {t('devices.goToFloors')}
      </Link>
    </p>
  );
}
