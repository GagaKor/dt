import { expect, test } from 'vitest';
import { SEVERITIES, maxSeverity, severityRank } from '../src/index';

test('rank order and max', () => {
  expect(SEVERITIES.map(severityRank)).toEqual([3, 2, 1, 0]);
  expect(maxSeverity('minor', 'critical')).toBe('critical');
});
