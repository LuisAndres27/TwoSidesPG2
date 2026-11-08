import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicKey, createHash, createPrivateKey } from 'node:crypto';
import { importPKCS8, importSPKI } from 'jose';
import { MAIN_JWT, validateJwtConfig } from '../config/jwt.js';
import { MainError } from './policy.js';

// The persistent signing key of the main realm. It is supplied by the operator as an unencrypted PKCS#8 RSA PEM stored OUTSIDE the project, OneDrive and .env.
// Nothing here generates, writes, defaults or logs a key: every failure becomes the same MainError (a fixed code, no path, no driver or crypto message).
const REJECTED = () => new MainError('main_signing_key_rejected');
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const fold = value => (process.platform === 'win32' ? value.toLowerCase() : value);
export const SIGNING_KEY_FILE_LIMIT = 32768;
export const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PKCS8_PEM = /^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\s*$/;

// Pure, synchronous location policy shared by the loader and the provisioning tool.
export function assertSigningKeyPath(file) {
  if (typeof file !== 'string' || file.length < 4 || file.length > 400 || /[\0\r\n"]/.test(file) || !path.isAbsolute(file)) throw REJECTED();
  const absolute = path.resolve(file), normalized = fold(absolute), root = fold(PROJECT_ROOT);
  if (normalized === root || normalized.startsWith(root + path.sep) || /(^|[\\/])\.env(?:\.|$)/i.test(file) || /[\\/]OneDrive[^\\/]*[\\/]/i.test(file)) throw REJECTED();
  return absolute;
}
export const assertKeyId = keyId => { if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId)) throw REJECTED(); return keyId; };
// Public fingerprint (SHA-256 of the SPKI DER): safe to print and to compare across restarts.
export const publicFingerprint = publicKeyObject => createHash('sha256').update(publicKeyObject.export({ type: 'spki', format: 'der' })).digest('hex');

export async function inspectMainSigningKey(file, keyId) {
  try {
    const absolute = assertSigningKeyPath(file); assertKeyId(keyId);
    const stat = await fs.lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > SIGNING_KEY_FILE_LIMIT) throw REJECTED();
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) throw REJECTED();            // POSIX: private to the owner. Windows ACLs are an operator procedure (B00).
    let cursor = path.dirname(absolute);
    while (cursor !== path.dirname(cursor)) { if ((await fs.lstat(cursor)).isSymbolicLink()) throw REJECTED(); cursor = path.dirname(cursor); }
    const pem = await fs.readFile(absolute, 'utf8');
    if (!PKCS8_PEM.test(pem)) throw REJECTED();                                                // exactly one unencrypted PKCS#8 block: no public key, no certificate, no extras
    const privateObject = createPrivateKey(pem);
    if (privateObject.asymmetricKeyType !== 'rsa' || privateObject.asymmetricKeyDetails.modulusLength < 2048 || privateObject.asymmetricKeyDetails.modulusLength > 8192) throw REJECTED();
    const publicObject = createPublicKey(privateObject), publicPem = publicObject.export({ type: 'spki', format: 'pem' });
    const config = validateJwtConfig({ ...MAIN_JWT, algorithm: 'RS256', keyId, privateKey: await importPKCS8(pem, 'RS256'), publicKey: await importSPKI(publicPem, 'RS256') });
    return Object.freeze({ config, fingerprint: publicFingerprint(publicObject), bits: privateObject.asymmetricKeyDetails.modulusLength });
  } catch { throw REJECTED(); }
}
export async function loadMainSigningKey(file, keyId) { return (await inspectMainSigningKey(file, keyId)).config; }
