// B64: pure read-only probe. No driver, models, server, environment, files or connection on import.
export const TARGET=Object.freeze({host:'twosidescluster.fxqeo8o.mongodb.net',database:'two_sides_db',user:'twosides_backend_v2',authSource:'admin',authMechanism:'SCRAM-SHA-256',tls:true});
export const COLLECTIONS=Object.freeze(['operations','facts','fences','identities','ownerGuards','identitySessions','revocations'].map(k=>'main_v2_'+k));
const HISTORY=new Set(['users','decisions','gameevents','gameprogresses','statisticevents','statisticsummaries','syncidentities']);
const READ_ACTIONS=new Set(['find','listIndexes']),MAX_ACTIONS=new Set(['find','insert','update','listIndexes']);
export class ProbeError extends Error{constructor(code){super('Atlas v2 read probe unavailable.');this.name='ProbeError';this.code=code;}}
const require=(ok,code)=>{if(!ok)throw new ProbeError(code);};
export function validateConfig(config){require(config&&Object.keys(config).length===Object.keys(TARGET).length&&Object.entries(TARGET).every(([k,v])=>config[k]===v),'configuration_rejected');}
export function verifyReadPermissions(response){
 const a=response?.authInfo;
 require(response?.ok===1&&Array.isArray(a?.authenticatedUsers)&&a.authenticatedUsers.length===1&&a.authenticatedUsers[0]?.user===TARGET.user&&a.authenticatedUsers[0]?.db==='admin','identity_rejected');
 require(Array.isArray(a.authenticatedUserRoles)&&a.authenticatedUserRoles.length===1&&a.authenticatedUserRoles[0]?.role==='two_sides_main_runtime_v1'&&a.authenticatedUserRoles[0]?.db==='admin','role_rejected');
 require(Array.isArray(a.authenticatedUserPrivileges)&&a.authenticatedUserPrivileges.length>0,'permissions_rejected');
 const seen=new Map([['',new Set()],...COLLECTIONS.map(n=>[n,new Set()])]);
 for(const p of a.authenticatedUserPrivileges){
  const r=p?.resource;
  require(r&&Object.keys(r).length===2&&Object.keys(r).every(k=>['db','collection'].includes(k))&&r.db===TARGET.database&&seen.has(r.collection)&&Array.isArray(p.actions)&&p.actions.length>0,'permissions_rejected');
  const allowed=r.collection===''?new Set(['listCollections']):MAX_ACTIONS;
  for(const action of p.actions){require(allowed.has(action),'permissions_rejected');seen.get(r.collection).add(action);}
 }
 require(seen.get('').has('listCollections')&&COLLECTIONS.every(n=>[...READ_ACTIONS].every(a=>seen.get(n).has(a))),'read_permissions_insufficient');
 return {readPermissionsVerified:true,runtimePrivilegesVerified:COLLECTIONS.every(n=>[...MAX_ACTIONS].every(a=>seen.get(n).has(a)))};
}
function checkConnection(c){
 const o=c?.getClient?.().options;
 require(c?.readyState===1&&c.name===TARGET.database&&c.db?.databaseName===TARGET.database&&o?.srvHost===TARGET.host&&o.dbName===TARGET.database&&o.directConnection===false&&o.tls===true&&
  o.tlsInsecure!==true&&o.tlsAllowInvalidCertificates!==true&&o.tlsAllowInvalidHostnames!==true&&o.rejectUnauthorized!==false&&typeof o.checkServerIdentity!=='function'&&
  o.credentials?.username===TARGET.user&&o.credentials?.source==='admin'&&o.credentials?.mechanism==='SCRAM-SHA-256','connection_rejected');
}
function batch(response,max){
 require(response?.ok===1&&response.cursor&&Array.isArray(response.cursor.firstBatch)&&response.cursor.firstBatch.length<=max,'metadata_response_rejected');
 const id=response.cursor.id;require(id===0||id===0n||id?.toString?.()==='0','cursor_limit_reached');
 return response.cursor.firstBatch;
}
function checkIndexes(rows,definition){
 const expected=[{name:'_id_',key:{_id:1}},...definition.indexes];
 require(rows.length===expected.length,'indexes_rejected');
 for(const e of expected){const i=rows.find(r=>r.name===e.name);require(i&&JSON.stringify(i.key)===JSON.stringify(e.key)&&(e.name==='_id_'||i.unique===true)&&!i.sparse&&!i.partialFilterExpression&&!i.hidden&&i.expireAfterSeconds===undefined&&(!i.collation||i.collation.locale==='simple'),'indexes_rejected');}
}
// Test injection is explicit; the real receiver supplies only verified modules and a fixed connector.
export async function runReadProbe(options){
 let c,handle,report={schemaVersion:1,ok:false,readOnly:true,authenticationVerified:false,close:'not-needed'},stage='configuration',calls=0;
 const o=options??{};
 try{
  require(Object.keys(o).every(k=>['config','integrity','readCredential','credentials','connect','schema','classify'].includes(k)),'configuration_rejected');
  validateConfig(o.config??TARGET);
  require(typeof o.integrity==='function'&&typeof o.readCredential==='function'&&typeof o.connect==='function'&&typeof o.credentials?.consume==='function'&&typeof o.credentials?.destroy==='function','configuration_rejected');
  require(o.schema?.database===TARGET.database&&Object.values(o.schema.collections??{}).length===7&&Object.values(o.schema.collections).every(d=>COLLECTIONS.includes(d.name))&&new Set(Object.values(o.schema.collections).map(d=>d.name)).size===7,'schema_rejected');
  stage='integrity';require(await o.integrity()===true,'integrity_rejected');
  stage='credential';handle=await o.readCredential();const pass=o.credentials.consume(handle);require(typeof pass==='string'&&pass.length>0,'credential_rejected');
  stage='mongoose-connect';
  c=await o.connect(`mongodb+srv://${TARGET.host}/${TARGET.database}`,{dbName:TARGET.database,user:TARGET.user,pass,authSource:'admin',authMechanism:'SCRAM-SHA-256',
   tls:true,tlsAllowInvalidCertificates:false,tlsAllowInvalidHostnames:false,directConnection:false,readPreference:'primary',retryReads:false,retryWrites:false,
   serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,socketTimeoutMS:10000,waitQueueTimeoutMS:2000,maxPoolSize:1,minPoolSize:0,maxConnecting:1,
   autoIndex:false,autoCreate:false,bufferCommands:false,monitorCommands:false,appName:'TwoSides-V2-FirstRead'});
  stage='connection-verification';checkConnection(c);report.authenticationVerified=true;
  // Only these literal commands are possible. No generic query/collection is taken from arguments.
  const command=async doc=>{require(++calls<=11,'operation_limit');return c.db.command(doc);};
  stage='permission-inspection';const permissions=verifyReadPermissions(await command({connectionStatus:1,showPrivileges:true}));Object.assign(report,permissions);
  stage='server-verification';const hello=await command({hello:1,saslSupportedMechs:`admin.${TARGET.user}`});require(hello?.ok===1&&typeof hello.setName==='string'&&hello.setName.length>0&&hello.isWritablePrimary===true,'server_rejected');
  stage='catalog';const catalog=batch(await command({listCollections:1,nameOnly:true,authorizedCollections:true,cursor:{batchSize:200},maxTimeMS:2000}),200);
  require(catalog.every(r=>r&&typeof r.name==='string'&&(COLLECTIONS.includes(r.name)||HISTORY.has(r.name)))&&new Set(catalog.map(r=>r.name)).size===catalog.length&&COLLECTIONS.every(n=>catalog.some(r=>r.name===n&&r.type==='collection')),'catalog_rejected');
  stage='indexes';for(const d of Object.values(o.schema.collections))checkIndexes(batch(await command({listIndexes:d.name,cursor:{batchSize:40},maxTimeMS:2000}),40),d);
  stage='seed';const seed=batch(await command({find:'main_v2_fences',filter:{_id:'ingestion-v1'},projection:{_id:0,revision:1},limit:2,batchSize:2,singleBatch:true,maxTimeMS:2000}),2);
  require(seed.length===1&&Number.isSafeInteger(seed[0].revision)&&seed[0].revision>=0,'seed_rejected');
  report={...report,ok:true,identity:TARGET.user,database:TARGET.database,mechanism:'SCRAM-SHA-256',collectionsVerified:7,indexesVerified:true,seedVerified:true};
 }catch(error){
  const known=error instanceof ProbeError;
  let classified={};try{if(typeof o.classify==='function')classified=o.classify(error,{stage:stage==='mongoose-connect'?stage:'diagnostic'});}catch{}
  const categories=new Set(['AUTHENTICATION_FAILURE','AUTHORIZATION_FAILURE','CERTIFICATE_VALIDATION_FAILURE','TLS_HANDSHAKE_FAILURE','NETWORK_TIMEOUT','SERVER_SELECTION_TIMEOUT','UNKNOWN_CONNECTION_FAILURE']);
  report={...report,ok:false,stage,code:known?error.code:'probe_unavailable',category:known?'PRECONDITION_OR_METADATA_FAILURE':categories.has(classified?.category)?classified.category:'UNKNOWN_CONNECTION_FAILURE',technicalCode:[13,18,8000].includes(classified?.code)?classified.code:null};
 }finally{
  try{o.credentials?.destroy(handle);}catch{}
  if(c){try{await c.close();report.close='completed';}catch{report.ok=false;report.close='failed';report.code='close_failed';}}
 }
 return Object.freeze({...report,commandsIssued:calls});
}
