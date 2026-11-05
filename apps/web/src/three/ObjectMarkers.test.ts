import { Vector3 } from 'three';
import { expect, test } from 'vitest';
import { shapeFor } from './ObjectMarkers';

const size = (type: Parameters<typeof shapeFor>[0]) => {
  const { geometry } = shapeFor(type);
  geometry.computeBoundingBox();
  return { box: geometry.boundingBox!, size: geometry.boundingBox!.getSize(new Vector3()) };
};

test('a person is drawn at real proportions: 1.7 m tall, about 0.36 m across', () => {
  const { box, size: s } = size('person');
  expect(s.y).toBeCloseTo(1.7, 2);
  expect(s.x).toBeCloseTo(0.36, 2);
  expect(s.z).toBeCloseTo(0.36, 2);
  // Centred on its half height, so the marker stands on the floor.
  expect(box.min.y).toBeCloseTo(-shapeFor('person').halfHeight, 5);
  expect(shapeFor('person').halfHeight).toBeCloseTo(0.85, 5);
});

test('vehicles keep car proportions', () => {
  const { size: s } = size('vehicle');
  [1.8, 1.4, 4.2].forEach((v, i) => expect(s.getComponent(i)).toBeCloseTo(v, 5));
});
