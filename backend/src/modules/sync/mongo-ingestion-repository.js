import { AsyncLocalStorage } from 'node:async_hooks';
import { IngestionEngine, scope as scopeOf, key as keyOf } from './ingestion-engine.js';
import { IngestionError, unavailable } from './errors.js';
import { assertSyncContext } from '../../middleware/sync-auth-context.js';
import { checkBudget,beginAttempt,commitPoint,noteTransactionFailure } from './budget.js';
import { assertAtlasModels,assertAtlasConnection } from './atlas-policy.js';
import { assertMongoIdentity } from '../auth/mongo-identity-repository.js';
import {isMainScope} from '../../main/policy.js';
import {DeploymentCheck,watchConnection,keepWarm} from './deployment-check.js';

// Isolated injected connection ONLY. This module never connects or reads configuration.
export class MongoIngestionRepository extends IngestionEngine {
  // fenceMode 'global' (default) keeps the C.2 behaviour byte for byte: one shared fence document incremented by every write transaction.
  // 'owner' (integration profile) writes a fence per owner instead, so different players never conflict on a shared document.
  constructor({connection, models, disposable, fenceAuthorization, atlasScope, fenceMode='global', deployment, ...options}) {
    super({...options,mainScope:atlasScope});
    const main=isMainScope(atlasScope,connection);
    if((main?disposable!==false:disposable!==true) || (!atlasScope&&!/^twosides_sync_test_[0-9a-f]{32}$/.test(connection?.name??'')) ||
       connection.readyState!==1 || typeof connection.startSession!=='function' ||
       (fenceAuthorization!==undefined&&typeof fenceAuthorization!=='function') || !models?.operations || !models?.facts || !models?.fences)
      throw new Error('Disposable MongoDB connection and durable authorization required');
    if(!['global','owner'].includes(fenceMode))throw new Error('Invalid fence mode');
    this.fenceMode=fenceMode;
    this.connection=connection; this.models=models; this.fenceAuthorization=fenceAuthorization;
    this.atlasScope=atlasScope;
    const client=connection.getClient();
    if(atlasScope){const s=assertAtlasModels(atlasScope,connection,models,{write:true});assertAtlasConnection(connection,s.config);}
    else if(client.options.directConnection!==true || client.options.srvHost || client.options.credentials || !client.options.hosts?.length ||
       client.options.hosts.some(h=>!['127.0.0.1','::1','localhost'].includes(h.host)))
      throw new Error('Only credential-free loopback MongoDB is permitted');
    assertMongoIdentity(this.identityRepository,connection,atlasScope);
    this.sessions=new AsyncLocalStorage();
    // F1: cache of the I/O part of the deployment check (see deployment-check.js). `deployment` = {ttlMs<=30000, now, keepWarmMs}; keepWarmMs is OFF unless given.
    this.deployment=new DeploymentCheck({ttlMs:deployment?.ttlMs,now:deployment?.now});
    watchConnection(connection,this.deployment);
    const stopKeepWarm=keepWarm(this.deployment,()=>this.verifyDeploymentIo(),deployment?.keepWarmMs);
    if(typeof connection.once==='function')connection.once('close',stopKeepWarm);
    // `load`/`commit` (whole state) remain for snapshot() diagnostics and tests only. The ingestion path uses the scoped members.
    this.store={load:()=>this.readState(),commit:s=>this.writeState(s),
      loadFor:(context,op)=>this.readScoped(context,op),commitDelta:delta=>this.writeDelta(delta),
      receiptsFor:(context,descriptors)=>this.readReceipts(context,descriptors),total:()=>this.models.operations.estimatedDocumentCount()};
  }
  // In-process boundary assertions (no I/O): run on EVERY operation, never cached.
  assertDeploymentBoundary() {
    if(this.atlasScope){const s=assertAtlasModels(this.atlasScope,this.connection,this.models,{write:true});assertAtlasConnection(this.connection,s.config);}
    else for(const key of ['operations','facts','fences','authorization']){
      const m=this.models[key];if(m?.db!==this.connection||m.collection?.name!=='sync_'+key)throw unavailable();
    }
  }
  // The I/O part: replica set + writable primary, and the unique index definitions of operations and facts.
  async #verifyPrimaryAndIndexes() {
    const hello=await this.connection.db.admin().command({hello:1});
    if(!hello.setName || hello.isWritablePrimary!==true)throw unavailable();
    for(const [model,name,key]of [
      [this.models.operations,'owner_operation_unique',{technicalAccountId:1,operationId:1}],
      [this.models.facts,'scope_source_unique',{scope:1,sourceKey:1}],
    ]) {
      const indexes=await model.collection.indexes();
      if(!indexes.some(i=>i.name===name&&i.unique===true&&JSON.stringify(i.key)===JSON.stringify(key)&&!i.sparse&&!i.partialFilterExpression&&(!i.collation||i.collation.locale==='simple')))throw unavailable();
    }
  }
  // Live check, unchanged behaviour: boundary assertions + primary + indexes.
  async verifyDeployment() { this.assertDeploymentBoundary(); await this.#verifyPrimaryAndIndexes(); }
  // What the cache protects: primary + unique index definitions. The seed document `ingestion-v1` is NOT cached: owner mode still reads it inside every transaction.
  async verifyDeploymentIo() { await this.#verifyPrimaryAndIndexes(); }
  invalidateDeploymentCheck() { this.deployment.invalidate(); this.identityRepository.invalidateDeploymentCheck?.(); }
  // Optional start-up/maintenance warm-up outside any request budget: performs (or joins) one live verification and records it.
  async warmDeploymentCheck() { this.assertDeploymentBoundary(); await this.deployment.ensure(()=>this.verifyDeploymentIo()); }
  async transaction(work) {
    try { this.assertDeploymentBoundary(); await this.deployment.ensure(()=>this.verifyDeploymentIo()); }catch{this.deployment.invalidate();throw unavailable();}
    try {
      assertMongoIdentity(this.identityRepository,this.connection,this.atlasScope);
      return await this.identityRepository.transaction(()=>this.sessions.run(this.identityRepository.session(),async()=>{
        const session=this.session(),entry=this.authorization.getStore();
        beginAttempt(entry?.signal);                  // F2: every attempt of the callback starts in PRE (the budget applies again)
        if(entry)entry.decision=await this.identityRepository.coordinate(entry.context);
        if(this.fenceMode==='global') {
          // A real Mongo write, not a file lock. Serializes relation/range checks across receivers.
          const fence=await this.models.fences.updateOne({_id:'ingestion-v1'},{$inc:{revision:1}},{session});
          if(fence.matchedCount!==1)throw unavailable();
        } else {
          // Owner mode. Deployment sanity (read only: it never conflicts) plus an owner-scoped write that serializes THIS owner's relation/range
          // checks. identityRepository.coordinate() above already bumps the owner's guard; different owners no longer share any written document.
          // F1 keeps this seed read in every transaction (not cached): the loss of the seed is detected at once, and the cost of an operation is the same cold or warm.
          const seed=await this.models.fences.find({_id:'ingestion-v1'},null,{session}).limit(1).lean();
          if(seed.length!==1)throw unavailable();
          if(entry){
            const fence=await this.models.fences.updateOne({_id:'ingestion-v1:'+entry.context.technicalAccountId},{$inc:{revision:1}},{session,upsert:true});
            if(fence.matchedCount!==1&&fence.upsertedCount!==1)throw unavailable();
          }
        }
        const result=await work();
        if(this.authorization.getStore())await this.beforeAuthorizationCommit();
        commitPoint(entry?.signal);                   // F2: point of no return (synchronous budget check + mark); the commit itself is not cancellable by the budget timer
        return result;
      }),{deployment:'cached'});
    } catch(error) {
      noteTransactionFailure(this.authorization.getStore()?.signal,error);   // F2: classify aborted vs unknown for the service; the thrown error and the public code do not change
      // Never emit an ACK for an unknown commit or a duplicate-key race without rereading.
      // The driver retries eligible transactions; caller retries stable IDs if it still fails.
      // A storage failure invalidates the cached deployment check (fail closed: the next operation verifies live).
      if(error instanceof IngestionError || [401,403].includes(error.status)){if(error.httpStatus===503||error.status===503)this.deployment.invalidate();throw error;}
      this.deployment.invalidate();
      throw unavailable();
    }
  }
  session() { const s=this.sessions.getStore(); if(!s)throw unavailable(); return s; }
  async readState() {
    const session=this.session();
    const operations=await this.models.operations.find({},null,{session}).limit(this.maxRecords+1).lean();
    const facts=await this.models.facts.find({},null,{session}).limit(this.maxRecords+1).lean();
    if(operations.length>this.maxRecords || facts.length>this.maxRecords)throw unavailable();
    if(operations.some(o=>o.authorizationDecision?.owner!==o.technicalAccountId || !Number.isSafeInteger(o.authorizationDecision?.revision) || o.authorizationDecision.revision<1 || o._id!==o.record.key || o.operationId!==o.record.operationId || o.technicalAccountId!==o.record.receipt.technicalAccountId || o.scope!==o.record.scope) ||
       facts.some(f=>f._id!==f.record.key || f.sourceKey!==f.record.sourceKey || f.scope!==f.record.scope))throw unavailable();
    return {version:1,operations:operations.map(o=>o.record),facts:facts.map(f=>f.record)};
  }
  async #find(name,filter,session,limit) {
    const rows=await this.models[name].find(filter,null,{session}).limit(limit).lean();
    if(rows.length>=limit&&limit>this.maxRecords)throw unavailable();
    return rows;
  }
  #verifyOperation(o,account) {
    if(o.technicalAccountId!==account || o.authorizationDecision?.owner!==o.technicalAccountId || !Number.isSafeInteger(o.authorizationDecision?.revision) || o.authorizationDecision.revision<1 ||
       o._id!==o.record.key || o.operationId!==o.record.operationId || o.technicalAccountId!==o.record.receipt.technicalAccountId || o.scope!==o.record.scope)throw unavailable();
  }
  #verifyFact(f,own) {
    if(f.scope!==own || f._id!==f.record.key || f.sourceKey!==f.record.sourceKey || f.scope!==f.record.scope)throw unavailable();
  }
  // Reads ONLY what one operation of one owner can need (all queries are anchored on the owner's account/scope, so other players' documents are never read):
  //   operations: the operation itself and its parents, by _id                         (_id index)
  //   facts:      the operation's fact and the facts of the operations above, by _id    (_id index)
  //   new fact:   the owner's facts for the relation checks (game.report: only that game's reports)   (scope prefix of scope_source_unique)
  //   alias:      the first operation of an already stored fact and that operation's parents          (owner prefix of owner_operation_unique)
  //   quota:      the owner's operation count, only when a new operation will be stored
  async readScoped(context,op) {
    const session=this.session(),own=scopeOf(context),e=op.envelope,account=context.technicalAccountId,cap=this.maxRecords+1;
    const opKey=keyOf(context,op.operationId),factKey=own+'|'+e.sourceKey;
    const operations=new Map(),facts=new Map();
    const addOperations=rows=>{for(const o of rows){this.#verifyOperation(o,account);operations.set(o._id,o);}};
    addOperations(await this.#find('operations',{_id:{$in:[opKey,...op.dependencies.map(id=>keyOf(context,id))]},technicalAccountId:account},session,cap));
    const old=operations.get(opKey);
    let ownCount=0;
    if(!old) {
      const storedFact=(await this.#find('facts',{_id:factKey,scope:own},session,1))[0];
      if(storedFact) {
        facts.set(storedFact._id,storedFact);
        const first=await this.#find('operations',{technicalAccountId:account,'record.factKey':factKey},session,1);
        addOperations(first);
        if(first[0])addOperations(await this.#find('operations',{_id:{$in:first[0].record.dependencies.map(id=>keyOf(context,id))},technicalAccountId:account},session,cap));
      } else {
        const relation=e.type==='game.report'?{scope:own,'record.type':'game.report','record.gameId':e.gameId}:{scope:own};
        for(const f of await this.#find('facts',relation,session,cap)){this.#verifyFact(f,own);facts.set(f._id,f);}
      }
      ownCount=await this.models.operations.countDocuments({technicalAccountId:account,scope:own},{session,limit:cap});
    }
    const wanted=[...new Set([...operations.values()].map(o=>o.record.factKey))].filter(k=>!facts.has(k));
    if(wanted.length)for(const f of await this.#find('facts',{_id:{$in:wanted},scope:own},session,cap)){this.#verifyFact(f,own);facts.set(f._id,f);}
    for(const f of facts.values())this.#verifyFact(f,own);
    return {version:1,operations:[...operations.values()].map(o=>o.record),facts:[...facts.values()].map(f=>f.record),ownCount};
  }
  async readReceipts(context,descriptors) {
    const rows=await this.#find('operations',{_id:{$in:descriptors.map(d=>keyOf(context,d.operationId))},technicalAccountId:context.technicalAccountId},this.session(),this.maxRecords+1);
    for(const o of rows)this.#verifyOperation(o,context.technicalAccountId);
    return {version:1,operations:rows.map(o=>o.record),facts:[]};
  }
  // Persists exactly what the operation adds: at most one new fact and one new operation, nothing else is rewritten.
  async writeDelta({fact,operation}) {
    const session=this.session();
    if(fact)await this.models.facts.updateOne({_id:fact.key},{$setOnInsert:{scope:fact.scope,sourceKey:fact.sourceKey,record:fact}},{session,upsert:true});
    await this.models.operations.updateOne({_id:operation.key},{$setOnInsert:{scope:operation.scope,technicalAccountId:operation.receipt.technicalAccountId,operationId:operation.operationId,record:operation,authorizationDecision:this.authorization.getStore()?.decision}},{session,upsert:true});
  }
  async writeState(state) {
    const session=this.session();
    for(const fact of state.facts) await this.models.facts.updateOne({_id:fact.key},{$setOnInsert:{scope:fact.scope,sourceKey:fact.sourceKey,record:fact}},{session,upsert:true});
    for(const op of state.operations) await this.models.operations.updateOne({_id:op.key},{$setOnInsert:{scope:op.scope,technicalAccountId:op.receipt.technicalAccountId,operationId:op.operationId,record:op,authorizationDecision:this.authorization.getStore()?.decision}},{session,upsert:true});
  }
  async acceptOperation(context,op,signal) {
    assertSyncContext(context,this.identityRepository);
    // Mandatory durable owner guard acquired before any ingestion storage work.
    // Hooks are instance-wide; pass context through AsyncLocalStorage instead of replacing hooks.
    return this.authorization.run({context,signal},()=>super.acceptOperation(context,op,signal));
  }
  async afterStorageCommit() {} // Mongo writes are not committed until withTransaction resolves.
  async afterTransactionCommit() { await this.afterCommit(); }
  authorization=new AsyncLocalStorage();
  async beforeAuthorizationCommit() {
    const {context,signal}=this.authorization.getStore()??{};
    checkBudget(signal);
    if(context)await context.validate();
    // Legacy test hooks can only restrict, never replace the durable owner guard.
    if(!context || (this.fenceAuthorization&&await this.fenceAuthorization({context,session:this.session(),signal})!==true))
      throw new IngestionError(401,'authentication_expired');
    checkBudget(signal);
  }
  async findReceipts(context,descriptors,signal) {
    return this.authorization.run({context,signal},()=>super.findReceipts(context,descriptors,signal));
  }
  async snapshot() { return this.coordinator.run(()=>this.transaction(()=>this.load())); }
}
