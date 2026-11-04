import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCreateSite, useDeleteSite, useRenameSite, useSites } from '../../api/queries';

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
          className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
        />
        <button
          type="submit"
          data-testid="site-create-submit"
          className="rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900"
        >
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
            className="flex items-center gap-3 rounded border border-slate-200 p-2 dark:border-slate-700"
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
                  className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
                />
                <button type="submit" className="rounded border px-2 py-1 text-sm">
                  {t('common.save')}
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-sm"
                  onClick={() => setEditing(null)}
                >
                  {t('common.cancel')}
                </button>
              </form>
            ) : (
              <Link
                to={`/settings/sites/${s.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {s.name}
              </Link>
            )}
            <span className="ml-auto flex items-center gap-2 text-sm">
              {editing?.id !== s.id && (
                <button type="button" onClick={() => setEditing({ id: s.id, name: s.name })}>
                  {t('sites.rename')}
                </button>
              )}
              {confirmId === s.id ? (
                <>
                  <span>{t('sites.deleteConfirm', { name: s.name })}</span>
                  <button
                    type="button"
                    className="rounded bg-red-600 px-2 py-1 text-white"
                    onClick={() => {
                      del.mutate(s.id);
                      setConfirmId(null);
                    }}
                  >
                    {t('sites.delete')}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() => setConfirmId(null)}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <button type="button" className="text-red-600" onClick={() => setConfirmId(s.id)}>
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
