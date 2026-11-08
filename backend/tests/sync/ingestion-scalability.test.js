import './support/isolation-guard.js';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JwtService } from '../../src/modules/auth/jwt-service.js';
import { CredentialHasher } from '../../src/modules/auth/credential-hasher.js';
import { RateLimiter, RATE_POLICY } from '../../src/middleware/rate-limiter.js';
import { resolveSyncContext } from '../../src/middleware/sync-auth-context.js';
import { integrationStack, stacks } from './support/integration-double.js';
import { A, newBinding, operationsFor, send, fillPlayers, costOfOneNewOperation, snapshotStats } from './support/scalability-scenarios.js';
import { vectors, batch, clone, mutate } from './support/fixture.js';

// Ingestion scalability. Everything runs on the MongoDB DOUBLE (real repositories, real HTTP stack): the counts are exact FOR THE DOUBLE and prove which
// documents the code asks for and writes; they say nothing about Atlas latency, throughput or server-side cost.
afterEach(async () => { for (const s of stacks.splice(0)) await s.backend.close({ graceMs: 100 }).catch(() => {}); });
const FACTS_AND_OPERATIONS = ['operations', 'facts'];
const later = s => { s.clock.value += 2 * 3600_000; };   // frozen test clock: move it so per-IP registration windows reset (tokens are used first)
const fresh = async () => { const s = await integrationStack(); await s.listen(); return s; };
const ingestionReads = s => s.db.findLog.filter(f => FACTS_AND_OPERATIONS.includes(f.name));
const stat = (s, name, field) => s.db.stats.perName[name]?.[field] ?? 0;
const row = (s, name, id) => s.db.rows[name].find(r => r._id === id);

it('SC01 the cost of one operation does not depend on how many records OTHER players accumulated', async () => {
  const costs = [];
  for (const others of [0, 2, 6]) { const r = await costOfOneNewOperation(others); costs.push(r); expect(r.status).toBe(200); expect(r.committed).toBe(1); }
  expect(costs.map(c => c.accumulatedOperations)).toEqual([0, 126, 378]);
  const shape = c => ({ finds: c.stats.finds, docsRead: c.stats.docsRead, writes: c.stats.writes, upserts: c.stats.upserts, unchanged: c.stats.unchangedRewrites, counts: c.stats.counts });
  expect(shape(costs[1])).toEqual(shape(costs[0])); expect(shape(costs[2])).toEqual(shape(costs[0]));        // identical with 0, 126 and 378 foreign records
  for (const c of costs) {
    expect(c.stats.perName.operations.docsRead).toBe(0); expect(c.stats.perName.facts.docsRead).toBe(0);
    expect(c.stats.unchangedRewrites).toBe(0); expect(c.stats.perName.operations.writes).toBe(1); expect(c.stats.perName.facts.writes).toBe(1);
    expect(c.stats.perName.operations.upserts).toBe(1); expect(c.stats.perName.facts.upserts).toBe(1);
    await c.stack.backend.close({ graceMs: 100 });
  }
});

it('SC02 more than 1000 records accumulated across many players are accepted; nobody is blocked by the others\' totals', async () => {
  const s = await fresh(); const t = Date.now();
  const players = await fillPlayers(s, 18);                                             // 18 x 63 = 1134 operations
  expect(players.every(p => p.response.status === 200 && p.response.json.counters.committed === 63)).toBe(true);
  expect(s.db.rows.operations).toHaveLength(18 * 63); expect(s.db.rows.facts).toHaveLength(18 * 63); expect(s.db.rows.operations.length).toBeGreaterThan(1000);
  // Every player can still read receipts, resend and extend history with the store far past the old global cap.
  later(s); const first = players[0].player; first.token = await first.login();
  const again = await send(s, first, operationsFor(first.binding).slice(60)); expect(again.json.counters.duplicate).toBe(3);
  later(s); const extra = newBinding(); const late = await s.player(extra);
  const one = await send(s, late, operationsFor(extra).slice(0, 1)); expect(one.status).toBe(200); expect(one.json.counters.committed).toBe(1);
  expect(Date.now() - t).toBeLessThan(120000);
});

it('SC03 a player with a long history pays for its own history only, and a duplicate lookup reads two documents', async () => {
  const s = await fresh(); const p = await s.player(A); const ops = operationsFor(A);
  await send(s, p, ops);
  s.db.resetStats(); const dup = await send(s, p, ops.slice(62));
  expect(dup.json.counters.duplicate).toBe(1);
  expect(s.db.stats.perName.operations.docsRead).toBe(2); expect(s.db.stats.perName.facts.docsRead).toBe(2);       // the operation and its fact: not the 63
  expect(stat(s, 'operations', 'writes') + stat(s, 'facts', 'writes')).toBe(0);
  // Re-sending the whole history: a bounded number of reads per operation, never a scan of the collection, and nothing rewritten.
  s.db.resetStats(); const all = await send(s, p, ops);
  expect(all.json.counters.duplicate).toBe(63);
  expect(s.db.stats.perName.operations.docsRead).toBeLessThanOrEqual(63 * 4); expect(s.db.stats.perName.operations.writes).toBe(0); expect(s.db.stats.unchangedRewrites).toBe(0);
});

it('SC04 small batches and repeated batches: idempotent, same receipts, no rewriting, no growth', async () => {
  const s = await fresh(); const p = await s.player(A); const ops = operationsFor(A); const receipts = new Map();
  for (let i = 0; i < ops.length; i += 5) {
    const r = await send(s, p, ops.slice(i, i + 5)); expect(r.status).toBe(200);
    for (const x of r.json.results) receipts.set(x.operationId, x.receipt);
  }
  expect(s.db.rows.operations).toHaveLength(63);
  const before = clone(s.db.rows.operations), beforeFacts = clone(s.db.rows.facts);
  s.db.resetStats();
  for (let i = 0; i < ops.length; i += 7) {
    const r = await send(s, p, ops.slice(i, i + 7)); expect(r.status).toBe(200);
    for (const x of r.json.results) { expect(x.status).toBe('duplicate'); expect(x.receipt).toEqual(receipts.get(x.operationId)); }
  }
  expect(s.db.rows.operations).toEqual(before); expect(s.db.rows.facts).toEqual(beforeFacts);
  expect(s.db.stats.upserts).toBe(0); expect(s.db.stats.unchangedRewrites).toBe(0);
  expect(s.db.writeLog.filter(w => FACTS_AND_OPERATIONS.includes(w.name))).toEqual([]);
});

it('SC05 players working at the same time do not conflict with each other; one player working twice still stays consistent', async () => {
  const s = await fresh(); const bindings = [A, newBinding(), newBinding(), newBinding()]; const players = [];
  for (const b of bindings) { const p = await s.player(b); p.binding = b; players.push(p); }      // registered at the same instant: tokens stay valid
  s.db.conflicts = 0;
  const responses = await Promise.all(players.map(p => send(s, p, operationsFor(p.binding))));
  expect(responses.every(r => r.status === 200 && r.json.counters.committed === 63)).toBe(true);
  expect(s.db.conflicts).toBe(0);                                        // no write-write conflict between different owners (the old shared fence caused them)
  expect(s.db.rows.operations).toHaveLength(4 * 63);
  // The same owner sending the same batch twice concurrently: each operation exists exactly once, every answer is a valid receipt.
  const same = newBinding(); const q = await s.player(same); const ops = operationsFor(same).slice(0, 10);
  const pair = await Promise.all([send(s, q, ops), send(s, q, ops)]);
  expect(pair.every(r => r.status === 200 || r.status === 207 || r.status === 503)).toBe(true);
  const stored = s.db.rows.operations.filter(o => o.technicalAccountId === q.accountId);
  expect(new Set(stored.map(o => o.operationId)).size).toBe(stored.length); expect(stored.length).toBeLessThanOrEqual(10);
  const settle = await send(s, q, ops); expect(settle.json.counters.committed + settle.json.counters.duplicate).toBe(10);
  expect(s.db.rows.operations.filter(o => o.technicalAccountId === q.accountId)).toHaveLength(10);
});

it('SC06 revocation before ingestion stops everything before any ingestion read or write; ingestion before revocation is kept intact', async () => {
  const s = await fresh(); const a = await s.player(A); const b = newBinding(); const other = await s.player(b);
  const jwt = new JwtService({ config: s.jwtConfig, repository: s.bundle.identityRepository, hasher: new CredentialHasher(), limiter: new RateLimiter({ now: s.now }), policy: RATE_POLICY, now: s.now, version: 2 });
  const context = async token => resolveSyncContext(await jwt.authenticate(token), token, s.bundle.identityRepository, s.now);
  const ops = operationsFor(A);
  expect((await send(s, a, ops.slice(0, 20))).status).toBe(200);                      // ingestion before revocation
  const kept = clone(s.db.rows.operations), keptFacts = clone(s.db.rows.facts);
  await s.bundle.identityRepository.revoke(await context(a.token), { commandId: randomUUID(), kind: 'identity' });
  s.db.resetStats();
  const denied = await send(s, a, ops.slice(20, 30));                                  // revocation before this ingestion
  expect(denied.status).toBe(401);
  expect(ingestionReads(s)).toEqual([]);                                               // not a single operations/facts query was issued
  expect(stat(s, 'operations', 'writes') + stat(s, 'facts', 'writes')).toBe(0);
  expect((await s.call('/api/v2/sync/receipts/query', { method: 'POST', token: a.token, body: { schemaVersion: 2, attempts: [{ operationId: ops[0].operationId, payloadHash: ops[0].payloadHash, leaseId: randomUUID(), attempt: 1 }] } })).status).toBe(401);
  expect(s.db.rows.operations).toEqual(kept); expect(s.db.rows.facts).toEqual(keptFacts);   // what was accepted earlier is untouched
  const fine = await send(s, other, operationsFor(b).slice(0, 5)); expect(fine.status).toBe(200);   // other players unaffected
});

it('SC07 lost response: an unknown commit is not acknowledged, the receipt query finds what was stored and the retry returns the same receipt', async () => {
  const s = await fresh(); const p = await s.player(A); const op = operationsFor(A)[0];
  s.db.failure = 'unknown';
  const lost = await send(s, p, [op]); expect(lost.status).toBeGreaterThanOrEqual(500); expect(lost.text).not.toContain('receipt');
  const query = await s.call('/api/v2/sync/receipts/query', { method: 'POST', token: p.token, body: { schemaVersion: 2, attempts: [{ operationId: op.operationId, payloadHash: op.payloadHash, leaseId: randomUUID(), attempt: 2 }] } });
  expect(query.status).toBe(200); expect(query.json.results[0].status).toBe('found');
  s.db.resetStats();
  const retry = await send(s, p, [op]);
  expect(retry.json.results[0].status).toBe('duplicate'); expect(retry.json.results[0].receipt).toEqual(query.json.results[0].receipt);
  expect(s.db.rows.operations).toHaveLength(1); expect(s.db.stats.perName.operations.writes).toBe(0);
  // Receipt queries read only the requested ids, for the caller only.
  const ops = operationsFor(A); await send(s, p, ops);
  s.db.resetStats(); s.db.trackReads = true;
  const wanted = ops.slice(0, 3).map(o => ({ operationId: o.operationId, payloadHash: o.payloadHash, leaseId: randomUUID(), attempt: 1 }));
  const found = await s.call('/api/v2/sync/receipts/query', { method: 'POST', token: p.token, body: { schemaVersion: 2, attempts: wanted } });
  expect(found.json.results.every(r => r.status === 'found')).toBe(true); expect(s.db.stats.perName.operations.docsRead).toBe(3);
});

it('SC08 operationId conflicts stay conflicts, ids are per owner, and an alias of a stored fact adds one operation and no fact', async () => {
  const s = await fresh(); const a = await s.player(A); const bBinding = newBinding(); const b = await s.player(bBinding);
  const ops = operationsFor(A); await send(s, a, ops.slice(0, 10));
  const other = ops.slice(1, 10).find(o => !o.dependencies.includes(ops[0].operationId) && o.payloadHash !== ops[0].payloadHash);
  const changed = { ...clone(other), operationId: ops[0].operationId };                                // same operationId, different content
  s.db.resetStats(); const clash = await send(s, a, [changed]);
  expect(clash.json.results[0].status).toBe('conflict'); expect(clash.json.results[0].error.code).toBe('idempotency_conflict');
  expect(stat(s, 'operations', 'writes') + stat(s, 'facts', 'writes')).toBe(0);
  expect((await send(s, b, operationsFor(bBinding).slice(0, 1))).json.counters.committed).toBe(1);   // the same operationId under another owner is a different record
  const probe = await s.call('/api/v2/sync/receipts/query', { method: 'POST', token: b.token, body: { schemaVersion: 2, attempts: [{ operationId: ops[1].operationId, payloadHash: ops[1].payloadHash, leaseId: randomUUID(), attempt: 1 }] } });
  expect(probe.json.results[0].status).toBe('not_found');
  // Alias: same fact, new operationId.
  const factsBefore = s.db.rows.facts.length, opsBefore = s.db.rows.operations.length;
  s.db.resetStats(); const alias = await send(s, a, [mutate(ops[0], () => {}, { newId: true })]);
  expect(alias.json.results[0].status).toBe('duplicate');
  expect(s.db.rows.facts).toHaveLength(factsBefore); expect(s.db.rows.operations).toHaveLength(opsBefore + 1);
  expect(s.db.stats.perName.facts.writes).toBe(0); expect(s.db.stats.perName.operations.upserts).toBe(1);
});

it('SC09 documents of other players and earlier history are never read for, nor rewritten by, an operation', async () => {
  const s = await fresh(); const a = await s.player(A); const bBinding = newBinding(); const b = await s.player(bBinding);
  await send(s, a, operationsFor(A)); await send(s, b, operationsFor(bBinding).slice(0, 30));
  const before = clone(s.db.rows); s.db.resetStats(); s.db.trackReads = true;
  const r = await send(s, b, operationsFor(bBinding).slice(30, 31)); expect(r.json.counters.committed).toBe(1);
  // Reads: nothing of A's was ever returned by a query.
  const foreign = s.db.readLog.filter(x => x.technicalAccountId === a.accountId || String(x.scope ?? '').startsWith(a.accountId) || String(x._id).includes(a.accountId));
  expect(foreign).toEqual([]);
  // Writes: only B's new operation/fact and B's own guard/fence; none of A's and none of B's earlier documents.
  const written = s.db.writeLog.map(w => `${w.name}|${w._id}`);
  expect(written.filter(w => w.includes(a.accountId))).toEqual([]);
  expect(written.filter(w => w.startsWith('operations|') || w.startsWith('facts|'))).toHaveLength(2);
  for (const name of ['identities', 'identitySessions']) expect(s.db.rows[name].length).toBe(before[name].length);
  for (const name of FACTS_AND_OPERATIONS) for (const doc of before[name]) expect(row(s, name, doc._id)).toEqual(doc);        // every pre-existing document is byte-identical
  expect(s.db.rows.operations).toHaveLength(before.operations.length + 1);
  // No unfiltered scans anywhere in the ingestion path.
  for (const f of ingestionReads(s)) expect(Object.keys(f.filter).length, f.name).toBeGreaterThan(0);
  for (const f of ingestionReads(s)) expect(JSON.stringify(f.filter), f.name).toMatch(/technicalAccountId|scope|_id/);
});

it('SC10 integrity checks stay per record: a damaged document of one player is detected for that player and does not block the others', async () => {
  const s = await fresh(); const a = await s.player(A); const bBinding = newBinding(); const b = await s.player(bBinding);
  const ops = operationsFor(A); await send(s, a, ops.slice(0, 10)); await send(s, b, operationsFor(bBinding).slice(0, 5));
  const stored = s.db.rows.operations.find(o => o.technicalAccountId === a.accountId && o.operationId === ops[2].operationId);
  stored.authorizationDecision.owner = 'someone-else';                                              // tampering
  const hit = await send(s, a, [ops[2]]); expect(hit.status).toBeGreaterThanOrEqual(500);
  const fine = await send(s, b, operationsFor(bBinding).slice(5, 8)); expect(fine.status).toBe(200); expect(fine.json.counters.committed).toBe(3);
  stored.authorizationDecision.owner = a.accountId;
  const opDoc = s.db.rows.operations.find(o => o.technicalAccountId === a.accountId && o.operationId === ops[3].operationId);
  const factDoc = s.db.rows.facts.find(f => f._id === opDoc.record.factKey); const keep = factDoc.record.canonicalPayload;
  const lastOp = s.db.rows.operations.find(o => o.technicalAccountId === a.accountId && o.operationId === ops[9].operationId);
  const unrelated = s.db.rows.facts.find(f => f._id === lastOp.record.factKey);          // a later fact: not an ancestor of ops[2] or ops[3]      // damage that this operation never reads is not its business
  const unrelatedKeep = unrelated.record.canonicalPayload; unrelated.record.canonicalPayload = unrelatedKeep.replace(/"/, ' "');
  expect((await send(s, a, [ops[2]])).status).toBe(200); unrelated.record.canonicalPayload = unrelatedKeep;
  factDoc.record.canonicalPayload = keep.replace(/"/, ' "');                                         // payload no longer canonical
  expect((await send(s, a, [ops[3]])).status).toBeGreaterThanOrEqual(500);
  factDoc.record.canonicalPayload = keep;
  expect((await send(s, a, ops.slice(0, 10))).status).toBe(200);                                     // restored: works again
});

it('SC11 capacity is still limited: per player (the former 1000 became a per-owner quota) and over the whole store (a separate, larger valve)', async () => {
  const s = await fresh(); const repo = s.bundle.ingestionRepository;
  expect(repo.maxRecords).toBe(1000); expect(repo.maxTotalRecords).toBe(50000);
  expect(repo.fenceMode).toBe('owner');
  repo.maxRecords = 40;                                                                              // test-only: shrink the per-owner quota
  const a = await s.player(A); const first = await send(s, a, operationsFor(A));
  expect(first.json.counters.committed).toBe(40); expect(first.json.results.filter(r => r.error?.code === 'quota_exceeded').length).toBeGreaterThan(0);
  expect(first.json.results.every(r => r.receipt || r.error.retryable)).toBe(true);   // everything over the quota is retryable, nothing is silently dropped
  expect(first.json.results.filter(r => r.error?.code === 'quota_exceeded').every(r => r.error.retryable)).toBe(true);
  expect(s.db.rows.operations).toHaveLength(40);
  later(s); const bBinding = newBinding(); const b = await s.player(bBinding);                        // another player is not affected by A's quota
  expect((await send(s, b, operationsFor(bBinding).slice(0, 30))).json.counters.committed).toBe(30);
  // Duplicates of stored operations are still answered at quota.
  a.token = await a.login();
  expect((await send(s, a, operationsFor(A).slice(0, 5))).json.counters.duplicate).toBe(5);
  repo.maxRecords = 1000; repo.maxTotalRecords = 70;                                                 // whole-store valve
  later(s); const c = newBinding(); const cp = await s.player(c);
  const blocked = await send(s, cp, operationsFor(c).slice(0, 3)); expect(blocked.status).toBe(503); expect(blocked.json.results[0].error.code).toBe('quota_exceeded'); expect(blocked.json.results.every(r => !r.receipt && r.error.retryable)).toBe(true);
  expect(s.db.rows.operations).toHaveLength(70);
});

it('SC12 the whole-state snapshot used by diagnostics still verifies every stored record; the engine rejects invalid capacity settings', async () => {
  const s = await fresh(); const p = await s.player(A); await send(s, p, operationsFor(A).slice(0, 12));
  const snapshot = await s.bundle.ingestionRepository.snapshot();
  expect(snapshot.operations).toHaveLength(12); expect(snapshot.facts).toHaveLength(12);
  const { IngestionEngine } = await import('../../src/modules/sync/ingestion-engine.js');
  for (const bad of [{ maxRecords: 0 }, { maxRecords: 10001 }, { maxTotalRecords: 5 }, { maxTotalRecords: 2000000 }, { maxTotalRecords: 1.5 }])
    expect(() => new IngestionEngine({ synthetic: true, coordinator: s.bundle.ingestionRepository.coordinator, identityRepository: s.bundle.identityRepository, maxRecords: 1000, ...bad }), JSON.stringify(bad)).toThrow();
});

it('SC13 the adapter source has no unfiltered query on the ingestion path and the HTTP contracts are unchanged', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const text = fs.readFileSync(root + 'src/modules/sync/mongo-ingestion-repository.js', 'utf8');
  const readState = text.slice(text.indexOf('async readState()'), text.indexOf('async #find') > 0 ? text.indexOf('async #find') : undefined);
  const rest = text.replace(readState, '');
  expect(rest).not.toMatch(/\.find\(\s*\{\s*\}/);                                                     // only the diagnostic readState() may scan
  expect(rest).not.toMatch(/maxRecords\+1\)\.lean|limit\(this\.maxRecords\+1\)/);
  expect(text).toMatch(/loadFor:\(context,op\)=>this\.readScoped/);
  expect(text).toMatch(/fenceMode='global'/);                                                          // default = the C.2 behaviour, unchanged
  expect(fs.readFileSync(root + 'src/integration/profile.js', 'utf8')).toMatch(/fenceMode: 'owner'/);   // only the integration profile opts in
  const routes = fs.readFileSync(root + 'src/modules/sync/routes.js', 'utf8');
  expect(routes).toMatch(/\/batches/); expect(routes).toMatch(/\/receipts\/query/);
  expect(snapshotStats).toBeTypeOf('function'); expect(vectors.operations).toHaveLength(63); expect(batch([]).schemaVersion).toBe(2);
});
