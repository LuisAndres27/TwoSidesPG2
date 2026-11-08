import fs from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { assertNotProduction } from '../../../src/config/jwt.js';
import { unavailable, ApiError } from '../../../src/utils/errors.js';

// TEST ONLY. Master encryption key is injected over IPC/RAM, never stored with data.
export class EncryptedStore {
  constructor({ directory, name, masterKey, synthetic }) {
    assertNotProduction();
    if (synthetic !== true || !path.isAbsolute(directory) || !['identities', 'keys', 'ingestion', 'coordination'].includes(name) ||
        !(masterKey instanceof Uint8Array) || masterKey.length !== 32) throw new Error('Invalid synthetic storage configuration');
    const privateParent = process.env.LOCALAPPDATA && path.resolve(process.env.LOCALAPPDATA, 'TwoSides');
    if (!privateParent || path.dirname(path.resolve(directory)).toLowerCase() !== privateParent.toLowerCase() ||
        !/^identity-d2-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(path.basename(directory)))
      throw new Error('Out of scope synthetic storage directory');
    this.directory = directory; this.file = path.join(directory, name + '.bin');
    this.lock = path.join(directory, name + '.lock'); this.key = Buffer.from(masterKey); this.name = name;
  }
  async check(file, missing = false) {
    try {
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || (!stat.isFile() && file !== this.directory) || (stat.isFile() && stat.nlink !== 1))
        throw unavailable();
      if (file === this.directory && !stat.isDirectory()) throw unavailable();
      if (stat.isFile() && stat.size > 4 * 1024 * 1024) throw unavailable();
    } catch (error) { if (!(missing && error.code === 'ENOENT')) throw error; }
  }
  async load() {
    await this.check(this.directory); await this.check(this.file);
    const blob = JSON.parse(await fs.readFile(this.file, 'utf8'));
    if (blob.version !== 1 || !['iv', 'tag', 'data'].every(k => typeof blob[k] === 'string')) throw unavailable();
    const decrypt = createDecipheriv('aes-256-gcm', this.key, Buffer.from(blob.iv, 'base64'));
    decrypt.setAAD(Buffer.from('two-sides-synthetic:' + this.name));
    decrypt.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return JSON.parse(Buffer.concat([decrypt.update(Buffer.from(blob.data, 'base64')), decrypt.final()]).toString('utf8'));
  }
  async commit(value) {
    await this.check(this.file, true);
    const iv = randomBytes(12), encrypt = createCipheriv('aes-256-gcm', this.key, iv);
    encrypt.setAAD(Buffer.from('two-sides-synthetic:' + this.name));
    const ciphertext = Buffer.concat([encrypt.update(JSON.stringify(value), 'utf8'), encrypt.final()]);
    const blob = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: encrypt.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
    const temporary = path.join(this.directory, this.name + '-' + randomUUID() + '.pending');
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(blob); await handle.sync(); await handle.close(); handle = null;
      await fs.rename(temporary, this.file); // Commit point: old or complete new authenticated snapshot.
    } finally {
      await handle?.close();
      await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  async exclusive(operation) {
    let handle;
    try {
      await this.check(this.directory);
      handle = await fs.open(this.lock, 'wx', 0o600);
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw unavailable();
    } finally {
      if (handle) { await handle.close(); await fs.unlink(this.lock); }
    }
  }
  async initialize(value) {
    return this.exclusive(async () => {
      try { await fs.lstat(this.file); throw unavailable(); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await this.commit(value);
    });
  }
}

