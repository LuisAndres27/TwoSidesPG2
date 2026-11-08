import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import { generateKeyPair } from 'jose';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { durableClientOptions } from '../../scripts/durable-revocation-runtime.js';
import { mongoDouble } from './support/mongo-double.js';
import { atlasDouble,atlasConfig } from './support/atlas-double.js';
import { MongoIdentityRepository } from '../../src/modules/auth/mongo-identity-repository.js';
import { MongoIngestionRepository } from '../../src/modules/sync/mongo-ingestion-repository.js';
import { ingestionModels } from '../../src/modules/sync/mongo-models.js';
import { CredentialHasher } from '../../src/modules/auth/credential-hasher.js';
import { RateLimiter,RATE_POLICY } from '../../src/middleware/rate-limiter.js';
import { fixture,resources } from './support/fixture.js';
import { prepareDurableAtlasPlan,executeDurableAtlasRun,durableAtlasLimits,durableIndexes,
  verifyDurableEnumeration,inspectDurableAtlasPreflight,verifyDurableIndexes,verifyDurableModels,durableProvisionSteps,verifyDurableInitialInventory,durableHarnessTask,
  syntheticDurableOperation,registerDurableRaceActor,durableRaceActor,cloneDurableRaceActor,
  preparedRevocationFirst,preparedIngestionFirst,preparedLostResponseAndUnlink,verifyReopenedRevocation,
  durableActorRegistry,captureDurableCleanup,cleanupDurableInventory,sanitizedDurableFailure,closeDurableConnections,
  runPreparedDurableValidation,durableRuntime,
} from '../../scripts/durable-revocation-atlas-harness.js';
const runtimePlans=[];
afterEach(async()=>{for(const p of runtimePlans.splice(0))await durableRuntime(p).finish();for(const f of resources.splice(0))await f.close();vi.restoreAllMocks();});
let keys;
const clone=x=>structuredClone(x);
const metadata=plan=>({ok:1,cursor:{id:0,firstBatch:plan.expectedPreexisting.map(name=>({name}))}});
function replica(db,now){
  const connection={...db.connection,models:{},async close(){this.readyState=0;}},models={};
  for(const [key,m]of Object.entries(db.models))models[key]={...m,db:connection,collection:{...m.collection,conn:connection}};
  const identity=new MongoIdentityRepository({synthetic:true,connection,models,now});
  const repository=new MongoIngestionRepository({synthetic:true,disposable:true,connection,models,identityRepository:identity,coordinator:identity.coordinator,now});
  return {identity,repository,connection,models};
}
async function setup(){
  const plan=prepareDurableAtlasPlan(),db=mongoDouble(),now=()=>Date.parse('2026-10-29T12:00:00.000Z');
  runtimePlans.push(plan);
  verifyDurableInitialInventory(plan,clone(db.rows));
  db.connection.close=async()=>{db.connection.readyState=0;};ingestionModels(db.connection);
  const identity=db.identityFactory({now}),config={...await(keys??=generateKeyPair('RS256',{modulusLength:2048})),
    mode:'isolated-test',algorithm:'RS256',issuer:'https://two-sides.test.invalid',audience:'two-sides-isolated-api',keyId:'revocation-atlas-preflight'};
  const hasher=new CredentialHasher(),limiter=new RateLimiter({now}),actors={};
  for(const label of ['A','B','C'])actors[label]=await registerDurableRaceActor({plan,label,identity,
    createRepository:options=>new MongoIngestionRepository({synthetic:true,disposable:true,connection:db.connection,models:db.models,...options}),
    jwtConfig:config,hasher,limiter,policy:RATE_POLICY,now});
  const second=replica(db,now),peers={};
  for(const label of ['A','B'])peers[label]=await cloneDurableRaceActor({actor:actors[label],...second});
  const registry=durableActorRegistry(plan,actors);
  const scopedModels=Object.fromEntries(Object.entries(db.models).map(([k,m])=>[k,{...m,collection:{...m.collection,name:plan.collections[k]}}]));
  return {plan,db,actors,peers,registry,scopedModels,now};
}
const input=(f,label)=>({plan:f.plan,ingestion:f.actors[label],revoker:f.peers[label],operation:syntheticDurableOperation(f.plan,label),commandId:f.plan.identities[label].commandId});
async function runAll(f){
  const a=await preparedRevocationFirst(input(f,'A')),b=await preparedIngestionFirst(input(f,'B'));
  const c=await preparedLostResponseAndUnlink({plan:f.plan,actor:f.actors.C,operation:syntheticDurableOperation(f.plan,'C'),
    foreignOperation:syntheticDurableOperation(f.plan,'A'),commandId:f.plan.identities.C.commandId});return {a,b,c};
}
it('RC01 remote entry remains unconditionally disabled before connector/credential access',async()=>{
  const connector=vi.fn();await expect(executeDurableAtlasRun({authorized:true,connector})).rejects.toMatchObject({code:'DURABLE_REVOCATION_C2_NOT_AUTHORIZED'});
  expect(connector).not.toHaveBeenCalled();expect(durableAtlasLimits.remoteEnabled).toBe(false);
});
it('RC02 plans reuse C.2A namespaces but distinguish executions and synthetic bindings',()=>{
  const p=prepareDurableAtlasPlan(),other=prepareDurableAtlasPlan();expect(p.runId).toBe('10ef4f6d653f4ee4a1d1b2e6591013c2');expect(p.runId).toBe(other.runId);expect(p.executionId).not.toBe(other.executionId);expect(Object.values(p.collections)).toHaveLength(8);
  expect(new Set(Object.values(p.identities).map(i=>i.installationId)).size).toBe(3);expect(p.limits).toMatchObject({owners:3,applicationAttempts:8,maxParallel:2,callbackAttempts:3});
  expect(()=>{p.target.database='two_sides_db';}).toThrow();expect(JSON.stringify(p)).not.toMatch(/password|privateKey|accessToken|credentialVerifier/);
});
it('RC03 enumeration accepts only the exact retained namespace inventory, never claims its contents',()=>{
  const p=prepareDurableAtlasPlan();expect(verifyDurableEnumeration(p,metadata(p))).toEqual({complete:true,retainedNamespaces:12,newNamespacesPresent:0});
  for(const r of [{ok:1,cursor:{id:1,firstBatch:metadata(p).cursor.firstBatch}},{ok:1,cursor:{id:0,firstBatch:[]}},
    {ok:1,cursor:{id:0,firstBatch:[...metadata(p).cursor.firstBatch,{name:'foreign'}]}},
    {ok:1,cursor:{id:0,firstBatch:[...metadata(p).cursor.firstBatch,{name:p.collections.operations}]}},
    {ok:1,cursor:{id:0,firstBatch:[...metadata(p).cursor.firstBatch,metadata(p).cursor.firstBatch[0]]}}])expect(()=>verifyDurableEnumeration(p,r)).toThrow();
});
it('RC04 preflight uses strict DEFAULT identity/permissions and the single unfiltered command without model writes',async()=>{
  const p=prepareDurableAtlasPlan(),db=atlasDouble(atlasConfig({runId:p.runId,authMechanism:'DEFAULT'}));
  const options=db.connection.getClient().options;options.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options});
  Object.assign(options,durableClientOptions);await durableRuntime(p).openClient(async()=>db.connection);runtimePlans.push(p);
  db.status.authInfo.authenticatedUserPrivileges[0].actions.push('listCollections');const commands=[];
  db.connection.db.command=async c=>{commands.push(c);return c.connectionStatus?db.status:metadata(p);};
  expect(await inspectDurableAtlasPreflight(p,db.connection,db.config)).toMatchObject({permissionsVerified:true,tlsVerified:true,replicaSetPrimary:true});
  expect(commands).toEqual([{connectionStatus:1,showPrivileges:true},{listCollections:1,authorizedCollections:true,nameOnly:true}]);
  expect(db.calls).toHaveLength(0);expect(db.connects).toBe(0);
});
it('RC05 missing metadata privileges prevents even enumeration',async()=>{
  const p=prepareDurableAtlasPlan(),db=atlasDouble(atlasConfig({runId:p.runId,authMechanism:'DEFAULT'}));
  const options=db.connection.getClient().options;options.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options});
  Object.assign(options,durableClientOptions);await durableRuntime(p).openClient(async()=>db.connection);runtimePlans.push(p);
  await expect(inspectDurableAtlasPreflight(p,db.connection,db.config)).rejects.toThrow();expect(db.commands).toEqual([{connectionStatus:1,showPrivileges:true}]);
});
for(const key of ['operations','facts','fences','authorization','identities','ownerGuards','identitySessions','revocations'])it(`RC06 ${key} exact index inventory rejects extras, partial/hidden/TTL indexes and missing uniques`,()=>{
  const id={name:'_id_',key:{_id:1}},expected=durableIndexes.filter(i=>i.model===key).map(i=>({name:i.name,key:i.key,unique:true}));
  expect(()=>verifyDurableIndexes(key,[id,...expected])).not.toThrow();
  expect(()=>verifyDurableIndexes(key,[id,...expected,{name:'unexpected',key:{other:1}}])).toThrow();
  if(expected.length){expect(()=>verifyDurableIndexes(key,[id])).toThrow();for(const bad of [{sparse:true},{partialFilterExpression:{}},{hidden:true},{expireAfterSeconds:1}])
    expect(()=>verifyDurableIndexes(key,[id,{...expected[0],...bad},...expected.slice(1)])).toThrow();}
});
it('RC07 prepared C.2A schema must not be provisioned or reseeded',()=>{
  const plan=prepareDurableAtlasPlan(),steps=durableProvisionSteps(plan);expect(steps.createCollections).toHaveLength(0);expect(steps.createIndexes).toHaveLength(0);expect(steps.seedFence).toBeNull();
  expect(steps).toMatchObject({executeDuringC1:false,autoCreate:false,autoIndex:false});expect(()=>durableProvisionSteps({...plan})).toThrow();
});
it('RC08 active real durable actors use isolated schema factories and opaque token handles',async()=>{
  const f=await setup();verifyDurableModels(f.plan,f.scopedModels);expect(JSON.stringify(f.actors)).toBe('{"A":{},"B":{},"C":{}}');
  expect(f.db.rows.identities).toHaveLength(3);expect(f.db.rows.identitySessions).toHaveLength(3);expect(f.db.rows.authorization).toHaveLength(0);
  expect(()=>verifyDurableModels(f.plan,{...f.scopedModels,ownerGuards:{...f.scopedModels.ownerGuards,collection:{name:'foreign'}}})).toThrow();
});
it('RC09 A revocation wins after snapshot read but before guard write; conflict retry sees revoked state',async()=>{
  const f=await setup(),r=await preparedRevocationFirst(input(f,'A'));expect(r).toMatchObject({noNewReceipt:true,oldTokenRejected:true,duplicateRejected:true});
  expect(r.ownerWriteAttempts).toBeGreaterThanOrEqual(2);expect(f.db.conflicts).toBeGreaterThan(0);expect(f.db.rows.operations).toHaveLength(0);
});
it('RC10 B ingestion wins; revocation snapshot conflicts and historical receipt is retained',async()=>{
  const f=await setup(),r=await preparedIngestionFirst(input(f,'B'));expect(r.receiptPreserved).toBe(true);expect(r.operationRevision).toBeLessThan(r.revocationRevision);
  expect(f.db.conflicts).toBeGreaterThan(0);expect(f.db.rows.operations).toHaveLength(1);
});
it('RC11 C known commit with lost response recovers original receipt, rejects foreign binding, then unlinks',async()=>{
  const f=await setup();const r=await preparedLostResponseAndUnlink({plan:f.plan,actor:f.actors.C,operation:syntheticDurableOperation(f.plan,'C'),
    foreignOperation:syntheticDurableOperation(f.plan,'A'),commandId:f.plan.identities.C.commandId});
  expect(r).toMatchObject({receiptRecovered:true,foreignBindingRejected:true,unlinkPersisted:true,unknownServerCommitProven:false});expect(f.db.rows.operations).toHaveLength(1);
});
it('RC12 bounded suite uses native repositories across connection facades and owners; no sockets',async()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Network prohibited');});
  const f=await setup(),result=await runAll(f);expect(result.a.revocationConfirmed&&result.b.receiptPreserved&&result.c.unlinkPersisted).toBe(true);
  expect(f.db.rows.operations).toHaveLength(2);expect(f.db.rows.facts).toHaveLength(2);expect(f.db.rows.revocations).toHaveLength(3);
  expect(socket).not.toHaveBeenCalled();await expect(preparedRevocationFirst(input(f,'A'))).rejects.toThrow();
});
it('RC13 reopening repository/connection rejects the old JWT and sees the historical receipt; closes it',async()=>{
  const f=await setup();await preparedIngestionFirst(input(f,'B'));const next=replica(f.db,f.now),close=vi.fn(()=>next.connection.close());
  expect(await verifyReopenedRevocation({actor:f.actors.B,...next,close})).toEqual({reopened:true,oldTokenRejected:true,persistedReceipt:true});
  expect(close).toHaveBeenCalledTimes(1);
});
it('RC14 malformed operation or actor binding cannot enlarge the approved synthetic case',async()=>{
  const f=await setup(),i=input(f,'A');await expect(preparedRevocationFirst({...i,operation:{...i.operation,operationId:randomUUID()}})).rejects.toThrow();
  expect(f.db.rows.operations).toHaveLength(0);expect(f.db.rows.revocations).toHaveLength(0);
});
it('RC15 exhausted conflicts sanitize outcome, drain transactions and leave no ACK or receipt',async()=>{
  const f=await setup();f.db.beforeCommit=async()=>{throw Object.assign(new Error('private failure'),{code:112,hasErrorLabel:l=>l==='TransientTransactionError'});};
  await expect(preparedIngestionFirst(input(f,'B'))).rejects.toThrow();expect(f.db.rows.operations).toHaveLength(0);expect(f.db.rows.revocations).toHaveLength(0);
});
it('RC16 unknown commit from repository stops the scenario rather than implying rollback',async()=>{
  const f=await setup();f.db.failure='unknown';await expect(preparedIngestionFirst(input(f,'B'))).rejects.toThrow();
  expect(f.db.rows.operations).toHaveLength(1);expect(f.db.rows.revocations).toHaveLength(0);
  expect(durableRuntime(f.plan).snapshot().uncertain).toBe(true);
});
it('RC17 memory identity cannot become an opaque durable actor or replace Mongo identity',async()=>{
  const f=await fixture();await expect(durableRaceActor({identity:f.identity,repository:f.repository,auth:f.auth,token:f.token})).rejects.toThrow();
  const db=mongoDouble();expect(()=>new MongoIngestionRepository({synthetic:true,disposable:true,connection:db.connection,models:db.models,identityRepository:f.identity,coordinator:f.coordinator})).toThrow();
});
it('RC18 cleanup handles are opaque and delete only exact owned rows, atomically, retaining indexes',async()=>{
  const f=await setup();await runAll(f);const handle=await captureDurableCleanup({plan:f.plan,registry:f.registry,models:f.scopedModels});
  expect(JSON.stringify(handle)).toBe('{}');const r=await cleanupDurableInventory({handle,connection:f.db.connection});
  expect(r).toEqual({cleanupConfirmed:true,documentsDeleted:16,indexesRetained:true});expect(Object.entries(f.db.rows).filter(([k])=>k!=='fences').every(([,rows])=>rows.length===0)).toBe(true);
  expect(f.db.rows.fences).toHaveLength(1);expect(f.db.rows.fences[0]._id).toBe('ingestion-v1');expect(f.db.rows.fences[0].revision).toBeGreaterThan(0);
  expect(f.db.calls.filter(c=>c.kind==='delete'&&c.name==='fences')).toHaveLength(0);
  await expect(cleanupDurableInventory({handle,connection:f.db.connection})).rejects.toThrow();
});
it('RC19 unexpected owner/ID or namespace forbids cleanup, never deletes an outsider',async()=>{
  const f=await setup();await runAll(f);f.db.rows.ownerGuards.push({_id:randomUUID(),revision:0});
  await expect(captureDurableCleanup({plan:f.plan,registry:f.registry,models:f.scopedModels})).rejects.toThrow();expect(f.db.calls.filter(c=>c.kind==='delete')).toHaveLength(0);
  await expect(captureDurableCleanup({plan:f.plan,registry:{...f.registry},models:f.scopedModels})).rejects.toThrow();
});
it('RC20 changing any captured content aborts before first delete',async()=>{
  const f=await setup();await runAll(f);const handle=await captureDurableCleanup({plan:f.plan,registry:f.registry,models:f.scopedModels});f.db.rows.ownerGuards[0].revision++;
  await expect(cleanupDurableInventory({handle,connection:f.db.connection})).rejects.toThrow();expect(f.db.calls.filter(c=>c.kind==='delete')).toHaveLength(0);expect(f.db.rows.identities).toHaveLength(3);
});
it('RC21 a delete failure rolls back all preceding deletes in the same transaction',async()=>{
  const f=await setup();await runAll(f);const handle=await captureDurableCleanup({plan:f.plan,registry:f.registry,models:f.scopedModels}),before=clone(f.db.rows);
  vi.spyOn(f.scopedModels.identities,'deleteOne').mockRejectedValue(new Error('Controlled failure'));
  await expect(cleanupDurableInventory({handle,connection:f.db.connection})).rejects.toThrow();expect(f.db.rows).toEqual(before);
});
it('RC22 diagnostics emit only fixed categories/codes and all connections close despite one close error',async()=>{
  const secret='synthetic-private-marker';expect(JSON.stringify(sanitizedDurableFailure(Object.assign(new Error(secret),{code:112,stack:secret})))).not.toContain(secret);
  expect(sanitizedDurableFailure({code:112})).toEqual({category:'WRITE_CONFLICT',code:112});
  expect(sanitizedDurableFailure({status:401})).toEqual({category:'AUTHORIZATION_REVOKED',code:null});
  const getter=vi.fn(()=>{throw new Error(secret);});const hostile=Object.defineProperty({},'code',{get:getter});
  expect(sanitizedDurableFailure(hostile).category).toBe('DURABLE_TEST_UNAVAILABLE');expect(getter).not.toHaveBeenCalled();
  const a={close:vi.fn(async()=>{})},b={close:vi.fn(async()=>{throw new Error(secret);})};
  await expect(closeDurableConnections([a,b])).rejects.toThrow('Durable revocation preflight unavailable.');expect(a.close).toHaveBeenCalledTimes(1);expect(b.close).toHaveBeenCalledTimes(1);
});
it('RC23 duplicate handles close once and excessive connection budgets reject before close',async()=>{
  const c={close:vi.fn(async()=>{})};expect(await closeDurableConnections([c,c])).toEqual({closed:true,connectionsClosed:1});
  const four=Array.from({length:4},()=>({close:vi.fn()}));await expect(closeDurableConnections(four)).rejects.toThrow();expect(four.every(c=>c.close.mock.calls.length===0)).toBe(true);
});
it('RC24 orchestrator cleans 16 own rows and retains the prepared fence, then closes',async()=>{
  const f=await setup();const result=await runPreparedDurableValidation({plan:f.plan,actors:f.actors,peers:f.peers,models:f.scopedModels,
    reopen:async()=>{const next=replica(f.db,f.now);return {...next,close:()=>next.connection.close()};}});
  expect(result).toMatchObject({completed:true,stage:'completed',remoteGuaranteeValidated:false,cleanup:{cleanupConfirmed:true,documentsDeleted:16},mainConnections:{closed:true,connectionsClosed:2}});
  expect(result.resources).toMatchObject({closed:true,uncertain:false,activeSessions:0,pendingOperations:0,clientsCreated:3});
  expect(JSON.stringify(result)).not.toMatch(/accessToken|credentialVerifier|privateKey|tokenHash/);
});
it('RC25 initial inventory rejects an absent, changed or foreign fence and any previous execution data',()=>{
  const fresh=()=>({operations:[],facts:[],fences:[{_id:'ingestion-v1',revision:0}],authorization:[],identities:[],ownerGuards:[],identitySessions:[],revocations:[]});
  expect(verifyDurableInitialInventory(prepareDurableAtlasPlan(),fresh())).toEqual({preparedFenceVerified:true,existingDocuments:1});
  for(const mutate of [r=>r.fences.splice(0),r=>r.fences[0].revision++,r=>r.fences[0].technicalAccountId='foreign',r=>r.identities.push({_id:'previous'}),r=>r.fences.push({_id:'other',revision:0})]){
    const rows=fresh();mutate(rows);expect(()=>verifyDurableInitialInventory(prepareDurableAtlasPlan(),rows)).toThrow();
  }
});
it('RC26 total admission deadline prevents a scenario before any new transaction starts',async()=>{
  const f=await setup(),started=performance.now(),clock=vi.spyOn(performance,'now').mockReturnValue(started+durableAtlasLimits.totalMs+1);
  const before=f.db.calls.length;await expect(preparedRevocationFirst(input(f,'A'))).rejects.toThrow();expect(f.db.calls).toHaveLength(before);clock.mockRestore();
});
it('RC27 active task admission caps application/revocation work at two participants',async()=>{
  const f=await setup(),model=f.db.models.ownerGuards,original=model.updateOne;let first=true,observed=false;
  model.updateOne=async function(...args){if(first){first=false;let release;const gate=new Promise(r=>{release=r;});
    const second=durableHarnessTask(f.plan,()=>gate);
    try{const work=vi.fn();await expect(durableHarnessTask(f.plan,work)).rejects.toThrow();expect(work).not.toHaveBeenCalled();observed=true;}
    finally{release();await second;}}
    return original.apply(this,args);
  };
  await preparedRevocationFirst(input(f,'A'));expect(observed).toBe(true);
});
it('RC28 per-scenario budget refuses a third application attempt before invoking it',async()=>{
  const f=await setup(),model=f.db.models.ownerGuards,original=model.updateOne;let first=true;
  model.updateOne=async function(...args){if(first){first=false;await durableHarnessTask(f.plan,async()=>{}, {application:true});
    const work=vi.fn();await expect(durableHarnessTask(f.plan,work,{application:true})).rejects.toThrow();expect(work).not.toHaveBeenCalled();}
    return original.apply(this,args);
  };
  await expect(preparedRevocationFirst(input(f,'A'))).rejects.toThrow();expect(f.db.rows.operations).toHaveLength(0);
});
it('RC29 an uncertain commit cannot masquerade as known response loss or trigger a retry/unlink',async()=>{
  const f=await setup();f.db.failure='unknown';
  await expect(preparedLostResponseAndUnlink({plan:f.plan,actor:f.actors.C,operation:syntheticDurableOperation(f.plan,'C'),
    foreignOperation:syntheticDurableOperation(f.plan,'A'),commandId:f.plan.identities.C.commandId})).rejects.toThrow();
  expect(f.db.rows.operations).toHaveLength(1);expect(f.db.rows.revocations).toHaveLength(0);
  expect(f.db.rows.identities.every(row=>row.active&&row.linked)).toBe(true);expect(f.db.calls.some(c=>c.kind==='delete')).toBe(false);
});
it('RC30 changing the prepared fence after capture aborts cleanup without deleting any document',async()=>{
  const f=await setup();await runAll(f);const handle=await captureDurableCleanup({plan:f.plan,registry:f.registry,models:f.scopedModels});
  f.db.rows.fences[0].revision++;const before=clone(f.db.rows);
  await expect(cleanupDurableInventory({handle,connection:f.db.connection})).rejects.toThrow();expect(f.db.rows).toEqual(before);
  expect(f.db.calls.some(c=>c.kind==='delete')).toBe(false);
});
it('RC31 registration cannot write without initial inventory approval',async()=>{
  const plan=prepareDurableAtlasPlan(),db=mongoDouble(),identity=db.identityFactory({});
  await expect(registerDurableRaceActor({plan,label:'A',identity,createRepository:()=>{}})).rejects.toThrow();
  expect(db.rows.identities).toHaveLength(0);expect(db.calls.some(c=>c.kind==='write')).toBe(false);
});
