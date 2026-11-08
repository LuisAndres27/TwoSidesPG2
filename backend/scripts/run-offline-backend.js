// DEVELOPMENT ONLY. Local Express for the 'offline-test' composition (B05.5): simulated in-memory identity and ingestion
// stores, a throw-away RSA key pair, loopback only. It reads no environment file, imports no Mongoose/Atlas/C.2 module and
// holds no real credential. It is NOT what `npm start` runs and it never enables another profile.
//
//   node scripts/run-offline-backend.js [--port N] [--exit-on-stdin-close]
//
// Prints one JSON line when it listens. Stops gracefully on SIGINT/SIGTERM, or (with --exit-on-stdin-close) when stdin
// closes or receives the line "shutdown" - which is how a parent test process stops it on Windows.
import { generateKeyPair } from 'jose';
import { createBackend } from '../src/composition/backend.js';
import { SyntheticIdentityRepository } from '../tests/identity-persistence/support/synthetic-repository.js';
import { SyntheticCoordinator } from '../tests/sync/support/coordinator.js';
import { SyntheticIngestionRepository } from '../tests/sync/support/synthetic-ingestion-repository.js';

const fail = () => { console.error('Unable to start the offline backend'); process.exit(1); };

function parseArguments(argv) {
  const options = { port: 3000, exitOnStdinClose: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exit-on-stdin-close') options.exitOnStdinClose = true;
    else if (argv[i] === '--port' && i + 1 < argv.length && /^\d{1,5}$/.test(argv[i + 1]) && Number(argv[i + 1]) <= 65535) options.port = Number(argv[++i]);
    else throw new Error('arguments');   // no host, URI, user, database, key or profile argument exists
  }
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const keys = await generateKeyPair('RS256', { modulusLength: 2048 });
  const jwtConfig = { ...keys, mode: 'isolated-test', algorithm: 'RS256', issuer: 'https://two-sides.test.invalid', audience: 'two-sides-isolated-api', keyId: 'offline-launcher' };
  const coordinator = new SyntheticCoordinator();
  const identity = new SyntheticIdentityRepository({ synthetic: true, coordinator });
  const repository = new SyntheticIngestionRepository({ synthetic: true, identityRepository: identity, coordinator });
  const backend = createBackend({ profile: 'offline-test', jwtConfig, identityRepository: identity, ingestionRepository: repository,
    resources: [{ name: 'identity', close: async () => {} }, { name: 'ingestion', close: async () => {} }] });
  const { host, port } = await backend.start({ host: '127.0.0.1', port: options.port });
  console.log(JSON.stringify({ offlineBackend: 'listening', profile: 'offline-test', url: `http://${host}:${port}` }));

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    backend.close({ graceMs: 3000 }).then(() => process.exit(0), () => process.exit(1));
    setTimeout(() => process.exit(1), 6000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  if (options.exitOnStdinClose) {
    process.stdin.setEncoding('utf8');
    let buffer = '';
    process.stdin.on('data', chunk => { buffer += chunk; if (/^shutdown\r?$/m.test(buffer)) stop(); });
    process.stdin.on('end', stop);
    process.stdin.resume();
  }
} catch {
  fail();
}
