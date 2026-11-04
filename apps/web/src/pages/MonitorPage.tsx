import type { Alarm } from '@dt/shared';
import { Stats } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { useDevices, useFloors, useSites } from '../api/queries';
import { AlarmPanel } from '../components/AlarmPanel';
import { KpiStrip } from '../components/KpiStrip';
import { useRealtimeStore } from '../realtime/store';
import { useViewStore } from '../state/viewStore';
import { AlarmRings } from '../three/AlarmRings';
import { CoordinateReadout } from '../three/CoordinateReadout';
import { DeviceMarkers } from '../three/DeviceMarkers';
import { FloorSelector } from '../three/FloorSelector';
import { createFloorYResolver } from '../three/floorSurface';
import { ModelLayers } from '../three/ModelLayers';
import { ObjectMarkers } from '../three/ObjectMarkers';
import { SiteCanvas } from '../three/SiteCanvas';
import { useSiteModel } from '../three/useSiteModel';

const NO_ALARMS = new Map<string, Alarm>();

export function MonitorPage() {
  const { t } = useTranslation();
  const { siteId = '' } = useParams();
  const [search] = useSearchParams();
  const showFps = search.get('fps') === '1';
  const sites = useSites();
  const site = sites.data?.find((s) => s.id === siteId);
  const floors = useFloors(site?.id);
  const devices = useDevices(site?.id);
  const model = useSiteModel(siteId, site?.modelVersion ?? null);
  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const rejected = useRealtimeStore((s) => s.rejectedSiteId === siteId);
  const alarmMap = useRealtimeStore((s) => (s.siteId === siteId ? s.alarms : NO_ALARMS));

  const floorList = useMemo(() => floors.data ?? [], [floors.data]);
  const deviceList = useMemo(() => devices.data ?? [], [devices.data]);
  const alarms = useMemo(() => [...alarmMap.values()], [alarmMap]);
  // The resolver caches per scene, so it is rebuilt whenever the scene or the floors change.
  const resolveFloorY = useMemo(
    () => createFloorYResolver(model.scene, floorList),
    [model.scene, floorList],
  );

  // Floor IDs belong to one site.
  useEffect(() => () => useViewStore.getState().setSelectedFloor(null), [siteId]);

  if (rejected || (sites.isSuccess && !site)) {
    return <p className="p-6 text-slate-500">{t('monitor.notFound')}</p>;
  }
  if (!site) return <p className="p-6 text-slate-500">{t('app.loading')}</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <KpiStrip siteId={siteId} />
      <div className="flex min-h-0 flex-1">
        <section
          aria-label={t('monitor.view3d')}
          className="relative min-w-0 flex-1 overflow-hidden"
        >
          {site.modelVersion === null ? (
            <p className="p-6 text-sm text-slate-500">{t('monitor.noModel')}</p>
          ) : (
            <>
              <SiteCanvas bounds={model.bounds}>
                <ModelLayers
                  scene={model.scene}
                  floors={floorList}
                  selectedFloorId={selectedFloorId}
                />
                <DeviceMarkers devices={deviceList} selectedId={null} />
                <AlarmRings alarms={alarms} devices={deviceList} resolveFloorY={resolveFloorY} />
                <ObjectMarkers siteId={siteId} resolveFloorY={resolveFloorY} />
                <CoordinateReadout model={model.scene} floors={floorList} />
                {showFps && <Stats />}
              </SiteCanvas>
              <FloorSelector floors={floorList} className="absolute right-2 top-2" />
              {model.error && (
                <p
                  role="alert"
                  className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-red-600 px-3 py-1 text-sm text-white"
                >
                  {t('monitor.modelError')}
                </p>
              )}
            </>
          )}
        </section>
        <aside className="flex w-[34%] min-w-64 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <AlarmPanel siteId={siteId} />
        </aside>
      </div>
    </div>
  );
}
