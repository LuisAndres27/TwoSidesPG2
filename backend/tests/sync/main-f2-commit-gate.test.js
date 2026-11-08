import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fixture, vectors, clone, mutate, resources } from './support/fixture.js';
import { instrumented, productionLike } from './support/latency-harness.js';
import { faults, mulberry32 } from './support/f2-faults.js';
import * as budget from '../../src/modules/sync/budget.js';
import { IngestionService } from '../../src/modules/sync/ingestion-service.js';

// B36/B37 (F2): the commit gate. Offline: the real repositories on the Mongo double with fault/latency injection around the commit (support/f2-faults.js).
// Budgets are scaled down (operation 300 ms, grace 600 ms) so that the scenarios run in real time; T1b/T19 use the real defaults (2000 ms / 3000 ms).
// The tests assert the CONTRACT of F2, never the arithmetic of the double.
const unhandled = [];
const onUnhandled = e => unhandled.push(e);
beforeEach(() => { unhandled.length = 0; process.on('unhandledRejection', onUnhandled); budget.resetCommitStats?.(); });
afterEach(async () => { process.off('unhandledRejection', onUnhandled); for (const f of resources.splice(0)) await f.close(); vi.restoreAllMocks(); });

const op = i => clone(vectors.operations[i]);
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
const SMALL = { operationBudgetMs: 300, commitGraceMs: 600 };
async function setup({ budgets = SMALL, rtt = 0 } = {}) {
  const h = await instrumented(rtt), f = await fixture({ repositoryFactory: productionLike(h.db), budgets }), ctl = faults(h.db);
  ctl.reset(); h.reset();
  return { ...h, f, ctl };
}
const first = r => r.body.results[0];
const rowOf = (db, x) => db.rows.operations.find(r => r.operationId === x.operationId);
const noReceipt = r => r.body.results.every(x => x.receipt === undefined);
const isUnavailable = r => r.status === 503 && first(r).status === 'deferred' && first(r).error.code === 'storage_unavailable' && first(r).error.retryable === true;

it('T1 a commit acknowledged AFTER the operation budget is reported as committed, with its receipt (before F2: HTTP 503 with the row persisted)', async () => {
  const { f, db, ctl } = await setup();
  ctl.arm({ ackDelayMs: 450 });                              // the commit is acknowledged 450 ms later: past the 300 ms budget, inside the 600 ms grace
  const x = op(0), r = await f.ingest([x]);
  expect(db.rows.operations).toHaveLength(1);                // it WAS persisted
  expect(r.status).toBe(200); expect(first(r).status).toBe('committed'); expect(first(r).receipt.receiptId).toBe(rowOf(db, x).record.receipt.receiptId);
});

it('T1b same at the REAL defaults: a commit acknowledged after 2.3 s (> 2000 ms) is still reported as committed', async () => {
  const { f, db, ctl } = await setup({ budgets: {} });
  expect(f.service.operationBudgetMs).toBe(2000);
  ctl.arm({ ackDelayMs: 2300 });
  const r = await f.ingest([op(0)]);
  expect(first(r).status).toBe('committed'); expect(db.rows.operations).toHaveLength(1);
}, 20000);

it('T2 success known after the deadline (event loop starved so the timer could not fire) is returned, not turned into 503', async () => {
  const { f, db, ctl } = await setup();
  ctl.arm({ block: 350 });
  const r = await f.ingest([op(0)]);
  expect(db.rows.operations).toHaveLength(1); expect(first(r).status).toBe('committed');
});

it('T3 deadline expiry BEFORE the commit point: 503, nothing is persisted, guard and fence untouched', async () => {
  const { f, db, ctl } = await setup(), before = clone(db.rows);
  ctl.arm({ preDelayMs: 450 });
  const r = await f.ingest([op(0)]); await ctl.settle();
  expect(isUnavailable(r)).toBe(true); expect(noReceipt(r)).toBe(true);
  expect(db.rows).toEqual(before);
});

it('T4 race sweep around the deadline: never an ACK without a row, never a 503 with a row when the work was still before the commit point', async () => {
  const { f, db, ctl } = await setup({ budgets: { operationBudgetMs: 100, commitGraceMs: 400 } });
  for (let pre = 60; pre <= 140; pre += 4) {
    db.rows.operations.splice(0); db.rows.facts.splice(0);
    ctl.arm({ preDelayMs: pre });
    const x = op(0), r = await f.ingest([x]); await ctl.settle();
    const row = rowOf(db, x);
    if (first(r).receipt) expect(row?.record.receipt.receiptId).toBe(first(r).receipt.receiptId);   // ACK => row
    else { expect(r.status).toBe(503); expect(row).toBeUndefined(); }                                // 503 before the commit point => no row
  }
  for (let ack = 20; ack <= 380; ack += 40) {                // commit acknowledged anywhere inside the grace window: always committed
    db.rows.operations.splice(0); db.rows.facts.splice(0);
    ctl.arm({ ackDelayMs: ack });
    const x = op(0), r = await f.ingest([x]); await ctl.settle();
    expect(first(r).status).toBe('committed'); expect(rowOf(db, x)).toBeDefined();
  }
}, 30000);

it('T5 aborted commit: 503, no row; the identical resend is committed once', async () => {
  const { f, db, ctl } = await setup(), x = op(0);
  ctl.arm({ mode: 'abort-commit' });
  const r = await f.ingest([x]); await ctl.settle();
  expect(isUnavailable(r)).toBe(true); expect(db.rows.operations).toHaveLength(0); expect(db.rows.facts).toHaveLength(0);
  const again = await f.ingest([x]);
  expect(first(again).status).toBe('committed'); expect(db.rows.operations).toHaveLength(1);
});

it('T6 unknown commit that WAS applied: 503 without receipt (no speculative ACK); the resend returns duplicate with the original receipt', async () => {
  const { f, db, ctl } = await setup(), x = op(0);
  ctl.arm({ mode: 'unknown-applied' });
  const r = await f.ingest([x]); await ctl.settle();
  expect(isUnavailable(r)).toBe(true); expect(noReceipt(r)).toBe(true); expect(db.rows.operations).toHaveLength(1);
  const original = rowOf(db, x).record.receipt, again = await f.ingest([x]);
  expect(first(again).status).toBe('duplicate'); expect(first(again).receipt).toEqual(original); expect(db.rows.operations).toHaveLength(1); expect(db.rows.facts).toHaveLength(1);
});

it('T7 unknown commit that was NOT applied: 503 without receipt and no row; the resend is committed once', async () => {
  const { f, db, ctl } = await setup(), x = op(0);
  ctl.arm({ mode: 'unknown-not-applied' });
  const r = await f.ingest([x]); await ctl.settle();
  expect(isUnavailable(r)).toBe(true); expect(noReceipt(r)).toBe(true); expect(db.rows.operations).toHaveLength(0);
  expect(first(await f.ingest([x])).status).toBe('committed'); expect(db.rows.operations).toHaveLength(1);
});

it('T8 a commit that hangs longer than the grace and applies LATER: 503 without receipt, no unhandled rejection, one row afterwards, resend = duplicate', async () => {
  const { f, db, ctl } = await setup(), x = op(0), t0 = performance.now();
  ctl.arm({ applyDelayMs: 900 });
  const r = await f.ingest([x]), elapsed = performance.now() - t0;
  expect(isUnavailable(r)).toBe(true); expect(noReceipt(r)).toBe(true);
  expect(elapsed).toBeLessThan(880);                          // the request did not wait for the whole hang (grace 600 ms is the bound)
  await ctl.settle(); await nap(20);
  expect(db.rows.operations).toHaveLength(1); expect(unhandled).toEqual([]);
  const again = await f.ingest([x]);
  expect(first(again).status).toBe('duplicate'); expect(first(again).receipt).toEqual(rowOf(db, x).record.receipt); expect(db.rows.operations).toHaveLength(1);
});

it('T9 resend while the original commit is still in flight: one effect, one committed and one duplicate, same receipt, no spurious 409', async () => {
  const { f, db, ctl } = await setup({ budgets: { operationBudgetMs: 2000, commitGraceMs: 3000 } }), x = op(0);
  ctl.arm({ applyDelayMs: 200 });
  const a = f.ingest([x]); await nap(50); const b = f.ingest([x]);
  const [ra, rb] = await Promise.all([a, b]); await ctl.settle();
  expect(db.rows.operations).toHaveLength(1); expect(db.rows.facts).toHaveLength(1);
  expect([first(ra).status, first(rb).status].sort()).toEqual(['committed', 'duplicate']);
  expect(first(ra).receipt.receiptId).toBe(first(rb).receipt.receiptId);
});

it('T10 lost response after the commit: the identical resend returns the SAME receipt (id, time, hash) and writes nothing new', async () => {
  const { f, db } = await setup(), x = op(0);
  await f.ingest([x]);                                        // the response is "lost": discarded
  const stored = rowOf(db, x).record.receipt, again = await f.ingest([x]);
  expect(first(again).status).toBe('duplicate'); expect(first(again).receipt).toEqual(stored); expect(db.rows.operations).toHaveLength(1); expect(db.rows.facts).toHaveLength(1);
});

it('T11 cascade: one slow (late-acknowledged) commit in a batch of 5 does not make its neighbours fail', async () => {
  const { f, db, ctl } = await setup();
  ctl.plan = n => n === 2 ? { ackDelayMs: 450 } : null;
  const ops = [0, 1, 2, 3, 4].map(op), r = await f.ingest(ops);
  expect(r.body.results.map(x => x.status)).toEqual(ops.map(() => 'committed'));
  expect(db.rows.operations).toHaveLength(5);
});

it('T12 unknown outcome at operation 2 of 5: operations 3-5 are NOT started and come back deferred without receipts; operation 1 stays committed', async () => {
  const { f, db, ctl } = await setup();
  ctl.plan = n => n === 2 ? { mode: 'unknown-not-applied' } : null;
  const ops = [0, 1, 2, 3, 4].map(op), r = await f.ingest(ops); await ctl.settle();
  const s = r.body.results;
  expect(s[0].status).toBe('committed'); expect(s[0].receipt).toBeDefined();
  for (const x of s.slice(1)) { expect(x.status).toBe('deferred'); expect(x.receipt).toBeUndefined(); expect(x.error).toMatchObject({ code: 'storage_unavailable', retryable: true }); }
  expect(s.map(x => x.operationId)).toEqual(ops.map(x => x.operationId));     // original ids preserved for reconciliation
  expect(ctl.calls).toBe(2); expect(db.rows.operations).toHaveLength(1);
  const retry = await f.ingest(ops);                                          // reconciliation: same ids
  expect(retry.body.results.map(x => x.status)).toEqual(['duplicate', 'committed', 'committed', 'committed', 'committed']);
  expect(db.rows.operations).toHaveLength(5);
});

it('T13 the driver re-runs the callback after a transient commit error: the gate restarts in PRE; a late re-run is aborted without rows, a timely one is committed', async () => {
  const a = await setup(), x = op(0);
  a.ctl.arm({ mode: 'transient-once' });
  expect(first(await a.f.ingest([x])).status).toBe('committed'); expect(a.db.rows.operations).toHaveLength(1);
  const b = await setup(), y = op(0);
  b.ctl.arm({ mode: 'transient-once', retryPreDelayMs: 450 });
  const r = await b.f.ingest([y]); await b.ctl.settle();
  expect(isUnavailable(r)).toBe(true); expect(b.db.rows.operations).toHaveLength(0); expect(b.db.rows.facts).toHaveLength(0);
});

it('T14 a contradictory retry after an unknown outcome is a 409 idempotency_conflict and the stored original is untouched', async () => {
  const { f, db, ctl } = await setup(), x = op(0);
  ctl.arm({ mode: 'unknown-applied' }); await f.ingest([x]); await ctl.settle();
  const before = clone(db.rows.operations);
  const r = await f.ingest([mutate(x, e => { e.createdAtUtc = '2026-10-29T00:00:00.000Z'; })]);
  expect(r.status).toBe(409); expect(first(r).error.code).toBe('idempotency_conflict'); expect(db.rows.operations).toEqual(before);
});

it('T15 500 seeded random runs with faults: every ACK has its row, rows never duplicate, every non-ACK is retryable and the resend converges to ONE operation with ONE receipt', async () => {
  const { f, db, ctl } = await setup({ budgets: { operationBudgetMs: 60, commitGraceMs: 120 } }), rnd = mulberry32(20261102), x = op(0), classes = { n: 0 };
  const picks = [
    () => ({ kind: 'none', spec: {}, expect: 'committed' }),
    () => ({ kind: 'fast-ack', spec: { ackDelayMs: Math.floor(rnd() * 40) }, expect: 'committed' }),
    () => ({ kind: 'ack-past-budget', spec: { ackDelayMs: 70 + Math.floor(rnd() * 20) }, expect: 'committed' }),
    () => ({ kind: 'ack-past-grace', spec: { ackDelayMs: 220 }, expect: 'unavailable-row' }),
    () => ({ kind: 'unknown-applied', spec: { mode: 'unknown-applied' }, expect: 'unavailable-row' }),
    () => ({ kind: 'unknown-not-applied', spec: { mode: 'unknown-not-applied' }, expect: 'unavailable-norow' }),
    () => ({ kind: 'abort', spec: { mode: 'abort-commit' }, expect: 'unavailable-norow' }),
    () => ({ kind: 'late-pre', spec: { preDelayMs: 110 }, expect: 'unavailable-norow' }),
  ];
  for (let i = 0; i < 500; i++) {
    db.rows.operations.splice(0); db.rows.facts.splice(0);
    const c = picks[Math.floor(rnd() * picks.length)](); classes[c.kind] = (classes[c.kind] ?? 0) + 1; classes.n++;
    ctl.arm(c.spec);
    const r = await f.ingest([x]); await ctl.settle();
    const row = rowOf(db, x), res = first(r);
    if (res.receipt) expect(row?.record.receipt.receiptId, c.kind).toBe(res.receipt.receiptId);   // ACK => row
    if (c.expect === 'committed') expect(res.status, c.kind).toBe('committed');
    else { expect(isUnavailable(r), c.kind).toBe(true); expect(res.receipt, c.kind).toBeUndefined(); }
    expect(!!row, c.kind).toBe(c.expect !== 'unavailable-norow');
    expect(db.rows.operations.length).toBeLessThanOrEqual(1); expect(db.rows.facts.length).toBe(db.rows.operations.length);
    const again = await f.ingest([x]);                                                              // the resend always converges
    expect(['committed', 'duplicate']).toContain(first(again).status);
    expect(db.rows.operations).toHaveLength(1); expect(first(again).receipt.receiptId).toBe(rowOf(db, x).record.receipt.receiptId);
    if (row) expect(first(again).receipt).toEqual(row.record.receipt);
  }
  expect(Object.keys(classes).length).toBeGreaterThanOrEqual(9);   // n + the 8 classes were all exercised
  expect(unhandled).toEqual([]);
}, 120000);

it('T16 latency sweep (scaled x1/5, 21 round trips cold): never a 503 while a row is committed inside the grace window', async () => {
  for (let rtt = 14; rtt <= 24; rtt++) {
    const { f, db } = await setup({ rtt, budgets: { operationBudgetMs: 400, commitGraceMs: 600 } }), x = op(0);
    const r = await f.ingest([x]);
    const row = rowOf(db, x);
    if (r.status === 503) expect(row, 'rtt ' + rtt).toBeUndefined();            // 503 only when nothing was persisted (deadline before the commit point)
    else { expect(first(r).status).toBe('committed'); expect(first(r).receipt.receiptId).toBe(row.record.receipt.receiptId); }
    await f.close();
  }
}, 60000);

it('T17 round trips unchanged by F2: 21 cold, 14 warm new operation, 9 warm identical resend', async () => {
  const { f, snapshot, reset } = await setup({ budgets: {} });
  reset(); await f.ingest([op(0)]); const cold = snapshot();
  reset(); await f.ingest([op(1)]); const warm = snapshot();
  reset(); await f.ingest([op(1)]); const resend = snapshot();
  expect([cold.total, warm.total, resend.total]).toEqual([21, 14, 9]);
});

it('T19 budgets unchanged: operation 2000 ms (cap 2000), batch 10000, grace 3000 (cap 3000)', async () => {
  const { f } = await setup({ budgets: {} });
  expect([f.service.operationBudgetMs, f.service.batchBudgetMs]).toEqual([2000, 10000]);
  expect(f.service.commitGraceMs).toBe(3000);
  const mk = o => new IngestionService({ repository: f.repository, identityRepository: f.identity, ...o });
  expect(() => mk({ operationBudgetMs: 2001 })).toThrow(); expect(() => mk({ batchBudgetMs: 10001 })).toThrow();
  expect(() => mk({ commitGraceMs: 3001 })).toThrow(); expect(() => mk({ commitGraceMs: 0 })).toThrow(); expect(() => mk({ commitGraceMs: 2.5 })).toThrow();
  expect(mk({ commitGraceMs: 1 }).commitGraceMs).toBe(1);
});

it('T20 authorization: a revocation racing a slow commit never leaves an operation committed after the revocation, nor an ACK without a row', async () => {
  for (let i = 0; i < 4; i++) {
    const { f, db, ctl } = await setup({ budgets: { operationBudgetMs: 2000, commitGraceMs: 3000 } });
    ctl.arm({ applyDelayMs: 120 });
    const [a] = await Promise.allSettled([f.ingest([op(0)]), nap(30).then(() => f.identity.revoke(f.ctx, { commandId: randomUUID() }))]); await ctl.settle();
    const res = a.status === 'fulfilled' ? a.value?.body?.results?.[0] : null;
    if (res?.receipt) expect(db.rows.operations).toHaveLength(1);
    if (a.status === 'fulfilled' && [401, 403].includes(a.value.status)) expect(db.rows.operations).toHaveLength(0);
    if (db.rows.operations.length === 1 && db.rows.revocations.length === 1) expect(db.rows.operations[0].authorizationDecision.revision).toBeLessThan(db.rows.revocations[0].revision);
    expect(db.rows.operations.length).toBeLessThanOrEqual(1); expect(db.rows.facts.length).toBe(db.rows.operations.length);
    await f.close();
  }
});

it('T21 minimal in-memory counters; the public contract is unchanged (no new codes or fields); no budget timer is left running', async () => {
  const timers = [], realSet = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...a) => { const t = realSet(fn, ms, ...a); if (ms === 300 || ms === 600 || (ms > 0 && ms <= 600)) timers.push(t); return t; });
  const { f, db, ctl } = await setup(), x = op(0), y = op(1);
  ctl.arm({ ackDelayMs: 450 }); const late = await f.ingest([x]);
  ctl.arm({ mode: 'unknown-not-applied' }); const unknown = await f.ingest([y]); await ctl.settle();
  const stats = budget.commitStats();
  expect(Object.keys(stats).sort()).toEqual(['aborted', 'committed', 'graceExpired', 'lateCommitted', 'orphanFailed', 'orphanSettledCommitted', 'preDeadline', 'unknown'].sort());
  expect(Object.values(stats).every(Number.isSafeInteger)).toBe(true);
  expect(stats.committed).toBeGreaterThanOrEqual(1); expect(stats.lateCommitted).toBe(1); expect(stats.unknown).toBeGreaterThanOrEqual(1);
  const text = JSON.stringify([late.body, unknown.body]);
  expect(text).not.toMatch(/commitOutcome|unknown_commit|commit_outcome|stats|graceExpired/i);
  expect(JSON.stringify(stats)).not.toContain(f.accountId);
  expect(Object.keys(unknown.body.results[0].error).sort()).toEqual(['code', 'retryAfterSeconds', 'retryable']);
  await nap(50);
  expect(timers.filter(t => !t._destroyed && t.hasRef?.() !== false && t._idleTimeout > 0 && !t._called && t._onTimeout)).toEqual([]);
});

it('T22 the gate adds no round trips and negligible CPU on the normal path (median < 1 ms per bounded call)', async () => {
  const samples = [];
  for (let i = 0; i < 400; i++) { const t = performance.now(); await budget.bounded(async s => { budget.beginAttempt?.(s); budget.commitPoint?.(s); return 1; }, 2000, { graceMs: 3000 }); samples.push(performance.now() - t); }
  samples.sort((a, b) => a - b); expect(samples[200]).toBeLessThan(1);
  expect(typeof budget.commitPoint).toBe('function');
});

// ---- receipts/query (D4): its transaction also bumps guard and fence, so it gets the same protection ----
it('R1 receipts/query: a commit acknowledged after the budget still returns the found receipts (before F2: 503)', async () => {
  const { f, ctl } = await setup(), x = op(0);
  await f.ingest([x]);
  ctl.arm({ ackDelayMs: 450 });
  const q = await f.service.receipts(f.ctx, { schemaVersion: 2, attempts: [{ operationId: x.operationId, payloadHash: x.payloadHash, leaseId: randomUUID(), attempt: 1 }] });
  expect(q.results[0].status).toBe('found');
});

it('R2 receipts/query: an unknown commit outcome is a retryable 503 error (same public error), never a fabricated result', async () => {
  const { f, ctl } = await setup(), x = op(0);
  await f.ingest([x]);
  ctl.arm({ mode: 'unknown-not-applied' });
  await expect(f.service.receipts(f.ctx, { schemaVersion: 2, attempts: [{ operationId: x.operationId, payloadHash: x.payloadHash, leaseId: randomUUID(), attempt: 1 }] }))
    .rejects.toMatchObject({ httpStatus: 503, code: 'storage_unavailable', retryable: true });
});

it('S1 the gate is atomic: commitPoint is synchronous (check + mark with no await in between) and a pre-commit timeout makes it throw', async () => {
  expect(budget.commitPoint.constructor.name).toBe('Function');
  let thrown = null;
  await budget.bounded(async s => { await nap(60); try { budget.commitPoint(s); } catch (e) { thrown = e; throw e; } }, 20).catch(() => {});
  await nap(100);                                              // the orphaned work reaches the commit point after the budget expired
  expect(thrown).toMatchObject({ httpStatus: 503, code: 'storage_unavailable' });
});

it('S2 a timeout in the commit phase is never reported as a confirmed abort: the error is tagged unknown only for the service, with the public code unchanged', async () => {
  let err;
  await budget.bounded(async s => { budget.beginAttempt(s); budget.commitPoint(s); await nap(120); return 'late'; }, 20, { graceMs: 40 }).catch(e => { err = e; });
  expect(err).toMatchObject({ httpStatus: 503, code: 'storage_unavailable', retryable: true });
  expect(err.commitOutcome).toBe('unknown');
  expect(Object.keys(err).includes('commitOutcome')).toBe(false);          // non-enumerable: not serialised anywhere
  await nap(150); expect(unhandled).toEqual([]);
  const ok = await budget.bounded(async s => { budget.beginAttempt(s); budget.commitPoint(s); await nap(60); return 'done'; }, 20, { graceMs: 200 });
  expect(ok).toBe('done');                                                  // committed late: returned, not rejected
});
