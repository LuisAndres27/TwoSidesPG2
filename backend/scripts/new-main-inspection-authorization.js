// Writes ONE inspection authorization file (src/main/inspection-authorization.js format) OUTSIDE the repository, valid from now for a fixed 60 minutes.
// It contains no password and nothing secret. It connects to nothing, reads no .env and never extends a window.
//   node scripts/new-main-inspection-authorization.js <absolute-output-dir> <dedicated-read-only|rotated-backend> [<inspection-user>]
// dedicated-read-only needs the name of the separate read-only user; rotated-backend means twosides_backend AFTER its password was rotated (B00).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAIN_TARGET } from '../src/main/administrative-policy.js';
import { parseInspectionAuthorization } from '../src/main/inspection-authorization.js';

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [dir, identity, user] = process.argv.slice(2);
const usage = () => { console.error('usage: node scripts/new-main-inspection-authorization.js <absolute-output-dir> <dedicated-read-only <user> | rotated-backend>'); process.exit(1); };
if (!dir || !path.isAbsolute(dir) || !['dedicated-read-only', 'rotated-backend'].includes(identity) || (identity === 'dedicated-read-only') !== (typeof user === 'string') || process.argv.length > 5) usage();
const target = path.resolve(dir);
if (target.toLowerCase().startsWith(repo.toLowerCase())) { console.error('refused: the authorization must live outside the repository'); process.exit(1); }
fs.mkdirSync(target, { recursive: true });
const now = Date.now(), cut = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const body = { schemaVersion: 1, kind: 'atlas-main-schema-inspection', executionId: randomBytes(16).toString('hex'), host: MAIN_TARGET.host, database: MAIN_TARGET.database,
  user: identity === 'rotated-backend' ? MAIN_TARGET.user : user, identity, notBefore: cut(now), notAfter: cut(now + 60 * 60 * 1000) };
const text = JSON.stringify(body, null, 2);
parseInspectionAuthorization(text, now + 1000);   // must satisfy the real contract before it is written
const file = path.join(target, `main-inspection-authorization-${body.executionId}.json`);
fs.writeFileSync(file, text, { flag: 'wx' });
console.log(JSON.stringify({ file, executionId: body.executionId, identity, notBefore: body.notBefore, notAfter: body.notAfter }));
