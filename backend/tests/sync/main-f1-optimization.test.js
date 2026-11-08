import './support/isolation-guard.js';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fixture, vectors, clone, mutate, resources } from './support/fixture.js';
import { instrumented, productionLike } from './support/latency-harness.js';
import { dumpPipeline } from './support/f1-differential.js';
import { MongoIdentityRepository } from '../../src/modules/auth/mongo-identity-repository.js';
import { mongoIdentityModels } from '../../src/modules/auth/mongo-identity-models.js';
import { DeploymentCheck, DEPLOYMENT_TTL_MS, watchConnection, keepWarm } from '../../src/modules/sync/deployment-check.js';

// B34 (F1): acceptance tests T1-T19 + unit tests U1-U6 of the deployment-check cache and the per-transaction memo. Offline: the real repositories on the Mongo double, with a
// fake clock for the cache TTL. Existing suites are untouched.
afterEach(async () => { for (const f of resources.splice(0)) await f.close(); vi.restoreAllMocks(); });
const op = i => clone(vectors.operations[i]);
const golden = JSON.parse(fs.readFileSync(new URL('./support/f1-golden.json', import.meta.url), 'utf8'));

// Production-like composition (owner fence, no test authorization fence) with a fake clock for BOTH repositories' deployment caches.
async function setup({ clock = { t: 0 }, extra = {} } = {}) {
  const h = await instrumented(0), dep = { now: () => clock.t, ...extra };
  h.db.factory.identityFactory = ({ now }) => new MongoIdentityRepository({ connection: h.db.connection, models: mongoIdentityModels(h.db.connection), synthetic: true, now, deployment: dep });
  const f = await fixture({ repositoryFactory: productionLike(h.db, { deployment: dep }) });
  return { ...h, f, clock };
}
const rowsOf = db => ({ operations: clone(db.rows.operations), facts: clone(db.rows.facts) });
const originalIndexes = db => Object.fromEntries(['operations', 'facts', 'identities', 'identitySessions'].map(k => [k, db.models[k].collection.indexes]));

it('T1 round trips: warm first send <= 16 and warm identical re-send <= 10 (targets 14 / 8; before F1: 34 / 26); no deployment check, 1 account read and 1 session read per transaction', async () => {
  const { f, db, reset, snapshot } = await setup();
  reset(); const cold = await f.ingest([op(0)]); const coldTrips = snapshot();
  reset(); const warm = await f.ingest([op(1)]); const warmTrips = snapshot();
  reset(); const dup = await f.ingest([op(1)]); const resend = snapshot();
  expect(cold.body.results[0].status).toBe('committed'); expect(warm.body.results[0].status).toBe('committed'); expect(dup.body.results[0].status).toBe('duplicate');
  expect(warmTrips.total).toBeLessThanOrEqual(16); expect(resend.total).toBeLessThanOrEqual(10); expect(coldTrips.total).toBeLessThanOrEqual(24);
  for (const t of [warmTrips, resend]) { expect(t.by.hello ?? 0).toBe(0); expect(t.by.listIndexes ?? 0).toBe(0); expect(t.by['find:identities']).toBeLessThanOrEqual(2); expect(t.by['find:identitySessions']).toBeLessThanOrEqual(2); }
  expect(coldTrips.by.hello).toBe(2); expect(coldTrips.by.listIndexes).toBe(5);   // the cold path still performs the live check of both repositories
  expect(db.rows.operations).toHaveLength(2);
});

it('T2 concurrency: concurrent first operations share ONE live deployment check per repository (single flight)', async () => {
  const a = await setup();
  a.reset(); await Promise.all(Array.from({ length: 6 }, () => a.f.repository.warmDeploymentCheck()));
  expect(a.snapshot().by.hello).toBe(1); expect(a.snapshot().by.listIndexes).toBe(2); expect(a.snapshot().by['find:fences'] ?? 0).toBe(0);   // the seed is read inside each transaction, not by the cached check
  const b = await setup();
  b.reset(); const results = await Promise.all(Array.from({ length: 6 }, () => b.f.ingest([op(0)])));
  // The double gives each transaction 3 attempts: with more than 3 contenders the losers answer 503/deferred, exactly as the pre-F1 code does (measured in B34);
  // what matters here is that no contender fails because of the cache and that exactly one effect exists.
  expect(results.every(r => [200, 503].includes(r.status))).toBe(true); expect(results.filter(r => r.status === 200).length).toBeGreaterThanOrEqual(3);
  expect(b.db.rows.operations).toHaveLength(1);
  expect(b.snapshot().by.hello).toBeLessThanOrEqual(2); expect(b.snapshot().by.listIndexes).toBeLessThanOrEqual(5);   // ingestion check + identity check, once each (was 2 + 5 PER operation)
});

it('T3 concurrency: identical concurrent sends have one effect (one operation, one fact, one receipt, the rest duplicates)', async () => {
  const { f, db } = await setup();
  // 3 contenders: all answer 200 (1 committed + 2 duplicates). 6 contenders: the losers of the double's 3 attempts answer deferred (same as pre-F1), one effect only,
  // and their stable-id retry converges to the SAME receipt.
  const three = await Promise.all(Array.from({ length: 3 }, () => f.ingest([op(0)])));
  expect(three.map(r => r.body.results[0].status).sort()).toEqual(['committed', 'duplicate', 'duplicate']);
  const six = await Promise.all(Array.from({ length: 6 }, () => f.ingest([op(0)])));
  expect(six.every(r => ['duplicate', 'deferred'].includes(r.body.results[0].status))).toBe(true);
  expect(db.rows.operations).toHaveLength(1); expect(db.rows.facts).toHaveLength(1);
  const retry = await f.ingest([op(0)]);
  expect(retry.body.results[0].status).toBe('duplicate');
  expect(new Set([...three, ...six, retry].filter(r => r.body.results[0].receipt).map(r => r.body.results[0].receipt.receiptId)).size).toBe(1);
});

it('T4 authorization under concurrency: a revocation racing an ingestion never leaves an operation committed AFTER the revocation, nor a committed receipt without a row', async () => {
  for (let i = 0; i < 6; i++) {
    const { f, db } = await setup();
    const outcomes = await Promise.allSettled([f.ingest([op(0)]), f.identity.revoke(f.ctx, { commandId: randomUUID() })]);
    const ingest = outcomes[0].status === 'fulfilled' ? outcomes[0].value : null;
    const committedReceipt = ingest?.body?.results?.[0]?.status === 'committed';
    if (committedReceipt) expect(db.rows.operations).toHaveLength(1);                        // an ACK always has its row
    if (ingest && [401, 403].includes(ingest.status)) expect(db.rows.operations).toHaveLength(0);
    if (db.rows.operations.length === 1 && db.rows.revocations.length === 1) expect(db.rows.operations[0].authorizationDecision.revision).toBeLessThan(db.rows.revocations[0].revision);
    expect(db.rows.operations.length).toBeLessThanOrEqual(1); expect(db.rows.facts.length).toBe(db.rows.operations.length);
  }
});

it('T5 authorization regression: a revocation takes effect on the very next operation even while the deployment cache is fresh', async () => {
  const { f, db, reset, snapshot } = await setup();
  expect((await f.ingest([op(0)])).status).toBe(200);
  await f.identity.revoke(f.ctx, { commandId: randomUUID() });
  reset(); const r = await f.ingest([op(1)]);
  expect(r.status).toBe(401); expect(db.rows.operations).toHaveLength(1);
  expect(snapshot().by.hello ?? 0).toBe(0);                                                     // the cache was in use: the 401 does not come from a fresh deployment check
});

it('T6 partial errors: after a storage failure the cache is dropped and the next operation verifies LIVE; retries of stable ids converge', async () => {
  for (const mode of ['before', 'rollback', 'unknown']) {
    const { f, db, reset, snapshot } = await setup();
    expect((await f.ingest([op(0)])).status).toBe(200);
    db.failure = mode; reset(); const failed = await f.ingest([op(1)]);
    expect(failed.status).toBe(503); expect(failed.body.results[0].receipt).toBeUndefined();
    expect(db.rows.operations).toHaveLength(mode === 'unknown' ? 2 : 1);                         // unknown commit: the row exists but no ACK was emitted
    reset(); const retry = await f.ingest([op(1)]);
    expect(retry.status).toBe(200); expect(retry.body.results[0].status).toBe(mode === 'unknown' ? 'duplicate' : 'committed');
    expect(snapshot().by.hello).toBeGreaterThanOrEqual(1);                                       // live verification after the failure
    expect(db.rows.operations).toHaveLength(2); expect(db.rows.facts).toHaveLength(2);
  }
  const { f, db, reset, snapshot } = await setup();
  await f.ingest([op(0)]); db.failure = 'transient'; reset();
  expect((await f.ingest([op(1)])).status).toBe(200); expect(snapshot().by.hello ?? 0).toBe(0);  // a transient conflict retried by the driver is not a deployment failure
});

it('T7 expiry: after the TTL a missing unique index is detected, the operation fails closed without writing, and recovery needs a successful live check', async () => {
  const { f, db, clock } = await setup(), saved = originalIndexes(db);
  expect((await f.ingest([op(0)])).status).toBe(200);
  db.models.operations.collection.indexes = async () => [];
  clock.t += DEPLOYMENT_TTL_MS + 1;
  const before = rowsOf(db), r = await f.ingest([op(1)]);
  expect(r.status).toBe(503); expect(rowsOf(db)).toEqual(before);
  expect((await f.ingest([op(1)])).status).toBe(503);                                           // a failure is never cached as success
  db.models.operations.collection.indexes = saved.operations;
  expect((await f.ingest([op(1)])).status).toBe(200);
});

it('T8 within the TTL the ingestion stays correct and idempotent even if the secondary unique indexes disappear (identity is the _id of operations and facts)', async () => {
  const { f, db } = await setup();
  expect((await f.ingest([op(0)])).status).toBe(200);
  db.models.operations.collection.indexes = async () => []; db.models.facts.collection.indexes = async () => [];
  const a = await f.ingest([op(1)]), b = await f.ingest([op(1)]);
  expect(a.body.results[0].status).toBe('committed'); expect(b.body.results[0].status).toBe('duplicate'); expect(b.body.results[0].receipt).toEqual(a.body.results[0].receipt);
  expect(db.rows.operations).toHaveLength(2); expect(db.rows.facts).toHaveLength(2);
});

it('T9 registration, session and revocation keep the LIVE checks (a missing identity index rejects immediately, inside the TTL)', async () => {
  const { f, db, reset, snapshot } = await setup(), saved = originalIndexes(db);
  await f.ingest([op(0)]);
  reset(); const ctx = await f.renew(); expect(snapshot().by.listIndexes).toBeGreaterThanOrEqual(3); expect(snapshot().by.hello).toBeGreaterThanOrEqual(1);   // session creation: live
  reset(); await f.identity.revoke(ctx, { commandId: randomUUID(), kind: 'session', target: ctx.sessionId }); expect(snapshot().by.listIndexes).toBeGreaterThanOrEqual(3); expect(snapshot().by.hello).toBeGreaterThanOrEqual(1);   // revocation: live
  db.models.identities.collection.indexes = async () => [];
  const identities = db.rows.identities.length;
  await expect(f.auth.register({ registrationId: randomUUID(), credential: randomBytes(32).toString('base64url'), installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 }, 'ip')).rejects.toMatchObject({ status: 503 });
  expect(db.rows.identities).toHaveLength(identities);
  db.models.identities.collection.indexes = saved.identities;
});

it('T10 the memo of account/session documents lives inside one transaction ATTEMPT: never across transactions, never across driver retries', async () => {
  const a = await setup();
  await a.f.ingest([op(0)]);
  const i = a.db.rows.identities.findIndex(r => r._id === a.f.accountId); a.db.rows.identities[i] = { ...a.db.rows.identities[i], active: false };   // changed by "someone else" between transactions
  const r = await a.f.ingest([op(1)]); expect(r.status).toBe(401); expect(a.db.rows.operations).toHaveLength(1);
  const b = await setup();
  await b.f.ingest([op(0)]); b.db.failure = 'transient'; b.reset();
  expect((await b.f.ingest([op(1)])).status).toBe(200); expect(b.snapshot().by['find:identities']).toBeGreaterThanOrEqual(2);   // the retried attempt read again
});

async function twoAccounts() {
  const s = await setup(), dep = { now: () => s.clock.t };
  const binding = { installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 };
  const g = await fixture({ repositoryFactory: productionLike(s.db, { deployment: dep }), binding });
  const forB = i => mutate(op(i), e => { e.installationId = binding.installationId; e.localPlayerId = binding.localPlayerId; });
  return { ...s, g, forB };
}

it('T11 identity isolation: two accounts sending the same operationId and sourceKey do not collide', async () => {
  const { f, g, db, forB } = await twoAccounts();
  const a = await f.ingest([op(0)]), b = await g.ingest([forB(0)]);
  expect(a.body.results[0].status).toBe('committed'); expect(b.body.results[0].status).toBe('committed');
  expect(db.rows.operations).toHaveLength(2); expect(new Set(db.rows.operations.map(o => o._id)).size).toBe(2);
  expect(a.body.results[0].receipt.receiptId).not.toBe(b.body.results[0].receipt.receiptId);
});

it('T12 identity isolation: an account cannot obtain another account\'s receipts', async () => {
  const { f, g } = await twoAccounts(), x = op(0);
  await f.ingest([x]);
  const query = { schemaVersion: 2, attempts: [{ operationId: x.operationId, payloadHash: x.payloadHash, leaseId: randomUUID(), attempt: 1 }] };
  expect((await g.service.receipts(g.ctx, query)).results[0].status).toBe('not_found');
  expect((await f.service.receipts(f.ctx, query)).results[0].status).toBe('found');
});

it('T13 identity isolation: revoking A does not affect B, and the owner of every stored operation is its own account', async () => {
  const { f, g, db, forB } = await twoAccounts();
  await f.ingest([op(0)]); await g.ingest([forB(0)]);
  await f.identity.revoke(f.ctx, { commandId: randomUUID() });
  expect((await f.ingest([op(1)])).status).toBe(401);
  expect((await g.ingest([forB(1)])).status).toBe(200);
  for (const o of db.rows.operations) expect(o.authorizationDecision.owner).toBe(o.technicalAccountId);
  expect(new Set(db.rows.operations.map(o => o.technicalAccountId))).toEqual(new Set([f.accountId, g.accountId]));
});

it('T14 the deployment cache holds no identity data (its whole observable state is empty; it never references an account)', async () => {
  const { f } = await setup();
  await f.ingest([op(0)]);
  for (const check of [f.repository.deployment]) {
    expect(Object.getOwnPropertyNames(check)).toEqual([]); expect(JSON.stringify(check)).toBe('{}'); expect(JSON.stringify(check)).not.toContain(f.accountId);
  }
});

it('T15 receipt consistency: an identical re-send returns the SAME receipt (id, time, hash) and writes nothing new', async () => {
  const { f, db } = await setup();
  const a = await f.ingest([op(0)]), before = rowsOf(db), b = await f.ingest([op(0)]);
  expect(b.body.results[0].status).toBe('duplicate'); expect(b.body.results[0].httpStatus).toBe(200);
  expect(b.body.results[0].receipt).toEqual(a.body.results[0].receipt); expect(rowsOf(db)).toEqual(before);
});

it('T16 a contradictory retry is rejected (409 idempotency_conflict) and the stored original is untouched', async () => {
  const { f, db } = await setup();
  await f.ingest([op(0)]); const before = rowsOf(db);
  const changed = mutate(op(0), e => { e.createdAtUtc = '2026-10-29T00:00:00.000Z'; });
  const r = await f.ingest([changed]);
  expect(r.status).toBe(409); expect(r.body.results[0].error.code).toBe('idempotency_conflict'); expect(rowsOf(db)).toEqual(before);
});

it('T17 receipts/query returns exactly the stored receipt', async () => {
  const { f, db } = await setup(), x = op(0);
  const a = await f.ingest([x]);
  const q = await f.service.receipts(f.ctx, { schemaVersion: 2, attempts: [{ operationId: x.operationId, payloadHash: x.payloadHash, leaseId: randomUUID(), attempt: 1 }] });
  expect(q.results[0].status).toBe('found'); expect(q.results[0].receipt).toEqual(a.body.results[0].receipt); expect(q.results[0].receipt).toEqual(db.rows.operations[0].record.receipt);
});

it('T18 transactional semantics: the owner guard and owner fence still advance by exactly 1 per transaction (committed or duplicate)', async () => {
  const { f, db } = await setup();
  const guard0 = db.rows.ownerGuards.find(r => r._id === f.accountId).revision;
  await f.ingest([op(0)]); await f.ingest([op(0)]); await f.ingest([op(1)]);
  expect(db.rows.ownerGuards.find(r => r._id === f.accountId).revision).toBe(guard0 + 3);
  expect(db.rows.fences.find(r => r._id === 'ingestion-v1:' + f.accountId).revision).toBe(3);
  expect(db.rows.fences.find(r => r._id === 'ingestion-v1').revision).toBe(0);                  // the seed is read, never written
});

it('T19 differential: the 63 C# vectors (sent twice) produce EXACTLY the same normalized responses and stored rows as the pre-F1 code (golden generated from the backup of src/)', async () => {
  expect(golden.default.firstSend.counters.committed).toBe(63);
  const now = { default: await dumpPipeline(), production: await dumpPipeline(db => { const factory = args => db.factory({ ...args, fenceAuthorization: undefined, fenceMode: 'owner' }); factory.identityFactory = db.factory.identityFactory; return factory; }) };
  expect(now.default).toEqual(golden.default);
  expect(now.production).toEqual(golden.production);
}, 120000);

it('U1 DeploymentCheck: fresh within the TTL, live again after it, TTL capped at 30 s, monotonic clock going backwards is never "fresh"', async () => {
  let t = 100, calls = 0; const check = new DeploymentCheck({ now: () => t });
  await check.ensure(async () => { calls++; }); await check.ensure(async () => { calls++; }); expect(calls).toBe(1);
  t += DEPLOYMENT_TTL_MS - 1; await check.ensure(async () => { calls++; }); expect(calls).toBe(1);
  t += 1; await check.ensure(async () => { calls++; }); expect(calls).toBe(2);
  t -= 5000; expect(check.fresh).toBe(false);
  expect(() => new DeploymentCheck({ ttlMs: DEPLOYMENT_TTL_MS + 1 })).toThrow(); expect(() => new DeploymentCheck({ ttlMs: 0 })).toThrow(); expect(() => new DeploymentCheck({ now: 5 })).toThrow();
  expect(DEPLOYMENT_TTL_MS).toBe(30000);
});

it('U2 DeploymentCheck: failures are never cached, concurrent callers share one verification and one failure', async () => {
  let t = 0, calls = 0; const check = new DeploymentCheck({ now: () => t });
  let release; const gate = new Promise(r => { release = r; });
  const settled = Promise.allSettled([1, 2, 3].map(() => check.ensure(async () => { calls++; await gate; throw new Error('incompatible'); })));
  release(); const r = await settled;
  expect(calls).toBe(1); expect(r.every(x => x.status === 'rejected')).toBe(true); expect(check.fresh).toBe(false);
  await check.ensure(async () => { calls++; }); expect(calls).toBe(2); expect(check.fresh).toBe(true);
});

it('U3 DeploymentCheck: an invalidation while a verification is running wins (nothing is recorded) and a stale in-flight check is not joined', async () => {
  let t = 0, calls = 0; const check = new DeploymentCheck({ now: () => t });
  let release; const gate = new Promise(r => { release = r; });
  const slow = check.ensure(async () => { calls++; await gate; });
  check.invalidate(); release(); await slow;
  expect(check.fresh).toBe(false);                                                              // the pre-invalidation verification was not recorded
  let release2; const gate2 = new Promise(r => { release2 = r; });
  const slow2 = check.ensure(async () => { calls++; await gate2; });
  const generation = check.generation; check.invalidate(); expect(check.generation).toBe(generation + 1);
  const fresh = check.ensure(async () => { calls++; });                                          // does not join slow2: it started in an older generation
  await fresh; release2(); await slow2;
  expect(calls).toBe(3); expect(check.fresh).toBe(true);
});

it('U4 watchConnection: connection and topology events invalidate; closing removes the listeners', async () => {
  const connection = new EventEmitter(), client = new EventEmitter(); connection.getClient = () => client;
  let t = 0; const check = new DeploymentCheck({ now: () => t });
  watchConnection(connection, check);
  for (const [emitter, event] of [[connection, 'disconnected'], [connection, 'reconnected'], [connection, 'error'], [client, 'serverDescriptionChanged'], [client, 'topologyDescriptionChanged']]) {
    await check.ensure(async () => {}); expect(check.fresh).toBe(true); emitter.emit(event, {}); expect(check.fresh).toBe(false);
  }
  await check.ensure(async () => {}); connection.emit('close'); expect(check.fresh).toBe(false);
  expect(connection.listenerCount('disconnected')).toBe(0); expect(client.listenerCount('serverDescriptionChanged')).toBe(0);
  expect(() => watchConnection({ getClient() { throw new Error('x'); } }, check)).not.toThrow();   // a connection without an event API is tolerated
});

it('U5 keepWarm is OFF by default and for out-of-range intervals; when on it never keeps the process alive and failures only invalidate', async () => {
  vi.useFakeTimers();
  try {
    let calls = 0; const check = new DeploymentCheck({ now: () => performance.now() });
    for (const bad of [undefined, 0, -1, 30000, 45000, 1.5]) keepWarm(check, async () => { calls++; }, bad)();
    vi.advanceTimersByTime(120000); expect(calls).toBe(0);
    const stop = keepWarm(check, async () => { calls++; throw new Error('down'); }, 10000);
    await vi.advanceTimersByTimeAsync(10000); expect(calls).toBe(1); expect(check.fresh).toBe(false);
    stop(); await vi.advanceTimersByTimeAsync(60000); expect(calls).toBe(1);
  } finally { vi.useRealTimers(); }
});

it('U6 the shipped repositories do not enable keep-warm and do not start any timer or I/O at construction', async () => {
  const { f, reset, snapshot } = await setup();
  reset(); expect(snapshot().total).toBe(0);
  const src = ['src/modules/sync/mongo-ingestion-repository.js', 'src/modules/auth/mongo-identity-repository.js', 'src/main/profile.js'].map(p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8')).join('\n');
  expect(src).not.toMatch(/keepWarmMs\s*:\s*[1-9]/); expect(src).not.toMatch(/setInterval|setTimeout/);
  expect(f.repository.deployment.fresh).toBe(false);
});
