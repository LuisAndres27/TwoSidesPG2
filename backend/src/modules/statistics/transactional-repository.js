import {createHmac} from 'node:crypto';
import {validateEvent,WINDOW_MS,FUTURE_MS} from './contract.js';
import {projectStatistics,assertAggregateInvariants} from './projection.js';
import {assertTransactionAdapter,TransactionConflict,CommitUncertain,StatisticsUnavailable} from './transaction-contract.js';
import {isSyntheticTransactionAdapter} from './snapshot-transaction-adapter.js';
import {BOUNDED_RETENTION,assertRetentionPolicy,usesRunSemanticMarkers} from './retention-policy.js';
const repositories=new WeakMap();
// B81.1: a real MongoDB aborts the LOSER of a write conflict immediately (WriteConflict 112, TransientTransactionError) while the winner is still
// inside its transaction, so three instantaneous retries can burn the whole budget in a few milliseconds (observed on MongoDB 8.0.34).
// Same three attempts, but a bounded randomized pause (at most ~270 ms in total) before each retry. No attempt is added and no check is relaxed.
const CONFLICT_PAUSE_MS=[30,90];
const retryPause=(attempt,signal)=>new Promise(resolve=>{
 if(signal?.aborted)return resolve();
 const timer=setTimeout(resolve,Math.round(CONFLICT_PAUSE_MS[attempt]*(1+Math.random())));
 signal?.addEventListener?.('abort',()=>{clearTimeout(timer);resolve();},{once:true});
});
export const isSyntheticStatisticsRepository=x=>isSyntheticTransactionAdapter(repositories.get(x));
export class TransactionalStatisticsRepository {
 #adapter;#key;#closed=false;#retentionPolicy;
 constructor({adapter,key,now=Date.now,dailyLimit=6000,retentionPolicy=BOUNDED_RETENTION}){
  if(!Buffer.isBuffer(key)||key.length!==32||!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>6000)throw Error('Statistics repository rejected');
  this.#retentionPolicy=assertRetentionPolicy(retentionPolicy);
  if((adapter?.retentionPolicy??BOUNDED_RETENTION)!==this.#retentionPolicy)throw Error('Statistics retention policy mismatch');
  this.#adapter=assertTransactionAdapter(adapter);this.#key=Buffer.from(key);Object.assign(this,{now,dailyLimit});repositories.set(this,adapter);
 }
 #tag(text){return createHmac('sha256',this.#key).update(text).digest('hex');}
 async commit(input,{signal}={}){
  const captured=structuredClone(input);if(typeof captured?.canonical!=='string'||!/^[a-f0-9]{64}$/.test(captured.hash??''))throw new StatisticsUnavailable();
  const installation=captured.event?.InstallationId;
  for(let attempt=0;attempt<3;attempt++){
   let key;
   try{
    const committed=await this.#adapter.runAtomic(async tx=>{
     const now=this.now(),value=validateEvent({EventJson:captured.canonical,PayloadHash:captured.hash},installation,now);
     if(value.error)return {status:'rejected',code:value.error};if(value.forbidden||!value.event)throw new StatisticsUnavailable();
     const e=value.event;key=this.#tag('event:'+e.InstallationId+':'+e.EventId);await tx.expire(now);
     await this.#adapter.checkpoint('before_idempotency');const old=await tx.get('receipts',key);await this.#adapter.checkpoint('after_idempotency');
     if(old)return {status:old.hash===value.hash?'duplicate':'rejected',code:old.hash===value.hash?'ok':'event_conflict'};
     const expires=Math.max(now,value.at)+WINDOW_MS+FUTURE_MS;
     const semantic=['installation_registered','game_started','game_completed','biome_completed','environmental_decision'].includes(e.Type)?this.#tag('fact:'+e.InstallationId+':'+e.Type+':'+(e.GameId??'')+':'+(e.BiomeId??'')):null;
     if(semantic&&await tx.get('semantic',semantic))return {status:'rejected',code:'fact_conflict'};
     const today=new Date(now).toISOString().slice(0,10),budget=this.#tag('budget:'+e.InstallationId+today),used=(await tx.get('budgets',budget))?.value??0;
     if(used>=this.dailyLimit)return {status:'retryable',code:'quota_exceeded'};
     const projection=projectStatistics(value);await this.#adapter.checkpoint('before_increment');
     let index=0;
     for(const increment of projection.increments){await tx.increment(increment.period,increment.key,increment.amount);await this.#adapter.checkpoint('after_increment',{index:index++});}
     for(const scope of projection.distinct){const distinct=this.#tag('active:'+scope.period+':'+e.InstallationId);if(!await tx.get('distinct',distinct)){await tx.insertUnique('distinct',distinct,{expires:scope.expires});await tx.increment(scope.period,'active_installations',1);}}
     await tx.put('budgets',budget,{value:used+1,expires:Date.parse(today+'T00:00:00.000Z')+86400000});
     if(semantic)await tx.insertUnique('semantic',semantic,usesRunSemanticMarkers(this.#retentionPolicy)?{retained:true}:{expires});await this.#adapter.checkpoint('before_receipt');
     await tx.insertUnique('receipts',key,{hash:value.hash,expires,revision:tx.revision});return {status:'accepted',code:'ok'};
    },{signal});
    if(committed?.committed!==true||!Number.isSafeInteger(committed.revision))throw new StatisticsUnavailable();return committed.result;
   }catch(error){
    if(error instanceof TransactionConflict&&attempt<2){await retryPause(attempt,signal);continue;}
    if(error instanceof CommitUncertain&&key){
     let proof;try{proof=await this.#adapter.lookupCommittedReceipt(key);}catch{throw new StatisticsUnavailable();}
     const receipt=proof.receipt;if(receipt&&receipt.hash===captured.hash&&Number.isSafeInteger(receipt.revision)&&receipt.revision<=proof.revision)return {status:'duplicate',code:'ok'};
    }
    throw new StatisticsUnavailable();
   }
  }
  throw new StatisticsUnavailable();
 }
 async aggregates(){const snapshot=await this.#adapter.readCommitted({includeTechnical:false});assertAggregateInvariants(snapshot.counts);return structuredClone(snapshot.counts);}
 async generalSummary(options={}){
  if(Object.keys(options).some(k=>k!=='period')||typeof(options.period??'all')!=='string')throw Error('Aggregate query rejected');
  const period=options.period??'all';if(! /^(all|day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$/.test(period))throw Error('Aggregate query rejected');
  if(period.startsWith('day:')){const date=Date.parse(period.slice(4)+'T00:00:00.000Z');if(!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==period.slice(4))throw Error('Aggregate query rejected');}
  if(period.startsWith('month:')&&!(Number(period.slice(-2))>=1&&Number(period.slice(-2))<=12))throw Error('Aggregate query rejected');
  const counts=await this.aggregates(),n=key=>counts[period+'|'+key]??0;
  if(n(period==='all'?'installations_registered':'active_installations')<5)return Object.freeze({available:false,reason:'insufficient_group',metrics:null});
  const metrics=Object.fromEntries(Object.entries(counts).filter(([k])=>k.startsWith(period+'|')).map(([k,v])=>[k.slice(period.length+1),v]));
  // Five installations in the whole period do NOT prove five contributors to each biome/ending cell.
  // Until there is an approved per-cell disclosure policy, publish only supported population counters.
  for(const key of Object.keys(metrics))if(!['installations_registered','active_installations'].includes(key)||metrics[key]<5)metrics[key]=null;
  return Object.freeze({available:true,period,metrics,derived:{activity_completion_ratio:null,closed_session_average_ms:null,completed_game_average_ms:null},limitations:['Detail cells suppressed pending contributor proof','No cohort completion rate','No closed-session time watermark','Client-reported capture period','No individual filtering']});
 }
 async maintenance(){if(!this.#closed)await this.#adapter.runAtomic(async tx=>{await tx.expire(this.now());return null;});}
 async close(){if(this.#closed)return;await this.maintenance();await this.#adapter.close();this.#closed=true;this.#key.fill(0);}
}
