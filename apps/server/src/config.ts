import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

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
    ADMIN_PASSWORD: z.string().min(8),
    SESSION_SECRET: z.string().min(32),
    MAX_MODEL_MB: z.coerce.number().positive().default(500),
    MIGRATIONS_DIR: optional(z.string()),
    WEB_DIST_DIR: optional(z.string()),
    LOG_LEVEL: z.string().default('info'),
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
