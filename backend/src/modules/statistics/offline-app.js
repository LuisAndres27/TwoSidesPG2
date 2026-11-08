import express from 'express';
import {TextDecoder} from 'node:util';
import {securityHeaders} from '../../middleware/security.js';
import {RateLimiter} from '../../middleware/rate-limiter.js';
import {parseStrict} from '../sync/canonical-envelope.js';
import {CONTRACT,MAX_BODY,batchSchema,validateEvent,hash} from './contract.js';
import {isSyntheticIdentity} from './synthetic-identity.js';
import {isSyntheticStore} from './synthetic-store.js';
import {isB81MongoRepository} from './mongo-test-composition.js';
import {TransactionConflict,CommitUncertain} from './transaction-contract.js';

// B86: the .NET client waits 15 s per request. The whole request therefore has a budget (default 8 s, margin for transport) and, after the first storage
// failure, a short circuit breaker answers 'retryable' immediately instead of letting every event wait for the driver's own timeouts. Idempotency is untouched:
// an event whose commit outlives the budget is reported as retryable, may still commit in the background, and its replay is answered 'duplicate'.
export const DEFAULT_REQUEST_BUDGET_MS=8000,DEFAULT_BREAKER_COOLDOWN_MS=5000,MIN_EVENT_BUDGET_MS=250,SLOW_FAILURE_MS=1000,CONSECUTIVE_FAILURES_TO_OPEN=3;
export function createStatisticsOfflineApp({profile,identities,store,now=Date.now,limiter=new RateLimiter({now}),requestBudgetMs=DEFAULT_REQUEST_BUDGET_MS,breakerCooldownMs=DEFAULT_BREAKER_COOLDOWN_MS,monotonic=Date.now}){
 if(!Number.isInteger(requestBudgetMs)||requestBudgetMs<50||requestBudgetMs>12000||!Number.isInteger(breakerCooldownMs)||breakerCooldownMs<0||breakerCooldownMs>60000)throw Error('Statistics time budget rejected');
 // The breaker opens on evidence of an outage: a SLOW failure (the driver waited for a server that is not there), a deadline overrun, or three consecutive
 // failures. One fast, isolated failure (an aborted transaction, an injected fault) never blocks other clients; success resets the count.
 let breakerOpenUntil=0,consecutiveFailures=0;
 if(!isSyntheticIdentity(identities)||!(profile==='statistics-offline-test'&&isSyntheticStore(store)||['statistics-b81-local-test','statistics-atlas-prepared'].includes(profile)&&isB81MongoRepository(store)))throw Error('Statistics offline capability required');
 const app=express();app.disable('x-powered-by');app.set('trust proxy',false);app.use(securityHeaders);
 app.locals.statisticsMetrics=Object.create(null);
 app.use((_req,res,next)=>{res.once('finish',()=>{const key='http_'+res.statusCode;app.locals.statisticsMetrics[key]=(app.locals.statisticsMetrics[key]??0)+1;});next();});
 const fail=(res,status,code)=>{if(status===429)res.set('Retry-After','60');if(status===401)res.set('WWW-Authenticate','Bearer');return res.status(status).json({Contract:CONTRACT,Error:code});};
 app.post('/api/v1/statistics/events',(req,res,next)=>{
  if(req.originalUrl.includes('?')||req.headers.origin)return fail(res,400,'invalid_request');
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')||!['identity',undefined].includes(req.headers['content-encoding']))return fail(res,415,'unsupported_media_type');
  try{limiter.consume('statistics-ip:'+hash(req.ip??''),120,60000);}catch{return fail(res,429,'rate_limited');}
  const identity=identities.authenticate(req.headers.authorization,now());if(!identity)return fail(res,401,'unauthorized');
  if(identity.scope!=='statistics:write')return fail(res,403,'forbidden');
  try{limiter.consume('statistics-installation:'+identity.installationId,60,60000);}catch{return fail(res,429,'rate_limited');}
  req.statisticsIdentity=identity;next();
 },express.raw({limit:MAX_BODY,type:'application/json',inflate:false}),async(req,res)=>{
  let body;try{const raw=parseStrict(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(req.body));if(typeof raw?.Contract==='string'&&raw.Contract!==CONTRACT)return fail(res,400,'unsupported_contract');body=batchSchema.parse(raw);}catch{return fail(res,400,'invalid_request');}
  const values=body.Events.map(x=>validateEvent(x,req.statisticsIdentity.installationId,now()));
  if(values.some(v=>v.forbidden))return fail(res,403,'forbidden');
  if(values.some(v=>!v.id))return fail(res,400,'invalid_event');
  const receipts=[],deadline=monotonic()+requestBudgetMs,retryable=(value,code)=>receipts.push({EventId:value.id,PayloadHash:value.hash,Status:'retryable',Code:code});
  for(const value of values){
   if(value.error){receipts.push({EventId:value.id,PayloadHash:value.hash,Status:'rejected',Code:value.error});continue;}
   const remaining=deadline-monotonic();
   if(monotonic()<breakerOpenUntil){retryable(value,'storage_unavailable');continue;}      // storage recently failed: answer at once, nothing is attempted
   if(remaining<Math.min(MIN_EVENT_BUDGET_MS,requestBudgetMs)){retryable(value,'deadline_exceeded');continue;}
   let timer;const started=monotonic();
   try{
    const pending=Promise.resolve().then(()=>store.commit(value));pending.catch(()=>{});   // a late failure of an abandoned commit is not an unhandled rejection
    const r=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('deadline'),{deadline:true})),remaining);})]);
    receipts.push({EventId:value.id,PayloadHash:value.hash,Status:r.status,Code:r.code});consecutiveFailures=0;
   }catch(error){
    consecutiveFailures++;
    if(error?.deadline){retryable(value,'deadline_exceeded');breakerOpenUntil=monotonic()+breakerCooldownMs;}
    // Contention and uncertain commits mean the store IS reachable: they stay retryable but must not shut the door for other clients.
    else{retryable(value,'storage_unavailable');if(!(error instanceof TransactionConflict||error instanceof CommitUncertain)&&(monotonic()-started>=SLOW_FAILURE_MS||consecutiveFailures>=CONSECUTIVE_FAILURES_TO_OPEN))breakerOpenUntil=monotonic()+breakerCooldownMs;}
   }finally{clearTimeout(timer);}
  }
  if(receipts.some(r=>r.Code==='quota_exceeded'))res.set('Retry-After',String(Math.max(1,Math.ceil((86400000-now()%86400000)/1000))));
  res.json({Contract:CONTRACT,Receipts:receipts});
 });
 app.use((_req,res)=>fail(res,404,'not_found'));
 app.use((error,_req,res,_next)=>{if(res.headersSent){res.destroy();return;}fail(res,error.type==='entity.too.large'?413:500,error.type==='entity.too.large'?'payload_too_large':'internal_error');});
 return app;
}
