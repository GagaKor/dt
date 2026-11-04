import { devices } from '../db/schema.js';
import type { Db } from '../db/client.js';

export interface DeviceLocation {
  deviceId: string;
  siteId: string;
  floorId: string;
  name: string;
  position: [number, number, number];
}

export class DeviceDirectory {
  private cache: Map<string, DeviceLocation> | null = null;
  private loading: Promise<Map<string, DeviceLocation>> | null = null;
  // A load that started before an invalidate() must not publish its stale snapshot.
  private generation = 0;

  constructor(private readonly db: Db) {}

  async get(deviceId: string): Promise<DeviceLocation | null> {
    return (await this.load()).get(deviceId) ?? null;
  }

  async getMany(ids: string[]): Promise<Map<string, DeviceLocation>> {
    const all = await this.load();
    const out = new Map<string, DeviceLocation>();
    for (const id of ids) {
      const hit = all.get(id);
      if (hit) out.set(id, hit);
    }
    return out;
  }

  invalidate(): void {
    this.generation++;
    this.cache = null;
    this.loading = null;
  }

  private load(): Promise<Map<string, DeviceLocation>> {
    if (this.cache) return Promise.resolve(this.cache);
    if (this.loading) return this.loading;
    const gen = this.generation;
    const p = this.db
      .select()
      .from(devices)
      .then((rows) => {
        const map = new Map<string, DeviceLocation>();
        for (const r of rows) {
          map.set(r.id, {
            deviceId: r.id,
            siteId: r.siteId,
            floorId: r.floorId,
            name: r.name,
            position: [r.posX, r.posY, r.posZ],
          });
        }
        if (gen === this.generation) {
          this.cache = map;
          this.loading = null;
        }
        return map;
      })
      .catch((err: unknown) => {
        if (gen === this.generation) this.loading = null;
        throw err;
      });
    this.loading = p;
    return p;
  }
}
