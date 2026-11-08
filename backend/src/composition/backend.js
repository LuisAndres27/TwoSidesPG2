// B05.5 stage 1 — composition root of the Express backend (JWT v2 + sync). Everything stateful is injected.
//
// Deliberately NOT here: environment reads, .env, MongoDB/Mongoose, Atlas modules, the C.2 harness or its policy.
// Profiles: 'offline-test' (simulated dependencies) and 'integration' (stage 6). The integration profile takes NO dependencies from the caller
// except one authentic bundle minted by src/integration/profile.js after explicit activation; without it the profile fails closed. This file
// imports no driver. Main likewise requires its own verified bundle, durable repositories and a separate token realm. All profiles listen on loopback.
import { createApp } from '../app.js';
import { assertNotProduction, validateJwtConfig } from '../config/jwt.js';
import { assertIdentityRepository } from '../modules/auth/identity-repository.js';
import { assertIngestionRepository } from '../modules/sync/ingestion-repository.js';
import { CredentialHasher } from '../modules/auth/credential-hasher.js';
import { RateLimiter, RATE_POLICY } from '../middleware/rate-limiter.js';
import { isIntegrationBundle } from '../config/integration-profile.js';
import { startServer } from './lifecycle.js';
import {isMainBundle,isMainRepository} from '../main/policy.js';

export const AVAILABLE_PROFILES = Object.freeze(['offline-test', 'integration', 'main']);
export const RESERVED_PROFILES = Object.freeze([]);

// The public HTTP contract of this composition. Anything else answers 404 (legacy opaque-token routes are not mounted).
export const ROUTES = Object.freeze([
  { method: 'GET', path: '/api/health', auth: 'none' },
  { method: 'POST', path: '/api/v2/technical/registrations', auth: 'none' },
  { method: 'POST', path: '/api/v2/technical/sessions', auth: 'none' },
  { method: 'GET', path: '/api/v2/technical/me', auth: 'jwt-v2 player' },
  { method: 'GET', path: '/api/v2/players/:id', auth: 'jwt-v2 player, owner only' },
  { method: 'POST', path: '/api/v2/sync/batches', auth: 'jwt-v2 player, owner binding' },
  { method: 'POST', path: '/api/v2/sync/receipts/query', auth: 'jwt-v2 player, owner binding' },
]);

export class CompositionError extends Error {
  constructor(code) { super('Backend composition unavailable.'); this.name = 'CompositionError'; this.code = code; }
}
const refuse = code => { throw new CompositionError(code); };

export function createBackend({ profile, jwtConfig, identityRepository, ingestionRepository, integration, main, hasher = new CredentialHasher(),
  now = Date.now, limiter = new RateLimiter({ now }), policy = RATE_POLICY, syncBudgets = {}, resources = [] } = {}) {
  if (RESERVED_PROFILES.includes(profile)) refuse('PROFILE_UNAVAILABLE');
  if (!AVAILABLE_PROFILES.includes(profile)) refuse('PROFILE_UNKNOWN');
  if(profile==='main'){
    if(!isMainBundle(main)||integration!==undefined||identityRepository!==undefined||ingestionRepository!==undefined||!isMainRepository(main.ingestionRepository))refuse('PROFILE_UNAVAILABLE');
    identityRepository=main.identityRepository;ingestionRepository=main.ingestionRepository;
    resources=[...main.resources,...(Array.isArray(resources)?resources:[])];
  }else if(main!==undefined)refuse('PROFILE_UNAVAILABLE');
  if (profile === 'integration') {
    // Disabled unless an activated bundle is supplied; its repositories replace anything passed separately.
    if (!isIntegrationBundle(integration) || identityRepository !== undefined || ingestionRepository !== undefined) refuse('PROFILE_UNAVAILABLE');
    identityRepository = integration.identityRepository; ingestionRepository = integration.ingestionRepository;
    resources = [...integration.resources, ...(Array.isArray(resources) ? resources : [])];
  } else if (integration !== undefined) refuse('PROFILE_UNAVAILABLE');
  if(profile!=='main')try { assertNotProduction(); } catch { refuse('PRODUCTION_REFUSED'); }
  let config;
  try { config = validateJwtConfig(jwtConfig); } catch { refuse('JWT_CONFIG_REJECTED'); }
  // Separate token realms: each profile accepts only its own issuer/audience/mode (and therefore only its own keys).
  if (config.mode !== (profile==='main'?'main':profile === 'integration' ? 'integration-test' : 'isolated-test')) refuse('JWT_CONFIG_REJECTED');
  try {
    assertIdentityRepository(identityRepository);
    assertIngestionRepository(ingestionRepository, identityRepository);
  } catch { refuse('REPOSITORY_REJECTED'); }
  // The sync router only accepts explicitly synthetic/disposable stores (test data); the integration bundle sets the same flag on its Mongo repositories.
  if (profile==='main'?!isMainRepository(ingestionRepository):ingestionRepository.synthetic !== true) refuse('REPOSITORY_NOT_SYNTHETIC');

  const app = createApp({ now, hasher, limiter, policy, legacyIdentity: false,
    persistentJwt: { config, repository: identityRepository }, sync: { repository: ingestionRepository, ...syncBudgets } });
  let handle = null, closing = null;
  if (!Array.isArray(resources) || resources.some(r => typeof r?.name !== 'string' || !r.name || typeof r.close !== 'function')) refuse('RESOURCES_REJECTED');
  const ownedResources = [...resources];
  return Object.freeze({
    profile, app, routes: ROUTES,
    async start({ host = '127.0.0.1', port = 0 } = {}) {
      if (handle || closing) refuse('ALREADY_STARTED');
      handle = await startServer(app, { host, port, resources: ownedResources });
      return Object.freeze({ host: handle.host, port: handle.port });
    },
    // Idempotent. Also valid before start(): then only the injected resources are released.
    close(options) {
      if (handle) return handle.close(options);
      closing ??= (async () => {
        let resourceErrors = 0;
        for (const resource of [...ownedResources].reverse()) { try { await resource.close(); } catch { resourceErrors += 1; } }
        return Object.freeze({ closed: true, forced: false, resourceErrors });
      })();
      return closing;
    },
  });
}
