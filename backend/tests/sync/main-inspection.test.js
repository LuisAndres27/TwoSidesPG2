import {restrictedStatus} from './support/restricted-status.js';
import {MAIN_TARGET as ADMIN_TARGET} from '../../src/main/administrative-policy.js';
import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import dns from 'node:dns';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ALLOWED_OPERATIONS, InspectionError, inspectionConnector, inspectionFailureReport, parseInspectionArguments, runMainInspection, verifyInspectionPermissions } from '../../src/main/inspection.js';
import { parseInspectionAuthorization, INSPECTION_MAX_WINDOW_MS } from '../../src/main/inspection-authorization.js';
import { MAIN_SCHEMA } from '../../src/main/schema-inventory.js';
import { MAIN_URI, authorizeMainScope } from '../../src/main/policy.js';
import { ingestionModels } from '../../src/modules/sync/mongo-models.js';
import { mongoIdentityModels } from '../../src/modules/auth/mongo-identity-models.js';
import { integrationDouble } from './support/integration-double.js';
import { ALLOWED, fullSchema, idIndex, inspectionDouble, requiredIndexes, statusFor } from './support/inspection-double.js';

// B05.5 stage 10, offline: the one-shot read-only schema inspection of two_sides_db. A MongoDB DOUBLE whose every unexpected call is recorded and fails; no
// socket, no DNS, no real credential. The only "passwords" are random strings per test, used to prove they never reach any output.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const dirs = [], sockets = [], lookups = [];
let temp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-maininspect-')); dirs.push(temp); sockets.length = 0; lookups.length = 0;
  const connect = net.Socket.prototype.connect, lookup = dns.lookup;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { sockets.push(args[0]); return connect.apply(this, args); });
  vi.spyOn(dns, 'lookup').mockImplementation(function (host, ...rest) { lookups.push(host); return lookup.call(this, host, ...rest); });
});
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });
const nowMs = Date.now(), iso = ms => new Date(ms).toISOString();
const authorization = (changes = {}) => {
  const body = { schemaVersion: 1, kind: 'atlas-main-schema-inspection', executionId: randomBytes(16).toString('hex'), host: ADMIN_TARGET.host, database: ADMIN_TARGET.database,
    user: 'twosides_inspector', identity: 'dedicated-read-only', notBefore: iso(nowMs - 60_000), notAfter: iso(nowMs + 3_000_000), ...changes };
  const file = path.join(temp, randomUUID() + '.json'); fs.writeFileSync(file, JSON.stringify(body));
  return { file, body, marker: path.join(temp, body.executionId + '.inspection.json') };
};
const frame = text => { const bytes = Buffer.from(text); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const pipeWith = data => { const s = new PassThrough(); s.write(data); s.end(); return s; };
const run = async (double, { auth = authorization(), password = 'pw-' + randomBytes(12).toString('hex'), argv, stdin } = {}) => {
  const lines = [];
  try {
    const report = await runMainInspection({ argv: argv ?? ['--enable-main-inspection', '--authorization', auth.file], stdin: stdin ?? pipeWith(frame(password)), stdout: { write: t => lines.push(t) },
      now: () => nowMs, loadMongoose: async () => double.mongoose });
    return { report, lines, auth, password, text: lines.join('') };
  } catch (error) { return { error, lines, auth, password, text: lines.join('') }; }
};
const withSchema = change => { const collections = fullSchema(); change(collections); return inspectionDouble({ collections }); };

it('IN01 the destination is fixed: the main host and database only, any other destination, user, mechanism or TLS setting is refused before a connection', async () => {
  const double = inspectionDouble(), connector = inspectionConnector(double.mongoose, 'twosides_inspector');
  const base = { dbName: ADMIN_TARGET.database, user: 'twosides_inspector', pass: 'x', authSource: 'admin', authMechanism: 'DEFAULT', tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false, autoCreate: false, autoIndex: false, bufferCommands: false };
  expect(MAIN_URI).toBe('mongodb+srv://twosidescluster.fxqeo8o.mongodb.net/two_sides_db');
  for (const [uri, change] of [[MAIN_URI.replace('two_sides_db', 'two_sides_integration_test'), {}], ['mongodb+srv://evil.example/two_sides_db', {}], ['mongodb://127.0.0.1/two_sides_db', {}], [MAIN_URI, { dbName: 'two_sides_integration_test' }],
    [MAIN_URI, { user: 'twosides_integration_test' }], [MAIN_URI, { authSource: 'two_sides_db' }], [MAIN_URI, { authMechanism: 'SCRAM-SHA-256' }], [MAIN_URI, { authMechanism: 'SCRAM-SHA-1' }], [MAIN_URI, { authMechanism: 'PLAIN' }], [MAIN_URI, { authMechanism: 'MONGODB-X509' }], [MAIN_URI, { authMechanismProperties: {} }], [MAIN_URI, { tls: false }], [MAIN_URI, { tlsAllowInvalidCertificates: true }],
    [MAIN_URI, { autoCreate: true }], [MAIN_URI, { autoIndex: true }], [MAIN_URI, { bufferCommands: true }]])
    await expect(connector(uri, { ...base, ...change }), JSON.stringify(change)).rejects.toMatchObject({ code: 'inspection_configuration_rejected' });
  expect(double.connects).toBe(0);
  await expect(connector(MAIN_URI, base)).resolves.toBeTruthy(); expect(double.connects).toBe(1);
  const good = authorization().body;
  expect(parseInspectionAuthorization(JSON.stringify(good), nowMs)).toMatchObject({ database: 'two_sides_db', identity: 'dedicated-read-only' });
  for (const change of [{ host: 'other.mongodb.net' }, { database: 'two_sides_integration_test' }, { database: 'admin' }, { user: 'twosides_integration_test', identity: 'dedicated-read-only' }, { user: 'TWOSIDES_INTEGRATION_TEST' },
    { kind: 'atlas-integration-launch' }, { identity: 'rotated-backend' }, { user: 'twosides_backend' }, { user: 'twosides_backend', identity: 'dedicated-read-only' }, { extra: true }, { identity: undefined },
    { notAfter: iso(nowMs + INSPECTION_MAX_WINDOW_MS + 120_000) }, { notBefore: iso(nowMs + 60_000), notAfter: iso(nowMs + 600_000) }, { notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) }])
    expect(() => parseInspectionAuthorization(JSON.stringify({ ...good, ...change }), nowMs), JSON.stringify(change)).toThrow();
  expect(parseInspectionAuthorization(JSON.stringify({ ...good, user: 'twosides_backend', identity: 'rotated-backend' }), nowMs).user).toBe('twosides_backend');
  expect(MAIN_SCHEMA.database).toBe('two_sides_db');
});

it('IN02 a complete schema inspects as ready using only the allowed operations, and the report holds names, index definitions and counts, never documents or secrets', async () => {
  const collections = fullSchema();
  collections.users = { indexes: [idIndex(), { v: 2, name: 'email_1', key: { email: 1 }, unique: true }], count: 1234 };
  const double = inspectionDouble({ collections, seed: { _id: 'ingestion-v1', revision: 7, tokenHash: 'SECRET-SHOULD-NEVER-APPEAR', displayName: 'PRIVATE-PLAYER' } });
  const { report, text, auth } = await run(double);
  expect(report).toMatchObject({ verdict: 'ready', database: 'two_sides_db', replicaSet: true, writablePrimary: true, writes: 0, http: 'not-started', identityKind: 'dedicated-read-only',
    identity: { user: 'twosides_inspector', role: 'read', writeCapable: false }, seed: { checked: true, present: true, revisionValid: true }, conflicts: [], otherCollectionCount: 1 });
  expect(report.otherCollections[0]).toEqual({ name: 'users', type: 'collection', estimatedCount: 1234, indexes: [{ name: '_id_', key: { _id: 1 }, unique: false }, { name: 'email_1', key: { email: 1 }, unique: true }] });
  for (const key of Object.keys(MAIN_SCHEMA.collections)) expect(report.requiredCollections[key]).toMatchObject({ present: true, indexes: { missing: [], incompatible: [], unexpected: [] } });
  expect(double.log.every(op => ALLOWED.includes(op))).toBe(true); expect(report.operations.every(op => ALLOWED_OPERATIONS.includes(op))).toBe(true);
  expect(double.log.filter(op => op === 'findOne:seed')).toHaveLength(1); expect(double.forbidden).toEqual([]); expect(double.closed).toBe(1);
  for (const forbidden of ['SECRET-SHOULD-NEVER-APPEAR', 'PRIVATE-PLAYER', 'tokenHash', 'displayName']) expect(text + fs.readFileSync(auth.marker, 'utf8')).not.toContain(forbidden);
  expect(JSON.parse(fs.readFileSync(auth.marker, 'utf8'))).toMatchObject({ kind: 'main-schema-inspection', result: { completed: true, verdict: 'ready' } });
  expect(double.optionsSeen[0]).toMatchObject({ dbName: 'two_sides_db', user: 'twosides_inspector', authSource: 'admin', authMechanism: 'DEFAULT', tls: true, tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false, directConnection: false, retryWrites: false, autoIndex: false, autoCreate: false, bufferCommands: false, maxPoolSize: 1 });
  expect(double.uriSeen).toEqual([MAIN_URI]); expect(sockets.filter(s => s && (s.port || s.path))).toEqual([]); expect(lookups).toEqual([]);
});

it('IN03 no write operation exists: every database and collection call outside the allowed list fails and is recorded, across every verdict', async () => {
  const scenarios = [inspectionDouble(), inspectionDouble({ collections: {} }), withSchema(c => { delete c.main_v2_ownerGuards; delete c.main_v2_fences; }), withSchema(c => { c.main_v2_operations.indexes = [idIndex()]; }),
    inspectionDouble({ seed: null }), withSchema(c => { c.main_v2_facts.indexes.push({ v: 2, name: 'rogue_1', key: { rogue: 1 } }); })];
  for (const double of scenarios) {
    const { report, error } = await run(double);
    expect(error).toBeUndefined(); expect(report.writes).toBe(0);
    expect(double.log.every(op => ALLOWED.includes(op)), report.verdict).toBe(true); expect(double.forbidden, report.verdict).toEqual([]);
    expect(double.log.some(op => /create|insert|update|delete|drop|remove|index.*create|replace|bulk/i.test(op))).toBe(false);
  }
  const source = fs.readFileSync(path.join(backendRoot, 'src', 'main', 'inspection.js'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  expect(source).not.toMatch(/createCollection|createIndex|syncIndexes|ensureIndexes|dropCollection|dropDatabase|\.drop\(|deleteMany|deleteOne|\.remove\(|insertOne|insertMany|bulkWrite|updateOne|updateMany|findOneAndUpdate|replaceOne|renameCollection|\.model\(|mongoose\.model|\.init\(/);
  expect(source).not.toMatch(/collection\([^)]*\)\.find\(|\.aggregate\(|\.distinct\(|countDocuments\(|\.watch\(/);                      // no document-reading queries besides the one seed findOne
});

it('IN04 missing collections, missing indexes and a missing seed are detected and classified, never repaired', async () => {
  const empty = await run(inspectionDouble({ collections: {} }));
  expect(empty.report).toMatchObject({ verdict: 'bootstrap-required', conflicts: [], seed: { checked: false } });
  expect(Object.values(empty.report.requiredCollections).every(r => r.present === false)).toBe(true);
  const partial = await run(withSchema(c => { delete c.main_v2_ownerGuards; delete c.main_v2_revocations; }));
  expect(partial.report.verdict).toBe('partial'); expect(partial.report.requiredCollections.ownerGuards.present).toBe(false); expect(partial.report.requiredCollections.operations.present).toBe(true);
  const missingIndex = await run(withSchema(c => { c.main_v2_identities.indexes = c.main_v2_identities.indexes.filter(i => i.name !== 'identity_binding_unique'); }));
  expect(missingIndex.report.verdict).toBe('indexes-incomplete'); expect(missingIndex.report.requiredCollections.identities.indexes.missing).toEqual(['identity_binding_unique']);
  const noIdIndex = await run(withSchema(c => { c.main_v2_revocations.indexes = []; }));
  expect(noIdIndex.report.requiredCollections.revocations.indexes.missing).toEqual(['_id_']);
  expect((await run(inspectionDouble({ seed: null }))).report).toMatchObject({ verdict: 'seed-missing', seed: { checked: true, present: false, revisionValid: false } });
  for (const revision of [-1, 1.5, '1', null, undefined]) expect((await run(inspectionDouble({ seed: { _id: 'ingestion-v1', revision } }))).report, String(revision)).toMatchObject({ verdict: 'seed-missing', seed: { present: true, revisionValid: false } });
  const noFences = await run(withSchema(c => { delete c.main_v2_fences; }));
  expect(noFences.report.seed).toEqual({ checked: false }); expect(noFences.report.verdict).toBe('partial');
  const double = inspectionDouble({ collections: {} }); await run(double);
  expect(double.log).toEqual(['connectionStatus', 'hello', 'listCollections']);                         // an empty database costs three reads and nothing else
});

it('IN05 incompatible indexes, options and namespace conflicts are reported as conflicts with the reason, and nothing is altered', async () => {
  const cases = [
    ['different key', c => { c.main_v2_operations.indexes[1] = { v: 2, name: 'owner_operation_unique', key: { operationId: 1 }, unique: true }; }, 'incompatible-indexes'],
    ['not unique', c => { c.main_v2_facts.indexes[1] = { v: 2, name: 'scope_source_unique', key: { scope: 1, sourceKey: 1 } }; }, 'incompatible-indexes'],
    ['sparse', c => { c.main_v2_identities.indexes[1].sparse = true; }, 'incompatible-indexes'],
    ['partial', c => { c.main_v2_identities.indexes[2].partialFilterExpression = { a: 1 }; }, 'incompatible-indexes'],
    ['ttl', c => { c.main_v2_identitySessions.indexes[1].expireAfterSeconds = 60; }, 'incompatible-indexes'],
    ['hidden', c => { c.main_v2_identitySessions.indexes[1].hidden = true; }, 'incompatible-indexes'],
    ['collation', c => { c.main_v2_operations.indexes[1].collation = { locale: 'en' }; }, 'incompatible-indexes'],
    ['extra index', c => { c.main_v2_ownerGuards.indexes.push({ v: 2, name: 'extra_1', key: { extra: 1 } }); }, 'unexpected-indexes'],
  ];
  for (const [label, change, reason] of cases) {
    const double = withSchema(change), { report } = await run(double);
    expect(report.verdict, label).toBe('conflict'); expect(report.conflicts.map(c => c.reason), label).toContain(reason);
    expect(double.log.every(op => ALLOWED.includes(op)) && double.forbidden.length === 0, label).toBe(true);
  }
  const view = await run(inspectionDouble({ types: { main_v2_facts: 'view' } }));
  expect(view.report.verdict).toBe('conflict'); expect(view.report.conflicts[0]).toMatchObject({ collection: 'main_v2_facts', reason: 'not-a-plain-collection' });
  const capped = await run(inspectionDouble({ options: { main_v2_operations: { capped: true, size: 100, validator: { $jsonSchema: {} } } } }));
  expect(capped.report.conflicts[0]).toMatchObject({ collection: 'main_v2_operations', reason: 'collection-options', options: ['capped', 'size', 'validator'] });
  // The unused authorization model collection is neither required nor reported as foreign; foreign collections are listed by name only.
  const extra = fullSchema(); extra.main_v2_authorization = { indexes: [idIndex()], count: 0 }; extra['legacy.players'] = { indexes: [idIndex()], count: 5 };
  const withExtra = (await run(inspectionDouble({ collections: extra }))).report;
  expect(withExtra).toMatchObject({ verdict: 'ready', authorizationModelCollectionPresent: true, otherCollectionCount: 1 }); expect(withExtra.otherCollections[0].name).toBe('legacy.players');
});

it('IN06 the effective identity must match the authorization: a read-only inspector or the rotated backend identity, on two_sides_db only, with the three read actions', async () => {
  const id = { user: 'twosides_inspector', identity: 'dedicated-read-only' }, rb = { user: 'twosides_backend', identity: 'rotated-backend' };
  expect(verifyInspectionPermissions(statusFor({ role: 'read' }), id)).toEqual({ user: 'twosides_inspector', database: 'two_sides_db', role: 'read', writeCapable: false });
  expect(verifyInspectionPermissions(statusFor({ user: 'twosides_backend', role: 'readWrite' }), rb)).toMatchObject({ role: 'readWrite', writeCapable: true });
  const bad = [[statusFor({ role: 'readWrite' }), id, 'inspection_identity_mismatch'], [statusFor({ user: 'twosides_backend', role: 'read' }), rb, 'inspection_identity_mismatch'],
    [statusFor({ role: 'dbAdmin' }), id, 'inspection_identity_mismatch'], [statusFor({ user: 'someone_else' }), id, 'inspection_permissions_unverified'],
    [statusFor({ actions: ['find', 'listCollections'] }), id, 'inspection_permissions_insufficient'], [statusFor({ actions: ['listCollections', 'listIndexes'] }), id, 'inspection_permissions_insufficient'],
    [{ ok: 0 }, id, 'inspection_permissions_unverified']];
  for (const [status, who, code] of bad) expect(() => verifyInspectionPermissions(status, who), code).toThrow(expect.objectContaining({ code }));
  const extraRole = statusFor(); extraRole.authInfo.authenticatedUserRoles.push({ role: 'read', db: 'admin' });
  const otherDb = statusFor(); otherDb.authInfo.authenticatedUserRoles[0].db = 'two_sides_integration_test';
  const foreignResource = statusFor(); foreignResource.authInfo.authenticatedUserPrivileges.push({ resource: { db: 'admin', collection: '' }, actions: ['find'] });
  for (const status of [extraRole, otherDb, foreignResource]) expect(() => verifyInspectionPermissions(status, id)).toThrow();
  // Through the run: refusals close the connection, create no report and leave the marker with the reason.
  for (const [status, auth] of [[statusFor({ role: 'readWrite' }), authorization()], [statusFor({ actions: ['find'] }), authorization()]]) {
    const double = inspectionDouble({ status }), result = await run(double, { auth });
    expect(result.error).toBeInstanceOf(InspectionError); expect(result.error.diagnostic).toMatchObject({ stage: 'permission-inspection', category: 'AUTHORIZATION_FAILURE' });
    expect(double.closed).toBe(1); expect(double.log).toEqual(['connectionStatus']); expect(JSON.parse(fs.readFileSync(auth.marker, 'utf8')).result.completed).toBe(false);
  }
  // Insufficient permissions found later (a command denied by the server) are reported as such and the connection is still closed once.
  for (const failOn of ['listCollections', 'listIndexes', 'estimatedDocumentCount', 'findOne:seed']) {
    const double = inspectionDouble({ failOn }), result = await run(double);
    expect(result.error, failOn).toMatchObject({ code: 'inspection_permission_denied', diagnostic: { stage: 'inspection', category: 'AUTHORIZATION_FAILURE' } });
    expect(double.closed, failOn).toBe(1); expect(double.forbidden).toEqual([]);
  }
});

it('IN07 connection failures are diagnosed with their own code, stage and category, resources close once, and no secret reaches any output', async () => {
  const password = 'pw-' + randomBytes(12).toString('hex'), named = (name, props, message) => Object.assign(new Error(message), { name }, props);
  const cases = [[named('MongoServerError', { code: 18, codeName: 'AuthenticationFailed' }, `Authentication failed for ${password} at ${MAIN_URI}`), 'atlas_authentication_failed', 'AUTHENTICATION_FAILURE'],
    [named('Error', { code: 'ENOTFOUND', syscall: 'querySrv' }, `querySrv ENOTFOUND ${password}`), 'atlas_dns_failed', 'DNS_SRV_FAILURE'],
    [named('MongoNetworkError', { code: 'ERR_SSL_WRONG_VERSION_NUMBER' }, `ssl ${password}`), 'atlas_tls_failed', 'TLS_HANDSHAKE_FAILURE'],
    [named('MongoNetworkTimeoutError', {}, `timeout ${password}`), 'atlas_network_timeout', 'NETWORK_TIMEOUT'],
    [named('MongooseServerSelectionError', {}, `Server selection timed out after 10000 ms ${password}`), 'atlas_server_selection_timeout', 'SERVER_SELECTION_TIMEOUT']];
  for (const [error, code, category] of cases) {
    const double = inspectionDouble(); double.rejectWith = error;
    const result = await run(double, { password });
    expect(result.error, category).toMatchObject({ code, diagnostic: { stage: 'mongoose-connect', category } });
    const everything = [inspectionFailureReport(result.error), JSON.stringify(result.error), result.error.message, result.text, fs.readFileSync(result.auth.marker, 'utf8')].join('\n');
    for (const secret of [password, MAIN_URI, ADMIN_TARGET.host, 'querySrv']) expect(everything, category).not.toContain(secret);
    expect(inspectionFailureReport(result.error).split('\n').filter(Boolean).map(l => l.split('=')[0])).toEqual(['Unable to complete the main schema inspection', 'reason', 'stage', 'category', 'approxMs']);
  }
  // Errors after the connection exists: the connection is closed exactly once and the failure is reported as such.
  const hello = inspectionDouble({ failOn: 'hello' }); const result = await run(hello);
  expect(result.error.code).toMatch(/^inspection_/); expect(hello.closed).toBe(1);
  expect(inspectionFailureReport(Object.assign(new Error(password), { diagnostic: { stage: password, category: MAIN_URI } }))).toBe('Unable to complete the main schema inspection\nreason=unexpected\n');
});

it('IN08 fail closed: explicit flag, valid authorization, a credential frame on a pipe and a single use are all required, each checked before any connection', async () => {
  for (const argv of [[], ['--authorization', 'C:\\a.json'], ['--enable-main-inspection'], ['--enable-main-inspection', '--authorization', 'C:\\a.json', '--port', '3000'],
    ['--enable-main-inspection', '--authorization', 'C:\\a.json', '--prepare-collections'], ['--enable-main-inspection', '--authorization', 'C:\\a.json', '--enable-main-inspection'], ['--enable-main-inspection', '--authorization']])
    expect(() => parseInspectionArguments(argv), argv.join(' ')).toThrow(InspectionError);
  expect(parseInspectionArguments(['--enable-main-inspection', '--authorization', 'C:\\a.json'])).toEqual({ authorization: 'C:\\a.json' });
  const double = inspectionDouble(), tty = new PassThrough(); tty.isTTY = true;
  expect((await run(double, { stdin: tty })).error.code).toBe('credential_channel_required');
  expect((await run(double, { stdin: pipeWith(Buffer.from('plain')) })).error.code).toBe('credential_required');
  expect((await run(double, { auth: authorization({ notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) }) })).error.code).toBe('authorization_expired');
  expect((await run(double, { auth: { ...authorization(), file: path.join(temp, 'missing.json') } })).error.code).toBe('authorization_missing');
  expect((await run(double, { auth: authorization({ host: 'x.mongodb.net' }) })).error.code).toBe('authorization_invalid');
  expect(double.connects).toBe(0);
  const first = await run(double); expect(first.report.verdict).toBe('ready');
  const again = inspectionDouble(), second = await run(again, { auth: first.auth });
  expect(second.error.code).toBe('authorization_consumed'); expect(again.connects).toBe(0);
  const failed = authorization(), broken = inspectionDouble(); broken.rejectWith = Object.assign(new Error('x'), { name: 'MongoServerError', code: 18 });
  await run(broken, { auth: failed }); const retry = inspectionDouble();
  expect((await run(retry, { auth: failed })).error.code).toBe('authorization_consumed'); expect(retry.connects).toBe(0);   // a failed attempt also consumes it
  const noClaim = authorization(); await run(inspectionDouble(), { auth: noClaim, stdin: pipeWith(Buffer.from('plain')) });
  expect(fs.existsSync(noClaim.marker)).toBe(false);                                                    // a refused credential does not consume the authorization
});

it('IN09 the tool is independent: not the Express runtime, not the integration profile, never an environment or .env read, and the wrapper keeps the hidden-input locks', () => {
  const sources = ['src/main/inspection.js', 'src/main/inspection-authorization.js', 'src/main/inspection-marker.js', 'src/main/schema-inventory.js', 'scripts/run-main-inspection.js', 'scripts/new-main-inspection-authorization.js']
    .map(f => [f, fs.readFileSync(path.join(backendRoot, f), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')]);
  for (const [file, text] of sources) {
    expect(text, file).not.toMatch(/process\.env|dotenv|\.env\b|MONGODB_URI|two_sides_integration_test|integration_v2|b054c2c|C2Runtime|from\s+'[^']*\/integration\/|createBackend|startServer|express|\.listen\(|runtime\.js|from\s+'mongoose'/);
    expect(text, file).not.toMatch(/mongodb\+srv:\/\/[^$`'"/]*[:@]/);
  }
  expect(fs.readFileSync(path.join(backendRoot, 'src', 'main', 'inspection-authorization.js'), 'utf8')).toContain("'twosides_integration_test'");   // only as a refused user
  expect(fs.readFileSync(path.join(backendRoot, 'scripts', 'run-main-inspection.js'), 'utf8')).toMatch(/import\('mongoose'\)/);                 // loaded only inside the entry point
  const ps1 = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-main-inspection.ps1'), 'utf8');
  expect(ps1).toContain("Read-Host -Prompt 'Password of the inspection identity (hidden input)' -AsSecureString"); expect(ps1).toContain('if (-not $Enable)');
  expect(ps1).toContain('$info.Environment.Clear()'); expect(ps1).toContain('-band 0xFFFF'); expect(ps1).toContain('GetPreamble()'); expect(ps1).toMatch(/ReparsePoint/); expect(ps1).toMatch(/Authorization -notmatch '\^\[A-Za-z\]:/);
  const args = ps1.match(/\$info\.Arguments = [^\n]+/)[0]; expect(args).not.toMatch(/\$(secure|chars|bytes|frame|pass)/i);
  expect(ps1).not.toMatch(/ConvertFrom-SecureString|Out-File|Set-Content|\$env:[A-Z_]*PASS|Write-Host\s+\$/i);
  // The generator writes the real contract outside the repository, for 60 minutes, without secrets, and refuses inconsistent identities.
  const script = path.join(backendRoot, 'scripts', 'new-main-inspection-authorization.js'), spawn = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const ok = spawn([path.join(temp, 'issued'), 'dedicated-read-only', 'twosides_inspector']); expect(ok.status).toBe(0);
  const info = JSON.parse(ok.stdout); expect(Date.parse(info.notAfter) - Date.parse(info.notBefore)).toBe(3_600_000);
  expect(Object.keys(JSON.parse(fs.readFileSync(info.file, 'utf8'))).sort()).toEqual(['database', 'executionId', 'host', 'identity', 'kind', 'notAfter', 'notBefore', 'schemaVersion', 'user']);
  expect(spawn([path.join(temp, 'b'), 'rotated-backend']).status).toBe(0);
  for (const bad of [[path.join(temp, 'c'), 'rotated-backend', 'twosides_backend'], [path.join(temp, 'd'), 'dedicated-read-only'], [path.join(temp, 'e'), 'dedicated-read-only', 'twosides_integration_test'], ['relative', 'rotated-backend'],
    [path.join(backendRoot, '.work', 'x'), 'rotated-backend']]) expect(spawn(bad).status, bad.join(' ')).toBe(1);
  expect(fs.existsSync(path.join(backendRoot, '.work', 'x'))).toBe(false);
});

it('IN10 the expected schema is compatible with the current Mongoose models, and the inspection of exactly that schema is ready', async () => {
  const db = integrationDouble(), c = db.connection;
  c.name = ADMIN_TARGET.database; c.db.databaseName = ADMIN_TARGET.database;
  db.clientOptions = { srvHost: ADMIN_TARGET.host, dbName: ADMIN_TARGET.database, directConnection: false, tls: true, credentials: { username: 'twosides_backend_v2', source: 'admin', mechanism: 'SCRAM-SHA-256' } };
  db.status=restrictedStatus();
  const { scope } = await authorizeMainScope(c);
  const models = { ...ingestionModels(c, { atlasScope: scope }), ...mongoIdentityModels(c, { atlasScope: scope }) };
  const collections = {};
  for (const [key, definition] of Object.entries(MAIN_SCHEMA.collections)) {
    expect(models[key].collection.name).toBe(definition.name);
    const fromModel = models[key].schema.indexes().map(([k, o]) => ({ v: 2, name: o.name, key: k, unique: o.unique === true }));
    collections[definition.name] = { indexes: [idIndex(), ...fromModel], count: 0 };
  }
  const double = inspectionDouble({ collections });
  expect((await run(double)).report.verdict).toBe('ready');                                              // indexes derived from the live models satisfy the inspector
  expect(requiredIndexes(MAIN_SCHEMA.collections.identities).map(i => i.name)).toEqual(['_id_', 'identity_registration_unique', 'identity_binding_unique']);
});
