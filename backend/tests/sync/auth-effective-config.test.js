import './support/isolation-guard.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openIntegrationProfile, INTEGRATION_ACTIVATION } from '../../src/integration/profile.js';
import { openAtlasIntegration } from '../../src/modules/sync/atlas-integration.js';
import { receiverConfig } from '../../scripts/c2-receiver-core.js';
import { ATLAS_TARGET } from '../../src/modules/sync/atlas-policy.js';
import { secret } from './support/integration-double.js';

// B05.5 stage 8 (authentication diagnosis), offline. Real launcher + real mongoose/driver with the network blocked and connect() intercepted, fictitious
// passwords only. Establishes the EFFECTIVE authentication configuration and how it differs from the connector of the successful C.2 run.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const probe = path.join(backendRoot, 'tests', 'sync', 'support', 'auth-config-probe.mjs');
let temp;
beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-auth-')); });
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));
const frame = text => { const bytes = Buffer.from(text, 'utf8'); const out = Buffer.alloc(4 + bytes.length); out.writeUInt32BE(bytes.length, 0); bytes.copy(out, 4); return out; };
const authorization = () => {
  const file = path.join(temp, randomUUID() + '.json'), now = Date.now();
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, kind: 'atlas-integration-launch', executionId: randomBytes(16).toString('hex'), host: ATLAS_TARGET.host, database: ATLAS_TARGET.database,
    user: ATLAS_TARGET.user, notBefore: new Date(now - 60_000).toISOString(), notAfter: new Date(now + 3_600_000).toISOString(), allowCollectionPreparation: false, maxSyntheticPlayers: 1 }));
  return file;
};
const run = password => {
  const out = spawnSync(process.execPath, [probe, authorization(), password], { input: frame(password), encoding: 'utf8', timeout: 60000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
  return { ...JSON.parse(out.stdout.trim().split('\n').pop()), stderr: out.stderr };
};
const options = async (open) => {   // the options object each connector hands to mongoose, captured without connecting
  let captured; const connector = async (uri, o) => { captured = { uri, ...o }; throw Object.assign(new Error('stop'), { code: 18 }); };
  await open(connector).catch(() => {}); return captured;
};

it('AU01 the effective authentication is user twosides_integration_test, authSource admin, SCRAM-SHA-256, the password byte for byte, and no credential in the URI', () => {
  const samples = ['Abc123xyz', 'P@ss w0rd!#$%^&*()_+-=[]{};\'":,.<>/?\\|~`', '  edge spaces  ', 'Contraseña-ÁÉÍ', '密码テスト', 'x😀y', '%40%2F literal percent', '﻿leading BOM'];
  for (const password of samples) {
    const r = run(password);
    expect(r.connectCalls, password.slice(0, 6)).toBe(1);
    expect(r.seen).toMatchObject({ username: 'twosides_integration_test', source: 'admin', mechanism: 'SCRAM-SHA-256', passwordEquals: true, passwordLength: password.length,
      srvHost: 'twosidescluster.fxqeo8o.mongodb.net', dbName: 'two_sides_integration_test', tls: true, tlsInsecure: false, tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false, directConnection: false, retryWrites: true, readPreference: 'primary', urlHasCredentials: false, urlHasPassword: false });
    expect(r.failure).toMatchObject({ code: 'atlas_authentication_failed' });
    expect(r.failure.report + r.stderr).not.toContain(password);
  }
}, 120000);

it('AU02 versus the connector of the successful C.2 run: user, authSource, TLS and destination are identical; the authentication MECHANISM is the one relevant difference', async () => {
  const integration = await options(connector => openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: secret(), connector }));
  const c2 = await options(connector => openAtlasIntegration({ config: receiverConfig(), credential: secret(), connector }));
  const strip = ({ pass, ...rest }) => ({ ...rest, passPresent: typeof pass === 'string' && pass.length > 0 });
  const a = strip(integration), b = strip(c2), differing = Object.keys({ ...a, ...b }).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
  expect(differing).toEqual(['appName', 'authMechanism', 'maxConnecting', 'maxIdleTimeMS', 'maxPoolSize']);
  expect({ integration: integration.authMechanism, c2: c2.authMechanism }).toEqual({ integration: 'SCRAM-SHA-256', c2: 'DEFAULT' });
  for (const key of ['uri', 'dbName', 'user', 'authSource', 'tls', 'tlsAllowInvalidCertificates', 'tlsAllowInvalidHostnames', 'directConnection', 'readPreference', 'retryWrites', 'w',
    'serverSelectionTimeoutMS', 'connectTimeoutMS', 'waitQueueTimeoutMS', 'autoIndex', 'autoCreate', 'bufferCommands', 'monitorCommands', 'passPresent']) expect(a[key], key).toEqual(b[key]);
  // The pool, idle and appName differences have no part in authentication.
  expect(a.passPresent).toBe(true);
});

it('AU03 the history recorded in the repository: only an explicit SCRAM-SHA-256 request has ever ended in AUTHENTICATION_FAILURE; every successful connection used DEFAULT', () => {
  const read = name => fs.readFileSync(path.join(backendRoot, 'docs', name), 'utf8');
  expect(read('B05_ATLAS_AUTHENTICATION_DIAGNOSIS.md')).toMatch(/SCRAM-SHA-256 expl/);
  expect(read('B05_ATLAS_DEFAULT_AUTH_RESULT.md')).toMatch(/DEFAULT permiti/);
  expect(fs.readFileSync(path.join(backendRoot, 'scripts', 'c2-receiver-core.js'), 'utf8')).toContain("authMechanism:'DEFAULT'");
  expect(fs.readFileSync(path.join(backendRoot, 'src', 'modules', 'sync', 'atlas-policy.js'), 'utf8')).toMatch(/INTEGRATION_PROFILE_CONFIG=.*authMechanism:'SCRAM-SHA-256'/);
});
