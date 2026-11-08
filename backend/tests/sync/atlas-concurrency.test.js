import './support/isolation-guard.js';
import {afterEach,expect,it,vi} from 'vitest';
import {MongoClient,MongoServerError} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {JwtService} from '../../src/modules/auth/jwt-service.js';
import net from 'node:net';
import {fixture,vectors,resources,batch} from './support/fixture.js';
import {mongoDouble} from './support/mongo-double.js';
import {IngestionService} from '../../src/modules/sync/ingestion-service.js';
import {resolveSyncContext} from '../../src/middleware/sync-auth-context.js';
import {SyntheticIdentityRepository} from '../identity-persistence/support/synthetic-repository.js';
import {SyntheticCoordinator} from './support/coordinator.js';
import {mongoAuthorizationFence} from '../../src/modules/sync/mongo-authorization-fence.js';
import {concurrencySafety,prepareConcurrencyPlan,executeAtlasConcurrencyRun,concurrencyOperation,exactCleanupInventory,runPreparedConcurrencyPairs} from '../../scripts/atlas-concurrency-harness.js';
afterEach(async()=>{for(const f of resources.splice(0))await f.close();vi.restoreAllMocks();});
const op=()=>concurrencyOperation(vectors.operations[0]);
async function setup(){const db=mongoDouble(),f=await fixture({repositoryFactory:db.factory});return {db,f};}
async function peer(db,accountId){
 if(!accountId){const f=await fixture({repositoryFactory:db.factory,binding:{installationId:randomUUID(),localPlayerId:randomUUID(),bindingGeneration:1}});return {service:f.service,ctx:f.ctx,repository:f.repository,f};}
 const owner=resources.find(f=>f.accountId===accountId),identity=db.identityFactory({now:owner.now});
 const auth=new JwtService({config:owner.config,repository:identity,now:owner.now,version:2});
 const ctx=await resolveSyncContext(await auth.authenticate(owner.token),owner.token,identity,owner.now);
 const repository=await db.factory({identityRepository:identity,coordinator:identity.coordinator,now:owner.now,context:ctx});
 return {service:new IngestionService({repository,identityRepository:identity}),ctx,repository,f:{coordinator:identity.coordinator}};
}
it('F01 independent actor coordinators exercise four bounded pairs through the real adapter with models doubled',async()=>{
  const {db,f}=await setup(),b=await peer(db,f.accountId),c=await peer(db);
  expect(b.f.coordinator).not.toBe(f.coordinator);
  const report=await runPreparedConcurrencyPairs({actors:[{service:f.service,ctx:f.ctx},b,c],operations:Array.from({length:5},op)});
  expect(report.applicationAttempts).toBe(8);expect(db.rows.operations).toHaveLength(6);expect(db.rows.facts).toHaveLength(6);
});
it('F02 duplicate unique-key error is retryable 503 without receipt and stable retry persists once',async()=>{
  const {db,f}=await setup(),operation=op(),original=db.models.operations.updateOne;
  vi.spyOn(db.models.operations,'updateOne').mockRejectedValueOnce(new MongoServerError({code:11000,errmsg:'synthetic private index'})).mockImplementation(original);
  const failed=await f.ingest([operation]);expect(failed.status).toBe(503);expect(failed.body.results[0].error.retryable).toBe(true);expect(failed.body.results[0].receipt).toBeUndefined();expect(db.rows.facts).toHaveLength(0);
  expect((await f.ingest([operation])).status).toBe(200);expect(db.rows.operations).toHaveLength(1);
});
it('F03 exhausted write conflict is temporary and does not manufacture an ACK',async()=>{
  const {db,f}=await setup();const error=new MongoServerError({code:112,errmsg:'synthetic conflict'});error.addErrorLabel('TransientTransactionError');
  vi.spyOn(db.models.fences,'updateOne').mockRejectedValue(error);const r=await f.ingest([op()]);
  expect(r.status).toBe(503);expect(r.body.results[0].error.retryable).toBe(true);expect(r.body.results[0].receipt).toBeUndefined();expect(db.rows.operations).toHaveLength(0);
});
it('F04 double simulates transient callback replay; one postcommit response and effect',async()=>{
  const {db,f}=await setup();db.failure='transient';const ack=vi.fn();f.repository.afterCommit=ack;expect((await f.ingest([op()])).status).toBe(200);
  expect(ack).toHaveBeenCalledTimes(1);expect(db.rows.operations).toHaveLength(1);expect(db.options.timeoutMS).toBe(10000);
});
it('F05 unknown committed result yields no speculative receipt; same ID recovers the stored receipt',async()=>{
  const {db,f}=await setup(),operation=op();db.failure='unknown';const r=await f.ingest([operation]);expect(r.status).toBe(503);expect(r.body.results[0].receipt).toBeUndefined();
  const saved=db.rows.operations[0].record.receipt;const retry=await f.ingest([operation]);expect(retry.body.results[0].receipt).toEqual(saved);expect(db.rows.facts).toHaveLength(1);
});
it('F06 lost response after commit and reconstructed client retain receipt and one effect',async()=>{
  const {db,f}=await setup(),operation=op();f.repository.afterCommit=async()=>{throw new Error('synthetic response lost');};expect((await f.ingest([operation])).status).toBe(503);
  const receipt=db.rows.operations[0].record.receipt,repository=await db.factory({identityRepository:f.identity,coordinator:f.coordinator,now:f.now,context:f.ctx});
  const service=new IngestionService({repository,identityRepository:f.identity}),r=await service.batches(f.ctx,batch([operation]));
  expect(r.body.results[0].receipt).toEqual(receipt);expect(db.rows.operations).toHaveLength(1);
});
it('F07 foreign binding and receipt queries cannot expose another owner',async()=>{
  const {db,f}=await setup(),operation=op();await f.ingest([operation]);const other=await peer(db);
  const q=await other.service.receipts(other.ctx,{schemaVersion:2,attempts:[{operationId:operation.operationId,payloadHash:operation.payloadHash,leaseId:operation.leaseId,attempt:1}]});
  expect(q.results[0].status).toBe('not_found');expect(q.results[0].receipt).toBeUndefined();
});
it('F08 cleanup filters require exact collection/id/run/owner and reject foreign inventory',()=>{
  const runId='a'.repeat(32),collection='b054c2c_'+runId+'_ops',manifest={runId,documents:[{collection,id:'one',syntheticOwnerId:'s',technicalAccountId:'owner'}]};
  const row={collection,document:{_id:'one',integrationRunId:runId,syntheticOwnerId:'s',technicalAccountId:'owner'}};
  expect(exactCleanupInventory([row],manifest)[0].filter).toEqual({_id:'one',integrationRunId:runId,syntheticOwnerId:'s',technicalAccountId:'owner'});
  for(const bad of [{...row,collection:'foreign'},{...row,document:{...row.document,technicalAccountId:'other'}},{...row,document:{...row.document,integrationRunId:'other'}}])expect(()=>exactCleanupInventory([bad],manifest)).toThrow();
  expect(()=>exactCleanupInventory([row,row],manifest)).toThrow();
});
it('F09 secret diagnostics stay generic on an unknown database error',async()=>{
  const {db,f}=await setup();const marker='synthetic-private-marker';vi.spyOn(db.models.operations,'updateOne').mockRejectedValue(new Error(marker+f.token+f.credential));
  const r=await f.ingest([op()]);expect(r.status).toBe(503);expect(JSON.stringify(r)).not.toContain(marker);expect(JSON.stringify(r)).not.toContain(f.token);expect(JSON.stringify(r)).not.toContain(f.credential);
});
it('F10 historical independent identity composition now fails closed before any Mongo write',async()=>{
 const db=mongoDouble(),f=await fixture();
 await expect(db.factory({identityRepository:f.identity,coordinator:f.coordinator,now:f.now,context:f.ctx})).rejects.toThrow();
 expect(db.rows.operations).toHaveLength(0);expect(db.rows.ownerGuards).toHaveLength(0);
});
it('F11 F.2 entry remains blocked before setup/credentials even if called with authorization-looking fields',async()=>{
  expect(concurrencySafety.remoteEnabled).toBe(false);expect(prepareConcurrencyPlan().maxParallelRequests).toBe(2);
  const connect=vi.fn();await expect(executeAtlasConcurrencyRun({authorized:true,connector:connect})).rejects.toMatchObject({code:'REVOCATION_COMMIT_RACE_REQUIRES_REVIEW'});expect(connect).not.toHaveBeenCalled();
});
it('F12 actual driver withTransaction retries a transient callback offline within its timeout',async()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Offline only');});
  const client=new MongoClient('mongodb://127.0.0.1'),session=client.startSession();
  const abort=vi.spyOn(session,'abortTransaction').mockImplementation(async()=>{session.transaction.transition('TRANSACTION_ABORTED');}),
    commit=vi.spyOn(session,'commitTransaction').mockImplementation(async()=>{session.transaction.transition('TRANSACTION_COMMITTED');});
  const error=new MongoServerError({code:112,errmsg:'synthetic transient'});error.addErrorLabel('TransientTransactionError');let calls=0;
  try{const result=await session.withTransaction(async()=>{if(++calls===1)throw error;return 'synthetic-confirmed';},{timeoutMS:1000});
    expect(result).toBe('synthetic-confirmed');expect(calls).toBe(2);expect(abort).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledTimes(1);expect(socket).not.toHaveBeenCalled();
  }finally{await session.endSession();await client.close();}
});
it('F13 actual driver retries only commit for UnknownTransactionCommitResult, not the callback, offline',async()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Offline only');});
  const client=new MongoClient('mongodb://127.0.0.1'),session=client.startSession();
  const error=new MongoServerError({code:91,errmsg:'synthetic unknown commit'});error.addErrorLabel('UnknownTransactionCommitResult');
  const commit=vi.spyOn(session,'commitTransaction').mockRejectedValueOnce(error).mockImplementation(async()=>{session.transaction.transition('TRANSACTION_COMMITTED');}),work=vi.fn(async()=>true);
  try{expect(await session.withTransaction(work,{timeoutMS:1000})).toBe(true);expect(work).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledTimes(2);expect(socket).not.toHaveBeenCalled();
  }finally{await session.endSession();await client.close();}
});
