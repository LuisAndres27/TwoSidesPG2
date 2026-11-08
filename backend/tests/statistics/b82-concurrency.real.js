import './b80-isolation-guard.js';
import {it,expect} from 'vitest';import {randomUUID} from 'node:crypto';
import {createB82RealFixture} from './b82-fixture.js';import {value} from './b80-fixture.js';
import {StatisticsUnavailable,TransactionConflict} from '../../src/modules/statistics/transaction-contract.js';
const sum=writers=>Object.fromEntries(Object.keys(writers[0].metrics).map(k=>[k,writers.reduce((n,w)=>n+w.metrics[k],0)]));
const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]-b[k]]));
const latency=rows=>{const ss=rows.map(x=>x.ms).sort((a,b)=>a-b),p=f=>Number((ss[Math.min(ss.length-1,Math.ceil(ss.length*f)-1)]??0).toFixed(2));return {p50:p(.5),p95:p(.95),max:p(1)};};
async function send(writer,v){const began=performance.now();try{const outcome=await writer.repository.commit(v);return {value:v,...outcome,ms:performance.now()-began};}catch(e){if(!(e instanceof StatisticsUnavailable))throw e;return {value:v,status:'retryable',code:'storage_unavailable',ms:performance.now()-began};}}
it.each([3,4,8])('REAL B82: %s independent writers; bounded contention and stable-ID recovery',async n=>{
 const f=await createB82RealFixture(),writers=[f.first],installation=randomUUID(),unique=[];let sequence=0;
 const next=()=>{const i=sequence++;const v=value(installation,{Data:JSON.stringify({state:'ActiveHuman',startMs:i*30000,endMs:(i+1)*30000,active:true,excluded:false})},f.clock.now);unique.push(v);return v;};
 try{
  for(let i=1;i<n;i++)writers.push(await f.writer());
  console.log('B82_RUN',JSON.stringify({database:f.runtime.config.database,containerId:f.runtime.container.id,serverVersion:f.runtime.serverVersion,writers:n,policy:'b82-run-hybrid-v1',restart:false}));
  async function wave(name,inputs){
   const before=sum(writers),rows=await Promise.all(inputs.map((v,i)=>send(writers[i%n],v))),initialMetrics=delta(sum(writers),before);
   expect(rows.some(x=>x.status==='rejected')).toBe(false);
   const exhausted=rows.filter(x=>x.status==='retryable'),recoveryBefore=sum(writers),recovered=[];
   // Separate CLIENT recovery: one FIFO replay per exhausted request, same bytes and IDs.
   // It does not add attempts to the original contended transaction (still maximum three).
   for(const r of exhausted){const replay=await send(writers[0],r.value);recovered.push(replay);expect(['accepted','duplicate']).toContain(replay.status);}
   const report={scenario:name,writers:n,submitted:rows.length,accepted:rows.filter(r=>r.status==='accepted').length,duplicates:rows.filter(r=>r.status==='duplicate').length,initialExhausted:exhausted.length,initialAttempts:initialMetrics.attempts,initialRetries:Math.max(0,initialMetrics.attempts-rows.length),classifiedConflicts:initialMetrics.classifiedConflicts,serverWriteConflicts112:initialMetrics.serverWriteConflicts,serverDuplicateKeys11000:initialMetrics.serverDuplicateKeys,commits:initialMetrics.commits,aborts:initialMetrics.aborts,latencyMs:latency(rows),fifoRecoveryRequests:recovered.length,fifoRecovered:recovered.filter(r=>['accepted','duplicate'].includes(r.status)).length,recoveryMetrics:delta(sum(writers),recoveryBefore),recoveryLatencyMs:latency(recovered)};
   expect(report.initialAttempts).toBeLessThanOrEqual(rows.length*3);console.log('B82_CONCURRENCY',JSON.stringify(report));return rows;
  }
  const first=Array.from({length:2*n},next);await wave('A_distinct_same_aggregate',first);
  await wave('B_duplicate_events',Array.from({length:2*n},(_,i)=>first[i%first.length]));
  const mixed=[];for(let i=0;i<n;i++)mixed.push(next(),first[i]);await wave('C_new_and_duplicate',mixed);
  let injected=false;writers[0].point(async name=>{if(name==='before_commit'&&!injected){injected=true;throw new TransactionConflict();}});
  await wave('F_application_injected_precommit_abort',[next()]);writers[0].point(async()=>{});expect(injected).toBe(true);
  const state=await writers[0].adapter.readCommitted();expect(state.counts['all|events']).toBe(3*n+1);expect(state.counts['all|effective_ms']).toBe((3*n+1)*30000);expect(Object.keys(state.receipts)).toHaveLength(3*n+1);
  const expectedHashes=new Set(unique.map(v=>v.hash));for(const r of Object.values(state.receipts)){expect(expectedHashes.has(r.hash)).toBe(true);expect(r.revision).toBeLessThanOrEqual(state.revision);}
  console.log('B82_FINAL',JSON.stringify({writers:n,uniqueEvents:unique.length,events:state.counts['all|events'],effectiveMs:state.counts['all|effective_ms'],receipts:Object.keys(state.receipts).length,partialStates:false,transientInjection:'APPLICATION_NOT_SERVER_FAILPOINT'}));
 }finally{await f.close();console.log('B82_CLEANUP',JSON.stringify({database:f.runtime.config.database,deleted:true,containerRestarted:false}));}
});
