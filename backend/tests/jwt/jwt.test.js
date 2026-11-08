import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair, SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { once } from 'node:events';
import { request } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createApp } from '../../src/app.js';
import { MemoryRepository } from '../../src/modules/auth/memory-repository.js';
import { CredentialHasher } from '../../src/modules/auth/credential-hasher.js';
import { generateCredential } from '../../src/modules/identity/identity.js';
import { validateJwtConfig, assertNotProduction } from '../../src/config/jwt.js';
import { RATE_POLICY } from '../../src/middleware/rate-limiter.js';

let pair, otherPair, verifier;
const servers = [];
const credential = generateCredential();
const hasher = new CredentialHasher();
beforeAll(async () => {
  pair = await generateKeyPair('RS256', { modulusLength: 2048 });
  otherPair = await generateKeyPair('RS256', { modulusLength: 2048 });
  verifier = await hasher.hash(credential);
});
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});
const config = () => ({ ...pair, mode: 'isolated-test', algorithm: 'RS256',
  issuer: 'https://two-sides.test.invalid', audience: 'two-sides-isolated-api', keyId: 'fixture-key' });

async function fixture({ role = 'player', policy = RATE_POLICY } = {}) {
  let time = Date.UTC(2026, 9, 27, 12);
  const now = () => time;
  const repository = new MemoryRepository({ now, includeInternalEmail: false, allowSyntheticFixtures: true });
  const id = randomUUID(); repository.seedSyntheticAccount(id, verifier, role);
  const server = createApp({ jwt: config(), jwtRepository: repository, now, policy }).listen(0, '127.0.0.1');
  servers.push(server); await once(server, 'listening');
  const send = (method, route, body, token) => new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port: server.address().port, method, path: route, agent: false,
      headers: { ...(text === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) }),
        ...(token === undefined ? {} : { Authorization: 'Bearer ' + token }) } }, response => {
      let data = ''; response.setEncoding('utf8'); response.on('data', chunk => { data += chunk; });
      response.on('end', () => { try { resolve({ status: response.statusCode, body: JSON.parse(data), text: data }); } catch { reject(new Error('Invalid isolated response')); } });
      response.on('error', reject);
    });
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('Local test timeout'))); req.end(text);
  });
  const login = () => send('POST', '/api/v1/technical/sessions', { schemaVersion: 1, technicalAccountId: id, credential });
  const session = await login();
  if (session.status !== 200) throw new Error('Synthetic session creation failed');
  const token = session.body.accessToken;
  async function forged(changes = {}, header = {}, key = pair.privateKey) {
    const payload = { ...decodeJwt(token), ...changes };
    for (const [k, value] of Object.entries(payload)) if (value === undefined) delete payload[k];
    return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: 'fixture-key', ...header }).sign(key);
  }
  return { id, repository, now, token, send, login, forged, advance: ms => { time += ms; } };
}
async function unauthorized(f, token, route = '/api/v1/technical/me') {
  const response = await f.send('GET', route, undefined, token);
  expect(response.status).toBe(401);
  expect(response.body.error.code).toBe('authentication_required');
  if (response.text.includes(credential) || (token && response.text.includes(token)) || /stack|jwt|signature|argon|verifier/i.test(response.text))
    throw new Error('Sensitive detail in auth rejection');
}

describe('isolated JWT and roles', () => {
  it('registers stable synthetic identity with no email or role input', async () => {
    const f = await fixture(); const body = { schemaVersion: 1, registrationId: randomUUID(), credential: generateCredential() };
    const a = await f.send('POST', '/api/v1/technical/registrations', body);
    const b = await f.send('POST', '/api/v1/technical/registrations', body);
    expect(a.status).toBe(201); expect(b.status).toBe(200);
    expect(a.body.technicalAccountId).toBe(b.body.technicalAccountId);
    expect(Object.keys(a.body).sort()).toEqual(['registrationId', 'registrationStatus', 'schemaVersion', 'technicalAccountId']);
    expect(f.repository.findAccount(a.body.technicalAccountId).role).toBe('player');
    expect(f.repository.findAccount(a.body.technicalAccountId).internalEmail).toBeUndefined();
  });
  it('retains Argon2id hash, positive verification and negative verification', async () => {
    expect(verifier.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(verifier, credential)).toBe(true);
    expect(await hasher.verify(verifier, generateCredential())).toBe(false);
  });
  it('rejects incorrect credentials without leaking their value', async () => {
    const f = await fixture();
    const response = await f.send('POST', '/api/v1/technical/sessions', { schemaVersion: 1, technicalAccountId: f.id, credential: generateCredential() });
    expect(response.status).toBe(401); expect(response.text.includes(credential)).toBe(false);
  });
  it('issues signed RS256 access JWT with the complete profile', async () => {
    const f = await fixture(); const p = decodeJwt(f.token), h = decodeProtectedHeader(f.token);
    expect(h).toEqual({ alg: 'RS256', typ: 'at+jwt', kid: 'fixture-key' });
    expect(p.iss).toBe(config().issuer); expect(p.aud).toBe(config().audience); expect(p.sub).toBe(f.id);
    expect(p.exp - p.iat).toBe(900); expect(p.nbf).toBe(p.iat); expect(p.role).toBe('player');
    expect(typeof p.jti).toBe('string'); expect(p.cv).toBe(1);
    expect((await f.send('GET', '/api/v1/technical/me', undefined, f.token)).status).toBe(200);
  });
  it('grants a player its own resource', async () => {
    const f = await fixture(); expect((await f.send('GET', '/api/v1/players/' + f.id, undefined, f.token)).status).toBe(200);
  });
  it('forbids another player identity even with a valid token', async () => {
    const f = await fixture(); const other = randomUUID(); f.repository.seedSyntheticAccount(other, verifier, 'player');
    const otherSession = await f.send('POST', '/api/v1/technical/sessions', { schemaVersion: 1, technicalAccountId: other, credential });
    expect(otherSession.status).toBe(200);
    expect((await f.send('GET', '/api/v1/players/' + other, undefined, f.token)).status).toBe(403);
    expect((await f.send('GET', '/api/v1/players/' + f.id, undefined, otherSession.body.accessToken)).status).toBe(403);
  });
  it('forbids player access to admin', async () => {
    const f = await fixture(); expect((await f.send('GET', '/api/v1/admin/status', undefined, f.token)).status).toBe(403);
  });
  it('admits only the server-seeded synthetic admin and limits its route class', async () => {
    const f = await fixture({ role: 'admin' });
    expect((await f.send('GET', '/api/v1/admin/status', undefined, f.token)).status).toBe(200);
    expect((await f.send('GET', '/api/v1/players/' + f.id, undefined, f.token)).status).toBe(403);
  });
  for (const field of ['role', 'admin', 'scope', 'displayName', 'email']) {
    it('rejects registration privilege/identity extra field ' + field, async () => {
      const f = await fixture();
      const response = await f.send('POST', '/api/v1/technical/registrations', { schemaVersion: 1, registrationId: randomUUID(), credential: generateCredential(), [field]: 'admin' });
      expect(response.status).toBe(400);
    });
  }
  it('does not accept a role on session requests', async () => {
    const f = await fixture(); expect((await f.send('POST', '/api/v1/technical/sessions', { schemaVersion: 1, technicalAccountId: f.id, credential, role: 'admin' })).status).toBe(400);
  });
  it('rejects missing and malformed tokens', async () => {
    const f = await fixture(); await unauthorized(f, undefined); await unauthorized(f, 'invalid');
  });
  it('rejects an unsigned token', async () => {
    const f = await fixture(); const parts = f.token.split('.');
    await unauthorized(f, Buffer.from(JSON.stringify({ alg: 'none', typ: 'at+jwt' })).toString('base64url') + '.' + parts[1] + '.');
  });
  it('rejects a changed payload and unverified role escalation', async () => {
    const f = await fixture(); const parts = f.token.split('.');
    const payload = { ...decodeJwt(f.token), role: 'admin' };
    await unauthorized(f, parts[0] + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + parts[2]);
  });
  it('rejects a signature made by another key', async () => {
    const f = await fixture(); await unauthorized(f, await f.forged({}, {}, otherPair.privateKey));
  });
  it('rejects HS256 rather than guessing a verification mechanism', async () => {
    const f = await fixture();
    const token = await new SignJWT(decodeJwt(f.token)).setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' }).sign(new Uint8Array(randomBytes(32)));
    await unauthorized(f, token);
  });
  for (const [name, changes, header] of [
    ['issuer', { iss: 'https://other.invalid' }, {}], ['audience', { aud: 'other-api' }, {}],
    ['multiple audiences', { aud: ['two-sides-isolated-api', 'other-api'] }, {}],
    ['missing subject', { sub: undefined }, {}], ['invalid subject', { sub: 'visible name' }, {}],
    ['nonexistent subject', { sub: randomUUID() }, {}], ['missing expiry', { exp: undefined }, {}],
    ['future issuance', { iat: 9999999999 }, {}], ['future not-before', { nbf: 9999999999 }, {}],
    ['invalid TTL', { exp: 9999999999 }, {}], ['unknown role', { role: 'root' }, {}],
    ['signed role inconsistent with repository', { role: 'admin' }, {}], ['missing role', { role: undefined }, {}],
    ['missing jti', { jti: undefined }, {}], ['unknown session', { jti: randomUUID() }, {}],
    ['invalid credential version', { cv: 2 }, {}], ['wrong token type', {}, { typ: 'JWT' }],
    ['unknown key ID', {}, { kid: 'untrusted' }], ['remote key URL', {}, { jku: 'https://other.invalid/key' }],
  ]) it('rejects signed invalid profile: ' + name, async () => {
    const f = await fixture(); await unauthorized(f, await f.forged(changes, header));
  });
  it('rejects exact expiration and permits reauthentication without a new account', async () => {
    const f = await fixture(); f.advance(900000); await unauthorized(f, f.token);
    const r = await f.login(); expect(r.status).toBe(200); expect(r.body.technicalAccountId).toBe(f.id);
    expect(f.repository.counts.accounts).toBe(1);
  });
  it('revokes by credential version and individual session', async () => {
    const f = await fixture(); f.repository.revokeSession(decodeJwt(f.token).jti); await unauthorized(f, f.token);
    const next = await f.login(); f.repository.invalidateAccountSessions(f.id); await unauthorized(f, next.body.accessToken);
  });
  it('does not accept JWT as an opaque token or opaque as JWT', async () => {
    const f = await fixture(); await unauthorized(f, generateCredential());
    expect((await f.send('GET', '/api/identity/me', undefined, f.token)).status).toBe(401);
  });
  it('bounds rate limiting before protected JWT work', async () => {
    const f = await fixture({ policy: { ...RATE_POLICY, meAttempts: 1 } });
    expect((await f.send('GET', '/api/v1/technical/me', undefined, f.token)).status).toBe(200);
    expect((await f.send('GET', '/api/v1/technical/me', undefined, f.token)).status).toBe(429);
  });
  it('keeps session and registration request limits', async () => {
    const f = await fixture({ policy: { ...RATE_POLICY, sessionAttempts: 1, registrationAttempts: 1 } });
    expect((await f.login()).status).toBe(429);
    const body = { schemaVersion: 1, registrationId: randomUUID(), credential: generateCredential() };
    expect((await f.send('POST', '/api/v1/technical/registrations', body)).status).toBe(201);
    expect((await f.send('POST', '/api/v1/technical/registrations', body)).status).toBe(429);
  });
  it('rejects unsafe configuration and never falls back to a default key', () => {
    for (const bad of [undefined, {}, { ...config(), privateKey: '' }, { ...config(), privateKey: 'test' }, { ...config(), mode: 'production' }, { ...config(), algorithm: 'HS256' }])
      expect(() => validateJwtConfig(bad)).toThrow('Invalid isolated authentication configuration');
    expect(() => assertNotProduction('production')).toThrow('Production configuration unavailable');
  });
  it('rejects production startup before opening a listener even with test settings', () => {
    const result = spawnSync(process.execPath, ['--import', './tests/jwt/env-guard.js', 'src/server.js'], { cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', PORT: '0', JWT_SECRET: 'test' }, timeout: 5000 });
    expect(result.status).toBe(1); expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unable to start'); expect(result.stderr.includes('JWT_SECRET')).toBe(false);
  });
  it('blocks .env reads before they reach the filesystem', () => {
    expect(() => fs.readFileSync('.env')).toThrow('Environment file access blocked');
  });
  it('requires explicit fixture capability to seed an admin', () => {
    expect(() => new MemoryRepository().seedSyntheticAccount(randomUUID(), verifier, 'admin')).toThrow('Invalid synthetic fixture');
  });
  it('does not activate JWT routes without explicit isolated configuration', async () => {
    const server = createApp().listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening');
    const status = await new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/v1/technical/me', agent: false }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      }); req.on('error', reject); req.end();
    });
    expect(status).toBe(404);
  });
  it('keeps MongoDB optional and disconnected in isolated JWT composition', async () => {
    // C.1 intentionally adds Mongoose. Auth/default composition must still work without it.
    for (const file of ['src/app.js','src/modules/auth/jwt-service.js','src/modules/auth/memory-repository.js']) {
      expect(fs.readFileSync(file,'utf8')).not.toMatch(/from\s+['"][^'"]*(?:mongoose|mongo-ingestion|mongo-models)/);
    }
    const f=await fixture();
    const result=await f.send('POST','/api/v1/technical/sessions',{schemaVersion:1,technicalAccountId:f.id,credential});
    expect(result.status).toBe(200);
  });
  it('loses synthetic identities on restart, without suggesting Mongo durability', () => {
    const repository = new MemoryRepository({ includeInternalEmail: false });
    expect(repository.counts).toEqual({ accounts: 0, sessions: 0 });
  });
});
