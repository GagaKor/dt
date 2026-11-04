import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  modelVersion: integer('model_version'),
  modelKey: text('model_key'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const floors = pgTable('floors', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  elevationMin: doublePrecision('elevation_min').notNull(),
  elevationMax: doublePrecision('elevation_max').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  floorId: uuid('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  posX: doublePrecision('pos_x').notNull(),
  posY: doublePrecision('pos_y').notNull(),
  posZ: doublePrecision('pos_z').notNull(),
  yawDeg: doublePrecision('yaw_deg').notNull().default(0),
  pitchDeg: doublePrecision('pitch_deg').notNull().default(0),
  hfovDeg: doublePrecision('hfov_deg'),
  rangeM: doublePrecision('range_m'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const integrationKeys = pgTable('integration_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  defaultSeverity: text('default_severity').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
});

// floor_id and device_id carry no FK so history survives device/floor deletion.
export const alarms = pgTable(
  'alarms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    floorId: uuid('floor_id'),
    deviceId: text('device_id').notNull(),
    integrationKeyId: uuid('integration_key_id')
      .notNull()
      .references(() => integrationKeys.id),
    eventType: text('event_type').notNull(),
    objectId: text('object_id'),
    objectType: text('object_type'),
    severity: text('severity').notNull(),
    count: integer('count').notNull(),
    firstOccurredAt: ts('first_occurred_at').notNull(),
    lastOccurredAt: ts('last_occurred_at').notNull(),
    lastReceivedAt: ts('last_received_at').notNull(),
    x: doublePrecision('x'),
    y: doublePrecision('y'),
    acknowledgedAt: ts('acknowledged_at'),
    ackNote: text('ack_note'),
  },
  (t) => [
    index('alarms_continuation_idx').on(
      t.integrationKeyId,
      t.deviceId,
      t.eventType,
      t.objectId,
      t.lastReceivedAt.desc(),
    ),
    index('alarms_site_ack_idx').on(t.siteId, t.acknowledgedAt),
    index('alarms_site_first_idx').on(t.siteId, t.firstOccurredAt),
  ],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alarmId: uuid('alarm_id')
      .notNull()
      .references(() => alarms.id, { onDelete: 'cascade' }),
    integrationKeyId: uuid('integration_key_id').notNull(),
    externalEventId: text('external_event_id'),
    deviceId: text('device_id').notNull(),
    eventType: text('event_type').notNull(),
    severity: text('severity').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    receivedAt: ts('received_at').notNull(),
    x: doublePrecision('x'),
    y: doublePrecision('y'),
    objectId: text('object_id'),
    objectType: text('object_type'),
  },
  (t) => [unique('events_key_external_uq').on(t.integrationKeyId, t.externalEventId)],
);
