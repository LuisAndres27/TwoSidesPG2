import {TRANSACTION_CONTRACT,TransactionConflict,CommitUncertain,StatisticsUnavailable} from './transaction-contract.js';
import {assertAggregateInvariants} from './projection.js';
import {assertStatisticsDriverTarget as assertB81DriverTarget} from './mongo-local-policy.js';
import {MONGO_STATISTICS_COLLECTIONS as names,verifyB81StatisticsSchema,schemaForRetention} from './mongo-schema.js';
import {BOUNDED_RETENTION,B82_SEMANTIC_MARKER,assertRetentionPolicy,usesRunSemanticMarkers} from './retention-policy.js';
const registered=new WeakMap(),groups=['receipts','semantic','distinct','budgets'];
export const isB81MongoAdapter=(x,keyCheck)=>registered.has(x)&&(keyCheck===undefined||registered.get(x)===keyCheck);
export const B81_TRANSACTION_OPTIONS=Object.freeze({readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true,wtimeoutMS:5000},readPreference:'primary',maxCommitTimeMS:5000});
const label=(error,name)=>error?.hasErrorLabel?.(name)===true||error?.errorLabels?.includes(name)===true;
const unknown=e=>label(e,'UnknownTransactionCommitResult');
const conflict=e=>label(e,'TransientTransactionError')||[112,11000,251].includes(e?.code);
const safeKey=key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key);
function decode(group,row,retentionPolicy=BOUNDED_RETENTION){
 if(!row)return undefined;
 if(group==='semantic'&&usesRunSemanticMarkers(retentionPolicy)){
  if(!safeKey(row._id)||row.kind!==B82_SEMANTIC_MARKER||Object.keys(row).some(k=>!['_id','kind'].includes(k)))throw new StatisticsUnavailable();
  return {retained:true};
 }
 const allowed=['_id','expiresAt',...(group==='receipts'?['hash','revision']:group==='budgets'?['value']:[])];
 if(!safeKey(row._id)||Object.keys(row).some(k=>!allowed.includes(k))||!(row.expiresAt instanceof Date)||!Number.isSafeInteger(row.expiresAt.getTime())||row.expiresAt.getTime()<0)throw new StatisticsUnavailable();
 const value={expires:row.expiresAt.getTime()};
 if(group==='receipts'){if(!safeKey(row.hash)||!Number.isSafeInteger(row.revision)||row.revision<1)throw new StatisticsUnavailable();Object.assign(value,{hash:row.hash,revision:row.revision});}
 if(group==='budgets'){if(!Number.isSafeInteger(row.value)||row.value<0)throw new StatisticsUnavailable();value.value=row.value;}
 return value;
}
function encode(group,key,value,retentionPolicy=BOUNDED_RETENTION){
 if(group==='semantic'&&usesRunSemanticMarkers(retentionPolicy)){
  if(value?.retained!==true||Object.keys(value).length!==1)throw new StatisticsUnavailable();
  const row={_id:key,kind:B82_SEMANTIC_MARKER};decode(group,row,retentionPolicy);return row;
 }
 const row={_id:key,...structuredClone(value),expiresAt:new Date(value.expires)};delete row.expires;decode(group,row,retentionPolicy);return row;
}
function countView(rows){
 const counts={};
 for(const row of rows){
  if(Object.keys(row).some(k=>!['_id','values'].includes(k))||!row.values||typeof row.values!=='object'||Array.isArray(row.values))throw new StatisticsUnavailable();
  for(const [metric,n]of Object.entries(row.values)){
   if(row._id.startsWith('month:')&&metric!=='active_installations')throw new StatisticsUnavailable();
   counts[row._id+'|'+metric]=n;
   if(row._id.startsWith('day:')&&metric!=='active_installations'){const monthly='month:'+row._id.slice(4,11)+'|'+metric;counts[monthly]=(counts[monthly]??0)+n;}
  }
 }
 assertAggregateInvariants(counts);return counts;
}
// Low-level injected driver adapter; it never opens a connection. Real handles come ONLY from
// the owned-process runtime. Driver doubles use an explicit, separately branded test factory.
export class MongoStatisticsTransactionAdapter {
 contract=TRANSACTION_CONTRACT;#client;#db;#config;#keyCheck;#retentionPolicy;#closed=false;#closing=false;#verified=false;#queued=0;#tail=Promise.resolve();#reads=new Set();#hook;#closeClient;
 constructor({client,db,config,keyCheck,checkpoint=async()=>{},closeClient=false,retentionPolicy=BOUNDED_RETENTION}){
  this.#config=assertB81DriverTarget(client,db,config);
  if(!safeKey(keyCheck)||typeof client.startSession!=='function'||typeof db.collection!=='function')throw Error('B81 adapter rejected');
  this.#retentionPolicy=assertRetentionPolicy(retentionPolicy);this.#client=client;this.#db=db;this.#keyCheck=keyCheck;this.#hook=checkpoint;this.#closeClient=closeClient;
 }
 get keyCheck(){return this.#keyCheck;}
 get retentionPolicy(){return this.#retentionPolicy;}
 async verify(){try{if(this.#closed||this.#closing)throw new StatisticsUnavailable();assertB81DriverTarget(this.#client,this.#db,this.#config);await verifyB81StatisticsSchema(this.#db,this.#keyCheck,{retentionPolicy:this.#retentionPolicy});this.#verified=true;return true;}catch{this.#verified=false;throw new StatisticsUnavailable();}}
 checkpoint(name,details={}){return this.#hook(name,Object.freeze({...details}));}
 async #session(){if(this.#closed||!this.#verified)throw new StatisticsUnavailable();assertB81DriverTarget(this.#client,this.#db,this.#config);return this.#client.startSession({causalConsistency:false,defaultTimeoutMS:10000});}
 async #commit(session){
  let uncertain=false;
  for(let attempt=0;attempt<2;attempt++)try{await session.commitTransaction({timeoutMS:5000});return;}
  catch(e){
   if(unknown(e)||!conflict(e)&&![13,18,20].includes(e?.code)){uncertain=true;if(attempt===0)continue;throw new CommitUncertain();}
   if(uncertain)throw new CommitUncertain();throw e;
  }
 }
 async #abort(session){try{if(session.inTransaction())await session.abortTransaction({timeoutMS:5000});}catch{/* closed by endSession; never report success */}}
 async #seed(session){const row=await this.#db.collection(names.meta).findOne({_id:'statistics-v1'},{session,maxTimeMS:5000});if(row?.schema!==schemaForRetention(this.#retentionPolicy)||usesRunSemanticMarkers(this.#retentionPolicy)&&row.retentionPolicy!==this.#retentionPolicy||row.keyCheck!==this.#keyCheck||!Number.isSafeInteger(row.revision)||row.revision<0)throw new StatisticsUnavailable();return row;}
 runAtomic(work,{signal}={}){
  if(this.#closing||this.#closed||this.#queued>=128)return Promise.reject(new StatisticsUnavailable());
  this.#queued++;const queuedAt=performance.now();
  const task=this.#tail.then(()=>{if(performance.now()-queuedAt>30000)throw new StatisticsUnavailable();return this.#atomic(work,signal);}).finally(()=>{this.#queued--;});this.#tail=task.catch(()=>{});return task;
 }
 async #atomic(work,signal){
  let session,active=false,committing=false;const deadline=performance.now()+10000;
  const check=()=>{signal?.throwIfAborted();if(performance.now()>deadline)throw new StatisticsUnavailable();};
  try{
   check();await this.checkpoint('before_transaction');check();session=await this.#session();session.startTransaction(structuredClone(B81_TRANSACTION_OPTIONS));
   const seed=await this.#seed(session);if(seed.revision>=Number.MAX_SAFE_INTEGER)throw new StatisticsUnavailable();
   // Explicit fence: conflicts between independent processes abort rather than lose writes.
   const fence=await this.#db.collection(names.meta).updateOne({_id:'statistics-v1',revision:seed.revision},{$inc:{revision:1}},{session,maxTimeMS:5000});
   if(fence.matchedCount!==1)throw new TransactionConflict();
   const before=countView(await this.#db.collection(names.counts).find({},{session,maxTimeMS:5000}).toArray()),counts={...before},revision=seed.revision+1;
   let expiry=-Infinity;active=true;
   const guard=(group,key)=>{check();if(!active||!groups.includes(group)||!safeKey(key))throw new StatisticsUnavailable();};
   const tx=Object.freeze({revision,
    get:async(group,key)=>{guard(group,key);const row=await this.#db.collection(names[group]).findOne({_id:key},{session,maxTimeMS:5000});const value=decode(group,row,this.#retentionPolicy);return value&&(value.retained===true||value.expires>=expiry)?value:undefined;},
    put:async(group,key,value)=>{guard(group,key);await this.#db.collection(names[group]).replaceOne({_id:key},encode(group,key,value,this.#retentionPolicy),{session,upsert:true,maxTimeMS:5000});},
    insertUnique:async(group,key,value)=>{guard(group,key);const c=this.#db.collection(names[group]),row=encode(group,key,value,this.#retentionPolicy);if(Number.isFinite(expiry)&&!(group==='semantic'&&usesRunSemanticMarkers(this.#retentionPolicy)))await c.deleteOne({_id:key,expiresAt:{$lt:new Date(expiry)}},{session,maxTimeMS:5000});await c.insertOne(row,{session,maxTimeMS:5000});},
    increment:(period,key,amount=1)=>{check();if(!active||!Number.isSafeInteger(amount)||amount<=0)throw new StatisticsUnavailable();const id=period+'|'+key;counts[id]=(counts[id]??0)+amount;},
    expire:now=>{check();if(!active||!Number.isSafeInteger(now)||now<0)throw new StatisticsUnavailable();expiry=now;}
   });
   const result=await work(tx);active=false;check();assertAggregateInvariants(counts);
   const deltas=new Map();for(const [id,n]of Object.entries(counts)){const [period,key]=id.split('|'),delta=n-(before[id]??0);if(!delta||period.startsWith('month:')&&key!=='active_installations')continue;const inc=deltas.get(period)??{};inc['values.'+key]=delta;deltas.set(period,inc);}
   for(const [period,$inc]of deltas)await this.#db.collection(names.counts).updateOne({_id:period},{$inc},{session,upsert:true,maxTimeMS:5000});
   await this.checkpoint('before_commit');check();committing=true;await this.#commit(session);
   try{await this.checkpoint('after_commit');}catch{throw new CommitUncertain();}
   return {committed:true,revision,result};
  }catch(e){
   active=false;
   if(e instanceof CommitUncertain||committing&&unknown(e))throw new CommitUncertain();
   if(session)await this.#abort(session);
   if(e instanceof TransactionConflict||conflict(e))throw new TransactionConflict();
   throw new StatisticsUnavailable();
  }finally{active=false;if(session)try{await session.endSession();}catch{/* never expose driver error */}}
 }
 #read(work){if(this.#closing||this.#closed)return Promise.reject(new StatisticsUnavailable());const task=this.#readUnit(work);this.#reads.add(task);task.then(()=>this.#reads.delete(task),()=>this.#reads.delete(task));return task;}
 async #readUnit(work){let session;try{session=await this.#session();await this.checkpoint('read');session.startTransaction(structuredClone(B81_TRANSACTION_OPTIONS));const result=await work(session);await this.#commit(session);return result;}catch{if(session)await this.#abort(session);throw new StatisticsUnavailable();}finally{if(session)try{await session.endSession();}catch{}}}
 readCommitted({includeTechnical=true}={}){return this.#read(async session=>{const seed=await this.#seed(session),snapshot={revision:seed.revision,counts:countView(await this.#db.collection(names.counts).find({},{session,maxTimeMS:5000}).toArray()),receipts:{},semantic:{},distinct:{},budgets:{}};if(includeTechnical)for(const group of groups)for(const row of await this.#db.collection(names[group]).find({},{session,maxTimeMS:5000}).toArray())snapshot[group][row._id]=decode(group,row,this.#retentionPolicy);return snapshot;});}
 lookupCommittedReceipt(key){if(!safeKey(key))return Promise.reject(new StatisticsUnavailable());return this.#read(async session=>({revision:(await this.#seed(session)).revision,receipt:decode('receipts',await this.#db.collection(names.receipts).findOne({_id:key},{session,maxTimeMS:5000}))}));}
 async close(){if(this.#closed)return;this.#closing=true;await this.#tail;await Promise.allSettled([...this.#reads]);this.#closed=true;if(this.#closeClient)try{await this.#client.close();}catch{throw new StatisticsUnavailable();}}
}
// Registration is deliberately separate from construction: offline HTTP composition accepts
// only an owned-process runtime or an explicit non-network driver-double capability.
export async function registerB81MongoAdapter(adapter){if(!(adapter instanceof MongoStatisticsTransactionAdapter))throw Error('B81 adapter rejected');await adapter.verify();registered.set(adapter,adapter.keyCheck);return adapter;}
