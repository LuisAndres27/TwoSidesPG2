import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { main, parseArguments, LauncherError } from '../../src/integration/launcher.js';
import { runSyntheticScenario, syntheticOperations, SYNTHETIC_BATCH_SIZE } from '../../src/integration/synthetic-run.js';
import { cleanupPlan } from '../../src/integration/schema-inventory.js';
import { ATLAS_TARGET } from '../../src/modules/sync/atlas-policy.js';
import { fakeMongoose, integrationDouble, integrationStack, stacks } from './support/integration-double.js';

// B05.5 stage 8, offline: the bounded synthetic scenario, its targeted cleanup and the launcher wiring, on a MongoDB DOUBLE. Nothing here reaches
// Atlas. Results prove the code paths and the exact documents touched; they say nothing about Atlas latency, permissions or server behaviour.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const dirs = [], connects = [];
let temp;
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-synthetic-')); dirs.push(temp); connects.length = 0;
  const connect = net.Socket.prototype.connect;
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (...args) { connects.push(args[0]); return connect.apply(this, args); });
});
afterEach(async () => {
  for (const s of stacks.splice(0)) await s.backend.close({ graceMs: 100 }).catch(() => {});
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const nowMs = Date.now();
const iso = ms => new Date(ms).toISOString();
const authorization = (changes = {}) => {
  const file = path.join(temp, randomUUID() + '.json');
  const body = { schemaVersion: 1, kind: 'atlas-integration-launch', executionId: randomBytes(16).toString('hex'), host: ATLAS_TARGET.host, database: ATLAS_TARGET.database,
    user: ATLAS_TARGET.user, notBefore: iso(nowMs - 60_000), notAfter: iso(nowMs + 3_600_000), allowCollectionPreparation: false, maxSyntheticPlayers: 1, ...changes };
  fs.writeFileSync(file, JSON.stringify(body)); return { file, body };
};
const frame = text => { const bytes = Buffer.from(text); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const pipeWith = data => { const s = new PassThrough(); s.write(data); s.end(); return s; };
const run = async (double, extra = [], changes = {}, password = 'pw-' + randomBytes(12).toString('hex')) => {
  const { file, body } = authorization(changes); const lines = [];
  const result = await main({ argv: ['--enable-integration', '--authorization', file, '--port', '0', '--synthetic-run', ...extra], stdin: pipeWith(frame(password)),
    stdout: { write: t => lines.push(t) }, now: () => nowMs, loadMongoose: async () => fakeMongoose(double) });
  return { result, lines, file, body, password, manifest: path.join(path.dirname(file), body.executionId + '.manifest.json') };
};
const rowsOf = double => Object.fromEntries(Object.entries(double.rows).map(([k, v]) => [k, structuredClone(v)]));
const seedForeign = double => {   // documents of another owner that must survive everything
  const other = randomUUID();
  double.rows.identities.push({ _id: other, registrationId: randomUUID(), installationId: randomUUID(), localPlayerId: randomUUID() });
  double.rows.ownerGuards.push({ _id: other, revision: 3 });
  double.rows.operations.push({ _id: other + ':op', technicalAccountId: other, operationId: randomUUID() });
  double.rows.facts.push({ _id: other + ':fact', scope: other + ':i:p:1', sourceKey: 'k' });
  double.rows.fences.push({ _id: 'ingestion-v1:' + other, revision: 2 });
  return other;
};

it('SR01 the synthetic run registers one account, ingests a batch of 10, confirms receipts and idempotency, persists, cleans and closes', async () => {
  const double = integrationDouble(); const before = rowsOf(double);
  const { result, lines, manifest, password } = await run(double);
  const out = result.syntheticResult;
  expect(out.errors).toEqual([]); expect(out.success).toBe(true);
  expect(Object.values(out.checks).every(Boolean)).toBe(true);
  for (const name of ['register_201_or_200', 'login_200', 'jwt_v2_rs256', 'me_identifies_account', 'batch_all_committed', 'receipts_found', 'receipts_equal_batch', 'resend_all_duplicate', 'operations_persisted', 'only_this_account_created_documents'])
    expect(out.checks[name], name).toBe(true);
  expect(out.documents.created.integration_v2_operations).toBe(SYNTHETIC_BATCH_SIZE);
  expect(out.documents.created.integration_v2_facts).toBeGreaterThan(0);
  expect(out.steps.map(s => s.name)).toEqual(['health', 'register', 'login', 'me', 'batch', 'receipts', 'resend']);
  expect(out.steps.every(s => Number.isFinite(s.ms))).toBe(true);
  expect(out.cleanup.complete).toBe(true); expect(out.cleanup.totalsRestored).toBe(true);
  expect(rowsOf(double)).toEqual({ ...before, fences: double.rows.fences }); expect(double.rows.fences).toEqual(before.fences);   // back to the seed only
  expect(double.closed).toBe(1);
  await expect(fetch(result.url + '/api/health')).rejects.toBeTruthy();                                   // HTTP stopped
  const printed = lines.join('') + fs.readFileSync(manifest, 'utf8');
  expect(printed).not.toContain(password); expect(printed).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); expect(printed).not.toContain('accessToken'); expect(printed).not.toContain('credential"');
  const saved = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  expect(saved.accountIds).toHaveLength(1); expect(saved.operationIds).toHaveLength(SYNTHETIC_BATCH_SIZE); expect(saved.result).toEqual({ success: true, cleanupComplete: true });
  expect(connects.filter(c => c && c.port && c.port !== Number(new URL(result.url).port))).toEqual([]);   // no socket besides the loopback server
});

it('SR02 cleanup deletes only the documents of the account created by the run; another owner\'s documents are untouched', async () => {
  const double = integrationDouble(); const other = seedForeign(double); const before = rowsOf(double);
  const { result } = await run(double);
  expect(result.syntheticResult.success).toBe(true);
  expect(rowsOf(double)).toEqual(before);
  expect(double.rows.identities.some(r => r._id === other)).toBe(true);
  // The plan never has an empty filter and always lists children before parents.
  const plan = cleanupPlan([randomUUID()]);
  expect(plan.map(s => s.collection.replace('integration_v2_', ''))).toEqual(['operations', 'facts', 'revocations', 'identitySessions', 'ownerGuards', 'fences', 'identities']);
  expect(plan.every(s => Object.keys(s.filter).length === 1)).toBe(true);
  expect(() => cleanupPlan([])).toThrow(); expect(() => cleanupPlan(['*'])).toThrow(); expect(() => cleanupPlan([randomUUID(), 'x'])).toThrow();
});

it('SR03 a failure after registration stops further writes, records the account, and still cleans exactly that account', async () => {
  const stack = await integrationStack(); await stack.listen(); const other = seedForeign(stack.db); const before = rowsOf(stack.db);
  const manifestFile = path.join(temp, 'm.json');
  const failing = (url, init) => String(url).endsWith('/api/v2/sync/batches') ? Promise.reject(new Error('network down')) : fetch(url, init);
  const out = await runSyntheticScenario({ url: stack.base, bundle: stack.bundle, executionId: randomBytes(16).toString('hex'), notAfter: iso(nowMs + 3_600_000), now: () => nowMs, manifestFile, fetchImpl: failing });
  expect(out.success).toBe(false); expect(out.errors).toHaveLength(1);
  expect(out.checks.login_200).toBe(true); expect(out.checks.batch_all_committed).toBeUndefined();
  expect(stack.db.rows.operations.filter(o => !o.technicalAccountId.startsWith(other))).toEqual([]);   // nothing was ingested
  expect(out.cleanup.complete).toBe(true); expect(rowsOf(stack.db)).toEqual(before);
  expect(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).accountIds).toHaveLength(1);
});

it('SR04 an authorization window that has closed stops all writes before registration and is never extended', async () => {
  const stack = await integrationStack(); await stack.listen(); const before = rowsOf(stack.db);
  const out = await runSyntheticScenario({ url: stack.base, bundle: stack.bundle, executionId: randomBytes(16).toString('hex'), notAfter: iso(nowMs - 1), now: () => nowMs });
  expect(out.success).toBe(false); expect(out.errors[0].check).toBe('authorization_window_closed');
  expect(out.steps.map(s => s.name)).toEqual(['health']); expect(rowsOf(stack.db)).toEqual(before);
  expect(out.cleanup.complete).toBe(true);
  // Through the launcher an expired authorization does not even connect.
  const double = integrationDouble(); const { file } = authorization({ notBefore: iso(nowMs - 7_200_000), notAfter: iso(nowMs - 3_600_000) });
  await expect(main({ argv: ['--enable-integration', '--authorization', file, '--synthetic-run'], stdin: pipeWith(frame('pw-x')), now: () => nowMs, loadMongoose: async () => fakeMongoose(double) }))
    .rejects.toMatchObject({ code: 'authorization_expired' });
  expect(double.connects).toBe(0);
});

it('SR05 the synthetic mode is opt-in: without the flag the launcher only listens, and the flag never replaces the three activation locks', async () => {
  expect(parseArguments(['--enable-integration', '--authorization', 'C:\\a.json']).syntheticRun).toBe(false);
  expect(parseArguments(['--enable-integration', '--authorization', 'C:\\a.json', '--synthetic-run']).syntheticRun).toBe(true);
  for (const argv of [['--synthetic-run'], ['--synthetic-run', '--authorization', 'C:\\a.json'], ['--enable-integration', '--synthetic-run']])
    expect(() => parseArguments(argv)).toThrow(LauncherError);
  expect(() => parseArguments(['--enable-integration', '--authorization', 'C:\\a.json', '--synthetic-run', '--synthetic-run'])).toThrow(LauncherError);
  const double = integrationDouble(); const { file } = authorization(); const lines = [];
  const running = await main({ argv: ['--enable-integration', '--authorization', file, '--port', '0'], stdin: pipeWith(frame('pw-y')), stdout: { write: t => lines.push(t) }, now: () => nowMs, loadMongoose: async () => fakeMongoose(double) });
  expect(running.syntheticResult).toBeUndefined(); expect(double.rows.identities).toHaveLength(0); expect(double.rows.operations).toHaveLength(0);
  await running.close({ graceMs: 100 });
  const ps1 = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-integration-backend.ps1'), 'utf8');
  expect(ps1).toMatch(/\[switch\]\$SyntheticRun/); expect(ps1).toContain('if (-not $Enable)'); expect(ps1).toMatch(/--synthetic-run/);
});

it('SR06 the batch is a closed prefix of the contract vectors, at most 10 operations, re-addressed to a fresh binding each time', () => {
  const a = syntheticOperations(), b = syntheticOperations();
  expect(a.operations).toHaveLength(SYNTHETIC_BATCH_SIZE); expect(a.binding.localPlayerId).not.toBe(b.binding.localPlayerId);
  const ids = new Set(a.operations.map(o => o.operationId));
  expect(a.operations.every(o => o.dependencies.every(d => ids.has(d.operationId ?? d)))).toBe(true);
  expect(a.operations.every(o => o.canonicalEnvelope.includes(a.binding.localPlayerId))).toBe(true);
  expect(() => syntheticOperations(11)).toThrow(); expect(() => syntheticOperations(0)).toThrow();
});

it('SR07 only loopback URLs are accepted by the scenario, and the source contains no remote destination, password or environment read', async () => {
  const stack = await integrationStack();
  for (const url of ['http://example.com:3000', 'https://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:3000/x'])
    await expect(runSyntheticScenario({ url, bundle: stack.bundle, executionId: 'a'.repeat(32), notAfter: iso(nowMs + 1000), now: () => nowMs })).rejects.toThrow('synthetic_url_rejected');
  const source = fs.readFileSync(path.join(backendRoot, 'src', 'integration', 'synthetic-run.js'), 'utf8');
  expect(source).not.toMatch(/process\.env|\.env\b|mongodb\+srv|two_sides_db|twosides_backend|deleteMany\s*\(\s*\{\s*\}/);
});

it('SR08 a synthetic execution id is single-use: once its manifest exists the same authorization is refused, before any credential or connection', async () => {
  const double = integrationDouble();
  const first = await run(double); expect(first.result.syntheticResult.success).toBe(true);
  const again = integrationDouble();
  await expect(main({ argv: ['--enable-integration', '--authorization', first.file, '--synthetic-run'], stdin: pipeWith(frame('pw-z')), now: () => nowMs, loadMongoose: async () => fakeMongoose(again) }))
    .rejects.toMatchObject({ code: 'authorization_consumed' });
  expect(again.connects).toBe(0);
  // The generator writes the real contract, outside the repository, valid for exactly 60 minutes, with no secret and no extension.
  const { spawnSync } = await import('node:child_process');
  const out = spawnSync(process.execPath, [path.join(backendRoot, 'scripts', 'new-integration-authorization.js'), path.join(temp, 'issued')], { encoding: 'utf8' });
  expect(out.status).toBe(0); const info = JSON.parse(out.stdout);
  expect(Date.parse(info.notAfter) - Date.parse(info.notBefore)).toBe(3_600_000); expect(info.allowCollectionPreparation).toBe(false);
  expect(Object.keys(JSON.parse(fs.readFileSync(info.file, 'utf8'))).sort()).toEqual(['allowCollectionPreparation', 'database', 'executionId', 'host', 'kind', 'maxSyntheticPlayers', 'notAfter', 'notBefore', 'schemaVersion', 'user']);
  const inside = spawnSync(process.execPath, [path.join(backendRoot, 'scripts', 'new-integration-authorization.js'), path.join(backendRoot, '.work', 'x')], { encoding: 'utf8' });
  expect(inside.status).toBe(1); expect(fs.existsSync(path.join(backendRoot, '.work', 'x'))).toBe(false);
});
