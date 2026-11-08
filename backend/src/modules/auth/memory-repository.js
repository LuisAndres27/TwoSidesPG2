import { timingSafeEqual } from 'node:crypto';
import { generateId, internalEmail } from '../identity/identity.js';
import { unavailable } from '../../utils/errors.js';

// Process-local synthetic data only. No files, database, shared state or durability.
export class MemoryRepository {
  #accounts = new Map();
  #registrations = new Map();
  #sessions = new Map();

  constructor({ now = Date.now, maxAccounts = 1000, includeInternalEmail = true, allowSyntheticFixtures = false } = {}) {
    this.now = now;
    this.maxAccounts = maxAccounts;
    this.includeInternalEmail = includeInternalEmail;
    this.allowSyntheticFixtures = allowSyntheticFixtures;
  }

  get counts() { this.#pruneSessions(); return { accounts: this.#accounts.size, sessions: this.#sessions.size }; }
  findAccount(id) { return this.#accounts.get(id); }
  findRegistration(id) { return this.findAccount(this.#registrations.get(id)); }

  // Entire operation is synchronous: no await between uniqueness check and commit.
  createIfAbsent(registrationId, credentialVerifier, beforeCreate = () => {}) {
    const existing = this.findRegistration(registrationId);
    if (existing) return { record: existing, created: false };
    if (this.#accounts.size >= this.maxAccounts) throw unavailable();
    beforeCreate();
    const id = generateId();
    const timestamp = new Date(this.now()).toISOString();
    const record = Object.freeze({
      technicalAccountId: id, ...(this.includeInternalEmail ? { internalEmail: internalEmail(id) } : {}), registrationId,
      role: 'player',
      credentialVerifier, credentialVersion: 1, active: true,
      createdAt: timestamp, updatedAt: timestamp,
    });
    this.#accounts.set(id, record);
    this.#registrations.set(registrationId, id);
    return { record, created: true };
  }

  #pruneSessions() {
    const now = this.now();
    for (const [key, session] of this.#sessions) {
      if (session.revoked || session.expiresAt <= now) this.#sessions.delete(key);
    }
  }

  createSession(account, tokenHash) {
    this.#pruneSessions();
    const current = this.findAccount(account.technicalAccountId);
    if (!current?.active || current.credentialVersion !== account.credentialVersion) return undefined;
    const own = [...this.#sessions.entries()].filter(([, s]) => s.technicalAccountId === account.technicalAccountId);
    if (own.length >= 3) this.#sessions.delete(own[0][0]);
    const session = Object.freeze({
      sessionId: generateId(), technicalAccountId: account.technicalAccountId,
      tokenHash, credentialVersion: account.credentialVersion,
      createdAt: this.now(), expiresAt: this.now() + 900_000, revoked: false,
    });
    this.#sessions.set(tokenHash, session);
    return session;
  }

  findSession(tokenHash) {
    this.#pruneSessions();
    const session = this.#sessions.get(tokenHash);
    if (!session || !timingSafeEqual(Buffer.from(tokenHash, 'hex'), Buffer.from(session.tokenHash, 'hex'))) return undefined;
    const account = this.findAccount(session.technicalAccountId);
    return account?.active && account.credentialVersion === session.credentialVersion ? session : undefined;
  }
  findSessionById(sessionId) {
    this.#pruneSessions();
    const session = [...this.#sessions.values()].find(s => s.sessionId === sessionId);
    const account = session && this.findAccount(session.technicalAccountId);
    return account?.active && account.credentialVersion === session.credentialVersion ? session : undefined;
  }
  // In-memory fixtures only; never reachable through any HTTP registration handler.
  seedSyntheticAccount(id, verifier, role) {
    if (!this.allowSyntheticFixtures || !['player', 'admin'].includes(role) || this.#accounts.has(id))
      throw new Error('Invalid synthetic fixture');
    const at = new Date(this.now()).toISOString();
    this.#accounts.set(id, Object.freeze({ technicalAccountId: id, credentialVerifier: verifier,
      role, credentialVersion: 1, active: true, createdAt: at, updatedAt: at }));
  }

  revokeSession(sessionId) {
    for (const [key, session] of this.#sessions) {
      if (session.sessionId === sessionId) { this.#sessions.delete(key); return true; }
    }
    return false;
  }

  revokeAccountSessions(accountId) {
    for (const [key, session] of this.#sessions) if (session.technicalAccountId === accountId) this.#sessions.delete(key);
  }

  // Internal control for tests/revocation, not a credential rotation or recovery endpoint.
  invalidateAccountSessions(accountId) {
    const record = this.findAccount(accountId);
    if (!record) return;
    this.#accounts.set(accountId, Object.freeze({ ...record, credentialVersion: record.credentialVersion + 1, updatedAt: new Date(this.now()).toISOString() }));
    this.revokeAccountSessions(accountId);
  }
}
