import { expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { ADMIN_PASSWORD: 'password1', SESSION_SECRET: 'x'.repeat(32), DB_DRIVER: 'pglite' };

test('missing ADMIN_PASSWORD names the variable', () => {
  expect(() => loadConfig({ SESSION_SECRET: 'x'.repeat(32), DB_DRIVER: 'pglite' })).toThrow(
    /ADMIN_PASSWORD/,
  );
});

test('applies defaults', () => {
  const c = loadConfig(base);
  expect(c).toMatchObject({
    PORT: 8080,
    HOST: '0.0.0.0',
    DB_DRIVER: 'pglite',
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_DIR: './data/storage',
    ADMIN_USERNAME: 'admin',
    MAX_MODEL_MB: 500,
    LOG_LEVEL: 'info',
  });
});

test('pg driver requires DATABASE_URL', () => {
  expect(() => loadConfig({ ...base, DB_DRIVER: 'pg' })).toThrow(/DATABASE_URL/);
  expect(loadConfig({ ...base, DB_DRIVER: 'pg', DATABASE_URL: 'postgres://x/y' }).DB_DRIVER).toBe(
    'pg',
  );
});

test('rejects short secrets', () => {
  expect(() => loadConfig({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  expect(() => loadConfig({ ...base, ADMIN_PASSWORD: 'short' })).toThrow(/ADMIN_PASSWORD/);
});

test('parses booleans and numbers from strings', () => {
  const c = loadConfig({ ...base, PORT: '9000', S3_FORCE_PATH_STYLE: 'true', MAX_MODEL_MB: '10' });
  expect(c.PORT).toBe(9000);
  expect(c.S3_FORCE_PATH_STYLE).toBe(true);
  expect(c.MAX_MODEL_MB).toBe(10);
  expect(loadConfig({ ...base, S3_FORCE_PATH_STYLE: 'false' }).S3_FORCE_PATH_STYLE).toBe(false);
});
