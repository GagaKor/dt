import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorage } from '../src/storage/localDisk.js';
import { runStorageContract } from './storage.contract.js';

runStorageContract('local', async () => new LocalDiskStorage(await mkdtemp(join(tmpdir(), 'dt-'))));
