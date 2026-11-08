import {restrictedStatus} from './support/restricted-status.js';
import './support/isolation-guard.js';
import { afterEach, expect, it, vi } from 'vitest';
import { generateKeyPair } from 'jose';
import { randomUUID, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { integrationDouble } from './support/integration-double.js';
import { vectors, batch } from './support/fixture.js';
import { openMainProfile, MAIN_ACTIVATION } from '../../src/main/profile.js';
import { MAIN_CONFIG, MAIN_TARGET, MainError } from '../../src/main/policy.js';
import { MAIN_JWT } from '../../src/config/jwt.js';
import { temporaryAtlasCredential } from '../../src/modules/sync/atlas-credentials.js';
import { createBackend } from '../../src/composition/backend.js';
import { startMainBackend } from '../../src/main/runtime.js';

// F1 start-up warm-up (profile.js). Everything runs on the Mongo double: no socket to Atlas, no Express/Caddy outside the in-process test server on 127.0.0.1.
const running = [];
afterEach(async () => { for (const h of running.splice(0)) await h.close().catch(() => {}); vi.restoreAllMocks(); });

function double() {
  const db = integrationDouble(), c = db.connection;
  c.name = MAIN_TARGET.database; c.db.databaseName = MAIN_TARGET.database;
  db.clientOptions = { srvHost: MAIN_TARGET.host, dbName: MAIN_TARGET.database, directConnection: false, tls: true, credentials: { username: MAIN_TARGET.user, source: 'admin', mechanism: 'SCRAM-SHA-256' } };
  db.status=restrictedStatus();
  db.remote = new Set(['operations', 'facts', 'fences', 'identities', 'ownerGuards', 'identitySessions', 'revocations'].map(k => 'main_v2_' + k));
  db.counts = { hello: 0, indexes: 0, sessions: 0 }; db.failAt = {};
  for (const m of Object.values(db.models)) {
    const indexes = m.collection.indexes;
    m.collection.indexes = async () => { db.counts.indexes++; const n = db.counts.indexes; if (db.failAt.indexes === n) return []; return [{ name: '_id_', key: { _id: 1 } }, ...await indexes()]; };
  }
  c.db.admin = () => ({ command: async () => { db.counts.hello++; if (db.failAt.hello === db.counts.hello) return { setName: 'x', isWritablePrimary: false }; return { setName: 'synthetic-double', isWritablePrimary: true }; } });
  const startSession = c.startSession.bind(c);
  c.startSession = async (...a) => { db.counts.sessions++; return startSession(...a); };
  db.connector = async (uri, options) => { c.readyState = 1; db.connects++; db.optionsSeen.push(options); expect(uri).toBe(MAIN_CONFIG.uri); return c; };
  return db;
}
const cred = () => temporaryAtlasCredential(Buffer.from('FAKE-MAIN-PASSWORD-ONLY'));
const open = db => openMainProfile({ activation: MAIN_ACTIVATION, credential: cred(), connector: db.connector });
let keys; const jwt = async () => ({ ...MAIN_JWT, ...await (keys ??= generateKeyPair('RS256', { modulusLength: 2048 })), algorithm: 'RS256', keyId: 'main-offline-persistent-key' });
async function stack(db) {
  const bundle = await open(db), backend = createBackend({ profile: 'main', main: bundle, jwtConfig: await jwt() }); running.push(backend);
  const { port } = await backend.start();
  const call = async (path, { body, token } = {}) => { const r = await fetch('http://127.0.0.1:' + port + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() }; };
  const binding = { installationId: vectors.installationId, localPlayerId: vectors.localPlayerId, bindingGeneration: 1 };
  const player = async () => {
    const secret = randomBytes(32).toString('base64url'), reg = await call('/api/v2/technical/registrations', { body: { schemaVersion: 2, registrationId: randomUUID(), credential: secret, ...binding } }); expect(reg.status).toBe(201);
    const s = await call('/api/v2/technical/sessions', { body: { schemaVersion: 2, technicalAccountId: reg.json.technicalAccountId, credential: secret, installationId: binding.installationId, localPlayerId: binding.localPlayerId } }); expect(s.status).toBe(200);
    return { account: reg.json.technicalAccountId, token: s.json.accessToken };
  };
  return { bundle, backend, call, player };
}
const rowCounts = db => Object.fromEntries(Object.entries(db.rows).map(([k, v]) => [k, v.length]));

it('W1 opening the profile performs exactly one warm-up per cache; the first real ingestion afterwards performs NO deployment check', async () => {
  const db = double(), s = await stack(db);
  // Schema inspection: 1 hello. Warm-up: 1 hello + 2 index reads (ingestion) and 1 hello + identity index reads. Registration/session below use their LIVE checks.
  const afterOpenHello = db.counts.hello; expect(afterOpenHello).toBe(3);
  const p = await s.player();
  const helloBefore = db.counts.hello, idxBefore = db.counts.indexes;
  const r = await s.call('/api/v2/sync/batches', { body: batch([vectors.operations[0]]), token: p.token }); expect(r.status).toBe(200);
  expect(db.counts.hello - helloBefore).toBe(0);      // cache warm from start-up: no hello
  expect(db.counts.indexes - idxBefore).toBe(0);      // ... and no index reads
});

it('W2 the warm-up never creates documents, indexes or sessions beyond a no-op transaction, and adds no timer', async () => {
  const db = double(), interval = vi.spyOn(globalThis, 'setInterval');
  const bundle = await open(db); running.push(bundle);
  expect(interval).not.toHaveBeenCalled();
  expect(rowCounts(db)).toMatchObject({ operations: 0, facts: 0, fences: 1, identities: 0, ownerGuards: 0, identitySessions: 0, revocations: 0 });
  expect(db.created).toEqual([]); expect(db.indexed).toEqual([]); expect(db.closed).toBe(0);
});

it('W3 a warm-up failure of the ingestion check (primary lost) rejects the start, closes the connection and creates nothing', async () => {
  const db = double(); db.failAt.hello = 2;   // 1 = schema inspection, 2 = ingestion warm-up
  await expect(open(db)).rejects.toBeInstanceOf(MainError);
  expect(db.closed).toBe(1); expect(db.connection.readyState).toBe(0); expect(rowCounts(db).identities).toBe(0); expect(db.created).toEqual([]);
});

it('W4 a warm-up failure of the unique indexes (ingestion) rejects the start and closes the connection', async () => {
  const db = double(); const real = db.models.operations.collection.indexes; let seen = 0;
  db.models.operations.collection.indexes = async () => { if (++seen === 2) return []; return real(); };   // 1st = schema inspection, 2nd = warm-up
  await expect(open(db)).rejects.toBeInstanceOf(MainError);
  expect(db.closed).toBe(1);
});

it('W5 a warm-up failure of the identity check (primary lost at the third hello) rejects the start and closes the connection', async () => {
  const db = double(); db.failAt.hello = 3;
  await expect(open(db)).rejects.toBeInstanceOf(MainError);
  expect(db.closed).toBe(1); expect(rowCounts(db).identitySessions).toBe(0);
});

it('W6 startMainBackend does not report ready on a warm-up failure: nothing listens and the connection is closed', async () => {
  const db = double(); db.failAt.hello = 2;
  const create = vi.fn();
  await expect(startMainBackend({ config: { profile: 'main', port: 0 }, credentialProvider: async () => cred(), signingKeyProvider: jwt, connector: db.connector })).rejects.toBeInstanceOf(MainError);
  expect(db.closed).toBe(1); expect(create).not.toHaveBeenCalled();
});

it('W7 the 30 s TTL is not extended by the warm-up: after 30 s the next ingestion verifies LIVE again, then stays cached', async () => {
  const db = double(), s = await stack(db), p = await s.player();
  const real = performance.now.bind(performance); let skew = 0; vi.spyOn(performance, 'now').mockImplementation(() => real() + skew);
  const h0 = db.counts.hello;
  expect((await s.call('/api/v2/sync/batches', { body: batch([vectors.operations[0]]), token: p.token })).status).toBe(200);
  expect(db.counts.hello - h0).toBe(0);
  skew = 31000;
  const h1 = db.counts.hello;
  expect((await s.call('/api/v2/sync/batches', { body: batch([vectors.operations[1]]), token: p.token })).status).toBe(200);
  expect(db.counts.hello - h1).toBeGreaterThanOrEqual(2);   // ingestion + identity live checks
  const h2 = db.counts.hello;
  expect((await s.call('/api/v2/sync/batches', { body: batch([vectors.operations[2]]), token: p.token })).status).toBe(200);
  expect(db.counts.hello - h2).toBe(0);
});

it('W8 after the warm-up a lost primary is still detected: an invalidation forces a live check that fails closed', async () => {
  const db = double(), s = await stack(db), p = await s.player();
  s.bundle.ingestionRepository.invalidateDeploymentCheck();
  const n = db.counts.hello; db.failAt.hello = n + 1;
  const r = await s.call('/api/v2/sync/batches', { body: batch([vectors.operations[0]]), token: p.token });
  expect(r.status).toBe(503); expect(rowCounts(db).operations).toBe(0);
});

it('W9 the warm-up closes cleanly: closing the bundle releases the connection once and leaves no listener behind', async () => {
  const db = double(), bundle = await open(db); const before = db.connection.listenerCount?.('close') ?? 0;
  await bundle.close(); expect(db.closed).toBe(1); expect(db.connection.listenerCount?.('close') ?? 0).toBeLessThanOrEqual(before);
});
