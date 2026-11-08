// Writes ONE launch authorization file (src/integration/authorization.js format) OUTSIDE the repository, valid from now for a fixed 60 minutes.
// It contains no password and nothing secret: only the fixed destination, a fresh execution id and the window. It connects to nothing, reads no .env
// and never extends a window: when it expires, running this again is a new, explicit issuance.   Usage:  node scripts/new-integration-authorization.js <absolute-output-dir> [--allow-preparation]
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ATLAS_TARGET } from '../src/modules/sync/atlas-policy.js';
import { parseLaunchAuthorization } from '../src/integration/authorization.js';

const repo = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const [dir, ...rest] = process.argv.slice(2);
if (!dir || !path.isAbsolute(dir) || rest.some(a => a !== '--allow-preparation') || rest.length > 1) { console.error('usage: node scripts/new-integration-authorization.js <absolute-output-dir> [--allow-preparation]'); process.exit(1); }
const target = path.resolve(dir);
if (target.toLowerCase().startsWith(repo.toLowerCase())) { console.error('refused: the authorization must live outside the repository'); process.exit(1); }
fs.mkdirSync(target, { recursive: true });
const now = Date.now(), cut = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const body = { schemaVersion: 1, kind: 'atlas-integration-launch', executionId: randomBytes(16).toString('hex'), host: ATLAS_TARGET.host, database: ATLAS_TARGET.database, user: ATLAS_TARGET.user,
  notBefore: cut(now), notAfter: cut(now + 60 * 60 * 1000), allowCollectionPreparation: rest.includes('--allow-preparation'), maxSyntheticPlayers: 1 };
const text = JSON.stringify(body, null, 2);
parseLaunchAuthorization(text, now + 1000);   // must satisfy the real contract before it is written
const file = path.join(target, `launch-authorization-${body.executionId}.json`);
fs.writeFileSync(file, text, { flag: 'wx' });
console.log(JSON.stringify({ file, executionId: body.executionId, notBefore: body.notBefore, notAfter: body.notAfter, allowCollectionPreparation: body.allowCollectionPreparation }));
