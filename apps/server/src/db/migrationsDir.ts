import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source files live in apps/server/src/db; the bundle lives in apps/server/dist.
// Only the module's own directory decides, never ancestor directory names.
export function resolveMigrationsDir(moduleUrl: string, override?: string): string {
  if (override) return resolve(override);
  const dir = dirname(fileURLToPath(moduleUrl));
  const inSource = /[\\/]src[\\/]db$/.test(dir);
  return resolve(dir, inSource ? '../../drizzle' : '../drizzle');
}
