import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { MAIN_AUTH_MECHANISM, MAIN_TARGET, MAIN_URI, negotiatedScram } from './administrative-policy.js';
import { MAIN_SCHEMA } from './schema-inventory.js';
import { InspectionAuthorizationError, readInspectionAuthorization } from './inspection-authorization.js';
import { claimExecution, isClaimed, recordResult } from './inspection-marker.js';
import { classifyAtlasError } from '../modules/sync/atlas-error-diagnostic.js';
import { consumeAtlasCredential, destroyAtlasCredential, receiveAtlasCredential } from '../modules/sync/atlas-credentials.js';

// B05.5 stage 10 - ONE-SHOT, READ-ONLY inspection of the main database schema. Independent of the Express server, of the `main` runtime and of the
// integration profile. DISABLED BY DEFAULT: nothing here connects on import, and a run needs the explicit flag, a valid inspection authorization and a
// credential frame on stdin (hidden-input wrapper). It performs exactly these remote operations and no other:
//   connectionStatus{showPrivileges} · hello · listCollections · listIndexes (per collection) · estimatedDocumentCount (metadata) · one findOne of the seed
//   document `ingestion-v1` projecting only its revision.
// No Mongoose model is registered (so nothing can auto-create or auto-index), no HTTP server starts, nothing is inserted, updated, deleted, created or
// repaired, and the report holds names, index definitions and counts only: never documents, tokens, sessions, hashes or secrets.
export class InspectionError extends Error {
  constructor(code, diagnostic) { super('Main schema inspection unavailable.'); this.name = 'InspectionError'; this.code = code; if (diagnostic) this.diagnostic = diagnostic; }
}
const fail = (code, diagnostic) => { throw new InspectionError(code, diagnostic); };
export const INSPECTION_STAGES = Object.freeze(['mongoose-connect', 'connection-verification', 'permission-inspection', 'inspection']);
export const INSPECTION_CATEGORIES = Object.freeze(['CERTIFICATE_VALIDATION_FAILURE', 'TLS_HANDSHAKE_FAILURE', 'AUTHENTICATION_FAILURE', 'AUTHORIZATION_FAILURE', 'INVALID_CONNECTION_OPTIONS',
  'DNS_SRV_FAILURE', 'DNS_HOST_FAILURE', 'NETWORK_REFUSED', 'NETWORK_RESET', 'NETWORK_TIMEOUT', 'CLUSTER_UNAVAILABLE', 'SERVER_SELECTION_TIMEOUT', 'SERVER_SELECTION_FAILURE',
  'UNKNOWN_CONNECTION_FAILURE', 'POST_CONNECT_FAILURE']);
const CODE_BY_CATEGORY = Object.freeze({ AUTHENTICATION_FAILURE: 'atlas_authentication_failed', INVALID_CONNECTION_OPTIONS: 'atlas_client_configuration_rejected',
  DNS_SRV_FAILURE: 'atlas_dns_failed', DNS_HOST_FAILURE: 'atlas_dns_failed', CERTIFICATE_VALIDATION_FAILURE: 'atlas_tls_failed', TLS_HANDSHAKE_FAILURE: 'atlas_tls_failed',
  NETWORK_TIMEOUT: 'atlas_network_timeout', SERVER_SELECTION_TIMEOUT: 'atlas_server_selection_timeout' });
const diagnostic = (stage, category, durationMs) => Object.freeze({ stage: INSPECTION_STAGES.includes(stage) ? stage : 'inspection', category: INSPECTION_CATEGORIES.includes(category) ? category : 'UNKNOWN_CONNECTION_FAILURE',
  approximateDurationMs: Number.isFinite(durationMs) ? Math.round(Math.min(120000, Math.max(0, durationMs)) / 100) * 100 : null });

// The only operations the tool may perform, by name. The report lists the ones actually performed.
export const ALLOWED_OPERATIONS = Object.freeze(['connectionStatus', 'hello', 'listCollections', 'listIndexes', 'estimatedDocumentCount', 'findOne:seed']);
const LIMITS = Object.freeze({ collections: 200, indexesPerCollection: 40 });
const safeName = value => (typeof value === 'string' && /^[A-Za-z0-9_.$-]{1,120}$/.test(value) ? value : '<unsafe-name>');
const safeKey = key => (key && typeof key === 'object' && !Array.isArray(key) ? Object.fromEntries(Object.entries(key).slice(0, 8).map(([field, direction]) =>
  [safeName(field), typeof direction === 'number' || ['text', '2dsphere', '2d', 'hashed'].includes(direction) ? direction : '<other>'])) : {});

// ---- connector: the main destination only, any identity named by the authorization, strict TLS, no write-oriented options -------------------------------
export function inspectionConnector(mongoose, user) {
  return async (uri, options) => {
    let connection; const began = performance.now();
    try {
      if (uri !== MAIN_URI || options.dbName !== MAIN_TARGET.database || options.user !== user || options.authSource !== 'admin' || options.authMechanism !== MAIN_AUTH_MECHANISM || options.authMechanismProperties !== undefined ||
          options.tls !== true || options.tlsAllowInvalidCertificates !== false || options.tlsAllowInvalidHostnames !== false || options.autoCreate !== false || options.autoIndex !== false ||
          options.bufferCommands !== false) throw new InspectionError('inspection_configuration_rejected', diagnostic('mongoose-connect', 'INVALID_CONNECTION_OPTIONS'));
      connection = mongoose.createConnection(uri, options); connection.on('error', () => {});
      await connection.asPromise();
      return connection;
    } catch (error) {
      if (connection) try { await connection.close(); } catch { /* nothing else to release */ }
      if (error instanceof InspectionError) throw error;
      const found = classifyAtlasError(error, { stage: 'mongoose-connect', durationMs: performance.now() - began, cleanup: 'completed', close: 'completed' });
      throw new InspectionError(CODE_BY_CATEGORY[found.category] ?? 'atlas_connection_unavailable', diagnostic('mongoose-connect', found.category, found.approximateDurationMs));
    }
  };
}

export function assertInspectionConnection(connection, user) {
  const o = connection?.getClient?.().options;
  if (connection?.readyState !== 1 || connection.name !== MAIN_TARGET.database || connection.db?.databaseName !== MAIN_TARGET.database || o?.srvHost !== MAIN_TARGET.host ||
      o.dbName !== MAIN_TARGET.database || o.directConnection !== false || o.tls !== true || o.tlsInsecure === true || o.tlsAllowInvalidCertificates === true || o.tlsAllowInvalidHostnames === true ||
      o.rejectUnauthorized === false || typeof o.checkServerIdentity === 'function' || o.credentials?.username !== user || o.credentials?.source !== 'admin' || o.credentials?.mechanism !== MAIN_AUTH_MECHANISM)
    fail('inspection_connection_rejected', diagnostic('connection-verification', 'INVALID_CONNECTION_OPTIONS'));
}

// Effective identity: exactly one role on two_sides_db, `read` (dedicated inspector) or `readWrite` (the backend identity), nothing on other databases.
export function verifyInspectionPermissions(result, { user, identity }) {
  const a = result?.authInfo, stage = 'permission-inspection';
  const reject = code => fail(code, diagnostic(stage, 'AUTHORIZATION_FAILURE'));
  if (result?.ok !== 1 || a?.authenticatedUsers?.length !== 1 || a.authenticatedUsers[0].user !== user || a.authenticatedUsers[0].db !== 'admin' || a.authenticatedUserRoles?.length !== 1 ||
      a.authenticatedUserRoles[0].db !== MAIN_TARGET.database || !Array.isArray(a.authenticatedUserPrivileges) || !a.authenticatedUserPrivileges.length) reject('inspection_permissions_unverified');
  const role = a.authenticatedUserRoles[0].role;
  if (!['read', 'readWrite'].includes(role) || (identity === 'dedicated-read-only') !== (role === 'read')) reject('inspection_identity_mismatch');
  const actions = new Set();
  for (const p of a.authenticatedUserPrivileges) {
    if (p.resource?.db !== MAIN_TARGET.database || typeof p.resource.collection !== 'string' || Object.keys(p.resource).some(k => !['db', 'collection'].includes(k)) ||
        !Array.isArray(p.actions) || p.actions.some(v => typeof v !== 'string')) reject('inspection_permissions_unverified');
    if (p.resource.collection === '') for (const action of p.actions) actions.add(action);
  }
  if (!['find', 'listCollections', 'listIndexes'].every(v => actions.has(v))) reject('inspection_permissions_insufficient');
  return Object.freeze({ user, database: MAIN_TARGET.database, role, writeCapable: role === 'readWrite' });
}

// ---- the inspection proper ---------------------------------------------------------------------------------------------------------------------------
const hasFlag = i => !!(i.sparse || i.partialFilterExpression || i.hidden || i.expireAfterSeconds !== undefined || (i.collation && i.collation.locale !== 'simple'));
const keyText = key => JSON.stringify(Object.entries(key ?? {}));
function compareIndexes(found, expected) {
  const result = { missing: [], incompatible: [], unexpected: [] };
  const wanted = [{ name: '_id_', key: { _id: 1 }, unique: true, builtin: true }, ...expected];
  for (const want of wanted) {
    const sameName = found.find(i => i.name === want.name);
    if (!sameName) { result.missing.push(want.name); continue; }
    if (keyText(sameName.key) !== keyText(want.key) || (!want.builtin && sameName.unique !== true) || hasFlag(sameName)) result.incompatible.push({ name: safeName(want.name), reason: hasFlag(sameName) ? 'flags' : 'definition' });
  }
  for (const i of found) if (!wanted.some(w => w.name === i.name)) result.unexpected.push({ name: safeName(i.name), key: safeKey(i.key), unique: i.unique === true });
  return result;
}

export async function inspectMainDatabase(connection, operations = [], user = MAIN_TARGET.user) {
  const db = connection.db, step = name => operations.push(name);
  const hello = await (step('hello'), db.admin().command({ hello: 1, saslSupportedMechs: `admin.${user}` }));   // names of the user's own SCRAM mechanisms, no secrets
  step('listCollections');
  const catalog = await db.listCollections({}, { nameOnly: false }).toArray();
  if (!Array.isArray(catalog)) fail('inspection_catalog_unverified', diagnostic('inspection', 'POST_CONNECT_FAILURE'));
  const sorted = [...catalog].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const truncated = sorted.length > LIMITS.collections;
  const detail = new Map();
  for (const entry of sorted.slice(0, LIMITS.collections)) {
    const name = entry.name, collection = db.collection(name), isCollection = (entry.type ?? 'collection') === 'collection';
    let indexes = [], count = null;
    if (isCollection) {
      step('listIndexes'); indexes = (await collection.indexes()).slice(0, LIMITS.indexesPerCollection);
      step('estimatedDocumentCount'); count = await collection.estimatedDocumentCount();
    }
    detail.set(name, { entry, isCollection, indexes, count });
  }
  const namespaceNames = Object.values(MAIN_SCHEMA.collections).map(c => c.name);
  const conflicts = [], required = {};
  for (const [key, definition] of Object.entries(MAIN_SCHEMA.collections)) {
    const present = detail.get(definition.name);
    if (!present) { required[key] = { name: definition.name, present: false }; continue; }
    const options = present.entry.options ?? {}, optionKeys = Object.keys(options);
    const compared = present.isCollection ? compareIndexes(present.indexes, definition.indexes) : { missing: ['<not-a-collection>'], incompatible: [], unexpected: [] };
    if (!present.isCollection) conflicts.push({ collection: definition.name, reason: 'not-a-plain-collection', type: safeName(String(present.entry.type)) });
    if (optionKeys.length) conflicts.push({ collection: definition.name, reason: 'collection-options', options: optionKeys.slice(0, 8).map(safeName) });
    if (compared.incompatible.length) conflicts.push({ collection: definition.name, reason: 'incompatible-indexes', indexes: compared.incompatible });
    if (compared.unexpected.length) conflicts.push({ collection: definition.name, reason: 'unexpected-indexes', indexes: compared.unexpected });
    required[key] = { name: definition.name, present: true, estimatedCount: present.count, indexes: compared };
  }
  // Seed: existence and validity of the revision of ONE known, non-private document. Nothing else is read.
  let seed = { checked: false };
  if (required.fences.present && detail.get(MAIN_SCHEMA.collections.fences.name).isCollection) {
    step('findOne:seed');
    const row = await db.collection(MAIN_SCHEMA.collections.fences.name).findOne({ _id: MAIN_SCHEMA.collections.fences.seed._id }, { projection: { revision: 1 } });
    seed = { checked: true, present: !!row, revisionValid: !!row && Number.isSafeInteger(row.revision) && row.revision >= 0 };
  }
  const presentCount = Object.values(required).filter(r => r.present).length;
  const indexIssues = Object.values(required).some(r => r.present && (r.indexes.missing.length));
  let verdict;
  if (conflicts.length) verdict = 'conflict';
  else if (presentCount === 0) verdict = 'bootstrap-required';
  else if (presentCount < namespaceNames.length) verdict = 'partial';
  else if (indexIssues) verdict = 'indexes-incomplete';
  else if (!seed.present || !seed.revisionValid) verdict = 'seed-missing';
  else verdict = 'ready';
  const others = [...detail.entries()].filter(([name]) => !namespaceNames.includes(name) && name !== MAIN_SCHEMA.notCreated.authorization).map(([name, d]) => ({
    name: safeName(name), type: safeName(String(d.entry.type ?? 'collection')), estimatedCount: d.count,
    indexes: d.indexes.map(i => ({ name: safeName(i.name), key: safeKey(i.key), unique: i.unique === true })) }));
  return Object.freeze({
    cluster: MAIN_TARGET.host, database: MAIN_TARGET.database, replicaSet: !!hello.setName, writablePrimary: hello.isWritablePrimary === true,
    verdict, requiredCollections: required, seed, conflicts, otherCollections: others, otherCollectionCount: others.length, truncated,
    authorizationModelCollectionPresent: detail.has(MAIN_SCHEMA.notCreated.authorization),
    // What Atlas advertises for this identity and what the driver's DEFAULT will therefore use. 'weaker' marks the documented SCRAM-SHA-1 exception.
    scram: Object.freeze({ requested: MAIN_AUTH_MECHANISM, advertised: Array.isArray(hello.saslSupportedMechs) ? hello.saslSupportedMechs.slice(0, 4).map(m => (['SCRAM-SHA-256', 'SCRAM-SHA-1'].includes(m) ? m : '<other>')) : null,
      negotiated: negotiatedScram(hello.saslSupportedMechs), weaker: negotiatedScram(hello.saslSupportedMechs) === 'SCRAM-SHA-1' }),
  });
}

// ---- the one-shot run (library part; scripts/run-main-inspection.js is the thin entry point) ---------------------------------------------------------
const OPTIONS = Object.freeze({ '--enable-main-inspection': false, '--authorization': true });
export function parseInspectionArguments(argv) {
  if (!Array.isArray(argv)) fail('arguments_rejected');
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!Object.hasOwn(OPTIONS, name) || values.has(name)) fail('arguments_rejected');
    if (OPTIONS[name]) { const value = argv[++i]; if (typeof value !== 'string' || value.startsWith('--')) fail('arguments_rejected'); values.set(name, value); } else values.set(name, true);
  }
  if (values.get('--enable-main-inspection') !== true) fail('not_enabled');
  if (!values.has('--authorization')) fail('authorization_missing');
  return Object.freeze({ authorization: values.get('--authorization') });
}

export async function runMainInspection({ argv, stdin, stdout = { write() {} }, now = Date.now, loadMongoose, platform = process.platform, nodeVersion = process.versions.node } = {}) {
  const args = parseInspectionArguments(argv);
  if (platform !== 'win32') fail('windows_required');
  if (Number(String(nodeVersion).split('.')[0]) < 20) fail('node_too_old');
  if (!stdin || typeof stdin.on !== 'function' || stdin.isTTY) fail('credential_channel_required');
  if (typeof loadMongoose !== 'function') fail('dependencies_missing');
  let authorization;
  try { authorization = readInspectionAuthorization(args.authorization, now()); } catch (error) { fail(error instanceof InspectionAuthorizationError ? error.code : 'authorization_missing'); }
  const marker = path.join(path.dirname(args.authorization), authorization.executionId + '.inspection.json');
  if (isClaimed(marker)) fail('authorization_consumed');
  let credential;
  try { credential = await receiveAtlasCredential(stdin); } catch { fail('credential_required'); }
  let mongoose;
  try { mongoose = await loadMongoose(); } catch { /* reported below */ }
  if (typeof mongoose?.createConnection !== 'function') { destroyAtlasCredential(credential); fail('dependencies_missing'); }
  // Single use: claimed (exclusively) before the connection is attempted.
  try { claimExecution(marker, { kind: 'main-schema-inspection', executionId: authorization.executionId, startedAt: new Date(now()).toISOString() }); }
  catch { destroyAtlasCredential(credential); fail('authorization_consumed'); }
  const finish = result => recordResult(marker, { kind: 'main-schema-inspection', executionId: authorization.executionId, finishedAt: new Date(now()).toISOString(), result });
  const operations = ['connectionStatus'];
  let connection;
  const began = performance.now();
  try {
    let pass;
    try { pass = consumeAtlasCredential(credential); } catch { fail('credential_required', diagnostic('mongoose-connect', 'INVALID_CONNECTION_OPTIONS')); }
    connection = await inspectionConnector(mongoose, authorization.user)(MAIN_URI, {
      dbName: MAIN_TARGET.database, user: authorization.user, pass, authSource: 'admin', authMechanism: MAIN_AUTH_MECHANISM,
      tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false, directConnection: false, readPreference: 'primary', retryWrites: false,
      maxPoolSize: 1, minPoolSize: 0, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 15000, waitQueueTimeoutMS: 2000,
      autoIndex: false, autoCreate: false, bufferCommands: false, monitorCommands: false, appName: 'TwoSides-MainInspection' });
    assertInspectionConnection(connection, authorization.user);
    let status;
    try { status = await connection.db.command({ connectionStatus: 1, showPrivileges: true }); }
    catch (error) { fail('inspection_permissions_unverified', diagnostic('permission-inspection', classifyAtlasError(error, { stage: 'mongoose-connect' }).category === 'AUTHORIZATION_FAILURE' ? 'AUTHORIZATION_FAILURE' : 'POST_CONNECT_FAILURE')); }
    const identity = verifyInspectionPermissions(status, authorization);
    let report;
    try { report = await inspectMainDatabase(connection, operations, authorization.user); }
    catch (error) {
      if (error instanceof InspectionError) throw error;
      const denied = classifyAtlasError(error, { stage: 'mongoose-connect' }).category === 'AUTHORIZATION_FAILURE' || error?.code === 13;
      fail(denied ? 'inspection_permission_denied' : 'inspection_failed', diagnostic('inspection', denied ? 'AUTHORIZATION_FAILURE' : 'POST_CONNECT_FAILURE', performance.now() - began));
    }
    const summary = Object.freeze({ ...report, identity, identityKind: authorization.identity, operations: [...new Set(operations)], operationCount: operations.length, writes: 0, http: 'not-started' });
    await connection.close(); connection = null;
    finish({ completed: true, verdict: summary.verdict });
    stdout.write(JSON.stringify({ mainSchemaInspection: 'finished', executionId: authorization.executionId, ...summary, closed: true }) + '\n');
    return summary;
  } catch (error) {
    if (connection) try { await connection.close(); } catch { /* already failing */ }
    const code = error instanceof InspectionError ? error.code : 'inspection_failed';
    finish({ completed: false, reason: code });
    if (error instanceof InspectionError) throw error;
    throw new InspectionError(code, diagnostic('inspection', 'POST_CONNECT_FAILURE', performance.now() - began));
  } finally { destroyAtlasCredential(credential); }
}

// The only text a failed run prints (stderr): fixed reason code and, when known, stage, category and a rounded duration.
export function inspectionFailureReport(error) {
  const reason = typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'unexpected';
  const d = error?.diagnostic;
  const safe = d && INSPECTION_STAGES.includes(d.stage) && INSPECTION_CATEGORIES.includes(d.category) ? d : null;
  return ['Unable to complete the main schema inspection', 'reason=' + reason, ...(safe ? ['stage=' + safe.stage, 'category=' + safe.category, 'approxMs=' + (Number.isInteger(safe.approximateDurationMs) ? safe.approximateDurationMs : 'unknown')] : [])].join('\n') + '\n';
}

// Shared with the bootstrap tool (same safe diagnostics vocabulary).
export const inspectionDiagnostic = diagnostic;
