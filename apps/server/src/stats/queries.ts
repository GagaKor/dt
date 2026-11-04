import type { Kpi, Severity, StatsQuery, StatsResponse } from '@dt/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';

const rowsOf = async <T>(db: Db, q: SQL): Promise<T[]> =>
  ((await db.execute(q)) as unknown as { rows: T[] }).rows;

export async function getStats(db: Db, q: StatsQuery): Promise<StatsResponse> {
  const from = sql`${q.from}::timestamptz`;
  const to = sql`${q.to}::timestamptz`;
  const tz = sql`${q.tz}::text`;
  // Only the two whitelisted literals are ever interpolated raw.
  const unit = q.bucket === 'hour' ? sql.raw(`'hour'`) : sql.raw(`'day'`);
  const step = q.bucket === 'hour' ? sql.raw(`interval '1 hour'`) : sql.raw(`interval '1 day'`);
  const scope = sql`site_id = ${q.siteId}::uuid and first_occurred_at >= ${from} and first_occurred_at < ${to}`;

  const [series, byType, bySeverity, byDevice, byFloor, unacked] = await Promise.all([
    rowsOf<{ bucket_start: string; count: number }>(
      db,
      sql`
        with b as (
          select generate_series(
            date_trunc(${unit}, ${from} at time zone ${tz}),
            date_trunc(${unit}, (${to} - interval '1 microsecond') at time zone ${tz}),
            ${step}
          ) as start
        ), c as (
          select date_trunc(${unit}, first_occurred_at at time zone ${tz}) as start, count(*)::int as n
          from alarms where ${scope} group by 1
        )
        select to_char(b.start, 'YYYY-MM-DD"T"HH24:MI') as bucket_start, coalesce(c.n, 0)::int as count
        from b left join c on c.start = b.start order by b.start`,
    ),
    rowsOf<{ event_type: string; count: number }>(
      db,
      sql`select event_type, count(*)::int as count from alarms where ${scope}
          group by event_type order by count desc, event_type asc`,
    ),
    rowsOf<{ severity: Severity; count: number }>(
      db,
      sql`select severity, count(*)::int as count from alarms where ${scope}
          group by severity order by count desc, severity asc`,
    ),
    rowsOf<{ device_id: string; device_name: string | null; count: number }>(
      db,
      sql`select a.device_id, d.name as device_name, a.count from (
            select device_id, count(*)::int as count from alarms where ${scope}
            group by device_id order by count desc, device_id asc limit 10
          ) a left join devices d on d.id = a.device_id and d.site_id = ${q.siteId}::uuid
          order by a.count desc, a.device_id asc`,
    ),
    rowsOf<{ floor_id: string | null; floor_name: string | null; count: number }>(
      db,
      sql`select a.floor_id, f.name as floor_name, a.count from (
            select floor_id, count(*)::int as count from alarms where ${scope} group by floor_id
          ) a left join floors f on f.id = a.floor_id
          order by a.count desc, f.name asc nulls last`,
    ),
    countUnacked(db, q.siteId),
  ]);

  return {
    timeseries: series.map((r) => ({ bucketStart: r.bucket_start, count: Number(r.count) })),
    byType: byType.map((r) => ({ eventType: r.event_type, count: Number(r.count) })),
    bySeverity: bySeverity.map((r) => ({ severity: r.severity, count: Number(r.count) })),
    byDevice: byDevice.map((r) => ({
      deviceId: r.device_id,
      deviceName: r.device_name,
      count: Number(r.count),
    })),
    byFloor: byFloor.map((r) => ({
      floorId: r.floor_id,
      floorName: r.floor_name,
      count: Number(r.count),
    })),
    unacked,
  };
}

async function countUnacked(db: Db, siteId: string): Promise<number> {
  const [r] = await rowsOf<{ n: number }>(
    db,
    sql`select count(*)::int as n from alarms where site_id = ${siteId}::uuid and acknowledged_at is null`,
  );
  return Number(r?.n ?? 0);
}

export async function getKpi(db: Db, p: { siteId: string; tz: string; now: Date }): Promise<Kpi> {
  const [row] = await rowsOf<{ n: number }>(
    db,
    sql`select count(*)::int as n from alarms
        where site_id = ${p.siteId}::uuid
          and first_occurred_at >= date_trunc('day', ${p.now.toISOString()}::timestamptz at time zone ${p.tz}::text) at time zone ${p.tz}::text`,
  );
  return { unacked: await countUnacked(db, p.siteId), todayEvents: Number(row?.n ?? 0) };
}
