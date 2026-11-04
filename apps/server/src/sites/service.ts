import { validateFloorRanges, type Floor, type FloorInput, type Site } from '@dt/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { devices, floors, sites } from '../db/schema.js';
import { HttpError } from '../errors.js';

type SiteRow = typeof sites.$inferSelect;
type FloorRow = typeof floors.$inferSelect;

export function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    modelVersion: row.modelVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

function toFloor(row: FloorRow): Floor {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    elevationMin: row.elevationMin,
    elevationMax: row.elevationMax,
    sortOrder: row.sortOrder,
  };
}

export const modelKeyFor = (siteId: string, version: number): string =>
  `sites/${siteId}/model-v${version}.glb`;

export async function getSiteRow(db: Db, siteId: string): Promise<SiteRow> {
  const [row] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!row) throw new HttpError(404, 'site_not_found', 'Site not found');
  return row;
}

export async function listFloors(db: Db, siteId: string): Promise<Floor[]> {
  const rows = await db
    .select()
    .from(floors)
    .where(eq(floors.siteId, siteId))
    .orderBy(asc(floors.sortOrder));
  return rows.map(toFloor);
}

export async function replaceFloors(db: Db, siteId: string, input: FloorInput[]): Promise<Floor[]> {
  const issues = validateFloorRanges(input);
  if (issues.length > 0) throw new HttpError(400, 'invalid_floors', 'Invalid floors', issues);

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(floors).where(eq(floors.siteId, siteId));
    const existingIds = new Set(existing.map((f) => f.id));
    const keepIds = input.flatMap((f) => (f.id ? [f.id] : []));
    if (keepIds.some((id) => !existingIds.has(id)))
      throw new HttpError(400, 'invalid_floors', 'Unknown floor id', [{ code: 'unknown_id' }]);
    if (new Set(keepIds).size !== keepIds.length)
      throw new HttpError(400, 'invalid_floors', 'Duplicate floor id', [{ code: 'duplicate_id' }]);

    const dropIds = existing.filter((f) => !keepIds.includes(f.id)).map((f) => f.id);
    if (dropIds.length > 0) {
      const used = await tx
        .select({ id: devices.id })
        .from(devices)
        .where(inArray(devices.floorId, dropIds));
      if (used.length > 0)
        throw new HttpError(409, 'floor_in_use', 'Floors in use by devices cannot be removed', {
          deviceIds: used.map((d) => d.id).sort(),
        });
      await tx.delete(floors).where(inArray(floors.id, dropIds));
    }

    for (const [i, f] of input.entries()) {
      const values = {
        name: f.name.trim(),
        elevationMin: f.elevationMin,
        elevationMax: f.elevationMax,
        sortOrder: i,
      };
      if (f.id) await tx.update(floors).set(values).where(eq(floors.id, f.id));
      else await tx.insert(floors).values({ ...values, siteId });
    }
    const rows = await tx
      .select()
      .from(floors)
      .where(eq(floors.siteId, siteId))
      .orderBy(asc(floors.sortOrder));
    return rows.map(toFloor);
  });
}

// Compare-and-set on the previous version so concurrent uploads cannot both claim one number.
export async function commitModelVersion(
  db: Db,
  siteId: string,
  previousVersion: number | null,
  key: string,
): Promise<SiteRow | undefined> {
  const rows = await db
    .update(sites)
    .set({ modelVersion: (previousVersion ?? 0) + 1, modelKey: key })
    .where(
      and(
        eq(sites.id, siteId),
        previousVersion === null
          ? isNull(sites.modelVersion)
          : eq(sites.modelVersion, previousVersion),
      ),
    )
    .returning();
  return rows[0];
}
