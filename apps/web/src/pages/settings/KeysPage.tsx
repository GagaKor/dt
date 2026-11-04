import { SEVERITIES, type CreatedIntegrationKey, type Severity } from '@dt/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateKey, useIntegrationKeys, usePatchKey, useRevokeKey } from '../../api/queries';

export function KeysPage() {
  const { t } = useTranslation();
  const keys = useIntegrationKeys();
  const create = useCreateKey();
  const patch = usePatchKey();
  const revoke = useRevokeKey();
  const [name, setName] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { name: n },
      {
        onSuccess: (k: CreatedIntegrationKey) => {
          setName('');
          setCopied(false);
          setPlaintext(k.key);
        },
      },
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plaintext ?? '');
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{t('pages.keys')}</h1>
      <form onSubmit={submit} className="flex gap-2">
        <input
          data-testid="key-create-name"
          aria-label={t('keys.name')}
          placeholder={t('keys.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-800"
        />
        <button
          type="submit"
          data-testid="key-create-submit"
          className="rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900"
        >
          {t('keys.create')}
        </button>
      </form>
      {create.isError && (
        <p role="alert" className="text-sm text-red-600">
          {t('common.error')}
        </p>
      )}

      {plaintext !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('keys.plaintextTitle')}
          className="rounded border border-amber-400 bg-amber-50 p-4 dark:bg-slate-800"
        >
          <p className="mb-2 text-sm">{t('keys.plaintextHint')}</p>
          <code
            data-testid="key-plaintext"
            className="block break-all rounded bg-white p-2 dark:bg-slate-900"
          >
            {plaintext}
          </code>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded border px-3 py-1 text-sm"
            >
              {copied ? t('keys.copied') : t('keys.copy')}
            </button>
            <button
              type="button"
              onClick={() => setPlaintext(null)}
              className="rounded border px-3 py-1 text-sm"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {keys.data?.map((k) => {
          const revoked = k.revokedAt !== null;
          return (
            <li
              key={k.id}
              data-testid="key-row"
              className={`flex items-center gap-3 rounded border border-slate-200 p-2 dark:border-slate-700 ${
                revoked ? 'opacity-50' : ''
              }`}
            >
              <span className="font-medium">{k.name}</span>
              <code className="text-xs text-slate-500">{k.prefix}</code>
              <select
                aria-label={t('keys.defaultSeverity')}
                disabled={revoked}
                value={k.defaultSeverity}
                onChange={(e) =>
                  patch.mutate({ id: k.id, defaultSeverity: e.target.value as Severity })
                }
                className="ml-auto rounded border border-slate-300 bg-white px-1 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`severity.${s}`)}
                  </option>
                ))}
              </select>
              {revoked ? (
                <span className="text-xs uppercase">{t('keys.revoked')}</span>
              ) : confirmId === k.id ? (
                <span className="flex items-center gap-1 text-sm">
                  {t('keys.revokeConfirm')}
                  <button
                    type="button"
                    className="rounded bg-red-600 px-2 py-1 text-white"
                    onClick={() => {
                      revoke.mutate(k.id);
                      setConfirmId(null);
                    }}
                  >
                    {t('keys.revoke')}
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1"
                    onClick={() => setConfirmId(null)}
                  >
                    {t('common.cancel')}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-sm text-red-600"
                  onClick={() => setConfirmId(k.id)}
                >
                  {t('keys.revoke')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
