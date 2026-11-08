import { z } from 'zod';
import fs from 'node:fs';
import { MAIN_TARGET } from './administrative-policy.js';

// B05.5 stage 10 - the operator-issued authorization of ONE read-only inspection of two_sides_db. THIS STAGE ISSUES NONE: no authorization file exists in the
// repository and nothing here writes one except the explicit generator script. It is not interchangeable with the integration launch authorization:
// different `kind`, different destination literals, a window of at most 60 minutes and an explicit statement of which identity runs the inspection.
export class InspectionAuthorizationError extends Error {
  constructor(code = 'authorization_rejected') { super('Inspection authorization unavailable.'); this.name = 'InspectionAuthorizationError'; this.code = code; }
}
export const INSPECTION_MAX_WINDOW_MS = 60 * 60 * 1000;
const FORBIDDEN_USERS = Object.freeze(['twosides_integration_test']);
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/).refine(v => Number.isFinite(Date.parse(v)));
const schema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.literal('atlas-main-schema-inspection'),
  executionId: z.string().regex(/^[0-9a-f]{32}$/),
  host: z.literal(MAIN_TARGET.host), database: z.literal(MAIN_TARGET.database),
  user: z.string().regex(/^[A-Za-z0-9_]{3,64}$/).refine(u => !FORBIDDEN_USERS.includes(u.toLowerCase())),
  // dedicated-read-only: a separate identity whose only role is `read` on two_sides_db (preferred).
  // rotated-backend: the backend identity twosides_backend, allowed only after its password was rotated (B00); its role is readWrite, so the tool's own
  // read-only guarantee (no write call exists in the code) is what protects the data, not the privileges.
  identity: z.enum(['dedicated-read-only', 'rotated-backend']),
  notBefore: iso, notAfter: iso,
}).refine(a => (a.identity === 'rotated-backend') === (a.user === MAIN_TARGET.user));

export function parseInspectionAuthorization(text, now = Date.now()) {
  let parsed;
  try { parsed = schema.parse(JSON.parse(text)); } catch { throw new InspectionAuthorizationError('authorization_invalid'); }
  const from = Date.parse(parsed.notBefore), to = Date.parse(parsed.notAfter);
  if (!(to > from) || to - from > INSPECTION_MAX_WINDOW_MS) throw new InspectionAuthorizationError('authorization_window_invalid');
  if (now < from) throw new InspectionAuthorizationError('authorization_not_yet_valid');
  if (now >= to) throw new InspectionAuthorizationError('authorization_expired');
  return Object.freeze(parsed);
}

// A small regular file (no link, <= 4 KiB). The content is data, never executed.
export function readInspectionAuthorization(file, now = Date.now()) {
  try {
    if (typeof file !== 'string' || !file) throw new Error();
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 4096) throw new Error();
    return parseInspectionAuthorization(fs.readFileSync(file, 'utf8'), now);
  } catch (error) {
    throw error instanceof InspectionAuthorizationError ? error : new InspectionAuthorizationError('authorization_missing');
  }
}
