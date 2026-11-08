// D.2E opt-in ONLY. No default connector, server, credentials or network on import.
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {openAtlasIntegration} from '../src/modules/sync/atlas-integration.js';
import {atlasCollections,verifyAtlasPermissions} from '../src/modules/sync/atlas-policy.js';
import {ingestionModels} from '../src/modules/sync/mongo-models.js';
import {mongoAuthorizationFence} from '../src/modules/sync/mongo-authorization-fence.js';
import {consumeAtlasCredential,temporaryAtlasCredential} from '../src/modules/sync/atlas-credentials.js';
import {IngestionService} from '../src/modules/sync/ingestion-service.js';
import {IngestionError} from '../src/modules/sync/errors.js';
import {canonical,digest} from '../src/modules/sync/canonical-envelope.js';
import {fixture,vectors,clone,batch} from '../tests/sync/support/fixture.js';
const check=value=>{if(!value)throw new Error('Synthetic transactional assertion failed');};
export const requiredIndexes=Object.freeze([
  {model:'operations',name:'owner_operation_unique',key:{technicalAccountId:1,operationId:1}},
  {model:'facts',name:'scope_source_unique',key:{scope:1,sourceKey:1}},
]);
const same=(a,b)=>canonical(a)===canonical(b);
export function requireEmptyEnumeration(response){
  const id=response?.cursor?.id;
  check(response?.ok===1&&Array.isArray(response.cursor.firstBatch)&&(id===0||id===0n||id?.isZero?.()===true));
  check(response.cursor.firstBatch.length===0); // Unknown preexisting namespaces => STOP, never inspect their documents.
}
export function checkIndexInventory(indexes,required,{prepared=false}={}){
  check(Array.isArray(indexes)&&indexes.some(i=>i.name==='_id_'&&same(i.key,{_id:1})));
  for(const i of indexes){
    if(i.name==='_id_')continue;
    check(required&&i.name===required.name&&same(i.key,required.key)&&i.unique===true&&!i.sparse&&!i.partialFilterExpression&&(!i.collation||i.collation.locale==='simple'));
  }
  if(prepared&&required)check(indexes.some(i=>i.name===required.name));
}
export function validateOwnedInventory(cp,inventory){
  const own=[cp.accountId,cp.installationId,cp.localPlayerId,1].join(':');
  const ids={operations:[cp.accountId+':'+cp.operationId],facts:[own+'|session:'+cp.sessionId+':open'],fences:['ingestion-v1'],authorization:[cp.authSessionId]};
  for(const key of Object.keys(ids)){
    check(Array.isArray(inventory[key])&&inventory[key].length===1);
    for(const row of inventory[key]){
      check(ids[key].includes(row._id)&&row.integrationRunId===cp.runId&&row.syntheticOwnerId===cp.runId);
      if(key==='operations')check(row.technicalAccountId===cp.accountId&&row.record?.key===row._id&&row.record?.receipt?.technicalAccountId===cp.accountId);
      if(key==='facts')check(row.scope===own&&row.record?.key===row._id);
      if(key==='authorization')check(row.technicalAccountId===cp.accountId&&row.installationId===cp.installationId&&row.localPlayerId===cp.localPlayerId);
    }
  }
}
export async function transactionalAtlasTest({config,credential,connector,manifestPath,report}){
  let pass=consumeAtlasCredential(credential),handle,f,db,models,repository,service;
  const cp={runId:config.runId,collections:atlasCollections(config),operationId:randomUUID(),abortOperationId:randomUUID(),sessionId:randomUUID(),abortSessionId:randomUUID(),leaseId:randomUUID(),createdIndexes:[]};
  const save=()=>fs.writeFile(manifestPath,JSON.stringify(cp,null,2),{encoding:'utf8'});
  let abortRequested=false;
  const connect=async()=>{
    handle=await openAtlasIntegration({config,credential:temporaryAtlasCredential(Buffer.from(pass,'utf8')),
      connector:async(uri,options)=>(db=await connector(uri,{...options,retryReads:false,retryWrites:false,timeoutMS:10000})),
      modelFactory:(connection,options)=>(models=ingestionModels(connection,options))});
    report.authentication='verified';report.permissions=handle.permissions;
  };
  const compose=()=>{
    repository=handle.createRepository({identityRepository:f.identity,coordinator:f.coordinator,now:f.now,
      fenceAuthorization:async args=>{
        const allowed=await mongoAuthorizationFence(models.authorization,f.now)(args);
        if(abortRequested&&allowed)throw new IngestionError(401,'authentication_expired');
        return allowed;
      }});
    service=new IngestionService({repository,identityRepository:f.identity});
  };
  const operation=(aborted=false,contradiction=false)=>{
    const op=clone(vectors.operations[0]),e=JSON.parse(op.canonicalEnvelope);check(e.type==='session.report'&&e.payload.phase==='open');
    op.operationId=aborted?cp.abortOperationId:cp.operationId;op.leaseId=cp.leaseId;
    e.payload.sessionId=aborted?cp.abortSessionId:cp.sessionId;e.sourceKey='session:'+e.payload.sessionId+':open';
    if(contradiction)e.payload.startedAtUtc='2026-10-28T00:00:00.124Z';
    op.canonicalEnvelope=canonical(e);op.payloadHash=digest(op.canonicalEnvelope);return op;
  };
  const inventory=async()=>Object.fromEntries(await Promise.all(Object.keys(cp.collections).map(async key=>[key,await models[key].find({}).limit(3).lean()])));
  const verifyRecords=async()=>{
    const rows=await inventory();validateOwnedInventory(cp,rows);
    const op=rows.operations[0].record,fact=rows.facts[0].record,expected=operation();
    check(op.factKey===fact.key&&op.operationId===cp.operationId&&op.payloadHash===expected.payloadHash&&same(op.receipt,cp.receipt));
    check(canonical({...op.header,payload:JSON.parse(fact.canonicalPayload)})===expected.canonicalEnvelope);
    return rows;
  };
  try{
    check(config.persistenceTest==='B05.4C.2D.2E'&&config.allowWrites===true&&config.authMechanism==='DEFAULT');
    f=await fixture();const c=f.ctx;
    Object.assign(cp,{accountId:c.technicalAccountId,installationId:c.installationId,localPlayerId:c.localPlayerId,authSessionId:c.sessionId});
    await fs.writeFile(manifestPath,JSON.stringify(cp,null,2),{flag:'wx',encoding:'utf8'});
    report.stage='authentication';await connect();
    report.stage='metadata-preflight';
    const permissions=await db.db.command({connectionStatus:1,showPrivileges:true});verifyAtlasPermissions(permissions);
    const actions=new Set(permissions.authInfo.authenticatedUserPrivileges.filter(p=>p.resource.db===config.database&&p.resource.collection==='').flatMap(p=>p.actions));
    check(actions.has('listCollections')&&actions.has('find'));report.metadataPermissionsVerified=true;
    requireEmptyEnumeration(await db.db.command({listCollections:1,authorizedCollections:true,nameOnly:true}));
    report.preflight='passed-empty-database';
    for(const name of Object.values(cp.collections))check(Buffer.byteLength(config.database+'.'+name)<=95);
    compose();
    // Validate schema declarations BEFORE any collection or index creation.
    for(const key of Object.keys(models)){
      check(models[key].schema.options.autoCreate===false&&models[key].schema.options.autoIndex===false);
      const required=requiredIndexes.find(i=>i.model===key),declared=models[key].schema.indexes();
      check(declared.length===(required?1:0));
      if(required)check(same(declared[0][0],required.key)&&declared[0][1].name===required.name&&declared[0][1].unique===true);
    }
    report.stage='prepare-collections';
    for(const key of Object.keys(models))await models[key].createCollection({writeConcern:{w:'majority'}});
    report.createdCollections=cp.collections;
    report.stage='prepare-two-indexes';
    for(const key of Object.keys(models))checkIndexInventory(await models[key].collection.indexes(),requiredIndexes.find(i=>i.model===key));
    for(const index of requiredIndexes){
      await models[index.model].collection.createIndex(index.key,{name:index.name,unique:true,writeConcern:{w:'majority'}});
      cp.createdIndexes.push({...index,collection:cp.collections[index.model]});await save();
      checkIndexInventory(await models[index.model].collection.indexes(),index,{prepared:true});
    }
    await repository.verifyDeployment();report.indexesVerified=cp.createdIndexes;
    report.stage='prepare-synthetic-controls';
    await models.fences.create({_id:'ingestion-v1',revision:0});
    await models.authorization.create({_id:c.sessionId,technicalAccountId:c.technicalAccountId,installationId:c.installationId,localPlayerId:c.localPlayerId,
      bindingGeneration:c.bindingGeneration,credentialVersion:c.credentialVersion,authzVersion:c.authzVersion,active:true,expiresAt:c.expiresAt,revision:0});
    report.stage='adapter-commit';
    const first=await service.batches(c,batch([operation()]));
    if(first.status!==200||first.body.results[0].status!=='committed'){
      report.operationHttpStatus=first.status;report.operationSafeCode=first.body.results[0].error?.code;throw new Error('Adapter commit not confirmed');
    }
    cp.receipt=first.body.results[0].receipt;await save();await verifyRecords();report.commit=true;report.receiptMatchesStoredContent=true;
    report.stage='controlled-adapter-abort';
    const prior=await inventory();abortRequested=true;
    let aborted;try{aborted=await service.batches(c,batch([operation(true)]));}finally{abortRequested=false;}
    check(aborted.status===401&&!aborted.body.results[0].receipt);
    const afterAbort=await inventory();check(same(prior,afterAbort));report.abort=true;report.noReceiptForAbortedOperation=true;
    report.stage='idempotency';
    const duplicate=await service.batches(c,batch([operation()]));check(duplicate.status===200&&duplicate.body.results[0].status==='duplicate'&&same(duplicate.body.results[0].receipt,cp.receipt));
    report.idempotency=true;await verifyRecords();
    const conflict=await service.batches(c,batch([operation(false,true)]));check(conflict.status===409&&!conflict.body.results[0].receipt);report.conflict=true;
    report.stage='reconnect';await handle.close();handle=null;await connect();compose();await verifyRecords();report.persistedAfterReconnect=true;
    report.stage='cleanup-preflight';const rows=await verifyRecords();cp.cleanupIds=Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.map(r=>r._id)]));await save();
    // All four documents are deleted atomically; no partial fact/receipt cleanup.
    report.stage='cleanup-transaction';const session=await db.startSession();
    try{
      session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},maxCommitTimeMS:1000});
      for(const [key,list]of Object.entries(rows))for(const row of list){
        const current=await models[key].findOne({_id:row._id,integrationRunId:cp.runId,syntheticOwnerId:cp.runId},null,{session}).lean();
        check(same(current,row));
        const removed=await models[key].deleteOne({_id:row._id,integrationRunId:cp.runId,syntheticOwnerId:cp.runId},{session});check(removed.deletedCount===1);
      }
      await session.commitTransaction();report.cleanupCommit=true;
    }finally{if(session.inTransaction())await session.abortTransaction();await session.endSession();}
    for(const key of Object.keys(models))check(await models[key].countDocuments({})===0);
    report.cleanup='four-owned-documents-deleted';report.indexesRetained=true;report.stage='completed';
  }finally{
    pass=null;report.closed=true;if(handle)try{await handle.close();}catch{report.closed=false;}
    if(f)await f.close();
  }
}
