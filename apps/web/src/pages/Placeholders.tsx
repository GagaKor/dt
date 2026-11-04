import { useTranslation } from 'react-i18next';

function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
    </div>
  );
}

export const MonitorPage = () => <Placeholder titleKey="pages.monitor" />;
export const DashboardPage = () => <Placeholder titleKey="pages.dashboard" />;
export const DeviceEditorPage = () => <Placeholder titleKey="pages.devices" />;
