import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { generateKey } from '../src/keys/keyAuth.js';
import { createTestApp, loginCookie, type TestApp } from './helpers.js';

let t: TestApp;
let cookie: string;
beforeEach(async () => {
  t = await createTestApp({
    beforeReady: (app) => {
      app.get('/test/whoami', { preHandler: app.requireIntegrationKey }, async (req) => ({
        name: req.integrationKey?.name,
        defaultSeverity: req.integrationKey?.defaultSeverity,
      }));
    },
  });
  cookie = await loginCookie(t.app);
});
afterEach(() => t.close());

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { cookie }, payload: payload as object });

const whoami = (authorization?: string) =>
  t.app.inject({
    method: 'GET',
    url: '/test/whoami',
    headers: authorization ? { authorization } : {},
  });

const create = async (payload: Record<string, unknown> = { name: 'Sensor Hub' }) =>
  (await call('POST', '/api/integration-keys', payload)).json() as {
    id: string;
    key: string;
    prefix: string;
    defaultSeverity: string;
  };

describe('generateKey', () => {
  test('has dtk_ prefix, sha256 hex hash and 12 char prefix', () => {
    const k = generateKey();
    expect(k.plaintext).toMatch(/^dtk_[A-Za-z0-9_-]{43}$/);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.prefix).toBe(k.plaintext.slice(0, 12));
  });
});

describe('integration keys API', () => {
  test('requires admin', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/integration-keys' });
    expect(res.statusCode).toBe(401);
  });

  test('create returns plaintext once with dtk_ prefix', async () => {
    const res = await call('POST', '/api/integration-keys', { name: 'Sensor Hub' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.key).toMatch(/^dtk_/);
    expect(body.prefix).toBe(body.key.slice(0, 12));
    expect(body.revokedAt).toBeNull();
  });

  test('list never exposes plaintext or hash', async () => {
    const k = await create();
    const res = await call('GET', '/api/integration-keys');
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(k.key);
    expect(res.body).not.toMatch(/hash|"key"/i);
    expect(res.json()).toHaveLength(1);
  });

  test('default severity starts critical and can be set to minor', async () => {
    const k = await create();
    expect(k.defaultSeverity).toBe('critical');
    const m = await create({ name: 'Other', defaultSeverity: 'minor' });
    expect(m.defaultSeverity).toBe('minor');
    const res = await call('PATCH', `/api/integration-keys/${k.id}`, { defaultSeverity: 'minor' });
    expect(res.statusCode).toBe(200);
    expect(res.json().defaultSeverity).toBe('minor');
  });

  test('invalid severity → 400', async () => {
    const res = await call('POST', '/api/integration-keys', { name: 'x', defaultSeverity: 'huge' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_error');
  });

  test('patch/delete unknown id → 404', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await call('PATCH', `/api/integration-keys/${id}`, { name: 'x' })).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/api/integration-keys/${id}`)).statusCode).toBe(404);
  });
});

describe('bearer auth', () => {
  test('missing header → 401 missing_key', async () => {
    for (const h of [undefined, 'Basic abc', 'Bearer ', 'Bearer notdtk_abc']) {
      const res = await whoami(h);
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('missing_key');
    }
  });

  test('unknown key → 401 invalid_key', async () => {
    const res = await whoami(`Bearer ${generateKey().plaintext}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('invalid_key');
  });

  test('valid key → key name', async () => {
    const k = await create({ name: 'Sensor Hub' });
    const res = await whoami(`Bearer ${k.key}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'Sensor Hub', defaultSeverity: 'critical' });
  });

  test('patch is visible to the next request', async () => {
    const k = await create();
    await whoami(`Bearer ${k.key}`);
    await call('PATCH', `/api/integration-keys/${k.id}`, {
      name: 'Renamed',
      defaultSeverity: 'info',
    });
    expect((await whoami(`Bearer ${k.key}`)).json()).toEqual({
      name: 'Renamed',
      defaultSeverity: 'info',
    });
  });

  test('revoked key → 401 invalid_key immediately', async () => {
    const k = await create();
    expect((await whoami(`Bearer ${k.key}`)).statusCode).toBe(200);
    const del = await call('DELETE', `/api/integration-keys/${k.id}`);
    expect(del.statusCode).toBe(204);
    const res = await whoami(`Bearer ${k.key}`);
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('invalid_key');
    const list = (await call('GET', '/api/integration-keys')).json();
    expect(list[0].revokedAt).not.toBeNull();
  });
});
