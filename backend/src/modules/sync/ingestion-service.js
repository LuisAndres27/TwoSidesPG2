import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ApiError } from '../../utils/errors.js';
import { assertSyncContext } from '../../middleware/sync-auth-context.js';
import { assertIngestionRepository } from './ingestion-repository.js';
import { batchSchema, querySchema, uuid, validateOperation } from './schemas.js';
import { IngestionError, unavailable } from './errors.js';
import { bounded, COMMIT_GRACE_MS } from './budget.js';
function safe(error) {
  if(error instanceof IngestionError)return error;
  if(error instanceof ApiError && [401,403,429,503].includes(error.status))return new IngestionError(error.status,
    error.status===401?'authentication_expired':error.status===403?'forbidden':error.status===429?'quota_exceeded':'storage_unavailable',[401,429,503].includes(error.status));
  return unavailable();
}
function cycles(ops) {
  const graph=new Map(ops.filter(x=>x.value).map(x=>[x.value.operationId,x.value.dependencies]));
  const invalid=new Set(),done=new Set();
  function visit(id,path){if(path.includes(id)){for(const node of path.slice(path.indexOf(id)))invalid.add(node);return;}if(done.has(id))return;
    for(const dep of graph.get(id)??[])if(graph.has(dep))visit(dep,[...path,id]);done.add(id);}
  for(const id of graph.keys())visit(id,[]);return invalid;
}
export class IngestionService {
  constructor({repository,identityRepository,operationBudgetMs=2000,batchBudgetMs=10000,commitGraceMs=COMMIT_GRACE_MS}) {
    this.repository=assertIngestionRepository(repository,identityRepository);this.identityRepository=identityRepository;
    if(!Number.isInteger(operationBudgetMs)||operationBudgetMs<1||operationBudgetMs>2000||!Number.isInteger(batchBudgetMs)||batchBudgetMs<1||batchBudgetMs>10000)throw new Error('Invalid sync budgets');
    if(!Number.isInteger(commitGraceMs)||commitGraceMs<1||commitGraceMs>COMMIT_GRACE_MS)throw new Error('Invalid sync budgets');   // F2: grace for a commit already in flight, never above 3000 ms
    this.operationBudgetMs=operationBudgetMs;this.batchBudgetMs=batchBudgetMs;this.commitGraceMs=commitGraceMs;
  }
  async batches(context,body) {
    assertSyncContext(context,this.identityRepository);
    if(!body || typeof body!=='object' || Array.isArray(body) || !Object.hasOwn(body,'schemaVersion'))throw new IngestionError(400,'invalid_request');
    if(body.schemaVersion!==2)throw new IngestionError(422,'unsupported_contract');
    if(Array.isArray(body.operations)&&body.operations.length>100)throw new IngestionError(413,'payload_too_large');
    const shape=batchSchema.safeParse(body);if(!shape.success)throw new IngestionError(400,'invalid_request');
    const ids=body.operations.map(x=>uuid.safeParse(x?.operationId)).filter(x=>x.success).map(x=>x.data);
    if(new Set(ids).size!==ids.length)throw new IngestionError(400,'duplicate_operation_id');
    const ops=body.operations.map(input=>{try{return {value:validateOperation(input)};}catch(error){return {error:safe(error)};}});
    const cyclic=cycles(ops),end=performance.now()+this.batchBudgetMs,results=[];let halted=false;   // halted: a commit of UNKNOWN outcome (F2/D3) - the rest of the batch is not started
    for(let index=0;index<ops.length;index++) {
      const entry=ops[index],input=body.operations[index];
      const id=uuid.safeParse(input?.operationId),operationId=id.success?id.data:null;
      try {
        if(halted)throw unavailable();
        if(entry.error)throw entry.error;
        if(cyclic.has(operationId))throw new IngestionError(422,'invalid_dependencies');
        const remaining=end-performance.now();if(remaining<=0)throw unavailable();
        const result=await bounded(signal=>this.repository.acceptOperation(context,entry.value,signal),Math.min(remaining,this.operationBudgetMs),{graceMs:this.commitGraceMs,hardDeadline:end});
        results.push({index,operationId,status:result.status,httpStatus:result.status==='committed'?201:200,
          receipt:result.receipt,attempt:{leaseId:input.leaseId,attempt:input.attempt}});
      }catch(error){if(error?.commitOutcome==='unknown')halted=true;const e=safe(error);results.push({index,operationId,status:e.retryable?'deferred':e.httpStatus===409?'conflict':'rejected',httpStatus:e.httpStatus,
        error:{code:e.code,retryable:e.retryable,...(e.retryable?{retryAfterSeconds:1}:{})}});}
    }
    const counters={received:results.length,committed:0,duplicate:0,superseded:0,deferred:0,conflict:0,rejected:0};
    for(const r of results)counters[r.status]++;
    const positive=results.filter(r=>r.receipt).length;
    const outcome=positive===results.length?'all_accepted':positive?'partial':'none_accepted';
    let status=200;
    if(outcome==='partial')status=207;
    else if(!positive){
      if(results.every(r=>r.httpStatus===429))status=429;
      else if(results.some(r=>r.httpStatus===401))status=401;
      else if(results.every(r=>r.httpStatus===403))status=403;
      else if(results.some(r=>r.error.retryable))status=503;
      else if(results.some(r=>r.status==='conflict'))status=409;
      else status=422;
    }
    return {status,body:{schemaVersion:2,batchId:body.batchId,requestId:randomUUID(),outcome,counters,results}};
  }
  async receipts(context,body) {
    assertSyncContext(context,this.identityRepository);
    if(!body || typeof body!=='object' || Array.isArray(body) || !Object.hasOwn(body,'schemaVersion'))throw new IngestionError(400,'invalid_request');
    if(body.schemaVersion!==2)throw new IngestionError(422,'unsupported_contract');
    if(Array.isArray(body.attempts)&&body.attempts.length>100)throw new IngestionError(413,'payload_too_large');
    const parsed=querySchema.safeParse(body);if(!parsed.success)throw new IngestionError(400,'invalid_request');
    const attempts=parsed.data.attempts;
    if(new Set(attempts.map(x=>x.operationId)).size!==attempts.length)throw new IngestionError(400,'duplicate_operation_id');
    const results=await bounded(signal=>this.repository.findReceipts(context,attempts,signal),this.operationBudgetMs,{graceMs:this.commitGraceMs});
    return {schemaVersion:2,requestId:randomUUID(),results};
  }
}
