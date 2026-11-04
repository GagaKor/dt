import { describe } from 'vitest';
import { S3Storage } from '../src/storage/s3.js';
import { runStorageContract } from './storage.contract.js';

const env = process.env;

describe.skipIf(!env.S3_TEST_ENDPOINT)('s3 storage (needs S3_TEST_ENDPOINT)', () => {
  runStorageContract(
    's3',
    async () =>
      new S3Storage({
        endpoint: env.S3_TEST_ENDPOINT,
        region: env.S3_TEST_REGION ?? 'us-east-1',
        bucket: env.S3_TEST_BUCKET ?? 'dt-data',
        accessKeyId: env.S3_TEST_ACCESS_KEY_ID ?? 'dtminio',
        secretAccessKey: env.S3_TEST_SECRET_ACCESS_KEY ?? 'dtminio-secret',
        forcePathStyle: true,
      }),
  );
});
