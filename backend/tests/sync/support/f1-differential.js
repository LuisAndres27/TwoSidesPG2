import { fixture, vectors, resources } from './fixture.js';
import { mongoDouble } from './mongo-double.js';

// B34 T19: deterministic, normalized dump of what the sync pipeline does with the 63 C# vectors, used to compare the pre-F1 code (golden file generated from the
// backup of src/) with the F1 code. Identifiers generated at run time (account, receipts) are replaced by tokens in order of first appearance; the account id is
// replaced by "ACCOUNT" before sorting so the order does not depend on random values. No secrets are dumped (no identities, sessions, verifiers or token hashes).
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
export function normalize(value, accountId) {
  const text = JSON.stringify(value).replaceAll(accountId, 'ACCOUNT'), map = new Map();
  return JSON.parse(text.replace(UUID, u => { if (!map.has(u)) map.set(u, 'U' + String(map.size + 1).padStart(3, '0')); return map.get(u); }));
}
const byKey = rows => rows.slice().sort((a, b) => (a._sortKey < b._sortKey ? -1 : a._sortKey > b._sortKey ? 1 : 0));
const prep = (rows, accountId) => byKey(rows.map(r => ({ ...structuredClone(r), _sortKey: String(r._id).replaceAll(accountId, 'ACCOUNT') })));
const summary = r => ({ http: r.status, outcome: r.body.outcome, counters: r.body.counters,
  results: r.body.results.map(x => ({ index: x.index, operationId: x.operationId, status: x.status, httpStatus: x.httpStatus, error: x.error?.code ?? null, acceptedAs: x.receipt?.acceptedAs ?? null, receiptId: x.receipt?.receiptId ?? null })) });

// `makeFactory(db)` returns the repositoryFactory to use (the default test composition or the production-like one).
export async function dumpPipeline(makeFactory = db => db.factory) {
  const db = mongoDouble(), f = await fixture({ repositoryFactory: makeFactory(db) });
  try {
    const A = f.accountId, first = await f.ingest(), second = await f.ingest();
    const rows = { operations: prep(db.rows.operations, A), facts: prep(db.rows.facts, A), fences: prep(db.rows.fences, A), ownerGuards: prep(db.rows.ownerGuards, A) };
    return normalize({ vectors: vectors.operations.length, firstSend: summary(first), resend: summary(second), rows }, A);
  } finally { await f.close(); resources.length = 0; }
}
