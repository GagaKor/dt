import type { Device, DeviceCreate, DeviceType, FloorRange } from '@dt/shared';
import { TransformControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Raycaster, type Box3, type Group, type Object3D } from 'three';
import {
  useCreateDevice,
  useDeleteDevice,
  useDevices,
  useFloors,
  usePatchDevice,
  useSites,
} from '../../api/queries';
import {
  DeviceForm,
  apiErrorToFormErrors,
  type DeviceFormErrors,
} from '../../components/DeviceForm';
import { DeviceList } from '../../components/DeviceList';
import { useViewStore } from '../../state/viewStore';
import { CoordinateReadout } from '../../three/CoordinateReadout';
import { DeviceMarkers } from '../../three/DeviceMarkers';
import { FloorSelector } from '../../three/FloorSelector';
import { ModelLayers } from '../../three/ModelLayers';
import { SiteCanvas } from '../../three/SiteCanvas';
import { useSiteModel, modelStateOf } from '../../three/useSiteModel';
import { focusView, obliqueView, topView, type ViewPose } from '../../three/viewPresets';
import {
  createBody,
  draftAfterGizmo,
  editingAfterSave,
  editingKey,
  isGizmoEcho,
  isPlacementClick,
  markersFor,
  nextEditingOnPlace,
  nextEditingOnSelect,
  patchBody,
  pickPlacement,
  type Editing,
  type Transition,
} from './deviceEditorLogic';

type Tool = 'select' | DeviceType;
type GizmoMode = 'translate' | 'rotate';

interface GizmoProps {
  target: Object3D;
  mode: GizmoMode;
  onRelease(): void;
}

type GizmoControls = ComponentRef<typeof TransformControls>;

// drei never disposes the controls it creates, so their document listeners and gizmo meshes
// would pile up with every edit. StrictMode replays effect cleanups on live components, so
// the dispose waits until it is clear the instance is really gone.
function useDisposeWhenDropped(controls: GizmoControls | null) {
  const live = useRef<GizmoControls | null>(null);
  useEffect(() => {
    if (!controls) return;
    live.current = controls;
    return () => {
      live.current = null;
      queueMicrotask(() => {
        if (live.current !== controls) controls.dispose();
      });
    };
  }, [controls]);
}

// drei's TransformControls disables the default CameraControls while a handle is dragged.
function Gizmo({ target, mode, onRelease }: GizmoProps) {
  const [controls, setControls] = useState<GizmoControls | null>(null);
  useDisposeWhenDropped(controls);
  return (
    <TransformControls
      ref={setControls}
      object={target}
      mode={mode}
      // Local rings map to pitch (X) and roughly yaw (Y); roll (Z) would be dropped anyway.
      space={mode === 'rotate' ? 'local' : 'world'}
      showZ={mode !== 'rotate'}
      size={0.8}
      onMouseUp={onRelease}
    />
  );
}

const toolClass = (active: boolean) =>
  `rounded border px-3 py-1 text-sm disabled:opacity-50 ${
    active
      ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
      : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700'
  }`;

export function DeviceEditorPage() {
  const { t } = useTranslation();
  const { siteId = '' } = useParams();
  const sites = useSites();
  const site = sites.data?.find((s) => s.id === siteId);
  const floors = useFloors(siteId);
  const devices = useDevices(siteId);
  const create = useCreateDevice(siteId);
  const patch = usePatchDevice(siteId);
  const del = useDeleteDevice(siteId);
  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const model = useSiteModel(siteId, site?.modelVersion ?? null);

  const floorList = useMemo(() => floors.data ?? [], [floors.data]);
  const deviceList = useMemo(() => devices.data ?? [], [devices.data]);
  const floor = floorList.find((f) => f.id === selectedFloorId) ?? null;

  const [tool, setTool] = useState<Tool>('select');
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('rotate');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<DeviceFormErrors>({});
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [target, setTarget] = useState<Group | null>(null);
  const [raycaster] = useState(() => new Raycaster());
  const [unsavedNotice, setUnsavedNotice] = useState(false);
  const gizmoReleasedAt = useRef(-Infinity);
  const latest = useRef(editing);

  useEffect(() => {
    latest.current = editing;
  });
  useEffect(() => () => useViewStore.getState().setSelectedFloor(null), []);

  const placing = tool !== 'select';
  const saving = create.isPending || patch.isPending;
  const markers = useMemo(() => markersFor(deviceList, editing), [deviceList, editing]);
  const msSinceGizmoRelease = () => performance.now() - gizmoReleasedAt.current;

  const startEditing = (next: Editing | null) => {
    setEditing(next);
    setErrors({});
    setSaved(false);
    setConfirmDelete(false);
    setUnsavedNotice(false);
  };
  const updateDraft = (draft: DeviceCreate) => {
    setEditing((e) => e && { ...e, draft });
    setErrors({});
    setSaved(false);
    setUnsavedNotice(false);
  };
  /** Applies a place/select transition; returns false when unsaved edits blocked it. */
  const apply = (r: Transition): r is Extract<Transition, { blocked: false }> => {
    if (r.blocked) {
      setUnsavedNotice(true);
      return false;
    }
    if (r.editing !== editing) startEditing(r.editing);
    return true;
  };

  const selectDevice = (d: Device, fly: boolean) => {
    const r = nextEditingOnSelect(editing, d);
    if (!apply(r)) return;
    setTool('select');
    useViewStore.getState().setSelectedFloor(d.floorId);
    if (fly) useViewStore.getState().requestFlyTo(focusView(r.editing.draft.position));
  };

  const onMarkerSelect = (id: string) => {
    if (isGizmoEcho(msSinceGizmoRelease())) return;
    const d = deviceList.find((x) => x.id === id);
    if (d) selectDevice(d, false);
  };

  const onPlaceClick = (e: ThreeEvent<MouseEvent>) => {
    // The handler runs once per mesh hit under the group; the first call decides.
    e.stopPropagation();
    if (tool === 'select' || !floor || !model.scene || saving) return;
    if (!isPlacementClick(e.delta, msSinceGizmoRelease())) return;
    raycaster.ray.copy(e.ray);
    raycaster.camera = e.camera;
    // The original scene, not the clipped clones: picking must not depend on how layers draw.
    const hits = raycaster.intersectObject(model.scene, true);
    const position = pickPlacement(hits, floor, raycaster.ray.direction);
    if (!position) return;
    apply(
      nextEditingOnPlace(editing, { siteId, floorId: floor.id, type: tool, position }, deviceList),
    );
  };

  const onGizmoRelease = () => {
    gizmoReleasedAt.current = performance.now();
    if (!editing || !target) return;
    const draft = draftAfterGizmo(editing.draft, target);
    if (draft !== editing.draft) updateDraft(draft);
  };

  const onSave = () => {
    if (!editing) return;
    const sent = editing.draft;
    setErrors({});
    // The draft is locked while saving; if it changed anyway, the user closed it or moved on.
    const stillOpen = () => latest.current?.draft === sent;
    const handlers = {
      onSuccess: (d: Device) => {
        if (!stillOpen()) return;
        setEditing((cur) => editingAfterSave(cur, sent, d));
        setSaved(true);
        setUnsavedNotice(false);
      },
      onError: (err: Error) => {
        if (stillOpen()) setErrors(apiErrorToFormErrors(err));
      },
    };
    if (editing.isNew) create.mutate(createBody(sent), handlers);
    else patch.mutate({ id: sent.id, patch: patchBody(sent) }, handlers);
  };

  const onDelete = () => {
    if (!editing || editing.isNew) return;
    del.mutate(editing.draft.id, {
      onSuccess: () => startEditing(null),
      onError: (err) => {
        setConfirmDelete(false);
        setErrors(apiErrorToFormErrors(err));
      },
    });
  };

  const fly = (pose: (b: Box3, f: FloorRange | null) => ViewPose) => {
    if (model.bounds) useViewStore.getState().requestFlyTo(pose(model.bounds, floor));
  };

  const hasModel = site?.modelVersion != null;
  const tools: { id: Tool; label: string; testId?: string }[] = [
    { id: 'select', label: t('devices.tool.select') },
    { id: 'camera', label: t('devices.tool.placeCamera'), testId: 'tool-place-camera' },
    { id: 'sensor', label: t('devices.tool.placeSensor') },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:flex-row">
      <div className="flex min-h-[28rem] min-w-0 flex-1 flex-col gap-2">
        <div
          role="toolbar"
          aria-label={t('devices.toolbar')}
          className="flex flex-wrap items-center gap-2"
        >
          {tools.map((x) => (
            <button
              key={x.id}
              type="button"
              data-testid={x.testId}
              aria-pressed={tool === x.id}
              disabled={!hasModel && x.id !== 'select'}
              onClick={() => setTool(x.id)}
              className={toolClass(tool === x.id)}
            >
              {x.label}
            </button>
          ))}
          <span aria-hidden className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-600" />
          <button
            type="button"
            data-testid="view-top"
            disabled={!model.bounds}
            onClick={() => fly(topView)}
            className={toolClass(false)}
          >
            {t('devices.view.top')}
          </button>
          <button
            type="button"
            disabled={!model.bounds}
            onClick={() => fly((b) => obliqueView(b))}
            className={toolClass(false)}
          >
            {t('devices.view.oblique')}
          </button>
          {editing && (
            <>
              <span aria-hidden className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-600" />
              {(['translate', 'rotate'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={gizmoMode === m}
                  onClick={() => setGizmoMode(m)}
                  className={toolClass(gizmoMode === m)}
                >
                  {t(`devices.transform.${m}`)}
                </button>
              ))}
            </>
          )}
        </div>

        <section className="relative min-h-0 flex-1 overflow-hidden rounded border border-slate-300 dark:border-slate-600">
          {!hasModel ? (
            <p className="p-4 text-sm text-slate-500">{t('devices.noModel')}</p>
          ) : (
            <>
              <SiteCanvas bounds={model.bounds} modelState={modelStateOf(model)}>
                <group onClick={placing ? onPlaceClick : undefined}>
                  <ModelLayers
                    scene={model.scene}
                    floors={floorList}
                    selectedFloorId={selectedFloorId}
                  />
                </group>
                <DeviceMarkers
                  devices={markers}
                  selectedId={editingKey(editing)}
                  onSelect={placing ? undefined : onMarkerSelect}
                  selectedRef={setTarget}
                />
                {editing && target && !saving && (
                  <Gizmo target={target} mode={gizmoMode} onRelease={onGizmoRelease} />
                )}
                <CoordinateReadout model={model.scene} floors={floorList} />
              </SiteCanvas>
              <FloorSelector floors={floorList} className="absolute right-2 top-2" />
              {placing && (
                <p
                  role="status"
                  className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-slate-900/80 px-3 py-1 text-sm text-white"
                >
                  {unsavedNotice
                    ? t('devices.unsavedHint')
                    : floor
                      ? t('devices.placeHint')
                      : t('devices.selectFloorHint')}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-96 lg:overflow-y-auto">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">
            {site ? `${site.name} · ${t('pages.devices')}` : t('pages.devices')}
          </h1>
          <Link
            to={`/settings/sites/${siteId}`}
            className="text-sm text-slate-600 underline-offset-2 hover:underline dark:text-slate-300"
          >
            {t('devices.backToSite')}
          </Link>
        </div>

        {editing && (
          <section className="flex flex-col gap-3 rounded border border-slate-200 p-3 dark:border-slate-700">
            <h2 className="font-medium">
              {editing.isNew ? t('devices.newDevice') : t('devices.editDevice')}
            </h2>
            {unsavedNotice && (
              <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
                {t('devices.unsavedHint')}
              </p>
            )}
            <DeviceForm
              value={editing.draft}
              onChange={updateDraft}
              onSave={onSave}
              errors={errors}
              isNew={editing.isNew}
              saving={saving}
            />
            {saved && (
              <p role="status" className="text-sm text-green-600">
                {t('devices.saved')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="rounded border border-slate-300 px-3 py-1 dark:border-slate-600"
                onClick={() => startEditing(null)}
              >
                {t('common.close')}
              </button>
              {!editing.isNew &&
                (confirmDelete ? (
                  <>
                    <span>{t('devices.deleteConfirm', { id: editing.draft.id })}</span>
                    <button
                      type="button"
                      disabled={del.isPending}
                      className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
                      onClick={onDelete}
                    >
                      {t('devices.delete')}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-3 py-1 dark:border-slate-600"
                      onClick={() => setConfirmDelete(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ml-auto text-red-600"
                    onClick={() => setConfirmDelete(true)}
                  >
                    {t('devices.delete')}
                  </button>
                ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">{t('devices.list')}</h2>
          {devices.isError ? (
            <p role="alert" className="text-sm text-red-600">
              {t('devices.error.load')}
            </p>
          ) : devices.isPending ? (
            <p className="text-sm text-slate-500">{t('app.loading')}</p>
          ) : (
            <DeviceList
              devices={deviceList}
              floors={floorList}
              selectedId={editing && !editing.isNew ? editing.draft.id : null}
              onSelect={(d) => selectDevice(d, true)}
            />
          )}
        </section>
      </aside>
    </div>
  );
}
