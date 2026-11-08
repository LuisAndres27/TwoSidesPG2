// B05.5 stage 9 - exact inventory of what the 'main' profile requires in two_sides_db. DATA ONLY: this module imports no driver, reads no environment, connects
// to nothing and creates nothing. It does NOT describe what two_sides_db contains today: that is unknown (never inspected) and may include collections of an
// older format that this profile neither reads nor modifies. Every name lives in the separate namespace `main_v2`.
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
const PREFIX = 'main_v2';
const index = (name, key) => ({ name, key, unique: true });

export const MAIN_SCHEMA = deepFreeze({
  database: 'two_sides_db',
  prefix: PREFIX,
  // key = Mongoose model key used by the existing repositories (identical to the integration profile; only the prefix differs).
  collections: {
    operations: { name: `${PREFIX}_operations`, purpose: 'one document per accepted sync operation: record, receipt and authorization decision', indexes: [index('owner_operation_unique', { technicalAccountId: 1, operationId: 1 })] },
    facts: { name: `${PREFIX}_facts`, purpose: 'one document per accepted fact: game snapshots, sessions, gameplay events and intervals', indexes: [index('scope_source_unique', { scope: 1, sourceKey: 1 })] },
    fences: { name: `${PREFIX}_fences`, purpose: 'seed document ingestion-v1 (read at start) plus one fence document per owner (ingestion-v1:<technicalAccountId>) incremented inside the owner write transactions', indexes: [], seed: { _id: 'ingestion-v1', revision: 0 } },
    identities: { name: `${PREFIX}_identities`, purpose: 'technical accounts: Argon2id verifier, installation/player binding, versions', indexes: [index('identity_registration_unique', { registrationId: 1 }), index('identity_binding_unique', { installationId: 1, localPlayerId: 1 })] },
    ownerGuards: { name: `${PREFIX}_ownerGuards`, purpose: 'per-account revision: the durable authorization guard for every commit', indexes: [] },
    identitySessions: { name: `${PREFIX}_identitySessions`, purpose: 'sessions behind the 15 minute JWTs: hash of the opaque token, never the token', indexes: [index('identity_token_unique', { tokenHash: 1 })] },
    revocations: { name: `${PREFIX}_revocations`, purpose: 'idempotent revocation commands', indexes: [] },
  },
  // The model exists because the ingestion repository requires it; this profile never reads or writes it and never creates its collection.
  notCreated: { authorization: `${PREFIX}_authorization` },
  // Every collection also carries the automatic unique _id_ index; the profile refuses any other index (sparse, partial, hidden, TTL, non-simple collation).
  requirements: [
    'all 7 collections exist before start (the profile never creates one)',
    'exactly the listed unique indexes plus _id_ on each collection',
    'main_v2_fences holds ingestion-v1 with a non-negative integer revision',
    'a replica set whose primary accepts writes (multi-document transactions)',
    'restricted runtime twosides_backend_v2 on admin, explicit SCRAM-SHA-256 and exact collection privileges; administrative provisioning is separate',
  ],
});

export const MAIN_COLLECTION_NAMES = Object.freeze(Object.values(MAIN_SCHEMA.collections).map(c => c.name));
