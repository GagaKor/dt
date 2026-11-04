import type { ObjectType } from '../objectTypes';
import type { Severity } from '../severity';
import type { Alarm } from './entities';

export type ClientMessage = { type: 'subscribe'; siteId: string };

// Close codes the server uses on /api/ws. A client should not retry after `unauthenticated`
// (no session, or the session expired while connected) until the user logs in again.
export const REALTIME_CLOSE_CODES = {
  badMessage: 4400,
  unauthenticated: 4401,
  unknownSite: 4404,
} as const;

export interface ObjectStateWire {
  key: string;
  siteId: string;
  floorId: string;
  deviceId: string;
  x: number;
  y: number;
  objectId: string | null;
  objectType: ObjectType | null;
  ageMs: number;
}

export interface SiteSummary {
  siteId: string;
  siteName: string;
  unacked: number;
}

export interface NewAlarmNotice {
  alarmId: string;
  siteId: string;
  siteName: string;
  severity: Severity;
  eventType: string;
}

export type ServerMessage =
  | {
      type: 'snapshot';
      siteId: string;
      objects: ObjectStateWire[];
      alarms: Alarm[];
      sites: SiteSummary[];
    }
  | { type: 'objects'; siteId: string; objects: ObjectStateWire[] }
  | { type: 'alarm'; alarm: Alarm; created: boolean }
  | { type: 'summary'; sites: SiteSummary[]; newAlarm: NewAlarmNotice | null }
  /** Heartbeat with the server time (epoch ms); it only proves the connection is alive. */
  | { type: 'ping'; t: number };
