import { mongoDouble } from './mongo-double.js';

// Offline MODEL of the database round trips of the real repositories (B32/B34). The real repositories run on the in-memory Mongo double; every database call
// (find, count, write, listIndexes, hello, commit) is one "round trip" that can be delayed by an injected latency. It models the NUMBER of round trips, not Atlas.
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function instrumented(rtt = 0) {
  const db = mongoDouble(), tally = { total: 0, by: {} }, count = label => { tally.total++; tally.by[label] = (tally.by[label] ?? 0) + 1; };
  const hit = async label => { count(label); if (rtt) await nap(rtt); };
  for (const [name, m] of Object.entries(db.models)) {
    const find = m.find.bind(m), countDocuments = m.countDocuments.bind(m), estimated = m.estimatedDocumentCount.bind(m), updateOne = m.updateOne.bind(m);
    m.find = (...a) => { const q = find(...a), lean = q.lean.bind(q); q.lean = async () => { await hit('find:' + name); return lean(); }; return q; };
    m.countDocuments = async (...a) => { await hit('count:' + name); return countDocuments(...a); };
    m.estimatedDocumentCount = async (...a) => { await hit('estimatedCount:' + name); return estimated(...a); };
    m.updateOne = async (...a) => { await hit('write:' + name); return updateOne(...a); };
    const indexes = m.collection.indexes; m.collection.indexes = async () => { await hit('listIndexes'); return indexes(); };
  }
  const admin = db.connection.db.admin; db.connection.db.admin = () => ({ command: async (...a) => { await hit('hello'); return admin().command(...a); } });
  const start = db.connection.startSession.bind(db.connection);
  db.connection.startSession = async () => { const s = await start(), wt = s.withTransaction.bind(s); s.withTransaction = async (...a) => { const r = await wt(...a); await hit('commit'); return r; }; return s; };
  return { db, tally, reset: () => { tally.total = 0; tally.by = {}; }, snapshot: () => ({ total: tally.total, by: { ...tally.by } }) };
}

// Production-like composition (src/main/profile.js): per-owner fence ("owner" mode) and NO test-only authorization fence. `extra` is merged into the repository options
// (e.g. {deployment:{now}} for a fake clock).
export const productionLike = (db, extra = {}) => { const factory = args => db.factory({ ...args, fenceAuthorization: undefined, fenceMode: 'owner', ...extra }); factory.identityFactory = db.factory.identityFactory; return factory; };
