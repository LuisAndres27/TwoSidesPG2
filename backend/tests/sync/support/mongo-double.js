import { randomUUID } from 'node:crypto';
import { MongoIngestionRepository } from '../../../src/modules/sync/mongo-ingestion-repository.js';
import { mongoAuthorizationFence } from '../../../src/modules/sync/mongo-authorization-fence.js';
import { MongoIdentityRepository } from '../../../src/modules/auth/mongo-identity-repository.js';
import { mongoIdentityModels } from '../../../src/modules/auth/mongo-identity-models.js';
// Optimistic snapshot DOUBLE: callback overlap and CAS on written documents, no mutex.
// Assumes Mongo conflict/atomicity semantics, does not prove server durability.
export function mongoDouble() {
 const db={rows:{operations:[],facts:[],fences:[{_id:'ingestion-v1',revision:0}],authorization:[],identities:[],ownerGuards:[],identitySessions:[],revocations:[]},calls:[],failure:null,conflicts:0};
 // Filter subset used by the adapters: equality, dotted paths, $gt, $in. Counters let tests measure reads/writes (a DOUBLE: real Mongo cost is not modelled).
 const get=(row,path)=>path.split('.').reduce((o,k)=>o?.[k],row);
 const matches=(row,filter)=>Object.entries(filter).every(([k,v])=>{const x=get(row,k);if(v&&typeof v==='object'&&!Array.isArray(v)){if('$gt'in v)return x>v.$gt;if('$in'in v)return v.$in.includes(x);if('$regex'in v)return typeof x==='string'&&new RegExp(v.$regex).test(x);}return x===v;});
 db.findLog=[]; db.readLog=[]; db.writeLog=[]; db.trackReads=false;
 db.stats={}; db.resetStats=()=>{db.findLog.length=0;db.readLog.length=0;db.writeLog.length=0;db.stats={finds:0,docsRead:0,writes:0,matchedWrites:0,unchangedRewrites:0,upserts:0,counts:0,perName:{}};}; db.resetStats();
 const tally=(name,field,n=1)=>{db.stats[field]+=n;const p=db.stats.perName[name]??={docsRead:0,writes:0,upserts:0};if(field==='docsRead')p.docsRead+=n;if(field==='writes')p.writes+=n;if(field==='upserts')p.upserts+=n;};
 const conflict=()=>Object.assign(new Error('Synthetic write conflict'),{code:112,hasErrorLabel:l=>l==='TransientTransactionError'});
 const unique=(name,a,b)=>a._id===b._id||(name==='operations'&&a.technicalAccountId===b.technicalAccountId&&a.operationId===b.operationId)||(name==='facts'&&a.scope===b.scope&&a.sourceKey===b.sourceKey)||(name==='identities'&&(a.registrationId===b.registrationId||(a.installationId===b.installationId&&a.localPlayerId===b.localPlayerId)))||(name==='identitySessions'&&a.tokenHash===b.tokenHash);
 db.models=Object.fromEntries(Object.keys(db.rows).map(name=>[name,{
  find(filter,_projection,{session}={}){let limit=Infinity;return{limit(n){limit=n;return this;},async lean(){db.calls.push({name,kind:'find',session});const out=structuredClone((session?.rows??db.rows)[name].filter(r=>matches(r,filter)).slice(0,limit));tally(name,'finds');tally(name,'docsRead',out.length);db.findLog.push({name,filter:structuredClone(filter)});if(db.trackReads)for(const r of out)db.readLog.push({name,_id:r._id,technicalAccountId:r.technicalAccountId,scope:r.scope});return out;}};},
  async countDocuments(filter,{session,limit=Infinity}={}){db.calls.push({name,kind:'count',session});db.stats.counts++;return Math.min(limit,(session?.rows??db.rows)[name].filter(r=>matches(r,filter)).length);},
  async estimatedDocumentCount(){db.stats.counts++;return db.rows[name].length;},
  async deleteMany(filter){if(!filter||!Object.keys(filter).length)throw new Error('Empty filter');const before=db.rows[name].length;db.rows[name]=db.rows[name].filter(r=>!matches(r,filter));return{deletedCount:before-db.rows[name].length};},
  async deleteOne(filter,{session}={}){
   if(!session)throw new Error('Session required');const row=session.rows[name].find(r=>matches(r,filter));
   db.calls.push({name,kind:'delete',session});if(!row)return{deletedCount:0};
   session.rows[name]=session.rows[name].filter(r=>r._id!==row._id);session.writes.add(name+'|'+row._id);return{deletedCount:1};
  },
  async updateOne(filter,update,{session,upsert=false}={}){
   if(!session)throw new Error('Session required');db.calls.push({name,kind:'write',session});tally(name,'writes');db.writeLog.push({name,_id:filter._id});let row=session.rows[name].find(r=>matches(r,filter));
   if(row){const at=session.rows[name].indexOf(row);row=structuredClone(row);session.rows[name][at]=row;db.stats.matchedWrites++;if(!update.$set&&!update.$inc)db.stats.unchangedRewrites++;Object.assign(row,structuredClone(update.$set??{}));for(const[k,v]of Object.entries(update.$inc??{}))row[k]=(row[k]??0)+v;session.writes.add(name+'|'+row._id);return{matchedCount:1};}
   if(!upsert)return{matchedCount:0};row={...filter,...structuredClone(update.$setOnInsert??{}),...structuredClone(update.$set??{}),...structuredClone(update.$inc??{})};
   if(session.rows[name].some(old=>unique(name,old,row)))throw Object.assign(new Error('Synthetic duplicate key'),{code:11000});session.rows[name].push(row);session.writes.add(name+'|'+row._id);tally(name,'upserts');return{matchedCount:0,upsertedCount:1};
  }
 }]));
 const indexes={operations:[{name:'owner_operation_unique',unique:true,key:{technicalAccountId:1,operationId:1}}],facts:[{name:'scope_source_unique',unique:true,key:{scope:1,sourceKey:1}}],identities:[{name:'identity_registration_unique',unique:true,key:{registrationId:1}},{name:'identity_binding_unique',unique:true,key:{installationId:1,localPlayerId:1}}],identitySessions:[{name:'identity_token_unique',unique:true,key:{tokenHash:1}}]};
 db.connection={name:'twosides_sync_test_'+randomUUID().replaceAll('-',''),readyState:1,models:{},db:{admin:()=>({command:async()=>({setName:'synthetic-double',isWritablePrimary:true})})},getClient:()=>({options:{directConnection:true,hosts:[{host:'127.0.0.1',port:27017}]}}),
  model(name,schema,collection){const key=Object.keys(db.rows).find(k=>collection.endsWith('_'+k)),m=db.models[key];if(!m)throw new Error('Unknown synthetic collection');m.schema=schema;m.collection.name=collection;this.models[name]=m;return m;},
  async startSession(){return{rows:null,writes:new Set(),async withTransaction(work,options){db.options=options;
   for(let attempt=0;attempt<3;attempt++){
    if(db.failure==='before'){db.failure=null;throw new Error('Connection unavailable');}
    const shallow=()=>Object.fromEntries(Object.entries(db.rows).map(([k,v])=>[k,v.slice()]));this.base=shallow();this.rows=shallow();   // rows are immutable once stored: a session copies a row before changing it (copy-on-write), so large stores stay cheapthis.writes=new Set();
    try{const result=await work();if(db.failure==='rollback'){db.failure=null;throw new Error('Write failed');}if(db.failure==='transient'){db.failure=null;throw conflict();}if(db.beforeCommit)await db.beforeCommit(this);
     for(const item of this.writes){const sep=item.indexOf('|'),name=item.slice(0,sep),id=item.slice(sep+1),base=this.base[name].find(r=>r._id===id),live=db.rows[name].find(r=>r._id===id);if(JSON.stringify(base)!==JSON.stringify(live))throw conflict();const row=this.rows[name].find(r=>r._id===id);if(!base&&db.rows[name].some(r=>unique(name,r,row)))throw conflict();}
     for(const item of this.writes){const sep=item.indexOf('|'),name=item.slice(0,sep),id=item.slice(sep+1);db.rows[name]=db.rows[name].filter(r=>r._id!==id);const row=this.rows[name].find(r=>r._id===id);if(row)db.rows[name].push(structuredClone(row));}
     if(db.failure==='unknown'){db.failure=null;throw Object.assign(new Error('Unknown commit'),{hasErrorLabel:l=>l==='UnknownTransactionCommitResult'});}return result;
    }catch(e){if(e.hasErrorLabel?.('TransientTransactionError')&&attempt<2){db.conflicts++;continue;}throw e;}
   }
  },async endSession(){db.ended=(db.ended??0)+1;}};}
 };
 for(const[key,m]of Object.entries(db.models)){m.db=db.connection;m.schema={options:{autoIndex:false,autoCreate:false}};m.collection={name:'sync_'+key,conn:db.connection,indexes:async()=>structuredClone(indexes[key]??[])};}
 db.identityFactory=({now})=>new MongoIdentityRepository({connection:db.connection,models:mongoIdentityModels(db.connection),synthetic:true,now});
 db.seed=c=>{if(!db.rows.authorization.some(r=>r._id===c.sessionId))db.rows.authorization.push({_id:c.sessionId,technicalAccountId:c.technicalAccountId,installationId:c.installationId,localPlayerId:c.localPlayerId,bindingGeneration:c.bindingGeneration,credentialVersion:c.credentialVersion,authzVersion:c.authzVersion,active:true,expiresAt:c.expiresAt,revision:0});};
 db.factory=async({context,...options})=>{db.seed(context);db.calls=[];db.ended=0;return new MongoIngestionRepository({synthetic:true,disposable:true,connection:db.connection,models:db.models,fenceAuthorization:mongoAuthorizationFence(db.models.authorization,options.now),...options});};
 db.factory.identityFactory=options=>db.identityFactory(options);return db;
}
