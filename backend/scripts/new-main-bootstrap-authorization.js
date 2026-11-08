// Writes ONE bootstrap authorization file (src/main/bootstrap-authorization.js format) OUTSIDE the repository, valid from now for a fixed 60 minutes.
// It contains no password and nothing secret. It connects to nothing, reads no .env and never extends a window.
//   node scripts/new-main-bootstrap-authorization.js <absolute-output-dir> <plan-only|apply> --password-rotated
// `--password-rotated` is the operator's explicit statement that the twosides_backend password was rotated (B00 stays pending until it is closed in writing).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAIN_TARGET } from '../src/main/administrative-policy.js';
import { BOOTSTRAP_CONFIRMATION, parseBootstrapAuthorization } from '../src/main/bootstrap-authorization.js';

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [dir, mode, flag] = process.argv.slice(2);
const usage = () => { console.error('usage: node scripts/new-main-bootstrap-authorization.js <absolute-output-dir> <plan-only|apply> --password-rotated'); process.exit(1); };
if (!dir || !path.isAbsolute(dir) || !['plan-only', 'apply'].includes(mode) || flag !== '--password-rotated' || process.argv.length !== 5) usage();
const target = path.resolve(dir);
if (target.toLowerCase().startsWith(repo.toLowerCase())) { console.error('refused: the authorization must live outside the repository'); process.exit(1); }
fs.mkdirSync(target, { recursive: true });
const now = Date.now(), cut = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const body = { schemaVersion: 1, kind: 'atlas-main-schema-bootstrap', executionId: randomBytes(16).toString('hex'), host: MAIN_TARGET.host, database: MAIN_TARGET.database, user: MAIN_TARGET.user,
  namespace: 'main_v2', mode, confirmation: BOOTSTRAP_CONFIRMATION, passwordRotationConfirmed: true, notBefore: cut(now), notAfter: cut(now + 60 * 60 * 1000) };
const text = JSON.stringify(body, null, 2);
parseBootstrapAuthorization(text, now + 1000);   // must satisfy the real contract before it is written
const file = path.join(target, `main-bootstrap-authorization-${body.executionId}.json`);
fs.writeFileSync(file, text, { flag: 'wx' });
console.log(JSON.stringify({ file, executionId: body.executionId, mode, notBefore: body.notBefore, notAfter: body.notAfter }));
