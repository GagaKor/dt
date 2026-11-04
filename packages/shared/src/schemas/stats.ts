import { z } from 'zod';
import type { Severity } from '../severity';

export const StatsQuerySchema = z.object({
  siteId: z.uuid(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  bucket: z.enum(['hour', 'day']),
  tz: z.string().default('UTC'),
});
export type StatsQuery = z.infer<typeof StatsQuerySchema>;

export interface StatsResponse {
  timeseries: { bucketStart: string; count: number }[];
  byType: { eventType: string; count: number }[];
  bySeverity: { severity: Severity; count: number }[];
  byDevice: { deviceId: string; deviceName: string | null; count: number }[];
  byFloor: { floorId: string | null; floorName: string | null; count: number }[];
  unacked: number;
}

export interface Kpi {
  unacked: number;
  todayEvents: number;
}
