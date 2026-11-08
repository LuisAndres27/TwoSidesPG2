import './support/isolation-guard.js';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeManifest, createManifestFile, verifyManifestFile } from '../../scripts/backend-integrity.js';
import { scanText, scanName, scanDirectory } from '../../scripts/scan-secrets.js';

// B15, offline: integrity baseline and secret-scanning controls. Fictional secrets are assembled at run time in temporary directories; nothing real is read, and .env is never opened.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), projectRoot = path.resolve(backendRoot, '..');
const temps = [];
afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const temp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-b15-')); temps.push(d); return d; };
const put = (root, relative, content = 'x') => { const f = path.join(root, relative); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); return f; };
const strip = text => text.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
const fakeRoot = () => { const r = temp(); put(r, 'src/app.js', 'a'); put(r, 'scripts/run.js', 'b'); put(r, 'package.json', '{}'); put(r, 'package-lock.json', '{}'); put(r, 'node_modules/dep/index.js', 'c');
  put(r, 'tests/t.test.js', 'ignored'); put(r, 'docs/d.md', 'ignored'); put(r, '.env', 'NEVER-READ'); return r; };

it('IG01 the manifest covers exactly the executed code, detects changes, and never overwrites or reads out-of-scope files such as .env', () => {
  const root = fakeRoot(), manifest = path.join(temp(), 'backend-integrity-manifest.json');
  const created = createManifestFile(manifest, root); expect(created).toMatchObject({ ok: true, fileCount: 5 }); expect(created.treeDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(Object.keys(computeManifest(root).files)).toEqual(['node_modules/dep/index.js', 'package-lock.json', 'package.json', 'scripts/run.js', 'src/app.js']);   // no tests, docs or .env
  expect(verifyManifestFile(manifest, root)).toMatchObject({ ok: true, counts: { added: 0, removed: 0, modified: 0, problems: 0 } });
  expect(createManifestFile(manifest, root)).toEqual({ ok: false, reason: 'file_exists_or_unwritable' });                    // exclusive create
  put(root, '.env', 'changed'); put(root, 'docs/new.md'); put(root, 'tests/more.test.js'); expect(verifyManifestFile(manifest, root).ok).toBe(true);   // out of scope: no effect
  put(root, 'src/app.js', 'tampered'); let r = verifyManifestFile(manifest, root); expect(r).toMatchObject({ ok: false, reason: 'tree_differs', modified: ['src/app.js'] });
  put(root, 'src/app.js', 'a'); put(root, 'node_modules/dep/evil.js', 'e'); r = verifyManifestFile(manifest, root); expect(r.added).toEqual(['node_modules/dep/evil.js']);
  fs.rmSync(path.join(root, 'node_modules/dep/evil.js')); fs.rmSync(path.join(root, 'scripts/run.js')); r = verifyManifestFile(manifest, root); expect(r.removed).toEqual(['scripts/run.js']);
  put(root, 'scripts/run.js', 'b'); expect(verifyManifestFile(manifest, root).ok).toBe(true);                                // restored => identical again
  const many = temp(); put(many, 'package.json', '{}'); for (let i = 0; i < 30; i++) put(many, `src/f${i}.js`, String(i));
  const m2 = path.join(temp(), 'm.json'); createManifestFile(m2, many); for (let i = 0; i < 30; i++) put(many, `src/f${i}.js`, 'x' + i); expect(verifyManifestFile(m2, many).modified).toHaveLength(20);   // output is bounded
  expect(JSON.stringify(verifyManifestFile(m2, many))).not.toContain('tampered');                                           // names and counts only, never contents
});

it('IG02 manifest location, validity and links: outside the project and OneDrive, no env names, no links, unreadable or foreign manifests fail closed', () => {
  const root = fakeRoot();
  for (const bad of [path.join(projectRoot, 'm.json'), path.join(backendRoot, 'm.json'), 'C:\\Users\\x\\OneDrive\\m.json', 'relative.json', path.join(temp(), '.env')])
    expect(() => createManifestFile(bad, root), bad).toThrow(/Main backend unavailable/);
  const dir = temp(), missing = path.join(dir, 'absent.json'); expect(verifyManifestFile(missing, root)).toEqual({ ok: false, reason: 'manifest_unreadable' });
  const foreign = put(dir, 'foreign.json', JSON.stringify({ kind: 'other', files: {} })); expect(verifyManifestFile(foreign, root)).toEqual({ ok: false, reason: 'manifest_invalid' });
  put(dir, 'junk.json', '{not json'); expect(verifyManifestFile(path.join(dir, 'junk.json'), root).reason).toBe('manifest_unreadable');
  try { fs.symlinkSync(path.join(root, 'package.json'), path.join(root, 'src/link.js')); expect(createManifestFile(path.join(dir, 'l.json'), root)).toMatchObject({ ok: false, reason: 'links_or_special_files' }); }
  catch (e) { if (e.code !== 'EPERM') throw e; }
});

it('IG03 the command line round-trips on the real backend tree with a temporary manifest and prints only counts, digests and names', () => {
  const manifest = path.join(temp(), 'backend-integrity-manifest.json'), script = path.join(backendRoot, 'scripts/backend-integrity.js');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const created = run('manifest', manifest); expect(created.status, created.stderr).toBe(0); const info = JSON.parse(created.stdout);
  expect(info).toMatchObject({ backendIntegrity: 'ok' }); expect(info.fileCount).toBeGreaterThan(500); expect(info.treeDigest).toMatch(/^[0-9a-f]{64}$/);
  const verified = run('verify', manifest); expect(verified.status).toBe(0); expect(JSON.parse(verified.stdout)).toMatchObject({ backendIntegrity: 'ok', counts: { added: 0, removed: 0, modified: 0, problems: 0 } });
  expect(run('manifest', manifest).status).toBe(1);                                                                           // never overwrites
  for (const args of [[], ['verify'], ['remove', manifest], ['verify', manifest, 'extra'], ['verify', 'relative.json']]) expect(run(...args).status, args.join(' ')).toBe(1);
  expect(created.stdout + created.stderr).not.toMatch(/BEGIN|PRIVATE|password/i);
});

it('SC01 the scanner finds private-key blocks, URIs with passwords, JWT-like tokens and generated credentials, ignores readable test sentinels, and reports kinds only', () => {
  const digits = '4829173650', block = '-----BEGIN ' + 'PRIVATE KEY-----\n' + 'QUJD'.repeat(20) + '\n-----END ' + 'PRIVATE KEY-----';
  const uri = 'mongodb+srv://svc_user:' + 'Zq' + digits + 'kLm@cluster.example.invalid/db', jwt = ['eyJ' + 'a'.repeat(20), 'eyJ' + 'b'.repeat(20), 'c'.repeat(30)].join('.');
  const kinds = text => scanText('f.txt', text).map(f => f.kind);
  expect(kinds(block)).toEqual(['private_key_block']); expect(kinds(uri)).toEqual(['uri_with_password']); expect(kinds(jwt)).toEqual(['jwt_like_token']);
  const assign = (name, value) => `${name} = "${value}";`;                                                              // assembled at run time so this file never contains such a literal
  expect(kinds(assign('const pass' + 'word', 'Xy' + digits + 'Qw'))).toEqual(['password_assignment']); expect(kinds(assign('"tok' + 'en"','Ab' + digits + 'Cd'))).toEqual(['password_assignment']);
  for (const harmless of ['const password = "wrong-password";', "const secret = 'SENTINEL-NEVER-PRINT-'", 'mongodb+srv://user:FAKE-pass1234@host/db', 'mongodb://127.0.0.1:27017', 'password = process.env.X', 'const hash = "$argon2id$v=19$m=65536"', 'token: "<token>"', '-----BEGIN PRIVATE KEY-----', 'const password = "short1"'])
    expect(kinds(harmless), harmless).toEqual([]);
  const found = scanText('f.txt', uri + '\n' + block); expect(found).toEqual([{ file: 'f.txt', line: 1, kind: 'uri_with_password' }, { file: 'f.txt', line: 2, kind: 'private_key_block' }]);
  expect(JSON.stringify(found)).not.toContain(digits);                                                                        // matched text is never part of a finding
  for (const name of ['backend/.env', 'x/.env.local', 'main-jwt.pem', 'a/b.key', 'c.pfx', 'd.p12', 'main-authorization-1234.json', 'backend-integrity-manifest.json', 'saves/game.sqlite', 'x.db', 'x.sqlite-wal']) expect(scanName(name).length, name).toBe(1);
  for (const name of ['backend/.env.example', 'src/app.js', 'scripts/PlayerOso.cs', 'docs/guide.md', 'integration/sqlite/Microsoft.Data.Sqlite.dll']) expect(scanName(name), name).toEqual([]);
});

it('SC02 the directory scan lists only what Git would track or stage: ignored .env is never listed or opened; SQLite databases are recognised by header', () => {
  const root = temp(); expect(git(root, 'init', '-q').status).toBe(0); const leaked = 'mongodb+srv://u:' + 'Zq4829' + '1736kLm@h.example.invalid/db';
  put(root, '.gitignore', '.env\nignored/\n'); put(root, '.env', leaked);
  put(root, 'ignored/leak.txt', leaked); put(root, 'ok.js', 'export const x = 1;');
  put(root, 'config.js', 'export const uri = "mongodb+srv://svc:' + 'Zq4829' + '1736kLm@h.example.invalid/db";');
  put(root, 'game.bin', Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(64)]));
  put(root, 'notes.txt', '-----BEGIN ' + 'PRIVATE KEY-----\n' + 'QUJD'.repeat(20));
  const findings = scanDirectory(root).map(f => `${f.file}:${f.kind}`).sort();
  expect(findings).toEqual(['config.js:uri_with_password', 'game.bin:sqlite_database_content', 'notes.txt:private_key_block']);   // nothing from .env or ignored/
  const cli = spawnSync(process.execPath, [path.join(backendRoot, 'scripts/scan-secrets.js'), root], { encoding: 'utf8' });
  expect(cli.status).toBe(1); expect(cli.stdout).toBe('config.js:1:uri_with_password\ngame.bin:0:sqlite_database_content\nnotes.txt:1:private_key_block\n'); expect(cli.stdout + cli.stderr).not.toContain('48291736');
  expect(spawnSync(process.execPath, [path.join(backendRoot, 'scripts/scan-secrets.js'), temp()], { encoding: 'utf8' }).status).toBe(2);   // not a git repository: fails closed
});

it('SC03 the real .gitignore files exclude every sensitive class and nothing tracked is affected', () => {
  const ignored = ['.env', 'backend/.env', 'backend/.env.local', 'backend/.env.production', 'x/k.pem', 'main-jwt.pem', 'a.key', 'b.pfx', 'c.p12', 'saves/game.sqlite', 'saves/game.sqlite-wal', 'x.db',
    'main-authorization-123.json', 'main-inspection-authorization-1.json', 'backend-integrity-manifest.json', 'Respaldo_ENV/a.txt', 'backend/Respaldo_ENV/a.txt', 'secrets/a', 'TwoSidesMainSecrets/keys/main-jwt.pem', 'a.secret', 'a.bak', 'backend/node_modules/x/index.js'];
  const kept = ['backend/.env.example', 'backend/src/main/runtime.js', 'backend/scripts/scan-secrets.js', 'scripts/PlayerOso.cs', 'backend/docs/B15_B00_CREDENTIALS_AND_INTEGRITY_PREPARATION.md', 'project.godot'];
  for (const p of ignored) expect(git(projectRoot, 'check-ignore', '-q', p).status, p + ' should be ignored').toBe(0);
  for (const p of kept) expect(git(projectRoot, 'check-ignore', '-q', p).status, p + ' should NOT be ignored').toBe(1);
  expect(git(projectRoot, 'ls-files', '-ci', '--exclude-standard').stdout.trim()).toBe('');                                  // no tracked file is caught by the new patterns
});

it('SC04 the tools are read-only over secrets: no .env access, no network, no output of matched text, one exclusive write (the manifest)', () => {
  const integrity = strip(fs.readFileSync(path.join(backendRoot, 'scripts/backend-integrity.js'), 'utf8')), scanner = strip(fs.readFileSync(path.join(backendRoot, 'scripts/scan-secrets.js'), 'utf8'));
  for (const [name, text] of [['integrity', integrity], ['scanner', scanner]]) expect(text, name).not.toMatch(/process\.env|dotenv|fetch\(|https?:\/\/|node:(net|http|https|dns|tls)|mongoose|MongoClient|unlink|rmSync|rename|chmod|icacls|execSync|child_process\.exec/);
  expect(integrity.match(/writeSync|writeFile/g)).toEqual(['writeSync']); expect(integrity).toContain("'wx', 0o600"); expect(scanner).not.toMatch(/writeFile|writeSync|openSync\([^)]*'w/);
  expect(scanner.match(/console\.(log|error)\(/g)).toHaveLength(3);
  expect(scanner).toMatch(/--exclude-standard/);
});
