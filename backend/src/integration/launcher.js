import { assertNotProduction } from '../config/jwt.js';
import { createBackend } from '../composition/backend.js';
import { receiveAtlasCredential } from '../modules/sync/atlas-credentials.js';
import path from 'node:path';
import { ATLAS_TARGET, INTEGRATION_PROFILE_CONFIG } from '../modules/sync/atlas-policy.js';
import { readLaunchAuthorization } from './authorization.js';
import { claimExecution, isClaimed, recordResult } from './execution-marker.js';
import { runSyntheticScenario } from './synthetic-run.js';
import { DIAGNOSTIC_CATEGORIES, DIAGNOSTIC_STAGES, INTEGRATION_ACTIVATION, INTEGRATION_PREPARE_CONFIRMATION, createIntegrationJwtConfig, inspectIntegrationSchema, integrationConnector,
  openIntegrationProfile, prepareIntegrationCollections } from './profile.js';

// B05.5 stage 7 - manual launcher of the integration backend (library part; scripts/run-integration-backend.js is the thin entry point).
//
// DISABLED BY DEFAULT and NOT AUTHORIZED BY THIS STAGE. It starts only when ALL of this holds, checked in this order and before any connection:
//   1. --enable-integration is given, together with --authorization <file>; no other option exists (no host, port-of-Atlas, database, user, URI, env file);
//   2. Windows, not production, Node >= 20, stdin is a pipe (never an interactive terminal);
//   3. the authorization file is a small regular file with a current window (<= 4 h), the exact cluster/database/user and an execution id;
//   4. the password arrives as one length-prefixed frame on stdin (hidden-input wrapper run-integration-backend.ps1): never argv, env or a file;
//   5. mongoose loads and the connection, TLS, SCRAM user and privileges verify (read-only) before the server listens;
//   6. the integration schema is already complete (read-only inspection). Creating collections needs --prepare-collections AND an authorization
//      that explicitly allows it.
// Any failure closes whatever was opened and stops with a fixed reason code that never contains user input or secrets. It listens on 127.0.0.1 only.
export class LauncherError extends Error {
  constructor(code, diagnostic) { super('Unable to start the integration backend'); this.name = 'LauncherError'; this.code = code; if (diagnostic) this.diagnostic = diagnostic; }
}
const fail = code => { throw new LauncherError(code); };
// Only fixed stage/category names and a rounded duration can reach the output; anything else is dropped.
const safeDiagnostic = d => (d && DIAGNOSTIC_STAGES.includes(d.stage) && DIAGNOSTIC_CATEGORIES.includes(d.category)
  ? Object.freeze({ stage: d.stage, category: d.category, approximateDurationMs: Number.isInteger(d.approximateDurationMs) ? d.approximateDurationMs : null }) : undefined);
const OPTIONS = Object.freeze({ '--enable-integration': false, '--prepare-collections': false, '--authorization': true, '--port': true, '--synthetic-run': false, '--auth-check': false });

// The only text a failed start prints (stderr): fixed reason code, and when known the stage, the classified category and a duration rounded to 100 ms.
export function failureReport(error) {
  const reason = typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'unexpected';
  const d = safeDiagnostic(error?.diagnostic);
  return ['Unable to start the integration backend', 'reason=' + reason, ...(d ? ['stage=' + d.stage, 'category=' + d.category, 'approxMs=' + (d.approximateDurationMs ?? 'unknown')] : [])].join('\n') + '\n';
}

export function parseArguments(argv) {
  if (!Array.isArray(argv)) fail('arguments_rejected');
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (!Object.hasOwn(OPTIONS, name) || values.has(name)) fail('arguments_rejected');
    if (OPTIONS[name]) { const value = argv[++i]; if (typeof value !== 'string' || value.startsWith('--')) fail('arguments_rejected'); values.set(name, value); }
    else values.set(name, true);
  }
  if (values.get('--enable-integration') !== true) fail('not_enabled');
  if (!values.has('--authorization')) fail('authorization_missing');
  let port = 3000;
  if (values.has('--port')) {
    const text = values.get('--port');
    if (!/^\d{1,5}$/.test(text) || Number(text) > 65535) fail('arguments_rejected');
    port = Number(text);
  }
  // --auth-check only authenticates and inspects: it excludes every option that could write or serve requests.
  if (values.get('--auth-check') === true && (values.has('--prepare-collections') || values.has('--synthetic-run') || values.has('--port'))) fail('arguments_rejected');
  return Object.freeze({ authorization: values.get('--authorization'), port, prepare: values.get('--prepare-collections') === true, syntheticRun: values.get('--synthetic-run') === true, authCheck: values.get('--auth-check') === true });
}

export async function main({ argv, stdin, stdout = { write() {} }, now = Date.now, loadMongoose, platform = process.platform, nodeVersion = process.versions.node } = {}) {
  const args = parseArguments(argv);
  if (platform !== 'win32') fail('windows_required');
  try { assertNotProduction(); } catch { fail('production_refused'); }
  if (Number(String(nodeVersion).split('.')[0]) < 20) fail('node_too_old');
  if (!stdin || typeof stdin.on !== 'function' || stdin.isTTY) fail('credential_channel_required');
  if (typeof loadMongoose !== 'function') fail('dependencies_missing');
  let authorization;
  try { authorization = readLaunchAuthorization(args.authorization, now()); } catch (error) { fail(error.code ?? 'authorization_missing'); }
  if (args.prepare && !authorization.allowCollectionPreparation) fail('preparation_not_authorized');
  // A synthetic run is single-use: its manifest (written at registration, next to the authorization file) marks the execution id as consumed.
  const manifestFile = path.join(path.dirname(args.authorization), authorization.executionId + '.manifest.json');
  if ((args.syntheticRun || args.authCheck) && isClaimed(manifestFile)) fail('authorization_consumed');

  let credential;
  try { credential = await receiveAtlasCredential(stdin); } catch { fail('credential_required'); }
  let mongoose;
  try { mongoose = await loadMongoose(); } catch { /* reported below */ }
  if (typeof mongoose?.createConnection !== 'function') { /* the credential handle is destroyed by the opener's finally */ }
  if (args.authCheck) {
    // Single use: the marker is created (exclusively) before the connection is attempted, so a second run with the same authorization is refused.
    try { claimExecution(manifestFile, { kind: 'auth-check', executionId: authorization.executionId, startedAt: new Date(now()).toISOString() }); }
    catch { fail('authorization_consumed'); }
  }
  const finishMarker = result => { if (args.authCheck) recordResult(manifestFile, { kind: 'auth-check', executionId: authorization.executionId, finishedAt: new Date(now()).toISOString(), result }); };
  let bundle;
  try {
    if (typeof mongoose?.createConnection !== 'function') fail('dependencies_missing');
    bundle = await openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential, connector: integrationConnector(mongoose), now });
  } catch (error) {
    finishMarker({ authenticated: false, reason: typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'unexpected' });
    if (error instanceof LauncherError) throw error;
    throw new LauncherError(typeof error?.code === 'string' ? error.code : 'atlas_unavailable', safeDiagnostic(error?.diagnostic));
  }
  let phase = 'schema';
  if (args.authCheck) {
    // Authentication check: the connection, the TLS/SCRAM user and its privileges were verified (read-only) by the opener. Only the read-only schema
    // inspection is added. No HTTP server, no preparation, no registration, no ingestion, no write of any kind; then everything is closed.
    try {
      const schema = await inspectIntegrationSchema(bundle);
      const report = Object.freeze({ authenticated: true, user: ATLAS_TARGET.user, database: ATLAS_TARGET.database, authSource: 'admin', mechanism: INTEGRATION_PROFILE_CONFIG.authMechanism,
        tls: 'strict', privileges: bundle.permissions.status, role: bundle.permissions.role, schemaReady: schema.ready, collectionsPresent: schema.present.length, collectionsMissing: schema.missing,
        indexProblems: schema.problems.length, writes: 0, http: 'not-started' });
      await bundle.close();
      finishMarker(report);
      stdout.write(JSON.stringify({ integrationBackend: 'auth-check-finished', executionId: authorization.executionId, ...report, closed: true }) + '\n');
      return Object.freeze({ authCheck: report, executionId: authorization.executionId, close: async () => {} });
    } catch (error) {
      try { await bundle.close(); } catch { /* already failing */ }
      finishMarker({ authenticated: true, reason: typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'inspection_failed' });
      throw new LauncherError(typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'inspection_failed', safeDiagnostic(error?.diagnostic ?? { stage: 'schema', category: 'POST_CONNECT_FAILURE', approximateDurationMs: null }));
    }
  }
  try {
    let schema = await inspectIntegrationSchema(bundle);
    if (!schema.ready) {
      if (!args.prepare) fail('schema_not_ready');
      await prepareIntegrationCollections(bundle, { confirm: INTEGRATION_PREPARE_CONFIRMATION });
      schema = await inspectIntegrationSchema(bundle);
      if (!schema.ready) fail('schema_not_ready');
    }
    phase = 'listen';
    const jwtConfig = await createIntegrationJwtConfig();
    const backend = createBackend({ profile: 'integration', jwtConfig, integration: bundle, now });
    const { host, port } = await backend.start({ host: '127.0.0.1', port: args.port });
    const url = `http://${host}:${port}`;
    stdout.write(JSON.stringify({ integrationBackend: 'listening', profile: 'integration', url, executionId: authorization.executionId, schema: 'ready' }) + '\n');
    if (args.syntheticRun) {
      // Stage 8: bounded synthetic scenario in this process, then an orderly shutdown (HTTP first, then MongoDB). The manifest (ids only) sits next to the authorization file.
      let outcome;
      try { outcome = await runSyntheticScenario({ url, bundle, executionId: authorization.executionId, notAfter: authorization.notAfter, now, manifestFile }); }
      finally { await backend.close({ graceMs: 5000 }); }
      stdout.write(JSON.stringify({ integrationBackend: 'synthetic-run-finished', ...outcome, closed: true }) + '\n');
      return Object.freeze({ backend, url, executionId: authorization.executionId, syntheticResult: outcome, close: async () => {} });
    }
    return Object.freeze({ backend, url, executionId: authorization.executionId, close: options => backend.close(options) });
  } catch (error) {
    try { await bundle.close(); } catch { /* already failing */ }
    if (error instanceof LauncherError) throw error.diagnostic ? error : new LauncherError(error.code, safeDiagnostic({ stage: phase, category: 'POST_CONNECT_FAILURE', approximateDurationMs: null }));
    throw new LauncherError(typeof error?.code === 'string' && /^[A-Za-z_]{3,48}$/.test(error.code) ? error.code : 'startup_failed', safeDiagnostic(error?.diagnostic ?? { stage: phase, category: 'POST_CONNECT_FAILURE', approximateDurationMs: null }));
  }
}
