import { sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import { createTestApp } from './helpers.js';

test('health responds ok', async () => {
  const { app, close } = await createTestApp();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok' });
  await close();
});

test('migrations create every table', async () => {
  const { deps, close } = await createTestApp();
  for (const t of ['sites', 'floors', 'devices', 'integration_keys', 'alarms', 'events'])
    await expect(deps.db.execute(sql.raw(`select count(*) from ${t}`))).resolves.toBeTruthy();
  await close();
});

test('database understands named time zones', async () => {
  const { deps, close } = await createTestApp();
  await expect(deps.db.execute(sql`select now() at time zone 'Asia/Seoul'`)).resolves.toBeTruthy();
  await close();
});

test('openapi json and docs are served', async () => {
  const { app, close } = await createTestApp();
  const spec = await app.inject({ method: 'GET', url: '/api/openapi.json' });
  expect(spec.statusCode).toBe(200);
  expect(spec.json().paths['/api/health']).toBeTruthy();
  const docs = await app.inject({ method: 'GET', url: '/api/docs/' });
  expect(docs.statusCode).toBe(200);
  await close();
});

test('errors use the common shape', async () => {
  const { app, close } = await createTestApp();
  const missing = await app.inject({ method: 'GET', url: '/api/nope' });
  expect(missing.statusCode).toBe(404);
  expect(missing.json()).toMatchObject({ code: 'not_found' });
  await close();
});
