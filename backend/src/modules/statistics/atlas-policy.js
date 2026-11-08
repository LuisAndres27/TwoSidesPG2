// B86 — policy for the FUTURE MongoDB Atlas statistics target. This module never opens a connection, reads no file and no secret.
// Atlas is OFF unless the process explicitly selects it AND carries the owner's authorization phrase. A MongoDB URI found in the environment
// (MONGODB_URI or similar) is never read and never activates anything. Credentials are NOT configuration: they are handed to the connector at
// run time by a protected channel (see tools/b86), never through environment variables, URIs, arguments or files.
export class StatisticsConfigError extends Error{constructor(code){super('Statistics storage configuration rejected: '+code);this.code=code;this.name='StatisticsConfigError';}}

// B86.1: Metabase never reads the ingestion database. It reads a SEPARATE analytical database that holds only a published copy of the aggregate counters (B85 model).
export const STATISTICS_DATABASES=Object.freeze({atlasTest:'twosides_statistics_demo',analyticsTest:'twosides_statistics_analytics_demo',production:'twosides_statistics'});
export const STATISTICS_IDENTITIES=Object.freeze({
 ingest:Object.freeze({user:'twosides_statistics_ingest_v1',role:'two_sides_statistics_ingest_v1'}),
 schema:Object.freeze({user:'twosides_statistics_schema_v1',role:'two_sides_statistics_schema_v1'}),
 publisher:Object.freeze({user:'twosides_statistics_publisher_v1',role:'two_sides_statistics_publisher_v1'}),
 reader:Object.freeze({user:'twosides_statistics_reader_v1',role:'two_sides_statistics_reader_v1'})});
const NEEDS_ANALYTICS=new Set(['schema','publisher','reader']);
export const LOCAL_RBAC=Object.freeze({container:'twosides-b86-rbac',host:'127.0.0.1',port:27086,replicaSet:'rsB86',databasePrefix:'twosides_statistics_b86_'});
// The owner's literal confirmation. Claude Code never sets it; without it Atlas mode cannot be selected.
export const ATLAS_AUTHORIZATION_PHRASE='B86_OWNER_AUTHORIZES_ATLAS_SYNTHETIC_SESSION';
export const SYNTHETIC_ATLAS_POLICY='b82-run-hybrid-v1';
export const CONNECTION_LIMITS=Object.freeze({serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,timeoutMS:15000,maxPoolSize:6,minPoolSize:0});
// B86.5: authentication mechanism per target kind. Atlas (TwoSidesCluster, verified with the reader on 2026-11-05) rejects SCRAM-SHA-256 for these
// technical users (bad auth, code 8000) and accepts SCRAM-SHA-1 over TLS; the disposable local server keeps SCRAM-SHA-256. Fixed here, never taken from the environment.
export const AUTH_MECHANISM_BY_KIND=Object.freeze({atlas:'SCRAM-SHA-1','local-rbac':'SCRAM-SHA-256'});
const ATLAS_HOST=/^[a-z0-9][a-z0-9-]{0,62}\.[a-z0-9]{3,12}\.mongodb\.net$/;
const SAFE_NAMES=new Set(Object.values(STATISTICS_IDENTITIES).map(x=>x.user));
const prepared=new WeakSet();

// Pure: environment object in, frozen decision out. Never touches process.env by itself.
export function resolveStatisticsStorage(env={}){
 if(env.STATISTICS_ENABLE!=='true')return Object.freeze({mode:'off'});
 const mode=env.STATISTICS_STORAGE;
 if(mode==='local-demo')return Object.freeze({mode:'local-demo'});
 if(mode==='production')throw new StatisticsConfigError('production_retention_not_approved');
 if(mode!=='atlas-test')throw new StatisticsConfigError('storage_not_selected');
 // atlas-test: every item must be explicit. Nothing is inferred and nothing falls back.
 if(env.STATISTICS_ATLAS_AUTHORIZATION!==ATLAS_AUTHORIZATION_PHRASE)throw new StatisticsConfigError('owner_authorization_missing');
 if(!ATLAS_HOST.test(env.STATISTICS_ATLAS_HOST??''))throw new StatisticsConfigError('atlas_host_rejected');
 if(env.STATISTICS_DATABASE!==STATISTICS_DATABASES.atlasTest||env.STATISTICS_ANALYTICS_DATABASE!==STATISTICS_DATABASES.analyticsTest)throw new StatisticsConfigError('database_rejected');
 if(env.STATISTICS_POLICY_VERSION!==SYNTHETIC_ATLAS_POLICY)throw new StatisticsConfigError('policy_rejected');
 const identity=Object.entries(STATISTICS_IDENTITIES).find(([,v])=>v.user===env.STATISTICS_SERVICE_USER)?.[0];
 if(!identity||!SAFE_NAMES.has(env.STATISTICS_SERVICE_USER))throw new StatisticsConfigError('service_user_rejected');
 return preparedConfiguration({kind:'atlas',host:env.STATISTICS_ATLAS_HOST,database:env.STATISTICS_DATABASE,analyticsDatabase:NEEDS_ANALYTICS.has(identity)?env.STATISTICS_ANALYTICS_DATABASE:undefined,identity,retentionPolicy:SYNTHETIC_ATLAS_POLICY});
}

// Unforgeable (module-private WeakSet): only this module can mint a configuration the adapter will accept as an Atlas/RBAC target.
export function preparedConfiguration({kind,host,database,analyticsDatabase,identity,retentionPolicy=SYNTHETIC_ATLAS_POLICY}){
 if(!STATISTICS_IDENTITIES[identity]||retentionPolicy!==SYNTHETIC_ATLAS_POLICY)throw new StatisticsConfigError('configuration_rejected');
 // Ingestion sees only the source database; schema/publisher/reader also name the separate analytical database (and only identities that need it).
 if(NEEDS_ANALYTICS.has(identity)!==(analyticsDatabase!==undefined)||(analyticsDatabase!==undefined&&analyticsDatabase===database))throw new StatisticsConfigError('configuration_rejected');
 if(kind==='atlas'){
  if(!ATLAS_HOST.test(host??'')||database!==STATISTICS_DATABASES.atlasTest||(analyticsDatabase!==undefined&&analyticsDatabase!==STATISTICS_DATABASES.analyticsTest))throw new StatisticsConfigError('configuration_rejected');
 }else if(kind==='local-rbac'){
  const local=new RegExp('^'+LOCAL_RBAC.databasePrefix+'[a-f0-9]{16}$');
  if(host!==LOCAL_RBAC.host||!local.test(database??'')||(analyticsDatabase!==undefined&&!local.test(analyticsDatabase)))throw new StatisticsConfigError('configuration_rejected');
 }else throw new StatisticsConfigError('configuration_rejected');
 const config=Object.freeze({mode:kind==='atlas'?'atlas-test':'local-rbac-test',kind,host,database,...(analyticsDatabase!==undefined?{analyticsDatabase}:{}),identity,user:STATISTICS_IDENTITIES[identity].user,retentionPolicy,tls:true,authMechanism:AUTH_MECHANISM_BY_KIND[kind],authSource:'admin',...CONNECTION_LIMITS,
  ...(kind==='local-rbac'?{port:LOCAL_RBAC.port,replicaSet:LOCAL_RBAC.replicaSet}:{})});
 prepared.add(config);return config;
}
export const isPreparedConfiguration=value=>prepared.has(value);

// Driver-handle verification, evaluated before every session by the adapter (see mongo-local-policy.js dispatcher).
export function assertPreparedDriverTarget(client,db,config){
 if(!prepared.has(config))throw Error('Statistics target rejected');
 const o=client?.options,c=o?.credentials;
 const bad=db?.databaseName!==config.database||!c||c.username!==config.user||c.mechanism!==AUTH_MECHANISM_BY_KIND[config.kind]||c.source!=='admin'||o.tls!==true||
  o.tlsAllowInvalidCertificates||o.tlsAllowInvalidHostnames||o.tlsInsecure||o.proxyHost||o.loadBalanced||o.retryWrites!==false;
 const badTopology=config.kind==='atlas'?o?.srvHost!==config.host:(o?.srvHost||o?.directConnection!==true||o.replicaSet!==config.replicaSet||o.hosts?.length!==1||o.hosts[0].host!==config.host||o.hosts[0].port!==config.port);
 if(bad||badTopology)throw Error('Statistics target rejected');
 return config;
}
