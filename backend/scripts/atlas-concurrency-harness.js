// F.1 preparation only. No connector, stdin, credential receiver, URI or auto-run.
import {randomUUID} from 'node:crypto';
import {batch} from '../tests/sync/support/fixture.js';
import {canonical,digest} from '../src/modules/sync/canonical-envelope.js';
export const concurrencySafety=Object.freeze({phase:'B05.4C.2F.1',remoteEnabled:false,
  blockingReason:'REVOCATION_COMMIT_RACE_REQUIRES_REVIEW',maxParallelRequests:2,maxApplicationAttempts:20,
  operationBudgetMs:2000,batchBudgetMs:10000,transactionBudgetMs:10000});
export function prepareConcurrencyPlan(){
  return Object.freeze({runId:randomUUID().replaceAll('-',''),...concurrencySafety,
    cases:Object.freeze(['identical','contradictory','same-owner-distinct','different-owners',
      'unique-key','write-conflict','transient-transaction','unknown-commit','lost-response','restart-receipt']),
    // Intentionally no executable command or private run directory in F.1.
    requiresIndependentF2Authorization:true});
}
export async function executeAtlasConcurrencyRun(){
  const error=new Error('Remote concurrency is blocked pending authorization security review.');
  error.code=concurrencySafety.blockingReason;throw error;
}
export function concurrencyOperation(template,{operationId=randomUUID(),sessionId=randomUUID(),contradiction=false}={}){
  const op=structuredClone(template),e=JSON.parse(op.canonicalEnvelope);
  if(e.type!=='session.report'||e.payload.phase!=='open')throw new Error('Synthetic open session fixture required');
  op.operationId=operationId;op.leaseId=randomUUID();op.dependencies=[];
  e.payload.sessionId=sessionId;e.sourceKey='session:'+sessionId+':open';
  if(contradiction)e.createdAtUtc='2026-10-29T00:00:00.000Z';
  op.canonicalEnvelope=canonical(e);op.payloadHash=digest(op.canonicalEnvelope);return op;
}
export function exactCleanupInventory(rows,manifest){
  if(!manifest||!/^[0-9a-f]{32}$/.test(manifest.runId)||!Array.isArray(rows)||rows.length>20)throw new Error('Invalid cleanup scope');
  const seen=new Set();
  return rows.map(row=>{
    const allowed=manifest.documents.find(d=>d.collection===row.collection&&d.id===row.document?._id);
    const doc=row.document,key=row.collection+':'+(row.document?._id??'');
    const prefix='b054c2c_'+manifest.runId+'_';
    const owner=doc?.technicalAccountId??doc?.record?.receipt?.technicalAccountId??doc?.scope?.split(':')[0];
    const ownerVerified=allowed?.technicalAccountId?owner===allowed.technicalAccountId:
      allowed?.kind==='fence'&&doc?._id==='ingestion-v1'&&Number.isSafeInteger(doc?.revision);
    if(!allowed||!['ops','facts','fence','authorization'].some(s=>row.collection===prefix+s)||seen.has(key)||
      doc.integrationRunId!==manifest.runId||doc.syntheticOwnerId!==allowed.syntheticOwnerId||!ownerVerified)throw new Error('Unverified cleanup ownership');
    seen.add(key);const filter={_id:allowed.id,integrationRunId:manifest.runId,syntheticOwnerId:allowed.syntheticOwnerId};
    if(doc.technicalAccountId!==undefined)filter.technicalAccountId=allowed.technicalAccountId;
    else if(doc.scope!==undefined)filter.scope=doc.scope;
    return {collection:allowed.collection,filter};
  });
}
// Inject actors backed by the REAL MongoIngestionRepository. This case function has no
// network/bootstrap capability; offline doubles can inspect it while remote entry stays blocked.
export async function runPreparedConcurrencyPairs({actors,operations}){
  if(actors.length!==3||operations.length!==5)throw new Error('Fixed three actors/five operations required');
  let attempts=0;
  const send=(actor,op)=>{if(++attempts>8)throw new Error('Attempt limit');
    // Synthetic case construction only: distinct identities must have distinct registered bindings.
    const input=structuredClone(op),envelope=JSON.parse(input.canonicalEnvelope);
    for(const k of ['installationId','localPlayerId','bindingGeneration'])envelope[k]=actor.ctx[k];
    input.canonicalEnvelope=canonical(envelope);input.payloadHash=digest(input.canonicalEnvelope);
    return actor.service.batches(actor.ctx,batch([input]));};
  const [a,b,c]=actors,[identical,contradictory,distinctA,distinctB,owners]=operations;
  const changed=structuredClone(contradictory),e=JSON.parse(changed.canonicalEnvelope);e.createdAtUtc='2026-10-29T01:00:00.000Z';changed.canonicalEnvelope=canonical(e);changed.payloadHash=digest(changed.canonicalEnvelope);
  const receipt=r=>r.body.results[0].receipt,check=v=>{if(!v)throw new Error('Concurrent case failed');};
  const same=await Promise.all([send(a,identical),send(b,identical)]);
  check(same.every(r=>r.status===200)&&canonical(receipt(same[0]))===canonical(receipt(same[1])));
  const conflict=await Promise.all([send(a,contradictory),send(b,changed)]);check(conflict.map(r=>r.status).sort().join(',')==='200,409');
  const distinct=await Promise.all([send(a,distinctA),send(b,distinctB)]);check(distinct.every(r=>r.status===200));
  const separate=await Promise.all([send(a,owners),send(c,owners)]);check(separate.every(r=>r.status===200)&&receipt(separate[0]).technicalAccountId!==receipt(separate[1]).technicalAccountId);
  return {identical:true,contradictory:true,sameOwnerDistinct:true,differentOwners:true,applicationAttempts:attempts,maxParallelRequests:2};
}
