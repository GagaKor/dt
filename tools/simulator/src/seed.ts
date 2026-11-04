import { readFileSync } from 'node:fs';
import type { CreatedIntegrationKey, Device, Floor, ModelUploadResult, Site } from '@dt/shared';
import { AdminClient, ApiError } from './api';
import { repoPath, type SimConfig } from './config';
import type { SimDevice } from './scenarios';

const SITE_NAME = 'Sample Office';
const CAMERA_XY = [-12, 12] as const;
const SENSOR_XY: [number, number][] = [
  [-5, 6],
  [5, -6],
];

export async function seed(url: string, username: string, password: string): Promise<SimConfig> {
  const api = new AdminClient(url);
  await api.login(username, password);

  const sites = await api.request<Site[]>('GET', '/api/sites');
  let site = sites.find((s) => s.name === SITE_NAME);
  if (site) log(`site "${SITE_NAME}" exists (${site.id}), reusing`);
  else {
    site = await api.request<Site>('POST', '/api/sites', { name: SITE_NAME });
    log(`created site ${site.id}`);
  }

  let floors = await api.request<Floor[]>('GET', `/api/sites/${site.id}/floors`);
  if (site.modelVersion === null) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([readFileSync(repoPath('samples/office-3f.glb'))], { type: 'model/gltf-binary' }),
      'office-3f.glb',
    );
    const up = await api.request<ModelUploadResult>('PUT', `/api/sites/${site.id}/model`, form);
    log(`uploaded model (${up.floorSuggestion.length} floors suggested)`);
    floors = await api.request<Floor[]>(
      'PUT',
      `/api/sites/${site.id}/floors`,
      up.floorSuggestion.map((f, i) => ({ name: `${i + 1}F`, ...f })),
    );
  } else log('model already uploaded, skipping');

  const existing = await api.request<Device[]>('GET', `/api/sites/${site.id}/devices`);
  const byId = new Map(existing.map((d) => [d.id, d]));
  const devices: SimDevice[] = [];

  const ensure = async (d: Omit<SimDevice, never>, body: Record<string, unknown>) => {
    devices.push(d);
    if (byId.has(d.id)) return;
    try {
      await api.request('POST', '/api/devices', { siteId: site.id, ...body, id: d.id });
      log(`created ${d.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'device_id_taken')
        throw new Error(`device id ${d.id} is already used by another site; remove it first`, {
          cause: e,
        });
      throw e;
    }
  };

  const sorted = [...floors].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const [idx, floor] of sorted.entries()) {
    const n = idx + 1;
    for (const [i, x] of CAMERA_XY.entries()) {
      const id = `cam-${n}f-0${i + 1}`;
      await ensure(
        { id, floor: n, type: 'camera' },
        {
          floorId: floor.id,
          type: 'camera',
          name: `Camera ${n}F ${i === 0 ? 'west' : 'east'}`,
          position: [x, floor.elevationMin + 3.0, 0],
          yawDeg: i === 0 ? 90 : 270,
          pitchDeg: -30,
        },
      );
    }
    for (const [i, [x, y]] of SENSOR_XY.entries()) {
      const id = `sensor-${n}f-0${i + 1}`;
      await ensure(
        { id, floor: n, type: 'sensor' },
        {
          floorId: floor.id,
          type: 'sensor',
          name: `Sensor ${n}F ${i + 1}`,
          position: [x, floor.elevationMin + 2.8, -y],
        },
      );
    }
  }

  const key = await api.request<CreatedIntegrationKey>('POST', '/api/integration-keys', {
    name: 'simulator',
  });
  return { url, key: key.key, siteId: site.id, devices };
}

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}
