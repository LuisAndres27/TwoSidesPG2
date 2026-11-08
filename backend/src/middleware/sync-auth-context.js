import { decodeJwt } from 'jose';
import { ApiError } from '../utils/errors.js';

const trusted = new WeakSet();
const denied = () => new ApiError(401, 'authentication_required');
export function assertSyncContext(context, identityRepository) {
  if (!trusted.has(context) || context.identityRepository !== identityRepository) throw denied();
}

// Called ONLY after the existing JWT-v2 authenticate middleware verified this exact token.
export async function resolveSyncContext(principal, verifiedToken, repository, now = Date.now) {
  let claims;
  try { claims = Object.freeze(decodeJwt(verifiedToken)); } catch { throw denied(); }
  if (!principal || claims.ver !== 2 || claims.sub !== principal.id || claims.jti !== principal.sessionId || claims.role !== principal.role) throw denied();
  const validate = async () => {
    try {
      // Mongo transaction operations must be sequential on the shared session.
      const account = await repository.findAccount(principal.id);
      const session = await repository.findSessionById(principal.sessionId);
      if (!account?.active || account.technicalAccountId !== principal.id || !session || session.sessionId !== principal.sessionId || session.revoked || session.technicalAccountId !== principal.id ||
          claims.role !== 'player' || account.role !== 'player' || now() >= claims.exp * 1000 || now() >= session.expiresAt ||
          account.credentialVersion !== claims.cv || session.credentialVersion !== claims.cv ||
          ['installationId','localPlayerId','bindingGeneration','authzVersion'].some(k => account[k] !== claims[k] || session[k] !== claims[k])) throw denied();
      return account;
    } catch (error) { if (error instanceof ApiError && error.status === 503) throw error; throw denied(); }
  };
  const account = await validate();
  const context = Object.freeze({ technicalAccountId: account.technicalAccountId, installationId: account.installationId,
    localPlayerId: account.localPlayerId, bindingGeneration: account.bindingGeneration,
    credentialVersion: account.credentialVersion, authzVersion: account.authzVersion,
    sessionId: principal.sessionId, expiresAt: claims.exp*1000,
    identityRepository: repository, validate });
  trusted.add(context); return context;
}

export const syncAuthContext = (repository, now) => async (request, _response, next) => {
  try {
    // authenticate() has already rejected ambiguous headers and verified the same immutable string.
    const token = request.headers.authorization.slice(7);
    request.syncContext = await resolveSyncContext(request.principal, token, repository, now); next();
  } catch (error) { next(error); }
};
