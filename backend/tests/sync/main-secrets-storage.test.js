import './support/isolation-guard.js';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveSecretsLayout, launcherArguments, SECRETS_DIRECTORY_NAME } from '../../src/main/secrets-layout.js';
import { assertSigningKeyPath, loadMainSigningKey } from '../../src/main/signing-key.js';
import { readMainEnvironment } from '../../src/config/env.js';

// B12, offline: the proposed private secrets location, its ACL policy and the guarantees around it. Nothing here creates the real folder, a real key, touches an ACL or reads .env.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), scripts = path.join(backendRoot, 'scripts');
const temps = [];
afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); vi.restoreAllMocks(); });
const strip = text => text.split('\n').filter(l => !l.trim().startsWith('#') && !l.trim().startsWith('//')).join('\n');
const read = (...p) => fs.readFileSync(path.join(backendRoot, ...p), 'utf8');
const win = process.platform === 'win32' ? it : it.skip;
const powershell = args => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot, windir: process.env.windir, PATH: process.env.PATH, LOCALAPPDATA: process.env.LOCALAPPDATA } });

it('SS01 the proposed layout lives under the per-user local profile, outside the project and OneDrive, and is accepted by the existing loader policy', () => {
  const layout = resolveSecretsLayout('C:\\Users\\luis2\\AppData\\Local');
  expect(layout.directory).toBe('C:\\Users\\luis2\\AppData\\Local\\' + SECRETS_DIRECTORY_NAME);
  expect(layout.keyFile).toBe(layout.directory + '\\keys\\main-jwt.pem'); expect(layout.configFile).toBe(layout.directory + '\\main-config.json');
  if (process.platform === 'win32') expect(() => assertSigningKeyPath(layout.keyFile)).not.toThrow();      // the unchanged loader policy admits it
  expect(launcherArguments(layout, 'main-2026-11')).toEqual({ SigningKeyFile: layout.keyFile, KeyId: 'main-2026-11' });
  for (const bad of [undefined, '', 'relative', 'C:\\Users\\luis2\\OneDrive', 'C:\\Users\\luis2\\OneDrive\\AppData\\Local', 'C:\\ProgramData', 'C:\\Users\\luis2\\Documents',
    'C:\\Users\\luis2\\AppData\\Roaming', 'D:\\Temp', 'C:\\Users\\a b\\AppData\\Local"x', 'C:\\Users\\luis2\\AppData\\Local\\..\\Roaming'])
    expect(() => resolveSecretsLayout(bad), String(bad)).toThrow(/Main backend unavailable/);
  expect(() => launcherArguments(layout, 'bad id')).toThrow();
  const src = strip(read('src/main/secrets-layout.js')); expect(src).not.toMatch(/process\.env|readFile|writeFile|fs\b|mkdir|spawn|\.env\b/);
});

it('SS02 the unchanged loader reads a real key stored in a TwoSidesMainSecrets\\keys layout; every existing requirement still applies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-ss-')); temps.push(root);
  const keys = path.join(root, SECRETS_DIRECTORY_NAME, 'keys'); fs.mkdirSync(keys, { recursive: true });
  const file = path.join(keys, 'main-jwt.pem'); fs.writeFileSync(file, generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  await expect(loadMainSigningKey(file, 'main-2026-11')).resolves.toMatchObject({ mode: 'main', keyId: 'main-2026-11' });
  fs.writeFileSync(path.join(keys, 'weak.pem'), generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  await expect(loadMainSigningKey(path.join(keys, 'weak.pem'), 'main-2026-11')).rejects.toMatchObject({ code: 'main_signing_key_rejected' });
  await expect(loadMainSigningKey(path.join(keys, 'absent.pem'), 'main-2026-11')).rejects.toMatchObject({ code: 'main_signing_key_rejected' });
  const env = { TWOSIDES_PROFILE: 'main', MAIN_ENABLE: 'true', PORT: '3000', MAIN_JWT_PRIVATE_KEY_FILE: file, MAIN_JWT_KEY_ID: 'main-2026-11' };
  expect(readMainEnvironment(env)).toMatchObject({ keyFile: file, keyId: 'main-2026-11', host: '127.0.0.1' });
  const extra = { ...env, MONGODB_URI: 'mongodb+srv://x', MAIN_DB_PASSWORD: 'x' }; expect(Object.keys(readMainEnvironment(extra))).not.toEqual(expect.arrayContaining(['password', 'uri']));   // no password/URI variable exists in the contract
});

win('SS03 the ACL policy accepts only user + SYSTEM + Administrators with inheritance disabled; every deviation is reported (in-memory descriptors, no disk, no ACL change)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-ss-')); temps.push(dir);
  const harness = path.join(dir, 'harness.ps1'), lib = path.join(scripts, 'main-secrets-acl-lib.ps1').replace(/'/g, "''");
  fs.writeFileSync(harness, `$ErrorActionPreference='Stop'; . '${lib}'
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User; $sys=New-Object Security.Principal.SecurityIdentifier 'S-1-5-18'; $adm=New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544'; $users=New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-545'; $all=New-Object Security.Principal.SecurityIdentifier 'S-1-1-0'
function Rule($sid,$rights='FullControl',$type='Allow'){ New-Object Security.AccessControl.FileSystemAccessRule($sid,[Security.AccessControl.FileSystemRights]$rights,[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[Security.AccessControl.PropagationFlags]'None',[Security.AccessControl.AccessControlType]$type) }
function Build($sids,$protect=$true,$owner=$me,$extra=@()){ $s=New-Object Security.AccessControl.DirectorySecurity; $s.SetOwner($owner); $s.SetAccessRuleProtection($protect,$false); foreach($x in $sids){$s.AddAccessRule((Rule $x))}; foreach($r in $extra){$s.AddAccessRule($r)}; $s }
$cases=[ordered]@{
 good=(Build @($me,$sys,$adm)); inherited=(Build @($me,$sys,$adm) $false); extraUsers=(Build @($me,$sys,$adm,$users)); everyone=(Build @($me,$sys,$adm,$all));
 missingSystem=(Build @($me,$adm)); missingUser=(Build @($sys,$adm)); readOnlyAdmin=(Build @($me,$sys) $true $me @((Rule $adm 'ReadAndExecute')));
 deny=(Build @($me,$sys,$adm) $true $me @((Rule $users 'Write' 'Deny'))); otherOwner=(Build @($me,$sys,$adm) $true $all) }
$out=[ordered]@{}; foreach($k in $cases.Keys){ $out[$k]=@(Get-SecretsAclFailures -Security $cases[$k] -UserSid $me) }
$out | ConvertTo-Json -Compress`);
  const run = powershell(['-File', harness]); expect(run.status, run.stderr).toBe(0);
  const out = JSON.parse(run.stdout), codes = key => [].concat(out[key]).sort();
  expect(codes('good')).toEqual([]);
  expect(codes('inherited')).toEqual(['inheritance_enabled']);
  expect(codes('extraUsers')).toEqual(['unexpected_identity']); expect(codes('everyone')).toEqual(['unexpected_identity']);
  expect(codes('missingSystem')).toEqual(['missing_identity']); expect(codes('missingUser')).toEqual(['missing_identity']);
  expect(codes('readOnlyAdmin')).toEqual(['not_full_control']); expect(codes('deny')).toEqual(['deny_rule_present']);
  expect(codes('otherOwner')).toEqual(['unexpected_owner']);
});

win('SS04 the checker is read-only: it reports absence (exit 2), flags an unprotected folder without opening its files, and prints no file contents', () => {
  const absent = powershell(['-File', path.join(scripts, 'check-main-secrets-acl.ps1'), '-Directory', path.join(os.tmpdir(), 'two-sides-absent-' + process.pid)]);
  expect(absent.status).toBe(2); expect(JSON.parse(absent.stdout).mainSecretsAcl).toBe('absent');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-ss-')); temps.push(dir);
  const secret = 'SENTINEL-NEVER-PRINT-' + process.pid; fs.mkdirSync(path.join(dir, 'keys')); fs.writeFileSync(path.join(dir, 'keys', 'main-jwt.pem'), secret);
  const before = fs.readdirSync(path.join(dir, 'keys')).map(n => [n, fs.statSync(path.join(dir, 'keys', n)).mtimeMs]);
  const checked = powershell(['-File', path.join(scripts, 'check-main-secrets-acl.ps1'), '-Directory', dir]);
  expect(checked.status).toBe(1); const report = JSON.parse(checked.stdout);
  expect(report).toMatchObject({ mainSecretsAcl: 'checked', verdict: 'not_conforming' }); expect([].concat(report.directoryFailures)).toContain('inheritance_enabled');   // a default temp folder inherits ACEs
  expect(report.items.map(i => i.path)).toEqual(['keys', 'keys\\main-jwt.pem']); expect(report.items[1].bytes).toBe(secret.length);
  expect(checked.stdout + checked.stderr).not.toContain(secret);                                    // contents never printed
  expect(fs.readdirSync(path.join(dir, 'keys')).map(n => [n, fs.statSync(path.join(dir, 'keys', n)).mtimeMs])).toEqual(before);   // nothing changed
  for (const bad of [path.join(backendRoot, '..', 'x'), 'C:\\Users\\luis2\\OneDrive\\x', 'relative']) expect(powershell(['-File', path.join(scripts, 'check-main-secrets-acl.ps1'), '-Directory', bad]).status, bad).toBe(1);
});

it('SS05 source locks: the checker and policy never read contents or change ACLs/owners/files; the folder-creation commands are documentation only', () => {
  for (const name of ['check-main-secrets-acl.ps1', 'main-secrets-acl-lib.ps1']) {
    const text = strip(read('scripts', name));
    expect(text, name).not.toMatch(/Get-Content|ReadAll|\bgc\b|Set-Acl|SetAccessControl|SetOwner\(\$\w+\)\s*;?\s*Set|icacls|takeown|New-Item|Remove-Item|Set-Content|Out-File|Copy-Item|Move-Item|\.Write|StreamReader|Invoke-WebRequest|mongodb|Start-Process/i);
  }
  expect(strip(read('scripts', 'check-main-secrets-acl.ps1'))).toMatch(/projectRoot|OneDrive/);
});

it('SS06 .env is not part of any profile: no code reads it, main takes no password or URI variable, and local secret backups are ignored by git', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const code = [...walk(path.join(backendRoot, 'src')), ...walk(scripts)].filter(f => /\.(js|ps1)$/.test(f));
  const offenders = code.filter(f => /from 'dotenv'|require\('dotenv'\)|import\('dotenv'\)|loadEnvFile|--env-file|readFile(Sync)?\([^)]*\.env\b|Get-Content[^\n]*\.env\b/.test(strip(fs.readFileSync(f, 'utf8'))));
  expect(offenders.map(f => path.relative(backendRoot, f))).toEqual([]);
  expect(JSON.parse(read('package.json')).dependencies).not.toHaveProperty('dotenv');
  expect(read('.gitignore')).toMatch(/^\.env$/m); expect(read('.gitignore')).toMatch(/^Respaldo_ENV\/$/m); expect(read('.gitignore')).toMatch(/^\*\.pem$/m);
  expect(strip(read('src/config/env.js'))).not.toMatch(/PASSWORD|MONGODB_URI|URI/);
  const server = read('src/server.js'); expect(server).toMatch(/\[\$\{error\.code\}\]/); expect(server).toMatch(/\^main_\[a-z_\]\{1,40\}\$/);   // only fixed main_* codes are printed
});

it('SS07 the integration and offline profiles do not depend on the secrets folder, the new modules or any key file', () => {
  for (const f of ['src/integration/profile.js', 'src/integration/launcher.js', 'src/config/database.js', 'src/composition/backend.js', 'src/app.js'])
    expect(read(f), f).not.toMatch(/secrets-layout|TwoSidesMainSecrets|main-secrets/);
  expect(read('scripts/run-integration-backend.ps1')).not.toMatch(/TwoSidesMainSecrets/);
});
