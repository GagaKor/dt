import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSites } from './api/queries';
import { AppShell } from './components/AppShell';
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
        <Route path="/settings/sites" element={<SitesPage />} />
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
        <Route path="/settings/keys" element={<KeysPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
