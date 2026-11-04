import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
  type BufferGeometry,
  type EventDispatcher,
} from 'three';
import { expect, test } from 'vitest';
import { isModelReleased, releaseModel, retainModel } from './modelLifetime';

function counted<T extends EventDispatcher<{ dispose: object }>>(target: T) {
  const c = { target, n: 0 };
  target.addEventListener('dispose', () => c.n++);
  return c;
}

function model() {
  const texture = counted(new Texture());
  const material = counted(new MeshStandardMaterial({ map: texture.target }));
  const geometry = counted<BufferGeometry>(new BoxGeometry());
  const scene = new Group();
  scene.add(new Mesh(geometry.target, material.target));
  scene.add(new Mesh(geometry.target, material.target));
  return { scene, texture, material, geometry };
}

test('release disposes at once when nothing renders the model', () => {
  const m = model();
  releaseModel(m.scene);
  expect(isModelReleased(m.scene)).toBe(true);
  expect([m.geometry.n, m.material.n, m.texture.n]).toEqual([1, 1, 1]);
});

test('release waits until the last renderer lets go, then disposes once', () => {
  const m = model();
  const dropA = retainModel(m.scene);
  const dropB = retainModel(m.scene);
  releaseModel(m.scene);
  expect(m.geometry.n).toBe(0);
  dropA();
  expect(m.geometry.n).toBe(0);
  dropB();
  expect([m.geometry.n, m.material.n, m.texture.n]).toEqual([1, 1, 1]);
  dropB();
  releaseModel(m.scene);
  expect([m.geometry.n, m.material.n, m.texture.n]).toEqual([1, 1, 1]);
});

test('a model that is still owned is never disposed by renderers', () => {
  const m = model();
  retainModel(m.scene)();
  expect(isModelReleased(m.scene)).toBe(false);
  expect(m.geometry.n).toBe(0);
});

test('a model drawn again after disposal is freed again when dropped', () => {
  const m = model();
  releaseModel(m.scene);
  const drop = retainModel(m.scene);
  expect(m.geometry.n).toBe(1);
  drop();
  expect(m.geometry.n).toBe(2);
});
