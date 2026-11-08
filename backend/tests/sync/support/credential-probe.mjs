// Test-only child process: receives the framed credential exactly like the real launcher (receiveAtlasCredential) and reports ONLY hashes/lengths and
// whether the (fictitious) secret shows up in its own argv or environment. It never prints the secret.
import crypto from 'node:crypto';
import { receiveAtlasCredential, consumeAtlasCredential } from '../../../src/modules/sync/atlas-credentials.js';
try {
  const secret = consumeAtlasCredential(await receiveAtlasCredential(process.stdin));
  const leaks = [...process.argv, ...Object.values(process.env), ...Object.keys(process.env)].filter(v => v.includes(secret));
  console.log(JSON.stringify({ ok: true, bytes: Buffer.byteLength(secret), sha256: crypto.createHash('sha256').update(secret, 'utf8').digest('hex'), leaks: leaks.length, envNames: Object.keys(process.env).sort() }));
} catch (error) { console.log(JSON.stringify({ ok: false, code: error.code })); }
