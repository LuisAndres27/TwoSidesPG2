import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, unavailable } from '../../utils/errors.js';
import { IngestionError } from '../sync/errors.js';
import { assertNotProduction } from '../../config/jwt.js';
import { assertAtlasConnection, atlasScopeState } from '../sync/atlas-policy.js';
import { identityCollectionNames } from './mongo-identity-models.js';
import {isMainScope} from '../../main/policy.js';
import {DeploymentCheck,watchConnection} from '../sync/deployment-check.js';

const instances = new WeakMap();
const uuid = z.string().uuid();
const bindingSchema = z.strictObject({installationId:uuid,localPlayerId:uuid,bindingGeneration:z.literal(1)});
const denied = () => new ApiError(401,'authentication_required');
const fields = ['installationId','localPlayerId','bindingGeneration','credentialVersion','authzVersion'];
const same = (a,b) => fields.every(k => a[k] === b[k]);
const transactionOptions = Object.freeze({readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true},
  readPreference:'primary',maxCommitTimeMS:1000,timeoutMS:10000});

export function assertMongoIdentity(repository,connection,atlasScope) {
  const state=instances.get(repository);
  if(!state || state.connection!==connection || state.atlasScope!==atlasScope)throw unavailable();
  repository.assertBoundary();
  return repository;
}

// Explicit isolated adapter. No bootstrap, migration, endpoint or default connector.
export class MongoIdentityRepository {
  // Transaction store: {session, memo}. `memo` holds account/session DOCUMENTS read inside the current transaction attempt only (same snapshot); it is dropped when the
  // attempt ends and cleared by every write to identities/identitySessions. It never outlives a transaction and is never shared between transactions or accounts.
  #transactions = new AsyncLocalStorage();
  #deployment;
  #disposeWatch;
  constructor({connection,models,atlasScope,synthetic,now=Date.now,deployment}={}) {
    const main=isMainScope(atlasScope,connection);
    if(!main)assertNotProduction();
    if((main?synthetic!==false:synthetic!==true) || !connection || !models)throw unavailable();
    instances.set(this,{connection,models,atlasScope});
    this.now=now;
    // Compatibility with IngestionEngine's port; NOT a lock or the security boundary.
    this.coordinator=Object.freeze({run:work=>work()});
    this.assertBoundary();
    this.#deployment=new DeploymentCheck(deployment);this.#disposeWatch=watchConnection(connection,this.#deployment);
  }
  // Explicit invalidation of the cached deployment check (the next cached transaction verifies live).
  invalidateDeploymentCheck(){this.#deployment.invalidate();}
  assertBoundary() {
    const {connection:c,models,atlasScope}=instances.get(this);
    if(c.readyState!==1 || typeof c.startSession!=='function')throw unavailable();
    if(atlasScope){const s=atlasScopeState(atlasScope,c);if(!s.config.allowWrites)throw unavailable();assertAtlasConnection(c,s.config);}
    else {
      const o=c.getClient().options;
      if(!/^twosides_sync_test_[0-9a-f]{32}$/.test(c.name) || o.directConnection!==true || o.srvHost || o.credentials ||
        !o.hosts?.length || o.hosts.some(h=>!['127.0.0.1','::1','localhost'].includes(h.host)))throw unavailable();
    }
    for(const [key,name] of Object.entries(identityCollectionNames(c,atlasScope))) {
      const m=models[key];
      if(m?.db!==c || m.collection?.name!==name || m.schema?.options.autoIndex!==false || m.schema?.options.autoCreate!==false)throw unavailable();
    }
  }
  async verifyIndexes() {
    for(const [key,name,definition] of [
      ['identities','identity_registration_unique',{registrationId:1}],
      ['identities','identity_binding_unique',{installationId:1,localPlayerId:1}],
      ['identitySessions','identity_token_unique',{tokenHash:1}],
    ]) {
      const indexes=await this.models[key].collection.indexes();
      if(!indexes.some(i=>i.name===name&&i.unique===true&&JSON.stringify(i.key)===JSON.stringify(definition)&&
        !i.sparse&&!i.partialFilterExpression&&(!i.collation||i.collation.locale==='simple')))throw unavailable();
    }
  }
  get models(){return instances.get(this).models;}
  session(){const s=this.#transactions.getStore();if(!s)throw unavailable();return s.session;}
  async #verifyDeploymentLive() {
    await this.verifyIndexes();
    const hello=await instances.get(this).connection.db.admin().command({hello:1});
    if(!hello.setName||hello.isWritablePrimary!==true)throw unavailable();
  }
  // deployment:'live' (default) checks replica set and indexes on every transaction: registration, session and revocation always use it.
  // deployment:'cached' (ingestion only) reuses a successful live check for at most DEPLOYMENT_TTL_MS; the in-process boundary assertions above still run every time.
  async transaction(work,{deployment='live'}={}) {
    this.assertBoundary();
    if(this.#transactions.getStore())return work();
    if(!['live','cached'].includes(deployment))throw unavailable();
    let session;
    try {
      if(deployment==='cached')await this.#deployment.ensure(()=>this.#verifyDeploymentLive());else await this.#verifyDeploymentLive();
      session=await instances.get(this).connection.startSession();let attempts=0;
      return await session.withTransaction(()=>{
        if(++attempts>3)throw unavailable();
        return this.#transactions.run({session,memo:new Map()},work);
      },transactionOptions);
    }catch(e){
      // A storage failure (driver error or a 503) means the deployment may have changed: drop the cached check so the next cached transaction verifies live.
      if(e instanceof ApiError || e instanceof IngestionError){if(e.status===503||e.httpStatus===503)this.#deployment.invalidate();throw e;}
      this.#deployment.invalidate();throw unavailable();
    }
    finally{if(session)await session.endSession().catch(()=>{});}
  }
  async rows(key,filter,limit=1001) {
    try {
      this.assertBoundary();
      return await this.models[key].find(filter,null,{session:this.#transactions.getStore()?.session}).limit(limit).lean();
    }catch(e){if(e instanceof ApiError)throw e;throw unavailable();}
  }
  // Account/session documents by _id, memoized for the current transaction attempt only (a snapshot returns the same document every time).
  // Decisions that depend on time (expiry, revocation flag) are recomputed on the memoized DOCUMENT by live(), never memoized themselves.
  async #byId(key,id) {
    const store=this.#transactions.getStore();
    if(!store)return this.one(key,{_id:id});
    const k=key+'|'+id;
    if(store.memo.has(k))return structuredClone(store.memo.get(k));
    const doc=await this.one(key,{_id:id});
    store.memo.set(k,structuredClone(doc));return doc;
  }
  #forget(){this.#transactions.getStore()?.memo.clear();}
  async one(key,filter){return (await this.rows(key,filter,1))[0];}
  async touch(owner) {
    const guard=await this.one('ownerGuards',{_id:owner});
    if(!guard || !Number.isSafeInteger(guard.revision) || guard.revision<0 || guard.revision>=Number.MAX_SAFE_INTEGER)throw unavailable();
    const r=await this.models.ownerGuards.updateOne({_id:owner,revision:guard.revision},{$inc:{revision:1}},{session:this.session()});
    if(r.matchedCount!==1)throw unavailable();
    return guard.revision+1;
  }
  findAccount(id){return this.#byId('identities',id);}
  findRegistration(id){return this.one('identities',{registrationId:id});}
  async live(s) {
    const a=s&&await this.findAccount(s.technicalAccountId);
    return a?.active&&a.linked&&a.role==='player'&&!s.revoked&&s.expiresAt>this.now()&&
      (a.credentialExpiresAt===null||a.credentialExpiresAt>this.now())&&same(a,s)?s:undefined;
  }
  async findSession(hash){return this.live(await this.one('identitySessions',{tokenHash:hash}));}
  async findSessionById(id){return this.live(await this.#byId('identitySessions',id));}
  async createIfAbsent(registrationId,credentialVerifier,beforeCreate=()=>{},binding) {
    uuid.parse(registrationId);binding=bindingSchema.parse(binding);
    if(typeof credentialVerifier!=='string'||!credentialVerifier.startsWith('$argon2id$')||credentialVerifier.length>512)throw unavailable();
    return this.transaction(async()=>{
      const existing=await this.findRegistration(registrationId);
      if(existing)return {record:existing,created:false};
      if(await this.one('identities',{installationId:binding.installationId,localPlayerId:binding.localPlayerId}))throw new ApiError(409,'registration_conflict');
      beforeCreate();
      const id=randomUUID(),timestamp=new Date(this.now()).toISOString();
      const account={_id:id,technicalAccountId:id,registrationId,...binding,credentialVerifier,
        credentialVersion:1,authzVersion:1,active:true,linked:true,role:'player',credentialExpiresAt:null,createdAt:timestamp,updatedAt:timestamp};
      await this.models.identities.updateOne({_id:id},{$setOnInsert:account},{session:this.session(),upsert:true});this.#forget();
      await this.models.ownerGuards.updateOne({_id:id},{$setOnInsert:{revision:0}},{session:this.session(),upsert:true});
      return {record:account,created:true};
    });
  }
  async createSession(verifiedAccount,tokenHash) {
    if(!/^[0-9a-f]{64}$/.test(tokenHash))throw unavailable();
    return this.transaction(async()=>{
      await this.touch(verifiedAccount.technicalAccountId);
      const a=await this.findAccount(verifiedAccount.technicalAccountId);
      if(!a?.active||!a.linked||a.role!=='player'||!same(a,verifiedAccount)||
        (a.credentialExpiresAt!==null&&a.credentialExpiresAt<=this.now()))return undefined;
      const sessions=await this.rows('identitySessions',{technicalAccountId:a.technicalAccountId},3001);
      if(sessions.length>3000)throw unavailable();
      const own=sessions.filter(s=>!s.revoked&&s.expiresAt>this.now()).sort((x,y)=>x.createdAt-y.createdAt||x._id.localeCompare(y._id));
      if(own.length>=3)for(const s of own.slice(0,own.length-2)){await this.models.identitySessions.updateOne({_id:s._id},{$set:{revoked:true}},{session:this.session()});this.#forget();}
      const id=randomUUID(),s={_id:id,sessionId:id,technicalAccountId:a.technicalAccountId,tokenHash,
        ...Object.fromEntries(fields.map(k=>[k,a[k]])),createdAt:this.now(),expiresAt:this.now()+900000,revoked:false};
      await this.models.identitySessions.updateOne({_id:id},{$setOnInsert:s},{session:this.session(),upsert:true});this.#forget();
      return s;
    });
  }
  async coordinate(context) {
    const revision=await this.touch(context.technicalAccountId);
    await context.validate(); // All repository reads inherit THIS Mongo session.
    const a=await this.findAccount(context.technicalAccountId),s=await this.findSessionById(context.sessionId);
    if(!a?.active||!a.linked||a.role!=='player'||!s||!same(a,context)||!same(s,context)||this.now()>=context.expiresAt)throw denied();
    return {owner:context.technicalAccountId,revision};
  }
  async revoke(context,{commandId,kind='identity',target=context?.technicalAccountId}={}) {
    uuid.parse(commandId);
    if(!['identity','installation','session','generation','credential'].includes(kind))throw new ApiError(400,'invalid_request');
    const {assertSyncContext}=await import('../../middleware/sync-auth-context.js');
    assertSyncContext(context,this);
    return this.transaction(async()=>{
      const decision=await this.coordinate(context);
      const owner=context.technicalAccountId;
      if((kind==='session'&&target!==context.sessionId)||(kind==='installation'&&target!==context.installationId)||
        (!['session','installation'].includes(kind)&&target!==owner))throw new ApiError(403,'forbidden');
      return this.#applyRevocation(owner,{commandId,kind,target},decision.revision);
    });
  }
  async #applyRevocation(owner,{commandId,kind,target},revision) {
    const id=owner+':'+commandId,prior=await this.one('revocations',{_id:id});
    if(prior){if(prior.kind!==kind||prior.target!==target)throw new ApiError(409,'registration_conflict');return prior;}
    const a=await this.findAccount(owner);if(!a)throw denied();
    if(kind==='session') {
      const s=await this.one('identitySessions',{_id:target,technicalAccountId:owner});if(!s)throw new ApiError(403,'forbidden');
      await this.models.identitySessions.updateOne({_id:target,technicalAccountId:owner},{$set:{revoked:true}},{session:this.session()});this.#forget();
    }else {
      if(kind==='installation'&&target!==a.installationId)throw new ApiError(403,'forbidden');
      if(['authzVersion','credentialVersion','bindingGeneration'].some(k=>!Number.isSafeInteger(a[k])||a[k]<1||a[k]>=Number.MAX_SAFE_INTEGER))throw unavailable();
      const change={authzVersion:a.authzVersion+1,updatedAt:new Date(this.now()).toISOString()};
      if(kind==='identity')change.active=false;
      if(kind==='installation'){change.linked=false;change.bindingGeneration=a.bindingGeneration+1;}
      if(kind==='generation')change.bindingGeneration=a.bindingGeneration+1;
      if(kind==='credential')change.credentialVersion=a.credentialVersion+1;
      await this.models.identities.updateOne({_id:owner},{$set:change},{session:this.session()});this.#forget();
    }
    const record={_id:id,technicalAccountId:owner,commandId,kind,target,revision,confirmedAtUtc:new Date(this.now()).toISOString()};
    await this.models.revocations.updateOne({_id:id},{$setOnInsert:record},{session:this.session(),upsert:true});
    return record;
  }
  // Legacy mutation signatures do NOT identify an authenticated actor: deny, never bypass.
  async revokeIdentity(){throw new ApiError(403,'forbidden');}
  async revokeSession(){throw new ApiError(403,'forbidden');}
  async invalidateAccountSessions(){throw new ApiError(403,'forbidden');}
}
