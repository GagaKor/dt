import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createTestApp, type TestApp } from './helpers.js';

let dist: string;
let t: TestApp;

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'dt-web-dist-'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>dt</title>');
  await mkdir(join(dist, 'assets'));
  await writeFile(join(dist, 'assets', 'app.js'), 'console.log(1)');
  t = await createTestApp({ config: { WEB_DIST_DIR: dist } });
});

afterAll(async () => {
  await t.close();
  await rm(dist, { recursive: true, force: true });
});

test('GET /sites/x/monitor serves index.html', async () => {
  const res = await t.app.inject({ method: 'GET', url: '/sites/x/monitor' });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toContain('text/html');
  expect(res.body).toContain('<title>dt</title>');
});

test('serves real files and the root page', async () => {
  const js = await t.app.inject({ method: 'GET', url: '/assets/app.js' });
  expect(js.statusCode).toBe(200);
  expect(js.body).toBe('console.log(1)');
  const root = await t.app.inject({ method: 'GET', url: '/' });
  expect(root.body).toContain('<title>dt</title>');
});

test('GET /api/nope stays JSON 404', async () => {
  const res = await t.app.inject({ method: 'GET', url: '/api/nope' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toMatchObject({ code: 'not_found' });
});

test('non-GET unknown routes stay JSON 404', async () => {
  const res = await t.app.inject({ method: 'POST', url: '/sites/x/monitor' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toMatchObject({ code: 'not_found' });
});

test('bare /api and /api?x stay JSON 404', async () => {
  for (const url of ['/api', '/api?x=1']) {
    const res = await t.app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'not_found' });
  }
});

test('repeated deep links emit no listener warnings', async () => {
  const warnings: Error[] = [];
  const onWarning = (w: Error) => warnings.push(w);
  process.on('warning', onWarning);
  for (let i = 0; i < 20; i++) {
    const res = await t.app.inject({ method: 'GET', url: '/sites/x/monitor' });
    expect(res.statusCode).toBe(200);
  }
  await new Promise((r) => setTimeout(r, 50));
  process.off('warning', onWarning);
  expect(warnings.map((w) => w.name)).not.toContain('MaxListenersExceededWarning');
});
