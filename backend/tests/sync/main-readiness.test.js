import {restrictedStatus} from './support/restricted-status.js';
import './support/isolation-guard.js';
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SignJWT, jwtVerify } from 'jose';
import { integrationDouble } from './support/integration-double.js';
import { MAIN_SCHEMA, MAIN_COLLECTION_NAMES } from '../../src/main/schema-inventory.js';
import { INTEGRATION_SCHEMA } from '../../src/integration/schema-inventory.js';
import { MAIN_CONFIG, MAIN_TARGET, authorizeMainScope } from '../../src/main/policy.js';
import { ATLAS_TARGET, validateAtlasConfig } from '../../src/modules/sync/atlas-policy.js';
import { readMainEnvironment } from '../../src/config/env.js';
import { startMainBackend, loadMainSigningKey } from '../../src/main/runtime.js';
import { ingestionModels } from '../../src/modules/sync/mongo-models.js';
import { mongoIdentityModels } from '../../src/modules/auth/mongo-identity-models.js';

// B05.5 stage 9, offline: readiness of the 'main' profile for two_sides_db. Doubles and static inspection only: nothing connects, no credential, no .env.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), projectRoot = path.resolve(backendRoot, '..');
const connects = [], temps = [];
afterEach(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); vi.restoreAllMocks(); });
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');
const walk = (dir, extensions) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.name === '.work' || e.name === 'node_modules' || e.name === 'bin' || e.name === 'obj' ? [] :
  e.isDirectory() ? walk(path.join(dir, e.name), extensions) : extensions.some(x => e.name.endsWith(x)) ? [path.join(dir, e.name)] : []);
const strip = text => text.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const mainFiles = ['src/main/policy.js', 'src/main/profile.js', 'src/main/runtime.js', 'src/main/schema-inventory.js', 'src/config/database.js', 'src/config/env.js'];

function mainDouble() {
  const db = integrationDouble(), c = db.connection;
  c.name = MAIN_TARGET.database; c.db.databaseName = MAIN_TARGET.database;
  db.clientOptions = { srvHost: MAIN_TARGET.host, dbName: MAIN_TARGET.database, directConnection: false, tls: true, credentials: { username: MAIN_TARGET.user, source: 'admin', mechanism: 'SCRAM-SHA-256' } };
  db.status=restrictedStatus();
  return db;
}

it('MR01 the exact main schema inventory matches the real Mongoose models: 7 collections in main_v2, the 5 unique indexes, the seed and nothing for authorization', async () => {
  const db = mainDouble(), { scope } = await authorizeMainScope(db.connection);
  const models = { ...ingestionModels(db.connection, { atlasScope: scope }), ...mongoIdentityModels(db.connection, { atlasScope: scope }) };
  expect(Object.keys(MAIN_SCHEMA.collections).sort()).toEqual(['fences', 'identities', 'identitySessions', 'operations', 'ownerGuards', 'facts', 'revocations'].sort());
  let indexCount = 0;
  for (const [key, definition] of Object.entries(MAIN_SCHEMA.collections)) {
    expect(models[key].collection.name, key).toBe(definition.name); expect(definition.name).toMatch(/^main_v2_/);
    const declared = models[key].schema.indexes().map(([k, o]) => ({ name: o.name, key: k, unique: o.unique === true }));
    expect(declared, key).toEqual(definition.indexes); indexCount += definition.indexes.length;
  }
  expect(indexCount).toBe(5); expect(MAIN_SCHEMA.collections.fences.seed).toEqual({ _id: 'ingestion-v1', revision: 0 });
  expect(models.authorization.collection.name).toBe(MAIN_SCHEMA.notCreated.authorization); expect(MAIN_COLLECTION_NAMES).not.toContain(MAIN_SCHEMA.notCreated.authorization);
  // Same structure as the integration inventory, in a disjoint namespace.
  for (const key of Object.keys(MAIN_SCHEMA.collections)) expect(MAIN_SCHEMA.collections[key].indexes).toEqual(INTEGRATION_SCHEMA.collections[key].indexes);
  expect(MAIN_COLLECTION_NAMES.filter(n => Object.values(INTEGRATION_SCHEMA.collections).some(c => c.name === n))).toEqual([]);
  expect(MAIN_COLLECTION_NAMES.some(n => /^b054c2c_|^integration_v2_/.test(n))).toBe(false);
});

it('MR02 main and integration are independent: different database and user, no shared configuration, no cross references in code', () => {
  expect(MAIN_TARGET).toEqual({ host: 'twosidescluster.fxqeo8o.mongodb.net', database: 'two_sides_db', user: 'twosides_backend_v2' });
  expect(ATLAS_TARGET.database).toBe('two_sides_integration_test'); expect(ATLAS_TARGET.user).toBe('twosides_integration_test');
  expect(MAIN_TARGET.database).not.toBe(ATLAS_TARGET.database); expect(MAIN_TARGET.user).not.toBe(ATLAS_TARGET.user);
  expect(() => validateAtlasConfig(MAIN_CONFIG)).toThrow();                                     // the integration validator refuses the main configuration
  expect(MAIN_CONFIG).toMatchObject({ authSource: 'admin', authMechanism: 'SCRAM-SHA-256', tls: true });   // documented SCRAM-SHA-1 exception, see B05_5_MAIN_SCRAM_COMPATIBILITY_RESULT.md
  for (const file of mainFiles) {
    const text = strip(read('backend', file));
    expect(text, file).not.toMatch(/twosides_integration_test|two_sides_integration_test|integration_v2|b054c2c|from\s+'[^']*\/integration\/|atlas-integration\.js|C2Runtime/);
  }
  const integrationFiles = walk(path.join(backendRoot, 'src', 'integration'), ['.js']);
  for (const file of integrationFiles) expect(strip(fs.readFileSync(file, 'utf8')), file).not.toMatch(/two_sides_db|twosides_backend|main_v2/);
});

it('MR03 starting main only reads: no collection, index, seed, delete or cleanup call exists in its runtime, and no secret, URI credential or .env access', () => {
  for (const file of mainFiles) {
    const text = strip(read('backend', file));
    expect(text, file).not.toMatch(/createCollection|createIndexes|syncIndexes|ensureIndexes|dropCollection|dropDatabase|\.drop\(|deleteMany|deleteOne|\.remove\(|insertMany|bulkWrite|updateOne|findOneAndUpdate/);
    expect(text, file).not.toMatch(/dotenv|readFileSync\([^)]*\.env|MONGODB_URI|mongodb\+srv:\/\/[^$`'"/]*[:@]/);
    expect(text, file).not.toMatch(/tlsAllowInvalid(Certificates|Hostnames):\s*true|tlsInsecure:\s*true|rejectUnauthorized:\s*false/);
  }
  const envUsers = mainFiles.filter(file => /process\.env/.test(strip(read('backend', file))));
  expect(envUsers).toEqual(['src/config/env.js']);                                              // the only reader, through an injectable default
});

it('MR04 nothing activates main by accident: production alone, the profile alone or a partial configuration are refused; start never selects it', async () => {
  const good = { TWOSIDES_PROFILE: 'main', MAIN_ENABLE: 'true', PORT: '3000', MAIN_JWT_PRIVATE_KEY_FILE: 'C:\\keys\\main.pem', MAIN_JWT_KEY_ID: 'main-key-1' };
  expect(readMainEnvironment(good)).toMatchObject({ profile: 'main', host: '127.0.0.1', port: 3000 });
  for (const env of [{}, { NODE_ENV: 'production' }, { TWOSIDES_PROFILE: 'main' }, { MAIN_ENABLE: 'true' }, { ...good, MAIN_ENABLE: 'TRUE' }, { ...good, MAIN_ENABLE: '1' }, { ...good, TWOSIDES_PROFILE: 'integration' }])
    expect(() => readMainEnvironment(env), JSON.stringify(env)).toThrow();
  for (const bad of [{ PORT: '0' }, { PORT: '70000' }, { PORT: '30 00' }, { MAIN_JWT_KEY_ID: '' }, { MAIN_JWT_KEY_ID: 'a b' }, { MAIN_JWT_PRIVATE_KEY_FILE: '' }]) expect(() => readMainEnvironment({ ...good, ...bad }), JSON.stringify(bad)).toThrow();
  expect(readMainEnvironment(good)).not.toHaveProperty('password'); expect(Object.keys(readMainEnvironment(good)).sort()).toEqual(['host', 'keyFile', 'keyId', 'port', 'profile']);
  const connect = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => { connects.push(1); throw new Error('blocked'); });
  for (const options of [undefined, {}, { config: { profile: 'main' } }, { config: { profile: 'main' }, credentialProvider: () => {} }]) await expect(startMainBackend(options)).rejects.toMatchObject({ code: 'main_not_enabled' });
  expect(connect).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')).scripts.start).toBe('node src/server.js');
  const server = strip(read('backend', 'src/server.js')); expect(server).toContain("process.env.TWOSIDES_PROFILE==='main'");
  expect(server.indexOf("TWOSIDES_PROFILE==='main'")).toBeLessThan(server.indexOf('assertNotProduction()'));   // main is selected only by the explicit variable; the default path is unchanged
});

it('MR05 the JWT signing key is persistent and external: loaded from an operator file outside the project, OneDrive and .env; the same key signs and verifies across restarts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-mainkey-')); temps.push(dir);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 }), file = path.join(dir, 'main-jwt.pem');
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const first = await loadMainSigningKey(file, 'main-key-1'), second = await loadMainSigningKey(file, 'main-key-1');
  expect(first).toMatchObject({ mode: 'main', algorithm: 'RS256', issuer: 'urn:two-sides:main', audience: 'two-sides-main-api', keyId: 'main-key-1' });
  const token = await new SignJWT({ sub: 'x' }).setProtectedHeader({ alg: 'RS256', kid: 'main-key-1' }).sign(first.privateKey);
  await expect(jwtVerify(token, second.publicKey)).resolves.toBeTruthy();                       // a restart (new load of the same file) accepts tokens signed before it
  for (const bad of [path.join(projectRoot, 'main.pem'), path.join(backendRoot, '.env'), path.join(projectRoot, 'backend', 'keys', 'a.pem'), 'relative.pem',
    'C:\\Users\\someone\\OneDrive\\Desktop\\main.pem', path.join(dir, 'missing.pem')]) await expect(loadMainSigningKey(bad, 'main-key-1'), bad).rejects.toBeTruthy();
  const weak = path.join(dir, 'weak.pem'); fs.writeFileSync(weak, generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await expect(loadMainSigningKey(weak, 'main-key-1')).rejects.toBeTruthy();                    // below the 2048 bit minimum
  const runtime = strip(read('backend', 'src/main/runtime.js')); expect(runtime).not.toMatch(/generateKeyPair|createIntegrationJwtConfig/);
});

it('MR06 the server listens on loopback only and trusts no proxy header; TLS is terminated outside Express and is a documented deployment requirement', async () => {
  const { startServer } = await import('../../src/composition/lifecycle.js'), { createApp } = await import('../../src/app.js');
  for (const host of ['0.0.0.0', '::', '192.168.1.5', 'example.com']) expect(() => startServer(createApp({ legacyIdentity: false }), { host }), host).toThrow();
  const app = createApp({ legacyIdentity: false }); expect(app.get('trust proxy')).toBeFalsy();
  expect(strip(read('backend', 'src/main/runtime.js'))).toContain("host:'127.0.0.1'");
});

it('MR07 Godot never holds a database credential, validates certificates with the platform defaults, requires HTTPS for main and stays disabled without the setting', () => {
  const godotFiles = [...walk(path.join(projectRoot, 'scripts'), ['.cs']), ...walk(path.join(projectRoot, 'integration'), ['.cs']), ...walk(path.join(projectRoot, 'local-persistence', 'sync-http'), ['.txt']),
    path.join(projectRoot, 'project.godot')];
  expect(godotFiles.length).toBeGreaterThan(20);
  for (const file of godotFiles) {
    const text = fs.readFileSync(file, 'utf8');
    expect(text, file).not.toMatch(/mongodb(\+srv)?:\/\/|twosides_backend|two_sides_db|twosides_integration_test|MONGODB_URI|mongoose|atlas/i);
    expect(text, file).not.toMatch(/ServerCertificateCustomValidationCallback|DangerousAcceptAnyServerCertificateValidator|CheckCertificateRevocationList\s*=\s*false|RemoteCertificateValidationCallback|TlsOptions.*Insecure/);
  }
  const lifecycle = read('local-persistence', 'sync-http', 'SyncWorkerLifecycle.cs.txt'); expect(lifecycle).toMatch(/uri\.Scheme!=Uri\.UriSchemeHttps\)return null/);
  const transport = read('local-persistence', 'sync-http', 'SyncHttpTransport.cs.txt'); expect(transport).toMatch(/UriSchemeHttps/); expect(transport).toContain('allowLoopbackHttp');
  expect(read('project.godot')).not.toMatch(/main_api_url/);                                    // no endpoint is configured: normal synchronization stays disabled
  expect(read('integration', 'sqlite', 'GameSyncHost.cs')).toContain('two_sides/sync/main_api_url');
});

it('MR08 recorded state of the telemetry callers in the game: which observer entry points real scenes invoke today', () => {
  const sources = [...walk(path.join(projectRoot, 'scripts'), ['.cs']), path.join(projectRoot, 'integration', 'sqlite', 'GamePersistenceContext.cs'), path.join(projectRoot, 'integration', 'sqlite', 'LocalGameState.cs')]
    .map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const callers = name => (sources.match(new RegExp('\\.' + name + '\\(', 'g')) ?? []).length;
  // Connected: segment start, loading/leaving, completion confirmation, focus/pause observation.
  for (const name of ['AnimalStarted', 'Loading', 'Leave', 'CompletionConfirmed', 'Observe']) expect(callers(name), name).toBeGreaterThan(0);
  // NOT connected to any scene or flow in this tree: the events exist in the schema, the Outbox and the contract, but nothing in the game raises them yet.
  // If this assertion starts failing, the gap was closed: update docs/B05_5_MAIN_ACTIVATION_READINESS_RESULT.md.
  expect({ Died: callers('Died'), RequestRestart: callers('RequestRestart') }).toEqual({ Died: 0, RequestRestart: 0 });
});
