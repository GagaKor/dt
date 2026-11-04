import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { buildApp } from './app.js';
import { LocalDiskStorage } from './storage/localDisk.js';

async function main() {
  const config = loadConfig(process.env);
  if (config.STORAGE_DRIVER !== 'local')
    throw new Error('STORAGE_DRIVER=s3 is not implemented yet');
  const { db, close } = await createDb(config);
  const app = await buildApp({
    config,
    db,
    storage: new LocalDiskStorage(config.STORAGE_LOCAL_DIR),
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
