import { StatsQuerySchema, type Kpi, type StatsResponse } from '@dt/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { HttpError } from '../errors.js';
import { getKpi, getStats } from './queries.js';

const HOUR_MS = 3_600_000;
const MAX_RANGE_MS = { hour: 31 * 24 * HOUR_MS, day: 366 * 24 * HOUR_MS };

const KpiQuery = z.object({ siteId: z.uuid(), tz: z.string().default('UTC') });

function assertTz(tz: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw new HttpError(400, 'invalid_tz', `Unknown time zone: ${tz}`);
  }
}

export async function registerStatsRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  const { db } = deps;
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const onRequest = app.requireAdmin;

  typed.get(
    '/api/stats',
    { onRequest, schema: { querystring: StatsQuerySchema } },
    async (req): Promise<StatsResponse> => {
      const q = req.query;
      assertTz(q.tz);
      const span = Date.parse(q.to) - Date.parse(q.from);
      if (span <= 0) throw new HttpError(400, 'invalid_range', 'from must be before to');
      if (span > MAX_RANGE_MS[q.bucket]) {
        throw new HttpError(400, 'range_too_long', `Range too long for ${q.bucket} buckets`);
      }
      return getStats(db, q);
    },
  );

  typed.get(
    '/api/stats/kpi',
    { onRequest, schema: { querystring: KpiQuery } },
    async (req): Promise<Kpi> => {
      assertTz(req.query.tz);
      return getKpi(db, { siteId: req.query.siteId, tz: req.query.tz, now: deps.clock() });
    },
  );
}
