import { SignJWT, jwtVerify } from 'jose';
import { AuthService, hashToken } from './auth-service.js';
import { ApiError } from '../../utils/errors.js';
import { isUuid } from '../identity/identity.js';
import { validateJwtConfig } from '../../config/jwt.js';
import { assertIdentityRepository } from './identity-repository.js';

const unauthorized = () => new ApiError(401, 'authentication_required');
export class JwtService {
  constructor({ config, repository, hasher, limiter, policy, now = Date.now, version = 1 }) {
    this.config = validateJwtConfig(config);
    if (![1, 2].includes(version)) throw new Error('Invalid isolated token version');
    this.version = version;
    if (version === 2) assertIdentityRepository(repository);
    this.repository = repository; this.now = now;
    this.auth = new AuthService({ repository, hasher, limiter, policy });
  }
  async register(body, ip) {
    const result = await this.auth.register(body, ip);
    const account = this.version === 2 ? await this.repository.findAccount(result.body.technicalAccountId) : null;
    return { status: result.status, body: { schemaVersion: this.version, registrationId: body.registrationId,
      ...(account ? { installationId: account.installationId, localPlayerId: account.localPlayerId, bindingGeneration: account.bindingGeneration } : {}),
      technicalAccountId: result.body.technicalAccountId, registrationStatus: 'REGISTERED' } };
  }
  async session(body, ip) {
    // Reuse the tested Argon2id and bounded session/revocation lifecycle.
    // Its transient opaque response is never exposed by the JWT contract.
    const authenticated = await this.auth.session(body, ip);
    const session = await this.repository.findSession(hashToken(authenticated.accessToken));
    const account = session && await this.repository.findAccount(session.technicalAccountId);
    if (!account || !['player', 'admin'].includes(account.role)) throw unauthorized();
    const now = Math.floor(this.now() / 1000);
    const { config } = this;
    const binding = this.version === 2 ? { ver: 2, installationId: account.installationId, localPlayerId: account.localPlayerId,
      bindingGeneration: account.bindingGeneration, authzVersion: account.authzVersion } : {};
    const token = await new SignJWT({ role: account.role, cv: account.credentialVersion, ...binding })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: config.keyId })
      .setIssuer(config.issuer).setAudience(config.audience).setSubject(account.technicalAccountId)
      .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 900).setJti(session.sessionId)
      .sign(config.privateKey);
    return { schemaVersion: this.version, technicalAccountId: account.technicalAccountId, tokenType: 'Bearer',
      accessToken: token, expiresIn: 900 };
  }
  async authenticate(token) {
    try {
      if (typeof token !== 'string' || token.length > 4096) throw unauthorized();
      const { config } = this;
      const { payload, protectedHeader } = await jwtVerify(token, config.publicKey, {
        algorithms: ['RS256'], issuer: config.issuer, audience: config.audience, typ: 'at+jwt',
        currentDate: new Date(this.now()), clockTolerance: 0,
        requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'nbf', 'jti', 'role', 'cv'],
      });
      if (protectedHeader.kid !== config.keyId || Object.keys(protectedHeader).some(key => !['alg', 'typ', 'kid'].includes(key)) ||
          payload.iss !== config.issuer || payload.aud !== config.audience ||
          !isUuid(payload.sub) || !isUuid(payload.jti) || !['player', 'admin'].includes(payload.role) ||
          !Number.isSafeInteger(payload.cv) || payload.cv < 1 ||
          ![payload.iat, payload.nbf, payload.exp].every(Number.isSafeInteger) ||
          payload.iat > Math.floor(this.now() / 1000) || payload.nbf !== payload.iat ||
          payload.exp - payload.iat !== 900) throw unauthorized();
      if (this.version === 1 ? payload.ver !== undefined : (payload.ver !== 2 || !isUuid(payload.installationId) ||
          !isUuid(payload.localPlayerId) || !Number.isSafeInteger(payload.bindingGeneration) || payload.bindingGeneration < 1 ||
          !Number.isSafeInteger(payload.authzVersion) || payload.authzVersion < 1)) throw unauthorized();
      const session = await this.repository.findSessionById(payload.jti);
      const account = await this.repository.findAccount(payload.sub);
      if (!session || !account?.active || session.technicalAccountId !== payload.sub ||
          account.credentialVersion !== payload.cv || session.credentialVersion !== payload.cv ||
          account.role !== payload.role) throw unauthorized();
      if (this.version === 2 && ['installationId', 'localPlayerId', 'bindingGeneration', 'authzVersion'].some(
        key => payload[key] !== account[key] || session[key] !== account[key])) throw unauthorized();
      return Object.freeze({ id: account.technicalAccountId, role: account.role, sessionId: session.sessionId });
    } catch (error) { if (error instanceof ApiError && error.status === 503) throw error; throw unauthorized(); }
  }
}
