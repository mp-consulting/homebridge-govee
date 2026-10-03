import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CredentialStore } from '../../src/connection/credentials.js';
import { createLog } from '../helpers/hap.js';

const creds = { topic: 't', token: 'tok', accountId: 'acc', endpoint: 'e', iotPass: 'p' };

describe('CredentialStore', () => {
  let dir: string;
  let storage: Map<string, string>;
  const kv = () => ({
    getItem: async (key: string) => storage.get(key),
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  });

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'govee-creds-'));
    storage = new Map();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips credentials and writes the certificate readable by the owner only', async () => {
    const store = new CredentialStore(kv(), 'user@example.com', join(dir, 'govee.pfx'), createLog());

    await store.save(creds, Buffer.from('certificate').toString('base64'));

    expect(await store.load()).toEqual(creds);
    expect((await stat(join(dir, 'govee.pfx'))).mode & 0o777).toBe(0o600);
  });

  it('tightens the permissions of an existing certificate file', async () => {
    await writeFile(join(dir, 'govee.pfx'), 'old', { mode: 0o644 });
    const store = new CredentialStore(kv(), 'user@example.com', join(dir, 'govee.pfx'), createLog());

    await store.save(creds, '');

    expect((await stat(join(dir, 'govee.pfx'))).mode & 0o777).toBe(0o600);
  });

  it('ignores a cache from another user or without its certificate', async () => {
    await new CredentialStore(kv(), 'old@example.com', join(dir, 'govee.pfx'), createLog()).save(creds, '');

    expect(await new CredentialStore(kv(), 'new@example.com', join(dir, 'govee.pfx'), createLog()).load()).toBeUndefined();
    expect(await new CredentialStore(kv(), 'old@example.com', join(dir, 'missing.pfx'), createLog()).load()).toBeUndefined();
  });

  it('forgets cleared credentials', async () => {
    const store = new CredentialStore(kv(), 'user@example.com', join(dir, 'govee.pfx'), createLog());
    await store.save(creds, '');

    await store.clear();

    expect(await store.load()).toBeUndefined();
  });
});
