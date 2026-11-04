import { z } from 'zod';
import { MAX_POSITION_BATCH } from '../constants';
import { OBJECT_TYPES } from '../objectTypes';
import { SEVERITIES } from '../severity';

export const DeviceIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);

const timestamp = z.iso.datetime({ offset: true });
const objectFields = {
  objectId: z.string().min(1).max(128).optional(),
  objectType: z.enum(OBJECT_TYPES).optional(),
};

export const EventMessageSchema = z
  .object({
    deviceId: DeviceIdSchema,
    eventType: z.string().min(1).max(64),
    occurredAt: timestamp,
    severity: z.enum(SEVERITIES).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    eventId: z.string().min(1).max(128).optional(),
    ...objectFields,
  })
  .refine((m) => (m.x === undefined) === (m.y === undefined), {
    message: 'x and y must be provided together',
    path: ['x'],
  });

export const PositionMessageSchema = z.object({
  deviceId: DeviceIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  measuredAt: timestamp,
  ...objectFields,
});

export const PositionBatchSchema = z.union([
  PositionMessageSchema,
  z.array(PositionMessageSchema).min(1).max(MAX_POSITION_BATCH),
]);

export type EventMessage = z.infer<typeof EventMessageSchema>;
export type PositionMessage = z.infer<typeof PositionMessageSchema>;
