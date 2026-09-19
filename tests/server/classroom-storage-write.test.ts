import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classroom-storage-write-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('writeJsonFileAtomic', () => {
  it('creates a nested json file', async () => {
    const filePath = path.join(tmpDir, 'jobs', 'abc.json');
    await writeJsonFileAtomic(filePath, { id: 'abc', status: 'queued' });
    const body = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(body).toEqual({ id: 'abc', status: 'queued' });
  });

  it('replaces an existing file in place', async () => {
    const filePath = path.join(tmpDir, 'job.json');
    await writeJsonFileAtomic(filePath, { n: 1 });
    await writeJsonFileAtomic(filePath, { n: 2, extra: true });
    const body = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(body).toEqual({ n: 2, extra: true });
    const leftovers = (await fs.readdir(tmpDir)).filter((name) => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });
});
