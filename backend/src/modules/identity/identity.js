import { randomBytes, randomUUID } from 'node:crypto';
import { invalidRequest } from '../../utils/errors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

export const generateId = () => randomUUID();
// Synthetic clients/tests use this helper. HTTP registration never generates a replacement secret.
export const generateCredential = () => randomBytes(32).toString('base64url');
export const isUuid = value => typeof value === 'string' && uuidPattern.test(value);
export function isSecret(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, 'base64url').length === 32
    && Buffer.from(value, 'base64url').toString('base64url') === value;
}

export function validateDisplayName(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.isWellFormed()) throw invalidRequest();
  // Check controls before trimming, so line breaks cannot disappear into an accepted name.
  if (/[\p{Cc}\p{Zl}\p{Zp}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw invalidRequest();
  const normalized = value.trim().normalize('NFC');
  if (Buffer.byteLength(normalized, 'utf8') > 256 || !/[\p{L}\p{N}\p{P}\p{S}]/u.test(normalized)) throw invalidRequest();
  const length = [...segmenter.segment(normalized)].length;
  if (length < 1 || length > 32) throw invalidRequest();
  return normalized;
}

export const internalEmail = id => {
  if (!isUuid(id)) throw invalidRequest();
  return `acct.${id}@identity.two-sides.invalid`;
};

export function publicIdentity(record) {
  return {
    schemaVersion: 1,
    technicalAccountId: record.technicalAccountId,
    internalEmail: record.internalEmail,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function validateBody(body, identifier) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw invalidRequest();
  const keys = Object.keys(body);
  if (keys.length !== 3 || !keys.every(key => ['schemaVersion', identifier, 'credential'].includes(key))
    || body.schemaVersion !== 1 || !isUuid(body[identifier]) || !isSecret(body.credential)) throw invalidRequest();
  return body;
}
