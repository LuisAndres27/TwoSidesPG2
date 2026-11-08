import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { MAIN_AUTH_MECHANISM, MAIN_TARGET, MAIN_URI } from './administrative-policy.js';
import { MAIN_SCHEMA } from './schema-inventory.js';
import { BootstrapAuthorizationError, readBootstrapAuthorization } from './bootstrap-authorization.js';
import { claimExecution, isClaimed, recordResult } from './inspection-marker.js';
import { INSPECTION_CATEGORIES, INSPECTION_STAGES, InspectionError, assertInspectionConnection, inspectMainDatabase, inspectionConnector, inspectionDiagnostic as diagnostic } from './inspection.js';
import { classifyAtlasError } from '../modules/sync/atlas-error-diagnostic.js';
import { consumeAtlasCredential, destroyAtlasCredential, receiveAtlasCredential } from '../modules/sync/atlas-credentials.js';

// B05.5 stage 12 - ONE-SHOT bootstrap of the main_v2 schema in two_sides_db: the 7 collections, the 5 unique indexes and the seed document `ingestion-v1`.
// Independent of the Express server, of the `main` runtime, of the inspection run and of the integration profile. DISABLED BY DEFAULT: nothing here connects on
// import, and a run needs the explicit flag, a valid bootstrap authorization (own kind, <= 60 min, single use, explicit confirmation phrase) and a credential
// frame on stdin from the hidden-input wrapper.
//
// Order of work, fail closed at every point:
//   1. READ  - the same read-only inspection as run-main-inspection (connectionStatus, hello, listCollections, listIndexes, estimatedDocumentCount, seed findOne);
//   2. PLAN  - only the missing managed objects; ANY conflict, incompatible/unexpected index, invalid seed or unwritable identity stops the run with zero writes;
//   3. WRITE - (mode "apply" only) additive and idempotent steps, in order: createCollection, createIndex, seed upsert ($setOnInsert). Nothing is dropped,
//              renamed, updated, deleted or "repaired". Each step is journaled in the local marker before the next one starts;
//   4. VERIFY- the inspection is repeated and must report `ready`; the historical collections are compared (names and index definitions) before and after.
// Every write goes through `Writer`, which accepts only names of the 7 managed main_v2 collections and the fixed index/seed definitions of the inventory. The
// historical collections (users, decisions, gameevents, gameprogresses, statisticevents, statisticsummaries, syncidentities) and any other name are refused.
export const PROTECTED_COLLECTIONS = Object.freeze(['users', 'decisions', 'gameevents', 'gameprogresses', 'statisticevents', 'statisticsummaries', 'syncidentities']);
export const BOOTSTRAP_WRITE_OPERATIONS = Object.freeze(['createCollection', 'createIndex', 'seedUpsert']);
const MANAGED = Object.freeze(new Map(Object.values(MAIN_SCHEMA.collections).map(c => [c.name, c])));
const WRITE_CONCERN = Object.freeze({ w: 'majority', j: true });
const fail = (code, stage, category, partial) => { const error = new InspectionError(code, diagnostic(stage, category)); if (partial) error.partial = partial; throw error; };

export function assertManaged(name) {
  if (typeof name !== 'string' || PROTECTED_COLLECTIONS.includes(name.toLowerCase()) || !MANAGED.has(name)) throw new InspectionError('bootstrap_target_rejected', diagnostic('inspection', 'INVALID_CONNECTION_OPTIONS'));
  return MANAGED.get(name);
}

// The only write surface of the tool.
export function createWriter(db) {
  return Object.freeze({
    async createCollection(name) { assertManaged(name); await db.createCollection(name, { writeConcern: WRITE_CONCERN }); },
    async createIndex(name, indexName) {
      const definition = assertManaged(name).indexes.find(i => i.name === indexName);
      if (!definition) throw new InspectionError('bootstrap_target_rejected', diagnostic('inspection', 'INVALID_CONNECTION_OPTIONS'));
      await db.collection(name).createIndex({ ...definition.key }, { name: definition.name, unique: true, writeConcern: WRITE_CONCERN });
    },
    async seedUpsert() {
      const fences = MAIN_SCHEMA.collections.fences; assertManaged(fences.name);
      await db.collection(fences.name).updateOne({ _id: fences.seed._id }, { $setOnInsert: { revision: fences.seed.revision } }, { upsert: true, writeConcern: WRITE_CONCERN });
    },
  });
}

// The effective identity must be the backend user with exactly readWrite on two_sides_db and the actions the three write operations need.
export function verifyBootstrapPermissions(result) {
  const a = result?.authInfo, stage = 'permission-inspection', reject = code => fail(code, stage, 'AUTHORIZATION_FAILURE');
  if (result?.ok !== 1 || a?.authenticatedUsers?.length !== 1 || a.authenticatedUsers[0].user !== MAIN_TARGET.user || a.authenticatedUsers[0].db !== 'admin' || a.authenticatedUserRoles?.length !== 1 ||
      a.authenticatedUserRoles[0].db !== MAIN_TARGET.database || a.authenticatedUserRoles[0].role !== 'readWrite' || !Array.isArray(a.authenticatedUserPrivileges) || !a.authenticatedUserPrivileges.length) reject('bootstrap_permissions_unverified');
  const actions = new Set();
  for (const p of a.authenticatedUserPrivileges) {
    if (p.resource?.db !== MAIN_TARGET.database || typeof p.resource.collection !== 'string' || Object.keys(p.resource).some(k => !['db', 'collection'].includes(k)) ||
        !Array.isArray(p.actions) || p.actions.some(v => typeof v !== 'string')) reject('bootstrap_permissions_unverified');
    if (p.resource.collection === '') for (const action of p.actions) actions.add(action);
  }
  if (!['find', 'listCollections', 'listIndexes', 'createCollection', 'createIndex', 'insert', 'update'].every(v => actions.has(v))) reject('bootstrap_permissions_insufficient');
  return Object.freeze({ user: MAIN_TARGET.user, database: MAIN_TARGET.database, role: 'readWrite' });
}

// ---- plan: derived from the read-only inspection report, additive only ---------------------------------------------------------------------------------
export function planBootstrap(report) {
  if (report.verdict === 'conflict') fail('bootstrap_conflict', 'inspection', 'POST_CONNECT_FAILURE');
  if (!report.replicaSet || !report.writablePrimary) fail('bootstrap_transactions_unverified', 'inspection', 'POST_CONNECT_FAILURE');
  if (report.seed.checked && report.seed.present && !report.seed.revisionValid) fail('bootstrap_seed_conflict', 'inspection', 'POST_CONNECT_FAILURE');
  const steps = [];
  for (const [key, definition] of Object.entries(MAIN_SCHEMA.collections)) if (!report.requiredCollections[key].present) steps.push({ step: 'createCollection', collection: definition.name });
  for (const [key, definition] of Object.entries(MAIN_SCHEMA.collections)) {
    const found = report.requiredCollections[key];
    if (found.present && found.indexes.missing.includes('_id_')) fail('bootstrap_conflict', 'inspection', 'POST_CONNECT_FAILURE');   // cannot be repaired by adding objects
    const wanted = found.present ? found.indexes.missing.filter(n => n !== '_id_') : definition.indexes.map(i => i.name);
    for (const index of wanted) steps.push({ step: 'createIndex', collection: definition.name, index });
  }
  if (!(report.seed.checked && report.seed.present)) steps.push({ step: 'seedUpsert', collection: MAIN_SCHEMA.collections.fences.name });
  return Object.freeze(steps.map(s => Object.freeze(s)));
}

const label = s => [s.step, s.collection, s.index].filter(Boolean).join(':');
// Every step label that can exist: only these may ever be printed.
const KNOWN_STEPS = Object.freeze(new Set([...Object.values(MAIN_SCHEMA.collections).flatMap(c => [`createCollection:${c.name}`, ...c.indexes.map(i => `createIndex:${c.name}:${i.name}`)]), `seedUpsert:${MAIN_SCHEMA.collections.fences.name}`]));
const safeShape = report => JSON.stringify(report.otherCollections.map(c => [c.name, c.type, c.indexes.map(i => [i.name, i.key, i.unique])]));

// ---- the one-shot run ----------------------------------------------------------------------------------------------------------------------------------
const OPTIONS = Object.freeze({ '--enable-main-bootstrap': false, '--authorization': true });
export function parseBootstrapArguments(argv) {
  if (!Array.isArray(argv)) throw new InspectionError('arguments_rejected');
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!Object.hasOwn(OPTIONS, name) || values.has(name)) throw new InspectionError('arguments_rejected');
    if (OPTIONS[name]) { const value = argv[++i]; if (typeof value !== 'string' || value.startsWith('--')) throw new InspectionError('arguments_rejected'); values.set(name, value); } else values.set(name, true);
  }
  if (values.get('--enable-main-bootstrap') !== true) throw new InspectionError('not_enabled');
  if (!values.has('--authorization')) throw new InspectionError('authorization_missing');
  return Object.freeze({ authorization: values.get('--authorization') });
}

export async function runMainBootstrap({ argv, stdin, stdout = { write() {} }, now = Date.now, loadMongoose, platform = process.platform, nodeVersion = process.versions.node } = {}) {
  const args = parseBootstrapArguments(argv);
  if (platform !== 'win32') throw new InspectionError('windows_required');
  if (Number(String(nodeVersion).split('.')[0]) < 20) throw new InspectionError('node_too_old');
  if (!stdin || typeof stdin.on !== 'function' || stdin.isTTY) throw new InspectionError('credential_channel_required');
  if (typeof loadMongoose !== 'function') throw new InspectionError('dependencies_missing');
  let authorization;
  try { authorization = readBootstrapAuthorization(args.authorization, now()); } catch (error) { throw new InspectionError(error instanceof BootstrapAuthorizationError ? error.code : 'authorization_missing'); }
  const marker = path.join(path.dirname(args.authorization), authorization.executionId + '.bootstrap.json');
  if (isClaimed(marker)) throw new InspectionError('authorization_consumed');
  let credential;
  try { credential = await receiveAtlasCredential(stdin); } catch { throw new InspectionError('credential_required'); }
  let mongoose;
  try { mongoose = await loadMongoose(); } catch { /* reported below */ }
  if (typeof mongoose?.createConnection !== 'function') { destroyAtlasCredential(credential); throw new InspectionError('dependencies_missing'); }
  try { claimExecution(marker, { kind: 'main-schema-bootstrap', executionId: authorization.executionId, mode: authorization.mode, startedAt: new Date(now()).toISOString() }); }
  catch { destroyAtlasCredential(credential); throw new InspectionError('authorization_consumed'); }
  const journal = (extra) => recordResult(marker, { kind: 'main-schema-bootstrap', executionId: authorization.executionId, mode: authorization.mode, updatedAt: new Date(now()).toISOString(), ...extra });
  const executed = [];
  let connection, plan = [], current = null;
  const began = performance.now();
  try {
    let pass;
    try { pass = consumeAtlasCredential(credential); } catch { fail('credential_required', 'mongoose-connect', 'INVALID_CONNECTION_OPTIONS'); }
    connection = await inspectionConnector(mongoose, MAIN_TARGET.user)(MAIN_URI, {
      dbName: MAIN_TARGET.database, user: MAIN_TARGET.user, pass, authSource: 'admin', authMechanism: MAIN_AUTH_MECHANISM,
      tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false, directConnection: false, readPreference: 'primary', retryWrites: true, w: 'majority',
      maxPoolSize: 1, minPoolSize: 0, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 30000, waitQueueTimeoutMS: 2000,
      autoIndex: false, autoCreate: false, bufferCommands: false, monitorCommands: false, appName: 'TwoSides-MainBootstrap' });
    assertInspectionConnection(connection, MAIN_TARGET.user);
    let status;
    try { status = await connection.db.command({ connectionStatus: 1, showPrivileges: true }); } catch { fail('bootstrap_permissions_unverified', 'permission-inspection', 'POST_CONNECT_FAILURE'); }
    const identity = verifyBootstrapPermissions(status);

    // 1-2. READ and PLAN. Nothing has been written yet; any refusal here is a zero-write exit.
    const readOps = ['connectionStatus'];
    let before;
    try { before = await inspectMainDatabase(connection, readOps, MAIN_TARGET.user); }
    catch (error) { if (error instanceof InspectionError) throw error; fail('bootstrap_inspection_failed', 'inspection', 'POST_CONNECT_FAILURE'); }
    plan = planBootstrap(before);
    journal({ phase: 'planned', plan: plan.map(label), executed: [] });

    // 3. WRITE (apply only).
    if (authorization.mode === 'apply') {
      const writer = createWriter(connection.db);
      for (const step of plan) {
        current = step;
        try {
          if (step.step === 'createCollection') await writer.createCollection(step.collection);
          else if (step.step === 'createIndex') await writer.createIndex(step.collection, step.index);
          else await writer.seedUpsert();
        } catch (error) {
          if (error instanceof InspectionError) throw error;
          // NamespaceExists on a collection that was created meanwhile is tolerated: the verification below proves it is correct or the run fails.
          if (step.step === 'createCollection' && error?.code === 48) { executed.push(label(step) + ':already-exists'); journal({ phase: 'writing', plan: plan.map(label), executed }); continue; }
          const conflict = [85, 86].includes(error?.code);
          fail(conflict ? 'bootstrap_index_conflict' : (error?.code === 13 || /not authorized/i.test(String(error?.message))) ? 'bootstrap_permission_denied' : 'bootstrap_step_failed', 'inspection', conflict ? 'POST_CONNECT_FAILURE' : 'AUTHORIZATION_FAILURE');
        }
        executed.push(label(step)); journal({ phase: 'writing', plan: plan.map(label), executed });
      }
      current = null;
    }

    // 4. VERIFY.
    let after = before;
    if (authorization.mode === 'apply' && plan.length) {
      try { after = await inspectMainDatabase(connection, readOps, MAIN_TARGET.user); } catch (error) { if (error instanceof InspectionError) throw error; fail('bootstrap_verification_failed', 'inspection', 'POST_CONNECT_FAILURE'); }
      if (after.verdict !== 'ready') fail('bootstrap_verification_failed', 'inspection', 'POST_CONNECT_FAILURE');
    }
    if (safeShape(before) !== safeShape(after)) fail('bootstrap_historical_changed', 'inspection', 'POST_CONNECT_FAILURE');
    const summary = Object.freeze({
      mode: authorization.mode, identity, database: MAIN_TARGET.database, preVerdict: before.verdict, postVerdict: after.verdict, plan: plan.map(label), executed: [...executed], writes: executed.length,
      historicalUnchanged: true, historicalCollectionCount: after.otherCollectionCount, protectedCollections: PROTECTED_COLLECTIONS, scram: after.scram, operations: [...new Set(readOps)], http: 'not-started' });
    await connection.close(); connection = null;
    journal({ phase: 'finished', completed: true, plan: plan.map(label), executed, postVerdict: summary.postVerdict });
    stdout.write(JSON.stringify({ mainSchemaBootstrap: 'finished', executionId: authorization.executionId, ...summary, closed: true }) + '\n');
    return summary;
  } catch (error) {
    if (connection) try { await connection.close(); } catch { /* already failing */ }
    const code = error instanceof InspectionError ? error.code : 'bootstrap_failed';
    const remaining = plan.filter(s => !executed.some(e => e.startsWith(label(s)))).map(label);
    journal({ phase: 'failed', completed: false, reason: code, plan: plan.map(label), executed, failedStep: current ? label(current) : null, remaining });
    const out = error instanceof InspectionError ? error : new InspectionError(code, diagnostic('inspection', 'POST_CONNECT_FAILURE', performance.now() - began));
    out.partial = { executed: executed.length, failedStep: current ? label(current) : null, remaining: remaining.length };
    throw out;
  } finally { destroyAtlasCredential(credential); }
}

// The only text a failed run prints (stderr): fixed reason code, stage/category/duration, and the partial-progress counters (names come from the inventory).
export function bootstrapFailureReport(error) {
  const reason = typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'unexpected';
  const d = error?.diagnostic, safe = d && INSPECTION_STAGES.includes(d.stage) && INSPECTION_CATEGORIES.includes(d.category) ? d : null;
  const p = error?.partial, lines = ['Unable to complete the main schema bootstrap', 'reason=' + reason];
  if (safe) lines.push('stage=' + safe.stage, 'category=' + safe.category, 'approxMs=' + (Number.isInteger(safe.approximateDurationMs) ? safe.approximateDurationMs : 'unknown'));
  if (p && Number.isInteger(p.executed) && Number.isInteger(p.remaining)) lines.push('stepsExecuted=' + p.executed, 'stepsRemaining=' + p.remaining,
    'failedStep=' + (KNOWN_STEPS.has(p.failedStep) ? p.failedStep : 'none'));
  return lines.join('\n') + '\n';
}
