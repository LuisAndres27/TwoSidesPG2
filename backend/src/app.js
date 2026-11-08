import express from 'express';
import { MemoryRepository } from './modules/auth/memory-repository.js';
import { CredentialHasher } from './modules/auth/credential-hasher.js';
import { AuthService } from './modules/auth/auth-service.js';
import { publicIdentity, validateBody } from './modules/identity/identity.js';
import { RateLimiter, RATE_POLICY } from './middleware/rate-limiter.js';
import { securityHeaders, rejectQuery, requireJson, parseJson, requireEmptyRequest, errorHandler } from './middleware/security.js';
import { JwtService } from './modules/auth/jwt-service.js';
import { registrationSchema, sessionSchema, registrationV2Schema, sessionV2Schema, validateJwtBody } from './modules/auth/jwt-schemas.js';
import { authenticate } from './middleware/authentication.js';
import { authorize, authorizeOwner } from './middleware/authorization.js';
import { createSyncRouter } from './modules/sync/routes.js';

export function createApp({ now = Date.now, repository = new MemoryRepository({ now }), hasher = new CredentialHasher(), limiter = new RateLimiter({ now }), policy = RATE_POLICY, jwt = null, jwtRepository = null, persistentJwt = null, sync = null, legacyIdentity = true } = {}) {
  if(sync && !persistentJwt)throw new Error('Sync requires explicit JWT-v2 composition');
  const app = express();
  const auth = new AuthService({ repository, hasher, limiter, policy });
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(securityHeaders);

  app.get('/api/health', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'two-sides-backend' });
  });

  const attempts = (prefix, limit, window) => (request, _response, next) => {
    limiter.consume(`${prefix}:${request.ip}`, limit, window);
    next();
  };

  // Legacy opaque-token identity routes. The B05.5 composition disables them and exposes only JWT v2.
  if (legacyIdentity) {
    app.post('/api/identity/register', rejectQuery,
      attempts('register', policy.registrationAttempts, policy.registrationWindow), requireJson, parseJson,
      async (request, response) => {
        const result = await auth.register(validateBody(request.body, 'registrationId'), request.ip);
        response.status(result.status).json(result.body);
      });

    app.post('/api/auth/session', rejectQuery,
      attempts('session', policy.sessionAttempts, policy.sessionWindow), requireJson, parseJson,
      async (request, response) => {
        response.json(await auth.session(validateBody(request.body, 'technicalAccountId'), request.ip));
      });

    app.get('/api/identity/me', rejectQuery, requireEmptyRequest, (request, response) => {
      const count = request.rawHeaders.filter((_value, index, entries) => index % 2 === 0 && entries[index].toLowerCase() === 'authorization').length;
      const match = count === 1 && /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.authorization ?? '');
      let identity;
      try { identity = auth.authenticate(match ? match[1] : undefined); } catch (error) {
        limiter.consume(`me-ip:${request.ip}`, policy.meAttempts, policy.meWindow);
        throw error;
      }
      limiter.consume(`me-token:${identity.digest}`, policy.meAttempts, policy.meWindow);
      response.json(publicIdentity(identity.account));
    });
  }

  if (jwt) {
    const jwtStore = jwtRepository ?? new MemoryRepository({ now, includeInternalEmail: false });
    const jwtService = new JwtService({ config: jwt, repository: jwtStore, hasher, limiter, policy, now });
    app.post('/api/v1/technical/registrations', rejectQuery, attempts('jwt-register', policy.registrationAttempts, policy.registrationWindow), requireJson, parseJson,
      async (request, response) => {
        const result = await jwtService.register(validateJwtBody(registrationSchema, request.body), request.ip);
        response.status(result.status).json(result.body);
      });
    app.post('/api/v1/technical/sessions', rejectQuery, attempts('jwt-session', policy.sessionAttempts, policy.sessionWindow), requireJson, parseJson,
      async (request, response) => response.json(await jwtService.session(validateJwtBody(sessionSchema, request.body), request.ip)));
    const protectedJwt = [rejectQuery, requireEmptyRequest, attempts('jwt-resource', policy.meAttempts, policy.meWindow), authenticate(jwtService)];
    app.get('/api/v1/technical/me', ...protectedJwt, authorize('player', 'admin'),
      (request, response) => response.json({ schemaVersion: 1, technicalAccountId: request.principal.id, role: request.principal.role }));
    app.get('/api/v1/players/:id', ...protectedJwt, authorize('player'), authorizeOwner,
      (request, response) => response.json({ schemaVersion: 1, technicalAccountId: request.principal.id }));
    app.get('/api/v1/admin/status', ...protectedJwt, authorize('admin'),
      (_request, response) => response.json({ schemaVersion: 1, status: 'isolated-memory' }));
  }
  if (persistentJwt) {
    const service = new JwtService({ config: persistentJwt.config, repository: persistentJwt.repository, hasher, limiter, policy, now, version: 2 });
    app.post('/api/v2/technical/registrations', rejectQuery, attempts('v2-register', policy.registrationAttempts, policy.registrationWindow), requireJson, parseJson,
      async (request, response) => {
        const result = await service.register(validateJwtBody(registrationV2Schema, request.body), request.ip);
        response.status(result.status).json(result.body);
      });
    app.post('/api/v2/technical/sessions', rejectQuery, attempts('v2-session', policy.sessionAttempts, policy.sessionWindow), requireJson, parseJson,
      async (request, response) => response.json(await service.session(validateJwtBody(sessionV2Schema, request.body), request.ip)));
    const protectedV2 = [rejectQuery, requireEmptyRequest, attempts('v2-resource', policy.meAttempts, policy.meWindow), authenticate(service), authorize('player')];
    app.get('/api/v2/technical/me', ...protectedV2, (request, response) => response.json({ schemaVersion: 2, technicalAccountId: request.principal.id, role: request.principal.role }));
    app.get('/api/v2/players/:id', ...protectedV2, authorizeOwner, (request, response) => response.json({ schemaVersion: 2, technicalAccountId: request.principal.id }));
    if(sync)app.use('/api/v2/sync',createSyncRouter({...sync,jwtService:service,identityRepository:persistentJwt.repository,limiter,now}));
  }
  app.use((_request, response) => response.status(404).json({ error: 'not_found' }));
  app.use(errorHandler);
  return app;
}

export default createApp();
