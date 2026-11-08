// Registry of authentic 'integration' dependency bundles. A bundle can only be minted by src/integration/profile.js after its explicit
// activation and a verified connection; the composition root accepts nothing else for the integration profile.
// Holds no configuration, endpoint, credential or key, and imports nothing.
const bundles = new WeakSet();
export function registerIntegrationBundle(bundle) { bundles.add(bundle); return bundle; }
export function isIntegrationBundle(bundle) { return typeof bundle === 'object' && bundle !== null && bundles.has(bundle); }
