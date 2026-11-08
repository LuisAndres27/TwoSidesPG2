import './support/isolation-guard.js';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SignJWT, decodeJwt } from 'jose';
import { JwtService } from '../../src/modules/auth/jwt-service.js';
import { CredentialHasher } from '../../src/modules/auth/credential-hasher.js';
import { generateCredential } from '../../src/modules/identity/identity.js';
import { RateLimiter } from '../../src/middleware/rate-limiter.js';
import { SyntheticIdentityRepository } from '../identity-persistence/support/synthetic-repository.js';
import { loadMainSigningKey, startMainBackend } from '../../src/main/runtime.js';
import { inspectMainSigningKey, assertSigningKeyPath } from '../../src/main/signing-key.js';
import { readMainEnvironment } from '../../src/config/env.js';
import { INTEGRATION_JWT, MAIN_JWT } from '../../src/config/jwt.js';
import { createIntegrationJwtConfig } from '../../src/integration/profile.js';

// B06, offline: the main JWT signing key is persistent, external and fail-closed. Only keys generated here, in temporary directories, are used. Nothing connects.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), projectRoot = path.resolve(backendRoot, '..');
const tool = path.join(backendRoot, 'scripts', 'main-signing-key.js');
const temps = [], hasher = new CredentialHasher(), T0 = Date.UTC(2026, 9, 31, 12);
afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); vi.restoreAllMocks(); });
const workDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-jwt-')); temps.push(d); return d; };
const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, windir: process.env.windir } });
const pem = (type = 'rsa', bits = 3072, encoding = { type: 'pkcs8', format: 'pem' }) => (type === 'rsa' ? generateKeyPairSync('rsa', { modulusLength: bits }) : generateKeyPairSync('ec', { namedCurve: 'P-256' })).privateKey.export(encoding);
const keyFile = (dir, content, name = 'main-jwt.pem') => { const f = path.join(dir, name); fs.writeFileSync(f, content, { mode: 0o600 }); return f; };

// A restart is a NEW JwtService built from a fresh load of the key file over the same (durable) repository.
async function boot(config, repository, now) { return new JwtService({ config, repository, hasher, limiter: new RateLimiter({ now }), now, version: 2 }); }
async function issue(file, keyId = 'main-key-1', now = () => T0) {
  const repository = new SyntheticIdentityRepository({ synthetic: true, now }), service = await boot(await loadMainSigningKey(file, keyId), repository, now);
  const input = { schemaVersion: 2, registrationId: randomUUID(), installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1, credential: generateCredential() };
  const id = (await service.register(input, 'test')).body.technicalAccountId, session = await service.session({ ...input, technicalAccountId: id }, 'test');
  return { repository, token: session.accessToken, id };
}
const rejects401 = promise => expect(promise).rejects.toMatchObject({ status: 401 });

it('JP01 the same key file verifies earlier tokens after a simulated restart; a created key is never overwritten', async () => {
  const dir = workDir(), file = path.join(dir, 'main-jwt.pem'), created = run('create', file, 'main-key-1');
  expect(created.status, created.stderr).toBe(0);
  const info = JSON.parse(created.stdout); expect(info).toMatchObject({ mainSigningKey: 'created', keyId: 'main-key-1', bits: 3072 }); expect(info.publicFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(created.stdout + created.stderr).not.toMatch(/PRIVATE|BEGIN|MII/);                         // the private key is never printed
  const before = fs.readFileSync(file), second = run('create', file, 'main-key-1');
  expect(second.status).toBe(1); expect(JSON.parse(second.stderr)).toEqual({ mainSigningKey: 'rejected', reason: 'file_exists_or_unwritable' }); expect(fs.readFileSync(file).equals(before)).toBe(true);
  const checked = JSON.parse(run('check', file, 'main-key-1').stdout); expect(checked.publicFingerprintSha256).toBe(info.publicFingerprintSha256);
  const { repository, token, id } = await issue(file);
  const restarted = await boot(await loadMainSigningKey(file, 'main-key-1'), repository, () => T0 + 60_000);
  await expect(restarted.authenticate(token)).resolves.toMatchObject({ id });                       // same key + durable session store: the old token still works
  expect(decodeJwt(token)).toMatchObject({ iss: MAIN_JWT.issuer, aud: MAIN_JWT.audience, ver: 2, sub: id });
});

it('JP02 a different key, or a different key id, cannot verify earlier tokens', async () => {
  const dir = workDir(), a = keyFile(dir, pem(), 'a.pem'), b = keyFile(dir, pem(), 'b.pem');
  const { repository, token } = await issue(a);
  await rejects401((await boot(await loadMainSigningKey(b, 'main-key-1'), repository, () => T0)).authenticate(token));      // other key material
  await rejects401((await boot(await loadMainSigningKey(a, 'main-key-2'), repository, () => T0)).authenticate(token));      // same key, other kid (rotation marker)
  expect((await inspectMainSigningKey(a, 'main-key-1')).fingerprint).not.toBe((await inspectMainSigningKey(b, 'main-key-1')).fingerprint);
});

it('JP03 expired, not-yet-valid, tampered, re-signed and alg-confused tokens are rejected; the lifetime stays fixed at 15 minutes', async () => {
  const dir = workDir(), file = keyFile(dir, pem()), { repository, token } = await issue(file), config = await loadMainSigningKey(file, 'main-key-1');
  const at = ms => boot(config, repository, () => T0 + ms);
  await expect((await at(899_000)).authenticate(token)).resolves.toBeTruthy();
  await rejects401((await at(900_000)).authenticate(token));                                       // exp reached
  await rejects401((await at(-60_000)).authenticate(token));                                       // before iat/nbf
  const [h, p, s] = token.split('.'), flip = value => value.slice(0, -2) + (value.at(-2) === 'A' ? 'B' : 'A') + value.at(-1);
  const service = await at(0);
  for (const bad of [[h, flip(p), s], [flip(h), p, s], [h, p, flip(s)], [h, p, ''], [h, p], ['', '', ''], 'not-a-token', `${Buffer.from('{"alg":"none","typ":"at+jwt"}').toString('base64url')}.${p}.`, 'x'.repeat(5000)].map(x => (Array.isArray(x) ? x.join('.') : x))) await rejects401(service.authenticate(bad));
  const claims = decodeJwt(token), outsider = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const resign = (extra = {}, key = config.privateKey, header = {}) => new SignJWT({ ...claims, ...extra }).setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'main-key-1', ...header }).sign(key);
  await rejects401(service.authenticate(await resign({}, outsider)));                              // signed with a key that is not ours
  await rejects401(service.authenticate(await resign({ exp: claims.exp + 3600 })));                // fixed lifetime enforced even for our own key
  await rejects401(service.authenticate(await resign({ ver: 1 })));                                // token version
  await rejects401(service.authenticate(await resign({ iss: INTEGRATION_JWT.issuer })));
  await rejects401(service.authenticate(await resign({ aud: INTEGRATION_JWT.audience })));
  await rejects401(service.authenticate(await resign({}, config.privateKey, { typ: 'JWT' })));
});

it('JP04 main cannot start without a valid persistent key: nothing reads the password or connects', async () => {
  const dir = workDir(), valid = keyFile(dir, pem());
  const attempts = {
    missing: () => loadMainSigningKey(path.join(dir, 'absent.pem'), 'main-key-1'), wrongKeyId: () => loadMainSigningKey(valid, 'bad key!'),
    throwing: async () => { throw new Error('SENTINEL-DRIVER-TEXT'); }, empty: async () => undefined, objectWithoutKeys: async () => ({ mode: 'main' }),
    integration: async () => ({ ...(await createIntegrationJwtConfig()) }),
  };
  for (const [name, signingKeyProvider] of Object.entries(attempts)) {
    const credentialProvider = vi.fn(), connector = vi.fn();
    const error = await startMainBackend({ config: { profile: 'main', port: 0 }, credentialProvider, signingKeyProvider, connector }).catch(e => e);
    expect(error, name).toMatchObject({ name: 'MainError', code: 'main_signing_key_rejected' });
    expect(credentialProvider, name).not.toHaveBeenCalled(); expect(connector, name).not.toHaveBeenCalled();
    expect(JSON.stringify(error) + error.message + error.stack.split('\n')[0], name).not.toMatch(/SENTINEL|absent\.pem|main-jwt/);
  }
  for (const env of [{}, { MAIN_JWT_KEY_ID: 'main-key-1' }, { MAIN_JWT_PRIVATE_KEY_FILE: valid }, { MAIN_JWT_PRIVATE_KEY_FILE: valid, MAIN_JWT_KEY_ID: 'a b' }])
    expect(() => readMainEnvironment({ TWOSIDES_PROFILE: 'main', MAIN_ENABLE: 'true', ...env }), JSON.stringify(Object.keys(env))).toThrow(/Main backend unavailable/);
});

it('JP05 the loader accepts only one unencrypted PKCS#8 RSA key of 2048-8192 bits outside the project, OneDrive and .env; failures reveal nothing', async () => {
  const dir = workDir(), secretText = 'SENTINEL-SECRET-' + randomUUID();
  const rsa = generateKeyPairSync('rsa', { modulusLength: 3072 }), good = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' });
  await expect(loadMainSigningKey(keyFile(dir, good, 'good.pem'), 'main-key-1')).resolves.toMatchObject({ mode: 'main', algorithm: 'RS256' });
  const variants = {
    public: rsa.publicKey.export({ type: 'spki', format: 'pem' }), pkcs1: rsa.privateKey.export({ type: 'pkcs1', format: 'pem' }),
    encrypted: rsa.privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: secretText }), ec: pem('ec'), weak: pem('rsa', 1024),
    twoBlocks: good + good, trailingGarbage: good + secretText, text: secretText, empty: '', oversize: good + '\n'.repeat(40000),
  };
  for (const [name, content] of Object.entries(variants)) {
    const error = await loadMainSigningKey(keyFile(dir, content, name + '.pem'), 'main-key-1').catch(e => e);
    expect(error, name).toMatchObject({ name: 'MainError', code: 'main_signing_key_rejected' });
    expect(JSON.stringify(error) + error.message + error.stack, name).not.toMatch(new RegExp(secretText + '|' + name + '\\.pem|MII|BEGIN'));
  }
  const link = path.join(dir, 'link.pem'); try { fs.symlinkSync(path.join(dir, 'good.pem'), link); await expect(loadMainSigningKey(link, 'main-key-1')).rejects.toMatchObject({ code: 'main_signing_key_rejected' }); } catch (e) { if (e.code !== 'EPERM') throw e; }
  await expect(loadMainSigningKey(dir, 'main-key-1')).rejects.toMatchObject({ code: 'main_signing_key_rejected' });          // a directory
  for (const bad of [path.join(projectRoot, 'x.pem'), path.join(backendRoot, '.env'), path.join(backendRoot, 'keys', 'a.pem'), 'relative.pem', '', 'C:\\Users\\someone\\OneDrive\\Desktop\\main.pem', 'C:\\Users\\someone\\OneDrive - Org\\k.pem', path.join(dir, '.env'), path.join(dir, '.env.main'), 'C:\\k\\a"b.pem'])
    expect(() => assertSigningKeyPath(bad), bad).toThrow(/Main backend unavailable/);
  if (process.platform !== 'win32') { fs.chmodSync(path.join(dir, 'good.pem'), 0o644); await expect(loadMainSigningKey(path.join(dir, 'good.pem'), 'main-key-1')).rejects.toBeTruthy(); }
});

it('JP06 provisioning tool and loader hold their guarantees in the source: no default key, no env, no repository path, exclusive create, no secret printing', () => {
  const strip = text => text.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const loader = strip(fs.readFileSync(path.join(backendRoot, 'src/main/signing-key.js'), 'utf8')), runtime = strip(fs.readFileSync(path.join(backendRoot, 'src/main/runtime.js'), 'utf8')), script = strip(fs.readFileSync(tool, 'utf8'));
  expect(loader).not.toMatch(/generateKeyPair|process\.env|writeFile|dotenv|console\./); expect(runtime).not.toMatch(/generateKeyPair|writeFile|BEGIN/);
  expect(script).toMatch(/'wx', 0o600/); expect(script).not.toMatch(/process\.env|console\.(log|error)\([^)]*privateKey|\.unlink|rmSync|writeFileSync|renameSync|fetch|http|mongo/i);
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => ['node_modules', '.work', 'coverage'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const leaks = walk(backendRoot).filter(f => !/\.env$/.test(f) && /\.(js|md|json|ps1|txt|pem|key)$/.test(f) && /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----\s*[A-Za-z0-9+/]{40,}/.test(fs.readFileSync(f, 'utf8')));
  expect(leaks).toEqual([]);                                                                       // no key material anywhere under backend/ (.env is deliberately not opened)
  expect(run('create', path.join(projectRoot, 'k.pem'), 'main-key-1').status).toBe(1);               // the tool refuses repository paths too
  expect(run('create', path.join(workDir(), 'k.pem'), 'bad id').status).toBe(1);
  expect(run('check', path.join(workDir(), 'missing.pem'), 'main-key-1').status).toBe(1);
  expect(run('remove', path.join(workDir(), 'k.pem'), 'main-key-1').status).toBe(1);
});

it('JP07 the realms stay separate: tokens never cross between main, integration and isolated tests, and offline/integration configs do not need a key file', async () => {
  const dir = workDir(), file = keyFile(dir, pem()), { repository, token } = await issue(file), shared = await loadMainSigningKey(file, 'main-key-1');
  const integration = await createIntegrationJwtConfig();
  expect(integration).toMatchObject({ mode: 'integration-test', issuer: INTEGRATION_JWT.issuer }); expect(integration.keyId).toBe('integration-ephemeral');
  await expect(startMainBackend({ config: { profile: 'main', port: 0 }, credentialProvider: vi.fn(), connector: vi.fn(), signingKeyProvider: async () => integration })).rejects.toMatchObject({ code: 'main_signing_key_rejected' });
  const foreign = await boot({ ...integration, publicKey: shared.publicKey, privateKey: shared.privateKey, keyId: 'main-key-1' }, repository, () => T0);
  await rejects401(foreign.authenticate(token));                                                  // same key material, other realm: issuer/audience refuse it
  expect(fs.readFileSync(path.join(backendRoot, 'src/integration/profile.js'), 'utf8')).not.toMatch(/signing-key|MAIN_JWT_/);
  expect(fs.readFileSync(path.join(backendRoot, 'src/main/signing-key.js'), 'utf8')).not.toMatch(/integration/i);
});
