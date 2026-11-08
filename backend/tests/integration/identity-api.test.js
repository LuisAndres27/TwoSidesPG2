import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';
import { MemoryRepository } from '../../src/modules/auth/memory-repository.js';
import { hashToken } from '../../src/modules/auth/auth-service.js';
import { generateId, generateCredential } from '../../src/modules/identity/identity.js';
import { RATE_POLICY } from '../../src/middleware/rate-limiter.js';
import { unavailable } from '../../src/utils/errors.js';

const registration = () => ({ schemaVersion: 1, registrationId: generateId(), credential: generateCredential() });

async function fixture(t, { policy = RATE_POLICY, hasher } = {}) {
  let time = Date.UTC(2026, 9, 24);
  const now = () => time;
  const repository = new MemoryRepository({ now });
  const app = createApp({ now, repository, policy, ...(hasher ? { hasher } : {}) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = server.address().port;
  function send(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
      const req = request({ hostname: '127.0.0.1', port, method, path, agent: false, headers: {
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }), ...headers,
      } }, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => {
          try { resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(text), text }); } catch { reject(new Error('Invalid local JSON response')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10_000, () => req.destroy(new Error('Local request timeout')));
      req.end(payload);
    });
  }
  async function account() {
    const input = registration();
    const result = await send('POST', '/api/identity/register', input);
    assert.equal(result.status, 201);
    return { input, account: result.body };
  }
  async function login(identity) {
    return send('POST', '/api/auth/session', { schemaVersion: 1, technicalAccountId: identity.account.technicalAccountId, credential: identity.input.credential });
  }
  return { send, account, login, repository, advance: milliseconds => { time += milliseconds; } };
}

function noSecrets(response, ...values) {
  assert.ok(values.filter(Boolean).every(value => !response.text.includes(value)));
  assert.ok(!/credentialVerifier|\$argon2|stack|salt|tokenHash/.test(response.text));
}

test('registro HTTP valido, campos publicos exactos y reintento tras respuesta perdida', async t => {
  const f = await fixture(t);
  const input = registration();
  const first = await f.send('POST', '/api/identity/register', input);
  assert.equal(first.status, 201);
  assert.deepEqual(Object.keys(first.body).sort(), ['schemaVersion','registrationId','technicalAccountId','internalEmail','registrationStatus','createdAt','updatedAt'].sort());
  noSecrets(first, input.credential);
  const retry = await f.send('POST', '/api/identity/register', input);
  assert.equal(retry.status, 200);
  assert.deepEqual(first.body, retry.body);
  assert.equal(f.repository.counts.accounts, 1);
});

test('idempotencia concurrente: una creacion y una identidad', async t => {
  const f = await fixture(t);
  const input = registration();
  const responses = await Promise.all(Array.from({ length: 4 }, () => f.send('POST', '/api/identity/register', input)));
  assert.equal(responses.filter(r => r.status === 201).length, 1);
  assert.equal(responses.filter(r => r.status === 200).length, 3);
  assert.equal(new Set(responses.map(r => r.body.technicalAccountId)).size, 1);
  assert.equal(f.repository.counts.accounts, 1);
});

test('clave conocida con otra credencial no permite apropiacion ni sobrescritura', async t => {
  const f = await fixture(t);
  const identity = await f.account();
  const wrong = generateCredential();
  const denied = await f.send('POST', '/api/identity/register', { ...identity.input, credential: wrong });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.error.code, 'registration_conflict');
  noSecrets(denied, wrong, identity.input.credential, identity.account.technicalAccountId);
  assert.equal(f.repository.counts.accounts, 1);
  assert.equal((await f.login(identity)).status, 200);
});

test('registro simultaneo con distinta credencial no reemplaza al ganador', async t => {
  const f = await fixture(t);
  const first = registration();
  const second = { ...first, credential: generateCredential() };
  const results = await Promise.all([first, second].map(input => f.send('POST', '/api/identity/register', input)));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 1);
  const winner = results.findIndex(result => result.status === 201);
  const input = [first, second][winner];
  const account = results[winner].body;
  assert.equal((await f.login({ input, account })).status, 200);
  assert.equal(f.repository.counts.accounts, 1);
});

test('sesion correcta y /me derivan identidad del token sin guardar token original', async t => {
  const f = await fixture(t);
  const identity = await f.account();
  const session = await f.login(identity);
  assert.equal(session.status, 200);
  assert.equal(session.body.expiresIn, 900);
  assert.equal(session.body.tokenType, 'Bearer');
  const token = session.body.accessToken;
  const stored = f.repository.findSession(hashToken(token));
  assert.ok(stored && stored.sessionId);
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.ok(!JSON.stringify(f.repository.findAccount(identity.account.technicalAccountId)).includes(identity.input.credential));
  const me = await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${token}` });
  assert.equal(me.status, 200);
  assert.equal(me.body.technicalAccountId, identity.account.technicalAccountId);
  assert.deepEqual(Object.keys(me.body).sort(), ['schemaVersion','technicalAccountId','internalEmail','createdAt','updatedAt'].sort());
  noSecrets(me, token, identity.input.credential);
  assert.equal(me.headers['cache-control'], 'no-store');
  assert.equal(me.headers['x-content-type-options'], 'nosniff');
});

test('cuenta desconocida y credencial incorrecta comparten error sanitizado', async t => {
  const f = await fixture(t);
  const identity = await f.account();
  const credential = generateCredential();
  const wrong = await f.send('POST', '/api/auth/session', { schemaVersion: 1, technicalAccountId: identity.account.technicalAccountId, credential });
  const unknown = await f.send('POST', '/api/auth/session', { schemaVersion: 1, technicalAccountId: generateId(), credential });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body.error, unknown.body.error);
  noSecrets(wrong, credential, identity.input.credential);
  noSecrets(unknown, credential);
});

test('token ausente, malformado, aleatorio o duplicado no autoriza', async t => {
  const f = await fixture(t);
  for (const headers of [{}, { Authorization: 'Bearer invalid' }, { Authorization: `Bearer ${generateCredential()}` }, { Authorization: 'Basic synthetic' }, { Authorization: ['Bearer invalid', 'Bearer invalid'] }]) {
    const response = await f.send('GET', '/api/identity/me', undefined, headers);
    assert.equal(response.status, 401);
    assert.equal(response.headers['www-authenticate'], 'Bearer');
    assert.equal(response.body.error.code, 'authentication_required');
  }
});

test('expiracion exacta 900 segundos y reautenticacion sin registrar otra cuenta', async t => {
  const f = await fixture(t);
  const identity = await f.account();
  const token = (await f.login(identity)).body.accessToken;
  f.advance(899_999);
  assert.equal((await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${token}` })).status, 200);
  f.advance(1);
  assert.equal((await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${token}` })).status, 401);
  f.advance(4 * 86400_000);
  assert.equal((await f.login(identity)).status, 200);
  assert.equal(f.repository.counts.accounts, 1);
});

test('revocacion individual y por version invalida sesiones existentes', async t => {
  const f = await fixture(t);
  const identity = await f.account();
  const token = (await f.login(identity)).body.accessToken;
  const record = f.repository.findSession(hashToken(token));
  assert.ok(f.repository.revokeSession(record.sessionId));
  assert.equal((await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${token}` })).status, 401);
  const second = (await f.login(identity)).body.accessToken;
  f.repository.invalidateAccountSessions(identity.account.technicalAccountId);
  assert.equal((await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${second}` })).status, 401);
  assert.equal((await f.login(identity)).status, 200);
});

test('cuarta sesion revoca solo la mas antigua', async t => {
  const f = await fixture(t);
  const identity = await f.account();
  const tokens = [];
  for (let i = 0; i < 4; i++) tokens.push((await f.login(identity)).body.accessToken);
  assert.equal(f.repository.counts.sessions, 3);
  assert.equal((await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${tokens[0]}` })).status, 401);
  assert.equal((await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${tokens[3]}` })).status, 200);
});

test('token de A no consulta B y rechaza secretos o identidad en query', async t => {
  const f = await fixture(t);
  const a = await f.account();
  const b = await f.account();
  const token = (await f.login(a)).body.accessToken;
  const manipulated = await f.send('GET', `/api/identity/me?technicalAccountId=${b.account.technicalAccountId}`, undefined, { Authorization: `Bearer ${token}` });
  assert.equal(manipulated.status, 400);
  noSecrets(manipulated, b.account.technicalAccountId, token);
  const me = await f.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${token}` });
  assert.equal(me.body.technicalAccountId, a.account.technicalAccountId);
  assert.equal((await f.send('POST', '/api/auth/session?credential=SYNTHETIC', {})).status, 400);
  assert.equal((await f.send('POST', '/api/identity/register?credential=SYNTHETIC', registration())).status, 400);
});

test('nombre, ID ajeno, verificador y campos extra no se aceptan como credenciales', async t => {
  const f = await fixture(t);
  for (const input of [
    { ...registration(), displayName: 'Synthetic Player' },
    { ...registration(), localPlayerId: generateId() },
    { ...registration(), technicalAccountId: generateId() },
    { ...registration(), credentialVerifier: 'SYNTHETIC' },
    { ...registration(), credential: 'Synthetic Player' },
    { ...registration(), registrationId: 'invalid' },
    { ...registration(), schemaVersion: 2 },
  ]) assert.equal((await f.send('POST', '/api/identity/register', input)).status, 400);
});

test('JSON invalido, null, arrays y tamano excesivo dan errores sanitizados', async t => {
  const f = await fixture(t);
  for (const input of ['{"credential":"SYNTHETIC",', 'null', '[]']) {
    const response = await f.send('POST', '/api/identity/register', input);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'invalid_request');
    noSecrets(response, 'SYNTHETIC');
  }
  const large = await f.send('POST', '/api/identity/register', 'x'.repeat(8193));
  assert.equal(large.status, 413);
  assert.equal(large.body.error.code, 'payload_too_large');
});

test('tipo de contenido, compresion y cuerpo GET no admitidos', async t => {
  const f = await fixture(t);
  assert.equal((await f.send('POST', '/api/identity/register', registration(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.send('POST', '/api/identity/register', registration(), { 'Content-Encoding': 'gzip' })).status, 415);
  assert.equal((await f.send('GET', '/api/identity/me', {})).status, 400);
});

test('limite de intentos de registro y X-Forwarded-For no evaden limite', async t => {
  const f = await fixture(t, { policy: { ...RATE_POLICY, registrationAttempts: 2 } });
  for (let i = 0; i < 2; i++) assert.equal((await f.send('POST', '/api/identity/register', {})).status, 400);
  const limited = await f.send('POST', '/api/identity/register', {}, { 'X-Forwarded-For': '192.0.2.40' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
  f.advance(60_000);
  assert.equal((await f.send('POST', '/api/identity/register', {})).status, 400);
});

test('cupo de nuevas cuentas no bloquea reintentos validos ni duplica cuentas', async t => {
  const f = await fixture(t, { policy: { ...RATE_POLICY, creationsPerIp: 1 } });
  const identity = await f.account();
  assert.equal((await f.send('POST', '/api/identity/register', registration())).status, 429);
  assert.equal((await f.send('POST', '/api/identity/register', identity.input)).status, 200);
  assert.equal(f.repository.counts.accounts, 1);
});

test('fuerza bruta limitada por IP y cuenta sin bloqueo permanente', async t => {
  const f = await fixture(t, { policy: { ...RATE_POLICY, sessionFailures: 2 } });
  const identity = await f.account();
  const body = { schemaVersion: 1, technicalAccountId: identity.account.technicalAccountId, credential: generateCredential() };
  for (let i = 0; i < 2; i++) assert.equal((await f.send('POST', '/api/auth/session', body)).status, 401);
  assert.equal((await f.login(identity)).status, 429);
  f.advance(900_000);
  assert.equal((await f.login(identity)).status, 200);
});

test('limites de sesion y /me se aplican antes de trabajo excesivo', async t => {
  const f = await fixture(t, { policy: { ...RATE_POLICY, sessionAttempts: 1, meAttempts: 1 } });
  const identity = await f.account();
  const token = (await f.login(identity)).body.accessToken;
  assert.equal((await f.login(identity)).status, 429);
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await f.send('GET', '/api/identity/me', undefined, headers)).status, 200);
  assert.equal((await f.send('GET', '/api/identity/me', undefined, headers)).status, 429);
  assert.equal((await f.send('GET', '/api/identity/me')).status, 401);
  assert.equal((await f.send('GET', '/api/identity/me')).status, 429);
});

test('fallo interno no filtra secretos ni detalles de biblioteca', async t => {
  const secret = generateCredential();
  const f = await fixture(t, { hasher: { hash: async () => { throw new Error(`Synthetic private failure ${secret}`); } } });
  const response = await f.send('POST', '/api/identity/register', registration());
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'internal_error');
  noSecrets(response, secret, 'Synthetic private failure');
});

test('saturacion HTTP devuelve 503 con espera y no crea identidad', async t => {
  const f = await fixture(t, { hasher: { hash: async () => { throw unavailable(); } } });
  const input = registration();
  const response = await f.send('POST', '/api/identity/register', input);
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'temporarily_unavailable');
  assert.equal(response.headers['retry-after'], '1');
  noSecrets(response, input.credential);
  assert.equal(f.repository.counts.accounts, 0);
});

test('repositorio nuevo no reconoce cuentas ni tokens de una ejecucion anterior', async t => {
  const first = await fixture(t);
  const identity = await first.account();
  const token = (await first.login(identity)).body.accessToken;
  const second = await fixture(t);
  assert.equal((await second.send('GET', '/api/identity/me', undefined, { Authorization: `Bearer ${token}` })).status, 401);
  assert.equal((await second.login(identity)).status, 401);
  assert.equal(second.repository.counts.accounts, 0);
});
