import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import { generateKeyPair, SignJWT, decodeJwt } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../../src/app.js';
import { JwtService } from '../../src/modules/auth/jwt-service.js';
import { CredentialHasher } from '../../src/modules/auth/credential-hasher.js';
import { generateCredential } from '../../src/modules/identity/identity.js';
import { RateLimiter } from '../../src/middleware/rate-limiter.js';
import { assertIdentityRepository } from '../../src/modules/auth/identity-repository.js';
import { registrationV2Schema, sessionV2Schema } from '../../src/modules/auth/jwt-schemas.js';
import { SyntheticIdentityRepository } from './support/synthetic-repository.js';
import { SyntheticKeyProvider } from './support/key-provider.js';
import { EncryptedStore } from './support/encrypted-store.js';
import { workspace, child } from './support/harness.js';

let pair, otherPair;
const hasher = new CredentialHasher(), directories = [], servers = [];
const time = Date.UTC(2026, 9, 27, 12);
const registration = () => ({ schemaVersion: 2, registrationId: randomUUID(), installationId: randomUUID(),
  localPlayerId: randomUUID(), bindingGeneration: 1, credential: generateCredential() });
const config = () => ({ ...pair, mode: 'isolated-test', algorithm: 'RS256',
  issuer: 'https://two-sides.test.invalid', audience: 'two-sides-isolated-api', keyId: 'synthetic-memory' });
beforeAll(async () => {
  pair = await generateKeyPair('RS256', { modulusLength: 2048 });
  otherPair = await generateKeyPair('RS256', { modulusLength: 2048 });
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => new Promise(resolve => s.close(resolve))));
  for (const directory of directories.splice(0)) workspace('Remove', directory);
});
function options() {
  const directory = workspace('Create'); directories.push(directory);
  return { directory, masterKey: randomBytes(32), synthetic: true, now: () => time };
}
async function fixture({ repository, now = () => time } = {}) {
  repository ??= new SyntheticIdentityRepository({ synthetic: true, now });
  const service = new JwtService({ config: config(), repository, hasher, limiter: new RateLimiter({ now }), now, version: 2 });
  const input = registration();
  const first = await service.register(input, 'test');
  const id = first.body.technicalAccountId;
  const login = (changes = {}) => service.session({ ...input, technicalAccountId: id, ...changes }, 'test');
  const session = await login();
  return { repository, service, input, id, login, token: session.accessToken, first };
}
async function httpFixture(f) {
  const server = createApp({ jwt: config(), persistentJwt: { config: config(), repository: f.repository }, now: () => time }).listen(0, '127.0.0.1');
  servers.push(server); await once(server, 'listening');
  return async (method, route, body, token = f.token) => {
    const response = await fetch('http://127.0.0.1:' + server.address().port + route, { method, headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, text: await response.text() };
  };
}
async function forged(f, changes = {}, header = {}, key = pair.privateKey) {
  return new SignJWT({ ...decodeJwt(f.token), ...changes }).setProtectedHeader({
    alg: 'RS256', typ: 'at+jwt', kid: config().keyId, ...header,
  }).sign(key);
}

describe('v2 async contract — memory fakes, no durability claim', () => {
  it('checks the reusable async port and requires explicit synthetic capability', () => {
    expect(() => assertIdentityRepository({})).toThrow();
    expect(() => new SyntheticIdentityRepository()).toThrow();
    expect(assertIdentityRepository(new SyntheticIdentityRepository({ synthetic: true }))).toBeTruthy();
  });
  it('registers stable IDs, binding and server-selected player with Argon2id', async () => {
    const f = await fixture(); const account = await f.repository.findAccount(f.id);
    expect(account.role).toBe('player'); expect(account.installationId).toBe(f.input.installationId);
    expect(account.credentialVerifier.startsWith('$argon2id$v=19$m=65536,t=3,p=1$')).toBe(true);
    expect(await hasher.verify(account.credentialVerifier, f.input.credential)).toBe(true);
    expect(JSON.stringify(account).includes(f.input.credential)).toBe(false);
    const retry = await f.service.register(f.input, 'test');
    expect(retry.status).toBe(200); expect(retry.body.technicalAccountId).toBe(f.id);
  });
  it('rejects contradictory registration credentials without replacement', async () => {
    const f = await fixture();
    await expect(f.service.register({ ...f.input, credential: generateCredential() }, 'test')).rejects.toMatchObject({ status: 409 });
    expect((await f.login()).technicalAccountId).toBe(f.id);
  });
  it('rejects installation/profile collisions under different registration IDs', async () => {
    const f = await fixture();
    await expect(f.service.register({ ...f.input, registrationId: randomUUID() }, 'test')).rejects.toMatchObject({ status: 409 });
    await expect(f.service.register({ ...f.input, localPlayerId: randomUUID() }, 'test')).rejects.toMatchObject({ status: 409 });
  });
  it('makes concurrent same registration idempotent with a single winner', async () => {
    const repository = new SyntheticIdentityRepository({ synthetic: true, now: () => time });
    const service = new JwtService({ config: config(), repository, hasher, limiter: new RateLimiter(), version: 2, now: () => time });
    const input = registration();
    const results = await Promise.all([service.register(input, 'test'), service.register(input, 'test')]);
    expect(results.filter(r => r.status === 201).length).toBe(1);
    expect(new Set(results.map(r => r.body.technicalAccountId)).size).toBe(1);
  });
  it('validates strict v2 input and rejects public admin, names and unapproved fields', () => {
    for (const extra of ['role', 'admin', 'scope', 'displayName', 'email']) {
      expect(registrationV2Schema.safeParse({ ...registration(), [extra]: 'admin' }).success).toBe(false);
    }
    expect(registrationV2Schema.safeParse({ ...registration(), bindingGeneration: 2 }).success).toBe(false);
    expect(sessionV2Schema.safeParse({ schemaVersion: 2, technicalAccountId: randomUUID(), credential: generateCredential() }).success).toBe(false);
  });
  it('rejects invalid credentials and binding IDs even with a valid secret', async () => {
    const f = await fixture();
    for (const changes of [{ credential: generateCredential() }, { installationId: randomUUID() }, { localPlayerId: randomUUID() }, { technicalAccountId: randomUUID() }])
      await expect(f.login(changes)).rejects.toMatchObject({ status: 401 });
  });
  it('issues RS256 v2 with live versions, stable subject and 900-second TTL', async () => {
    const f = await fixture(), payload = decodeJwt(f.token);
    expect(payload.ver).toBe(2); expect(payload.sub).toBe(f.id); expect(payload.exp - payload.iat).toBe(900);
    expect(payload.installationId).toBe(f.input.installationId); expect(payload.bindingGeneration).toBe(1);
    expect(payload.authzVersion).toBe(1); expect((await f.service.authenticate(f.token)).id).toBe(f.id);
  });
  for (const [name, changes, header] of [
    ['issuer', { iss: 'https://other.invalid' }, {}], ['audience', { aud: 'other' }, {}],
    ['version', { ver: 1 }, {}], ['binding', { bindingGeneration: 2 }, {}], ['authorization version', { authzVersion: 2 }, {}],
    ['credential version', { cv: 2 }, {}], ['installation', { installationId: randomUUID() }, {}],
    ['player profile', { localPlayerId: randomUUID() }, {}], ['role escalation', { role: 'admin' }, {}],
    ['unknown key', {}, { kid: 'unknown' }],
  ]) it('rejects signed invalid v2 ' + name, async () => {
    const f = await fixture();
    await expect(f.service.authenticate(await forged(f, changes, header))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects wrong signature and disallowed HS256', async () => {
    const f = await fixture();
    await expect(f.service.authenticate(await forged(f, {}, {}, otherPair.privateKey))).rejects.toMatchObject({ status: 401 });
    const token = await new SignJWT(decodeJwt(f.token)).setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' }).sign(randomBytes(32));
    await expect(f.service.authenticate(token)).rejects.toMatchObject({ status: 401 });
  });
  it('rejects expired tokens exactly at exp without changing the identity', async () => {
    let clock = time; const f = await fixture({ now: () => clock });
    clock += 900000;
    await expect(f.service.authenticate(f.token)).rejects.toMatchObject({ status: 401 });
    expect((await f.login()).technicalAccountId).toBe(f.id);
  });
  it('applies explicit credential expiry without relying on file deletion', async () => {
    const f = await fixture();
    await f.repository.setCredentialExpiry(f.id, time);
    await expect(f.login()).rejects.toMatchObject({ status: 401 });
  });
  it('revokes individual sessions and credential generations', async () => {
    const f = await fixture(); await f.repository.revokeSession(decodeJwt(f.token).jti);
    await expect(f.service.authenticate(f.token)).rejects.toMatchObject({ status: 401 });
    const next = await f.login(); await f.repository.invalidateAccountSessions(f.id);
    await expect(f.service.authenticate(next.accessToken)).rejects.toMatchObject({ status: 401 });
    expect((await f.login()).technicalAccountId).toBe(f.id);
  });
  it('rejects a previously verified account after revocation races session creation', async () => {
    const f = await fixture(); const stale = await f.repository.findAccount(f.id);
    await f.repository.revokeIdentity(f.id);
    expect(await f.repository.createSession(stale, 'a'.repeat(64))).toBeUndefined();
    await expect(f.service.authenticate(f.token)).rejects.toMatchObject({ status: 401 });
  });
  it('protects HTTP ownership and public roles, retaining v1 separation', async () => {
    const f = await fixture(), send = await httpFixture(f);
    expect((await send('GET', '/api/v2/players/' + f.id)).status).toBe(200);
    expect((await send('GET', '/api/v2/players/' + randomUUID())).status).toBe(403);
    expect((await send('GET', '/api/v1/admin/status')).status).toBe(401);
    expect((await send('GET', '/api/v1/technical/me')).status).toBe(401);
    expect((await send('GET', '/api/identity/me')).status).toBe(401);
    expect((await send('POST', '/api/v2/technical/registrations', { ...registration(), role: 'admin' })).status).toBe(400);
  });
  it('returns safe HTTP 503 for unavailable identity/revocation reads and recovers', async () => {
    const f = await fixture(), send = await httpFixture(f), original = f.repository.findSessionById.bind(f.repository);
    f.repository.findSessionById = async () => { const { unavailable } = await import('../../src/utils/errors.js'); throw unavailable(); };
    const result = await send('GET', '/api/v2/technical/me');
    expect(result.status).toBe(503); expect(result.text.includes(f.token)).toBe(false);
    expect(/stack|verifier|argon2/i.test(result.text)).toBe(false);
    f.repository.findSessionById = original;
    expect((await send('GET', '/api/v2/technical/me')).status).toBe(200);
  });
  it('rolls back failed writes and accepts retry with the same registration', async () => {
    let fail = true;
    const repository = new SyntheticIdentityRepository({ synthetic: true, beforeCommit: () => { if (fail) throw new Error('Synthetic failure'); } });
    const service = new JwtService({ config: config(), repository, hasher, limiter: new RateLimiter(), version: 2 });
    const input = registration();
    await expect(service.register(input, 'test')).rejects.toMatchObject({ status: 503 });
    expect(await repository.findRegistration(input.registrationId)).toBeUndefined();
    fail = false; expect((await service.register(input, 'test')).status).toBe(201);
  });
});

describe('encrypted file adapter — actual process restart, never Atlas', () => {
  it('rejects repository, runtime and general temporary paths before any synthetic file access', () => {
    for (const directory of [process.cwd(), path.resolve('../local-persistence/.work/runtime-game'), path.resolve(process.env.TEMP)])
      expect(() => new EncryptedStore({ directory, name: 'identities', masterKey: randomBytes(32), synthetic: true })).toThrow('Out of scope');
  });
  it('preserves identity, keys, jti and preexisting JWT across independent backend processes', async () => {
    const o = options(), input = { directory: o.directory, masterKey: o.masterKey.toString('base64'), time };
    const issued = await child({ ...input, initialize: true, action: 'issue', registration: registration() });
    const verified = await child({ ...input, action: 'verify', token: issued.token });
    expect(issued.pid !== verified.pid).toBe(true); expect(verified.accepted).toBe(true);
    expect(verified.id).toBe(issued.id); expect(verified.jti).toBe(decodeJwt(issued.token).jti);
    expect(verified.kid).toBe(issued.kid); expect(verified.fingerprint).toBe(issued.fingerprint);
    const expired = await child({ ...input, action: 'verify', token: issued.token, time: time + 900000 });
    expect(expired.accepted).toBe(false); expect(expired.status).toBe(401);
    const revoked = await child({ ...input, action: 'revoke', token: issued.token, id: issued.id });
    expect(revoked.accepted).toBe(false);
    const again = await child({ ...input, action: 'verify', token: issued.token });
    expect(again.accepted).toBe(false); expect(again.status).toBe(401);
  }, 30000);
  it('persists Argon2id verifiers and idempotent receipts, never plaintext credentials or JWT', async () => {
    const o = options(), repository = await SyntheticIdentityRepository.open({ ...o, initialize: true });
    const f = await fixture({ repository });
    const reopened = await SyntheticIdentityRepository.open(o);
    const next = await fixture({ repository: reopened }); // New independent profile is allowed.
    expect((await reopened.findAccount(f.id)).technicalAccountId).toBe(f.id);
    const service = new JwtService({ config: config(), repository: reopened, hasher, limiter: new RateLimiter(), now: () => time, version: 2 });
    expect((await service.register(f.input, 'test')).body.technicalAccountId).toBe(f.id);
    expect((await service.authenticate(f.token)).id).toBe(f.id); expect(next.id !== f.id).toBe(true);
    const text = await fs.readFile(path.join(o.directory, 'identities.bin'), 'utf8');
    expect([f.input.credential, f.token, '$argon2id$'].some(v => text.includes(v))).toBe(false);
  });
  it('serializes logical instances and fails closed on simultaneous writes without lost updates', async () => {
    const o = options(), a = await SyntheticIdentityRepository.open({ ...o, initialize: true }), b = await SyntheticIdentityRepository.open(o);
    const f = await fixture({ repository: a });
    const r = await Promise.allSettled([a.revokeIdentity(f.id), b.invalidateAccountSessions(f.id)]);
    expect(r.some(v => v.status === 'fulfilled')).toBe(true);
    for (const result of r) if (result.status === 'rejected') expect(result.reason.status).toBe(503);
    // Explicit retry after lock contention, never silently claim a write committed.
    await b.revokeIdentity(f.id);
    const reopened = await SyntheticIdentityRepository.open(o);
    expect((await reopened.findAccount(f.id)).active).toBe(false);
  });
  it('rejects corrupted/truncated state and encryption-key mismatch without replacing files', async () => {
    const o = options(); await SyntheticIdentityRepository.open({ ...o, initialize: true });
    const file = path.join(o.directory, 'identities.bin'), original = await fs.readFile(file);
    await expect(SyntheticIdentityRepository.open({ ...o, masterKey: randomBytes(32) })).rejects.toMatchObject({ status: 503 });
    expect((await fs.readFile(file)).equals(original)).toBe(true);
    await fs.writeFile(file, '{"version":');
    await expect(SyntheticIdentityRepository.open(o)).rejects.toMatchObject({ status: 503 });
    expect((await fs.readFile(file, 'utf8')) === '{"version":').toBe(true);
  });
  it('rejects unavailable, corrupt and mismatched key material; no implicit initialization', async () => {
    const o = options(), provider = new SyntheticKeyProvider(o);
    await expect(provider.load()).rejects.toMatchObject({ status: 503 });
    await provider.initialize();
    const first = await provider.load(), second = await new SyntheticKeyProvider(o).load();
    expect(first.keyId).toBe(second.keyId); expect(first.publicFingerprint).toBe(second.publicFingerprint);
    const file = path.join(o.directory, 'keys.bin'), blob = await fs.readFile(file, 'utf8');
    expect(blob.includes('PRIVATE KEY')).toBe(false);
    await fs.writeFile(file, 'invalid');
    await expect(provider.load()).rejects.toMatchObject({ status: 503 });
    await expect(provider.initialize()).rejects.toMatchObject({ status: 503 });
  });
  it('validates the private/public pair before readiness', async () => {
    const o = options(), provider = new SyntheticKeyProvider(o); await provider.initialize();
    const store = new EncryptedStore({ ...o, name: 'keys' }), value = await store.load();
    const { exportSPKI } = await import('jose'); value.publicPem = await exportSPKI(otherPair.publicKey);
    await store.exclusive(() => store.commit(value));
    await expect(provider.load()).rejects.toMatchObject({ status: 503 });
  });
  it('preserves the last committed state after process interruption, blocks writes behind stale lock', async () => {
    const o = options(), input = { directory: o.directory, masterKey: o.masterKey.toString('base64'), time };
    const issued = await child({ ...input, initialize: true, action: 'issue', registration: registration() });
    const before = await fs.readFile(path.join(o.directory, 'identities.bin'));
    await child({ ...input, action: 'interrupt' });
    expect((await fs.readFile(path.join(o.directory, 'identities.bin'))).equals(before)).toBe(true);
    const verified = await child({ ...input, action: 'verify', token: issued.token });
    expect(verified.accepted).toBe(true);
    const repository = await SyntheticIdentityRepository.open(o);
    await expect(repository.revokeIdentity(issued.id)).rejects.toMatchObject({ status: 503 });
  }, 30000);
  it('never confirms a partially failed file commit and retries without duplicates', async () => {
    const o = options(), repository = await SyntheticIdentityRepository.open({ ...o, initialize: true });
    let fail = true; repository.beforeCommit = () => { if (fail) throw new Error('Simulated disk failure'); };
    const service = new JwtService({ config: config(), repository, hasher, limiter: new RateLimiter(), version: 2 });
    const body = registration();
    await expect(service.register(body, 'test')).rejects.toMatchObject({ status: 503 });
    expect(await repository.findRegistration(body.registrationId)).toBeUndefined();
    fail = false;
    const result = await service.register(body, 'test');
    expect(result.status).toBe(201);
    expect((await service.register(body, 'test')).body.technicalAccountId).toBe(result.body.technicalAccountId);
  });
});

