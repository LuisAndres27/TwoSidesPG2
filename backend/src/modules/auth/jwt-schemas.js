import { z } from 'zod';
import { isSecret, isUuid } from '../identity/identity.js';
import { invalidRequest } from '../../utils/errors.js';

const uuid = z.string().max(36).refine(isUuid);
const credential = z.string().max(43).refine(isSecret);
export const registrationSchema = z.strictObject({ schemaVersion: z.literal(1), registrationId: uuid, credential });
export const sessionSchema = z.strictObject({ schemaVersion: z.literal(1), technicalAccountId: uuid, credential });
export const registrationV2Schema = z.strictObject({ schemaVersion: z.literal(2), registrationId: uuid, credential,
  installationId: uuid, localPlayerId: uuid, bindingGeneration: z.literal(1) });
export const sessionV2Schema = z.strictObject({ schemaVersion: z.literal(2), technicalAccountId: uuid, credential,
  installationId: uuid, localPlayerId: uuid });
export function validateJwtBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw invalidRequest();
  return result.data;
}
