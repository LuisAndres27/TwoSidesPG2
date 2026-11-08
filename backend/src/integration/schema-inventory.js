import { z } from 'zod';

// B05.5 stage 7 - exact inventory of what the integration profile needs in two_sides_integration_test. DATA ONLY: this module creates nothing,
// connects to nothing and imports no driver. The C.2/C.2A collections (b054c2c_<run>_*) are never part of it and are never touched.
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const PREFIX = 'integration_v2';
const index = (name, key) => ({ name, key, unique: true });

export const INTEGRATION_SCHEMA = deepFreeze({
  database: 'two_sides_integration_test',
  prefix: PREFIX,
  // key = Mongoose model key used by the existing repositories.
  collections: {
    operations: { name: `${PREFIX}_operations`, purpose: 'one document per accepted sync operation (record, receipt, authorization decision)', indexes: [index('owner_operation_unique', { technicalAccountId: 1, operationId: 1 })] },
    facts: { name: `${PREFIX}_facts`, purpose: 'one document per accepted fact (relations and ranges)', indexes: [index('scope_source_unique', { scope: 1, sourceKey: 1 })] },
    fences: { name: `${PREFIX}_fences`, purpose: 'seed document (read only, deployment sanity) plus one fence document per owner (_id "ingestion-v1:<technicalAccountId>"), incremented inside the owner write transactions', indexes: [], seed: { _id: 'ingestion-v1', revision: 0 } },
    identities: { name: `${PREFIX}_identities`, purpose: 'technical accounts (Argon2id verifier, binding, versions)', indexes: [index('identity_registration_unique', { registrationId: 1 }), index('identity_binding_unique', { installationId: 1, localPlayerId: 1 })] },
    ownerGuards: { name: `${PREFIX}_ownerGuards`, purpose: 'per-account revision used as the durable authorization guard', indexes: [] },
    identitySessions: { name: `${PREFIX}_identitySessions`, purpose: 'session records behind the 15 minute JWTs (hash of the opaque token, never the token)', indexes: [index('identity_token_unique', { tokenHash: 1 })] },
    revocations: { name: `${PREFIX}_revocations`, purpose: 'idempotent revocation commands', indexes: [] },
  },
  // The model exists (the ingestion repository requires all four) but the integration path never reads or writes it, so no collection is created.
  notCreated: { authorization: `${PREFIX}_authorization` },
  // Every collection also carries the automatic unique _id_ index; nothing else may exist.
  documentsPerSyntheticPlayer: {
    identities: '1', ownerGuards: '1', identitySessions: '1..3 live (older ones are marked revoked, not deleted)', revocations: '0..2 (only if a revocation scenario runs)',
    operations: 'one per Outbox operation sent (C# test vectors: 63)', facts: 'one per fact in those operations', fences: '1 owner fence document',
  },
  sharedDocuments: { fences: '1 seed (revision stays 0; never written after preparation)' },
  maxSyntheticPlayers: 4,
});

export const INTEGRATION_COLLECTION_NAMES = Object.freeze(Object.values(INTEGRATION_SCHEMA.collections).map(c => c.name));

// Operations the profile performs, by phase (the reason each exists). Reads are only listed where they are not implied by a write.
export const INTEGRATION_OPERATIONS = deepFreeze({
  connect: ['TLS handshake and SCRAM-SHA-256 authentication against admin', 'connectionStatus{showPrivileges:true} (read-only privilege inspection, before anything else)'],
  inspect: ['listCollections on two_sides_integration_test (names only)', 'listIndexes on the 7 collections that exist'],
  prepare: ['createCollection x7', 'createIndexes (5 unique indexes)', 'upsert of the fence seed document (only when confirmed and separately authorized)'],
  register: ['transaction: read identity by registrationId and binding, insert identity, insert ownerGuard'],
  login: ['transaction: read identity, ownerGuard revision +1, read sessions, insert session (revoke the oldest beyond 3)'],
  authenticate: ['read session by id and identity (per request)'],
  batch: ['transaction: fence +1, ownerGuard +1, reads of operations and facts for relation checks (bounded), upserts of facts and operations'],
  receipts: ['transaction: fence +1, ownerGuard +1, read operations of the caller by id'],
  revoke: ['transaction: ownerGuard +1, update session or identity, insert revocation'],
});

const uuid = z.string().uuid();
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Cleanup PLAN for the documents of specific synthetic accounts. It only produces filters; nothing executes it in this stage.
// Every filter is anchored on the account ids (never empty, never a wildcard) and children are removed before parents.
export function cleanupPlan(accountIds) {
  const ids = z.array(uuid).min(1).max(INTEGRATION_SCHEMA.maxSyntheticPlayers).parse(accountIds);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate account id');
  const c = INTEGRATION_SCHEMA.collections;
  return deepFreeze([
    { collection: c.operations.name, filter: { technicalAccountId: { $in: ids } } },
    { collection: c.facts.name, filter: { scope: { $regex: '^(' + ids.map(escape).join('|') + '):' } } },
    { collection: c.revocations.name, filter: { technicalAccountId: { $in: ids } } },
    { collection: c.identitySessions.name, filter: { technicalAccountId: { $in: ids } } },
    { collection: c.ownerGuards.name, filter: { _id: { $in: ids } } },
    { collection: c.fences.name, filter: { _id: { $in: ids.map(id => `ingestion-v1:${id}`) } } },   // the owners' fences only, never the shared seed
    { collection: c.identities.name, filter: { _id: { $in: ids } } },
  ]);
}
// Whole-profile reset: only valid when the namespace list of the database contains exactly the inventory (plus foreign C.2 collections it must not touch).
export const dropPlan = () => deepFreeze({ drop: INTEGRATION_COLLECTION_NAMES, neverTouch: 'any collection not listed here, in particular b054c2c_* (C.2/C.2A)' });
