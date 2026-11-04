import { createHash, randomBytes } from 'node:crypto';
import type { Severity } from '@dt/shared';
import { isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { integrationKeys } from '../db/schema.js';

export const KEY_PREFIX_LENGTH = 12;

export type IntegrationKeyRecord = { id: string; name: string; defaultSeverity: Severity };

export const hashKey = (plaintext: string): string =>
  createHash('sha256').update(plaintext).digest('hex');

export function generateKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `dtk_${randomBytes(32).toString('base64url')}`;
  return { plaintext, hash: hashKey(plaintext), prefix: plaintext.slice(0, KEY_PREFIX_LENGTH) };
}

export class KeyAuthenticator {
  private cache: Map<string, IntegrationKeyRecord> | null = null;
  private loading: Promise<Map<string, IntegrationKeyRecord>> | null = null;
  // A load that started before an invalidate() must not publish its stale snapshot.
  private generation = 0;

  constructor(private readonly db: Db) {}

  async authenticate(authorization: string | undefined): Promise<IntegrationKeyRecord | null> {
    const token = parseBearer(authorization);
    if (!token) return null;
    return (await this.load()).get(hashKey(token)) ?? null;
  }

  invalidate(): void {
    this.generation++;
    this.cache = null;
    this.loading = null;
  }

  private load(): Promise<Map<string, IntegrationKeyRecord>> {
    if (this.cache) return Promise.resolve(this.cache);
    if (this.loading) return this.loading;
    const gen = this.generation;
    const p = this.db
      .select()
      .from(integrationKeys)
      .where(isNull(integrationKeys.revokedAt))
      .then((rows) => {
        const map = new Map<string, IntegrationKeyRecord>();
        for (const r of rows) {
          map.set(r.keyHash, {
            id: r.id,
            name: r.name,
            defaultSeverity: r.defaultSeverity as Severity,
          });
        }
        if (gen === this.generation) {
          this.cache = map;
          this.loading = null;
        }
        return map;
      })
      .catch((err: unknown) => {
        if (gen === this.generation) this.loading = null;
        throw err;
      });
    this.loading = p;
    return p;
  }
}

/** Returns the dtk_ token, or null when the header is absent or malformed. */
export function parseBearer(authorization: string | undefined): string | null {
  if (!authorization) return null;
  // The scheme name is case-insensitive (RFC 7235); the token is not.
  const m = /^(\S+) (dtk_\S+)$/.exec(authorization);
  return m && m[1]!.toLowerCase() === 'bearer' ? m[2]! : null;
}
