import { validateFloorRanges, type Floor, type FloorInput, type FloorRange } from '@dt/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../api/client';
import { useFloors, useSaveFloors, useSites } from '../../api/queries';
import { uploadModel } from '../../api/uploadModel';
import { FloorEditor, applySuggestion, editedRange } from '../../components/FloorEditor';
import { useSettledValue } from '../../hooks/useSettledValue';
import { useViewStore } from '../../state/viewStore';
import { FloorRangeBand } from '../../three/FloorRangeBand';
import { FloorSelector } from '../../three/FloorSelector';
import { ModelLayers } from '../../three/ModelLayers';
import { SiteCanvas } from '../../three/SiteCanvas';
import { useSiteModel, modelStateOf } from '../../three/useSiteModel';

const toInput = (f: Floor): FloorInput => ({
  id: f.id,
  name: f.name,
  elevationMin: f.elevationMin,
  elevationMax: f.elevationMax,
});

function deviceIds(details: unknown): string[] {
  const ids = (details as { deviceIds?: unknown } | undefined)?.deviceIds;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export function SiteDetailPage() {
  const { t } = useTranslation();
  const { siteId = '' } = useParams();
  const qc = useQueryClient();
  const sites = useSites();
  const site = sites.data?.find((s) => s.id === siteId);
  const floors = useFloors(siteId);
  const save = useSaveFloors(siteId);
  const selectedFloorId = useViewStore((s) => s.selectedFloorId);
  const showOtherFloors = useViewStore((s) => s.showOtherFloors);

  const [draft, setDraft] = useState<FloorInput[] | null>(null);
  const [suggestion, setSuggestion] = useState<FloorRange[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeRow, setActiveRow] = useState<number | null>(null);

  useEffect(() => {
    if (draft === null && floors.data) setDraft(floors.data.map(toInput));
  }, [draft, floors.data]);
  useEffect(() => () => useViewStore.getState().setSelectedFloor(null), []);

  const value = draft ?? [];
  const issues = useMemo(() => validateFloorRanges(value), [value]);
  const model = useSiteModel(siteId, site?.modelVersion ?? null);
  // The row being hovered or edited overrides the floor picked in the viewer. The band and label
  // follow it at once; re-cutting the model clones the scene, so that waits until the range settles
  // (typing "12" passes through "1"; sweeping the pointer crosses every row).
  const preview = editedRange(value, activeRow);
  const settledKey = useSettledValue(
    preview ? `${preview.elevationMin}:${preview.elevationMax}` : '',
    150,
  );
  const cutRange = useMemo(() => {
    if (!settledKey) return null;
    const [elevationMin, elevationMax] = settledKey.split(':').map(Number) as [number, number];
    return { elevationMin, elevationMax };
  }, [settledKey]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setWarnings([]);
    setProgress(0);
    try {
      const r = await uploadModel(siteId, file, setProgress);
      setWarnings(r.warnings);
      setSuggestion(r.floorSuggestion);
      await qc.invalidateQueries({ queryKey: ['sites'] });
    } catch (e) {
      setUploadError(
        e instanceof ApiError && e.code !== 'http_error'
          ? t(`model.error.${e.code}`, { defaultValue: t('model.error.unknown') })
          : t('model.error.unknown'),
      );
    } finally {
      setProgress(null);
    }
  };

  const onSave = () => {
    setSaveError(null);
    setSaved(false);
    save.mutate(value, {
      onSuccess: (list) => {
        setDraft(list.map(toInput));
        setSaved(true);
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'floor_in_use') {
          setSaveError(
            t('floors.error.floor_in_use', { devices: deviceIds(e.details).join(', ') }),
          );
        } else if (e instanceof ApiError && e.code === 'invalid_floors') {
          setSaveError(t('floors.error.invalid_floors'));
        } else setSaveError(t('common.error'));
      },
    });
  };

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{site?.name ?? t('pages.siteDetail')}</h1>
          <Link
            to={`/settings/sites/${siteId}/devices`}
            className="ml-auto rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            {t('devices.manage')}
          </Link>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">{t('model.title')}</h2>
          <input
            data-testid="model-file-input"
            type="file"
            accept=".glb,model/gltf-binary"
            aria-label={t('model.upload')}
            disabled={progress !== null}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {progress !== null && (
            <progress
              value={progress}
              max={1}
              aria-label={t('model.uploading')}
              className="w-full"
            />
          )}
          {uploadError && (
            <p role="alert" className="text-sm text-red-600">
              {uploadError}
            </p>
          )}
          {warnings.map((w) => (
            <p key={w} role="status" className="text-sm text-amber-600">
              {t(`model.warning.${w}`)}
            </p>
          ))}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium">{t('floors.title')}</h2>
          {suggestion && (
            <button
              type="button"
              data-testid="floor-apply-suggestion"
              className="self-start rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600"
              onClick={() => {
                setDraft(applySuggestion(suggestion));
                setSuggestion(null);
              }}
            >
              {t('floors.applySuggestion')}
            </button>
          )}
          {floors.isError && (
            <p role="alert" className="text-sm text-red-600">
              {t('floors.error.load')}
            </p>
          )}
          {draft === null && !floors.isError && (
            <p className="text-sm text-slate-500">{t('app.loading')}</p>
          )}
          {draft !== null && (
            <FloorEditor
              value={value}
              onChange={setDraft}
              issues={issues}
              onActiveChange={setActiveRow}
            />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="floors-save"
              disabled={draft === null || issues.length > 0 || save.isPending}
              onClick={onSave}
              className="rounded bg-slate-800 px-3 py-1 text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
            >
              {t('common.save')}
            </button>
            {saved && (
              <span role="status" className="text-sm text-green-600">
                {t('floors.saved')}
              </span>
            )}
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          )}
        </section>
      </div>

      <section className="relative h-[28rem] min-h-80 overflow-hidden rounded border border-slate-300 dark:border-slate-600 lg:h-auto">
        {site?.modelVersion == null ? (
          <p className="p-4 text-sm text-slate-500">{t('model.none')}</p>
        ) : (
          <>
            <SiteCanvas bounds={model.bounds} modelState={modelStateOf(model)}>
              <ModelLayers
                scene={model.scene}
                floors={floors.data ?? []}
                selectedFloorId={selectedFloorId}
                showOtherFloors={showOtherFloors}
                range={cutRange}
              />
              <FloorRangeBand bounds={model.bounds} range={preview} />
            </SiteCanvas>
            <FloorSelector floors={floors.data ?? []} className="absolute right-2 top-2" />
            {preview && (
              <p
                data-testid="floor-range-preview"
                role="status"
                className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-xs font-medium text-blue-700 shadow dark:bg-slate-800/90 dark:text-blue-300"
              >
                {t('floors.preview', {
                  name: preview.name,
                  min: preview.elevationMin,
                  max: preview.elevationMax,
                })}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
