// C.2 functional preparation ONLY: no connector, receiver, environment loader or auto-run.
import { randomUUID, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { MongoIdentityRepository, assertMongoIdentity } from '../src/modules/auth/mongo-identity-repository.js';
import { MongoIngestionRepository } from '../src/modules/sync/mongo-ingestion-repository.js';
import { IngestionService } from '../src/modules/sync/ingestion-service.js';
import { JwtService } from '../src/modules/auth/jwt-service.js';
import { resolveSyncContext } from '../src/middleware/sync-auth-context.js';
import { canonical, digest } from '../src/modules/sync/canonical-envelope.js';
import { validateOperation } from '../src/modules/sync/schemas.js';
import { assertAtlasConnection, verifyAtlasPermissions, ATLAS_TARGET, ATLAS_SCHEMA_RUN } from '../src/modules/sync/atlas-policy.js';
import { createDurableRuntime } from './durable-revocation-runtime.js';
import { assertExecutionPermit } from './c2-receiver-core.js';

const plans=new WeakSet(),budgets=new WeakMap(),actors=new WeakMap(),registries=new WeakMap(),inventories=new WeakMap(),runtimes=new WeakMap();
const check=value=>{if(!value)throw new Error('Durable revocation preflight unavailable.');};
const equal=(a,b)=>canonical(a)===canonical(b);
const freeze=value=>{for(const item of Object.values(value))if(item&&typeof item==='object')freeze(item);return Object.freeze(value);};
export const durableAtlasLimits=freeze({remoteEnabled:false,owners:3,maxConnections:3,maxParallel:2,
  applicationAttempts:8,documents:24,operationBudgetMs:2000,transactionBudgetMs:10000,
  barrierMs:1000,scenarioMs:30000,callbackAttempts:3,totalMs:120000,
  scenarioAttempts:{A:2,B:2,C:4}});
export const durableIndexes=freeze([
  {model:'operations',name:'owner_operation_unique',key:{technicalAccountId:1,operationId:1}},
  {model:'facts',name:'scope_source_unique',key:{scope:1,sourceKey:1}},
  {model:'identities',name:'identity_registration_unique',key:{registrationId:1}},
  {model:'identities',name:'identity_binding_unique',key:{installationId:1,localPlayerId:1}},
  {model:'identitySessions',name:'identity_token_unique',key:{tokenHash:1}},
]);
const historicalRun='0e803b0278594116a83894c04fb10c53';
const retainedNames=['ops','facts','fence','authorization'].map(k=>`b054c2c_${historicalRun}_${k}`);
export function prepareDurableAtlasPlan({executionId=randomUUID().replaceAll('-','')}={}) {
  check(/^[a-f0-9]{32}$/.test(executionId)&&executionId!==ATLAS_SCHEMA_RUN);
  const runId=ATLAS_SCHEMA_RUN,prefix='b054c2c_'+runId;
  const collections={operations:prefix+'_ops',facts:prefix+'_facts',fences:prefix+'_fence',authorization:prefix+'_authorization',
    ...Object.fromEntries(['identities','ownerGuards','identitySessions','revocations'].map(k=>[k,prefix+'_'+k]))};
  const identities=Object.fromEntries(['A','B','C'].map(label=>[label,{registrationId:randomUUID(),installationId:randomUUID(),
    localPlayerId:randomUUID(),bindingGeneration:1,operationId:randomUUID(),sourceSessionId:randomUUID(),commandId:randomUUID()}]));
  const plan=freeze({phase:'B05.4C.2F.1C.2',runId,executionId,collections,identities,
    expectedPreexisting:[...retainedNames,...Object.values(collections)],
    initialFence:{_id:'ingestion-v1',revision:0},
    target:{...ATLAS_TARGET,authSource:'admin',authMechanism:'DEFAULT',tls:true},limits:durableAtlasLimits,
    requiresIndependentC2Authorization:true,requiresNewReceiver:true});
  plans.add(plan);runtimes.set(plan,createDurableRuntime());budgets.set(plan,{attempts:0,caseAttempts:0,active:0,used:new Set(),completed:new Set(),registrations:new Set(),running:false,failed:false,totalDeadline:performance.now()+durableAtlasLimits.totalMs});return plan;
}
const assertPlan=plan=>check(plans.has(plan));
export function durableRuntime(plan){assertPlan(plan);return runtimes.get(plan);}
function manage(plan,connection,models){const runtime=durableRuntime(plan);runtime.adoptDouble(connection);runtime.bindModels(models);}
function assertTime(plan){assertPlan(plan);durableRuntime(plan).assertActive();const b=budgets.get(plan);check(!b.failed&&performance.now()<=b.totalDeadline);return b;}
function beginCase(plan,key){const b=assertTime(plan);check(!b.running&&!b.used.has(key));b.used.add(key);b.running=true;b.case=key;b.caseAttempts=0;b.deadline=performance.now()+durableAtlasLimits.scenarioMs;}
const completeCase=(plan,key)=>{const b=assertTime(plan);check(performance.now()<=b.deadline&&b.active===0);b.completed.add(key);};
const finishCase=(plan,key)=>{const b=budgets.get(plan);b.running=false;if(!b.completed.has(key)){b.failed=true;void durableRuntime(plan).stop();}};
// Driver work is supervised by the plan runtime; do not infer rollback on timeout.
export async function durableHarnessTask(plan,work,{application=false}={}){
  const b=assertTime(plan);check(b.running&&performance.now()<=b.deadline&&b.active<durableAtlasLimits.maxParallel);
  if(application){check(b.attempts<durableAtlasLimits.applicationAttempts&&b.caseAttempts<durableAtlasLimits.scenarioAttempts[b.case]);b.attempts++;b.caseAttempts++;}
  b.active++;
  try{const result=await work();assertTime(plan);check(performance.now()<=b.deadline);return result;}
  catch(error){b.failed=true;throw error;}
  finally{b.active--;}
}
export async function executeDurableAtlasRun(options={}){
  try{assertPlan(options.plan);assertExecutionPermit(options.permit,options.plan.executionId);}
  catch{
  const error=new Error('C.2 authorization and a reviewed private receiver are required.');
  error.code='DURABLE_REVOCATION_C2_NOT_AUTHORIZED';throw error;
  }
  return runPreparedDurableValidation(options);
}
export function verifyDurableEnumeration(plan,response) {
  assertPlan(plan);const cursor=response?.cursor,id=cursor?.id;
  check(response?.ok===1&&Array.isArray(cursor?.firstBatch)&&(id===0||id===0n||id?.isZero?.()===true));
  const names=cursor.firstBatch.map(row=>row.name);
  check(names.length<=32&&new Set(names).size===names.length&&equal([...names].sort(),[...plan.expectedPreexisting].sort()));
  // Recognizing names does not claim ownership of their contents.
  return Object.freeze({complete:true,retainedNamespaces:names.length,newNamespacesPresent:0});
}
export async function inspectDurableAtlasPreflight(plan,connection,config) {
  assertTime(plan);manage(plan,connection,{});check(config?.runId===plan.runId&&config.authMechanism==='DEFAULT');
  assertAtlasConnection(connection,config);
  const status=await connection.db.command({connectionStatus:1,showPrivileges:true});verifyAtlasPermissions(status);
  const actions=new Set(status.authInfo.authenticatedUserPrivileges.filter(p=>p.resource.collection==='').flatMap(p=>p.actions));
  check(actions.has('listCollections')&&actions.has('find'));
  const enumeration=verifyDurableEnumeration(plan,await connection.db.command({listCollections:1,authorizedCollections:true,nameOnly:true}));
  const hello=await connection.db.admin().command({hello:1});check(hello.setName&&hello.isWritablePrimary===true);
  return Object.freeze({permissionsVerified:true,tlsVerified:true,replicaSetPrimary:true,...enumeration});
}
export function verifyDurableIndexes(key,indexes,{prepared=true}={}) {
  check(['operations','facts','fences','authorization','identities','ownerGuards','identitySessions','revocations'].includes(key));
  check(Array.isArray(indexes));const expected=durableIndexes.filter(i=>i.model===key);
  const seen=new Set();
  for(const index of indexes){
    check(!seen.has(index.name));seen.add(index.name);
    check(!index.sparse&&!index.partialFilterExpression&&!index.hidden&&index.expireAfterSeconds===undefined&&(!index.collation||index.collation.locale==='simple'));
    if(index.name==='_id_'){check(equal(index.key,{_id:1}));continue;}
    check(expected.some(i=>i.name===index.name&&equal(i.key,index.key))&&index.unique===true&&!index.sparse&&
      !index.partialFilterExpression&&(!index.collation||index.collation.locale==='simple')&&!index.hidden&&index.expireAfterSeconds===undefined);
  }
  check(seen.has('_id_'));if(prepared)check(expected.every(i=>seen.has(i.name)));
}
export function verifyDurableModels(plan,models) {
  assertPlan(plan);check(Object.keys(models).length===8);
  for(const [key,name]of Object.entries(plan.collections)){
    const m=models[key];check(m?.db===models.operations.db&&m?.collection?.name===name&&m.schema.options.strict==='throw'&&m.schema.options.bufferCommands===false&&m.schema.options.autoCreate===false&&m.schema.options.autoIndex===false);
    const expected=durableIndexes.filter(i=>i.model===key),declared=m.schema.indexes();
    check(declared.length===expected.length&&expected.every(i=>declared.some(([key,options])=>equal(i.key,key)&&options.name===i.name&&options.unique===true)));
  }
}
export function durableProvisionSteps(plan) {
  assertPlan(plan);
  return freeze({createCollections:[],createIndexes:[],seedFence:null,autoIndex:false,autoCreate:false,
    executeDuringC1:false,requiresFreshMetadataAndIndependentC2Authorization:true});
}
export function verifyDurableInitialInventory(plan,rows){
  const b=assertTime(plan);check(!b.initialInventoryVerified&&b.registrations.size===0&&equal(Object.keys(rows).sort(),Object.keys(plan.collections).sort()));
  for(const key of Object.keys(plan.collections))check(Array.isArray(rows[key])&&
    (key==='fences'?equal(rows[key],[plan.initialFence]):rows[key].length===0));
  b.initialInventoryVerified=true;return Object.freeze({preparedFenceVerified:true,existingDocuments:1});
}
export function syntheticDurableOperation(plan,label) {
  assertPlan(plan);const ids=plan.identities[label];check(ids);
  const at='2026-10-29T00:00:00.000Z';
  const canonicalEnvelope=canonical({schemaVersion:1,type:'session.report',installationId:ids.installationId,
    localPlayerId:ids.localPlayerId,bindingGeneration:1,gameId:null,sourceKey:`session:${ids.sourceSessionId}:open`,createdAtUtc:at,
    payload:{sessionId:ids.sourceSessionId,phase:'open',status:'open',startedAtUtc:at,endedAtUtc:null,endOffsetMs:null,
      coverage:{origin:'historical_import',historicalCoverageUnknown:true,incomplete:true}}});
  const operation={operationId:ids.operationId,canonicalEnvelope,payloadHash:digest(canonicalEnvelope),dependencies:[],leaseId:randomUUID(),attempt:1};
  validateOperation(operation);return operation;
}
// Actor handles do not serialize tokens, contexts, connections or JWT signing material.
export async function durableRaceActor({identity,repository,auth,token,plan}) {
  check(identity instanceof MongoIdentityRepository&&repository instanceof MongoIngestionRepository&&auth instanceof JwtService);
  check(repository.identityRepository===identity&&auth.repository===identity);
  assertMongoIdentity(identity,repository.connection,repository.atlasScope);
  if(plan){manage(plan,repository.connection,identity.models);manage(plan,repository.connection,repository.models);}
  const context=await resolveSyncContext(await auth.authenticate(token),token,identity,auth.now);
  const handle=Object.freeze(Object.create(null));
  actors.set(handle,{plan,identity,repository,auth,token,context,service:new IngestionService({repository,identityRepository:identity})});return handle;
}
export async function registerDurableRaceActor({plan,label,identity,createRepository,jwtConfig,hasher,limiter,policy,now}) {
  assertPlan(plan);check(plan.identities[label]&&identity instanceof MongoIdentityRepository&&typeof createRepository==='function');
  const budget=assertTime(plan);check(budget.initialInventoryVerified&&!budget.registrations.has(label));budget.registrations.add(label);
  manage(plan,identity.models.identities.db,identity.models);
  const auth=new JwtService({config:jwtConfig,repository:identity,hasher,limiter,policy,now,version:2});
  let credential=randomBytes(32).toString('base64url');
  try{
    const ids=plan.identities[label],{operationId,sourceSessionId,commandId,...registration}=ids;
    const created=await auth.register({schemaVersion:2,...registration,credential},'synthetic-'+plan.executionId);
    const issued=await auth.session({technicalAccountId:created.body.technicalAccountId,credential,...registration},'synthetic-'+plan.executionId);
    const repository=createRepository({identityRepository:identity,coordinator:identity.coordinator,now});
    return await durableRaceActor({identity,repository,auth,token:issued.accessToken,plan});
  }finally{credential=null;}
}
export async function cloneDurableRaceActor({actor,identity,repository}){
  const a=state(actor);check(repository.connection!==a.repository.connection);
  const auth=new JwtService({config:a.auth.config,repository:identity,now:a.auth.now,version:2});
  return durableRaceActor({identity,repository,auth,token:a.token,plan:a.plan});
}
const state=actor=>{const a=actors.get(actor);check(a);return a;};
function checkCase(plan,label,actor,operation,commandId){assertPlan(plan);const ids=plan.identities[label],expected=syntheticDurableOperation(plan,label);
  check(actor.context.installationId===ids.installationId&&actor.context.localPlayerId===ids.localPlayerId&&commandId===ids.commandId&&
    operation.operationId===expected.operationId&&operation.canonicalEnvelope===expected.canonicalEnvelope&&operation.payloadHash===expected.payloadHash&&equal(operation.dependencies,[]));}
function pair(a,b){a=state(a);b=state(b);check(a.repository.connection!==b.repository.connection&&
  a.repository.connection.name===b.repository.connection.name&&a.identity.models.ownerGuards.collection.name===b.identity.models.ownerGuards.collection.name&&
  a.context.technicalAccountId===b.context.technicalAccountId);return [a,b];}
function pauseOwnerWrite(actor) {
  const m=actor.identity.models.ownerGuards,original=m.updateOne;let release,arrive,first=true,calls=0,conflicts=0;
  const released=new Promise(r=>{release=r;}),arrived=new Promise(r=>{arrive=r;});
  m.updateOne=async function(...args){calls++;if(first){first=false;arrive();await released;}
    try{return await original.apply(this,args);}catch(e){if(e?.code===112||e?.hasErrorLabel?.('TransientTransactionError'))conflicts++;throw e;}};
  return {arrived,release,restore:()=>{m.updateOne=original;},counts:()=>({ownerWriteAttempts:calls,classifiedConflicts:conflicts})};
}
async function barrier(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(new Error('Controlled barrier timed out.')),durableAtlasLimits.barrierMs);
})]);}finally{clearTimeout(timer);}}
function track(actor) {
  const repository=actor.repository,original=repository.acceptOperation,pending=[];
  repository.acceptOperation=function(...args){const p=original.apply(this,args);pending.push(p);p.catch(()=>{});return p;};
  return {async drain(){await Promise.allSettled(pending);},restore:()=>{repository.acceptOperation=original;}};
}
const send=(plan,actor,operation)=>durableHarnessTask(plan,()=>actor.service.batches(actor.context,{schemaVersion:2,batchId:randomUUID(),operations:[operation]}),{application:true});
const revoke=(plan,actor,options)=>durableHarnessTask(plan,()=>actor.identity.revoke(actor.context,options));
async function storedOperation(actor,operation){return (await actor.repository.models.operations.find({technicalAccountId:actor.context.technicalAccountId,operationId:operation.operationId}).limit(2).lean());}
async function storedFact(actor,operation){const c=actor.context,sourceKey=JSON.parse(operation.canonicalEnvelope).sourceKey;
  const scope=[c.technicalAccountId,c.installationId,c.localPlayerId,c.bindingGeneration].join(':');
  return actor.repository.models.facts.find({scope,sourceKey}).limit(2).lean();}
async function confirmRevocation(actor,record){const row=await actor.identity.one('revocations',{_id:record._id});check(row&&equal(row,record));}
async function revokedToken(actor){try{await actor.auth.authenticate(actor.token);}catch(e){if(e.status===401)return true;throw e;}return false;}
export async function preparedRevocationFirst({plan,ingestion,revoker,operation,commandId}) {
  const [a,b]=pair(ingestion,revoker);checkCase(plan,'A',a,operation,commandId);beginCase(plan,'A');
  const pause=pauseOwnerWrite(a),tasks=track(a);let pending;
  try{
    await a.context.validate();pending=send(plan,a,operation);await barrier(pause.arrived);
    const revocation=await revoke(plan,b,{commandId});pause.release();
    const result=await pending;await tasks.drain();check(result.status===401&&!result.body.results[0].receipt);
    check((await storedOperation(a,operation)).length===0&&(await storedFact(a,operation)).length===0&&(await a.identity.findAccount(a.context.technicalAccountId)).active===false);
    await confirmRevocation(b,revocation);
    check(await revokedToken(a));const duplicate=await send(plan,a,operation);await tasks.drain();check(duplicate.status===401&&!duplicate.body.results[0].receipt);
    check(pause.counts().ownerWriteAttempts>=2);
    completeCase(plan,'A');return Object.freeze({scenario:'revocation-first',revocationConfirmed:true,noNewReceipt:true,oldTokenRejected:true,
      duplicateRejected:true,revocationRevision:revocation.revision,...pause.counts()});
  }finally{pause.release();if(pending)await Promise.allSettled([pending]);await tasks.drain();pause.restore();tasks.restore();finishCase(plan,'A');}
}
export async function preparedIngestionFirst({plan,ingestion,revoker,operation,commandId}) {
  const [a,b]=pair(ingestion,revoker);checkCase(plan,'B',a,operation,commandId);beginCase(plan,'B');
  const pause=pauseOwnerWrite(b),tasks=track(a);let pending;
  try{
    pending=revoke(plan,b,{commandId});pending.catch(()=>{});await barrier(pause.arrived);
    const accepted=await send(plan,a,operation);await tasks.drain();check(accepted.status===200&&accepted.body.results[0].receipt);
    pause.release();const revoked=await pending,rows=await storedOperation(a,operation);check(rows.length===1);
    const row=rows[0],facts=await storedFact(a,operation);check(facts.length===1&&row.record.factKey===facts[0]._id);
    check(equal(row.record.receipt,accepted.body.results[0].receipt)&&row.authorizationDecision.revision<revoked.revision);
    await confirmRevocation(b,revoked);a.savedReceipt=structuredClone(row.record.receipt);
    check(await revokedToken(a));const duplicate=await send(plan,a,operation);await tasks.drain();check(duplicate.status===401&&!duplicate.body.results[0].receipt);
    check(equal((await storedOperation(a,operation))[0].record.receipt,row.record.receipt)&&pause.counts().ownerWriteAttempts>=2);
    completeCase(plan,'B');return Object.freeze({scenario:'ingestion-first',receiptPreserved:true,oldTokenRejected:true,duplicateRejected:true,
      operationRevision:row.authorizationDecision.revision,revocationRevision:revoked.revision,...pause.counts()});
  }finally{pause.release();if(pending)await Promise.allSettled([pending]);await tasks.drain();pause.restore();tasks.restore();finishCase(plan,'B');}
}
export async function preparedLostResponseAndUnlink({plan,actor,operation,foreignOperation,commandId}) {
  const a=state(actor);checkCase(plan,'C',a,operation,commandId);
  check(foreignOperation.canonicalEnvelope===syntheticDurableOperation(plan,'A').canonicalEnvelope);beginCase(plan,'C');
  const original=a.repository.afterCommit,tasks=track(a);let lossAfterConfirmedCommit=false;
  try{
    a.repository.afterCommit=async()=>{lossAfterConfirmedCommit=true;throw new Error('Controlled response loss after confirmed commit.');};
    const lost=await send(plan,a,operation);await tasks.drain();check(lossAfterConfirmedCommit&&lost.status===503&&!lost.body.results[0].receipt);
    const before=await storedOperation(a,operation);check(before.length===1);a.repository.afterCommit=original;
    const retried=await send(plan,a,operation);await tasks.drain();check(retried.status===200&&equal(retried.body.results[0].receipt,before[0].record.receipt));
    const foreign=await send(plan,a,foreignOperation);await tasks.drain();check(foreign.status===403&&!foreign.body.results[0].receipt);
    await revoke(plan,a,{commandId,kind:'installation',target:a.context.installationId});
    check((await a.identity.findAccount(a.context.technicalAccountId)).linked===false);
    const after=await send(plan,a,operation);await tasks.drain();check(after.status===401&&!after.body.results[0].receipt);
    completeCase(plan,'C');return Object.freeze({scenario:'lost-response-unlink',responseLostAfterKnownCommit:true,unknownServerCommitProven:false,
      receiptRecovered:true,foreignBindingRejected:true,unlinkPersisted:true,duplicateRejected:true});
  }finally{a.repository.afterCommit=original;await tasks.drain();tasks.restore();finishCase(plan,'C');}
}
export async function verifyReopenedRevocation({actor,identity,repository,close}) {
  const a=state(actor);check(typeof close==='function');
  try{
    if(a.plan){manage(a.plan,repository.connection,identity.models);manage(a.plan,repository.connection,repository.models);}
    check(repository.connection!==a.repository.connection&&repository.connection.name===a.repository.connection.name&&
      repository.models.operations.collection.name===a.repository.models.operations.collection.name);
    assertMongoIdentity(identity,repository.connection,repository.atlasScope);check(repository.identityRepository===identity);
    const auth=new JwtService({config:a.auth.config,repository:identity,now:a.auth.now,version:2});
    let rejected=false;try{await auth.authenticate(a.token);}catch(e){if(e.status===401)rejected=true;else throw e;}
    check(rejected&&(await identity.findAccount(a.context.technicalAccountId)).active===false);
    const rows=await repository.models.operations.find({technicalAccountId:a.context.technicalAccountId}).limit(3).lean();
    check(rows.length===1&&rows[0].authorizationDecision.owner===a.context.technicalAccountId&&a.savedReceipt&&equal(rows[0].record.receipt,a.savedReceipt));
    return Object.freeze({reopened:true,oldTokenRejected:true,persistedReceipt:true});
  }finally{await close();}
}
export function durableActorRegistry(plan,labelledActors) {
  assertPlan(plan);const registry={};
  for(const label of ['A','B','C']){const a=state(labelledActors[label]),ids=plan.identities[label],c=a.context;
    check(c.installationId===ids.installationId&&c.localPlayerId===ids.localPlayerId&&c.bindingGeneration===1);
    registry[label]=freeze({technicalAccountId:c.technicalAccountId,sessionId:c.sessionId,...ids});}
  check(new Set(Object.values(registry).map(r=>r.technicalAccountId)).size===3);freeze(registry);
  registries.set(registry,{plan,connection:state(labelledActors.A).repository.connection});return registry;
}
function validateInventory(plan,registry,rows) {
  check(equal(Object.keys(rows).sort(),Object.keys(plan.collections).sort()));const owned=Object.values(registry);let count=0;
  const expectedCounts={operations:2,facts:2,fences:1,authorization:0,identities:3,ownerGuards:3,identitySessions:3,revocations:3};
  for(const [key,list]of Object.entries(rows)){
    check(Array.isArray(list)&&list.length===expectedCounts[key]&&new Set(list.map(r=>r._id)).size===list.length);count+=list.length;
    for(const row of list){
      const owner=row.technicalAccountId??row.record?.receipt?.technicalAccountId??row.scope?.split(':')[0]??row._id;
      const r=owned.find(r=>r.technicalAccountId===owner);
      if(key==='fences'){check(equal(Object.keys(row).sort(),['_id','revision'])&&row._id==='ingestion-v1'&&Number.isSafeInteger(row.revision)&&row.revision>=plan.initialFence.revision);continue;}
      check(key!=='authorization'&&r);
      if(key==='identities')check(row._id===r.technicalAccountId&&row.registrationId===r.registrationId&&row.installationId===r.installationId&&row.localPlayerId===r.localPlayerId&&
        row.role==='player'&&(r===registry.C?row.linked===false:row.active===false));
      if(key==='ownerGuards')check(row._id===r.technicalAccountId&&Number.isSafeInteger(row.revision)&&row.revision>=0);
      if(key==='identitySessions')check(row._id===r.sessionId&&row.sessionId===r.sessionId&&row.installationId===r.installationId&&row.localPlayerId===r.localPlayerId);
      if(key==='revocations')check(row._id===r.technicalAccountId+':'+r.commandId&&row.commandId===r.commandId&&
        row.kind===(r===registry.C?'installation':'identity')&&row.target===(r===registry.C?r.installationId:r.technicalAccountId));
      if(key==='operations'||key==='facts'){
        check(r!==registry.A);const label=r===registry.B?'B':'C',expected=validateOperation(syntheticDurableOperation(plan,label));
        const scope=[r.technicalAccountId,r.installationId,r.localPlayerId,1].join(':'),factId=scope+'|'+expected.envelope.sourceKey;
        if(key==='operations')check(row._id===r.technicalAccountId+':'+r.operationId&&row.operationId===r.operationId&&row.scope===scope&&row.record?.key===row._id&&
          row.record?.payloadHash===expected.payloadHash&&row.record?.factKey===factId&&row.record?.receipt?.technicalAccountId===r.technicalAccountId&&
          row.record.receipt.operationId===r.operationId&&row.record.receipt.payloadHash===expected.payloadHash&&row.authorizationDecision?.owner===r.technicalAccountId);
        if(key==='facts')check(row._id===factId&&row.scope===scope&&row.sourceKey===expected.envelope.sourceKey&&row.record?.key===row._id&&
          row.record?.canonicalPayload===canonical(expected.envelope.payload)&&row.record?.factDigest===expected.factDigest);
      }
    }
  }
  check(count<=durableAtlasLimits.documents);
}
async function inventory(models,session){const rows={};for(const key of ['operations','facts','fences','authorization','identities','ownerGuards','identitySessions','revocations'])
  rows[key]=await models[key].find({},null,{session}).limit(durableAtlasLimits.documents+1).lean();return rows;}
export async function captureDurableCleanup({plan,registry,models}) {
  assertTime(plan);const registered=registries.get(registry);check(registered?.plan===plan);
  durableRuntime(plan).assertCleanup();
  const b=budgets.get(plan);check(!b.failed&&!b.running&&['A','B','C'].every(k=>b.completed.has(k)));
  for(const [key,name]of Object.entries(plan.collections))check(models[key]?.collection?.name===name&&models[key]?.db===registered.connection);
  const rows=await inventory(models);validateInventory(plan,registry,rows);
  const handle=Object.freeze(Object.create(null));inventories.set(handle,{plan,registry,models,rows,used:false});return handle;
}
export async function cleanupDurableInventory({handle,connection}) {
  const s=inventories.get(handle);check(s&&!s.used);s.used=true;
  assertTime(s.plan);
  durableRuntime(s.plan).assertCleanup();
  for(const [key,name]of Object.entries(s.plan.collections))check(s.models[key]?.collection?.name===name&&s.models[key].db===connection);
  const session=await connection.startSession();let attempts=0;
  try{
    const deleted=await session.withTransaction(async()=>{
      assertTime(s.plan);
      check(++attempts<=durableAtlasLimits.callbackAttempts);
      const current=await inventory(s.models,session);validateInventory(s.plan,s.registry,current);
      for(const key of Object.keys(s.rows))check(equal([...current[key]].sort((a,b)=>a._id.localeCompare(b._id)),[...s.rows[key]].sort((a,b)=>a._id.localeCompare(b._id))));
      let count=0;
      for(const [key,list]of Object.entries(s.rows))for(const row of list){
        if(key==='fences')continue; // C.2A structure: never delete or reset it.
        assertTime(s.plan);
        const filter={_id:row._id};if(row.technicalAccountId)filter.technicalAccountId=row.technicalAccountId;
        check((await s.models[key].deleteOne(filter,{session})).deletedCount===1);count++;
      }return count;
    },{readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},readPreference:'primary',timeoutMS:10000,maxCommitTimeMS:1000});
    return Object.freeze({cleanupConfirmed:true,documentsDeleted:deleted,indexesRetained:true});
  }finally{await session.endSession().catch(()=>{});}
}
export function sanitizedDurableFailure(error) {
  // No error.message/stack/objects or caller-provided strings are returned.
  const data=key=>{try{for(let o=error,n=0;o&&n<5;o=Object.getPrototypeOf(o),n++){const d=Object.getOwnPropertyDescriptor(o,key);if(d)return 'value'in d?d.value:undefined;}}catch{}return undefined;};
  const raw=data('code'),status=data('status'),code=[11000,112,251,50,8000].includes(raw)?raw:null;
  return Object.freeze({category:code===112?'WRITE_CONFLICT':code===11000?'DUPLICATE_KEY':
    status===401?'AUTHORIZATION_REVOKED':status===403?'FORBIDDEN':'DURABLE_TEST_UNAVAILABLE',code});
}
export async function closeDurableConnections(connections) {
  const unique=[...new Set(connections)];check(unique.length<=durableAtlasLimits.maxConnections);
  const results=await Promise.allSettled(unique.map(c=>c.close()));
  check(results.every(r=>r.status==='fulfilled'));return Object.freeze({closed:true,connectionsClosed:unique.length});
}
export function assertDurableScenarioDeadline(startedAt) {check(Number.isFinite(startedAt)&&performance.now()-startedAt<=durableAtlasLimits.scenarioMs);}

// Injected, already-composed actors ONLY. This does not connect, authorize or receive a secret.
// A separately reviewed receiver must verify the EXISTING schema/fence before composition.
export async function runPreparedDurableValidation({plan,actors:owned,peers,models,reopen}) {
  assertPlan(plan);check(equal(Object.keys(owned).sort(),['A','B','C'])&&equal(Object.keys(peers).sort(),['A','B']));
  const connections=[...new Set([...Object.values(owned),...Object.values(peers)].map(h=>state(h).repository.connection))];
  check(connections.length===2&&typeof reopen==='function');
  const registry=durableActorRegistry(plan,owned),results={phase:'B05.4C.2F.1C',completed:false,remoteGuaranteeValidated:false};let stage='scenario-A';
  try{
    const runtime=durableRuntime(plan);
    results.revocationFirst=await runtime.wait(()=>preparedRevocationFirst({plan,ingestion:owned.A,revoker:peers.A,operation:syntheticDurableOperation(plan,'A'),commandId:plan.identities.A.commandId}),durableAtlasLimits.scenarioMs);
    stage='scenario-B';results.ingestionFirst=await runtime.wait(()=>preparedIngestionFirst({plan,ingestion:owned.B,revoker:peers.B,operation:syntheticDurableOperation(plan,'B'),commandId:plan.identities.B.commandId}),durableAtlasLimits.scenarioMs);
    stage='scenario-C';results.lostResponseUnlink=await runtime.wait(()=>preparedLostResponseAndUnlink({plan,actor:owned.C,operation:syntheticDurableOperation(plan,'C'),foreignOperation:syntheticDurableOperation(plan,'A'),commandId:plan.identities.C.commandId}),durableAtlasLimits.scenarioMs);
    stage='reopen';const next=await runtime.wait(reopen);
    let delegated=false;
    try{check(!connections.includes(next.repository.connection));delegated=true;results.reopened=await verifyReopenedRevocation({actor:owned.B,...next});}
    finally{if(!delegated)await next.close();}
    stage='cleanup-inventory';runtime.assertCleanup();const handle=await captureDurableCleanup({plan,registry,models});
    stage='cleanup';results.cleanup=await cleanupDurableInventory({handle,connection:connections[0]});
    results.completed=true;stage='completed';
  }catch(error){void durableRuntime(plan).stop();results.failure=sanitizedDurableFailure(error);results.cleanup??={cleanupConfirmed:false,preserveInventory:true};}
  finally{
    results.stage=stage;
    try{results.mainConnections=await closeDurableConnections(connections);}catch{results.mainConnections={closed:false};results.completed=false;}
    results.resources=await durableRuntime(plan).finish();
    if(results.resources.stopped||results.resources.uncertain||!results.resources.closed||results.resources.pendingOperations)results.completed=false;
  }
  // This same runner is exercised with doubles. Only the future receiver can attach real evidence.
  return freeze(results);
}
