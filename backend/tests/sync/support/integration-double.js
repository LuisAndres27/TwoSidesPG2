import { randomBytes, randomUUID } from 'node:crypto';
import { mongoDouble } from './mongo-double.js';
import { permissionResult } from './atlas-double.js';
import { INTEGRATION_SCHEMA } from '../../../src/integration/schema-inventory.js';
import { ATLAS_TARGET } from '../../../src/modules/sync/atlas-policy.js';
import { temporaryAtlasCredential } from '../../../src/modules/sync/atlas-credentials.js';
import { createBackend } from '../../../src/composition/backend.js';
import { openIntegrationProfile, createIntegrationJwtConfig, INTEGRATION_ACTIVATION } from '../../../src/integration/profile.js';

// B05.5 stage 6 test support. A MongoDB DOUBLE shaped like the integration database (name, SRV host, TLS, SCRAM user, privileges) so the REAL
// integration opener, the REAL Mongo repositories and the REAL HTTP stack run end to end. No socket to Atlas is ever opened.
export const secret = () => temporaryAtlasCredential(Buffer.from(randomBytes(24).toString('hex')));

export function integrationDouble() {
  const db = mongoDouble(), connection = db.connection;
  db.status = permissionResult(); db.commands = []; db.connects = 0; db.closed = 0; db.optionsSeen = []; db.uriSeen = [];
  connection.name = ATLAS_TARGET.database; connection.db.databaseName = ATLAS_TARGET.database;
  connection.db.command = async command => { db.commands.push(command); return structuredClone(db.status); };
  connection.close = async () => { db.closed += 1; connection.readyState = 0; };
  db.clientOptions = { srvHost: ATLAS_TARGET.host, dbName: ATLAS_TARGET.database, directConnection: false, tls: true,
    credentials: { username: ATLAS_TARGET.user, source: 'admin', mechanism: 'SCRAM-SHA-256' } };
  connection.getClient = () => ({ options: db.clientOptions });
  // What the database "already contains": by default the complete integration schema (names; index metadata comes from the shared double).
  db.remote = new Set(Object.values(INTEGRATION_SCHEMA.collections).map(c => c.name)); db.created = []; db.indexed = []; db.seeded = 0;
  connection.db.listCollections = () => ({ toArray: async () => [...db.remote].map(name => ({ name })) });
  db.emptySchema = () => { db.remote.clear(); };
  // Simulated preparation: records what WOULD be created; nothing exists beyond this object.
  db.stubPreparation = () => {
    for (const model of Object.values(db.models)) {
      model.createCollection = async () => { db.created.push(model.collection.name); db.remote.add(model.collection.name); };
      model.createIndexes = async () => { db.indexed.push(model.collection.name); };
    }
    db.models.fences.updateOne = async () => { db.seeded += 1; return { matchedCount: 0, upsertedCount: 1 }; };
  };
  db.connector = async (uri, options) => { db.connects += 1; db.uriSeen.push(uri); db.optionsSeen.push(options); return connection; };
  return db;
}

export const stacks = [];
// Opens the integration profile on the double and composes the real backend on it.
export async function integrationStack({ now: nowFn, double = integrationDouble(), backendOptions = {} } = {}) {
  const clock = { value: Date.parse('2026-10-28T12:00:00.000Z') }, now = nowFn ?? (() => clock.value);
  const bundle = await openIntegrationProfile({ activation: INTEGRATION_ACTIVATION, credential: secret(), connector: double.connector, now });
  const jwtConfig = await createIntegrationJwtConfig();
  const backend = createBackend({ profile: 'integration', jwtConfig, integration: bundle, now, ...backendOptions });
  const stack = { backend, bundle, db: double, jwtConfig, clock, now, base: null };
  stack.listen = async () => { const { host, port } = await backend.start(); stack.base = `http://${host}:${port}`; return stack; };
  stack.call = async (path, { method = 'GET', body, raw, token, headers = {} } = {}) => {
    const response = await fetch(stack.base + path, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await response.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, text, headers: response.headers };
  };
  stack.player = async binding => {
    const credential = randomBytes(32).toString('base64url');
    const register = await stack.call('/api/v2/technical/registrations', { method: 'POST', body: { schemaVersion: 2, registrationId: randomUUID(), credential, ...binding } });
    const accountId = register.json?.technicalAccountId;
    const login = async () => (await stack.call('/api/v2/technical/sessions', { method: 'POST', body: { schemaVersion: 2, technicalAccountId: accountId, credential, installationId: binding.installationId, localPlayerId: binding.localPlayerId } })).json?.accessToken;
    return { register, accountId, credential, binding, login, token: await login() };
  };
  stacks.push(stack);
  return stack;
}

// Minimal HTTP client for a running backend (same helpers as integrationStack, for a base URL we did not compose ourselves).
export function httpClient(base) {
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, text };
  };
  const player = async binding => {
    const credential = randomBytes(32).toString('base64url');
    const register = await call('/api/v2/technical/registrations', { method: 'POST', body: { schemaVersion: 2, registrationId: randomUUID(), credential, ...binding } });
    const accountId = register.json?.technicalAccountId;
    const login = async () => (await call('/api/v2/technical/sessions', { method: 'POST', body: { schemaVersion: 2, technicalAccountId: accountId, credential, installationId: binding.installationId, localPlayerId: binding.localPlayerId } })).json?.accessToken;
    return { register, accountId, credential, binding, login, token: await login() };
  };
  return { call, player };
}

// Fake mongoose for the launcher: hands out the double's connection and records what the launcher asked for. Opens no socket.
export function fakeMongoose(double, { rejectWith } = {}) {
  return { createConnection(uri, options) {
    double.connects += 1; double.uriSeen.push(uri); double.optionsSeen.push(options);
    const connection = double.connection;
    connection.on = () => connection; connection.asPromise = async () => { if (rejectWith) throw rejectWith; return connection; };
    return connection;
  } };
}
