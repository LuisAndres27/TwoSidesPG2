import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOptions } from '@node-rs/argon2';
import { generateId, generateCredential, isUuid, isSecret, validateDisplayName, internalEmail } from '../../src/modules/identity/identity.js';
import { CredentialHasher, ARGON_POLICY } from '../../src/modules/auth/credential-hasher.js';
import { MemoryRepository } from '../../src/modules/auth/memory-repository.js';
import { WorkPool } from '../../src/utils/work-pool.js';
import { RateLimiter } from '../../src/middleware/rate-limiter.js';

test('UUIDv4 criptograficos y correo sintetico independiente del nombre', () => {
  const ids = Array.from({ length: 100 }, generateId);
  assert.ok(ids.every(isUuid));
  assert.equal(new Set(ids).size, 100);
  assert.ok(internalEmail(ids[0]).endsWith('@identity.two-sides.invalid'));
});

test('credenciales sinteticas unicas, canonicas y de 32 bytes', () => {
  const secrets = Array.from({ length: 100 }, generateCredential);
  assert.ok(secrets.every(isSecret));
  assert.equal(new Set(secrets).size, 100);
  assert.ok(secrets.every(value => Buffer.from(value, 'base64url').length === 32));
  assert.ok(!isSecret('SYNTHETIC_NOT_A_CREDENTIAL'));
  assert.ok(!isSecret('A'.repeat(42) + 'B'));
});

test('nombre Unicode NFC, espacios, alfabetos y emoji', () => {
  assert.equal(validateDisplayName('  Jose\u0301  '), 'Jos\u00e9');
  assert.equal(validateDisplayName('Mar\u00eda del Bosque'), 'Mar\u00eda del Bosque');
  assert.equal(validateDisplayName('\u68ee\u306e\u4eba'), '\u68ee\u306e\u4eba');
  assert.ok(validateDisplayName('\u{1f469}\u200d\u{1f52c}'));
  assert.equal(validateDisplayName('a'.repeat(32)).length, 32);
});

test('nombre vacio, controles, bidi, Unicode roto y longitudes invalidas', () => {
  for (const value of ['', '   ', '\u200b\u200d', '\u0301', 'Name\n', 'A\u202eB', '\ud800', 'a'.repeat(33), 123]) {
    assert.throws(() => validateDisplayName(value), error => error.code === 'invalid_request');
  }
});

test('Argon2id exacto: salt independiente, verificacion y rechazo', async () => {
  const hasher = new CredentialHasher();
  const secret = generateCredential();
  const first = await hasher.hash(secret);
  const second = await hasher.hash(secret);
  assert.ok(first !== second);
  assert.ok(first.startsWith('$argon2id$v=19$m=65536,t=3,p=1$'));
  const parameters = parseOptions(first);
  for (const [key, value] of Object.entries(ARGON_POLICY)) assert.equal(parameters[key], value);
  assert.equal(parameters.saltLen, 16);
  assert.equal(parameters.outputLen, 32);
  assert.ok(await hasher.verify(first, secret));
  assert.ok(!await hasher.verify(first, generateCredential()));
  await assert.rejects(hasher.verify('invalid-phc', secret), error => error.status === 503);
});

test('concurrencia Argon2 real limitada a dos trabajos', async () => {
  const pool = new WorkPool();
  const hasher = new CredentialHasher({ pool });
  await Promise.all(Array.from({ length: 4 }, () => hasher.hash(generateCredential())));
  assert.equal(pool.stats.peak, 2);
  assert.equal(pool.stats.active, 0);
  assert.equal(pool.stats.queued, 0);
});

test('cola acotada rechaza saturacion y recupera capacidad', async () => {
  const pool = new WorkPool({ concurrency: 1, maxQueue: 1, waitMs: 1000 });
  let release;
  const first = pool.run(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const second = pool.run(() => 2);
  await assert.rejects(pool.run(() => 3), error => error.status === 503);
  release(1);
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.equal(pool.stats.active, 0);
});

test('tiempo maximo de cola no ejecuta el trabajo vencido', async () => {
  const pool = new WorkPool({ concurrency: 1, maxQueue: 1, waitMs: 15 });
  let release;
  let executed = false;
  const first = pool.run(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  await assert.rejects(pool.run(() => { executed = true; }), error => error.status === 503);
  release();
  await first;
  assert.equal(executed, false);
  assert.equal(pool.stats.active, 0);
});

test('rate limiting expira y no crece sin limite', () => {
  let time = 0;
  const limiter = new RateLimiter({ now: () => time, maxEntries: 1 });
  limiter.consume('synthetic-a', 1, 1000);
  assert.throws(() => limiter.consume('synthetic-a', 1, 1000), error => error.status === 429 && error.retryAfter === 1);
  assert.throws(() => limiter.consume('synthetic-b', 1, 1000), error => error.status === 503);
  time = 1000;
  limiter.consume('synthetic-b', 1, 1000);
});

test('repositorios aislados pierden datos al reiniciar y no eliminan identidades por capacidad', () => {
  const first = new MemoryRepository({ maxAccounts: 1 });
  const registrationId = generateId();
  first.createIfAbsent(registrationId, 'SYNTHETIC-INERT-VERIFIER');
  assert.equal(first.counts.accounts, 1);
  assert.equal(first.createIfAbsent(registrationId, 'SYNTHETIC-INERT-VERIFIER').created, false);
  assert.throws(() => first.createIfAbsent(generateId(), 'SYNTHETIC-INERT-VERIFIER'), error => error.status === 503);
  const second = new MemoryRepository();
  assert.equal(second.counts.accounts, 0);
  assert.equal(second.findRegistration(registrationId), undefined);
});
