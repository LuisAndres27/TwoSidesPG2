// Schema-only C.2A. No connector, credentials, environment reads or auto-run on import.
import { openAtlasIntegration } from '../src/modules/sync/atlas-integration.js';
import { ATLAS_SCHEMA_PHASE,ATLAS_SCHEMA_RUN,ATLAS_TARGET,ATLAS_URI,validateAtlasConfig,assertAtlasConnection,verifyAtlasPermissions } from '../src/modules/sync/atlas-policy.js';
import { canonical } from '../src/modules/sync/canonical-envelope.js';
import { classifyAtlasError } from '../src/modules/sync/atlas-error-diagnostic.js';
const freeze=value=>{for(const v of Object.values(value))if(v&&typeof v==='object')freeze(v);return Object.freeze(value);};
const prefix='b054c2c_'+ATLAS_SCHEMA_RUN;
export const schemaInventory=freeze({phase:ATLAS_SCHEMA_PHASE,runId:ATLAS_SCHEMA_RUN,
  collections:{operations:prefix+'_ops',facts:prefix+'_facts',fences:prefix+'_fence',authorization:prefix+'_authorization',
    identities:prefix+'_identities',ownerGuards:prefix+'_ownerGuards',identitySessions:prefix+'_identitySessions',revocations:prefix+'_revocations'},
  indexes:[
    {model:'operations',name:'owner_operation_unique',key:{technicalAccountId:1,operationId:1}},
    {model:'facts',name:'scope_source_unique',key:{scope:1,sourceKey:1}},
    {model:'identities',name:'identity_registration_unique',key:{registrationId:1}},
    {model:'identities',name:'identity_binding_unique',key:{installationId:1,localPlayerId:1}},
    {model:'identitySessions',name:'identity_token_unique',key:{tokenHash:1}},
  ],
  previous:['ops','facts','fence','authorization'].map(s=>'b054c2c_0e803b0278594116a83894c04fb10c53_'+s),
  fence:{_id:'ingestion-v1',revision:0},limits:{connections:1,collections:8,secondaryIndexes:5,documents:1,ioMs:10000,supervisorMs:120000},
});
const check=value=>{if(!value)throw new Error('Schema preflight failed.');};
const same=(a,b)=>canonical(a)===canonical(b);
export const schemaConfiguration=()=>({mode:'atlas-integration-test',authorized:true,...ATLAS_TARGET,uri:ATLAS_URI,tls:true,
  runId:ATLAS_SCHEMA_RUN,authMechanism:'DEFAULT',allowWrites:true,persistenceTest:ATLAS_SCHEMA_PHASE});
export function schemaEnumeration(response,expected){
  const c=response?.cursor,id=c?.id;check(response?.ok===1&&Array.isArray(c?.firstBatch)&&(id===0||id===0n||id?.isZero?.()===true));
  const names=c.firstBatch.map(r=>r.name);check(names.length<=32&&new Set(names).size===names.length&&same([...names].sort(),[...expected].sort()));
}
export function checkSchemaIndexes(model,indexes,{complete=false,none=false}={}){
  check(Object.hasOwn(schemaInventory.collections,model)&&Array.isArray(indexes));const expected=none?[]:schemaInventory.indexes.filter(i=>i.model===model),seen=new Set();
  for(const index of indexes){
    check(!seen.has(index.name)&&!index.sparse&&!index.partialFilterExpression&&!index.hidden&&index.expireAfterSeconds===undefined&&(!index.collation||index.collation.locale==='simple'));seen.add(index.name);
    if(index.name==='_id_'){check(same(index.key,{_id:1}));continue;}
    check(index.unique===true&&expected.some(i=>i.name===index.name&&same(i.key,index.key)));
  }
  check(seen.has('_id_'));if(complete)check(expected.every(i=>seen.has(i.name)));
}
function safeFailure(error,stage){
  const diagnostic=classifyAtlasError(error,{stage:stage==='metadata'?'list-collections':'diagnostic'});
  const d=Object.getOwnPropertyDescriptor(error??{},'code'),code=d&&'value'in d?d.value:null;
  return {diagnostic,serverCode:[13,18,48,50,67,85,86,8000,11000].includes(code)?code:null};
}
export async function provisionRevocationSchema({credential,connector,onProgress=async()=>{},report={}}={}){
  let handle,connection;const config=validateAtlasConfig(schemaConfiguration());
  Object.assign(report,{phase:ATLAS_SCHEMA_PHASE,runId:ATLAS_SCHEMA_RUN,status:'blocked',stage:'configuration',
    createdCollections:[],createdIndexes:[],fenceConfirmed:false,racesExecuted:false,closed:true,attemptedObject:null});
  const progress=async()=>onProgress({phase:report.phase,runId:report.runId,stage:report.stage,attemptedObject:report.attemptedObject,
    collectionsAcknowledged:report.createdCollections.length,indexesAcknowledged:report.createdIndexes.length,fenceConfirmed:report.fenceConfirmed});
  const collection=key=>{const name=schemaInventory.collections[key];check(name&&connection);const c=connection.db.collection(name);
    check(c.dbName===ATLAS_TARGET.database&&c.collectionName===name);return c;};
  const enumerate=async expected=>schemaEnumeration(await connection.db.command({listCollections:1,authorizedCollections:true,nameOnly:true},{maxTimeMS:10000}),expected);
  try{
    check(typeof connector==='function');report.stage='authentication';
    handle=await openAtlasIntegration({config,credential,connector:async(uri,options)=>{
      connection=await connector(uri,{...options,timeoutMS:10000,retryReads:false,retryWrites:false,maxPoolSize:1,minPoolSize:0,maxConnecting:1});return connection;
    }});
    report.closed=false;assertAtlasConnection(connection,config);report.authentication='verified';
    const o=connection.getClient().options;check(o.timeoutMS===10000&&o.retryReads===false&&o.retryWrites===false&&o.maxPoolSize===1&&o.autoIndex!==true&&o.autoCreate!==true);
    report.stage='permissions';const permissions=await connection.db.command({connectionStatus:1,showPrivileges:true},{maxTimeMS:10000});verifyAtlasPermissions(permissions);
    const actions=new Set(permissions.authInfo.authenticatedUserPrivileges.filter(p=>p.resource.collection==='').flatMap(p=>p.actions));
    check(['listCollections','find','createCollection','createIndex','insert','listIndexes'].every(a=>actions.has(a)));report.permissionsVerified=true;
    report.stage='metadata';await enumerate(schemaInventory.previous);report.metadataVerified=true;
    const hello=await connection.db.admin().command({hello:1},{maxTimeMS:10000});check(hello.setName&&hello.isWritablePrimary===true);report.replicaSetPrimary=true;
    // No model construction, ingestion, identity registration, transactions or automatic indexes.
    for(const [key,name]of Object.entries(schemaInventory.collections)){
      report.stage='create-collection';report.attemptedObject={kind:'collection',name};await progress();
      await connection.db.createCollection(name,{writeConcern:{w:'majority'},maxTimeMS:10000});
      report.createdCollections.push(name);checkSchemaIndexes(key,await collection(key).indexes({maxTimeMS:10000}),{none:true});await progress();
    }
    await enumerate([...schemaInventory.previous,...Object.values(schemaInventory.collections)]);
    for(const index of schemaInventory.indexes){
      report.stage='create-index';report.attemptedObject={kind:'index',collection:schemaInventory.collections[index.model],name:index.name};await progress();
      check(await collection(index.model).createIndex(index.key,{name:index.name,unique:true,writeConcern:{w:'majority'},maxTimeMS:10000})===index.name);
      report.createdIndexes.push(index.name);checkSchemaIndexes(index.model,await collection(index.model).indexes({maxTimeMS:10000}));await progress();
    }
    report.stage='verify-structures';
    for(const key of Object.keys(schemaInventory.collections)){
      checkSchemaIndexes(key,await collection(key).indexes({maxTimeMS:10000}),{complete:true});
      check(await collection(key).findOne({_id:{$exists:true}},{projection:{_id:1},maxTimeMS:10000})===null);
    }
    report.structuresVerified=true;await enumerate([...schemaInventory.previous,...Object.values(schemaInventory.collections)]);
    report.stage='insert-fence';report.attemptedObject={kind:'fence',collection:schemaInventory.collections.fences,id:'ingestion-v1'};await progress();
    check((await collection('fences').insertOne({...schemaInventory.fence},{writeConcern:{w:'majority',j:true},maxTimeMS:10000})).acknowledged===true);
    report.stage='verify-fence';check(same(await collection('fences').findOne({_id:'ingestion-v1'},{maxTimeMS:10000}),schemaInventory.fence));
    for(const key of Object.keys(schemaInventory.collections))check(await collection(key).countDocuments({_id:{$exists:true}},{maxTimeMS:10000})===(key==='fences'?1:0));
    report.fenceConfirmed=true;report.stage='completed';report.attemptedObject=null;report.status='completed';report.previousStructuresUntouched=true;await progress();
  }catch(error){Object.assign(report,safeFailure(error,report.stage));report.status=report.attemptedObject||report.createdCollections.length?'partial':'blocked';report.preserveCreatedStructures=true;}
  finally{
    if(handle){try{await handle.close();report.closed=true;}catch{report.closed=false;report.status='partial';}}
    else if(connection){try{await connection.close();report.closed=true;}catch{report.closed=false;}}
  }
  return report;
}
