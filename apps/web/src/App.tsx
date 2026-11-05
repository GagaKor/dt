import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSites } from './api/queries';
import { AppShell } from './components/AppShell';
import { SettingsNav } from './components/SettingsNav';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './pages/LoginPage';
import { KeysPage } from './pages/settings/KeysPage';
import { SitesPage } from './pages/settings/SitesPage';
import { RealtimeProvider } from './realtime/RealtimeProvider';

const MonitorPage = lazy(() =>
  import('./pages/MonitorPage').then((m) => ({ default: m.MonitorPage })),
);

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);

const SiteDetailPage = lazy(() =>
  import('./pages/settings/SiteDetailPage').then((m) => ({ default: m.SiteDetailPage })),
);
const DeviceEditorPage = lazy(() =>
  import('./pages/settings/DeviceEditorPage').then((m) => ({ default: m.DeviceEditorPage })),
);
// Bundles the integration guides, so it loads only when opened.
const IntegrationPage = lazy(() =>
  import('./pages/settings/IntegrationPage').then((m) => ({ default: m.IntegrationPage })),
);

/** Settings pages that are not tied to one site share a tab bar. */
function SettingsLayout() {
  return (
    <>
      <SettingsNav />
      <Outlet />
    </>
  );
}

function ShellLayout() {
  const { siteId } = useParams();
  return (
    <RequireAuth>
      <RealtimeProvider siteId={siteId}>
        <AppShell siteId={siteId}>
          <Outlet />
        </AppShell>
      </RealtimeProvider>
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
        <Route
          path="/sites/:siteId/monitor"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <MonitorPage />
            </Suspense>
          }
        />
        <Route
          path="/sites/:siteId/dashboard"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route element={<SettingsLayout />}>
          <Route path="/settings/sites" element={<SitesPage />} />
          <Route path="/settings/keys" element={<KeysPage />} />
          <Route
            path="/settings/integration"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <IntegrationPage />
              </Suspense>
            }
          />
        </Route>
        <Route
          path="/settings/sites/:siteId"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <SiteDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/settings/sites/:siteId/devices"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <DeviceEditorPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
