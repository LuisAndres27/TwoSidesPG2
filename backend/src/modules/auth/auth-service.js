import { createHash } from 'node:crypto';
import { ApiError } from '../../utils/errors.js';
import { generateCredential, isSecret, publicIdentity } from '../identity/identity.js';
import { RATE_POLICY } from '../../middleware/rate-limiter.js';

export const hashToken = token => createHash('sha256').update(token, 'ascii').digest('hex');

export class AuthService {
  constructor({ repository, hasher, limiter, policy = RATE_POLICY }) {
    Object.assign(this, { repository, hasher, limiter, policy });
  }

  #creationQuota(ip) {
    const p = this.policy;
    this.limiter.check(`create:${ip}`, p.creationsPerIp, p.creationWindow);
    this.limiter.check('create:global', p.creationsGlobal, p.creationWindow);
    this.limiter.consume(`create:${ip}`, p.creationsPerIp, p.creationWindow);
    this.limiter.consume('create:global', p.creationsGlobal, p.creationWindow);
  }

  async register({ registrationId, credential, installationId, localPlayerId, bindingGeneration }, ip) {
    let record = await this.repository.findRegistration(registrationId);
    let created = false;
    if (!record) {
      const verifier = await this.hasher.hash(credential);
      const result = await this.repository.createIfAbsent(registrationId, verifier, () => this.#creationQuota(ip),
        installationId ? { installationId, localPlayerId, bindingGeneration } : undefined);
      ({ record, created } = result);
    }
    if (!record.active || (installationId && (record.installationId !== installationId || record.localPlayerId !== localPlayerId ||
        record.bindingGeneration !== bindingGeneration)) || (!created && !await this.hasher.verify(record.credentialVerifier, credential))) {
      throw new ApiError(409, 'registration_conflict');
    }
    return {
      status: created ? 201 : 200,
      body: { ...publicIdentity(record), registrationId, registrationStatus: 'REGISTERED' },
    };
  }

  async session({ technicalAccountId, credential, installationId, localPlayerId }, ip) {
    const p = this.policy;
    const failureKey = `failure:${ip}:${technicalAccountId}`;
    this.limiter.check(failureKey, p.sessionFailures, p.failureWindow);
    const dummy = await this.hasher.dummyVerifier();
    const account = await this.repository.findAccount(technicalAccountId);
    const verified = await this.hasher.verify(account?.active ? account.credentialVerifier : dummy, credential);
    if (!account?.active || !verified || (installationId && (account.installationId !== installationId || account.localPlayerId !== localPlayerId))) {
      this.limiter.consume(failureKey, p.sessionFailures, p.failureWindow);
      throw new ApiError(401, 'authentication_failed');
    }
    const token = generateCredential();
    const session = await this.repository.createSession(account, hashToken(token));
    if (!session) throw new ApiError(401, 'authentication_failed');
    this.limiter.clear(failureKey);
    return {
      schemaVersion: 1, technicalAccountId: account.technicalAccountId,
      authStatus: 'AUTHENTICATED', tokenType: 'Bearer', accessToken: token, expiresIn: 900,
    };
  }

  authenticate(token) {
    if (!isSecret(token)) throw new ApiError(401, 'authentication_required');
    const digest = hashToken(token);
    const session = this.repository.findSession(digest);
    if (!session) throw new ApiError(401, 'authentication_required');
    return { account: this.repository.findAccount(session.technicalAccountId), session, digest };
  }
}
