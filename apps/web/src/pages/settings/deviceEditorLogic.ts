import type { Device, DeviceCreate, DevicePatch, DeviceType, FloorRange } from '@dt/shared';
import type { Intersection, Quaternion, Vector3 } from 'three';
import { DEFAULT_HFOV_DEG, DEFAULT_RANGE_M, DEVICE_LIMITS } from '../../components/DeviceForm';
import { CLICK_SLOP_PX } from '../../three/DeviceMarkers';
import { placementPosition, yawPitchFromQuaternion } from '../../three/devicePose';
import { pickFloorHit } from '../../three/pickFloorHit';

export type Position = Device['position'];

export interface Editing {
  draft: DeviceCreate;
  isNew: boolean;
  /** Last saved version of an existing device; null for a device not saved yet. */
  base: DeviceCreate | null;
}

/** `blocked`: the change would throw away unsaved edits, so the current editing state stays. */
export type Transition =
  { editing: Editing; blocked: false } | { editing: Editing | null; blocked: true };

export interface Placement {
  siteId: string;
  floorId: string;
  type: DeviceType;
  position: Position;
}

// '#' is not allowed in device ids, so the unsaved device never collides with a saved one.
export const NEW_DEVICE_KEY = '#new';
// A short click on a gizmo handle also reaches the model or a marker behind it as a click.
export const GIZMO_CLICK_GUARD_MS = 300;
// Gizmo results closer than this to the draft are float noise, not edits.
const POSITION_EPS_M = 0.0005;
const ANGLE_EPS_DEG = 0.05;

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
const finite = (v: number | null | undefined, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, v));

export const roundPosition = (v: Vector3): Position => [
  round(v.x, 3),
  round(v.y, 3),
  round(v.z, 3),
];

export function isGizmoEcho(msSinceGizmoRelease: number): boolean {
  return msSinceGizmoRelease < GIZMO_CLICK_GUARD_MS;
}

/** A pointer-up close to its pointer-down that is not the tail of a gizmo drag. */
export function isPlacementClick(
  deltaPx: number,
  msSinceGizmoRelease: number,
  slopPx = CLICK_SLOP_PX,
): boolean {
  return deltaPx <= slopPx && !isGizmoEcho(msSinceGizmoRelease);
}

export function pickPlacement(
  hits: readonly Intersection[],
  floor: FloorRange,
  rayDirection: Vector3,
): Position | null {
  const hit = pickFloorHit(hits, floor);
  return hit ? roundPosition(placementPosition(hit, rayDirection)) : null;
}

export function nextDeviceId(type: DeviceType, devices: readonly Device[]): string {
  const taken = new Set(devices.map((d) => d.id));
  let n = 1;
  while (taken.has(`${type}-${n}`)) n++;
  return `${type}-${n}`;
}

export function editingFromDevice(d: Device): Editing {
  return { draft: { ...d }, isNew: false, base: { ...d } };
}

function sameDraft(a: DeviceCreate, b: DeviceCreate): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.floorId === b.floorId &&
    a.position.every((v, i) => v === b.position[i]) &&
    a.yawDeg === b.yawDeg &&
    a.pitchDeg === b.pitchDeg &&
    (a.hfovDeg ?? null) === (b.hfovDeg ?? null) &&
    (a.rangeM ?? null) === (b.rangeM ?? null)
  );
}

/** An existing device whose draft differs from what is saved. Unsaved new devices never count. */
export function isDirty(e: Editing | null): boolean {
  return !!e && !e.isNew && !!e.base && !sameDraft(e.draft, e.base);
}

export function nextEditingOnPlace(
  cur: Editing | null,
  p: Placement,
  devices: readonly Device[],
): Transition {
  if (isDirty(cur)) return { editing: cur, blocked: true };
  if (cur?.isNew && cur.draft.type === p.type) {
    return {
      editing: { ...cur, draft: { ...cur.draft, floorId: p.floorId, position: p.position } },
      blocked: false,
    };
  }
  const id = nextDeviceId(p.type, devices);
  const camera = p.type === 'camera';
  return {
    editing: {
      isNew: true,
      base: null,
      draft: {
        id,
        siteId: p.siteId,
        floorId: p.floorId,
        type: p.type,
        name: id,
        position: p.position,
        yawDeg: 0,
        pitchDeg: 0,
        hfovDeg: camera ? DEFAULT_HFOV_DEG : null,
        rangeM: camera ? DEFAULT_RANGE_M : null,
      },
    },
    blocked: false,
  };
}

export function nextEditingOnSelect(cur: Editing | null, d: Device): Transition {
  if (cur && !cur.isNew && cur.draft.id === d.id) return { editing: cur, blocked: false };
  if (isDirty(cur)) return { editing: cur, blocked: true };
  return { editing: editingFromDevice(d), blocked: false };
}

/** The server copy replaces the draft only if the user is still on the draft that was sent. */
export function editingAfterSave(
  cur: Editing | null,
  sent: DeviceCreate,
  saved: Device,
): Editing | null {
  return cur?.draft === sent ? editingFromDevice(saved) : cur;
}

const yawDelta = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/** Draft after a gizmo drag; components the drag did not really change keep their exact value. */
export function draftAfterGizmo(
  draft: DeviceCreate,
  object: { position: Vector3; quaternion: Quaternion },
): DeviceCreate {
  const { yawDeg, pitchDeg } = yawPitchFromQuaternion(object.quaternion);
  const moved = object.position.toArray();
  const rounded = roundPosition(object.position);
  const position = draft.position.map((old, i) =>
    Math.abs(moved[i]! - old) < POSITION_EPS_M ? old : rounded[i]!,
  ) as Position;
  const next: DeviceCreate = {
    ...draft,
    position,
    yawDeg:
      yawDelta(yawDeg, finite(draft.yawDeg, Number.NaN)) < ANGLE_EPS_DEG
        ? draft.yawDeg
        : round(yawDeg, 1) % 360,
    pitchDeg:
      Math.abs(pitchDeg - finite(draft.pitchDeg, Number.NaN)) < ANGLE_EPS_DEG
        ? draft.pitchDeg
        : round(pitchDeg, 1),
  };
  return sameDraft(next, draft) ? draft : next;
}

/** What the 3D view draws for a draft, which may hold values the form still flags. */
export function previewDevice(d: DeviceCreate, id: string): Device {
  const camera = d.type === 'camera';
  return {
    id,
    siteId: d.siteId,
    floorId: d.floorId,
    type: d.type,
    name: d.name,
    position: d.position,
    yawDeg: finite(d.yawDeg, 0),
    pitchDeg: clamp(finite(d.pitchDeg, 0), DEVICE_LIMITS.pitchDeg),
    hfovDeg: camera ? clamp(finite(d.hfovDeg, DEFAULT_HFOV_DEG), DEVICE_LIMITS.hfovDeg) : null,
    rangeM: camera ? clamp(finite(d.rangeM, DEFAULT_RANGE_M), DEVICE_LIMITS.rangeM) : null,
  };
}

export function editingKey(e: Editing | null): string | null {
  return e ? (e.isNew ? NEW_DEVICE_KEY : e.draft.id) : null;
}

/** Saved devices with the one being edited swapped for (or joined by) its draft. */
export function markersFor(devices: Device[], e: Editing | null): Device[] {
  const key = editingKey(e);
  if (!e || !key) return devices;
  const p = previewDevice(e.draft, key);
  return e.isNew ? [...devices, p] : devices.map((d) => (d.id === p.id ? p : d));
}

export function createBody(d: DeviceCreate): DeviceCreate {
  const camera = d.type === 'camera';
  return {
    ...d,
    name: d.name.trim(),
    hfovDeg: camera ? d.hfovDeg : null,
    rangeM: camera ? d.rangeM : null,
  };
}

export function patchBody(d: DeviceCreate): DevicePatch {
  const { id: _id, siteId: _siteId, ...rest } = createBody(d);
  return rest;
}
