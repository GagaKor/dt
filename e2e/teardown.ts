import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default function globalTeardown() {
  const port = Number(process.env.E2E_PORT ?? 18080);
  rmSync(join(tmpdir(), `dt-e2e-storage-${port}`), { recursive: true, force: true });
}
