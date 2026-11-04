import { z } from 'zod';
import { OBJECT_TYPES } from '../objectTypes';
import { SEVERITIES } from '../severity';

const iso = z.string();

export const SiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelVersion: z.number().nullable(),
  createdAt: iso,
});
export type Site = z.infer<typeof SiteSchema>;

export const FloorRangeSchema = z.object({ elevationMin: z.number(), elevationMax: z.number() });
export type FloorRange = z.infer<typeof FloorRangeSchema>;

export const FloorSchema = FloorRangeSchema.extend({
  id: z.string(),
  siteId: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});
export type Floor = z.infer<typeof FloorSchema>;

export const FloorInputSchema = FloorRangeSchema.extend({
  id: z.string().optional(),
  name: z.string(),
});
export type FloorInput = z.infer<typeof FloorInputSchema>;

export const DeviceTypeSchema = z.enum(['camera', 'sensor']);
export type DeviceType = z.infer<typeof DeviceTypeSchema>;

export const DeviceSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  floorId: z.string(),
  type: DeviceTypeSchema,
  name: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  yawDeg: z.number(),
  pitchDeg: z.number(),
  hfovDeg: z.number().nullable(),
  rangeM: z.number().nullable(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceCreateSchema = DeviceSchema.partial({
  yawDeg: true,
  pitchDeg: true,
  hfovDeg: true,
  rangeM: true,
});
export type DeviceCreate = z.infer<typeof DeviceCreateSchema>;

export const DevicePatchSchema = DeviceCreateSchema.omit({ id: true, siteId: true }).partial();
export type DevicePatch = z.infer<typeof DevicePatchSchema>;

export const IntegrationKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  defaultSeverity: z.enum(SEVERITIES),
  createdAt: iso,
  revokedAt: iso.nullable(),
});
export type IntegrationKey = z.infer<typeof IntegrationKeySchema>;

export const CreatedIntegrationKeySchema = IntegrationKeySchema.extend({ key: z.string() });
export type CreatedIntegrationKey = z.infer<typeof CreatedIntegrationKeySchema>;

export const AlarmSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  floorId: z.string().nullable(),
  deviceId: z.string(),
  deviceName: z.string().nullable(),
  integrationKeyId: z.string(),
  integrationKeyName: z.string(),
  eventType: z.string(),
  objectId: z.string().nullable(),
  objectType: z.enum(OBJECT_TYPES).nullable(),
  severity: z.enum(SEVERITIES),
  count: z.number().int(),
  firstOccurredAt: iso,
  lastOccurredAt: iso,
  lastReceivedAt: iso,
  x: z.number().nullable(),
  y: z.number().nullable(),
  acknowledgedAt: iso.nullable(),
  ackNote: z.string().nullable(),
});
export type Alarm = z.infer<typeof AlarmSchema>;

export const ModelWarningSchema = z.enum(['units_suspect_too_large', 'units_suspect_too_small']);
export type ModelWarning = z.infer<typeof ModelWarningSchema>;

export const ModelUploadResultSchema = z.object({
  site: SiteSchema,
  floorSuggestion: z.array(FloorRangeSchema),
  warnings: z.array(ModelWarningSchema),
});
export type ModelUploadResult = z.infer<typeof ModelUploadResultSchema>;
