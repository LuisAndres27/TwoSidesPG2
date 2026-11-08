// Opt-in D.2 harness. Never imported by app/server; no default connector or credentials.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { openAtlasIntegration } from '../src/modules/sync/atlas-integration.js';
import { ingestionModels } from '../src/modules/sync/mongo-models.js';
import { mongoAuthorizationFence } from '../src/modules/sync/mongo-authorization-fence.js';
import { consumeAtlasCredential,temporaryAtlasCredential } from '../src/modules/sync/atlas-credentials.js';
import { atlasCollections } from '../src/modules/sync/atlas-policy.js';
import { assertAtlasNamespacesAbsent } from '../src/modules/sync/atlas-namespace-preflight.js';
import { canonical,digest } from '../src/modules/sync/canonical-envelope.js';
import { resolveSyncContext } from '../src/middleware/sync-auth-context.js';
import { fixture,vectors,batch,clone } from '../tests/sync/support/fixture.js';

const check=value=>{if(!value)throw new Error('Synthetic assertion failed');};
export function syntheticOperation(checkpoint,index,{contradiction=false,foreign=false}={}){
  const op=clone(vectors.operations[0]),e=JSON.parse(op.canonicalEnvelope);
  check(e.type==='session.report'&&e.payload.phase==='open');
  op.operationId=checkpoint.operationIds[index];op.leaseId=checkpoint.leaseId;
  e.payload.sessionId=checkpoint.sessionIds[index];e.sourceKey='session:'+e.payload.sessionId+':open';
  if(contradiction)e.payload.startedAtUtc='2026-10-28T00:00:00.124Z';
  if(foreign)e.installationId=checkpoint.foreignInstallationId;
  op.canonicalEnvelope=canonical(e);op.payloadHash=digest(op.canonicalEnvelope);return op;
}
export function expectedDocumentIds(cp){
  const own=[cp.accountId,cp.installationId,cp.localPlayerId,1].join(':');
  return {operations:cp.operationIds.map(id=>cp.accountId+':'+id),
    facts:cp.sessionIds.map(id=>own+'|session:'+id+':open'),
    fences:['ingestion-v1','commit-'+cp.runId],authorization:cp.authorizationIds};
}
export function assertOwnedRows(cp,key,rows){
  const ids=new Set(expectedDocumentIds(cp)[key]);
  check(rows.length<=12);
  for(const row of rows){
    check(ids.has(row._id)&&row.integrationRunId===cp.runId&&row.syntheticOwnerId===cp.runId);
    if(key==='operations')check(row.technicalAccountId===cp.accountId&&row.record?.key===row._id&&row.record?.receipt?.technicalAccountId===cp.accountId);
    if(key==='facts')check(row.scope?.startsWith(cp.accountId+':')&&row.record?.key===row._id);
    if(key==='authorization')check(row.technicalAccountId===cp.accountId);
  }
}
async function ownedFixture(accountId){
  const f=await fixture();
  if(!accountId)return {f,context:f.ctx};
  // Reconstruct a fictitious owner ONLY. This is not durable identity or revocation recovery.
  const old=f.accountId;f.identity.state.accounts[0].technicalAccountId=accountId;
  for(const s of f.identity.state.sessions)if(s.technicalAccountId===old)s.technicalAccountId=accountId;
  const token=await f.signed({sub:accountId});
  const context=await resolveSyncContext(await f.auth.authenticate(token),token,f.identity,f.now);
  return {f,context};
}
export async function persistenceStage({stage,config,credential,connector,checkpointPath,report}){
  let pass=consumeAtlasCredential(credential),active=[],fixtures=[];
  const save=cp=>fs.writeFile(checkpointPath,JSON.stringify(cp,null,2),{encoding:'utf8'});
  const connect=async(owner)=>{
    let connection,models;
    const f=owner.f;
    const handle=await openAtlasIntegration({config,credential:temporaryAtlasCredential(Buffer.from(pass,'utf8')),
      connector:async(uri,options)=>{connection=await connector(uri,options);return connection;},
      modelFactory:(c,options)=>(models=ingestionModels(c,options))});
    active.push(handle);
    const repository=handle.createRepository({identityRepository:f.identity,coordinator:f.coordinator,now:f.now,
      fenceAuthorization:args=>mongoAuthorizationFence(models.authorization,f.now)(args)});
    const service=new (await import('../src/modules/sync/ingestion-service.js')).IngestionService({repository,identityRepository:f.identity});
    return {handle,connection,models,repository,service,...owner};
  };
  const control=async(db,cp)=>{
    const c=db.context;cp.authorizationIds.push(c.sessionId);await save(cp);
    await db.models.authorization.create({_id:c.sessionId,technicalAccountId:c.technicalAccountId,installationId:c.installationId,
      localPlayerId:c.localPlayerId,bindingGeneration:c.bindingGeneration,credentialVersion:c.credentialVersion,
      authzVersion:c.authzVersion,active:true,expiresAt:c.expiresAt,revision:0});
  };
  const ingest=(db,op)=>db.service.batches(db.context,batch([op]));
  const receipt=r=>r.body.results[0].receipt;
  const equivalent=(a,b)=>canonical(a)===canonical(b);
  try{
    report.stage='authentication-and-permissions';
    let cp,owner;
    if(stage===1){owner=await ownedFixture();fixtures.push(owner.f);
      cp={runId:config.runId,accountId:owner.context.technicalAccountId,installationId:owner.context.installationId,
        localPlayerId:owner.context.localPlayerId,operationIds:[randomUUID(),randomUUID(),randomUUID()],
        sessionIds:[randomUUID(),randomUUID(),randomUUID()],leaseId:randomUUID(),foreignInstallationId:randomUUID(),authorizationIds:[],collections:atlasCollections(config)};
      await fs.writeFile(checkpointPath,JSON.stringify(cp,null,2),{flag:'wx',encoding:'utf8'});
    }else{
      cp=JSON.parse(await fs.readFile(checkpointPath,'utf8'));check(cp.runId===config.runId&&equivalent(cp.collections,atlasCollections(config)));
      owner=await ownedFixture(cp.accountId);fixtures.push(owner.f);
    }
    let db=await connect(owner);report.authentication='verified';report.permissions='verified';
    if(stage===1){
      report.stage='namespace-preflight';
      await assertAtlasNamespacesAbsent({connection:db.connection,config});
      report.namespacesInitiallyAbsent=true;
      for(const name of Object.values(cp.collections))check(Buffer.byteLength(config.database+'.'+name)<=95);
      report.stage='minimal-model-write';
      await db.models.fences.createCollection({writeConcern:{w:'majority'}});
      await db.models.fences.create({_id:'ingestion-v1',revision:0});
      let minimal=await db.models.fences.findById('ingestion-v1').lean();assertOwnedRows(cp,'fences',[minimal]);check(minimal.revision===0);
      report.minimalModelWrite=true;
      await db.handle.close();active=active.filter(h=>h!==db.handle);
      report.stage='reconnect-minimal';db=await connect(owner);
      minimal=await db.models.fences.findById('ingestion-v1').lean();assertOwnedRows(cp,'fences',[minimal]);check(minimal.revision===0);
      report.minimalPersistsAfterReconnect=true;
      report.stage='explicit-indexes';
      for(const key of ['operations','facts','authorization'])await db.models[key].createCollection({writeConcern:{w:'majority'}});
      await db.models.operations.createIndexes();await db.models.facts.createIndexes();
      await db.repository.verifyDeployment();report.requiredIndexesVerified=true;
      report.stage='transaction-commit';
      let session=await db.connection.startSession();
      try{session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},maxCommitTimeMS:1000});
        await db.models.fences.create([{_id:'commit-'+cp.runId,revision:1}],{session});await session.commitTransaction();
      }finally{if(session.inTransaction())await session.abortTransaction();await session.endSession();}
      check((await db.models.fences.findById('commit-'+cp.runId).lean())?.revision===1);report.transactionCommit=true;
      report.stage='transaction-abort';session=await db.connection.startSession();
      try{session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},maxCommitTimeMS:1000});
        await db.models.fences.create([{_id:'abort-'+cp.runId,revision:1}],{session});await session.abortTransaction();
      }finally{if(session.inTransaction())await session.abortTransaction();await session.endSession();}
      check(await db.models.fences.findById('abort-'+cp.runId).lean()===null);report.transactionAbort=true;
      report.stage='adapter-first-operation';await control(db,cp);
      const first=await ingest(db,syntheticOperation(cp,0));check(first.status===200&&first.body.results[0].status==='committed');
      cp.firstReceipt=receipt(first);await save(cp);report.adapterOperationCommitted=true;
      report.stage='idempotency';const duplicate=await ingest(db,syntheticOperation(cp,0));
      check(duplicate.status===200&&duplicate.body.results[0].status==='duplicate'&&equivalent(receipt(duplicate),cp.firstReceipt));report.idempotency=true;
      const conflict=await ingest(db,syntheticOperation(cp,0,{contradiction:true}));check(conflict.status===409&&!receipt(conflict));report.conflict=true;
      report.stage='receipt-query';
      const receipts=await db.service.receipts(db.context,{schemaVersion:2,attempts:[{operationId:cp.operationIds[0],payloadHash:syntheticOperation(cp,0).payloadHash,leaseId:cp.leaseId,attempt:1}]});
      check(equivalent(receipts.results[0].receipt,cp.firstReceipt));report.receiptMatchesCommittedOperation=true;
      report.stage='concurrency';
      const otherOwner=await ownedFixture(cp.accountId);fixtures.push(otherOwner.f);const other=await connect(otherOwner);await control(other,cp);
      const same=await Promise.all([ingest(db,syntheticOperation(cp,1)),ingest(other,syntheticOperation(cp,1))]);
      check(same.every(r=>r.status===200)&&same.map(r=>r.body.results[0].status).sort().join(',')==='committed,duplicate'&&equivalent(receipt(same[0]),receipt(same[1])));
      report.concurrentIdentical=true;
      const different=await Promise.all([ingest(db,syntheticOperation(cp,2)),ingest(other,syntheticOperation(cp,2,{contradiction:true}))]);
      check(different.map(r=>r.status).sort().join(',')==='200,409');report.concurrentContradictory=true;
      check(await db.models.operations.countDocuments({})===3&&await db.models.facts.countDocuments({})===3);
      report.stage='ownership';const forbidden=await ingest(db,syntheticOperation(cp,0,{foreign:true}));check(forbidden.status===403&&!receipt(forbidden));report.foreignBindingRejected=true;
      report.stage='local-revocation';await db.f.identity.revokeSession(db.context.sessionId);
      const revoked=await ingest(db,syntheticOperation(cp,0));check(revoked.status===401&&!receipt(revoked));report.localRevocationRejected=true;
      report.durableIdentityAndRevocation='not-validated';
      await save(cp);report.stage='stage-one-complete';
    }else{
      report.stage='restart-persistence';
      for(const key of Object.keys(cp.collections))assertOwnedRows(cp,key,await db.models[key].find({}).limit(13).lean());
      check(await db.models.operations.countDocuments({})===3&&await db.models.facts.countDocuments({})===3);
      const persisted=await db.models.operations.findById(cp.accountId+':'+cp.operationIds[0]).lean();
      check(equivalent(persisted.record.receipt,cp.firstReceipt));report.persistedAfterNodeRestart=true;
      await control(db,cp);
      report.stage='lost-response-replay';
      const replay=await ingest(db,syntheticOperation(cp,0));check(replay.status===200&&replay.body.results[0].status==='duplicate'&&equivalent(receipt(replay),cp.firstReceipt));
      report.lostResponseReplay=true;
      report.stage='exact-cleanup-preflight';
      const inventory={};for(const key of Object.keys(cp.collections)){inventory[key]=await db.models[key].find({}).limit(13).lean();assertOwnedRows(cp,key,inventory[key]);}
      // Persist the exact verified inventory BEFORE deleting any document. No broad filters/drop.
      cp.cleanupInventory=Object.fromEntries(Object.entries(inventory).map(([k,rows])=>[k,rows.map(r=>r._id)]));await save(cp);
      report.stage='exact-cleanup';report.deleted={};
      for(const [key,rows]of Object.entries(inventory)){
        report.deleted[key]=0;
        for(const row of rows){const deleted=await db.models[key].deleteOne({_id:row._id,integrationRunId:cp.runId,syntheticOwnerId:cp.runId});check(deleted.deletedCount===1);report.deleted[key]++;}
        check(await db.models[key].countDocuments({})===0);
      }
      report.cleanup='completed-documents-only';report.emptyCollectionsAndIndexesRetained=true;report.stage='completed';
    }
  }finally{
    pass=null;report.closed=true;
    for(const handle of active)try{await handle.close();}catch{report.closed=false;}
    for(const f of fixtures)await f.close();
  }
}
