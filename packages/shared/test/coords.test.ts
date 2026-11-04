import { expect, test } from 'vitest';
import { modelToPlan, planToModel } from '../src/index';

test('plan y is negative model Z', () => {
  expect(planToModel({ x: 3, y: 5 })).toEqual({ X: 3, Z: -5 });
  expect(modelToPlan(planToModel({ x: -2, y: 7 }))).toEqual({ x: -2, y: 7 });
});
