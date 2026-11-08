import { generateKeyPair, exportPKCS8, exportSPKI, importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';
import { randomUUID, createHash } from 'node:crypto';
import { EncryptedStore } from './encrypted-store.js';
import { validateJwtConfig } from '../../../src/config/jwt.js';
import { unavailable } from '../../../src/utils/errors.js';

// Explicit initialization only. load() NEVER generates replacements.
export class SyntheticKeyProvider {
  constructor(options) { this.store = new EncryptedStore({ ...options, name: 'keys' }); }
  async initialize() {
    const pair = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true });
    await this.store.initialize({ version: 1, kid: 'synthetic-' + randomUUID(),
      privatePem: await exportPKCS8(pair.privateKey), publicPem: await exportSPKI(pair.publicKey) });
  }
  async load() {
    try {
      const value = await this.store.load();
      if (value.version !== 1 || typeof value.kid !== 'string') throw unavailable();
      const privateKey = await importPKCS8(value.privatePem, 'RS256');
      const publicKey = await importSPKI(value.publicPem, 'RS256');
      const config = validateJwtConfig({ privateKey, publicKey, keyId: value.kid, mode: 'isolated-test',
        algorithm: 'RS256', issuer: 'https://two-sides.test.invalid', audience: 'two-sides-isolated-api' });
      const challenge = randomUUID();
      const token = await new SignJWT({ challenge }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
      const verified = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
      if (verified.payload.challenge !== challenge) throw unavailable();
      return { ...config, publicFingerprint: createHash('sha256').update(value.publicPem).digest('hex') };
    } catch { throw unavailable(); }
  }
}

