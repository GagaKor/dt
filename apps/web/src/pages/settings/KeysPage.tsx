import { SEVERITIES, type CreatedIntegrationKey, type Severity } from '@dt/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { useTranslation } from 'react-i18next';
import { useIntegrationKeys, usePatchKey, useRevokeKey } from '../../api/queries';

export function KeysPage() {
  const { t } = useTranslation();
  const keys = useIntegrationKeys();
  const qc = useQueryClient();
  const [createFailed, setCreateFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const patch = usePatchKey();
  const revoke = useRevokeKey();
  const [name, setName] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Not a react-query mutation: its data would keep the plaintext in the mutation cache.
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setCreateFailed(false);
    opener.current = document.activeElement;
    try {
      const k = await apiFetch<CreatedIntegrationKey>('/api/integration-keys', {
        method: 'POST',
        json: { name: n },
      });
      setName('');
      setCopied(false);
      setPlaintext(k.key);
      await qc.invalidateQueries({ queryKey: ['integration-keys'] });
    } catch {
      setCreateFailed(true);
    }
  };

  const closePlaintext = () => {
    setPlaintext(null);
    if (opener.current instanceof HTMLElement) opener.current.focus();
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (plaintext === null || !d) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    d.focus();
  }, [plaintext !== null]);

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
      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
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
      {createFailed && (
        <p role="alert" className="text-sm text-red-600">
          {t('common.error')}
        </p>
      )}

      {plaintext !== null && (
        <dialog
          ref={dialogRef}
          tabIndex={-1}
          aria-label={t('keys.plaintextTitle')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closePlaintext();
            }
          }}
          onClose={closePlaintext}
          className="m-auto rounded border border-amber-400 bg-amber-50 p-4 dark:bg-slate-800"
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
              onClick={closePlaintext}
              className="rounded border px-3 py-1 text-sm"
            >
              {t('common.close')}
            </button>
          </div>
        </dialog>
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
