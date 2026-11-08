import { z } from 'zod';
import fs from 'node:fs';
import { ATLAS_TARGET } from '../modules/sync/atlas-policy.js';

// B05.5 stage 7 - the operator-issued launch authorization the manual launcher requires. THIS STAGE ISSUES NONE: there is no authorization file in the
// repository and no code that writes one. The launcher refuses to start without a valid, current one, so connecting needs an explicit decision.
export class LaunchAuthorizationError extends Error {
  constructor(code = 'authorization_rejected') { super('Launch authorization unavailable.'); this.name = 'LaunchAuthorizationError'; this.code = code; }
}
export const MAX_WINDOW_MS = 4 * 60 * 60 * 1000;
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/).refine(v => Number.isFinite(Date.parse(v)));
const schema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.literal('atlas-integration-launch'),
  executionId: z.string().regex(/^[0-9a-f]{32}$/),
  host: z.literal(ATLAS_TARGET.host), database: z.literal(ATLAS_TARGET.database), user: z.literal(ATLAS_TARGET.user),
  notBefore: iso, notAfter: iso,
  allowCollectionPreparation: z.boolean(), maxSyntheticPlayers: z.number().int().min(1).max(4),
});

export function parseLaunchAuthorization(text, now = Date.now()) {
  let parsed;
  try { parsed = schema.parse(JSON.parse(text)); } catch { throw new LaunchAuthorizationError('authorization_invalid'); }
  const from = Date.parse(parsed.notBefore), to = Date.parse(parsed.notAfter);
  if (!(to > from) || to - from > MAX_WINDOW_MS) throw new LaunchAuthorizationError('authorization_window_invalid');
  if (now < from) throw new LaunchAuthorizationError('authorization_not_yet_valid');
  if (now >= to) throw new LaunchAuthorizationError('authorization_expired');
  return Object.freeze(parsed);
}

// Reads a small regular file (no link, <= 4 KiB). The content is data, never executed.
export function readLaunchAuthorization(file, now = Date.now()) {
  try {
    if (typeof file !== 'string' || !file) throw new Error();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 4096) throw new Error();
    return parseLaunchAuthorization(fs.readFileSync(file, 'utf8'), now);
  } catch (error) {
    throw error instanceof LaunchAuthorizationError ? error : new LaunchAuthorizationError('authorization_missing');
  }
}
