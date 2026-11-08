import { randomBytes } from 'node:crypto';
import { Algorithm, Version, hash, verify, parseOptions } from '@node-rs/argon2';
import { WorkPool } from '../../utils/work-pool.js';
import { isSecret, generateCredential } from '../identity/identity.js';
import { invalidRequest, unavailable } from '../../utils/errors.js';

export const ARGON_POLICY = Object.freeze({
  algorithm: Algorithm.Argon2id, version: Version.V0x13,
  memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32,
});
const processPool = new WorkPool();

export class CredentialHasher {
  #dummy;
  constructor({ pool = processPool } = {}) { this.pool = pool; }

  async hash(credential) {
    if (!isSecret(credential)) throw invalidRequest();
    return this.pool.run(() => hash(credential, { ...ARGON_POLICY, salt: randomBytes(16) }));
  }

  async verify(verifier, credential) {
    if (!isSecret(credential)) return false;
    let parameters;
    try { parameters = parseOptions(verifier); } catch { throw unavailable(); }
    // Stored PHC is server-owned; reject corruption/unbounded costs before native work.
    if (Object.entries(ARGON_POLICY).some(([key, value]) => parameters[key] !== value) || parameters.saltLen !== 16) throw unavailable();
    return this.pool.run(() => verify(verifier, credential));
  }

  dummyVerifier() {
    // Lazy: importing app does not create credentials or launch native hashing jobs.
    if (!this.#dummy) {
      this.#dummy = this.hash(generateCredential()).catch(error => { this.#dummy = undefined; throw error; });
    }
    return this.#dummy;
  }
}
