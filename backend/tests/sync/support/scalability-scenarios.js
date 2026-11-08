import { randomUUID } from 'node:crypto';
import { canonical, digest } from '../../../src/modules/sync/canonical-envelope.js';
import { integrationStack } from './integration-double.js';
import { vectors, batch, clone } from './fixture.js';

// Scenarios used both to MEASURE (before/after the ingestion change) and to ASSERT. Everything runs on the MongoDB DOUBLE through the real
// repositories and HTTP stack: counts are exact for the double and say nothing about Atlas latency, throughput or server-side cost.
export const A = { installationId: vectors.installationId, localPlayerId: vectors.localPlayerId, bindingGeneration: 1 };
export const newBinding = () => ({ installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 });

// The C# vectors belong to binding A. Re-addressing them to another player keeps every id (facts and operations are unique per owner scope).
export function rebind(operations, to, from = A) {
  return operations.map(op => {
    const copy = clone(op);
    const envelope = JSON.parse(copy.canonicalEnvelope.split(from.localPlayerId).join(to.localPlayerId).split(from.installationId).join(to.installationId));
    copy.canonicalEnvelope = canonical(envelope); copy.payloadHash = digest(copy.canonicalEnvelope);
    return copy;
  });
}
export const operationsFor = binding => binding === A ? clone(vectors.operations) : rebind(vectors.operations, binding);
export const send = (stack, player, operations) => stack.call('/api/v2/sync/batches', { method: 'POST', token: player.token, body: batch(operations) });
export const snapshotStats = db => structuredClone(db.stats);

// Registers `count` synthetic players and gives each the full 63-operation vector set (one HTTP batch each).
export async function fillPlayers(stack, count, { fresh = true } = {}) {
  const players = [];
  for (let i = 0; i < count; i++) {
    const binding = i === 0 && fresh ? A : newBinding();
    const player = await stack.player(binding); player.binding = binding;
    const response = await send(stack, player, operationsFor(binding));
    players.push({ player, response });
    stack.clock.value += 2 * 3600_000;   // the injected clock is frozen: move it so per-IP registration windows reset (tokens are used before this)
  }
  return players;
}

// Cost of ONE new operation (the first vector of a brand-new player) after `others` players already hold 63 operations each.
export async function costOfOneNewOperation(others) {
  const stack = await integrationStack(); await stack.listen();
  await fillPlayers(stack, others);
  stack.clock.value += 2 * 3600_000;
  const binding = newBinding(); const player = await stack.player(binding);
  stack.db.resetStats();
  const response = await send(stack, player, operationsFor(binding).slice(0, 1));
  return { others, accumulatedOperations: stack.db.rows.operations.length - 1, status: response.status, committed: response.json?.counters?.committed, stats: snapshotStats(stack.db), stack };
}
