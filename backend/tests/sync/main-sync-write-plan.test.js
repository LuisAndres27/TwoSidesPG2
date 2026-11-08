import './support/isolation-guard.js';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateOperation } from '../../src/modules/sync/schemas.js';

// B29: the synthetic write test is only PREPARED. These tests are offline: no network, no Atlas, no server.
const backend = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tpl = name => fs.readFileSync(path.join(backend, 'docs', 'main-sync-test', name), 'utf8');
const temps = [];
afterEach(() => { for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

it('SW01 the builder produces ONE operation the real backend validator accepts, with random v4 ids and no secret', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-sw01-')); temps.push(root);
  const script = path.join(root, 'build.mjs'), out = path.join(root, 'out');
  fs.writeFileSync(script, tpl('build-synthetic-run.mjs.template'));
  const text = execFileSync(process.execPath, [script, backend, out], { encoding: 'utf8', env: {} });
  expect(JSON.parse(text)).toMatchObject({ built: true, validatedByBackendSchema: true, type: 'session.report' });
  expect(fs.readdirSync(out).sort()).toEqual(['batch.json', 'receipts-query.json', 'run-ids.json']);
  const batch = JSON.parse(fs.readFileSync(path.join(out, 'batch.json'), 'utf8')), ids = JSON.parse(fs.readFileSync(path.join(out, 'run-ids.json'), 'utf8'));
  expect(batch.operations).toHaveLength(1);
  const checked = validateOperation(batch.operations[0]);
  expect(checked.envelope.type).toBe('session.report');
  expect(checked.envelope.installationId).toBe(ids.installationId);
  expect(checked.dependencies ?? []).toEqual([]);
  for (const k of ['registrationId', 'installationId', 'localPlayerId', 'sessionId', 'operationId', 'leaseId', 'batchId', 'runId']) expect(ids[k]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(Object.keys(ids).some(k => /secret|password|credential|token|privateKey|apiKey/i.test(k))).toBe(false);
  // a second build never reuses an identifier, and refuses a non-empty folder
  expect(() => execFileSync(process.execPath, [script, backend, out], { encoding: 'utf8', env: {}, stdio: 'pipe' })).toThrow();
  const out2 = path.join(root, 'out2');
  execFileSync(process.execPath, [script, backend, out2], { encoding: 'utf8', env: {} });
  expect(JSON.parse(fs.readFileSync(path.join(out2, 'run-ids.json'), 'utf8')).operationId).not.toBe(ids.operationId);
});

it('SW02 the builder refuses an output folder inside the project', () => {
  const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ts-sw02-')), 'build.mjs'); temps.push(path.dirname(script));
  fs.writeFileSync(script, tpl('build-synthetic-run.mjs.template'));
  expect(() => execFileSync(process.execPath, [script, backend, path.join(backend, '..', 'zz-should-not-exist')], { encoding: 'utf8', env: {}, stdio: 'pipe' })).toThrow();
  expect(fs.existsSync(path.join(backend, '..', 'zz-should-not-exist'))).toBe(false);
});

it('SW03 the send template needs an explicit confirmation, targets only the local HTTPS proxy, never bypasses TLS and never prints the credential or the token', () => {
  const text = tpl('sync-test.ps1.template'), body = text.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
  expect(body).toMatch(/\[switch\]\$ConfirmSyntheticWrites/);
  expect(body).toMatch(/\$base = 'https:\/\/localhost:8443'/);
  expect(body).not.toMatch(/SkipCertificateCheck|ServerCertificateValidationCallback|ServerCertificateCustomValidationCallback|-k\b|--insecure|ignore.?cert|CertificatePolicy|http:\/\//i);
  const paths = [...body.matchAll(/Send '(?:GET|POST)' '([^']+)'/g)].map(m => m[1]).sort();
  expect([...new Set(paths)]).toEqual(['/api/health', '/api/v2/sync/batches', '/api/v2/sync/receipts/query', '/api/v2/technical/me', '/api/v2/technical/registrations', '/api/v2/technical/sessions']);
  expect(body).not.toMatch(/'DELETE'|'PUT'|'PATCH'|Remove-Item|\.env/);
  // printed lines, ignoring arguments passed to Send(...) (only its .Status is printed)
  const printed = body.split('\n').filter(l => /^\s*'/.test(l) || /Write-(Host|Output)/.test(l)).map(l => l.replace(/\(Send [^)]*\)/g, '(Send)')).join('\n');
  expect(printed).not.toMatch(/\$credential|\$token|accessToken|Bearer/);
});

it('SW05 the Json helper returns ONE Byte[] (not an unrolled Object[]) whose bytes are exactly the compact JSON, parseable, and a body built from it is real JSON (regression of the B30 HTTP 400)', () => {
  const src = tpl('sync-test.ps1.template'), fn = /^function Json\(\$o\) \{.*\}.*$/m.exec(src);
  expect(fn).not.toBeNull();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-sw05-')); temps.push(root);
  const ps1 = path.join(root, 'json-check.ps1');
  fs.writeFileSync(ps1, [fn[0],
    "$o = @{ schemaVersion = 2; registrationId = '00000000-0000-4000-8000-000000000000'; credential = 'abc_-xyz'; bindingGeneration = 1 }",
    "$v = Json $o", "$expected = [Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Compress -Depth 8))",
    "[pscustomobject]@{ type = $v.GetType().FullName; length = $v.Length; same = [bool](-not (Compare-Object $v $expected)); b64 = [Convert]::ToBase64String($v) } | ConvertTo-Json -Compress"].join('\n'));
  const out = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot, windir: process.env.windir, PATH: process.env.PATH } }));
  expect(out.type).toBe('System.Byte[]');
  expect(out.same).toBe(true);
  const text = Buffer.from(out.b64, 'base64').toString('utf8');
  const parsed = JSON.parse(text);   // real JSON, not "123 34 115 ..."
  expect(parsed).toMatchObject({ schemaVersion: 2, registrationId: '00000000-0000-4000-8000-000000000000', bindingGeneration: 1 });
  expect(text).not.toMatch(/^\d+ \d+ /);
});

it('SW04 the sync batch is sent byte for byte (no re-serialization of the canonical envelope)', () => {
  const body = tpl('sync-test.ps1.template');
  expect(body).toMatch(/ReadAllBytes\(\(Join-Path \$RunDir 'batch\.json'\)\)/);
  expect(body).not.toMatch(/ConvertTo-Json[^\n]*\$batch/);
});
