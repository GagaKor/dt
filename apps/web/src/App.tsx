import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSites } from './api/queries';
import { AppShell } from './components/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage, DeviceEditorPage, MonitorPage } from './pages/Placeholders';
import { KeysPage } from './pages/settings/KeysPage';
import { SitesPage } from './pages/settings/SitesPage';

const SiteDetailPage = lazy(() =>
  import('./pages/settings/SiteDetailPage').then((m) => ({ default: m.SiteDetailPage })),
);

function ShellLayout() {
  const { siteId } = useParams();
  return (
    <RequireAuth>
      <AppShell siteId={siteId} badgeCount={0}>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}

function HomeRedirect() {
  const { t } = useTranslation();
  const sites = useSites();
  if (sites.isPending) return <p className="p-6 text-slate-500">{t('app.loading')}</p>;
  const first = sites.data?.[0];
  return <Navigate to={first ? `/sites/${first.id}/monitor` : '/settings/sites'} replace />;
}

function LoadingFallback() {
  const { t } = useTranslation();
  return <p className="p-6 text-slate-500">{t('app.loading')}</p>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ShellLayout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="/sites/:siteId/monitor" element={<MonitorPage />} />
        <Route path="/sites/:siteId/dashboard" element={<DashboardPage />} />
        <Route path="/settings/sites" element={<SitesPage />} />
        <Route
          path="/settings/sites/:siteId"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <SiteDetailPage />
            </Suspense>
          }
        />
        <Route path="/settings/sites/:siteId/devices" element={<DeviceEditorPage />} />
        <Route path="/settings/keys" element={<KeysPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
