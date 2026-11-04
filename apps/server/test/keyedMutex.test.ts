import { setTimeout as sleep } from 'node:timers/promises';
import { expect, test } from 'vitest';
import { KeyedMutex } from '../src/lib/keyedMutex.js';

test('same key runs serially, other keys run concurrently, map empties', async () => {
  const m = new KeyedMutex();
  const log: string[] = [];
  const job = (k: string, n: string, ms: number) =>
    m.run(k, async () => {
      log.push(`s${n}`);
      await sleep(ms);
      log.push(`e${n}`);
    });
  await Promise.all([job('a', '1', 30), job('a', '2', 0), job('b', '3', 0)]);
  expect(log.indexOf('e1')).toBeLessThan(log.indexOf('s2'));
  expect(log.indexOf('s3')).toBeLessThan(log.indexOf('e1'));
  expect(m.size).toBe(0);
});

test('a rejected job does not block the next job on the same key', async () => {
  const m = new KeyedMutex();
  const failing = m.run('a', async () => {
    throw new Error('boom');
  });
  const next = m.run('a', async () => 'ok');
  await expect(failing).rejects.toThrow('boom');
  await expect(next).resolves.toBe('ok');
  await sleep(0);
  expect(m.size).toBe(0);
});
