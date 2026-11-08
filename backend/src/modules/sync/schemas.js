import { z } from 'zod';
import { readCanonical, canonical, digest } from './canonical-envelope.js';
import { invalid } from './errors.js';

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const n = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), positive = n.min(1);
const key = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const utc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(s => !s.startsWith('0000-') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s);
const biome = z.enum(['ocean', 'jungle', 'desert', 'forest', 'tundra']);
const coverage = z.strictObject({ origin: z.enum(['live_capture', 'historical_import']), historicalCoverageUnknown: z.literal(true), incomplete: z.boolean() });
const decision = z.strictObject({ decisionId: uuid, operationId: uuid, biomeId: biome, decisionKey: key,
  optionId: z.enum(['reject', 'approve']), decisionOrder: positive, consequencesVersion: z.union([z.literal(1), z.literal(2)]),
  stateKind: z.enum(['healthy', 'degraded']), classification: z.strictObject({ kind: z.enum(['favorable', 'perjudicial']), version: key }).nullable(), rulesVersion: key, occurredAtUtc: utc });
const progress = z.strictObject({ biomeId: biome, status: z.enum(['human_pending', 'animal_pending', 'completed']),
  result: z.enum(['good', 'bad']).nullable(), humanCompletedAtUtc: utc.nullable(), animalCompletedAtUtc: utc.nullable() });
const game = z.strictObject({ gameId: uuid, revision: n, rulesVersion: key, contentVersion: key, saveFormatVersion: z.literal(1),
  status: z.enum(['in_progress', 'final_pending', 'completed', 'archived']), isCurrent: z.boolean(), createdAtUtc: utc, savedAtUtc: utc,
  ending: z.enum(['good', 'medium', 'bad']).nullable(), endingRulesVersion: key.nullable(), preparedAtUtc: utc.nullable(), closedAtUtc: utc.nullable(),
  biomes: z.array(progress).length(5), decisions: z.array(decision).max(5), coverage });
const session = z.strictObject({ sessionId: uuid, phase: z.enum(['open', 'terminal']), status: z.enum(['open', 'closed', 'interrupted']),
  startedAtUtc: utc, endedAtUtc: utc.nullable(), endOffsetMs: n.nullable(), coverage });
const event = z.strictObject({ eventId: uuid, sessionId: uuid, kind: z.enum(['ANIMAL_SEGMENT_STARTED', 'ANIMAL_DIED', 'ANIMAL_RESTART_REQUESTED',
  'ANIMAL_RETRY_REQUESTED', 'ANIMAL_SEGMENT_EXITED', 'ANIMAL_SEGMENT_COMPLETED']), occurredAtUtc: utc, offsetMs: n,
  gameId: uuid, biomeId: biome, animalRunId: uuid, deathCause: z.enum(['Unknown', 'Damage', 'Fall']).nullable(), sessionEnd: z.null(), version: z.literal(1) });
const interval = z.strictObject({ intervalId: uuid, sessionId: uuid, gameId: uuid.nullable(), biomeId: biome.nullable(), animalRunId: uuid.nullable(),
  startMs: n, endMs: n, state: z.enum(['ActiveHuman', 'ActiveAnimal', 'Paused', 'Menu', 'GameOver', 'Loading', 'Background']), version: z.literal(1) });
const base = { schemaVersion: z.literal(1), installationId: uuid, localPlayerId: uuid, bindingGeneration: positive,
  gameId: uuid.nullable(), sourceKey: z.string().min(1).max(192), createdAtUtc: utc };
export const envelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('game.report'), payload: game }), z.strictObject({ ...base, type: z.literal('session.report'), payload: session }),
  z.strictObject({ ...base, type: z.literal('gameplay.event'), payload: event }), z.strictObject({ ...base, type: z.literal('gameplay.interval'), payload: interval }),
]);
export const descriptorSchema = z.strictObject({ operationId: uuid, payloadHash: z.string().regex(/^[0-9a-f]{64}$/), leaseId: uuid, attempt: positive });
export const operationSchema = descriptorSchema.extend({ canonicalEnvelope: z.string().min(2).max(16384), dependencies: z.array(uuid).max(16) });
export const batchSchema = z.strictObject({ schemaVersion: z.literal(2), batchId: uuid, operations: z.array(z.unknown()).min(1).max(100) });
export const querySchema = z.strictObject({ schemaVersion: z.literal(2), attempts: z.array(descriptorSchema).min(1).max(100) });
export const receiptSchema = z.strictObject({ receiptVersion: z.literal(1), operationContractVersion: z.literal(1), technicalAccountId: uuid,
  operationId: uuid, localPlayerId: uuid, installationId: uuid, bindingGeneration: positive, payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  receiptId: uuid, committedAtUtc: utc, acceptedAs: z.enum(['committed', 'duplicate', 'superseded']) });
const keys = { ocean: 'ocean_waste_disposal', jungle: 'jungle_transport_route', desert: 'desert_cat_abandonment', forest: 'forest_industrial_pesticides', tundra: 'tundra_fossil_extraction' };
const require = ok => { if (!ok) throw invalid(); };
export function validateOperation(input) {
  const parsed = operationSchema.safeParse(input); if (!parsed.success) throw invalid('invalid_operation');
  const op = parsed.data;
  if (new Set(op.dependencies).size !== op.dependencies.length || op.dependencies.includes(op.operationId)) throw invalid('invalid_dependencies');
  const raw = readCanonical(op.canonicalEnvelope, op.payloadHash);
  if (raw?.schemaVersion !== 1 || !['game.report', 'session.report', 'gameplay.event', 'gameplay.interval'].includes(raw.type)) throw invalid('unsupported_contract');
  const shape = envelopeSchema.safeParse(raw); if (!shape.success) throw invalid();
  const e = shape.data, p = e.payload;
  require(e.gameId === (e.type === 'session.report' ? null : p.gameId));
  let sourceId, sourceKey;
  if (e.type === 'game.report') {
    sourceId = p.gameId; sourceKey = `game:${sourceId}:${p.revision}`;
    if (p.rulesVersion !== 'initial-state-only-1' || p.contentVersion !== 'copy-initial-content-1') throw invalid('unsupported_rules_version');
    require(new Set(p.biomes.map(b => b.biomeId)).size === 5 && p.coverage.incomplete);
    for (const field of ['decisionId', 'operationId', 'biomeId', 'decisionOrder']) require(new Set(p.decisions.map(d => d[field])).size === p.decisions.length);
    require(p.decisions.map(d => d.decisionOrder).sort((a,b) => a-b).every((n,i) => n === i+1));
    for (const d of p.decisions) require(d.decisionKey === keys[d.biomeId] && d.rulesVersion === p.rulesVersion &&
      d.stateKind === (d.optionId === 'reject' ? 'healthy' : 'degraded') && (d.consequencesVersion === 1 ? d.classification === null : d.classification !== null));
    for (const b of p.biomes) {
      const d = p.decisions.find(d => d.biomeId === b.biomeId);
      if (!d) require(b.status === 'human_pending' && b.result === null && b.humanCompletedAtUtc === null && b.animalCompletedAtUtc === null);
      else if (b.status === 'completed') require(b.result === (d.optionId === 'reject' ? 'good' : 'bad'));
      else require(b.status === 'animal_pending' && b.result === null && b.animalCompletedAtUtc === null);
    }
    if (['final_pending','completed'].includes(p.status)) {
      const count = p.decisions.filter(d => d.optionId === 'reject').length;
      require(p.decisions.length === 5 && p.biomes.every(b => b.status === 'completed') && p.endingRulesVersion === 'local-ending-reject-count-1' &&
        p.ending === (count === 5 ? 'good' : count >= 3 ? 'medium' : 'bad') && (p.status !== 'completed' || !p.isCurrent));
    }
  } else if (e.type === 'session.report') {
    sourceId = p.sessionId; sourceKey = `session:${sourceId}:${p.phase}`;
    if (p.phase === 'open') require(p.status === 'open' && p.endedAtUtc === null && p.endOffsetMs === null && p.coverage.incomplete);
    else require(p.endOffsetMs !== null && (p.status === 'closed' ? p.endedAtUtc !== null && !p.coverage.incomplete : p.status === 'interrupted' && p.endedAtUtc === null && p.coverage.incomplete));
  } else if (e.type === 'gameplay.event') {
    sourceId = p.eventId; sourceKey = `event:${sourceId}`;
    require(p.kind === 'ANIMAL_DIED' ? p.deathCause !== null : p.deathCause === null);
    if (p.kind === 'ANIMAL_SEGMENT_STARTED') require(p.eventId === p.animalRunId);
  } else {
    sourceId = p.intervalId; sourceKey = `interval:${sourceId}`;
    require(p.endMs >= p.startMs && (p.gameId !== null || (p.biomeId === null && p.animalRunId === null)) &&
      (p.animalRunId === null || (p.gameId !== null && p.biomeId !== null)));
    if (p.state === 'ActiveAnimal') require(p.animalRunId !== null);
    if (p.state === 'ActiveHuman') require(p.gameId !== null && p.biomeId !== null && p.animalRunId === null);
  }
  require(e.sourceKey === sourceKey);
  return { ...op, envelope: e, sourceId, factDigest: digest(canonical({ schemaVersion: 1, type: e.type, gameId: e.gameId, sourceKey, payload: p })) };
}
