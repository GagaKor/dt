import {
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { expect, test } from 'vitest';
import './bvh';
import { deviceQuaternion, forwardVector } from './devicePose';
import { createOccluder, viewshedGeometry, type Occluder } from './viewshed';

const at = (g: BufferGeometry, i: number) => {
  const p = g.getAttribute('position');
  return new Vector3(p.getX(i), p.getY(i), p.getZ(i));
};
/** Far-surface vertices: everything after the apex. */
const farPoints = (g: BufferGeometry) =>
  Array.from({ length: g.getAttribute('position').count - 1 }, (_, i) => at(g, i + 1));

const pose = { position: [0, 0, 0] as const, quaternion: new Quaternion() };

test('without an occluder the far surface is the base of the viewing pyramid', () => {
  const { surface } = viewshedGeometry({ hfovDeg: 90, rangeM: 10, ...pose, occluder: null });
  expect(at(surface, 0).toArray()).toEqual([0, 0, 0]);
  const far = farPoints(surface);
  far.forEach((p) => expect(p.z).toBeCloseTo(-10));
  expect(Math.max(...far.map((p) => Math.abs(p.x)))).toBeCloseTo(10);
  expect(Math.max(...far.map((p) => Math.abs(p.y)))).toBeCloseTo(5.625);
});

test('every ray stops where the occluder blocks it', () => {
  const wall: Occluder = { distance: (_o, _d, far) => Math.min(3, far) };
  const { surface } = viewshedGeometry({ hfovDeg: 90, rangeM: 10, ...pose, occluder: wall });
  farPoints(surface).forEach((p) => expect(p.length()).toBeCloseTo(3));
});

test('rays are cast in model space from the device position along its facing', () => {
  const calls: { origin: Vector3; direction: Vector3 }[] = [];
  const spy: Occluder = {
    distance: (origin, direction) => {
      calls.push({ origin: origin.clone(), direction: direction.clone() });
      return null;
    },
  };
  viewshedGeometry({
    hfovDeg: 60,
    rangeM: 8,
    position: [1, 2, 3],
    quaternion: deviceQuaternion(90, -20),
    occluder: spy,
    cols: 4,
    rows: 2,
  });
  calls.forEach((c) => expect(c.origin.toArray()).toEqual([1, 2, 3]));
  // Row-major from the top-left; the middle sample of a 5 x 3 grid looks straight ahead.
  const ahead = forwardVector(90, -20);
  expect(calls[7]!.direction.angleTo(ahead)).toBeCloseTo(0, 5);
});

test('the outline traces the apex edges and the far boundary', () => {
  const { outline } = viewshedGeometry({
    hfovDeg: 90,
    rangeM: 10,
    ...pose,
    occluder: null,
    cols: 4,
    rows: 2,
  });
  // 4 apex-to-corner edges + a 12-segment loop around a 5 x 3 grid, two points per segment.
  expect(outline.getAttribute('position').count).toBe((4 + 12) * 2);
});

function wallAt(z: number, material = new MeshBasicMaterial()): Mesh {
  const wall = new Mesh(new BoxGeometry(10, 10, 0.2), material);
  wall.position.set(0, 0, z);
  return wall;
}

test('the occluder finds the nearest opaque surface and respects the far limit', () => {
  const root = new Group().add(wallAt(-5));
  const occluder = createOccluder(root);
  const ahead = new Vector3(0, 0, -1);
  expect(occluder.distance(new Vector3(), ahead, 20)).toBeCloseTo(4.9);
  expect(occluder.distance(new Vector3(), ahead, 4)).toBeNull();
  expect(occluder.distance(new Vector3(), new Vector3(0, 0, 1), 20)).toBeNull();
});

test('glass and hidden meshes do not block the view', () => {
  const glass = wallAt(-2, new MeshBasicMaterial({ transparent: true, opacity: 0.3 }));
  const hidden = wallAt(-1);
  hidden.visible = false;
  const root = new Group().add(wallAt(-5), glass, hidden);
  expect(createOccluder(root).distance(new Vector3(), new Vector3(0, 0, -1), 20)).toBeCloseTo(4.9);
});

test('single-sided surfaces block the view from behind too', () => {
  // A plane faces +Z by default; turned around, the camera at the origin sees its back.
  const plane = new Mesh(new PlaneGeometry(10, 10), new MeshBasicMaterial());
  plane.rotation.y = Math.PI;
  plane.position.z = -3;
  expect(plane.material.side).not.toBe(DoubleSide);
  const occluder = createOccluder(new Group().add(plane));
  expect(occluder.distance(new Vector3(), new Vector3(0, 0, -1), 20)).toBeCloseTo(3);
});

test('a camera looking straight down sees the floor 3 m below', () => {
  const slab = new Mesh(new BoxGeometry(40, 0.2, 20), new MeshBasicMaterial());
  slab.position.y = -0.1;
  const { surface } = viewshedGeometry({
    hfovDeg: 60,
    rangeM: 10,
    position: [0, 3, 0],
    quaternion: deviceQuaternion(0, -90),
    occluder: createOccluder(new Group().add(slab)),
    cols: 4,
    rows: 2,
  });
  // Middle sample of the 5 x 3 grid (vertex 1 + 7) points along the device's -Z.
  expect(at(surface, 8).z).toBeCloseTo(-3, 3);
});
