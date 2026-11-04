import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export function repoPath(...segments: string[]): string {
  return resolve(root, ...segments);
}
