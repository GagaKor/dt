import type { Device, DeviceCreate } from '@dt/shared';
import { Mesh, Quaternion, Vector3, type Intersection } from 'three';
import { expect, test } from 'vitest';
import { deviceQuaternion } from '../../three/devicePose';
import {
  GIZMO_CLICK_GUARD_MS,
  draftAfterGizmo,
  editingAfterSave,
  editingFromDevice,
  isDirty,
  isPlacementClick,
  nextEditingOnPlace,
  nextEditingOnSelect,
  patchBody,
  pickPlacement,
  previewDevice,
  type Editing,
} from './deviceEditorLogic';

const cam1: Device = {
  id: 'camera-1',
  siteId: 's1',
  floorId: 'f2',
  type: 'camera',
  name: 'Lobby',
  position: [1, 4.1, -2],
  yawDeg: 45,
  pitchDeg: -10,
  hfovDeg: 90,
  rangeM: 10,
};
const door: Device = { ...cam1, id: 'door-1', type: 'sensor', hfovDeg: null, rangeM: null };
const devices = [cam1, door];
const place = {
  siteId: 's1',
  floorId: 'f2',
  type: 'camera' as const,
  position: [5, 4.1, 5] as Device['position'],
};
const dirty = (e: Editing): Editing => ({ ...e, draft: { ...e.draft, yawDeg: 120 } });
const newDraft = (patch: Partial<DeviceCreate> = {}): Editing => ({
  isNew: true,
  base: null,
  draft: { ...cam1, id: 'camera-2', name: 'camera-2', ...patch },
});

test('a click within the slop places, a drag beyond it does not', () => {
  const settled = GIZMO_CLICK_GUARD_MS + 1;
  expect(isPlacementClick(0, settled)).toBe(true);
  expect(isPlacementClick(4, settled)).toBe(true);
  expect(isPlacementClick(5, settled)).toBe(false);
  expect(isPlacementClick(12, settled, 20)).toBe(true);
});

test('the click that ends a gizmo drag does not place', () => {
  expect(isPlacementClick(0, 10)).toBe(false);
  expect(isPlacementClick(0, GIZMO_CLICK_GUARD_MS)).toBe(true);
});

function hit(y: number): Intersection {
  const object = new Mesh();
  object.updateMatrixWorld(true);
  const normal = new Vector3(0, 1, 0);
  return {
    distance: 10 - y,
    point: new Vector3(2, y, -3),
    object,
    face: { a: 0, b: 1, c: 2, normal, materialIndex: 0 },
  };
}

test('placement picks the first hit inside the selected floor band', () => {
  const floor = { elevationMin: 4, elevationMax: 8 };
  // 7.8 is above the visible band (ceiling cut at 7.5), so the floor at 4 wins.
  const p = pickPlacement([hit(7.8), hit(4)], floor, new Vector3(0, -1, 0));
  expect(p).toEqual([2, 4.1, -3]);
});

test('a hit only above the floor band places nothing', () => {
  const floor = { elevationMin: 4, elevationMax: 8 };
  expect(pickPlacement([hit(7.8), hit(12)], floor, new Vector3(0, -1, 0))).toBeNull();
  expect(pickPlacement([], floor, new Vector3(0, -1, 0))).toBeNull();
});

test('placing with no draft opens a new device with defaults', () => {
  const r = nextEditingOnPlace(null, place, devices);
  expect(r.blocked).toBe(false);
  expect(r.editing).toEqual({
    isNew: true,
    base: null,
    draft: {
      id: 'camera-2',
      siteId: 's1',
      floorId: 'f2',
      type: 'camera',
      name: 'camera-2',
      position: [5, 4.1, 5],
      yawDeg: 0,
      pitchDeg: 0,
      hfovDeg: 90,
      rangeM: 10,
    },
  });
  const sensor = nextEditingOnPlace(null, { ...place, type: 'sensor' }, devices).editing;
  expect(sensor?.draft).toMatchObject({ id: 'sensor-1', hfovDeg: null, rangeM: null });
});

test('a dirty existing draft blocks placement and is kept as is', () => {
  const cur = dirty(editingFromDevice(cam1));
  const r = nextEditingOnPlace(cur, place, devices);
  expect(r.blocked).toBe(true);
  expect(r.editing).toBe(cur);
});

test('a clean existing draft is replaced by the new placement', () => {
  const r = nextEditingOnPlace(editingFromDevice(cam1), place, devices);
  expect(r.blocked).toBe(false);
  expect(r.editing).toMatchObject({
    isNew: true,
    draft: { id: 'camera-2', position: [5, 4.1, 5] },
  });
});

test('a new draft of the same type moves, one of another type is replaced', () => {
  const cur = newDraft({ id: 'entrance', yawDeg: 30 });
  const moved = nextEditingOnPlace(cur, place, devices);
  expect(moved.editing?.draft).toMatchObject({ id: 'entrance', yawDeg: 30, position: [5, 4.1, 5] });
  const replaced = nextEditingOnPlace(cur, { ...place, type: 'sensor' }, devices);
  expect(replaced.editing?.draft).toMatchObject({ id: 'sensor-1', type: 'sensor' });
});

test('selecting keeps edits of the same device and blocks switching away from them', () => {
  const cur = dirty(editingFromDevice(cam1));
  const same = nextEditingOnSelect(cur, cam1);
  expect(same).toEqual({ editing: cur, blocked: false });
  const other = nextEditingOnSelect(cur, door);
  expect(other.blocked).toBe(true);
  expect(other.editing).toBe(cur);
});

test('selecting replaces a clean or new draft', () => {
  expect(nextEditingOnSelect(editingFromDevice(cam1), door).editing).toEqual(
    editingFromDevice(door),
  );
  expect(nextEditingOnSelect(newDraft(), door).editing).toEqual(editingFromDevice(door));
  expect(nextEditingOnSelect(null, door).editing).toEqual(editingFromDevice(door));
});

test('dirty means an existing device differs from its saved version', () => {
  expect(isDirty(null)).toBe(false);
  expect(isDirty(newDraft())).toBe(false);
  const e = editingFromDevice(cam1);
  expect(isDirty(e)).toBe(false);
  expect(isDirty(dirty(e))).toBe(true);
  expect(isDirty({ ...e, draft: { ...e.draft, rangeM: Number.NaN } })).toBe(true);
  expect(isDirty({ ...e, draft: { ...e.draft, position: [1, 4.2, -2] } })).toBe(true);
});

test('a save result replaces only the draft that was sent', () => {
  const cur = newDraft();
  const savedDevice: Device = { ...cam1, id: 'camera-2', name: 'camera-2' };
  const after = editingAfterSave(cur, cur.draft, savedDevice);
  expect(after).toEqual(editingFromDevice(savedDevice));
  expect(isDirty(after)).toBe(false);
  const moved = { ...cur, draft: { ...cur.draft } };
  expect(editingAfterSave(moved, cur.draft, savedDevice)).toBe(moved);
  expect(editingAfterSave(null, cur.draft, savedDevice)).toBeNull();
});

test('releasing the gizmo without moving keeps the draft clean', () => {
  const e = editingFromDevice({ ...cam1, position: [1.23456, 4.1, -2], yawDeg: 359.99 });
  const object = {
    position: new Vector3(1.23456, 4.1, -2),
    quaternion: deviceQuaternion(359.99, -10),
  };
  expect(isDirty({ ...e, draft: draftAfterGizmo(e.draft, object) })).toBe(false);
});

test('releasing the gizmo after a turn writes rounded yaw, pitch and position', () => {
  const object = {
    position: new Vector3(2.00049, 4.1, -2.5),
    quaternion: deviceQuaternion(-90.04, 20.02),
  };
  const next = draftAfterGizmo(cam1, object);
  expect(next).toMatchObject({ position: [2, 4.1, -2.5], yawDeg: 270, pitchDeg: 20 });
  const rolled = deviceQuaternion(45, -10).multiply(
    new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1),
  );
  expect(
    draftAfterGizmo(cam1, { position: new Vector3(...cam1.position), quaternion: rolled }),
  ).toEqual(cam1);
});

test('preview clamps values the form still flags and request bodies drop fov for sensors', () => {
  const p = previewDevice({ ...cam1, hfovDeg: 200, rangeM: Number.NaN, pitchDeg: -120 }, '#new');
  expect(p).toMatchObject({ id: '#new', hfovDeg: 170, rangeM: 10, pitchDeg: -90 });
  expect(patchBody({ ...door, name: ' Door ', hfovDeg: 90 })).toEqual({
    floorId: 'f2',
    type: 'sensor',
    name: 'Door',
    position: [1, 4.1, -2],
    yawDeg: 45,
    pitchDeg: -10,
    hfovDeg: null,
    rangeM: null,
  });
});
