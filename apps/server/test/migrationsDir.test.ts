import { expect, test } from 'vitest';
import { resolveMigrationsDir } from '../src/db/migrationsDir.js';

test('dev path under src/db resolves to apps/server/drizzle', () => {
  expect(resolveMigrationsDir('file:///repo/apps/server/src/db/migrationsDir.ts')).toBe(
    '/repo/apps/server/drizzle',
  );
});

test('dist path whose ancestors contain /src/ still resolves next to dist', () => {
  expect(resolveMigrationsDir('file:///home/u/src/dt/apps/server/dist/main.js')).toBe(
    '/home/u/src/dt/apps/server/drizzle',
  );
});

test('override wins', () => {
  expect(resolveMigrationsDir('file:///app/dist/main.js', '/opt/migrations')).toBe(
    '/opt/migrations',
  );
});
