import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import type { Config } from '../config.js';
import { resolveMigrationsDir } from './migrationsDir.js';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export async function createDb(cfg: Config): Promise<{ db: Db; close(): Promise<void> }> {
  const migrationsFolder = resolveMigrationsDir(import.meta.url, cfg.MIGRATIONS_DIR);
  if (cfg.DB_DRIVER === 'pglite') {
    const client = new PGlite(cfg.PGLITE_DIR);
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    return { db, close: () => client.close() };
  }
  const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL });
  const db = drizzlePg(pool, { schema });
  try {
    await migratePg(db, { migrationsFolder });
  } catch (err) {
    await pool.end();
    throw err;
  }
  return { db, close: () => pool.end() };
}
