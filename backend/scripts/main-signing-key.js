// Operator tool for the persistent JWT signing key of the main realm. NOT run by the repository or by any test against a real path.
//   node scripts\main-signing-key.js create <absolute-key-file> <keyId>   creates a NEW 3072-bit RSA PKCS#8 key; refuses if the file exists (never overwrites)
//   node scripts\main-signing-key.js check  <absolute-key-file> <keyId>   loads it exactly as the backend does and prints only public facts
// It prints the key id, size and public SHA-256 fingerprint. The private key is never printed, logged or passed on a command line, and no network is used.
import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { assertKeyId, assertSigningKeyPath, inspectMainSigningKey } from '../src/main/signing-key.js';

const fail = reason => { console.error(JSON.stringify({ mainSigningKey: 'rejected', reason })); process.exit(1); };
const [, , action, file, keyId, ...rest] = process.argv;
if (rest.length || !['create', 'check'].includes(action)) fail('usage');
try { assertSigningKeyPath(file); assertKeyId(keyId); } catch { fail('invalid_arguments'); }

if (action === 'check') {
  try {
    const { fingerprint, bits } = await inspectMainSigningKey(file, keyId);
    console.log(JSON.stringify({ mainSigningKey: 'valid', keyId, bits, publicFingerprintSha256: fingerprint }));
  } catch { fail('key_rejected'); }
} else {
  const absolute = path.resolve(file);
  if (!fs.existsSync(path.dirname(absolute))) fail('directory_missing');                       // the operator prepares the protected directory first
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  let descriptor;
  try { descriptor = fs.openSync(absolute, 'wx', 0o600); }                                      // exclusive create: an existing key is never replaced
  catch { fail('file_exists_or_unwritable'); }
  try { fs.writeSync(descriptor, privateKey.export({ type: 'pkcs8', format: 'pem' })); } finally { fs.closeSync(descriptor); }
  try {
    const { fingerprint, bits } = await inspectMainSigningKey(file, keyId);
    console.log(JSON.stringify({ mainSigningKey: 'created', keyId, bits, publicFingerprintSha256: fingerprint, nextStep: 'restrict the file ACL to the service account (see B06 procedure), then run check' }));
  } catch { fail('created_but_not_loadable'); }
}
