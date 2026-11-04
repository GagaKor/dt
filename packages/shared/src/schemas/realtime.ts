import type { ObjectType } from '../objectTypes';
import type { Severity } from '../severity';
import type { Alarm } from './entities';

export type ClientMessage = { type: 'subscribe'; siteId: string };

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
  | { type: 'summary'; sites: SiteSummary[]; newAlarm: NewAlarmNotice | null };
