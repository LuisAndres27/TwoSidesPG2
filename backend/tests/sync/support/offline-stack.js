import { randomBytes, randomUUID } from 'node:crypto';
import { generateKeyPair } from 'jose';
import { createBackend } from '../../../src/composition/backend.js';
import { SyntheticIdentityRepository } from '../../identity-persistence/support/synthetic-repository.js';
import { SyntheticCoordinator } from './coordinator.js';
import { SyntheticIngestionRepository } from './synthetic-ingestion-repository.js';

// Offline composition: the real composition root with SIMULATED dependencies (in-memory identity and ingestion stores,
// a generated RSA key pair, an injected clock). No Mongoose, no Atlas, no files, no environment.
let pair;
export const stacks = [];
export const JWT_ISSUER = 'https://two-sides.test.invalid', JWT_AUDIENCE = 'two-sides-isolated-api';

export async function offlineStack({ repositoryOptions = {}, backendOptions = {} } = {}) {
  pair ??= generateKeyPair('RS256', { modulusLength: 2048 });
  const jwtConfig = { ...await pair, mode: 'isolated-test', algorithm: 'RS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE, keyId: 'composition-offline' };
  const clock = { value: Date.parse('2026-10-28T12:00:00.000Z') }, now = () => clock.value;
  const coordinator = new SyntheticCoordinator();
  const identity = new SyntheticIdentityRepository({ synthetic: true, now, coordinator });
  const repository = new SyntheticIngestionRepository({ synthetic: true, identityRepository: identity, coordinator, now, ...repositoryOptions });
  const closed = [];
  const resources = [{ name: 'identity', close: async () => { closed.push('identity'); } }, { name: 'ingestion', close: async () => { closed.push('ingestion'); } }];
  const backend = createBackend({ profile: 'offline-test', jwtConfig, identityRepository: identity, ingestionRepository: repository, now, resources, ...backendOptions });
  const stack = { backend, identity, repository, jwtConfig, clock, now, closed, base: null };
  stack.listen = async () => { const { host, port } = await backend.start(); stack.base = `http://${host}:${port}`; return stack; };
  stack.call = async (path, { method = 'GET', body, raw, token, headers = {} } = {}) => {
    const response = await fetch(stack.base + path, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await response.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, text, headers: response.headers };
  };
  // Registers a synthetic player over HTTP and returns what a client would hold.
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
