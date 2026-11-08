import { z } from 'zod';
import fs from 'node:fs';
import { MAIN_TARGET } from './administrative-policy.js';

// B05.5 stage 12 - the operator-issued authorization of ONE bootstrap run of the main_v2 schema in two_sides_db. THIS STAGE ISSUES NONE: no authorization file
// exists in the repository and only the explicit generator script writes one. It is not interchangeable with the inspection or the integration
// authorizations: its own `kind`, the main destination, the backend identity only, a window of at most 60 minutes, an explicit confirmation phrase and a
// statement that the identity's password was rotated (B00 stays pending: this is an attestation by the operator, not a resolution).
export class BootstrapAuthorizationError extends Error {
  constructor(code = 'authorization_rejected') { super('Bootstrap authorization unavailable.'); this.name = 'BootstrapAuthorizationError'; this.code = code; }
}
export const BOOTSTRAP_MAX_WINDOW_MS = 60 * 60 * 1000;
export const BOOTSTRAP_CONFIRMATION = 'CREATE_MAIN_V2_SCHEMA_IN_TWO_SIDES_DB';
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/).refine(v => Number.isFinite(Date.parse(v)));
const schema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.literal('atlas-main-schema-bootstrap'),
  executionId: z.string().regex(/^[0-9a-f]{32}$/),
  host: z.literal(MAIN_TARGET.host), database: z.literal(MAIN_TARGET.database), user: z.literal(MAIN_TARGET.user), namespace: z.literal('main_v2'),
  // plan-only reads and reports the plan (zero writes); apply performs it. The same file never does both.
  mode: z.enum(['plan-only', 'apply']),
  confirmation: z.literal(BOOTSTRAP_CONFIRMATION), passwordRotationConfirmed: z.literal(true),
  notBefore: iso, notAfter: iso,
});

export function parseBootstrapAuthorization(text, now = Date.now()) {
  let parsed;
  try { parsed = schema.parse(JSON.parse(text)); } catch { throw new BootstrapAuthorizationError('authorization_invalid'); }
  const from = Date.parse(parsed.notBefore), to = Date.parse(parsed.notAfter);
  if (!(to > from) || to - from > BOOTSTRAP_MAX_WINDOW_MS) throw new BootstrapAuthorizationError('authorization_window_invalid');
  if (now < from) throw new BootstrapAuthorizationError('authorization_not_yet_valid');
  if (now >= to) throw new BootstrapAuthorizationError('authorization_expired');
  return Object.freeze(parsed);
}

// A small regular file (no link, <= 4 KiB). The content is data, never executed.
export function readBootstrapAuthorization(file, now = Date.now()) {
  try {
    if (typeof file !== 'string' || !file) throw new Error();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 4096) throw new Error();
    return parseBootstrapAuthorization(fs.readFileSync(file, 'utf8'), now);
  } catch (error) {
    throw error instanceof BootstrapAuthorizationError ? error : new BootstrapAuthorizationError('authorization_missing');
  }
}
