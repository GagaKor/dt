import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { buildApp } from './app.js';
import { LocalDiskStorage } from './storage/localDisk.js';
import { S3Storage } from './storage/s3.js';
import type { Config } from './config.js';
import type { ObjectStorage } from './storage/types.js';

function createStorage(config: Config): ObjectStorage {
  if (config.STORAGE_DRIVER === 'local') return new LocalDiskStorage(config.STORAGE_LOCAL_DIR);
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = config;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    throw new Error(
      'STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
    );
  return new S3Storage({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION ?? 'us-east-1',
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    forcePathStyle: config.S3_FORCE_PATH_STYLE ?? false,
  });
}

async function main() {
  const config = loadConfig(process.env);
  const storage = createStorage(config);
  const { db, close } = await createDb(config);
  const app = await buildApp({
    config,
    db,
    storage,
    clock: () => new Date(),
  });
  const shutdown = async () => {
    await app.close();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
