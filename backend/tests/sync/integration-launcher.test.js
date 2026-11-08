import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import dns from 'node:dns';
import net from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LauncherError, main, parseArguments } from '../../src/integration/launcher.js';
import { INTEGRATION_ACTIVATION, inspectIntegrationSchema, openIntegrationProfile, prepareIntegrationCollections } from '../../src/integration/profile.js';
import { INTEGRATION_COLLECTION_NAMES, INTEGRATION_OPERATIONS, INTEGRATION_SCHEMA, cleanupPlan, dropPlan } from '../../src/integration/schema-inventory.js';
import { MAX_WINDOW_MS, parseLaunchAuthorization, readLaunchAuthorization } from '../../src/integration/authorization.js';
import { ATLAS_TARGET } from '../../src/modules/sync/atlas-policy.js';
import { fakeMongoose, httpClient, integrationDouble, secret } from './support/integration-double.js';
import { vectors, batch, clone, mutate } from './support/fixture.js';

// B05.5 stage 7: the manual launcher and the schema inventory, offline. A fake driver and a MongoDB double stand in for Atlas: no socket, no real
// credential, no remote collection or index. The only credentials here are random strings made up inside each test.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const CLI = path.join(backendRoot, 'scripts', 'run-integration-backend.js');
const PS1 = path.join(backendRoot, 'scripts', 'run-integration-backend.ps1');
const dirs = [], running = [], connects = [], lookups = [];
let temp;
beforeEach(() => {
  connects.length = 0; lookups.length = 0;
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-launch-')); dirs.push(temp);
  const connect = net.Socket.prototype.connect;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { connects.push(args[0]); return connect.apply(this, args); });
  const lookup = dns.lookup;
  vi.spyOn(dns, 'lookup').mockImplementation(function (host, ...rest) { lookups.push(host); return lookup.call(this, host, ...rest); });
});
afterEach(async () => {
  for (const r of running.splice(0)) await r.close({ graceMs: 100 }).catch(() => {});
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const now = Date.now();
const iso = ms => new Date(ms).toISOString();
const authorizationBody = (changes = {}) => ({ schemaVersion: 1, kind: 'atlas-integration-launch', executionId: randomBytes(16).toString('hex'), host: ATLAS_TARGET.host,
  database: ATLAS_TARGET.database, user: ATLAS_TARGET.user, notBefore: iso(now - 60_000), notAfter: iso(now + 3_600_000), allowCollectionPreparation: false, maxSyntheticPlayers: 2, ...changes });
const authorizationFile = (changes = {}) => { const file = path.join(temp, randomUUID() + '.json'); fs.writeFileSync(file, JSON.stringify(authorizationBody(changes))); return file; };
const frame = text => { const bytes = Buffer.from(text); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const pipeWith = data => { const s = new PassThrough(); if (data) s.write(data); s.end(); return s; };
const lines = [];
const stdout = { write: text => lines.push(text) };
// A launcher run on fakes. `password` is made up for this test only.
async function launch({ argv, double = integrationDouble(), data = frame('p-' + randomBytes(12).toString('hex')), mongoose = fakeMongoose(double), stdin } = {}) {
  const result = await main({ argv, stdin: stdin ?? pipeWith(data), stdout, now: () => now, loadMongoose: async () => mongoose });
  running.push(result); return { result, double };
}
const reason = async promise => { try { await promise; return 'started'; } catch (e) { return e instanceof LauncherError ? e.code : 'other:' + e.message; } };
const base = () => ['--enable-integration', '--authorization', authorizationFile()];

it('IL01 explicit activation: nothing starts without the flag and a valid authorization, and no option can name another destination', async () => {
  for (const argv of [[], ['--authorization', authorizationFile()], ['--enable-integration']]) {
    const double = integrationDouble();
    expect(await reason(launch({ argv, double }))).toBe(argv.includes('--enable-integration') ? 'authorization_missing' : 'not_enabled');
    expect(double.connects).toBe(0);
  }
  for (const extra of [['--host', 'x'], ['--uri', 'mongodb://x'], ['--database', 'two_sides_db'], ['--db', 'x'], ['--user', 'twosides_backend'], ['--password', 'x'], ['--profile', 'main'],
    ['--env-file', '.env'], ['--mongo-port', '1'], ['positional'], ['--port'], ['--port', 'abc'], ['--port', '70000'], ['--port', '-1'], ['--port', '1', '--port', '2'], ['--prepare-collections', '--prepare-collections']])
    expect(await reason(launch({ argv: [...base(), ...extra] })), extra.join(' ')).toBe('arguments_rejected');
  expect(parseArguments([...base(), '--port', '0', '--prepare-collections'])).toMatchObject({ port: 0, prepare: true });
  expect(parseArguments(base()).port).toBe(3000);
  // The real entry point, in a child process: it refuses before loading the driver or touching the network.
  const run = (args, env = {}, input = '') => spawnSync(process.execPath, [CLI, ...args], { cwd: backendRoot, input, encoding: 'utf8', timeout: 30000,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...env } });
  const none = run([]);
  expect(none.status).toBe(1); expect(none.stdout).toBe(''); expect(none.stderr).toBe('Unable to start the integration backend\nreason=not_enabled\n');
  expect(run(['--enable-integration']).stderr).toContain('reason=authorization_missing');
  expect(run([...base(), '--password', 'x']).stderr).toContain('reason=arguments_rejected');
  const noCredential = run(base());
  expect(noCredential.status).toBe(1); expect(noCredential.stderr).toContain('reason=credential_required'); expect(noCredential.stdout).toBe('');
  expect(run(base(), { NODE_ENV: 'production' }).stderr).toContain('reason=production_refused');
});

it('IL02 the launch authorization is required and strict: window, exact target, execution id, size and file type', () => {
  const ok = authorizationBody();
  expect(parseLaunchAuthorization(JSON.stringify(ok), now)).toMatchObject({ executionId: ok.executionId, allowCollectionPreparation: false });
  const code = body => { try { parseLaunchAuthorization(typeof body === 'string' ? body : JSON.stringify(body), now); return 'accepted'; } catch (e) { return e.code; } };
  expect(code(authorizationBody({ notBefore: iso(now + 60_000), notAfter: iso(now + 120_000) }))).toBe('authorization_not_yet_valid');
  expect(code(authorizationBody({ notBefore: iso(now - 120_000), notAfter: iso(now - 60_000) }))).toBe('authorization_expired');
  expect(code(authorizationBody({ notBefore: iso(now - 60_000), notAfter: iso(now - 60_000 + MAX_WINDOW_MS + 1000) }))).toBe('authorization_window_invalid');
  expect(code(authorizationBody({ notBefore: iso(now + 5), notAfter: iso(now - 5) }))).toBe('authorization_window_invalid');
  for (const bad of [{ host: 'other.mongodb.net' }, { database: 'two_sides_db' }, { user: 'twosides_backend' }, { executionId: 'abc' }, { kind: 'c2' }, { schemaVersion: 2 },
    { maxSyntheticPlayers: 0 }, { maxSyntheticPlayers: 9 }, { allowCollectionPreparation: 'yes' }, { extra: 1 }, { notBefore: 'tomorrow' }])
    expect(code(authorizationBody(bad)), JSON.stringify(bad)).toBe('authorization_invalid');
  expect(code('not json')).toBe('authorization_invalid'); expect(code('[]')).toBe('authorization_invalid');
  const read = file => { try { readLaunchAuthorization(file, now); return 'accepted'; } catch (e) { return e.code; } };
  expect(read(path.join(temp, 'missing.json'))).toBe('authorization_missing'); expect(read(temp)).toBe('authorization_missing'); expect(read('')).toBe('authorization_missing');
  const big = path.join(temp, 'big.json'); fs.writeFileSync(big, ' '.repeat(5000) + JSON.stringify(ok)); expect(read(big)).toBe('authorization_missing');
  expect(read(authorizationFile())).toBe('accepted');
  // This stage issued none: the repository holds no launch authorization.
  const found = [];
  const scan = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', '.git', '.work'].includes(e.name)) continue;
    const p = path.join(dir, e.name); if (e.isDirectory()) scan(p); else if (/\.(json|txt|md)$/.test(e.name) && !p.includes('docs') && fs.readFileSync(p, 'utf8').includes('"atlas-integration-launch"')) found.push(p); } };
  scan(backendRoot); expect(found).toEqual([]);
});

it('IL03 a credential is mandatory and arrives only as a bounded frame on a pipe; a terminal, a missing or malformed frame stop before any connection', async () => {
  const double = integrationDouble();
  const tty = new PassThrough(); tty.isTTY = true;
  expect(await reason(launch({ argv: base(), double, stdin: tty }))).toBe('credential_channel_required');
  expect(await reason(launch({ argv: base(), double, stdin: pipeWith(null) }))).toBe('credential_required');
  const bad = Buffer.alloc(8); bad.writeUInt32BE(99, 0);
  for (const data of [bad, Buffer.from('plain-text-password'), frame('has\nnewline'), frame(''), Buffer.concat([frame('a'), Buffer.from('trailing')]), frame('x'.repeat(1100))])
    expect(await reason(launch({ argv: base(), double, data })), data.toString('hex').slice(0, 16)).toBe('credential_required');
  expect(double.connects).toBe(0);
  // The password is not on the command line, in the environment or in any output of the launcher.
  const password = 'pw-' + randomBytes(10).toString('hex'); lines.length = 0;
  const { result } = await launch({ argv: base(), double, data: frame(password) });
  expect(lines.join('') + JSON.stringify(Object.keys(process.env)) + process.argv.join(' ')).not.toContain(password);
  expect(JSON.stringify(double.optionsSeen[0].pass === password)).toBe('true');   // it reached the driver options only, in memory
  expect(JSON.stringify(result)).not.toContain(password);
});

it('IL04 only the integration cluster, database and user are accepted: alternative or unregistered targets and users are refused and closed', async () => {
  const cases = [['wrong host', d => { d.clientOptions.srvHost = 'evil.mongodb.net'; }], ['wrong user', d => { d.clientOptions.credentials.username = 'twosides_backend'; }],
    ['plain tls', d => { d.clientOptions.tls = false; }], ['insecure tls', d => { d.clientOptions.tlsAllowInvalidCertificates = true; }],
    ['other auth db', d => { d.clientOptions.credentials.source = '$external'; }], ['wrong database', d => { d.connection.name = 'two_sides_db'; }]];
  for (const [label, change] of cases) {
    const double = integrationDouble(); change(double);
    expect(await reason(launch({ argv: base(), double })), label).not.toBe('started'); expect(double.closed, label).toBe(1);
  }
  const password = 'pw-' + randomBytes(10).toString('hex');
  // Unregistered credential: the driver rejects authentication.
  const double = integrationDouble();
  const unregistered = fakeMongoose(double, { rejectWith: Object.assign(new Error('Authentication failed for ' + password), { code: 18 }) });
  const thrown = await launch({ argv: base(), double, mongoose: unregistered, data: frame(password) }).catch(e => e);
  expect(thrown).toBeInstanceOf(LauncherError); expect(thrown.code).toBe('atlas_authentication_failed'); expect(thrown.diagnostic).toMatchObject({ stage: 'mongoose-connect', category: 'AUTHENTICATION_FAILURE' });   // stage 8: classified, still no secret
  expect(JSON.stringify([thrown.message, thrown.code, thrown.stack])).not.toContain(password); expect(double.closed).toBe(1);
  // A user that authenticates but has the wrong privileges.
  for (const change of [s => { s.authInfo.authenticatedUsers[0].user = 'twosides_backend'; }, s => { s.authInfo.authenticatedUserRoles[0].role = 'dbAdmin'; }, s => { s.authInfo.authenticatedUserRoles[0].db = 'admin'; }]) {
    const d = integrationDouble(); change(d.status);
    expect(await reason(launch({ argv: base(), double: d }))).toBe('atlas_permissions_unverified'); expect(d.closed).toBe(1);
  }
  // Writes never precede the privilege check: with bad privileges nothing but connectionStatus ran.
  const d = integrationDouble(); d.status.ok = 0; d.stubPreparation(); d.emptySchema();
  await launch({ argv: [...base().slice(0, 2), authorizationFile({ allowCollectionPreparation: true }), '--prepare-collections'], double: d }).catch(() => {});
  expect(d.created).toEqual([]); expect(d.seeded).toBe(0); expect(d.commands.every(c => c.connectionStatus === 1)).toBe(true);
  // Missing driver / driver without the expected API.
  expect(await reason(main({ argv: base(), stdin: pipeWith(frame('x')), now: () => now, loadMongoose: async () => ({}) }))).toBe('dependencies_missing');
  expect(await reason(main({ argv: base(), stdin: pipeWith(frame('x')), now: () => now, loadMongoose: async () => { throw new Error('missing'); } }))).toBe('dependencies_missing');
  expect(await reason(main({ argv: base(), stdin: pipeWith(frame('x')), now: () => now }))).toBe('dependencies_missing');
  expect(await reason(main({ argv: base(), stdin: pipeWith(frame('x')), now: () => now, loadMongoose: async () => ({}), platform: 'linux' }))).toBe('windows_required');
  expect(await reason(main({ argv: base(), stdin: pipeWith(frame('x')), now: () => now, loadMongoose: async () => ({}), nodeVersion: '18.0.0' }))).toBe('node_too_old');
});

it('IL05 the server listens on 127.0.0.1 only, with the integration profile and nothing else mounted', async () => {
  lines.length = 0;
  const { result, double } = await launch({ argv: [...base(), '--port', '0'] });
  expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(JSON.parse(lines.join(''))).toMatchObject({ integrationBackend: 'listening', profile: 'integration', url: result.url, schema: 'ready', executionId: result.executionId });
  expect(result.backend.profile).toBe('integration');
  expect((await fetch(result.url + '/api/health')).status).toBe(200);
  expect((await fetch(result.url + '/api/identity/me')).status).toBe(404);          // legacy opaque-token routes are not mounted
  const port = Number(new URL(result.url).port);
  const external = Object.values(os.networkInterfaces()).flat().filter(i => i && !i.internal && i.family === 'IPv4').map(i => i.address);
  for (const address of external.slice(0, 2)) {
    const reachable = await new Promise(resolve => { const s = net.connect({ host: address, port, timeout: 1500 }, () => { s.destroy(); resolve(true); }); s.on('error', () => resolve(false)); s.on('timeout', () => { s.destroy(); resolve(false); }); });
    expect(reachable, 'not reachable from ' + address).toBe(false);
  }
  expect(double.connects).toBe(1);
});

it('IL06 schema: the exact inventory is checked read-only; missing collections stop the launch unless creation is explicitly authorized and requested', async () => {
  // Inventory vs. the real model schemas (index names, keys, uniqueness) and collection names.
  const probe = integrationDouble(); const handle = await openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: secret(), connector: probe.connector });
  expect(Object.values(handle.collections)).toEqual(['integration_v2_operations', 'integration_v2_facts', 'integration_v2_fences', 'integration_v2_authorization']);
  for (const [key, definition] of Object.entries(INTEGRATION_SCHEMA.collections)) {
    expect(probe.models[key].collection.name, key).toBe(definition.name);
    const declared = probe.models[key].schema.indexes().map(([k, o]) => ({ name: o.name, key: k, unique: o.unique === true }));
    expect(declared, key).toEqual(definition.indexes);
  }
  expect(INTEGRATION_COLLECTION_NAMES).toHaveLength(7); expect(INTEGRATION_SCHEMA.notCreated.authorization).toBe('integration_v2_authorization');
  expect(INTEGRATION_COLLECTION_NAMES.every(n => /^integration_v2_[A-Za-z]+$/.test(n) && !n.includes('b054c2c'))).toBe(true);
  expect(await inspectIntegrationSchema(handle)).toMatchObject({ ready: true, missing: [], problems: [], foreignCollections: 0 });
  probe.remote.add('b054c2c_' + 'a'.repeat(32) + '_ops'); probe.remote.delete('integration_v2_revocations');
  expect(await inspectIntegrationSchema(handle)).toMatchObject({ ready: false, missing: ['integration_v2_revocations'], foreignCollections: 1 });   // foreign (C.2) collections are only counted
  await handle.close();
  // Empty database, no --prepare-collections: refused, nothing created, connection closed.
  const empty = integrationDouble(); empty.emptySchema(); empty.stubPreparation();
  expect(await reason(launch({ argv: base(), double: empty }))).toBe('schema_not_ready');
  expect(empty.created).toEqual([]); expect(empty.seeded).toBe(0); expect(empty.closed).toBe(1);
  // --prepare-collections without an authorization that allows it: refused before the password is even read.
  const stdin = pipeWith(frame('never-read'));
  const untouched = integrationDouble();
  expect(await reason(launch({ argv: [...base(), '--prepare-collections'], double: untouched, stdin }))).toBe('preparation_not_authorized'); expect(untouched.connects).toBe(0);
  // Both given: exactly the 7 inventory collections and their indexes are "created" (simulated), the fence is seeded once, then it serves.
  const allowed = [...base().slice(0, 2), authorizationFile({ allowCollectionPreparation: true }), '--prepare-collections'];
  const fresh = integrationDouble(); fresh.emptySchema(); fresh.stubPreparation();
  const { result } = await launch({ argv: allowed, double: fresh });
  expect(fresh.created.sort()).toEqual([...INTEGRATION_COLLECTION_NAMES].sort()); expect(fresh.indexed.sort()).toEqual([...INTEGRATION_COLLECTION_NAMES].sort());
  expect(fresh.seeded).toBe(1); expect(fresh.created.some(n => /b054c2c|authorization/.test(n))).toBe(false);
  expect((await fetch(result.url + '/api/health')).status).toBe(200);
  // The bundle API cannot be abused: preparation needs the exact phrase.
  await expect(prepareIntegrationCollections({}, { confirm: 'CREATE_INTEGRATION_COLLECTIONS' })).rejects.toMatchObject({ code: 'integration_not_activated' });
  // An index problem is not "ready" and is not repaired silently.
  const broken = integrationDouble(); broken.models.operations.collection.indexes = async () => [{ name: '_id_', key: { _id: 1 } }];
  expect(await reason(launch({ argv: base(), double: broken }))).toBe('schema_not_ready'); expect(broken.created).toEqual([]);
});

it('IL07 against the launched backend: authentication, batch delivery, idempotency and receipt queries work with the C# vectors', async () => {
  const { result, double } = await launch({ argv: [...base(), '--port', '0'] }); const client = httpClient(result.url);
  const A = { installationId: vectors.installationId, localPlayerId: vectors.localPlayerId, bindingGeneration: 1 };
  const p = await client.player(A);
  expect(p.register.status).toBe(201); expect((await client.call('/api/v2/technical/me', { token: p.token })).json).toEqual({ schemaVersion: 2, technicalAccountId: p.accountId, role: 'player' });
  const sent = await client.call('/api/v2/sync/batches', { method: 'POST', token: p.token, body: batch(vectors.operations) });
  expect(sent.status).toBe(200); expect(sent.json.counters.committed).toBe(vectors.operations.length);
  const again = await client.call('/api/v2/sync/batches', { method: 'POST', token: p.token, body: batch(vectors.operations) });
  expect(again.json.results.every(r => r.status === 'duplicate')).toBe(true); expect(double.rows.operations).toHaveLength(vectors.operations.length);
  const op = vectors.operations[0];
  const found = await client.call('/api/v2/sync/receipts/query', { method: 'POST', token: p.token, body: { schemaVersion: 2, attempts: [{ operationId: op.operationId, payloadHash: op.payloadHash, leaseId: randomUUID(), attempt: 1 }] } });
  expect(found.status).toBe(200); expect(found.json.results[0]).toMatchObject({ status: 'found', operationId: op.operationId });
  // Measured footprint for the inventory: collections written and documents per synthetic player.
  expect(Object.fromEntries(Object.entries(double.rows).map(([k, v]) => [k, v.length]))).toMatchObject({ identities: 1, ownerGuards: 1, identitySessions: 1, operations: vectors.operations.length, revocations: 0 });
  expect(double.rows.facts.length).toBeGreaterThan(0);
});

it('IL08 another owner\'s operations and receipts are refused on the launched backend', async () => {
  const { result, double } = await launch({ argv: [...base(), '--port', '0'] }); const client = httpClient(result.url);
  const A = { installationId: vectors.installationId, localPlayerId: vectors.localPlayerId, bindingGeneration: 1 }, B = { installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 };
  const a = await client.player(A), b = await client.player(B);
  const op = clone(vectors.operations[0]);
  expect((await client.call('/api/v2/sync/batches', { method: 'POST', token: b.token, body: batch([op]) })).status).toBe(403);
  expect(double.rows.operations).toHaveLength(0);
  expect((await client.call('/api/v2/sync/batches', { method: 'POST', token: a.token, body: batch([op]) })).status).toBe(200);
  expect((await client.call('/api/v2/players/' + a.accountId, { token: b.token })).status).toBe(403);
  const spoof = mutate(op, e => { e.localPlayerId = B.localPlayerId; }, { newId: true });
  expect((await client.call('/api/v2/sync/batches', { method: 'POST', token: a.token, body: batch([spoof]) })).status).toBe(403);
  const query = await client.call('/api/v2/sync/receipts/query', { method: 'POST', token: b.token, body: { schemaVersion: 2, attempts: [{ operationId: op.operationId, payloadHash: op.payloadHash, leaseId: randomUUID(), attempt: 1 }] } });
  expect(query.status === 200 ? query.json.results[0].status : 'refused').not.toBe('found'); expect(query.text).not.toContain(a.accountId);
  expect(double.rows.operations).toHaveLength(1); expect(double.rows.operations[0].technicalAccountId).toBe(a.accountId);
});

it('IL09 shutdown is orderly: listener first, then the single MongoDB connection; a second close is harmless; the entry point handles SIGINT/SIGTERM', async () => {
  const { result, double } = await launch({ argv: [...base(), '--port', '0'] });
  expect((await fetch(result.url + '/api/health')).status).toBe(200);
  const closed = await result.close({ graceMs: 500 });
  expect(closed).toMatchObject({ closed: true, forced: false, resourceErrors: 0 });
  expect(double.closed).toBe(1); await expect(fetch(result.url + '/api/health')).rejects.toThrow();
  await result.close(); expect(double.closed).toBe(1);
  // A failed start closes the connection too (port already in use).
  const busy = await launch({ argv: [...base(), '--port', '0'] }); const port = Number(new URL(busy.result.url).port);
  const second = integrationDouble();
  expect(await reason(launch({ argv: [...base(), '--port', String(port)], double: second }))).not.toBe('started'); expect(second.closed).toBe(1);
  const entry = fs.readFileSync(CLI, 'utf8');
  expect(entry).toMatch(/process\.on\('SIGINT'/); expect(entry).toMatch(/process\.on\('SIGTERM'/); expect(entry).toMatch(/running\.close\(/);
});

it('IL10 the cleanup plan is anchored on specific synthetic accounts and never produces an unbounded delete; the footprint is bounded', () => {
  const ids = [randomUUID(), randomUUID()];
  const plan = cleanupPlan(ids);
  expect(plan.map(s => s.collection)).toEqual(['integration_v2_operations', 'integration_v2_facts', 'integration_v2_revocations', 'integration_v2_identitySessions', 'integration_v2_ownerGuards', 'integration_v2_fences', 'integration_v2_identities']);
  for (const step of plan) { expect(Object.keys(step.filter)).toHaveLength(1); expect(INTEGRATION_COLLECTION_NAMES).toContain(step.collection); expect(JSON.stringify(step.filter)).toContain(ids[0]); }
  const fences = plan.find(s => s.collection.endsWith('_fences')); expect(fences.filter._id.$in).toEqual(ids.map(id => 'ingestion-v1:' + id)); expect(fences.filter._id.$in).not.toContain('ingestion-v1');   // owners' fences only
  expect(new RegExp(plan[1].filter.scope.$regex).test(`${ids[0]}:inst:player:1`)).toBe(true);
  expect(new RegExp(plan[1].filter.scope.$regex).test(`${randomUUID()}:inst:player:1`)).toBe(false);
  for (const bad of [[], ['x'], [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()], [ids[0], ids[0]], undefined, [{}], ['*']]) expect(() => cleanupPlan(bad), JSON.stringify(bad)).toThrow();
  expect(dropPlan().drop).toEqual(INTEGRATION_COLLECTION_NAMES);
  expect(Object.isFrozen(INTEGRATION_SCHEMA) && Object.isFrozen(INTEGRATION_SCHEMA.collections.operations.indexes)).toBe(true);
  expect(Object.keys(INTEGRATION_OPERATIONS)).toEqual(['connect', 'inspect', 'prepare', 'register', 'login', 'authenticate', 'batch', 'receipts', 'revoke']);
});

it('IL11 no real connection and no secret handling mistakes: only loopback sockets, no DNS, no environment or .env reads, hidden-input wrapper, nothing authorizes by itself', async () => {
  await launch({ argv: [...base(), '--port', '0'] });
  const external = connects.filter(c => c && typeof c === 'object' && c.host && !['127.0.0.1', '::1', 'localhost'].includes(c.host));
  expect(external).toEqual([]); expect(lookups.filter(h => !['localhost', '127.0.0.1'].includes(h))).toEqual([]);
  const strip = text => text.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  for (const file of ['src/integration/launcher.js', 'src/integration/authorization.js', 'src/integration/schema-inventory.js', 'src/integration/profile.js', 'scripts/run-integration-backend.js']) {
    const text = strip(fs.readFileSync(path.join(backendRoot, file), 'utf8'));
    expect(text, file).not.toMatch(/process\.env|dotenv|\.env\b|two_sides_db|twosides_backend|c2-|writeFile|appendFile|console\./);
  }
  for (const file of ['src/integration/launcher.js', 'src/integration/profile.js']) expect(strip(fs.readFileSync(path.join(backendRoot, file), 'utf8')), file).not.toMatch(/from\s+'mongoose'|import\(\s*'mongoose'/);
  expect(fs.readFileSync(CLI, 'utf8')).toMatch(/import\('mongoose'\)/);       // the driver is loaded only inside the entry point, after the preconditions
  expect(JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')).scripts.start).toBe('node src/server.js');
  const ps = strip(fs.readFileSync(PS1, 'utf8').split('\n').filter(l => !l.trim().startsWith('#')).join('\n'));
  expect(ps).toMatch(/-AsSecureString/); expect(ps).toMatch(/StandardInput\.BaseStream\.Write/); expect(ps).toMatch(/Environment\.Clear\(\)/);
  expect(ps).toMatch(/if \(-not \$Enable\)/); expect(ps).toMatch(/ReparsePoint/);
  expect(ps).not.toMatch(/ConvertFrom-SecureString|ConvertTo-SecureString|Out-File|Set-Content|Add-Content|Export-|Write-Host|Write-Output|Start-Transcript|Invoke-Expression|iex /i);
  expect(ps).not.toMatch(/\$env:/i); expect(ps).not.toMatch(/\.env/);   // no environment variables read, no .env (case-sensitive: .Environment is the .NET API)
  const argumentLine = ps.split('\n').filter(l => l.includes('Arguments')).join(' ');
  expect(argumentLine).not.toMatch(/\$(secure|bytes|chars|frame)/);
  // The wrapper does nothing without -Enable (and never reaches the password prompt).
  const refused = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', PS1, '-Authorization', 'C:\\does-not-exist.json'], { encoding: 'utf8', timeout: 60000, input: '' });
  expect(refused.status).not.toBe(0); expect(refused.stdout + refused.stderr).toMatch(/disabled/i);
  const missing = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', PS1, '-Enable', '-Authorization', 'C:\\does-not-exist.json'], { encoding: 'utf8', timeout: 60000, input: '' });
  expect(missing.status).not.toBe(0); expect(missing.stdout + missing.stderr).toMatch(/authorization file/i);
});
