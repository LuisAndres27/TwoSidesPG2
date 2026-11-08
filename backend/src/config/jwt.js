// Three separate token realms: isolated tests, integration tests and main. A token minted for one is rejected by the others.
// Neither holds a key: callers generate or supply keys at runtime and nothing here reads files or the environment.
export const ISOLATED_JWT = Object.freeze({ mode: 'isolated-test', issuer: 'https://two-sides.test.invalid', audience: 'two-sides-isolated-api' });
export const INTEGRATION_JWT = Object.freeze({ mode: 'integration-test', issuer: 'https://two-sides.integration.invalid', audience: 'two-sides-integration-api' });
export const MAIN_JWT = Object.freeze({mode:'main',issuer:'urn:two-sides:main',audience:'two-sides-main-api'});
// Isolated synthetic composition only. No environment file or fallback signing secret.
export function assertNotProduction(mode = process.env.NODE_ENV) {
  if (mode === 'production') throw new Error('Production configuration unavailable');
}

export function validateJwtConfig(config) {
  if(config?.mode!=='main')assertNotProduction();
  const fail = () => { throw new Error('Invalid isolated authentication configuration'); };
  const accepted = [MAIN_JWT, INTEGRATION_JWT, ISOLATED_JWT].find(p => config?.mode === p.mode && config.issuer === p.issuer && config.audience === p.audience);
  if (!config || !accepted || config.algorithm !== 'RS256' ||
      typeof config.keyId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(config.keyId)) fail();
  for (const [key, type] of [[config.privateKey, 'private'], [config.publicKey, 'public']]) {
    if (!key || key.type !== type || key.algorithm?.name !== 'RSASSA-PKCS1-v1_5' ||
        key.algorithm.hash?.name !== 'SHA-256' || key.algorithm.modulusLength < 2048) fail();
  }
  return Object.freeze({ mode: config.mode, algorithm: 'RS256', issuer: config.issuer,
    audience: config.audience, keyId: config.keyId, privateKey: config.privateKey, publicKey: config.publicKey });
}
