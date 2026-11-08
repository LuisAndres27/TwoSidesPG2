import './support/isolation-guard.js';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runPreflight } from '../../scripts/main-preflight.js';
import { createManifestFile, computeManifest, digestOfFiles } from '../../scripts/backend-integrity.js';
import { inspectMainSigningKey } from '../../src/main/signing-key.js';

// B16, offline: the pre-start integrity guard. Fictional keys and trees are created in temporary directories; nothing connects, no password is requested, .env is never opened.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), projectRoot = path.resolve(backendRoot, '..');
const launcher = path.join(backendRoot, 'scripts/run-main-backend.ps1'), preflight = path.join(backendRoot, 'scripts/main-preflight.js');
const temps = [];
afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const temp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-b16-')); temps.push(d); return d; };
const put = (root, relative, content = 'x') => { const f = path.join(root, relative); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); return f; };
const strip = text => text.split(/\r?\n/).filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#')).join('\n');
const pem = (bits = 3072) => generateKeyPairSync('rsa', { modulusLength: bits }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const win = process.platform === 'win32' ? it : it.skip;
const ps = args => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcher, ...args], { encoding: 'utf8', timeout: 60000, stdin: 'ignore', input: '' });

async function fixture() {
  const root = temp(); put(root, 'src/app.js', 'a'); put(root, 'scripts/run.js', 'b'); put(root, 'package.json', '{}'); put(root, 'node_modules/dep/index.js', 'c');
  const keyFile = put(temp(), 'main-jwt.pem', pem()), manifest = path.join(temp(), 'backend-integrity-manifest.json');
  const created = createManifestFile(manifest, root), { fingerprint } = await inspectMainSigningKey(keyFile, 'main-2026-11');
  return { root, keyFile, manifest, args: { manifest, anchor: created.treeDigest, keyFile, keyId: 'main-2026-11', expectedKeyId: 'main-2026-11', keyFingerprint: fingerprint } };
}

it('PG01 a valid manifest anchored outside the tree, the pinned key id and the recorded key fingerprint pass every check', async () => {
  const f = await fixture(), result = await runPreflight(f.args, f.root);
  expect(result).toEqual({ ok: true, checks: [{ check: 'key_id', ok: true }, { check: 'anchors', ok: true }, { check: 'key', ok: true }, { check: 'key_fingerprint', ok: true }, { check: 'manifest', ok: true }] });
});

it('PG02 altered code, an added file in node_modules or a removed script stop the start', async () => {
  const f = await fixture();
  put(f.root, 'src/app.js', 'tampered'); expect(await runPreflight(f.args, f.root)).toMatchObject({ ok: false, reason: 'integrity_tree_differs', counts: { modified: 1, added: 0, removed: 0 } });
  put(f.root, 'src/app.js', 'a'); put(f.root, 'node_modules/dep/evil.js', 'e'); expect(await runPreflight(f.args, f.root)).toMatchObject({ reason: 'integrity_tree_differs', counts: { added: 1 } });
  fs.rmSync(path.join(f.root, 'node_modules/dep/evil.js')); fs.rmSync(path.join(f.root, 'scripts/run.js')); expect(await runPreflight(f.args, f.root)).toMatchObject({ reason: 'integrity_tree_differs', counts: { removed: 1 } });
  put(f.root, 'scripts/run.js', 'b'); expect((await runPreflight(f.args, f.root)).ok).toBe(true);
});

it('PG03 a manifest is never trusted by itself: edited entries, a manifest rewritten to match altered code, a manifest of another tree and missing anchors are all refused', async () => {
  const f = await fixture(), original = fs.readFileSync(f.manifest, 'utf8');
  const edited = JSON.parse(original); edited.files['src/app.js'].sha256 = '0'.repeat(64); fs.writeFileSync(f.manifest, JSON.stringify(edited));
  expect(await runPreflight(f.args, f.root)).toMatchObject({ ok: false, reason: 'integrity_manifest_invalid' });                 // entries no longer produce the claimed digest
  // an attacker who can write code AND the manifest: rewrites both consistently; only the externally recorded anchor exposes it
  put(f.root, 'src/app.js', 'malicious'); const forged = computeManifest(f.root); fs.writeFileSync(f.manifest, JSON.stringify(forged));
  expect(forged.treeDigest).toBe(digestOfFiles(forged.files));
  expect(await runPreflight(f.args, f.root)).toMatchObject({ ok: false, reason: 'integrity_anchor_mismatch' });
  const other = temp(); put(other, 'src/x.js', 'other'); const foreign = path.join(temp(), 'm.json'); createManifestFile(foreign, other);
  expect(await runPreflight({ ...f.args, manifest: foreign }, f.root)).toMatchObject({ ok: false, reason: 'integrity_anchor_mismatch' });
  for (const anchor of [undefined, '', 'abc', 'G'.repeat(64), f.args.anchor.toUpperCase()]) expect(await runPreflight({ ...f.args, anchor }, f.root), String(anchor)).toMatchObject({ ok: false, reason: 'anchors_required' });
  expect(await runPreflight({ ...f.args, keyFingerprint: undefined }, f.root)).toMatchObject({ ok: false, reason: 'anchors_required' });
  fs.writeFileSync(f.manifest, '{broken'); expect((await runPreflight(f.args, f.root)).reason).toBe('integrity_manifest_unreadable');
  expect((await runPreflight({ ...f.args, manifest: path.join(projectRoot, 'm.json') }, f.root)).reason).toBe('manifest_location_rejected');   // inside the project: not accepted as provenance
});

it('PG04 a wrong, weak, malformed or re-identified JWT key stops the start without leaking key material or paths', async () => {
  const f = await fixture(), sentinel = 'SENTINEL-' + randomUUID(), dir = temp();
  const results = {
    otherKey: await runPreflight({ ...f.args, keyFile: put(dir, 'other.pem', pem()) }, f.root), wrongId: await runPreflight({ ...f.args, keyId: 'main-2026-12' }, f.root),
    badId: await runPreflight({ ...f.args, keyId: 'bad id', expectedKeyId: 'bad id' }, f.root), weak: await runPreflight({ ...f.args, keyFile: put(dir, 'weak.pem', pem(2048)) }, f.root),
    junk: await runPreflight({ ...f.args, keyFile: put(dir, 'junk.pem', sentinel) }, f.root), absent: await runPreflight({ ...f.args, keyFile: path.join(dir, 'absent.pem') }, f.root),
    inProject: await runPreflight({ ...f.args, keyFile: path.join(backendRoot, 'k.pem') }, f.root),
  };
  expect(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.reason]))).toEqual({ otherKey: 'key_fingerprint_mismatch', wrongId: 'key_id_mismatch', badId: 'key_id_invalid', weak: 'key_too_small', junk: 'key_rejected', absent: 'key_rejected', inProject: 'key_rejected' });
  for (const r of Object.values(results)) { expect(r.ok).toBe(false); expect(JSON.stringify(r)).not.toMatch(new RegExp(sentinel + '|BEGIN|MII|two-sides-b16|\\.pem')); }
});

it('PG05 the command line fails closed with exit 1 and fixed codes, passes on the real backend tree with temporary fixtures, and prints no secret', async () => {
  const keyFile = put(temp(), 'main-jwt.pem', pem()), manifest = path.join(temp(), 'backend-integrity-manifest.json'), { fingerprint } = await inspectMainSigningKey(keyFile, 'main-2026-11');
  const created = createManifestFile(manifest);                                                                               // the real tree, a temporary manifest
  const argv = (o = {}) => { const a = { '--manifest': manifest, '--anchor': created.treeDigest, '--key-file': keyFile, '--key-id': 'main-2026-11', '--expected-key-id': 'main-2026-11', '--key-fingerprint': fingerprint, ...o }; return Object.entries(a).flat(); };
  const run = args => spawnSync(process.execPath, [preflight, ...args], { encoding: 'utf8', env: {} });
  const ok = run(argv()); expect(ok.status, ok.stderr).toBe(0); expect(JSON.parse(ok.stdout)).toMatchObject({ mainPreflight: 'ok' });
  const bad = run(argv({ '--anchor': '1'.repeat(64) })); expect(bad.status).toBe(1); expect(JSON.parse(bad.stderr)).toMatchObject({ mainPreflight: 'failed', reason: 'integrity_anchor_mismatch' });
  expect(run(argv({ '--key-fingerprint': '2'.repeat(64) })).status).toBe(1);
  for (const args of [[], argv().slice(2), [...argv(), '--extra', 'x'], argv({ '--bogus': 'x' })]) expect(run(args).status).toBe(1);
  expect(ok.stdout + ok.stderr + bad.stdout + bad.stderr).not.toMatch(/BEGIN|MII|PRIVATE|password/i);
}, 90000);   // hashes the real tree in 6 child processes: ~5 s alone, give it headroom under load

it('PG06 in the launcher the guard runs before the password prompt, before the child process and before any connection; it needs the anchors and fixed protected locations', () => {
  const text = fs.readFileSync(launcher, 'utf8'), code = strip(text);
  const at = s => code.indexOf(s);
  expect(at('main-preflight.js')).toBeGreaterThan(0); expect(at('main-preflight.js')).toBeLessThan(at('Read-Host')); expect(at('Read-Host')).toBeLessThan(at('[Diagnostics.Process]::Start($info)'));
  expect(at('Get-SecretsAclFailures')).toBeLessThan(at('Read-Host'));
  for (const needle of ['$IntegrityManifest', '$ExpectedTreeDigest', '$ExpectedKeyFingerprint', "$ExpectedKeyId='main-2026-11'", 'TwoSidesMainSecrets', 'TwoSidesMainIntegrity', 'backend-integrity-manifest.json', "keys\\main-jwt.pem", 'is not at the protected location', 'not conforming']) expect(code, needle).toContain(needle);
  expect(code).toMatch(/\^\[0-9a-f\]\{64\}\$/);
  expect(code).not.toMatch(/mongodb|MONGODB_URI|\bgit\b|Invoke-WebRequest|Test-NetConnection/i); expect(code).not.toMatch(/Get-Content|ReadAllText|dotenv/);   // the launcher only REJECTS .env paths; it never reads one
  expect(code).not.toMatch(/Set-Acl|icacls|Remove-Item|New-Item|Set-Content|Out-File/);
  const pre = strip(fs.readFileSync(preflight, 'utf8')); expect(pre).not.toMatch(/process\.env|mongoose|MongoClient|node:(net|http|https|dns|tls)|fetch\(|spawn|child_process|writeFile|openSync|\.env\b/);
});

win('PG07 the real launcher stops at every failed guard condition WITHOUT prompting for a password (no prompt text, no child process, no connection)', () => {
  const real = path.join(process.env.LOCALAPPDATA, 'TwoSidesMainSecrets', 'keys', 'main-jwt.pem'), tmpKey = put(temp(), 'k.pem', pem());
  const digest = 'a'.repeat(64), base = ['-EnableMain', '-KeyId', 'main-2026-11'];
  const cases = [
    ['no anchors', [...base, '-SigningKeyFile', real, '-IntegrityManifest', 'C:\\x\\m.json'], /all required/],
    ['bad digest', [...base, '-SigningKeyFile', real, '-IntegrityManifest', 'C:\\x\\m.json', '-ExpectedTreeDigest', 'ZZ', '-ExpectedKeyFingerprint', digest], /all required/],
    ['key not at protected location', [...base, '-SigningKeyFile', tmpKey, '-IntegrityManifest', 'C:\\x\\m.json', '-ExpectedTreeDigest', digest, '-ExpectedKeyFingerprint', digest], /not at the protected location/],
    ['manifest not at protected location', [...base, '-SigningKeyFile', real, '-IntegrityManifest', path.join(os.tmpdir(), 'm.json'), '-ExpectedTreeDigest', digest, '-ExpectedKeyFingerprint', digest], /manifest is not at the protected location/],
    ['key id differs from pin', ['-EnableMain', '-KeyId', 'main-2030-01', '-SigningKeyFile', real, '-IntegrityManifest', path.join(process.env.LOCALAPPDATA, 'TwoSidesMainIntegrity', 'backend-integrity-manifest.json'), '-ExpectedTreeDigest', digest, '-ExpectedKeyFingerprint', digest], /pinned id/],
  ];
  for (const [name, args, message] of cases) {
    const r = ps(args); expect(r.status, name + ' ' + r.stderr).toBe(1);
    const output = r.stdout + r.stderr; expect(output, name).toMatch(/Integrity guard failed/); expect(output, name).toMatch(message);
    expect(output, name).not.toMatch(/Main database password|hidden input|BEGIN|MII|PRIVATE/i);
  }
});

win('PG08 the mandatory guard preserves disabled-by-default startup, and the old transport test source anchor is intact', () => {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', launcher], { encoding: 'utf8', timeout: 30000 });
  expect(r.status).toBe(1); expect(r.stdout + r.stderr).not.toContain('Main database password');
  expect(fs.readFileSync(launcher, 'utf8')).toContain('$bstr=[IntPtr]::Zero');                                                  // main-credential-channel.test.js slices the launcher from here
});
