import './support/isolation-guard.js';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeManifest, createManifestFile, verifyManifestFile, digestOfFiles, VITEST_TEMPORARY_PATHS } from '../../scripts/backend-integrity.js';
import { runPreflight } from '../../scripts/main-preflight.js';
import { inspectMainSigningKey, SIGNING_KEY_FILE_LIMIT } from '../../src/main/signing-key.js';

// B20, offline: the baseline excludes ONLY the Vitest cache directories, still detects every real change, stays compatible with older manifests, and the ACL checker applies the
// 32 KiB limit to key material only. Fictional trees in temporary directories; the real node_modules is only read.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), scripts = path.join(backendRoot, 'scripts');
const temps = [];
afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const temp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-b20-')); temps.push(d); return d; };
const put = (root, relative, content = 'x') => { const f = path.join(root, relative); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); return f; };
const win = process.platform === 'win32' ? it : it.skip;
function tree() {
  const root = temp();
  for (const [f, c] of [['src/app.js', 'a'], ['scripts/run.js', 'b'], ['package.json', '{}'], ['package-lock.json', '{}'], ['vitest.config.js', 'cfg'], ['node_modules/dep/index.js', 'c'], ['node_modules/dep/package.json', '{}'],
    ['node_modules/.vite/vitest/abc/results.json', 'r1'], ['node_modules/.vite/vitest/CACHEDIR.TAG', 'tag'], ['node_modules/.vitest-cache/0123abcd', '__vi-cache-1']]) put(root, f, c);
  const manifest = path.join(temp(), 'backend-integrity-manifest.json');
  return { root, manifest, created: createManifestFile(manifest, root) };
}

it('BL01 changes, additions and removals inside node_modules/.vite and node_modules/.vitest-cache do not invalidate the baseline, and those paths are not inventoried', () => {
  const { root, manifest, created } = tree();
  expect(created.ok).toBe(true); const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  expect(m).toMatchObject({ formatVersion: 2, excluded: ['node_modules/.vite', 'node_modules/.vitest-cache'], fileCount: 7 });
  expect(Object.keys(m.files).sort()).toEqual(['node_modules/dep/index.js', 'node_modules/dep/package.json', 'package-lock.json', 'package.json', 'scripts/run.js', 'src/app.js', 'vitest.config.js']);
  expect(verifyManifestFile(manifest, root).ok).toBe(true);
  put(root, 'node_modules/.vite/vitest/abc/results.json', 'results changed by a test run'); put(root, 'node_modules/.vite/vitest/def/results.json', 'new run'); put(root, 'node_modules/.vitest-cache/ffee0011', 'new cache entry');
  fs.rmSync(path.join(root, 'node_modules/.vitest-cache/0123abcd')); fs.rmSync(path.join(root, 'node_modules/.vite/vitest/CACHEDIR.TAG'));
  expect(verifyManifestFile(manifest, root)).toMatchObject({ ok: true, counts: { added: 0, removed: 0, modified: 0, problems: 0 } });
  fs.rmSync(path.join(root, 'node_modules/.vite'), { recursive: true }); fs.rmSync(path.join(root, 'node_modules/.vitest-cache'), { recursive: true });
  expect(verifyManifestFile(manifest, root).ok).toBe(true);                                                   // even when the caches disappear entirely
});

it('BL02 every real change is still detected: src, scripts, package files, vitest.config.js, real dependencies, look-alike cache names and nested .vite folders', () => {
  const { root, manifest } = tree();
  const detect = (mutate, restore, expectKey, name) => { mutate(); const r = verifyManifestFile(manifest, root); expect(r.ok, name).toBe(false); expect(r.reason).toBe('tree_differs'); expect(r[expectKey].length, name).toBeGreaterThan(0); restore(); expect(verifyManifestFile(manifest, root).ok, name + ' restored').toBe(true); };
  const original = { 'src/app.js': 'a', 'scripts/run.js': 'b', 'package.json': '{}', 'package-lock.json': '{}', 'vitest.config.js': 'cfg', 'node_modules/dep/index.js': 'c', 'node_modules/dep/package.json': '{}' };
  for (const file of Object.keys(original)) detect(() => put(root, file, 'tampered'), () => put(root, file, original[file]), 'modified', 'modify ' + file);
  for (const file of ['src/new.js', 'scripts/new.ps1', 'node_modules/evil/index.js', 'node_modules/.vite-other/x.js', 'node_modules/.vitest-cache-evil/x.js', 'node_modules/dep/.vite/x.js', 'src/.vite/x.js', 'scripts/.vitest-cache/x.js', 'node_modules/.vitest/x.js', 'node_modules/.bin/evil.cmd'])
    detect(() => put(root, file, 'planted'), () => fs.rmSync(path.join(root, file)), 'added', 'add ' + file);
  detect(() => fs.rmSync(path.join(root, 'node_modules/dep/index.js')), () => put(root, 'node_modules/dep/index.js', 'c'), 'removed', 'remove dependency file');
  detect(() => fs.rmSync(path.join(root, 'scripts/run.js')), () => put(root, 'scripts/run.js', 'b'), 'removed', 'remove script');
  try { fs.symlinkSync(path.join(root, 'package.json'), path.join(root, 'node_modules/.vite/link.js')); expect(verifyManifestFile(manifest, root).ok).toBe(true); fs.rmSync(path.join(root, 'node_modules/.vite/link.js')); } catch (e) { if (e.code !== 'EPERM') throw e; }   // inside the excluded cache even links are ignored
  try { fs.symlinkSync(path.join(root, 'package.json'), path.join(root, 'node_modules/dep/link.js')); expect(verifyManifestFile(manifest, root)).toMatchObject({ ok: false, counts: { problems: 1 } }); } catch (e) { if (e.code !== 'EPERM') throw e; }   // elsewhere a link is a problem
});

it('BL03 older manifests keep their meaning and a manifest cannot widen the exclusions', () => {
  const { root, manifest } = tree(), v2 = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const write = (m, name) => { const f = path.join(temp(), name); fs.writeFileSync(f, JSON.stringify(m)); return f; };
  // pre-B20 manifest: no `excluded`, inventories the cache files, verified exactly as written
  const old = computeManifest(root, { exclude: [] }); delete old.excluded; delete old.formatVersion; const oldFile = write(old, 'old.json');
  expect(old.fileCount).toBe(10); expect(verifyManifestFile(oldFile, root).ok).toBe(true);
  put(root, 'node_modules/.vite/vitest/abc/results.json', 'changed'); expect(verifyManifestFile(oldFile, root)).toMatchObject({ ok: false, counts: { modified: 1 } });   // the historical behaviour (the B17 failure)
  expect(verifyManifestFile(manifest, root).ok).toBe(true);                                                                                                                  // the new baseline ignores it
  const widened = { ...v2, excluded: [...v2.excluded, 'src'] }; expect(verifyManifestFile(write(widened, 'w1.json'), root)).toEqual({ ok: false, reason: 'manifest_invalid' });
  for (const bad of [['node_modules'], ['node_modules/.vite/vitest'], ['scripts'], ['node_modules/dep'], [''], 'node_modules/.vite', 7, [null]]) expect(verifyManifestFile(write({ ...v2, excluded: bad }, 'w2.json'), root), JSON.stringify(bad)).toEqual({ ok: false, reason: 'manifest_invalid' });
  const files = { ...v2.files, 'node_modules/.vite/vitest/abc/results.json': { sha256: '0'.repeat(64), size: 1 } }; // lists a file under a declared exclusion
  expect(verifyManifestFile(write({ ...v2, files, treeDigest: digestOfFiles(files) }, 'w3.json'), root)).toEqual({ ok: false, reason: 'manifest_invalid' });
  const narrower = { ...v2, excluded: ['node_modules/.vite'] };                                                               // declaring fewer exclusions is allowed and stricter
  expect(verifyManifestFile(write(narrower, 'n.json'), root)).toMatchObject({ ok: false, counts: { added: 1 } });             // .vitest-cache is now inventoried-by-absence => reported as added
  expect(VITEST_TEMPORARY_PATHS).toEqual(['node_modules/.vite', 'node_modules/.vitest-cache']); expect(Object.isFrozen(VITEST_TEMPORARY_PATHS)).toBe(true);
});

it('BL04 on the real backend tree the inventory excludes only the Vitest caches and keeps every other dependency, src, scripts and package files; the anchor logic is unchanged', async () => {
  const real = computeManifest(), names = Object.keys(real.files);
  expect(names.filter(n => /^node_modules\/\.vite(\/|$)|^node_modules\/\.vitest-cache(\/|$)/.test(n))).toEqual([]);
  expect(names.filter(n => n.startsWith('node_modules/')).length).toBeGreaterThan(3000); expect(names.filter(n => n.startsWith('src/')).length).toBeGreaterThan(50); expect(names.filter(n => n.startsWith('scripts/')).length).toBeGreaterThan(30);
  for (const must of ['package.json', 'package-lock.json', 'vitest.config.js', 'src/main/runtime.js', 'src/main/signing-key.js', 'scripts/run-main-backend.ps1', 'scripts/backend-integrity.js', 'scripts/main-preflight.js', 'node_modules/jose/package.json']) expect(names, must).toContain(must);
  expect(real.problems).toEqual([]);
  // preflight with a v2 manifest: Vitest churn never blocks the start, a real change still does
  const { root, manifest, created } = tree(), keyFile = put(temp(), 'main-jwt.pem', generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const args = { manifest, anchor: created.treeDigest, keyFile, keyId: 'main-2026-11', expectedKeyId: 'main-2026-11', keyFingerprint: (await inspectMainSigningKey(keyFile, 'main-2026-11')).fingerprint };
  put(root, 'node_modules/.vitest-cache/aaaa', 'churn'); expect((await runPreflight(args, root)).ok).toBe(true);
  put(root, 'src/app.js', 'tampered'); expect(await runPreflight(args, root)).toMatchObject({ ok: false, reason: 'integrity_tree_differs' });
}, 60000);

win('BL05 the ACL checker applies the 32 KiB limit to key material only (keys\\ and .pem/.key), and the loader limit is unchanged', () => {
  expect(SIGNING_KEY_FILE_LIMIT).toBe(32768);
  const dir = temp(); put(dir, 'backend-integrity-manifest.json', 'm'.repeat(600 * 1024)); put(dir, 'notes.txt', 'n'.repeat(40000));
  put(dir, 'keys/main-jwt.pem', 'k'.repeat(32768)); put(dir, 'keys/big-in-keys.bin', 'k'.repeat(32769)); put(dir, 'keys/ok.json', 'k'.repeat(10)); put(dir, 'other/stray.pem', 'k'.repeat(32769)); put(dir, 'other/stray.key', 'k'.repeat(40000)); put(dir, 'other/small.pem', 'k');
  const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(scripts, 'check-main-secrets-acl.ps1'), '-Directory', dir], { encoding: 'utf8' });
  const report = JSON.parse(run.stdout), big = Object.fromEntries(report.items.filter(i => i.kind === 'file').map(i => [i.path, [].concat(i.failures).includes('key_file_too_large')]));
  expect(big).toEqual({ 'backend-integrity-manifest.json': false, 'notes.txt': false, 'keys\\main-jwt.pem': false, 'keys\\big-in-keys.bin': true, 'keys\\ok.json': false, 'other\\stray.pem': true, 'other\\stray.key': true, 'other\\small.pem': false });
  const text = fs.readFileSync(path.join(scripts, 'check-main-secrets-acl.ps1'), 'utf8'); expect(text).toContain('32768'); expect(text).toMatch(/keys\\\*/);
});
