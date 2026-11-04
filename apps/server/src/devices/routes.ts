import { DeviceCreateSchema, DeviceIdSchema, DevicePatchSchema, DeviceSchema } from '@dt/shared';
import type { Device } from '@dt/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import type { Db } from '../db/client.js';
import { devices, floors } from '../db/schema.js';
import { HttpError } from '../errors.js';
import type { DeviceDirectory } from './directory.js';

const POSITION_SLACK_M = 0.5;
const DEFAULT_HFOV_DEG = 90;
const DEFAULT_RANGE_M = 10;

const ranges = {
  hfovDeg: z.number().min(10).max(170).nullable().optional(),
  rangeM: z.number().min(1).max(100).nullable().optional(),
  pitchDeg: z.number().min(-90).max(90).optional(),
  yawDeg: z.number().finite().optional(),
};
const CreateBody = DeviceCreateSchema.extend({ id: DeviceIdSchema, ...ranges });
const PatchBody = DevicePatchSchema.extend(ranges);
const idParams = z.object({ deviceId: DeviceIdSchema });
const siteParams = z.object({ siteId: z.uuid() });

type DeviceRow = typeof devices.$inferSelect;

const normalizeYaw = (yaw: number): number => ((yaw % 360) + 360) % 360;

function toDevice(r: DeviceRow): Device {
  return {
    id: r.id,
    siteId: r.siteId,
    floorId: r.floorId,
    type: r.type as Device['type'],
    name: r.name,
    position: [r.posX, r.posY, r.posZ],
    yawDeg: r.yawDeg,
    pitchDeg: r.pitchDeg,
    hfovDeg: r.hfovDeg,
    rangeM: r.rangeM,
  };
}

async function assertPlacement(
  db: Db,
  siteId: string,
  floorId: string,
  position: [number, number, number],
): Promise<void> {
  const [floor] = await db.select().from(floors).where(eq(floors.id, floorId));
  if (!floor || floor.siteId !== siteId)
    throw new HttpError(400, 'floor_not_in_site', 'Floor does not belong to this site');
  const y = position[1];
  if (y < floor.elevationMin - POSITION_SLACK_M || y > floor.elevationMax + POSITION_SLACK_M)
    throw new HttpError(400, 'position_outside_floor', 'Position is outside the floor range');
}

const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string }).code === '23505' ||
  (err as { cause?: { code?: string } }).cause?.code === '23505';

export async function registerDeviceRoutes(
  app: FastifyInstance,
  deps: AppDeps,
  directory: DeviceDirectory,
): Promise<void> {
  const { db } = deps;
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = app.requireAdmin;

  typed.get(
    '/api/sites/:siteId/devices',
    {
      preHandler,
      schema: { params: siteParams, response: { 200: z.array(DeviceSchema) } },
    },
    async (req) => {
      const rows = await db
        .select()
        .from(devices)
        .where(eq(devices.siteId, req.params.siteId))
        .orderBy(asc(devices.createdAt), asc(devices.id));
      return rows.map(toDevice);
    },
  );

  typed.post(
    '/api/devices',
    { preHandler, schema: { body: CreateBody, response: { 201: DeviceSchema } } },
    async (req, reply) => {
      const b = req.body;
      const [existing] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.id, b.id));
      if (existing) throw new HttpError(409, 'device_id_taken', 'Device id is already in use');
      await assertPlacement(db, b.siteId, b.floorId, b.position);
      const isCamera = b.type === 'camera';
      let row: DeviceRow;
      try {
        [row] = (await db
          .insert(devices)
          .values({
            id: b.id,
            siteId: b.siteId,
            floorId: b.floorId,
            type: b.type,
            name: b.name,
            posX: b.position[0],
            posY: b.position[1],
            posZ: b.position[2],
            yawDeg: normalizeYaw(b.yawDeg ?? 0),
            pitchDeg: b.pitchDeg ?? 0,
            hfovDeg: isCamera ? (b.hfovDeg ?? DEFAULT_HFOV_DEG) : null,
            rangeM: isCamera ? (b.rangeM ?? DEFAULT_RANGE_M) : null,
          })
          .returning()) as [DeviceRow];
      } catch (err) {
        if (isUniqueViolation(err))
          throw new HttpError(409, 'device_id_taken', 'Device id is already in use');
        throw err;
      } finally {
        directory.invalidate();
      }
      return reply.status(201).send(toDevice(row));
    },
  );

  typed.patch(
    '/api/devices/:deviceId',
    {
      preHandler,
      schema: { params: idParams, body: PatchBody, response: { 200: DeviceSchema } },
    },
    async (req) => {
      const [cur] = await db.select().from(devices).where(eq(devices.id, req.params.deviceId));
      if (!cur) throw new HttpError(404, 'device_not_found', 'Device not found');
      const p = req.body;
      const floorId = p.floorId ?? cur.floorId;
      const position = p.position ?? ([cur.posX, cur.posY, cur.posZ] as [number, number, number]);
      const type = p.type ?? (cur.type as Device['type']);
      await assertPlacement(db, cur.siteId, floorId, position);
      const isCamera = type === 'camera';
      const [row] = await db
        .update(devices)
        .set({
          floorId,
          type,
          name: p.name ?? cur.name,
          posX: position[0],
          posY: position[1],
          posZ: position[2],
          yawDeg: p.yawDeg === undefined ? cur.yawDeg : normalizeYaw(p.yawDeg),
          pitchDeg: p.pitchDeg ?? cur.pitchDeg,
          hfovDeg: isCamera ? (p.hfovDeg ?? cur.hfovDeg ?? DEFAULT_HFOV_DEG) : null,
          rangeM: isCamera ? (p.rangeM ?? cur.rangeM ?? DEFAULT_RANGE_M) : null,
        })
        .where(eq(devices.id, cur.id))
        .returning();
      directory.invalidate();
      if (!row) throw new HttpError(404, 'device_not_found', 'Device not found');
      return toDevice(row);
    },
  );

  typed.delete(
    '/api/devices/:deviceId',
    { preHandler, schema: { params: idParams, response: { 204: z.null() } } },
    async (req, reply) => {
      const [row] = await db.delete(devices).where(eq(devices.id, req.params.deviceId)).returning();
      directory.invalidate();
      if (!row) throw new HttpError(404, 'device_not_found', 'Device not found');
      return reply.status(204).send(null);
    },
  );
}
