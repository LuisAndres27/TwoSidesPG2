import './support/isolation-guard.js';
import { afterAll, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// B33: the Atlas latency probe is only PREPARED. Offline: fake clock and fake database, no network, no Atlas.
const backend = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tpl = name => fs.readFileSync(path.join(backend, 'docs', 'main-sync-test', name), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-lt-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
fs.writeFileSync(path.join(dir, 'probe.mjs'), tpl('probe-atlas-latency.mjs.template'));
const lib = await import(pathToFileURL(path.join(dir, 'probe.mjs')).href);

it('LT01 statistics: min, median (even count = mean of the two middle values), nearest-rank p95, max, mean; failed samples are excluded', () => {
  const s = lib.summarize(Array.from({ length: 30 }, (_, i) => i + 1));            // 1..30
  expect(s).toEqual({ count: 30, min: 1, median: 15.5, p95: 29, max: 30, mean: 15.5 });
  expect(lib.summarize([5, null, 1, 3])).toMatchObject({ count: 3, min: 1, median: 3, max: 5 });
  expect(lib.summarize([])).toMatchObject({ count: 0, median: null, p95: null });
  expect(lib.summarize([7])).toMatchObject({ count: 1, min: 7, median: 7, p95: 7, max: 7 });
});

it('LT02 measureHello makes EXACTLY 30 sequential attempts, times each one, counts errors by fixed code and never stops early', async () => {
  let calls = 0, clock = 0;
  const now = () => clock;
  const hello = async () => { calls++; clock += calls % 10 === 0 ? 100 : 20; if (calls === 7) throw Object.assign(new Error('driver text must never be kept: password=secret'), { code: 'ETIMEDOUT' }); };
  const r = await lib.measureHello(hello, { now });
  expect(lib.HELLO_COUNT).toBe(30); expect(calls).toBe(30); expect(r.attempts).toBe(30); expect(r.samplesMs).toHaveLength(30);
  expect(r.errorCount).toBe(1); expect(r.errors).toEqual([{ index: 6, code: 'ETIMEDOUT' }]); expect(JSON.stringify(r)).not.toMatch(/password|secret|driver text/);
  expect(r.count).toBe(29); expect(r.min).toBe(20); expect(r.max).toBe(100);
});

it('LT03 the command door lets through ONLY {hello:1} and {connectionStatus:1,showPrivileges:true} and counts them', async () => {
  const sent = []; const db = { command: async c => { sent.push(c); return { ok: 1 }; } };
  const g = lib.guardedCommand(db);
  await g.run({ hello: 1 }); await g.run({ connectionStatus: 1, showPrivileges: true });
  for (const bad of [{ ping: 1 }, { insert: 'x', documents: [] }, { hello: 1, saslSupportedMechs: 'admin.u' }, { connectionStatus: 1 }, { listCollections: 1 }, { drop: 'x' }, { find: 'users' }, { hello: 2 }, {}, null])
    await expect(g.run(bad)).rejects.toThrow('command_not_allowed');
  expect(sent).toEqual([{ hello: 1 }, { connectionStatus: 1, showPrivileges: true }]); expect(g.sent).toEqual({ hello: 1, connectionStatus: 1 });
});

it('LT04 the probe code has no write, no collection access, no transaction, no HTTP, no TLS bypass and no secret handling beyond the shared stdin channel', () => {
  const body = tpl('probe-atlas-latency.mjs.template').split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
  expect(body).not.toMatch(/insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite|findOneAnd|\.drop\(|createIndex|createCollection|aggregate|\$set|\$inc|startSession|withTransaction|\.collection\(|listCollections|fetch\(|node:https?['"]|process\.env|console\.log\(/);
  expect(body).not.toMatch(/rejectUnauthorized:\s*false|tlsAllowInvalid\w*:\s*true|tlsInsecure|checkServerIdentity/);
  expect(body).toMatch(/rejectUnauthorized: true/); expect(body).toMatch(/tlsAllowInvalidCertificates: false/); expect(body).toMatch(/HELLO_COUNT = 30/);
  expect([...body.matchAll(/db\.run\(\{\s*([A-Za-z]+)/g)].map(m => m[1]).sort()).toEqual(['connectionStatus', 'hello']);
  expect(body).toMatch(/--enable-latency-probe/);
});

it('LT05 the runner and the launcher refuse to start without the flag / with a terminal stdin / with relative or foreign arguments; the launcher keeps the password out of arguments', async () => {
  const out = { write() {} }, stdin = { isTTY: false, on() {}, once() {}, removeListener() {} };
  await expect(lib.main([], stdin, out)).rejects.toMatchObject({ code: 'not_enabled' });
  const base = ['--enable-latency-probe', '--authorization', path.join(dir, 'a.json'), '--backend', backend];
  await expect(lib.main(base, { ...stdin, isTTY: true }, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
  await expect(lib.main([...base, '--extra', 'x'], stdin, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
  await expect(lib.main(base.map(x => x === backend ? 'relative' : x), stdin, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
  const ps = tpl('run-probe-latency.ps1.template').split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
  expect(ps).toMatch(/\[switch\]\$Enable/); expect(ps).toMatch(/Read-Host -Prompt [^\n]*-AsSecureString/); expect(ps).toMatch(/Environment\.Clear\(\)/);
  expect(ps).not.toMatch(/\$info\.Arguments[^\n]*\$(secure|chars|bytes|frame|pass)/i); expect(ps).not.toMatch(/SkipCertificateCheck|\.env/);
});
