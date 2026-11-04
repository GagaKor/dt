import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = Number(process.env.E2E_PORT ?? 18080);
const storageDir = mkdtempSync(join(tmpdir(), 'dt-e2e-storage-'));

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: join(root, 'test-results'),
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  webServer: {
    command:
      'pnpm --filter @dt/web build && pnpm --filter @dt/server build && node apps/server/dist/main.js',
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_E2E: '1',
      PORT: String(port),
      HOST: '127.0.0.1',
      DB_DRIVER: 'pglite',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_DIR: storageDir,
      ADMIN_PASSWORD: 'e2e-password-123',
      SESSION_SECRET: 'e2e-session-secret-0123456789abcdef',
      WEB_DIST_DIR: join(root, 'apps/web/dist'),
      LOG_LEVEL: 'warn',
    },
  },
});
