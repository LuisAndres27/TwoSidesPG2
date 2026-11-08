import './support/isolation-guard.js';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { fixture, vectors, clone, resources } from './support/fixture.js';
import { instrumented, productionLike } from './support/latency-harness.js';

// B32/B34: offline MODEL of the round trips one sync operation consumes (see support/latency-harness.js). It models the NUMBER of round trips of the real code path
// (1 database call = 1 trip), not Atlas. Nothing here touches the network.
// B34 note: before F1 these tests asserted the OLD counts (first send 34, re-send 26, hello >= 2, listIndexes 5; recorded in B32/B33). F1 lowers them by design, so the
// assertions below now describe the F1 state; the old figures are preserved in the reports. The F1 acceptance tests (T1-T19) are in main-f1-optimization.test.js.
afterEach(async () => { for (const f of resources.splice(0)) await f.close(); vi.restoreAllMocks(); });
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
// Results go to the file named by MEASURE_OUT (absolute path) when set; otherwise nothing is written.
const emit = text => { if (process.env.MEASURE_OUT) fs.appendFileSync(process.env.MEASURE_OUT, text + '\n'); };
const first = () => clone(vectors.operations[0]);

it('VL01 round trips of ONE operation (default test composition), first send vs identical re-send after F1 (COLD: the first send also performs the live deployment check)', async () => {
  const { db, reset, snapshot } = await instrumented(0);
  const f = await fixture({ repositoryFactory: db.factory });
  reset(); const a = await f.ingest([first()]); const firstSend = snapshot();
  reset(); const b = await f.ingest([first()]); const resend = snapshot();
  expect(a.status).toBe(200); expect(a.body.results[0].status).toBe('committed');
  expect(b.status).toBe(200); expect(b.body.results[0].status).toBe('duplicate');
  expect(b.body.results[0].receipt.receiptId).toBe(a.body.results[0].receipt.receiptId);
  emit('VL01 cold first send: ' + JSON.stringify(firstSend) + '\nVL01 warm re-send: ' + JSON.stringify(resend));
  expect(firstSend.by.hello).toBeGreaterThanOrEqual(1);          // cold: one live verification
  expect(resend.by.hello ?? 0).toBe(0); expect(resend.by.listIndexes ?? 0).toBe(0);   // warm: none
  expect(resend.total).toBeLessThan(firstSend.total);
});

it('VL03 round trips with the PRODUCTION-like composition (owner fence, no test authorization fence): cold first send, warm first send of a new operation, warm identical re-send', async () => {
  const { db, reset, snapshot } = await instrumented(0);
  const f = await fixture({ repositoryFactory: productionLike(db) });
  reset(); const cold = await f.ingest([first()]); const coldTrips = snapshot();
  const second = clone(vectors.operations[1]);
  reset(); const warm = await f.ingest([second]); const warmTrips = snapshot();
  reset(); const dup = await f.ingest([second]); const resend = snapshot();
  expect(cold.body.results[0].status).toBe('committed'); expect(warm.body.results[0].status).toBe('committed'); expect(dup.body.results[0].status).toBe('duplicate');
  expect(dup.body.results[0].receipt.receiptId).toBe(warm.body.results[0].receipt.receiptId);
  expect(db.rows.fences.find(r => r._id === 'ingestion-v1').revision).toBe(0);   // the seed is only read
  emit('VL03 production-like COLD first send: ' + JSON.stringify(coldTrips) + '\nVL03 production-like WARM new operation: ' + JSON.stringify(warmTrips) + '\nVL03 production-like WARM re-send: ' + JSON.stringify(resend));
  // acceptance of F1 (B33 5.7): warm first send <= 16, warm re-send <= 10 (targets 14 / 8; old: 34 / 26)
  expect(warmTrips.total).toBeLessThanOrEqual(16); expect(resend.total).toBeLessThanOrEqual(10);
  expect(coldTrips.total).toBeGreaterThan(warmTrips.total);
});

// Opt-in sweep: MEASURE_LATENCY=1 npx vitest run tests/sync/main-batch-latency-model.test.js -t VL02  (takes up to ~25 s; never part of the regression)
it.skipIf(!process.env.MEASURE_LATENCY)('VL02 sweep (production-like, WARM): with which injected latency does the batch answer 503?', async () => {
  const rows = [];
  const list = (process.env.MEASURE_RTTS ?? '10,30,50,60,100,150,200').split(',').map(Number);
  for (const rtt of list) {
    const { db, snapshot } = await instrumented(0);
    const f = await fixture({ repositoryFactory: productionLike(db) });
    await f.repository.warmDeploymentCheck();                                         // warm: outside any budget
    const trips0 = snapshot().total;
    // add latency only now
    for (const m of Object.values(db.models)) { const find = m.find, u = m.updateOne, c = m.countDocuments, e = m.estimatedDocumentCount; m.find = (...a) => { const q = find(...a), lean = q.lean.bind(q); q.lean = async () => { await nap(rtt); return lean(); }; return q; }; m.updateOne = async (...a) => { await nap(rtt); return u(...a); }; m.countDocuments = async (...a) => { await nap(rtt); return c(...a); }; m.estimatedDocumentCount = async (...a) => { await nap(rtt); return e(...a); }; }
    const sess = db.connection.startSession; db.connection.startSession = async () => { const s = await sess.call(db.connection), wt = s.withTransaction.bind(s); s.withTransaction = async (...a) => { const r = await wt(...a); await nap(rtt); return r; }; return s; };
    const t0 = performance.now(); const r = await f.ingest([first()]); const ms = Math.round(performance.now() - t0);
    await nap(rtt * 20);
    rows.push({ rttMs: rtt, answerMs: ms, http: r.status, status: r.body.results[0].status, committedInStore: db.rows.operations.length === 1, tripsBeforeLatency: trips0 });
    await f.close(); resources.length = 0;
  }
  emit('VL02 warm sweep:\n' + rows.map(x => JSON.stringify(x)).join('\n'));
  expect(rows.length).toBe(list.length);
}, 120000);
