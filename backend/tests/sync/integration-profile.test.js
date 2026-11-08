import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import { createBackend, CompositionError } from '../../src/composition/backend.js';
import { INTEGRATION_ACTIVATION, INTEGRATION_PREPARE_CONFIRMATION, createIntegrationJwtConfig, openIntegrationProfile, prepareIntegrationCollections } from '../../src/integration/profile.js';
import { ATLAS_TARGET, ATLAS_URI, INTEGRATION_PROFILE_CONFIG, validateAtlasConfig } from '../../src/modules/sync/atlas-policy.js';
import { temporaryAtlasCredential } from '../../src/modules/sync/atlas-credentials.js';
import { JwtService } from '../../src/modules/auth/jwt-service.js';
import { CredentialHasher } from '../../src/modules/auth/credential-hasher.js';
import { RateLimiter, RATE_POLICY } from '../../src/middleware/rate-limiter.js';
import { resolveSyncContext } from '../../src/middleware/sync-auth-context.js';
import { integrationDouble, integrationStack, secret, stacks } from './support/integration-double.js';
import { offlineStack, stacks as offlineStacks } from './support/offline-stack.js';
import { vectors, batch, clone, mutate } from './support/fixture.js';

// B05.5 stage 6: the integration profile, offline. The real opener, repositories, JWT v2 and HTTP stack run on a MongoDB DOUBLE.
// Nothing here reaches Atlas, a real credential, backend/.env, the C.2 harness, or any other database.
const root = fileURLToPath(new URL('../../', import.meta.url));
const connects = [];
beforeEach(() => {
  connects.length = 0;
  const connect = net.Socket.prototype.connect;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { connects.push(args[0]); return connect.apply(this, args); });
});
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.backend.close({ graceMs: 100 }).catch(() => {});
  for (const s of offlineStacks.splice(0)) await s.backend.close({ graceMs: 100 }).catch(() => {});
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
const first = () => clone(vectors.operations[0]);
const A = { installationId: vectors.installationId, localPlayerId: vectors.localPlayerId, bindingGeneration: 1 };
const B = { installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 };
const code = fn => { try { fn(); return 'created'; } catch (e) { return e instanceof CompositionError ? e.code : 'other:' + e.message; } };
const open = (double, extra = {}) => openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: secret(), connector: double.connector, ...extra });
const post = (s, token, body, p = '/api/v2/sync/batches') => s.call(p, { method: 'POST', token, body });

it('IP01 the integration profile is disabled by default: no activation, connector or bundle means no connection and no backend', async () => {
  const db = integrationDouble();
  for (const activation of [undefined, '', 'true', 'enable_atlas_integration_profile_v2', INTEGRATION_ACTIVATION + ' '])
    await expect(open(db, { activation })).rejects.toMatchObject({ code: 'integration_not_activated' });
  await expect(openIntegrationProfile()).rejects.toMatchObject({ code: 'integration_not_activated' });
  await expect(openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: secret() })).rejects.toMatchObject({ code: 'atlas_connector_required' });
  vi.stubEnv('NODE_ENV', 'production');
  await expect(open(db)).rejects.toMatchObject({ name: 'AtlasIntegrationError' });
  vi.unstubAllEnvs();
  expect(db.connects).toBe(0);
  // The composition refuses the profile without an authentic bundle, and never accepts repositories next to a bundle.
  const offline = await offlineStack(); const base = { jwtConfig: await createIntegrationJwtConfig() };
  expect(code(() => createBackend({ profile: 'integration', ...base }))).toBe('PROFILE_UNAVAILABLE');
  expect(code(() => createBackend({ profile: 'integration', ...base, identityRepository: offline.identity, ingestionRepository: offline.repository }))).toBe('PROFILE_UNAVAILABLE');
  expect(code(() => createBackend({ profile: 'integration', ...base, integration: { profile: 'integration', identityRepository: offline.identity, ingestionRepository: offline.repository, resources: [] } }))).toBe('PROFILE_UNAVAILABLE');
  expect(code(() => createBackend({ profile: 'main', ...base }))).toBe('PROFILE_UNAVAILABLE');
  const s = await integrationStack();
  expect(code(() => createBackend({ profile: 'integration', jwtConfig: s.jwtConfig, integration: s.bundle, identityRepository: offline.identity }))).toBe('PROFILE_UNAVAILABLE');
  expect(code(() => createBackend({ profile: 'offline-test', jwtConfig: offline.jwtConfig, identityRepository: offline.identity, ingestionRepository: offline.repository, integration: s.bundle }))).toBe('PROFILE_UNAVAILABLE');
  // Nothing starts it by itself: npm start, server.js and the composition import no integration opener.
  expect(JSON.parse(fs.readFileSync(root + 'package.json', 'utf8')).scripts.start).toBe('node src/server.js');
  for (const dir of ['src', 'scripts']) for (const file of walk(path.join(root, dir)))
    if (!file.includes(path.join('src', 'integration')) && !/atlas-policy|mongo-models|mongo-identity-models/.test(file) && /from\s+'[^']*integration\/profile|openIntegrationProfile\s*\(/.test(fs.readFileSync(file, 'utf8')))
      throw new Error('unexpected user of the integration opener: ' + file);
});
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []); }

it('IP02 the destination is fixed: no option can change host, database, user, URI, TLS or mechanism, and a connection that is not exactly that is refused', async () => {
  const db = integrationDouble(); const handle = await open(db);
  expect(db.uriSeen).toEqual([ATLAS_URI]);
  expect(ATLAS_URI).toBe('mongodb+srv://twosidescluster.fxqeo8o.mongodb.net/two_sides_integration_test');
  expect(db.optionsSeen[0]).toMatchObject({ dbName: 'two_sides_integration_test', user: 'twosides_integration_test', authSource: 'admin', authMechanism: 'SCRAM-SHA-256',
    tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false, directConnection: false, autoCreate: false, autoIndex: false, w: 'majority', retryWrites: true });
  expect(handle.profile).toBe('integration'); await handle.close();
  for (const extra of [{ host: 'evil.example' }, { database: 'two_sides_db' }, { dbName: 'two_sides_db' }, { user: 'twosides_backend' }, { uri: 'mongodb://127.0.0.1/x' }, { tls: false }, { authMechanism: 'DEFAULT' }, { config: INTEGRATION_PROFILE_CONFIG }, { profile: 'main' }]) {
    const d = integrationDouble();
    await expect(open(d, extra), JSON.stringify(extra)).rejects.toMatchObject({ code: 'integration_option_rejected' });
    expect(d.connects).toBe(0);
  }
  for (const bad of [{ host: 'other.mongodb.net' }, { database: 'two_sides_db' }, { user: 'twosides_backend' }, { tls: false }, { authMechanism: 'DEFAULT' }, { allowWrites: false }, { runId: 'a'.repeat(32) }, { uri: 'mongodb://127.0.0.1/x' }, { mode: 'main' }])
    expect(() => validateAtlasConfig({ ...INTEGRATION_PROFILE_CONFIG, ...bad }), JSON.stringify(bad)).toThrow();
  // A wrong connection is closed and refused.
  const wrong = [['name', c => { c.name = 'two_sides_db'; }], ['user', d => { d.clientOptions.credentials.username = 'twosides_backend'; }], ['host', d => { d.clientOptions.srvHost = 'other.mongodb.net'; }],
    ['tls', d => { d.clientOptions.tls = false; }], ['insecure', d => { d.clientOptions.tlsInsecure = true; }], ['mechanism', d => { d.clientOptions.credentials.mechanism = 'DEFAULT'; }],
    ['source', d => { d.clientOptions.credentials.source = '$external'; }], ['direct', d => { d.clientOptions.directConnection = true; }]];
  for (const [label, change] of wrong) {
    const d = integrationDouble(); change.length && change(label === 'name' ? d.connection : d);
    await expect(open(d), label).rejects.toMatchObject({ name: 'AtlasIntegrationError' });
    expect(d.closed, label).toBe(1);
  }
});

it('IP03 invalid credentials and invalid privileges are rejected without leaking the secret, and the connection is closed', async () => {
  for (const bad of [undefined, {}, temporaryAtlasCredential.name]) {
    const d = integrationDouble();
    await expect(openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: bad, connector: d.connector })).rejects.toMatchObject({ name: 'AtlasIntegrationError' });
    expect(d.connects).toBe(0);
  }
  expect(() => temporaryAtlasCredential(Buffer.from(''))).toThrow(); expect(() => temporaryAtlasCredential(Buffer.from('a\nb'))).toThrow(); expect(() => temporaryAtlasCredential('text')).toThrow();
  const reused = integrationDouble(); const handle = secret();
  await open(reused, { credential: handle }); await expect(open(integrationDouble(), { credential: handle })).rejects.toMatchObject({ name: 'AtlasIntegrationError' });   // one use
  const password = 'p4ss-' + randomBytes(8).toString('hex'); const failing = integrationDouble();
  failing.connector = async () => { throw new Error('auth failed for ' + password); };
  const error = await open(failing, { credential: temporaryAtlasCredential(Buffer.from(password)), connector: failing.connector }).catch(e => e);
  expect(error).toMatchObject({ name: 'AtlasIntegrationError', code: 'atlas_connection_unavailable' });
  expect(JSON.stringify([error.message, error.code, error.stack])).not.toContain(password);
  for (const mutateStatus of [s => { s.authInfo.authenticatedUsers[0].user = 'twosides_backend'; }, s => { s.authInfo.authenticatedUserRoles[0].role = 'dbOwner'; },
    s => { s.authInfo.authenticatedUserRoles[0].db = 'two_sides_db'; }, s => { s.authInfo.authenticatedUserPrivileges = []; }, s => { s.ok = 0; }]) {
    const d = integrationDouble(); mutateStatus(d.status);
    await expect(open(d)).rejects.toMatchObject({ code: 'atlas_permissions_unverified' }); expect(d.closed).toBe(1);
  }
});

it('IP04 JWT v2 is validated: signature, issuer, audience, expiry, key id and realm; the offline-test realm does not work here and vice versa', async () => {
  const s = await integrationStack(); await s.listen(); const p = await s.player(A);
  const me = await s.call('/api/v2/technical/me', { token: p.token });
  expect(me.status).toBe(200); expect(me.json).toEqual({ schemaVersion: 2, technicalAccountId: p.accountId, role: 'player' });
  expect(JSON.stringify(p.register.json)).not.toContain(p.credential);
  const claims = JSON.parse(Buffer.from(p.token.split('.')[1], 'base64url'));
  expect(claims).toMatchObject({ iss: 'https://two-sides.integration.invalid', aud: 'two-sides-integration-api', ver: 2, role: 'player', sub: p.accountId });
  const mint = async ({ iss = claims.iss, aud = claims.aud, key = s.jwtConfig.privateKey, kid = s.jwtConfig.keyId, exp = claims.exp, nbf = claims.nbf, alg = 'RS256' } = {}) =>
    new SignJWT({ role: 'player', cv: claims.cv, ver: 2, installationId: claims.installationId, localPlayerId: claims.localPlayerId, bindingGeneration: 1, authzVersion: claims.authzVersion })
      .setProtectedHeader({ alg, typ: 'at+jwt', kid }).setIssuer(iss).setAudience(aud).setSubject(claims.sub).setIssuedAt(claims.iat).setNotBefore(nbf).setExpirationTime(exp).setJti(claims.jti).sign(key);
  const other = await createIntegrationJwtConfig({ keyId: s.jwtConfig.keyId });
  const forged = await Promise.all([mint({ key: other.privateKey }), mint({ iss: 'https://two-sides.test.invalid' }), mint({ aud: 'two-sides-isolated-api' }), mint({ kid: 'other' }), mint({ exp: claims.exp + 900 })]);
  for (const token of [...forged, p.token.slice(0, -4) + 'AAAA', 'x.y.z', '']) expect((await s.call('/api/v2/technical/me', { token })).status).toBe(401);
  expect((await s.call('/api/v2/technical/me', { token: await mint() })).status).toBe(200);   // the control: same helper, valid inputs
  // The offline realm's own token is refused by the integration backend.
  const offline = await offlineStack(); await offline.listen(); const op = await offline.player(A);
  expect((await s.call('/api/v2/technical/me', { token: op.token })).status).toBe(401);
  expect((await offline.call('/api/v2/technical/me', { token: p.token })).status).toBe(401);
  // Expiry: 15 minutes later the token is refused; a new login works.
  s.clock.value += 901_000; expect((await s.call('/api/v2/technical/me', { token: p.token })).status).toBe(401);
  expect((await s.call('/api/v2/technical/me', { token: await p.login() })).status).toBe(200);
  // Realms cannot be crossed at composition time either.
  const db = integrationDouble(); const bundle = await open(db);
  expect(code(() => createBackend({ profile: 'integration', jwtConfig: offline.jwtConfig, integration: bundle }))).toBe('JWT_CONFIG_REJECTED');
  expect(code(() => createBackend({ profile: 'offline-test', jwtConfig: s.jwtConfig, identityRepository: offline.identity, ingestionRepository: offline.repository }))).toBe('JWT_CONFIG_REJECTED');
  await bundle.close();
});

it('IP05 owner authorization: a technical identity can only read and write its own player', async () => {
  const s = await integrationStack(); await s.listen(); const a = await s.player(A), b = await s.player(B);
  expect((await s.call('/api/v2/players/' + a.accountId, { token: a.token })).status).toBe(200);
  expect((await s.call('/api/v2/players/' + b.accountId, { token: a.token })).status).toBe(403);
  expect((await s.call('/api/v2/players/' + a.accountId, { token: b.token })).status).toBe(403);
  expect((await post(s, b.token, batch([first()]))).status).toBe(403);
  expect(s.db.rows.operations).toHaveLength(0);
  const own = await post(s, a.token, batch([first()]));
  expect(own.status).toBe(200); expect(own.json.results[0].receipt).toMatchObject({ technicalAccountId: a.accountId, localPlayerId: A.localPlayerId });
  const spoof = mutate(first(), e => { e.localPlayerId = B.localPlayerId; }, { newId: true });
  expect((await post(s, a.token, batch([spoof]))).status).toBe(403);
  expect((await post(s, a.token, { ...batch([first()]), role: 'admin' })).status).toBe(400);
  expect(s.db.rows.operations).toHaveLength(1);
  expect(s.db.rows.operations[0].technicalAccountId).toBe(a.accountId);
});

it('IP06 writes are transactional: a failed or unknown commit never leaves partial data nor a false acknowledgement', async () => {
  const s = await integrationStack(); await s.listen(); const p = await s.player(A);
  s.db.failure = 'rollback';
  const failed = await post(s, p.token, batch([first()]));
  expect(failed.status).toBeGreaterThanOrEqual(500); expect(s.db.rows.operations).toHaveLength(0); expect(s.db.rows.facts).toHaveLength(0);
  // Unknown commit result: the client sees an error (never a receipt it cannot trust); retrying the same ids is answered from stored data.
  s.db.failure = 'unknown';
  const unknown = await post(s, p.token, batch([first()]));
  expect(unknown.status).toBeGreaterThanOrEqual(500); expect(unknown.text).not.toContain('receipt');
  const retry = await post(s, p.token, batch([first()]));
  expect(retry.status).toBe(200); expect(['committed', 'duplicate']).toContain(retry.json.results[0].status);
  expect(s.db.rows.operations).toHaveLength(1);
  const ok = await post(s, p.token, batch(vectors.operations));
  expect(ok.status).toBe(200); expect(s.db.options).toMatchObject({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority', j: true }, readPreference: 'primary' });
  expect(s.db.rows.operations).toHaveLength(vectors.operations.length);
  expect(new Set(s.db.rows.operations.map(o => o.operationId)).size).toBe(s.db.rows.operations.length);
  const seed = s.db.rows.fences.find(f => f._id === 'ingestion-v1'), mine = s.db.rows.fences.find(f => f._id === 'ingestion-v1:' + p.accountId);
  expect(seed.revision).toBe(0); expect(mine.revision).toBeGreaterThan(0);   // writes take the OWNER's fence inside the transaction; the shared seed is only read
});

it('IP07 idempotency: the same operation ids are answered with the original receipt and stored once', async () => {
  const s = await integrationStack(); await s.listen(); const p = await s.player(A);
  const one = await post(s, p.token, batch(vectors.operations)); const two = await post(s, p.token, batch(vectors.operations));
  expect(one.status).toBe(200); expect(two.status).toBe(200);
  expect(two.json.results.every(r => r.status === 'duplicate')).toBe(true);
  expect(two.json.results.map(r => r.receipt)).toEqual(one.json.results.map(r => r.receipt));
  expect(s.db.rows.operations).toHaveLength(vectors.operations.length);
  expect(new Set(s.db.rows.operations.map(o => o.operationId)).size).toBe(vectors.operations.length);
});

it('IP08 receipt queries return only the caller\'s receipts', async () => {
  const s = await integrationStack(); await s.listen(); const a = await s.player(A), b = await s.player(B);
  await post(s, a.token, batch([first()]));
  const attempt = (op, id = randomUUID()) => ({ schemaVersion: 2, attempts: [{ operationId: op.operationId, payloadHash: op.payloadHash, leaseId: id, attempt: 1 }] });
  const mine = await post(s, a.token, attempt(first()), '/api/v2/sync/receipts/query');
  expect(mine.status).toBe(200); expect(mine.json.results[0]).toMatchObject({ status: 'found', operationId: first().operationId });
  expect(mine.json.results[0].receipt).toMatchObject({ technicalAccountId: a.accountId });
  const unknown = await post(s, a.token, attempt(mutate(first(), () => {}, { newId: true })), '/api/v2/sync/receipts/query');
  expect(unknown.status).toBe(200); expect(unknown.json.results[0].status).toBe('not_found');
  const foreign = await post(s, b.token, attempt(first()), '/api/v2/sync/receipts/query');
  expect(foreign.status === 200 ? foreign.json.results[0].status : 'refused').not.toBe('found');
  expect(foreign.text).not.toContain(a.accountId);
});

it('IP09 revocation is honored immediately: a revoked identity or session is refused, other players are not affected', async () => {
  const s = await integrationStack(); await s.listen(); const a = await s.player(A), b = await s.player(B);
  expect((await post(s, a.token, batch([first()]))).status).toBe(200);
  const jwt = new JwtService({ config: s.jwtConfig, repository: s.bundle.identityRepository, hasher: new CredentialHasher(), limiter: new RateLimiter({ now: s.now }), policy: RATE_POLICY, now: s.now, version: 2 });
  const context = async token => resolveSyncContext(await jwt.authenticate(token), token, s.bundle.identityRepository, s.now);
  // Session revocation: only that session dies; a fresh login works.
  const second = await a.login(); const sessionContext = await context(second);
  await s.bundle.identityRepository.revoke(sessionContext, { commandId: randomUUID(), kind: 'session', target: sessionContext.sessionId });
  expect((await s.call('/api/v2/technical/me', { token: second })).status).toBe(401);
  expect((await s.call('/api/v2/technical/me', { token: a.token })).status).toBe(200);
  // Identity revocation: every token of that account is refused, reads and writes, and no login succeeds again.
  const identityContext = await context(a.token);
  await s.bundle.identityRepository.revoke(identityContext, { commandId: randomUUID(), kind: 'identity' });
  expect((await s.call('/api/v2/technical/me', { token: a.token })).status).toBe(401);
  const rows = s.db.rows.operations.length;
  expect((await post(s, a.token, batch([mutate(first(), () => {}, { newId: true })]))).status).toBe(401);
  expect(s.db.rows.operations).toHaveLength(rows);
  expect([401, 403]).toContain((await s.call('/api/v2/technical/sessions', { method: 'POST', body: { schemaVersion: 2, technicalAccountId: a.accountId, credential: a.credential, installationId: A.installationId, localPlayerId: A.localPlayerId } })).status);
  expect((await s.call('/api/v2/technical/me', { token: b.token })).status).toBe(200);
  expect(s.db.rows.revocations.length).toBe(2);
});

it('IP10 shutdown is orderly: the listener stops first, then the Atlas connection closes exactly once; closing again or before start is safe', async () => {
  const s = await integrationStack(); await s.listen(); const p = await s.player(A);
  expect((await post(s, p.token, batch([first()]))).status).toBe(200);
  const result = await s.backend.close({ graceMs: 1000 });
  expect(result).toMatchObject({ closed: true, forced: false, resourceErrors: 0 });
  expect(s.db.closed).toBe(1); expect(s.db.connection.readyState).toBe(0);
  await expect(fetch(s.base + '/api/health')).rejects.toThrow();
  await s.backend.close(); expect(s.db.closed).toBe(1);
  const early = await integrationStack(); await early.backend.close(); await early.backend.close();   // never started
  expect(early.db.closed).toBe(1);
  await expect(early.backend.start()).rejects.toMatchObject({ code: 'ALREADY_STARTED' });
});

it('IP11 connection failures are contained: 503 without data loss, the process stays up, and service resumes when the connection returns', async () => {
  const failing = integrationDouble(); failing.connector = async () => { throw new Error('ENOTFOUND'); };
  await expect(open(failing)).rejects.toMatchObject({ code: 'atlas_connection_unavailable' });
  const s = await integrationStack(); await s.listen(); const p = await s.player(A);
  s.db.connection.readyState = 0;                                         // connection lost
  const down = await post(s, p.token, batch([first()]));
  expect(down.status).toBeGreaterThanOrEqual(500); expect(down.text).not.toMatch(/mongo|stack|at \w+ \(/i);
  expect((await s.call('/api/health')).status).toBe(200);                 // the listener itself is healthy
  expect(s.db.rows.operations).toHaveLength(0);
  s.db.connection.readyState = 1;
  const back = await post(s, p.token, batch([first()]));
  expect(back.status).toBe(200); expect(s.db.rows.operations).toHaveLength(1);
  s.db.failure = 'before';                                                // primary unavailable mid-request
  const mid = await post(s, p.token, batch([mutate(first(), () => {}, { newId: true })]));
  expect(mid.status).toBeGreaterThanOrEqual(500); expect(s.db.rows.operations).toHaveLength(1);
  expect((await post(s, p.token, batch([first()]))).status).toBe(200);    // retry of a committed id: duplicate, still one row
  expect(s.db.rows.operations).toHaveLength(1);
});

it('IP12 only the integration collections are touched: no main database, no C.2 collections, no outside sockets, no environment or harness imports', async () => {
  const s = await integrationStack(); await s.listen(); const p = await s.player(A);
  await post(s, p.token, batch(vectors.operations));
  const names = Object.values(s.db.models).map(m => m.collection.name);
  expect(names.length).toBeGreaterThanOrEqual(8);
  for (const name of names) expect(name).toMatch(/^integration_v2_[A-Za-z]+$/);
  expect(Object.values(s.bundle.collections)).toEqual(['integration_v2_operations', 'integration_v2_facts', 'integration_v2_fences', 'integration_v2_authorization']);
  expect(s.db.connection.name).toBe('two_sides_integration_test');
  expect(JSON.stringify([s.db.optionsSeen, s.db.uriSeen, names, s.db.commands])).not.toMatch(/two_sides_db|twosides_backend|b054c2c|\.env/);
  expect(s.db.commands.every(c => c.connectionStatus === 1 && c.showPrivileges === true)).toBe(true);   // the only server command: read-only privilege inspection
  expect(connects.filter(c => c && c.port !== undefined && !['127.0.0.1', '::1', 'localhost', undefined].includes(c.host))).toEqual([]);
  // Collection preparation never happens by itself, needs the exact confirmation, and touches only the eight integration models.
  await expect(prepareIntegrationCollections(s.bundle)).rejects.toMatchObject({ code: 'integration_not_activated' });
  await expect(prepareIntegrationCollections(s.bundle, { confirm: 'yes' })).rejects.toMatchObject({ code: 'integration_not_activated' });
  await expect(prepareIntegrationCollections({}, { confirm: INTEGRATION_PREPARE_CONFIRMATION })).rejects.toMatchObject({ code: 'integration_not_activated' });
  // Static: the profile sources name no other database or user and read no environment, file or harness.
  for (const file of [root + 'src/integration/profile.js', root + 'src/config/integration-profile.js', root + 'src/composition/backend.js']) {
    const text = fs.readFileSync(file, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(text, file).not.toMatch(/two_sides_db|twosides_backend|process\.env|dotenv|\.env\b|readFile|c2-|scripts\//);
    for (const i of [...text.matchAll(/from\s+'([^']+)'/g)].map(m => m[1])) expect(i, file).not.toMatch(/^mongoose$|mongodb$|dotenv|c2-|scripts\//);
  }
  expect(ATLAS_TARGET).toEqual({ host: 'twosidescluster.fxqeo8o.mongodb.net', database: 'two_sides_integration_test', user: 'twosides_integration_test' });
});
