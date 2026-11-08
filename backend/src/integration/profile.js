import { performance } from 'node:perf_hooks';
import { generateKeyPair } from 'jose';
import { assertNotProduction, INTEGRATION_JWT } from '../config/jwt.js';
import { registerIntegrationBundle } from '../config/integration-profile.js';
import {
  AtlasIntegrationError, ATLAS_TARGET, INTEGRATION_PROFILE_CONFIG, assertAtlasConnection, atlasCollections, authorizeAtlasScope, closeAtlasScope,
  isIntegrationProfileScope, validateAtlasConfig,
} from '../modules/sync/atlas-policy.js';
import { classifyAtlasError } from '../modules/sync/atlas-error-diagnostic.js';
import { consumeAtlasCredential, destroyAtlasCredential } from '../modules/sync/atlas-credentials.js';
import { ingestionModels } from '../modules/sync/mongo-models.js';
import { MongoIngestionRepository } from '../modules/sync/mongo-ingestion-repository.js';
import { MongoIdentityRepository } from '../modules/auth/mongo-identity-repository.js';
import { mongoIdentityModels } from '../modules/auth/mongo-identity-models.js';
import { INTEGRATION_SCHEMA, cleanupPlan } from './schema-inventory.js';

// B05.5 stage 6 - the 'integration' profile of the Express backend.
//
// DISABLED BY DEFAULT: importing this module opens nothing, reads no environment and no file. A connection is only attempted by
// openIntegrationProfile(), which refuses unless the caller passes the exact activation phrase AND a connector AND a one-use credential handle.
// The destination is a constant (twosidescluster... / two_sides_integration_test / twosides_integration_test, authSource admin, strict TLS, SCRAM):
// there is no parameter for host, database, user, URI, mechanism or TLS, and unknown options are rejected.
//
// What it reuses unchanged: MongoIdentityRepository + MongoIngestionRepository (owner guard, snapshot transactions, idempotency, receipts,
// revocation), the JWT v2 service, the sync router and the composition lifecycle. What it does NOT use: the C.2 harness, its release/consumption
// records, its one-run collections (b054c2c_<run>_*), its `persistenceTest` phases, backend/.env, or any other database.
export const INTEGRATION_ACTIVATION = 'ENABLE_ATLAS_INTEGRATION_PROFILE_V2';
export const INTEGRATION_PREPARE_CONFIRMATION = 'CREATE_INTEGRATION_COLLECTIONS';
const ALLOWED_OPTIONS = Object.freeze(['activation', 'credential', 'connector', 'now']);
const inspectors = new WeakMap();   // bundle -> read-only schema inspection
const prepared = new WeakMap();   // bundle -> models (for the explicit, separately confirmed preparation step)

// Token realm of this profile: its own issuer/audience, and keys generated in memory at start (nothing on disk, nothing in the repository).
// Tokens do not survive a restart; players simply open a new session. Supplying persistent keys is a pending operational decision.
export async function createIntegrationJwtConfig({ keyId = 'integration-ephemeral' } = {}) {
  const keys = await generateKeyPair('RS256', { modulusLength: 2048 });
  return { ...keys, mode: INTEGRATION_JWT.mode, algorithm: 'RS256', issuer: INTEGRATION_JWT.issuer, audience: INTEGRATION_JWT.audience, keyId };
}

// Safe diagnostics (stage 8): ONLY a fixed stage name, a fixed category name and a duration rounded to 100 ms are ever attached to an error. Never a driver
// message, URI, host, credential or error object. A timeout is NOT interpreted as an unauthorized IP: it stays a timeout.
export const DIAGNOSTIC_STAGES = Object.freeze(['configuration', 'mongoose-connect', 'connection-verification', 'permission-inspection', 'repositories', 'schema', 'listen']);
export const DIAGNOSTIC_CATEGORIES = Object.freeze(['CERTIFICATE_VALIDATION_FAILURE', 'TLS_HANDSHAKE_FAILURE', 'AUTHENTICATION_FAILURE', 'AUTHORIZATION_FAILURE', 'INVALID_CONNECTION_OPTIONS',
  'DNS_SRV_FAILURE', 'DNS_HOST_FAILURE', 'NETWORK_REFUSED', 'NETWORK_RESET', 'NETWORK_TIMEOUT', 'CLUSTER_UNAVAILABLE', 'SERVER_SELECTION_TIMEOUT', 'SERVER_SELECTION_FAILURE',
  'UNKNOWN_CONNECTION_FAILURE', 'POST_CONNECT_FAILURE']);
const CODE_BY_CATEGORY = Object.freeze({
  AUTHENTICATION_FAILURE: 'atlas_authentication_failed', INVALID_CONNECTION_OPTIONS: 'atlas_client_configuration_rejected',
  DNS_SRV_FAILURE: 'atlas_dns_failed', DNS_HOST_FAILURE: 'atlas_dns_failed',
  CERTIFICATE_VALIDATION_FAILURE: 'atlas_tls_failed', TLS_HANDSHAKE_FAILURE: 'atlas_tls_failed',
  NETWORK_TIMEOUT: 'atlas_network_timeout', SERVER_SELECTION_TIMEOUT: 'atlas_server_selection_timeout',
});
export const codeForCategory = category => CODE_BY_CATEGORY[category] ?? 'atlas_connection_unavailable';
const diagnose = (error, stage, category, durationMs) => {
  const safeStage = DIAGNOSTIC_STAGES.includes(stage) ? stage : 'configuration';
  const safeCategory = DIAGNOSTIC_CATEGORIES.includes(category) ? category : 'UNKNOWN_CONNECTION_FAILURE';
  error.diagnostic = Object.freeze({ stage: safeStage, category: safeCategory, approximateDurationMs: Number.isFinite(durationMs) ? Math.round(Math.min(120000, Math.max(0, durationMs)) / 100) * 100 : null });
  return error;
};

// Adapter from a Mongoose instance to the connector contract. Takes mongoose as an argument so this module itself never imports a driver.
export function integrationConnector(mongoose) {
  return async (uri, options) => {
    let connection;
    const began = performance.now();
    try {
      if (uri !== INTEGRATION_PROFILE_CONFIG.uri || options.dbName !== ATLAS_TARGET.database || options.user !== ATLAS_TARGET.user ||
          options.tls !== true || options.autoCreate !== false || options.autoIndex !== false) throw new AtlasIntegrationError('atlas_configuration_rejected');
      connection = mongoose.createConnection(uri, options);
      connection.on('error', () => {});
      await connection.asPromise();
      return connection;
    } catch (error) {
      if (connection) try { await connection.close(); } catch { /* nothing else to release */ }
      if (error instanceof AtlasIntegrationError) throw error.diagnostic ? error : diagnose(error, 'configuration', 'INVALID_CONNECTION_OPTIONS', performance.now() - began);
      const found = classifyAtlasError(error, { stage: 'mongoose-connect', durationMs: performance.now() - began, cleanup: 'completed', close: 'completed' });
      throw diagnose(new AtlasIntegrationError(codeForCategory(found.category)), 'mongoose-connect', found.category, found.approximateDurationMs);
    }
  };
}

export async function openIntegrationProfile(options = {}) {
  let connection, scope, stage = 'configuration';
  const began = performance.now();
  const credential = options?.credential;
  try {
    assertNotProduction();
    if (!options || typeof options !== 'object' || Object.keys(options).some(k => !ALLOWED_OPTIONS.includes(k))) throw new AtlasIntegrationError('integration_option_rejected');
    if (options.activation !== INTEGRATION_ACTIVATION) throw new AtlasIntegrationError('integration_not_activated');
    if (typeof options.connector !== 'function') throw new AtlasIntegrationError('atlas_connector_required');
    const now = options.now ?? Date.now;
    const c = validateAtlasConfig(INTEGRATION_PROFILE_CONFIG);
    const pass = consumeAtlasCredential(credential);   // validates, decodes once and wipes the handle
    stage = 'mongoose-connect';
    connection = await options.connector(c.uri, {
      dbName: c.database, user: c.user, pass, authSource: 'admin', authMechanism: c.authMechanism,
      tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false,
      directConnection: false, readPreference: 'primary', retryWrites: true, w: 'majority',
      maxPoolSize: 5, minPoolSize: 0, maxConnecting: 2, maxIdleTimeMS: 30000, serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000, waitQueueTimeoutMS: 2000, autoIndex: false, autoCreate: false, bufferCommands: false, monitorCommands: false,
      appName: 'TwoSides-Integration',
    });
    stage = 'connection-verification';
    assertAtlasConnection(connection, c);
    stage = 'permission-inspection';
    const authorized = await authorizeAtlasScope(connection, c);   // read-only privilege inspection: exactly readWrite on the integration database
    scope = authorized.scope;
    if (!isIntegrationProfileScope(scope)) throw new AtlasIntegrationError('atlas_scope_rejected');
    stage = 'repositories';
    const identityModels = mongoIdentityModels(connection, { atlasScope: scope });
    const identityRepository = new MongoIdentityRepository({ synthetic: true, connection, atlasScope: scope, models: identityModels, now });
    const models = ingestionModels(connection, { atlasScope: scope });
    // No fenceAuthorization: the durable owner guard (identity repository) already authorizes every commit and handles revocation. The C.2A
    // schema fence is a one-run harness control and is deliberately not part of the general sync path.
    const ingestionRepository = new MongoIngestionRepository({ synthetic: true, disposable: true, connection, models, atlasScope: scope, fenceMode: 'owner',
      identityRepository, coordinator: identityRepository.coordinator, now });
    let closing = null;
    const close = () => closing ??= (async () => {
      closeAtlasScope(scope);
      try { await connection.close(); } catch { throw new AtlasIntegrationError('atlas_close_failed'); }
    })();
    const bundle = registerIntegrationBundle(Object.freeze({
      profile: 'integration', identityRepository, ingestionRepository, permissions: authorized.permissions,
      collections: atlasCollections(c), close, resources: Object.freeze([Object.freeze({ name: 'atlas-integration', close })]),
    }));
    prepared.set(bundle, { ...models, ...identityModels });
    inspectors.set(bundle, () => inspectSchema(connection, { ...models, ...identityModels }));
    return bundle;
  } catch (error) {
    closeAtlasScope(scope);
    if (connection) try { await connection.close(); } catch { /* already failing */ }
    // An error that is not ours and happens after the connection exists is a post-connect failure, not a connectivity one.
    const ours = error instanceof AtlasIntegrationError;
    const result = ours ? error : new AtlasIntegrationError(connection ? 'atlas_post_connect_failed' : 'atlas_connection_unavailable');
    throw result.diagnostic ? result : diagnose(result, stage, !ours && connection ? 'POST_CONNECT_FAILURE' : 'UNKNOWN_CONNECTION_FAILURE', performance.now() - began);
  } finally { destroyAtlasCredential(credential); }
}

// READ-ONLY. Compares the database with INTEGRATION_SCHEMA: which of the 7 collections and 5 unique indexes exist. Never creates anything.
async function inspectSchema(connection, models) {
  let remote;
  try { remote = await connection.db.listCollections({}, { nameOnly: true }).toArray(); } catch { throw new AtlasIntegrationError('atlas_inspection_failed'); }
  const names = new Set(remote.map(c => c.name)), present = [], missing = [], problems = [];
  const expected = Object.entries(INTEGRATION_SCHEMA.collections);
  for (const [key, definition] of expected) {
    if (models[key]?.collection?.name !== definition.name) throw new AtlasIntegrationError('atlas_scope_rejected');
    if (!names.has(definition.name)) { missing.push(definition.name); continue; }
    present.push(definition.name);
    let indexes;
    try { indexes = await models[key].collection.indexes(); } catch { throw new AtlasIntegrationError('atlas_inspection_failed'); }
    for (const want of definition.indexes)
      if (!indexes.some(i => i.name === want.name && i.unique === true && JSON.stringify(i.key) === JSON.stringify(want.key) && !i.sparse && !i.partialFilterExpression)) problems.push(`${definition.name}:${want.name}`);
  }
  const known = new Set(expected.map(([, d]) => d.name));
  return Object.freeze({ ready: missing.length === 0 && problems.length === 0, present, missing, problems, foreignCollections: [...names].filter(n => !known.has(n)).length });
}
export function inspectIntegrationSchema(bundle) {
  const inspect = inspectors.get(bundle);
  if (!inspect) throw new AtlasIntegrationError('integration_not_activated');
  return inspect();
}

// First-time preparation of the integration collections and their unique indexes. NEVER called automatically: it is a write to the
// integration database and needs its own authorization and the exact confirmation phrase. Creates exactly the 7 collections of
// INTEGRATION_SCHEMA (the unused `authorization` model gets none) and seeds the fence document.
export async function prepareIntegrationCollections(bundle, { confirm } = {}) {
  const models = prepared.get(bundle);
  if (!models || confirm !== INTEGRATION_PREPARE_CONFIRMATION) throw new AtlasIntegrationError('integration_not_activated');
  const targets = Object.keys(INTEGRATION_SCHEMA.collections).map(key => models[key]);
  for (const model of targets) await model.createCollection();
  for (const model of targets) await model.createIndexes();
  await models.fences.updateOne({ _id: INTEGRATION_SCHEMA.collections.fences.seed._id }, { $setOnInsert: { revision: 0 } }, { upsert: true, writeConcern: { w: 'majority', j: true } });
  return Object.freeze({ collections: targets.length });
}

// Targeted access for the synthetic run (stage 8). Everything is anchored on explicit synthetic account ids through cleanupPlan(): the filters are never
// empty, never a wildcard and never name a collection outside INTEGRATION_SCHEMA. Totals use metadata counts (no document is read).
const modelFor = (bundle, collection) => {
  const models = prepared.get(bundle);
  const key = Object.entries(INTEGRATION_SCHEMA.collections).find(([, d]) => d.name === collection)?.[0];
  if (!models || !key) throw new AtlasIntegrationError('integration_not_activated');
  return models[key];
};
export async function collectionTotals(bundle) {
  const totals = {};
  for (const d of Object.values(INTEGRATION_SCHEMA.collections)) totals[d.name] = await modelFor(bundle, d.name).estimatedDocumentCount();
  return Object.freeze(totals);
}
export async function countSyntheticDocuments(bundle, accountIds) {
  const counts = {};
  for (const step of cleanupPlan(accountIds)) counts[step.collection] = await modelFor(bundle, step.collection).countDocuments(step.filter);
  return Object.freeze(counts);
}
export async function deleteSyntheticDocuments(bundle, accountIds) {
  const deleted = {};
  for (const step of cleanupPlan(accountIds)) {   // children before parents, exactly the documented order
    const result = await modelFor(bundle, step.collection).deleteMany(step.filter, { writeConcern: { w: 'majority', j: true } });
    deleted[step.collection] = result?.deletedCount ?? 0;
  }
  return Object.freeze(deleted);
}
