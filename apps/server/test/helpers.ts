import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { LocalDiskStorage } from '../src/storage/localDisk.js';

export { runStorageContract } from './storage.contract.js';

const here = dirname(fileURLToPath(import.meta.url));

export function repoPath(...segments: string[]): string {
  return resolve(here, '..', '..', '..', ...segments);
}

export class FakeClock {
  private current: Date;
  constructor(start: Date | string = '2026-01-01T00:00:00.000Z') {
    this.current = new Date(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  set(d: Date | string): void {
    this.current = new Date(d);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface TestApp {
  app: FastifyInstance;
  deps: AppDeps;
  clock: FakeClock;
  close(): Promise<void>;
}

export async function createTestApp(
  opts: {
    config?: Partial<Config>;
    beforeReady?: (app: FastifyInstance) => void | Promise<void>;
  } = {},
): Promise<TestApp> {
  const dir = await mkdtemp(join(tmpdir(), 'dt-test-'));
  const config: Config = {
    ...loadConfig({
      DB_DRIVER: 'pglite',
      ADMIN_PASSWORD: 'test-password',
      SESSION_SECRET: 'test-session-secret-0123456789abcdef',
      STORAGE_LOCAL_DIR: dir,
      LOG_LEVEL: 'silent',
    }),
    ...opts.config,
  };
  const { db, close: closeDb } = await createDb(config);
  const clock = new FakeClock();
  const deps: AppDeps = {
    config,
    db,
    storage: new LocalDiskStorage(dir),
    clock: () => clock.now(),
  };
  const app = await buildApp(deps);
  await opts.beforeReady?.(app);
  await app.ready();
  return {
    app,
    deps,
    clock,
    async close() {
      await app.close();
      await closeDb();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function loginCookie(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'test-password' },
  });
  const c = res.cookies.find((x) => x.name === 'dt_session');
  if (!c) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return `dt_session=${c.value}`;
}
