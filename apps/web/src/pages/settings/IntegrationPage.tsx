import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DownloadIcon, ExternalLinkIcon } from '../../components/icons';
import { buttonClass, textLinkClass } from '../../components/ui';
import integrationGuide from '../../../../../docs/integration.md?raw';
import modelSpec from '../../../../../docs/model-spec.md?raw';

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cardClass =
  'flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-700 dark:bg-slate-800';
const actionClass = `${buttonClass('secondary')} mt-auto self-start`;

function Card(p: { title: string; description: string; children: ReactNode }) {
  return (
    <section className={cardClass}>
      <h2 className="font-medium">{p.title}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{p.description}</p>
      {p.children}
    </section>
  );
}

/** Where integrators find the API reference and the guides, all served by this server. */
export function IntegrationPage() {
  const { t } = useTranslation();
  const origin = window.location.origin;

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{t('pages.docs')}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('docs.intro')}{' '}
        <Link to="/settings/keys" className={textLinkClass}>
          {t('docs.keysLink')}
        </Link>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">{t('docs.endpoints')}</h2>
        <ul className="flex flex-col gap-1 font-mono text-sm">
          <li>{`POST ${origin}/api/ingest/events`}</li>
          <li>{`POST ${origin}/api/ingest/positions`}</li>
        </ul>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('docs.header')}</p>
        <code className="self-start rounded bg-slate-100 px-2 py-1 text-sm dark:bg-slate-900">
          {`Authorization: Bearer ${t('docs.keyPlaceholder')}`}
        </code>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card title={t('docs.swaggerTitle')} description={t('docs.swaggerDesc')}>
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClass('primary')} mt-auto self-start`}
          >
            {t('docs.swaggerOpen')}
            <ExternalLinkIcon />
          </a>
        </Card>
        <Card title={t('docs.openapiTitle')} description={t('docs.openapiDesc')}>
          <a href="/api/openapi.json" download="cutaway-openapi.json" className={actionClass}>
            <DownloadIcon />
            {t('docs.openapiDownload')}
          </a>
        </Card>
        <Card title={t('docs.guideTitle')} description={t('docs.guideDesc')}>
          <button
            type="button"
            className={actionClass}
            onClick={() => downloadText('cutaway-integration-guide.md', integrationGuide)}
          >
            <DownloadIcon />
            {t('docs.guideDownload')}
          </button>
        </Card>
        <Card title={t('docs.modelTitle')} description={t('docs.modelDesc')}>
          <button
            type="button"
            className={actionClass}
            onClick={() => downloadText('cutaway-model-spec.md', modelSpec)}
          >
            <DownloadIcon />
            {t('docs.modelDownload')}
          </button>
        </Card>
      </div>
    </div>
  );
}
