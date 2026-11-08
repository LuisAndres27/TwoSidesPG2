import path from 'node:path';
import { assertSigningKeyPath, assertKeyId } from './signing-key.js';
import { MainError } from './policy.js';

// Fixed layout of the private secrets directory of the main backend. Pure path logic: nothing here touches the disk, the environment or a secret.
//   %LOCALAPPDATA%\TwoSidesMainSecrets\
//     keys\main-jwt.pem      persistent RS256 signing key (PKCS#8). The ONLY secret file; created by an operator tool, never by the backend.
//     main-config.json       NON-secret settings of the operator (key id, port). Optional; the launcher passes them as parameters today.
// The database password is NOT stored here: it is typed into a hidden prompt at every start (see B12).
export const SECRETS_DIRECTORY_NAME = 'TwoSidesMainSecrets';
export const SECRETS_KEY_RELATIVE = path.win32.join('keys', 'main-jwt.pem');
export const SECRETS_CONFIG_RELATIVE = 'main-config.json';

export function resolveSecretsLayout(localAppData) {
  const reject = () => new MainError('main_signing_key_rejected');
  if (typeof localAppData !== 'string' || !path.win32.isAbsolute(localAppData) || /[\0\r\n"]/.test(localAppData)) throw reject();
  const base = path.win32.resolve(localAppData);
  if (!/^[A-Za-z]:\\Users\\[^\\]+\\AppData\\Local$/i.test(base)) throw reject();               // the per-user, non-roaming, non-synchronised profile area
  const directory = path.win32.join(base, SECRETS_DIRECTORY_NAME), keyFile = path.win32.join(directory, SECRETS_KEY_RELATIVE);
  assertSigningKeyPath(keyFile);                                                                // same location policy as the loader: outside the project and OneDrive, never an env file
  return Object.freeze({ directory, keyDirectory: path.win32.dirname(keyFile), keyFile, configFile: path.win32.join(directory, SECRETS_CONFIG_RELATIVE) });
}
export const launcherArguments = (layout, keyId) => Object.freeze({ SigningKeyFile: layout.keyFile, KeyId: assertKeyId(keyId) });
