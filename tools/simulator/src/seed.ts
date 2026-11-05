import { readFileSync } from 'node:fs';
import type { CreatedIntegrationKey, Device, Floor, ModelUploadResult, Site } from '@dt/shared';
import { AdminClient, ApiError } from './api';
import { repoPath, type SimConfig } from './config';
import {
  assertCompleteDevices,
  deviceMatches,
  floorsMatchSample,
  planSeedDevices,
  SAMPLE_FLOORS,
  toSimDevice,
} from './plan';
import type { SimDevice } from './scenarios';

export async function seed(
  url: string,
  username: string,
  password: string,
  siteName: string,
): Promise<SimConfig> {
  const api = new AdminClient(url);
  await api.login(username, password);

  const sites = await api.request<Site[]>('GET', '/api/sites');
  let site = sites.find((s) => s.name === siteName);
  if (site) log(`site "${siteName}" exists (${site.id}), reusing`);
  else {
    site = await api.request<Site>('POST', '/api/sites', { name: siteName });
    log(`created site ${site.id}`);
  }
  const siteId = site.id;
  const putFloors = (input: { name: string; elevationMin: number; elevationMax: number }[]) =>
    api.request<Floor[]>('PUT', `/api/sites/${siteId}/floors`, input);

  let floors = await api.request<Floor[]>('GET', `/api/sites/${siteId}/floors`);
  if (site.modelVersion === null) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([readFileSync(repoPath('samples/office-3f.glb'))], { type: 'model/gltf-binary' }),
      'office-3f.glb',
    );
    const up = await api.request<ModelUploadResult>('PUT', `/api/sites/${siteId}/model`, form);
    log(`uploaded model (${up.floorSuggestion.length} floors suggested)`);
    floors = await putFloors(up.floorSuggestion.map((f, i) => ({ name: `${i + 1}F`, ...f })));
  } else log('model already uploaded, skipping');

  if (floors.length === 0) {
    log('site has no floors, applying 1F-3F');
    floors = await putFloors(SAMPLE_FLOORS);
  }
  if (!floorsMatchSample(floors))
    throw new Error(
      `site "${siteName}" has floors that do not match the sample model (expected 3 floors at 0-4, 4-8, 8-12 m); delete the site or use --site-name <other>`,
    );

  const existing = await api.request<Device[]>('GET', `/api/sites/${siteId}/devices`);
  const byId = new Map(existing.map((d) => [d.id, d]));
  const devices: SimDevice[] = [];

  for (const p of planSeedDevices(floors)) {
    const { floorId, name, position, yawDeg, pitchDeg, hfovDeg, rangeM } = p;
    const body = { type: p.type, floorId, name, position, yawDeg, pitchDeg, hfovDeg, rangeM };
    const cur = byId.get(p.id);
    try {
      if (!cur) {
        await api.request('POST', '/api/devices', { siteId, id: p.id, ...body });
        log(`created ${p.id}`);
      } else if (!deviceMatches(cur, p)) {
        await api.request('PATCH', `/api/devices/${p.id}`, body);
        log(`fixed ${p.id} (floor/type/position differed)`);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'device_id_taken')
        throw new Error(
          `device id ${p.id} is already used by another site; remove it first or use --site-name <other>`,
          { cause: e },
        );
      throw e;
    }
    devices.push(toSimDevice(p));
  }
  assertCompleteDevices(devices, floors.length);

  const key = await api.request<CreatedIntegrationKey>('POST', '/api/integration-keys', {
    name: 'simulator',
  });
  return { url, key: key.key, siteId, devices };
}

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}
