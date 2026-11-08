import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LauncherError, main, parseArguments } from '../../src/integration/launcher.js';
import { ATLAS_TARGET, INTEGRATION_PROFILE_CONFIG } from '../../src/modules/sync/atlas-policy.js';
import { fakeMongoose, integrationDouble } from './support/integration-double.js';

// B05.5 stage 8: --auth-check, the authentication-only run of the launcher. Offline: a MongoDB DOUBLE stands in for Atlas, errors are simulated, the only
// "passwords" are random strings. Nothing connects anywhere.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const dirs = [], sockets = [];
let temp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-authcheck-')); dirs.push(temp); sockets.length = 0;
  const connect = net.Socket.prototype.connect;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { sockets.push(args[0]); return connect.apply(this, args); });
});
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });
const nowMs = Date.now(), iso = ms => new Date(ms).toISOString();
const authorization = (changes = {}) => {
  const file = path.join(temp, randomUUID() + '.json'), body = { schemaVersion: 1, kind: 'atlas-integration-launch', executionId: randomBytes(16).toString('hex'), host: ATLAS_TARGET.host,
    database: ATLAS_TARGET.database, user: ATLAS_TARGET.user, notBefore: iso(nowMs - 60_000), notAfter: iso(nowMs + 3_600_000), allowCollectionPreparation: false, maxSyntheticPlayers: 1, ...changes };
  fs.writeFileSync(file, JSON.stringify(body)); return { file, body, marker: path.join(temp, body.executionId + '.manifest.json') };
};
const frame = text => { const bytes = Buffer.from(text); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const pipeWith = data => { const s = new PassThrough(); s.write(data); s.end(); return s; };
const check = async (double, { auth = authorization(), extra = [], password = 'pw-' + randomBytes(12).toString('hex'), rejectWith } = {}) => {
  const lines = [];
  try {
    const result = await main({ argv: ['--enable-integration', '--authorization', auth.file, '--auth-check', ...extra], stdin: pipeWith(frame(password)), stdout: { write: t => lines.push(t) },
      now: () => nowMs, loadMongoose: async () => fakeMongoose(double, { rejectWith }) });
    return { result, lines, auth, password };
  } catch (error) { return { error, lines, auth, password }; }
};
const named = (name, props = {}, message = 'driver text') => Object.assign(new Error(message), { name }, props);
const writeGuards = double => {   // any write-shaped call through the models fails the run loudly
  for (const model of Object.values(double.models)) for (const method of ['updateOne', 'deleteOne', 'deleteMany', 'createCollection', 'createIndexes'])
    model[method] = async () => { throw Object.assign(new Error('WRITE_ATTEMPTED'), { code: 'write_attempted' }); };
};

it('AC01 a successful check authenticates, reads only, reports the effective configuration, starts no HTTP and closes', async () => {
  const double = integrationDouble(); writeGuards(double); const before = structuredClone(double.rows);
  const { result, lines, auth } = await check(double);
  expect(result.authCheck).toMatchObject({ authenticated: true, user: 'twosides_integration_test', database: 'two_sides_integration_test', authSource: 'admin', mechanism: 'SCRAM-SHA-256',
    tls: 'strict', privileges: 'verified-read-only', role: 'readWrite', schemaReady: true, collectionsPresent: 7, collectionsMissing: [], indexProblems: 0, writes: 0, http: 'not-started' });
  expect(JSON.parse(lines.join('')).closed).toBe(true); expect(result.url).toBeUndefined(); expect(result.backend).toBeUndefined();
  expect(double.rows).toEqual(before); expect(double.created).toEqual([]); expect(double.indexed).toEqual([]); expect(double.seeded).toBe(0);
  expect(double.commands.every(c => c.connectionStatus === 1)).toBe(true);                // the only command: the read-only privilege inspection
  expect(double.closed).toBe(1);
  expect(sockets.filter(s => s && (s.port || s.path))).toEqual([]);                      // nothing listened or connected, not even on loopback
  expect(JSON.parse(fs.readFileSync(auth.marker, 'utf8'))).toMatchObject({ kind: 'auth-check', result: { authenticated: true, writes: 0 } });
});

it('AC02 an empty or partial schema is only reported: nothing is created even when the authorization would allow preparation', async () => {
  const double = integrationDouble(); double.emptySchema(); double.stubPreparation(); writeGuards(double);
  const { result } = await check(double, { auth: authorization({ allowCollectionPreparation: true }) });
  expect(result.authCheck).toMatchObject({ authenticated: true, schemaReady: false, collectionsPresent: 0, writes: 0 });
  expect(result.authCheck.collectionsMissing).toHaveLength(7);
  expect(double.created).toEqual([]); expect(double.indexed).toEqual([]); expect(double.seeded).toBe(0); expect(double.closed).toBe(1);
});

it('AC03 the mode excludes everything that writes or serves, and the three locks still apply', async () => {
  const base = ['--enable-integration', '--authorization', 'C:\\a.json', '--auth-check'];
  for (const extra of [['--prepare-collections'], ['--synthetic-run'], ['--port', '3001']]) expect(() => parseArguments([...base, ...extra]), extra[0]).toThrow(LauncherError);
  expect(parseArguments(base)).toMatchObject({ authCheck: true, prepare: false, syntheticRun: false });
  expect(parseArguments(base.slice(0, 3)).authCheck).toBe(false);
  for (const argv of [['--auth-check'], ['--auth-check', '--authorization', 'C:\\a.json'], ['--enable-integration', '--auth-check']]) {
    const double = integrationDouble();
    await expect(main({ argv, stdin: pipeWith(frame('x')), now: () => nowMs, loadMongoose: async () => fakeMongoose(double) })).rejects.toBeInstanceOf(LauncherError);
    expect(double.connects).toBe(0);
  }
  const noCredential = integrationDouble(), auth = authorization();
  await expect(main({ argv: ['--enable-integration', '--authorization', auth.file, '--auth-check'], stdin: pipeWith(Buffer.from('plain')), now: () => nowMs, loadMongoose: async () => fakeMongoose(noCredential) })).rejects.toMatchObject({ code: 'credential_required' });
  expect(noCredential.connects).toBe(0); expect(fs.existsSync(auth.marker)).toBe(false);   // a refused credential does not consume the authorization
  const expired = authorization({ notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) }), d2 = integrationDouble();
  expect((await check(d2, { auth: expired })).error).toMatchObject({ code: 'authorization_expired' }); expect(d2.connects).toBe(0);
});

it('AC04 the authorization is single use: a second run is refused before any connection, whether the first succeeded or failed', async () => {
  const ok = authorization(); expect((await check(integrationDouble(), { auth: ok })).result.authCheck.authenticated).toBe(true);
  const again = integrationDouble(); expect((await check(again, { auth: ok })).error).toMatchObject({ code: 'authorization_consumed' }); expect(again.connects).toBe(0);
  const bad = authorization(), password = 'pw-' + randomBytes(12).toString('hex');
  const first = await check(integrationDouble(), { auth: bad, password, rejectWith: named('MongoServerError', { code: 18, codeName: 'AuthenticationFailed' }, `Authentication failed for ${password}`) });
  expect(first.error).toMatchObject({ code: 'atlas_authentication_failed', diagnostic: { stage: 'mongoose-connect', category: 'AUTHENTICATION_FAILURE' } });
  const marker = fs.readFileSync(bad.marker, 'utf8');
  expect(JSON.parse(marker)).toMatchObject({ kind: 'auth-check', result: { authenticated: false, reason: 'atlas_authentication_failed' } }); expect(marker).not.toContain(password);
  const retry = integrationDouble(); expect((await check(retry, { auth: bad })).error).toMatchObject({ code: 'authorization_consumed' }); expect(retry.connects).toBe(0);
});

it('AC05 connection errors are diagnosed with their own code, stage and category, and no secret reaches the output or the marker', async () => {
  const password = 'pw-' + randomBytes(12).toString('hex');
  const cases = [[named('MongoServerError', { code: 18, codeName: 'AuthenticationFailed' }, `Authentication failed for ${password}`), 'atlas_authentication_failed', 'AUTHENTICATION_FAILURE'],
    [named('Error', { code: 'ENOTFOUND', syscall: 'querySrv' }, `querySrv ENOTFOUND ${password}`), 'atlas_dns_failed', 'DNS_SRV_FAILURE'],
    [named('MongoNetworkError', { code: 'ERR_SSL_WRONG_VERSION_NUMBER' }, `ssl ${password}`), 'atlas_tls_failed', 'TLS_HANDSHAKE_FAILURE'],
    [named('MongoNetworkTimeoutError', {}, `timeout ${password}`), 'atlas_network_timeout', 'NETWORK_TIMEOUT'],
    [named('MongooseServerSelectionError', {}, `Server selection timed out after 10000 ms ${password}`), 'atlas_server_selection_timeout', 'SERVER_SELECTION_TIMEOUT']];
  for (const [error, code, category] of cases) {
    const double = integrationDouble(), run = await check(double, { rejectWith: error, password });
    expect(run.error, category).toMatchObject({ code, diagnostic: { stage: 'mongoose-connect', category } });
    expect(double.closed).toBe(1);
    const everything = JSON.stringify(run.error) + run.error.message + run.lines.join('') + fs.readFileSync(run.auth.marker, 'utf8');
    for (const forbidden of [password, 'mongodb+srv', ATLAS_TARGET.host]) expect(everything, category).not.toContain(forbidden);
  }
  // A privilege problem after authenticating keeps its own code and stage; the connection is closed.
  const wrong = integrationDouble(); wrong.status.authInfo.authenticatedUserRoles[0].role = 'dbAdmin';
  expect((await check(wrong, { password })).error).toMatchObject({ code: 'atlas_permissions_unverified', diagnostic: { stage: 'permission-inspection' } }); expect(wrong.closed).toBe(1);
});

it('AC06 SCRAM-SHA-256, strict TLS, authSource admin and the fixed target are exactly what is requested; no automatic index or collection creation is configured', async () => {
  const double = integrationDouble(); await check(double);
  expect(INTEGRATION_PROFILE_CONFIG.authMechanism).toBe('SCRAM-SHA-256');
  expect(double.optionsSeen[0]).toMatchObject({ dbName: 'two_sides_integration_test', user: 'twosides_integration_test', authSource: 'admin', authMechanism: 'SCRAM-SHA-256', tls: true,
    tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false, directConnection: false, autoIndex: false, autoCreate: false, bufferCommands: false, w: 'majority' });
  expect(double.uriSeen).toEqual(['mongodb+srv://twosidescluster.fxqeo8o.mongodb.net/two_sides_integration_test']);
  for (const model of Object.values(double.models)) if (model.schema?.options) expect(model.schema.options).toMatchObject({ autoIndex: false, autoCreate: false });
  expect(fs.readFileSync(path.join(backendRoot, 'src', 'modules', 'sync', 'atlas-policy.js'), 'utf8')).toMatch(/INTEGRATION_PROFILE_CONFIG=.*authMechanism:'SCRAM-SHA-256'/);
});

it('AC07 the PowerShell wrapper offers -AuthCheck, refuses its combinations before asking for the password, and sends no port', () => {
  const ps1 = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-integration-backend.ps1'), 'utf8');
  expect(ps1).toMatch(/\[switch\]\$AuthCheck/); expect(ps1).toContain("$info.Arguments += ' --auth-check'");
  expect(ps1.indexOf('$AuthCheck -and ($PrepareCollections -or $SyntheticRun)')).toBeGreaterThan(0);
  expect(ps1.indexOf('$AuthCheck -and ($PrepareCollections -or $SyntheticRun)')).toBeLessThan(ps1.indexOf('Read-Host'));
  const authCheckLine = ps1.split('\n').find(l => l.includes('if ($AuthCheck) { $info.Arguments ='));
  expect(authCheckLine).toBeTruthy(); expect(authCheckLine).not.toContain('--port');
  const entry = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-integration-backend.js'), 'utf8');
  expect(entry).toContain('running.authCheck');
});
