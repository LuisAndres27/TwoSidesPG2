import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, unavailable } from '../../../src/utils/errors.js';
import { assertNotProduction } from '../../../src/config/jwt.js';
import { EncryptedStore } from './encrypted-store.js';

const uuid = z.string().uuid();
const epoch = z.number().int().safe().positive();
const accountSchema = z.strictObject({
  technicalAccountId: uuid, registrationId: uuid, installationId: uuid, localPlayerId: uuid,
  bindingGeneration: epoch, authzVersion: epoch, credentialVersion: epoch,
  credentialVerifier: z.string().startsWith('$argon2id$').max(512), active: z.boolean(),
  role: z.literal('player'), createdAt: z.string(), updatedAt: z.string(),
  credentialExpiresAt: z.number().int().safe().nullable(),
});
const sessionSchema = z.strictObject({
  sessionId: uuid, technicalAccountId: uuid, tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  credentialVersion: epoch, installationId: uuid, localPlayerId: uuid, bindingGeneration: epoch,
  authzVersion: epoch, createdAt: z.number().safe(), expiresAt: z.number().safe(), revoked: z.boolean(),
});
const snapshotSchema = z.strictObject({ version: z.literal(1), accounts: z.array(accountSchema).max(1000), sessions: z.array(sessionSchema).max(3000) });
function validate(state) {
  const parsed = snapshotSchema.parse(state);
  for (const key of ['technicalAccountId', 'registrationId']) {
    if (new Set(parsed.accounts.map(a => a[key])).size !== parsed.accounts.length) throw unavailable();
  }
  if (new Set(parsed.accounts.map(a => a.installationId + ':' + a.localPlayerId)).size !== parsed.accounts.length ||
      new Set(parsed.sessions.map(s => s.sessionId)).size !== parsed.sessions.length ||
      new Set(parsed.sessions.map(s => s.tokenHash)).size !== parsed.sessions.length ||
      parsed.sessions.some(s => !parsed.accounts.some(a => a.technicalAccountId === s.technicalAccountId))) throw unavailable();
  return parsed;
}
const empty = () => ({ version: 1, accounts: [], sessions: [] });

// Same async port for memory fake and durable encrypted file. Not MongoDB.
export class SyntheticIdentityRepository {
  constructor({ store, now = Date.now, synthetic = false, beforeCommit = () => {}, coordinator } = {}) {
    assertNotProduction();
    if (synthetic !== true) throw new Error('Synthetic repository requires explicit capability');
    this.store = store; this.now = now; this.beforeCommit = beforeCommit; this.state = empty(); this.coordinator = coordinator;
  }
  static async open(options) {
    const store = new EncryptedStore({ ...options, name: 'identities' });
    if (options.initialize) await store.initialize(empty());
    const repository = new SyntheticIdentityRepository({ ...options, store });
    await repository.read(state => state.version);
    return repository;
  }
  async read(fn) {
    try { return structuredClone(fn(validate(this.store ? await this.store.load() : this.state))); }
    catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
  }
  async mutate(fn) {
    const commit = async () => {
      const state = validate(this.store ? await this.store.load() : structuredClone(this.state));
      const result = fn(state); // No await before commit: memory mutations cannot interleave.
      validate(state); this.beforeCommit();
      if (this.store) await this.store.commit(state); else this.state = state;
      return structuredClone(result);
    };
    const own = () => this.store ? this.store.exclusive(commit) : commit();
    try { return await (this.coordinator ? this.coordinator.run(own) : own()); }
    catch (error) { if (error instanceof ApiError) throw error; throw unavailable(); }
  }
  findAccount(id) { return this.read(s => s.accounts.find(a => a.technicalAccountId === id)); }
  findRegistration(id) { return this.read(s => s.accounts.find(a => a.registrationId === id)); }
  createIfAbsent(registrationId, credentialVerifier, beforeCreate, binding) {
    return this.mutate(state => {
      const existing = state.accounts.find(a => a.registrationId === registrationId);
      if (existing) return { record: existing, created: false };
      if (!binding || binding.bindingGeneration !== 1 || state.accounts.some(a =>
        a.installationId === binding.installationId && a.localPlayerId === binding.localPlayerId))
        throw new ApiError(409, 'registration_conflict');
      if (state.accounts.length >= 1000) throw unavailable();
      beforeCreate();
      const timestamp = new Date(this.now()).toISOString();
      const account = { technicalAccountId: randomUUID(), registrationId, ...binding, role: 'player',
        credentialVerifier, credentialVersion: 1, authzVersion: 1, active: true, credentialExpiresAt: null,
        createdAt: timestamp, updatedAt: timestamp };
      state.accounts.push(account);
      return { record: account, created: true };
    });
  }
  createSession(verifiedAccount, tokenHash) {
    return this.mutate(state => {
      const a = state.accounts.find(a => a.technicalAccountId === verifiedAccount.technicalAccountId);
      if (!a?.active || (a.credentialExpiresAt !== null && a.credentialExpiresAt <= this.now()) ||
          ['credentialVersion', 'authzVersion', 'bindingGeneration'].some(k => a[k] !== verifiedAccount[k])) return undefined;
      state.sessions = state.sessions.filter(s => !s.revoked && s.expiresAt > this.now());
      const own = state.sessions.filter(s => s.technicalAccountId === a.technicalAccountId);
      if (own.length >= 3) state.sessions = state.sessions.filter(s => s.sessionId !== own[0].sessionId);
      const session = { sessionId: randomUUID(), technicalAccountId: a.technicalAccountId, tokenHash,
        credentialVersion: a.credentialVersion, authzVersion: a.authzVersion, bindingGeneration: a.bindingGeneration,
        installationId: a.installationId, localPlayerId: a.localPlayerId,
        createdAt: this.now(), expiresAt: this.now() + 900000, revoked: false };
      state.sessions.push(session); return session;
    });
  }
  live(state, session) {
    const a = session && state.accounts.find(a => a.technicalAccountId === session.technicalAccountId);
    return a?.active && !session.revoked && session.expiresAt > this.now() &&
      ['credentialVersion', 'authzVersion', 'bindingGeneration'].every(k => session[k] === a[k]) ? session : undefined;
  }
  findSession(hash) { return this.read(s => this.live(s, s.sessions.find(x => x.tokenHash === hash))); }
  findSessionById(id) { return this.read(s => this.live(s, s.sessions.find(x => x.sessionId === id))); }
  revokeSession(id) { return this.mutate(s => { const session = s.sessions.find(x => x.sessionId === id); if (session) session.revoked = true; return !!session; }); }
  revokeIdentity(id) {
    return this.mutate(s => {
      const a = s.accounts.find(a => a.technicalAccountId === id);
      if (!a) return false;
      a.active = false; a.authzVersion++; a.updatedAt = new Date(this.now()).toISOString(); return true;
    });
  }
  invalidateAccountSessions(id) {
    return this.mutate(s => { const a = s.accounts.find(a => a.technicalAccountId === id); if (a) { a.credentialVersion++; a.authzVersion++; } });
  }
  // Internal fixture-only expiry control; no public endpoint or client policy.
  setCredentialExpiry(id, at) {
    return this.mutate(s => { const a = s.accounts.find(a => a.technicalAccountId === id); if (a) a.credentialExpiresAt = at; });
  }
}

