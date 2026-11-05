import { isIP } from 'node:net';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

// Example values once shipped in .env.example. They are public, so a server using them
// would accept session cookies forged by anyone.
const PLACEHOLDERS = new Set([
  'change-me-please',
  'replace-this-placeholder-with-32-or-more-random-chars',
]);
const secret = (minLength: number, hint: string) =>
  z
    .string()
    .min(minLength)
    .refine((v) => !PLACEHOLDERS.has(v), `is a public placeholder from .env.example; ${hint}`);

// Named ranges understood by Fastify's proxy-addr.
const PROXY_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isProxyAddress(entry: string): boolean {
  if (PROXY_RANGES.has(entry)) return true;
  const [ip = '', bits, ...rest] = entry.split('/');
  const family = isIP(ip);
  if (family === 0 || rest.length > 0) return false;
  if (bits === undefined) return true;
  // Prefix length only (no netmask form); proxy-addr rejects /0.
  return /^\d{1,3}$/.test(bits) && Number(bits) >= 1 && Number(bits) <= (family === 4 ? 32 : 128);
}

// Fastify `trustProxy`: true, false, or comma-separated proxy addresses/CIDRs/named ranges.
// Checked here so a typo fails with the variable's name instead of deep inside Fastify.
// Only set it when a reverse proxy is the sole way to reach the app, or X-Forwarded-* is spoofable.
const trustProxy = z
  .string()
  .transform((v, ctx): boolean | string => {
    const s = v.trim();
    const word = s.toLowerCase();
    if (s === '' || word === 'false' || s === '0') return false;
    if (word === 'true' || s === '1') return true;
    const entries = s.split(',').map((p) => p.trim());
    const bad = entries.filter((e) => !isProxyAddress(e));
    if (bad.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `must be true, false, or proxy IP addresses/CIDRs (invalid: ${bad.map((b) => JSON.stringify(b)).join(', ')})`,
      });
      return z.NEVER;
    }
    return entries.join(',');
  })
  .default(false);

const schema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    HOST: z.string().default('0.0.0.0'),
    DB_DRIVER: z.enum(['pg', 'pglite']).default('pg'),
    DATABASE_URL: optional(z.string()),
    PGLITE_DIR: optional(z.string()),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./data/storage'),
    S3_ENDPOINT: optional(z.string()),
    S3_REGION: optional(z.string()),
    S3_BUCKET: optional(z.string()),
    S3_ACCESS_KEY_ID: optional(z.string()),
    S3_SECRET_ACCESS_KEY: optional(z.string()),
    S3_FORCE_PATH_STYLE: optional(bool),
    ADMIN_USERNAME: z.string().min(1).default('admin'),
    ADMIN_PASSWORD: secret(8, 'set your own password'),
    SESSION_SECRET: secret(32, 'set a random value, e.g. from `openssl rand -base64 48`'),
    MAX_MODEL_MB: z.coerce.number().positive().default(500),
    MIGRATIONS_DIR: optional(z.string()),
    WEB_DIST_DIR: optional(z.string()),
    LOG_LEVEL: z.string().default('info'),
    TRUST_PROXY: trustProxy,
  })
  .superRefine((c, ctx) => {
    if (c.DB_DRIVER === 'pg' && !c.DATABASE_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required when DB_DRIVER=pg',
      });
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
