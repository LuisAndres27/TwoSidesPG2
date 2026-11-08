import { canonical } from '../../../src/modules/sync/canonical-envelope.js';
import { receiptSchema } from '../../../src/modules/sync/schemas.js';

// Test-only model of the future transport boundary; never opens SQLite or calls Godot.
export function applySyntheticAck(row,result,account,now) {
  const core=receiptSchema.safeParse(result.receipt);
  if(!core.success || !['committed','duplicate','superseded'].includes(result.status))return false;
  const r=core.data;
  if(r.technicalAccountId!==account || ['operationId','localPlayerId','installationId','bindingGeneration','payloadHash'].some(k=>r[k]!==row[k]))return false;
  if(row.state==='confirmed')return canonical(row.receipt)===canonical(r);
  if(row.state!=='in_flight' || row.leaseUntil<=now || result.attempt?.leaseId!==row.leaseId || result.attempt?.attempt!==row.attempt)return false;
  row.state='confirmed';row.receipt=structuredClone(r);return true;
}
