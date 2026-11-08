// B86 — connector for the statistics target (future Atlas, and the disposable authenticated/TLS test server). Importing this module opens nothing.
// Rules: SCRAM only with the mechanism fixed per target (Atlas: SCRAM-SHA-1; local test server: SCRAM-SHA-256, see AUTH_MECHANISM_BY_KIND), TLS always with normal certificate/hostname validation (no tlsAllowInvalid*/tlsInsecure, no callbacks), credentials
// as driver options (never in the URI, never logged), bounded timeouts, no retryable-writes magic, errors reduced to a safe category.
import {MongoClient} from 'mongodb';
import {createHmac} from 'node:crypto';
import {isPreparedConfiguration,STATISTICS_DATABASES,AUTH_MECHANISM_BY_KIND} from './atlas-policy.js';
import {verifyEffectivePrivileges} from './atlas-privileges.js';
import {registerB81MongoAdapter,MongoStatisticsTransactionAdapter} from './mongo-transaction-adapter.js';
import {createB81MongoRepository} from './mongo-test-composition.js';

// The original driver/Node error rides on the classified error under this NON-enumerable symbol so that owner tools can describe it through the sanitiser.
// It is invisible to JSON.stringify, Object.keys, message and stack; nothing in the statistics service reads it.
export const DIAGNOSTIC_SOURCE=Symbol.for('twosides.b86.diagnostic-source');
export class StatisticsConnectionError extends Error{constructor(category,stage,detail){super('Statistics connection failed: '+category+' ('+stage+')');this.category=category;this.stage=stage;if(detail){this.errorName=detail.errorName;this.code=detail.code;}this.name='StatisticsConnectionError';}}
// Only a category/stage ever leaves this module (plus errorName/code taken from the fixed lists below, "other" otherwise): no URI, host list, user, stack or driver message.
const SAFE_ERROR_NAMES=new Set(['MongoParseError','MongoInvalidArgumentError','MongoAPIError','MongoRuntimeError','MongoNetworkError','MongoNetworkTimeoutError','MongoServerSelectionError','MongoServerError','MongoMissingCredentialsError','MongoTopologyClosedError','MongoError','AggregateError','TypeError','RangeError','ReferenceError','SyntaxError','Error']);
const SAFE_ERROR_CODES=new Set(['ENOTFOUND','ENODATA','ESERVFAIL','EREFUSED','EBADRESP','ECANCELLED','ETIMEOUT','EAI_AGAIN','EBADNAME','EBADQUERY','EBADFAMILY','EFORMERR','ENOTIMP','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','EADDRNOTAVAIL','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_WRONG_VERSION_NUMBER','ERR_SSL_PROTOCOL_ERROR','ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR','ERR_INVALID_ARG_TYPE','ERR_INVALID_URL','13','18','8000']);
const URI_OPTION_NAMES=new Set(['MongoParseError','MongoInvalidArgumentError','MongoAPIError','MongoMissingCredentialsError']);
const INTERNAL_NAMES=new Set(['TypeError','RangeError','ReferenceError','SyntaxError','MongoRuntimeError']);
const chain=root=>{const out=[],seen=new Set(),queue=[root];while(queue.length&&out.length<16){const e=queue.shift();if(!e||typeof e!=='object'||seen.has(e))continue;seen.add(e);out.push(e);if(e.cause)queue.push(e.cause);if(Array.isArray(e.errors))queue.push(...e.errors.slice(0,8));if(e.reason&&typeof e.reason==='object')queue.push(e.reason);}return out;};
const codeOf=e=>typeof e?.code==='number'||typeof e?.code==='string'?String(e.code):undefined;
function baseCategory(error){   // original rules, applied to one error; codes are included in the text because AggregateError and DNS errors carry them
 const code=error?.code,name=String(error?.name??''),message=String(error?.message??''),text=message+name+(typeof code==='string'?code:'');
 return code===18||/authentication failed|SCRAM/i.test(message)?'authentication':code===13?'authorization':
  /ssl|tls|certificate|hostname|altname|self.signed|CERT_|UNABLE_TO_VERIFY|ERR_SSL/i.test(text)?'tls':
  /timed? ?out|Server selection|ETIMEDOUT/i.test(text)?'timeout':/ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|getaddrinfo|MongoNetworkError|EHOSTUNREACH|ENETUNREACH/i.test(text)?'network':'unknown';
}
export function classifyConnectionError(error,stage){
 const all=chain(error);let category='unknown';
 if(all.some(e=>e.syscall==='querySrv'||e.syscall==='queryTxt'))category='dns_srv';
 else for(const e of all){const c=baseCategory(e);if(c!=='unknown'){category=c;break;}}
 if(stage==='connect'&&all.some(e=>e.name==='MongoServerError'&&(e.code===8000||e.code===18)))category='authentication';   // Atlas answers rejected credentials with code 8000 (AtlasError)
 if(category==='unknown'){
  if(all.some(e=>URI_OPTION_NAMES.has(e.name)))category='uri_or_options';
  else if(all.some(e=>INTERNAL_NAMES.has(e.name)))category='driver_internal';
 }
 const nameHit=all.map(e=>e.name).find(n=>SAFE_ERROR_NAMES.has(n)&&n!=='Error')??(SAFE_ERROR_NAMES.has(error?.name)?error.name:undefined),codeHit=all.map(codeOf).find(c=>c!==undefined&&SAFE_ERROR_CODES.has(c));
 const result=new StatisticsConnectionError(category,stage,{errorName:nameHit??'other',code:codeHit??'other'});
 Object.defineProperty(result,DIAGNOSTIC_SOURCE,{value:error,enumerable:false});
 return result;
}
const SAFE_PASSWORD=/^[\x21-\x7e]{8,128}$/;
export function buildClientOptions(config,credentials,{tlsCAFile}={}){
 if(!isPreparedConfiguration(config))throw Error('Connector requires a prepared configuration');
 if(credentials?.username!==config.user||typeof credentials.password!=='string'||!SAFE_PASSWORD.test(credentials.password))throw new StatisticsConnectionError('credentials_rejected','configure');
 if(config.authMechanism!==AUTH_MECHANISM_BY_KIND[config.kind])throw new StatisticsConnectionError('mechanism_rejected','configure');   // the mechanism can neither be weakened locally nor changed for Atlas
 const options={auth:{username:credentials.username,password:credentials.password},authMechanism:config.authMechanism,authSource:config.authSource,tls:true,retryWrites:false,retryReads:false,
  serverSelectionTimeoutMS:config.serverSelectionTimeoutMS,connectTimeoutMS:config.connectTimeoutMS,socketTimeoutMS:config.socketTimeoutMS,timeoutMS:config.timeoutMS,maxPoolSize:config.maxPoolSize,minPoolSize:config.minPoolSize,appName:'TwoSides-Statistics-B86'};
 if(config.kind==='local-rbac'){Object.assign(options,{directConnection:true,replicaSet:config.replicaSet});if(tlsCAFile)options.tlsCAFile=tlsCAFile;}
 else if(tlsCAFile)throw Error('A custom CA is not accepted for Atlas');   // Atlas uses public CAs: no private trust anchors
 return options;
}
export const connectionUri=config=>config.kind==='atlas'?`mongodb+srv://${config.host}/`:`mongodb://${config.host}:${config.port}/`;   // never contains credentials
export function createStatisticsClient(config,credentials,{ClientImpl=MongoClient,tlsCAFile}={}){return new ClientImpl(connectionUri(config),buildClientOptions(config,credentials,{tlsCAFile}));}

// connect + topology + EXACT privilege preflight. Nothing is read or written before the privileges equal the matrix.
export async function connectPrepared(config,credentials,{ClientImpl,tlsCAFile}={}){
 const client=createStatisticsClient(config,credentials,{ClientImpl,tlsCAFile});let stage='connect';
 try{
  await client.connect();stage='topology';
  const hello=await client.db('admin').command({hello:1});
  if(hello.isWritablePrimary!==true||!hello.setName||!(hello.logicalSessionTimeoutMinutes>0))throw new StatisticsConnectionError('transactions_unsupported',stage);
  stage='privileges';const status=await client.db('admin').command({connectionStatus:1,showPrivileges:true});
  try{verifyEffectivePrivileges(status,config.identity,config.database,config.analyticsDatabase);}catch(e){throw new StatisticsConnectionError(['unexpected_roles','unexpected_user'].includes(e.message)?e.message:'privilege_mismatch',stage);}
  return {client,db:client.db(config.database),...(config.analyticsDatabase?{analyticsDb:client.db(config.analyticsDatabase)}:{}),setName:hello.setName};
 }catch(error){try{await client.close();}catch{/* closing never masks the cause */}throw error instanceof StatisticsConnectionError?error:classifyConnectionError(error,stage);}
}

// Runtime ingestion repository (identity 'ingest'). The adapter re-verifies the driver target before every session.
export async function openPreparedIngestRepository({config,credentials,key,tlsCAFile,now=Date.now,checkpoint,ClientImpl}){
 if(config?.identity!=='ingest')throw new StatisticsConnectionError('identity_not_ingest','configure');
 if(!Buffer.isBuffer(key)||key.length!==32)throw new StatisticsConnectionError('key_rejected','configure');
 if(![STATISTICS_DATABASES.atlasTest].includes(config.database)&&config.kind==='atlas')throw new StatisticsConnectionError('database_rejected','configure');
 const keyCheck=createHmac('sha256',key).update('key-check').digest('hex'),{client,db}=await connectPrepared(config,credentials,{ClientImpl,tlsCAFile});
 try{
  const adapter=await registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db,config,keyCheck,checkpoint,retentionPolicy:config.retentionPolicy}));
  const repository=createB81MongoRepository({profile:'statistics-atlas-prepared',adapter,key:Buffer.from(key),retentionPolicy:config.retentionPolicy,now});
  return {repository,client,async close(){try{await repository.close();}finally{await client.close();}}};
 }catch(error){try{await client.close();}catch{/* see above */}throw error instanceof StatisticsConnectionError?error:new StatisticsConnectionError('schema_not_ready','verify');}
}
