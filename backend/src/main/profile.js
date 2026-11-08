import {authorizeMainScope,closeMainScope,mainScopeState,MAIN_CONFIG,MainError,registerMainBundle,registerMainRepository} from './policy.js';
import {consumeAtlasCredential,destroyAtlasCredential} from '../modules/sync/atlas-credentials.js';
import {mongoIdentityModels} from '../modules/auth/mongo-identity-models.js';
import {ingestionModels} from '../modules/sync/mongo-models.js';
import {MongoIdentityRepository} from '../modules/auth/mongo-identity-repository.js';
import {MongoIngestionRepository} from '../modules/sync/mongo-ingestion-repository.js';

export const MAIN_ACTIVATION='ENABLE_MAIN_BACKEND_V2';
// Metadata and seed checks only. No automatic indexes, migrations, inserts, deletes or synthetic cleanup.
export async function inspectMainSchema(connection,models){
  const catalog=await connection.db.listCollections({}, {nameOnly:true}).toArray();
  if(!Array.isArray(catalog))throw new MainError('main_schema_unverified');
  const names=new Set(catalog.map(c=>c.name));
  for(const [key,model] of Object.entries(models)){
    if(key==='authorization')continue; // unused model, never an authorization fallback
    if(!names.has(model.collection.name))throw new MainError('main_schema_not_ready');
    const indexes=await model.collection.indexes(),expected=model.schema.indexes();
    if(!Array.isArray(indexes)||indexes.length!==expected.length+1||!indexes.some(i=>i.name==='_id_'&&JSON.stringify(i.key)==='{"_id":1}'))throw new MainError('main_schema_unverified');
    for(const i of indexes){
      if(i.sparse||i.partialFilterExpression||i.hidden||i.expireAfterSeconds!==undefined||(i.collation&&i.collation.locale!=='simple'))throw new MainError('main_schema_unverified');
      if(i.name!=='_id_'&&!expected.some(([k,o])=>o.name===i.name&&i.unique===true&&JSON.stringify(k)===JSON.stringify(i.key)))throw new MainError('main_schema_unverified');
    }
  }
  const rows=await models.fences.find({_id:'ingestion-v1'}).limit(2).lean();
  if(rows.length!==1||!Number.isSafeInteger(rows[0].revision)||rows[0].revision<0)throw new MainError('main_schema_not_ready');
  const hello=await connection.db.admin().command({hello:1});
  if(!hello.setName||hello.isWritablePrimary!==true)throw new MainError('main_transactions_unverified');
}
export async function openMainProfile(options={}){
  let connection,scope;
  try{
    if(!options||Object.keys(options).some(k=>!['activation','credential','connector','now'].includes(k))||options.activation!==MAIN_ACTIVATION||typeof options.connector!=='function')throw new MainError('main_not_activated');
    const pass=consumeAtlasCredential(options.credential);
    connection=await options.connector(MAIN_CONFIG.uri,{dbName:MAIN_CONFIG.database,user:MAIN_CONFIG.user,pass,authSource:'admin',authMechanism:MAIN_CONFIG.authMechanism,
      tls:true,tlsAllowInvalidCertificates:false,tlsAllowInvalidHostnames:false,directConnection:false,readPreference:'primary',w:'majority',retryWrites:true,
      maxPoolSize:5,minPoolSize:0,maxConnecting:2,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,socketTimeoutMS:10000,waitQueueTimeoutMS:2000,
      autoIndex:false,autoCreate:false,bufferCommands:false,monitorCommands:false,appName:'TwoSides-Main'});
    const authorized=await authorizeMainScope(connection);scope=authorized.scope;mainScopeState(scope,connection);
    const identityModels=mongoIdentityModels(connection,{atlasScope:scope}),models=ingestionModels(connection,{atlasScope:scope});
    await inspectMainSchema(connection,{...models,...identityModels});
    const identityRepository=new MongoIdentityRepository({synthetic:false,connection,models:identityModels,atlasScope:scope,now:options.now});
    const ingestionRepository=new MongoIngestionRepository({synthetic:false,disposable:false,connection,models,atlasScope:scope,fenceMode:'owner',identityRepository,coordinator:identityRepository.coordinator,now:options.now});
    // F1 start-up warm-up: one live deployment check per cache (ingestion: primary+indexes; identity: indexes+hello via an empty 'cached' transaction, no reads or writes)
    // on this same connection, before the bundle exists. Any failure falls into the catch below: scope and connection are closed and the service never becomes ready.
    await ingestionRepository.warmDeploymentCheck();
    await identityRepository.transaction(async()=>{},{deployment:'cached'});
    registerMainRepository(ingestionRepository,scope);
    let closing;
    const close=()=>closing??=(async()=>{closeMainScope(scope);try{await connection.close();}catch{throw new MainError('main_close_failed');}})();
    return registerMainBundle(Object.freeze({profile:'main',identityRepository,ingestionRepository,permissions:authorized.permissions,close,resources:[{name:'main-mongodb',close}]}));
  }catch(error){
    closeMainScope(scope);if(connection)await connection.close().catch(()=>{});
    throw error instanceof MainError?error:new MainError();
  }finally{destroyAtlasCredential(options?.credential);}
}
