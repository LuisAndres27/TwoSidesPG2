// Async port shared by JWT v2 and synthetic/future database adapters.
// Reads return detached records. Mutations commit atomically or throw a safe 503.
// createSession must CAS the verified account/binding versions against live state.
export const IDENTITY_REPOSITORY_METHODS = Object.freeze([
  'findRegistration', 'createIfAbsent', 'findAccount', 'createSession',
  'findSession', 'findSessionById', 'revokeSession', 'revokeIdentity', 'invalidateAccountSessions',
]);
export function assertIdentityRepository(repository) {
  if (!repository || IDENTITY_REPOSITORY_METHODS.some(name => typeof repository[name] !== 'function'))
    throw new Error('Invalid isolated identity repository');
  return repository;
}
