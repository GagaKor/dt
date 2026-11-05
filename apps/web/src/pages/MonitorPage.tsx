import type { Alarm } from '@dt/shared';
import { Stats } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { useDevices, useFloors, useSites } from '../api/queries';
import { AlarmPanel } from '../components/AlarmPanel';
import { summarizeAlarmsByFloor } from '../components/floorAlarms';
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
import { useSiteModel, modelStateOf } from '../three/useSiteModel';

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
  const showOtherFloors = useViewStore((s) => s.showOtherFloors);
  const rejected = useRealtimeStore((s) => s.rejectedSiteId === siteId);
  const alarmMap = useRealtimeStore((s) => (s.siteId === siteId ? s.alarms : NO_ALARMS));

  const floorList = useMemo(() => floors.data ?? [], [floors.data]);
  const deviceList = useMemo(() => devices.data ?? [], [devices.data]);
  const alarms = useMemo(() => [...alarmMap.values()], [alarmMap]);
  const alarmsByFloor = useMemo(
    () => summarizeAlarmsByFloor(alarms, new Map(deviceList.map((d) => [d.id, d]))),
    [alarms, deviceList],
  );
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
    <div className="flex flex-col lg:h-full lg:min-h-0">
      <KpiStrip siteId={siteId} />
      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <section
          aria-label={t('monitor.view3d')}
          className="relative h-[60vh] min-h-80 min-w-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1"
        >
          {site.modelVersion === null ? (
            <p className="p-6 text-sm text-slate-500">{t('monitor.noModel')}</p>
          ) : (
            <>
              <SiteCanvas bounds={model.bounds} modelState={modelStateOf(model)}>
                <ModelLayers
                  scene={model.scene}
                  floors={floorList}
                  selectedFloorId={selectedFloorId}
                  showOtherFloors={showOtherFloors}
                />
                <DeviceMarkers
                  devices={deviceList}
                  selectedId={null}
                  floors={floorList}
                  model={model.scene}
                />
                <AlarmRings alarms={alarms} devices={deviceList} resolveFloorY={resolveFloorY} />
                <ObjectMarkers siteId={siteId} resolveFloorY={resolveFloorY} />
                <CoordinateReadout model={model.scene} floors={floorList} />
                {showFps && <Stats />}
              </SiteCanvas>
              <FloorSelector
                floors={floorList}
                alarms={alarmsByFloor}
                className="absolute right-2 top-2"
              />
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
        <aside className="flex flex-col border-t border-slate-200 bg-white lg:w-[34%] lg:min-w-64 lg:shrink-0 lg:border-l lg:border-t-0 dark:border-slate-700 dark:bg-slate-800">
          <AlarmPanel siteId={siteId} />
        </aside>
      </div>
    </div>
  );
}
