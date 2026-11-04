import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { SimDevice } from './scenarios';

export function repoPath(...segments: string[]): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', ...segments);
}

export interface SimConfig {
  url: string;
  key: string;
  siteId: string;
  devices: SimDevice[];
}

export function configFile(arg?: string): string {
  return arg ? path.resolve(arg) : repoPath('.sim.json');
}

export function writeConfig(file: string, cfg: SimConfig): void {
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

export function readConfig(file: string): SimConfig {
  if (!existsSync(file)) throw new Error(`${file} not found; run "pnpm sim seed" first`);
  return JSON.parse(readFileSync(file, 'utf8')) as SimConfig;
}
