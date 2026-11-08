import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LauncherError, failureReport, main, parseArguments } from '../../src/integration/launcher.js';
import { DIAGNOSTIC_CATEGORIES, DIAGNOSTIC_STAGES, INTEGRATION_ACTIVATION, codeForCategory, openIntegrationProfile } from '../../src/integration/profile.js';
import { ATLAS_TARGET, ATLAS_URI } from '../../src/modules/sync/atlas-policy.js';
import { fakeMongoose, integrationDouble, secret } from './support/integration-double.js';

// B05.5 stage 8 (diagnostics): the failure of the Atlas connection is classified into distinct, safe codes. Errors are SIMULATED: no socket to Atlas,
// no real credential. The only "password" is a random string per test, used to prove it never reaches any output.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const dirs = [], connects = [];
let temp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-diagnostics-')); dirs.push(temp); connects.length = 0;
  const connect = net.Socket.prototype.connect;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { connects.push(args[0]); return connect.apply(this, args); });
});
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });

const nowMs = Date.now(), iso = ms => new Date(ms).toISOString();
const authorizationFile = () => {
  const file = path.join(temp, randomUUID() + '.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, kind: 'atlas-integration-launch', executionId: randomBytes(16).toString('hex'), host: ATLAS_TARGET.host, database: ATLAS_TARGET.database,
    user: ATLAS_TARGET.user, notBefore: iso(nowMs - 60_000), notAfter: iso(nowMs + 3_600_000), allowCollectionPreparation: true, maxSyntheticPlayers: 1 }));
  return file;
};
const frame = text => { const bytes = Buffer.from(text); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const pipeWith = data => { const s = new PassThrough(); s.write(data); s.end(); return s; };
const PASSWORD = () => 'pw-' + randomBytes(12).toString('hex');
const named = (name, props = {}, message = 'driver text') => Object.assign(new Error(message), { name }, props);

// Driver-shaped failures, each carrying the password and the connection string in its message to prove they are dropped.
const cases = (secretText) => [
  ['authentication', named('MongoServerError', { code: 18, codeName: 'AuthenticationFailed' }, `Authentication failed for ${secretText} at ${ATLAS_URI}`), 'atlas_authentication_failed', 'AUTHENTICATION_FAILURE'],
  ['dns srv', named('Error', { code: 'ENOTFOUND', syscall: 'querySrv' }, `querySrv ENOTFOUND _mongodb._tcp.${ATLAS_TARGET.host} ${secretText}`), 'atlas_dns_failed', 'DNS_SRV_FAILURE'],
  ['dns host', named('Error', { code: 'ENOTFOUND', syscall: 'getaddrinfo' }, `getaddrinfo ENOTFOUND ${secretText}`), 'atlas_dns_failed', 'DNS_HOST_FAILURE'],
  ['tls handshake', named('MongoNetworkError', { code: 'ERR_SSL_WRONG_VERSION_NUMBER' }, `ssl error ${secretText}`), 'atlas_tls_failed', 'TLS_HANDSHAKE_FAILURE'],
  ['certificate', named('MongoNetworkError', { code: 'CERT_HAS_EXPIRED' }, `certificate ${secretText}`), 'atlas_tls_failed', 'CERTIFICATE_VALIDATION_FAILURE'],
  ['network timeout', named('MongoNetworkTimeoutError', {}, `socket timed out ${secretText}`), 'atlas_network_timeout', 'NETWORK_TIMEOUT'],
  ['server selection timeout', named('MongooseServerSelectionError', {}, `Server selection timed out after 10000 ms ${secretText}`), 'atlas_server_selection_timeout', 'SERVER_SELECTION_TIMEOUT'],
  ['client configuration', named('MongoParseError', {}, `option foo is not supported ${secretText}`), 'atlas_client_configuration_rejected', 'INVALID_CONNECTION_OPTIONS'],
  ['connection refused', named('MongoNetworkError', { code: 'ECONNREFUSED' }, `connect ECONNREFUSED ${secretText}`), 'atlas_connection_unavailable', 'NETWORK_REFUSED'],
  ['unclassifiable', named('Error', {}, `anything ${secretText}`), 'atlas_connection_unavailable', 'UNKNOWN_CONNECTION_FAILURE'],
];
const launch = async (double, rejectWith, password, file = authorizationFile()) => {
  try {
    await main({ argv: ['--enable-integration', '--authorization', file, '--synthetic-run'], stdin: pipeWith(frame(password)), stdout: { write() {} }, now: () => nowMs, loadMongoose: async () => fakeMongoose(double, { rejectWith }) });
    return null;
  } catch (e) { return e; }
};

it('CD01 each simulated connection failure gets its own code and category, with the stage and a rounded duration', async () => {
  const password = PASSWORD();
  for (const [label, error, code, category] of cases(password)) {
    const double = integrationDouble();
    const failure = await launch(double, error, password);
    expect(failure, label).toBeInstanceOf(LauncherError);
    expect(failure.code, label).toBe(code);
    expect(failure.diagnostic, label).toMatchObject({ stage: 'mongoose-connect', category });
    expect(failure.diagnostic.approximateDurationMs % 100, label).toBe(0);
    expect(double.closed, label).toBe(1);                                                  // whatever opened was closed
    expect(double.rows.identities).toHaveLength(0); expect(double.rows.operations).toHaveLength(0);   // nothing was written
  }
});

it('CD02 a timeout is reported as a timeout: nothing in the code or output claims an unauthorized IP', async () => {
  const password = PASSWORD();
  for (const [label, error] of cases(password).filter(c => /timeout/.test(c[0]))) {
    const failure = await launch(integrationDouble(), error, password);
    const text = failureReport(failure) + JSON.stringify(failure.diagnostic) + failure.code;
    expect(text, label).not.toMatch(/allowlist|whitelist|unauthori[sz]ed.ip|ip.not|network.access|firewall/i);
    expect(failure.code).toMatch(/timeout$/);
  }
  for (const category of DIAGNOSTIC_CATEGORIES) expect(category).not.toMatch(/IP|ALLOW|WHITELIST/);
  expect(codeForCategory('SERVER_SELECTION_TIMEOUT')).toBe('atlas_server_selection_timeout'); expect(codeForCategory('NETWORK_TIMEOUT')).toBe('atlas_network_timeout');
});

it('CD03 an error after the connection exists is a post-connect failure, with its stage, not a connectivity one', async () => {
  const password = PASSWORD(), double = integrationDouble();
  double.connection.model = () => { throw new Error(`model failure ${password} ${ATLAS_URI}`); };
  const failure = await launch(double, undefined, password);
  expect(failure.code).toBe('atlas_post_connect_failed');
  expect(failure.diagnostic).toMatchObject({ stage: 'repositories', category: 'POST_CONNECT_FAILURE' });
  expect(double.closed).toBe(1);
  // A known policy rejection keeps its own code (permissions) and gains its stage.
  const wrong = integrationDouble(); wrong.status.authInfo.authenticatedUserRoles[0].role = 'dbAdmin';
  const rejected = await launch(wrong, undefined, password);
  expect(rejected.code).toBe('atlas_permissions_unverified'); expect(rejected.diagnostic.stage).toBe('permission-inspection');
  // A launcher-side failure after a successful open names its own stage.
  const empty = integrationDouble(); empty.emptySchema(); const { file } = { file: authorizationFile() };
  const notReady = await main({ argv: ['--enable-integration', '--authorization', file], stdin: pipeWith(frame(password)), now: () => nowMs, loadMongoose: async () => fakeMongoose(empty) }).catch(e => e);
  expect(notReady.code).toBe('schema_not_ready'); expect(notReady.diagnostic).toMatchObject({ stage: 'schema', category: 'POST_CONNECT_FAILURE' });
});

it('CD04 secrets never reach the output: no password, URI, host, driver message, class name or stack in the report, the error or its JSON', async () => {
  const password = PASSWORD();
  for (const [label, error] of cases(password)) {
    const failure = await launch(integrationDouble(), error, password);
    const everything = [failureReport(failure), failure.message, failure.code, JSON.stringify(failure), JSON.stringify(failure.diagnostic), String(failure.stack ?? '').split('\n')[0]].join('\n');
    for (const forbidden of [password, ATLAS_URI, ATLAS_TARGET.host, 'mongodb+srv', 'querySrv', 'driver text', 'MongoServerError', 'Authentication failed for', 'ENOTFOUND'])
      expect(everything, `${label}: ${forbidden}`).not.toContain(forbidden);
    expect(failure.cause).toBeUndefined();
    expect(Object.keys(failure).sort()).toEqual(['code', 'diagnostic', 'name']);
    expect(Object.keys(failure.diagnostic).sort()).toEqual(['approximateDurationMs', 'category', 'stage']);
    expect(failureReport(failure).split('\n').filter(Boolean).map(l => l.split('=')[0])).toEqual(['Unable to start the integration backend', 'reason', 'stage', 'category', 'approxMs']);
  }
  // Anything not in the fixed vocabularies is dropped, whatever a future error carries.
  const forged = Object.assign(new LauncherError('atlas_dns_failed'), { diagnostic: { stage: password, category: ATLAS_URI, approximateDurationMs: 100 } });
  expect(failureReport(forged)).toBe('Unable to start the integration backend\nreason=atlas_dns_failed\n');
  expect(failureReport(new Error(password))).toBe('Unable to start the integration backend\nreason=unexpected\n');
  expect(DIAGNOSTIC_STAGES).toContain('mongoose-connect');
});

it('CD05 the three activation locks and the destination are unchanged', async () => {
  const password = PASSWORD();
  for (const argv of [[], ['--authorization', authorizationFile()], ['--enable-integration']]) {
    const double = integrationDouble();
    await expect(main({ argv, stdin: pipeWith(frame(password)), now: () => nowMs, loadMongoose: async () => fakeMongoose(double) })).rejects.toBeInstanceOf(LauncherError);
    expect(double.connects).toBe(0);
  }
  const noCredential = integrationDouble();
  await expect(main({ argv: ['--enable-integration', '--authorization', authorizationFile()], stdin: pipeWith(Buffer.from('plain')), now: () => nowMs, loadMongoose: async () => fakeMongoose(noCredential) })).rejects.toMatchObject({ code: 'credential_required' });
  expect(noCredential.connects).toBe(0);
  expect(parseArguments(['--enable-integration', '--authorization', 'C:\\a.json']).syntheticRun).toBe(false);
  expect(ATLAS_URI).toBe('mongodb+srv://twosidescluster.fxqeo8o.mongodb.net/two_sides_integration_test');
  for (const extra of [{ host: 'evil.example' }, { database: 'two_sides_db' }, { user: 'twosides_backend' }, { uri: 'mongodb://127.0.0.1/x' }]) {
    const double = integrationDouble();
    await expect(openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: secret(), connector: double.connector, ...extra })).rejects.toMatchObject({ code: 'integration_option_rejected' });
    expect(double.connects).toBe(0);
  }
  // A connector that is handed a different destination still fails with the configuration code, not a connectivity one.
  const double = integrationDouble(); const { integrationConnector } = await import('../../src/integration/profile.js');
  await expect(integrationConnector(fakeMongoose(double))('mongodb://127.0.0.1/x', { dbName: 'x' })).rejects.toMatchObject({ code: 'atlas_configuration_rejected' });
  expect(double.connects).toBe(0);
});

it('CD06 authorization and manifest keep their behaviour: a failed connection consumes nothing and leaves no manifest, and the same file can be used again', async () => {
  const password = PASSWORD(), file = authorizationFile(), before = fs.readdirSync(temp);
  const first = await launch(integrationDouble(), cases(password)[0][1], password, file);
  expect(first.code).toBe('atlas_authentication_failed');
  expect(fs.readdirSync(temp)).toEqual(before);                                           // no manifest, nothing written next to the authorization
  const second = await launch(integrationDouble(), cases(password)[5][1], password, file);
  expect(second.code).toBe('atlas_network_timeout');                                      // the authorization is still accepted
  // The expired / consumed paths are the same as before.
  const expired = authorizationFile(); const body = JSON.parse(fs.readFileSync(expired, 'utf8'));
  fs.writeFileSync(expired, JSON.stringify({ ...body, notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) }));
  expect(await launch(integrationDouble(), undefined, password, expired)).toMatchObject({ code: 'authorization_expired' });
  const consumed = authorizationFile(); const info = JSON.parse(fs.readFileSync(consumed, 'utf8'));
  fs.writeFileSync(path.join(temp, info.executionId + '.manifest.json'), '{}');
  expect(await launch(integrationDouble(), undefined, password, consumed)).toMatchObject({ code: 'authorization_consumed' });
  expect(connects.filter(c => c && c.host && !/127\.0\.0\.1|localhost/.test(String(c.host)))).toEqual([]);   // no outward socket in this file
});

it('CD07 the entry script prints only the report and the source adds no environment, file or network reads', () => {
  const entry = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-integration-backend.js'), 'utf8');
  expect(entry).toContain('failureReport(error)'); expect(entry).not.toMatch(/error\.message|error\.stack|console\.(log|error)|process\.env/);
  const profile = fs.readFileSync(path.join(backendRoot, 'src', 'integration', 'profile.js'), 'utf8');
  expect(profile.replace(/\/\/.*$/gm, '')).not.toMatch(/process\.env|\.env\b|console\./);
});
