import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCreateSite, useDeleteSite, useRenameSite, useSites } from '../../api/queries';
import { ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { buttonClass, inputClass } from '../../components/ui';

export function SitesPage() {
  const { t } = useTranslation();
  const sites = useSites();
  const create = useCreateSite();
  const rename = useRenameSite();
  const del = useDeleteSite();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    create.mutate(n, { onSuccess: () => setName('') });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{t('pages.sites')}</h1>
      <form onSubmit={submit} className="flex gap-2">
        <input
          data-testid="site-create-name"
          aria-label={t('sites.name')}
          placeholder={t('sites.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass()} w-64`}
        />
        <button
          type="submit"
          data-testid="site-create-submit"
          className={buttonClass('primary', 'md')}
        >
          <PlusIcon />
          {t('sites.create')}
        </button>
      </form>
      {(create.isError || rename.isError || del.isError) && (
        <p role="alert" className="text-sm text-red-600">
          {t('common.error')}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {sites.data?.map((s) => (
          <li
            key={s.id}
            data-testid="site-row"
            className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 shadow-xs dark:border-slate-700 dark:bg-slate-800"
          >
            {editing?.id === s.id ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = editing.name.trim();
                  if (n)
                    rename.mutate({ id: s.id, name: n }, { onSuccess: () => setEditing(null) });
                }}
              >
                <input
                  aria-label={t('sites.name')}
                  value={editing.name}
                  onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                  className={inputClass('sm')}
                />
                <button type="submit" className={buttonClass('primary')}>
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => setEditing(null)}
                >
                  {t('common.cancel')}
                </button>
              </form>
            ) : (
              <Link
                to={`/settings/sites/${s.id}`}
                className="group flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-md px-2 font-medium transition-colors hover:bg-slate-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-700/60 dark:hover:text-blue-300"
              >
                <span className="truncate">{s.name}</span>
                <ChevronRightIcon className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-current" />
              </Link>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-2 text-sm">
              {editing?.id !== s.id && (
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => setEditing({ id: s.id, name: s.name })}
                >
                  <PencilIcon />
                  {t('sites.rename')}
                </button>
              )}
              {confirmId === s.id ? (
                <>
                  <span>{t('sites.deleteConfirm', { name: s.name })}</span>
                  <button
                    type="button"
                    className={buttonClass('dangerSolid')}
                    onClick={() => {
                      del.mutate(s.id);
                      setConfirmId(null);
                    }}
                  >
                    {t('sites.delete')}
                  </button>
                  <button
                    type="button"
                    className={buttonClass('secondary')}
                    onClick={() => setConfirmId(null)}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={buttonClass('danger')}
                  onClick={() => setConfirmId(s.id)}
                >
                  <TrashIcon />
                  {t('sites.delete')}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
