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
import { BOOTSTRAP_WRITE_OPERATIONS, PROTECTED_COLLECTIONS, assertManaged, bootstrapFailureReport, createWriter, parseBootstrapArguments, planBootstrap, runMainBootstrap, verifyBootstrapPermissions } from '../../src/main/bootstrap.js';
import { BOOTSTRAP_CONFIRMATION, BOOTSTRAP_MAX_WINDOW_MS, parseBootstrapAuthorization } from '../../src/main/bootstrap-authorization.js';
import { MAIN_SCHEMA, MAIN_COLLECTION_NAMES } from '../../src/main/schema-inventory.js';
import { MAIN_TARGET, MAIN_URI } from '../../src/main/administrative-policy.js';
import { fullSchema, idIndex } from './support/inspection-double.js';
import { WRITE_CONCERN, backendStatus, bootstrapDouble, historicalCollections } from './support/bootstrap-double.js';

// B05.5 stage 12, offline: the bootstrap of main_v2 in two_sides_db. A stateful MongoDB DOUBLE that records every read and write and fails on any shape the tool may not
// use; no socket, no DNS, no real credential. The only "passwords" are random strings per test, used to prove they never reach any output.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const dirs = [], sockets = [], lookups = [];
let temp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-bootstrap-')); dirs.push(temp); sockets.length = 0; lookups.length = 0;
  const connect = net.Socket.prototype.connect, lookup = dns.lookup;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { sockets.push(args[0]); return connect.apply(this, args); });
  vi.spyOn(dns, 'lookup').mockImplementation(function (host, ...rest) { lookups.push(host); return lookup.call(this, host, ...rest); });
});
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });
const nowMs = Date.now(), iso = ms => new Date(ms).toISOString();
const authorization = (mode = 'apply', changes = {}) => {
  const body = { schemaVersion: 1, kind: 'atlas-main-schema-bootstrap', executionId: randomBytes(16).toString('hex'), host: MAIN_TARGET.host, database: MAIN_TARGET.database, user: MAIN_TARGET.user,
    namespace: 'main_v2', mode, confirmation: BOOTSTRAP_CONFIRMATION, passwordRotationConfirmed: true, notBefore: iso(nowMs - 60_000), notAfter: iso(nowMs + 3_000_000), ...changes };
  const file = path.join(temp, randomUUID() + '.json'); fs.writeFileSync(file, JSON.stringify(body));
  return { file, body, marker: path.join(temp, body.executionId + '.bootstrap.json') };
};
const frame = text => { const bytes = Buffer.from(text); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const pipeWith = data => { const s = new PassThrough(); s.write(data); s.end(); return s; };
const run = async (double, { mode = 'apply', auth = authorization(mode), password = 'pw-' + randomBytes(12).toString('hex'), argv, stdin } = {}) => {
  const lines = [];
  try {
    const report = await runMainBootstrap({ argv: argv ?? ['--enable-main-bootstrap', '--authorization', auth.file], stdin: stdin ?? pipeWith(frame(password)), stdout: { write: t => lines.push(t) }, now: () => nowMs, loadMongoose: async () => double.mongoose });
    return { report, lines, auth, password, text: lines.join('') };
  } catch (error) { return { error, lines, auth, password, text: lines.join('') }; }
};
const snapshot = double => JSON.stringify(Object.entries(double.collections).sort(([a], [b]) => a.localeCompare(b)).concat([['seed', double.seed]]));
const marker = auth => JSON.parse(fs.readFileSync(auth.marker, 'utf8'));
const EXPECTED_PLAN = [...Object.values(MAIN_SCHEMA.collections).map(c => `createCollection:${c.name}`),
  ...Object.values(MAIN_SCHEMA.collections).flatMap(c => c.indexes.map(i => `createIndex:${c.name}:${i.name}`)), 'seedUpsert:main_v2_fences'];
const writesAsPlan = writes => writes.map(w => (w === 'seedUpsert' ? 'seedUpsert:main_v2_fences' : w));

it('BS01 plan-only against the real starting point (7 historical collections, no main_v2): the exact plan is computed from reads and NOTHING is written', async () => {
  const double = bootstrapDouble(), before = snapshot(double);
  const { report, error } = await run(double, { mode: 'plan-only' });
  expect(error).toBeUndefined();
  expect(report).toMatchObject({ mode: 'plan-only', preVerdict: 'bootstrap-required', postVerdict: 'bootstrap-required', writes: 0, executed: [], historicalUnchanged: true, http: 'not-started' });
  expect(report.plan).toEqual(EXPECTED_PLAN); expect(report.plan).toHaveLength(7 + 5 + 1);
  expect(double.writes).toEqual([]); expect(double.violations).toEqual([]); expect(double.forbidden).toEqual([]); expect(snapshot(double)).toBe(before);
  expect(double.closed).toBe(1);
  expect(report.scram).toMatchObject({ requested: 'DEFAULT', negotiated: 'SCRAM-SHA-1', weaker: true });   // what the real inspection found
});

it('BS02 apply on the real starting point creates the 7 collections, the 5 unique indexes and the seed, in that order, with majority write concern, and verifies the result', async () => {
  const double = bootstrapDouble(), historicalBefore = JSON.stringify(Object.entries(double.collections).filter(([n]) => PROTECTED_COLLECTIONS.includes(n)));
  const { report, error, auth, text } = await run(double);
  expect(error).toBeUndefined();
  expect(report).toMatchObject({ mode: 'apply', preVerdict: 'bootstrap-required', postVerdict: 'ready', writes: 13, historicalUnchanged: true });
  expect(writesAsPlan(double.writes)).toEqual(EXPECTED_PLAN); expect(report.executed).toEqual(EXPECTED_PLAN);
  for (const definition of Object.values(MAIN_SCHEMA.collections)) {
    const created = double.collections[definition.name];
    expect(created.indexes.map(i => i.name), definition.name).toEqual(['_id_', ...definition.indexes.map(i => i.name)]);
    for (const wanted of definition.indexes) expect(created.indexes.find(i => i.name === wanted.name)).toMatchObject({ key: wanted.key, unique: true });
  }
  expect(double.seed).toEqual({ _id: 'ingestion-v1', revision: 0 });
  expect(Object.keys(double.collections).filter(n => /^main_v2_/.test(n)).sort()).toEqual([...MAIN_COLLECTION_NAMES].sort());   // nothing extra, no authorization-model collection
  expect(JSON.stringify(Object.entries(double.collections).filter(([n]) => PROTECTED_COLLECTIONS.includes(n)))).toBe(historicalBefore);   // history untouched
  expect(double.violations).toEqual([]); expect(double.forbidden).toEqual([]); expect(double.closed).toBe(1);
  expect(marker(auth)).toMatchObject({ kind: 'main-schema-bootstrap', phase: 'finished', completed: true, postVerdict: 'ready' }); expect(marker(auth).executed).toEqual(EXPECTED_PLAN);
  expect(JSON.parse(text)).toMatchObject({ mainSchemaBootstrap: 'finished', closed: true, writes: 13 });
  expect(double.optionsSeen[0]).toMatchObject({ dbName: 'two_sides_db', user: 'twosides_backend', authSource: 'admin', authMechanism: 'DEFAULT', tls: true, tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false, directConnection: false, retryWrites: true, w: 'majority', autoIndex: false, autoCreate: false, bufferCommands: false, maxPoolSize: 1, appName: 'TwoSides-MainBootstrap' });
  expect(double.uriSeen).toEqual([MAIN_URI]); expect(sockets.filter(s => s && (s.port || s.path))).toEqual([]); expect(lookups).toEqual([]);
  expect(WRITE_CONCERN).toEqual({ w: 'majority', j: true });
});

it('BS03 idempotent: a second simulated run (new authorization) on the finished state plans nothing, writes nothing and leaves every object byte for byte as it was', async () => {
  const double = bootstrapDouble(); expect((await run(double)).report.postVerdict).toBe('ready');
  const state = snapshot(double), writes = double.writes.length;
  const second = await run(double);
  expect(second.report).toMatchObject({ preVerdict: 'ready', postVerdict: 'ready', plan: [], executed: [], writes: 0 });
  expect(double.writes.length).toBe(writes); expect(snapshot(double)).toBe(state);
  const third = await run(double, { mode: 'plan-only' }); expect(third.report.plan).toEqual([]);
  // The same authorization can never be used twice, even when everything is already correct.
  const reuse = await run(bootstrapDouble(), { auth: second.auth }); expect(reuse.error.code).toBe('authorization_consumed');
});

it('BS04 partial states: only what is missing is created, never what already exists correctly', async () => {
  const complete = fullSchema();
  const some = { main_v2_operations: complete.main_v2_operations, main_v2_facts: complete.main_v2_facts, main_v2_fences: complete.main_v2_fences };
  const a = bootstrapDouble({ main: some, seed: { _id: 'ingestion-v1', revision: 3 } }); const ra = await run(a);
  expect(ra.report.preVerdict).toBe('partial'); expect(ra.report.plan).toEqual(EXPECTED_PLAN.filter(s => /ownerGuards|identities|identitySessions|revocations/.test(s) && !s.startsWith('seed')));
  expect(a.seed).toEqual({ _id: 'ingestion-v1', revision: 3 });                                          // an existing seed is never rewritten
  const idx = fullSchema(); idx.main_v2_identities.indexes = idx.main_v2_identities.indexes.filter(i => i.name !== 'identity_binding_unique');
  const b = bootstrapDouble({ main: idx, seed: { _id: 'ingestion-v1', revision: 0 } }); const rb = await run(b);
  expect(rb.report).toMatchObject({ preVerdict: 'indexes-incomplete', postVerdict: 'ready', plan: ['createIndex:main_v2_identities:identity_binding_unique'], writes: 1 });
  const c = bootstrapDouble({ main: fullSchema() }); const rc = await run(c);
  expect(rc.report).toMatchObject({ preVerdict: 'seed-missing', plan: ['seedUpsert:main_v2_fences'], postVerdict: 'ready' }); expect(c.seed).toEqual({ _id: 'ingestion-v1', revision: 0 });
});

it('BS05 any conflict is refused with ZERO writes and no repair: incompatible, extra or flagged indexes, views, collection options, a missing _id index and an invalid seed', async () => {
  const cases = [
    ['different key', c => { c.main_v2_operations.indexes[1] = { v: 2, name: 'owner_operation_unique', key: { operationId: 1 }, unique: true }; }, 'bootstrap_conflict'],
    ['not unique', c => { c.main_v2_facts.indexes[1] = { v: 2, name: 'scope_source_unique', key: { scope: 1, sourceKey: 1 } }; }, 'bootstrap_conflict'],
    ['sparse', c => { c.main_v2_identities.indexes[1].sparse = true; }, 'bootstrap_conflict'],
    ['ttl', c => { c.main_v2_identitySessions.indexes[1].expireAfterSeconds = 60; }, 'bootstrap_conflict'],
    ['collation', c => { c.main_v2_operations.indexes[1].collation = { locale: 'en' }; }, 'bootstrap_conflict'],
    ['extra index', c => { c.main_v2_ownerGuards.indexes.push({ v: 2, name: 'extra_1', key: { extra: 1 } }); }, 'bootstrap_conflict'],
    ['no _id index', c => { c.main_v2_revocations.indexes = []; }, 'bootstrap_conflict'],
  ];
  for (const [label, change, code] of cases) {
    const collections = fullSchema(); change(collections);
    const double = bootstrapDouble({ main: collections, seed: { _id: 'ingestion-v1', revision: 0 } }), before = snapshot(double);
    const { error, auth } = await run(double);
    expect(error, label).toMatchObject({ code }); expect(double.writes, label).toEqual([]); expect(snapshot(double), label).toBe(before); expect(double.closed, label).toBe(1);
    expect(marker(auth), label).toMatchObject({ phase: 'failed', completed: false, reason: code });
  }
  expect((await run(bootstrapDouble({ main: fullSchema(), types: { main_v2_facts: 'view' }, seed: { _id: 'ingestion-v1', revision: 0 } }))).error.code).toBe('bootstrap_conflict');
  expect((await run(bootstrapDouble({ main: fullSchema(), options: { main_v2_operations: { capped: true, size: 10 } }, seed: { _id: 'ingestion-v1', revision: 0 } }))).error.code).toBe('bootstrap_conflict');
  for (const revision of [-1, 1.5, '1']) {
    const double = bootstrapDouble({ main: fullSchema(), seed: { _id: 'ingestion-v1', revision } }), before = snapshot(double);
    expect((await run(double)).error, String(revision)).toMatchObject({ code: 'bootstrap_seed_conflict' }); expect(double.writes).toEqual([]); expect(snapshot(double)).toBe(before);
  }
  // planBootstrap is the pure decision: a conflict verdict never yields steps.
  expect(() => planBootstrap({ verdict: 'conflict', replicaSet: true, writablePrimary: true, seed: { checked: false }, requiredCollections: {} })).toThrow(expect.objectContaining({ code: 'bootstrap_conflict' }));
});

it('BS06 the seven historical collections and every non-main_v2 name are protected: the write surface refuses them, and no run ever writes to them', async () => {
  expect(PROTECTED_COLLECTIONS).toEqual(['users', 'decisions', 'gameevents', 'gameprogresses', 'statisticevents', 'statisticsummaries', 'syncidentities']);
  for (const name of [...PROTECTED_COLLECTIONS, 'USERS', 'Users', 'main_v2_authorization', 'integration_v2_operations', 'b054c2c_x_operations', 'system.users', 'system.profile', 'main_v2_', 'main_v2_other', '', undefined, null, 5])
    expect(() => assertManaged(name), String(name)).toThrow(expect.objectContaining({ code: 'bootstrap_target_rejected' }));
  for (const name of MAIN_COLLECTION_NAMES) expect(assertManaged(name).name).toBe(name);
  const double = bootstrapDouble({ main: fullSchema() }), writer = createWriter(double.connection.db);
  for (const name of PROTECTED_COLLECTIONS) {
    await expect(writer.createCollection(name)).rejects.toMatchObject({ code: 'bootstrap_target_rejected' });
    await expect(writer.createIndex(name, 'email_1')).rejects.toMatchObject({ code: 'bootstrap_target_rejected' });
  }
  await expect(writer.createIndex('main_v2_operations', 'not_in_the_inventory')).rejects.toMatchObject({ code: 'bootstrap_target_rejected' });
  expect(double.writes).toEqual([]); expect(double.violations).toEqual([]); expect(Object.keys(writer).sort()).toEqual(['createCollection', 'createIndex', 'seedUpsert']);
  // Even if the double is asked to create a historical name directly, it records a violation: this proves the check is meaningful.
  await expect(double.connection.db.createCollection('users_copy', { writeConcern: WRITE_CONCERN })).rejects.toThrow(); expect(double.violations).toEqual(['createCollection:users_copy']);
  // Whole runs, in every state, produce no violation and leave the historical objects as found.
  const historical = JSON.stringify(Object.entries(historicalCollections()));
  for (const d of [bootstrapDouble(), bootstrapDouble({ main: fullSchema() }), bootstrapDouble({ main: { main_v2_operations: fullSchema().main_v2_operations } })]) {
    await run(d); expect(d.violations).toEqual([]); expect(JSON.stringify(Object.entries(d.collections).filter(([n]) => PROTECTED_COLLECTIONS.includes(n)))).toBe(historical);
  }
  expect(BOOTSTRAP_WRITE_OPERATIONS).toEqual(['createCollection', 'createIndex', 'seedUpsert']);
});

it('BS07 the identity and the cluster are verified first: only twosides_backend with exactly readWrite on two_sides_db and a writable primary; anything else stops before a single write', async () => {
  expect(verifyBootstrapPermissions(backendStatus())).toEqual({ user: 'twosides_backend', database: 'two_sides_db', role: 'readWrite' });
  const extraRole = backendStatus(); extraRole.authInfo.authenticatedUserRoles.push({ role: 'read', db: 'admin' });
  const otherDb = backendStatus(); otherDb.authInfo.authenticatedUserRoles[0].db = 'two_sides_integration_test';
  const foreign = backendStatus(); foreign.authInfo.authenticatedUserPrivileges.push({ resource: { db: 'admin', collection: '' }, actions: ['find'] });
  const bad = [[backendStatus({ role: 'read' }), 'bootstrap_permissions_unverified'], [backendStatus({ role: 'dbAdmin' }), 'bootstrap_permissions_unverified'], [backendStatus({ user: 'twosides_inspector' }), 'bootstrap_permissions_unverified'],
    [backendStatus({ user: 'twosides_integration_test' }), 'bootstrap_permissions_unverified'], [extraRole, 'bootstrap_permissions_unverified'], [otherDb, 'bootstrap_permissions_unverified'], [foreign, 'bootstrap_permissions_unverified'],
    [{ ok: 0 }, 'bootstrap_permissions_unverified'], [backendStatus({ actions: ['find', 'listCollections', 'listIndexes', 'createCollection', 'insert', 'update'] }), 'bootstrap_permissions_insufficient'],
    [backendStatus({ actions: ['find', 'listCollections', 'listIndexes', 'createIndex', 'insert'] }), 'bootstrap_permissions_insufficient'], [backendStatus({ actions: ['createCollection', 'createIndex', 'insert', 'update'] }), 'bootstrap_permissions_insufficient']];
  for (const [status, code] of bad) {
    const double = bootstrapDouble({ status }), { error } = await run(double);
    expect(error, code).toMatchObject({ code, diagnostic: { stage: 'permission-inspection', category: 'AUTHORIZATION_FAILURE' } });
    expect(double.writes).toEqual([]); expect(double.reads).toEqual(['connectionStatus']); expect(double.closed).toBe(1);
  }
  const noReplica = bootstrapDouble({ replicaSet: false }); expect((await run(noReplica)).error).toMatchObject({ code: 'bootstrap_transactions_unverified' }); expect(noReplica.writes).toEqual([]);
});

it('BS08 temporary single-use authorization: own kind, backend identity only, explicit confirmation and rotation statement, <= 60 min, and consumed by any attempt that reaches the connection', async () => {
  const good = authorization('apply').body;
  expect(parseBootstrapAuthorization(JSON.stringify(good), nowMs)).toMatchObject({ mode: 'apply', user: 'twosides_backend', namespace: 'main_v2' });
  expect(parseBootstrapAuthorization(JSON.stringify({ ...good, mode: 'plan-only' }), nowMs).mode).toBe('plan-only');
  const bad = [{ kind: 'atlas-main-schema-inspection' }, { kind: 'atlas-integration-launch' }, { user: 'twosides_inspector' }, { user: 'twosides_integration_test' }, { host: 'other.mongodb.net' }, { database: 'two_sides_integration_test' },
    { database: 'admin' }, { namespace: 'integration_v2' }, { namespace: 'users' }, { mode: 'repair' }, { mode: 'drop' }, { mode: undefined }, { confirmation: 'yes' }, { confirmation: undefined }, { passwordRotationConfirmed: false },
    { passwordRotationConfirmed: undefined }, { extra: true }, { executionId: 'short' }, { notAfter: iso(nowMs + BOOTSTRAP_MAX_WINDOW_MS + 120_000) }, { notBefore: iso(nowMs + 60_000), notAfter: iso(nowMs + 600_000) },
    { notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) }];
  for (const change of bad) expect(() => parseBootstrapAuthorization(JSON.stringify({ ...good, ...change }), nowMs), JSON.stringify(change)).toThrow();
  expect(BOOTSTRAP_MAX_WINDOW_MS).toBe(3_600_000);
  for (const argv of [[], ['--authorization', 'C:\\a.json'], ['--enable-main-bootstrap'], ['--enable-main-bootstrap', '--authorization', 'C:\\a.json', '--port', '1'], ['--enable-main-bootstrap', '--authorization', 'C:\\a.json', '--apply'],
    ['--enable-main-inspection', '--authorization', 'C:\\a.json'], ['--enable-main-bootstrap', '--enable-main-bootstrap', '--authorization', 'C:\\a.json']])
    expect(() => parseBootstrapArguments(argv), argv.join(' ')).toThrow();
  const idle = bootstrapDouble(), tty = new PassThrough(); tty.isTTY = true;
  expect((await run(idle, { stdin: tty })).error.code).toBe('credential_channel_required');
  expect((await run(idle, { auth: authorization('apply', { notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) }) })).error.code).toBe('authorization_expired');
  expect((await run(idle, { auth: authorization('apply', { confirmation: 'no' }) })).error.code).toBe('authorization_invalid');
  const plain = authorization(); expect((await run(idle, { auth: plain, stdin: pipeWith(Buffer.from('plain')) })).error.code).toBe('credential_required');
  expect(fs.existsSync(plain.marker)).toBe(false); expect(idle.connects).toBe(0);                          // a refused credential consumes nothing
  const failing = bootstrapDouble(); failing.rejectWith = Object.assign(new Error('x'), { name: 'MongoServerError', code: 18 });
  const used = authorization(); expect((await run(failing, { auth: used })).error.code).toBe('atlas_authentication_failed');
  const retry = bootstrapDouble(); expect((await run(retry, { auth: used })).error.code).toBe('authorization_consumed'); expect(retry.connects).toBe(0);
});

it('BS09 a failure half-way keeps everything created so far, journals it, deletes nothing, and a new authorization resumes with only the remaining steps', async () => {
  const failOn = 'createIndex:main_v2_facts:scope_source_unique';
  const double = bootstrapDouble({ failOn }), first = await run(double), password = first.password;
  expect(first.error).toMatchObject({ code: 'bootstrap_step_failed' });
  const doneBefore = EXPECTED_PLAN.indexOf('createIndex:main_v2_facts:scope_source_unique');
  expect(double.writes).toEqual(EXPECTED_PLAN.slice(0, doneBefore));                                       // 7 collections + 1 index, then the failure
  expect(Object.keys(double.collections).filter(n => /^main_v2_/.test(n))).toHaveLength(7);               // nothing was removed
  const journal = marker(first.auth);
  expect(journal).toMatchObject({ phase: 'failed', completed: false, reason: 'bootstrap_step_failed', failedStep: failOn, executed: EXPECTED_PLAN.slice(0, doneBefore) });
  expect(journal.remaining).toEqual(EXPECTED_PLAN.slice(doneBefore)); expect(double.closed).toBe(1);
  const report = bootstrapFailureReport(first.error);
  expect(report).toContain(`stepsExecuted=${doneBefore}`); expect(report).toContain(`failedStep=${failOn}`); expect(report).not.toContain(password);
  expect(report.split('\n').filter(Boolean).map(l => l.split('=')[0])).toEqual(['Unable to complete the main schema bootstrap', 'reason', 'stage', 'category', 'approxMs', 'stepsExecuted', 'stepsRemaining', 'failedStep']);
  // Resume: a NEW authorization; the inspection sees the partial state and plans only the rest (the already created objects are not touched again).
  const resumed = bootstrapDouble({ main: Object.fromEntries(Object.entries(double.collections).filter(([n]) => /^main_v2_/.test(n))), seed: double.seed });
  const second = await run(resumed);
  expect(second.report).toMatchObject({ preVerdict: 'indexes-incomplete', postVerdict: 'ready' }); expect(second.report.executed).toEqual(EXPECTED_PLAN.slice(doneBefore));
  expect(resumed.writes.some(w => w.startsWith('createCollection'))).toBe(false);
  // Other failure kinds are classified, journaled and never repaired.
  for (const [code, injected, expected] of [[13, 'createCollection:main_v2_operations', 'bootstrap_permission_denied'], [85, 'createIndex:main_v2_operations:owner_operation_unique', 'bootstrap_index_conflict'],
    [86, 'createIndex:main_v2_identities:identity_binding_unique', 'bootstrap_index_conflict'], [11000, 'seedUpsert', 'bootstrap_step_failed']]) {
    const d = bootstrapDouble({ failOn: injected, failCode: code }), r = await run(d);
    expect(r.error, injected).toMatchObject({ code: expected }); expect(d.closed).toBe(1); expect(d.violations).toEqual([]); expect(marker(r.auth).reason).toBe(expected);
  }
  // NamespaceExists (code 48) is tolerated as 'already-exists' ONLY if what follows still works: here the collection does not really exist, so the next step (its index) fails and the run stops.
  const raced = bootstrapDouble({ failOn: 'createCollection:main_v2_facts', failCode: 48 }), rr = await run(raced);
  expect(rr.error).toMatchObject({ code: 'bootstrap_step_failed' }); expect(marker(rr.auth).executed).toContain('createCollection:main_v2_facts:already-exists'); expect(raced.violations).toEqual([]);
});

it('BS10 the result is verified after writing: a write that did not take effect fails the run instead of reporting success', async () => {
  const double = bootstrapDouble({ silent: ['createIndex:main_v2_facts:scope_source_unique'] }), { error, auth } = await run(double);
  expect(error).toMatchObject({ code: 'bootstrap_verification_failed' }); expect(double.closed).toBe(1);
  expect(marker(auth)).toMatchObject({ phase: 'failed', completed: false, reason: 'bootstrap_verification_failed' });
  expect(double.writes).toHaveLength(13);                                                                   // all attempted and journaled; the verification caught the gap
});

it('BS11 connection failures are diagnosed with their own code, stage and category, nothing is written, and no secret reaches any output', async () => {
  const named = (name, props, message) => Object.assign(new Error(message), { name }, props), password = 'pw-' + randomBytes(12).toString('hex');
  const cases = [[named('MongoServerError', { code: 18, codeName: 'AuthenticationFailed' }, `Authentication failed for ${password} at ${MAIN_URI}`), 'atlas_authentication_failed', 'AUTHENTICATION_FAILURE'],
    [named('Error', { code: 'ENOTFOUND', syscall: 'querySrv' }, `querySrv ENOTFOUND ${password}`), 'atlas_dns_failed', 'DNS_SRV_FAILURE'], [named('MongoNetworkError', { code: 'ERR_SSL_WRONG_VERSION_NUMBER' }, `ssl ${password}`), 'atlas_tls_failed', 'TLS_HANDSHAKE_FAILURE'],
    [named('MongoNetworkTimeoutError', {}, `timeout ${password}`), 'atlas_network_timeout', 'NETWORK_TIMEOUT'], [named('MongooseServerSelectionError', {}, `Server selection timed out after 10000 ms ${password}`), 'atlas_server_selection_timeout', 'SERVER_SELECTION_TIMEOUT']];
  for (const [rejectWith, code, category] of cases) {
    const double = bootstrapDouble(); double.rejectWith = rejectWith;
    const r = await run(double, { password });
    expect(r.error, category).toMatchObject({ code, diagnostic: { stage: 'mongoose-connect', category } }); expect(double.writes).toEqual([]);
    const everything = [bootstrapFailureReport(r.error), JSON.stringify(r.error), r.error.message, r.text, fs.readFileSync(r.auth.marker, 'utf8')].join('\n');
    for (const secret of [password, MAIN_URI, MAIN_TARGET.host, 'querySrv']) expect(everything, category).not.toContain(secret);
  }
  expect(bootstrapFailureReport(Object.assign(new Error(password), { diagnostic: { stage: password, category: MAIN_URI }, partial: { executed: 1, remaining: 2, failedStep: password } })))
    .toBe('Unable to complete the main schema bootstrap\nreason=unexpected\nstepsExecuted=1\nstepsRemaining=2\nfailedStep=none\n');
  // The password and the seed's private fields never appear in a successful run either.
  const ok = bootstrapDouble({ main: fullSchema(), seed: { _id: 'ingestion-v1', revision: 0, tokenHash: 'SECRET-SHOULD-NEVER-APPEAR' } }), r = await run(ok, { password });
  expect(r.text + fs.readFileSync(r.auth.marker, 'utf8')).not.toMatch(new RegExp(`${password}|SECRET-SHOULD-NEVER-APPEAR|tokenHash`));
});

it('BS12 the tool is independent and additive: no Express, no integration or inspection run, no environment or .env, no model, and no delete, drop, rename, update or insert beyond the three write shapes', () => {
  const strip = text => text.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const files = ['src/main/bootstrap.js', 'src/main/bootstrap-authorization.js', 'scripts/run-main-bootstrap.js', 'scripts/new-main-bootstrap-authorization.js'];
  for (const file of files) {
    const text = strip(fs.readFileSync(path.join(backendRoot, file), 'utf8'));
    expect(text, file).not.toMatch(/process\.env|dotenv|\.env\b|MONGODB_URI|two_sides_integration_test|integration_v2|b054c2c|C2Runtime|from\s+'[^']*\/integration\/|createBackend|startServer|express|\.listen\(|runtime\.js|from\s+'mongoose'|\.model\(|\.init\(/);
    expect(text, file).not.toMatch(/dropCollection|dropDatabase|dropIndex|dropIndexes|\.drop\(|deleteMany|deleteOne|\.remove\(|insertOne|insertMany|bulkWrite|updateMany|replaceOne|findOneAndUpdate|renameCollection|syncIndexes|ensureIndexes|collMod|\$set\b|\$unset|\$inc\b/);
    expect(text, file).not.toMatch(/mongodb\+srv:\/\/[^$`'"/]*[:@]/);
  }
  const bootstrap = strip(fs.readFileSync(path.join(backendRoot, 'src/main/bootstrap.js'), 'utf8'));
  expect([...bootstrap.matchAll(/\.(createCollection|createIndex|updateOne)\(/g)].map(m => m[1]).sort()).toEqual(['createCollection', 'createCollection', 'createIndex', 'createIndex', 'updateOne']);   // writer + dispatch, nothing else
  expect(bootstrap).toContain('$setOnInsert'); expect(bootstrap).not.toMatch(/upsert:\s*false/);
  const ps1 = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-main-bootstrap.ps1'), 'utf8');
  expect(ps1).toContain("Read-Host -Prompt 'Password of the twosides_backend identity (hidden input)' -AsSecureString"); expect(ps1).toContain('if (-not $Enable)'); expect(ps1).toContain('$info.Environment.Clear()');
  expect(ps1).toContain('-band 0xFFFF'); expect(ps1).toContain('GetPreamble()'); expect(ps1).toMatch(/ReparsePoint/); expect(ps1).toMatch(/Authorization -notmatch '\^\[A-Za-z\]:/);
  expect(ps1.match(/\$info\.Arguments = [^\n]+/)[0]).not.toMatch(/\$(secure|chars|bytes|frame|pass)/i); expect(ps1).not.toMatch(/ConvertFrom-SecureString|Out-File|Set-Content|\$env:[A-Z_]*PASS|Write-Host\s+\$/i);
  const script = path.join(backendRoot, 'scripts', 'new-main-bootstrap-authorization.js'), spawn = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const ok = spawn([path.join(temp, 'issued'), 'plan-only', '--password-rotated']); expect(ok.status).toBe(0);
  const info = JSON.parse(ok.stdout); expect(Date.parse(info.notAfter) - Date.parse(info.notBefore)).toBe(3_600_000);
  expect(Object.keys(JSON.parse(fs.readFileSync(info.file, 'utf8'))).sort()).toEqual(['confirmation', 'database', 'executionId', 'host', 'kind', 'mode', 'namespace', 'notAfter', 'notBefore', 'passwordRotationConfirmed', 'schemaVersion', 'user']);
  expect(spawn([path.join(temp, 'b'), 'apply', '--password-rotated']).status).toBe(0);
  for (const bad of [[path.join(temp, 'c'), 'apply'], [path.join(temp, 'd'), 'repair', '--password-rotated'], ['relative', 'apply', '--password-rotated'], [path.join(backendRoot, '.work', 'x'), 'apply', '--password-rotated']])
    expect(spawn(bad).status, bad.join(' ')).toBe(1);
  expect(fs.existsSync(path.join(backendRoot, '.work', 'x'))).toBe(false);
});
