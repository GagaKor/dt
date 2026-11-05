import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { expect, test } from 'vitest';
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

test('every ray stops just short of where the occluder blocks it', () => {
  // 2 cm short, so the drawn range does not flicker against the wall or floor it reaches.
  const wall: Occluder = { distance: (_o, _d, far) => Math.min(3, far) };
  const { surface } = viewshedGeometry({ hfovDeg: 90, rangeM: 10, ...pose, occluder: wall });
  farPoints(surface).forEach((p) => expect(p.length()).toBeCloseTo(2.98));
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

function wallAt(z: number, material: Material = new MeshBasicMaterial()): Mesh {
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
  expect(at(surface, 8).z).toBeCloseTo(-2.98, 3);
});

test('distances are in model metres under scaled parents', () => {
  // A model authored in centimetres: the wall sits 500 cm (5 m) away.
  const root = new Group();
  root.scale.setScalar(0.01);
  const wall = new Mesh(new BoxGeometry(1000, 1000, 20), new MeshBasicMaterial());
  wall.position.z = -500;
  root.add(wall);
  expect(createOccluder(root).distance(new Vector3(), new Vector3(0, 0, -1), 20)).toBeCloseTo(4.9);
});

test('a camera right against a wall does not see through it into the next room', () => {
  // Front face 3 cm away (the mounting surface), back face at 23 cm, next room's wall at 5 m.
  const thick = new Mesh(new BoxGeometry(10, 10, 0.2), new MeshBasicMaterial());
  thick.position.z = -0.13;
  const occluder = createOccluder(new Group().add(thick, wallAt(-5)));
  expect(occluder.distance(new Vector3(), new Vector3(0, 0, -1), 20)).toBeCloseTo(0.23);
});

test('instanced meshes block the view at each instance', () => {
  const walls = new InstancedMesh(new BoxGeometry(10, 10, 0.2), new MeshBasicMaterial(), 1);
  walls.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, -6));
  const occluder = createOccluder(new Group().add(walls));
  expect(occluder.distance(new Vector3(), new Vector3(0, 0, -1), 20)).toBeCloseTo(5.9);
});

test('transmissive glass does not block the view, nor do glass parts of a mesh', () => {
  const transmissive = wallAt(-2, new MeshPhysicalMaterial({ transmission: 1 }));
  const front = new PlaneGeometry(10, 10).translate(0, 0, -3);
  const back = new PlaneGeometry(10, 10).translate(0, 0, -5);
  const mixed = new Mesh(mergeGeometries([front, back], true)!, [
    new MeshBasicMaterial({ transparent: true, opacity: 0.3 }),
    new MeshBasicMaterial(),
  ]);
  const occluder = createOccluder(new Group().add(transmissive, mixed));
  expect(occluder.distance(new Vector3(), new Vector3(0, 0, -1), 20)).toBeCloseTo(5);
});
