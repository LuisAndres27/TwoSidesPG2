import {describe,it,expect,vi} from 'vitest';
import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {resolveStatisticsStorage,preparedConfiguration,isPreparedConfiguration,assertPreparedDriverTarget,StatisticsConfigError,ATLAS_AUTHORIZATION_PHRASE,STATISTICS_IDENTITIES,STATISTICS_DATABASES,LOCAL_RBAC} from '../../src/modules/statistics/atlas-policy.js';
import {PRIVILEGE_MATRIX,mongoRoleSpec,atlasRoleSpec,verifyEffectivePrivileges} from '../../src/modules/statistics/atlas-privileges.js';
import {buildClientOptions,connectionUri,connectPrepared,createStatisticsClient,classifyConnectionError,StatisticsConnectionError} from '../../src/modules/statistics/atlas-connector.js';
import {assertStatisticsDriverTarget} from '../../src/modules/statistics/mongo-local-policy.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {validateEvent} from '../../src/modules/statistics/contract.js';
import {generateDemoEvents,expectedTotals} from '../../tools/b84/generator.js';
import {ATLAS_SYNTHETIC_DATASET,atlasSyntheticEvents,runPreparedSession} from '../../tools/b86/session.js';
import {deploymentPlan} from '../../tools/b86/deployment-plan.mjs';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const FULL={STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:ATLAS_AUTHORIZATION_PHRASE,STATISTICS_ATLAS_HOST:'cluster0.abcde.mongodb.net',STATISTICS_DATABASE:'twosides_statistics_demo',STATISTICS_ANALYTICS_DATABASE:'twosides_statistics_analytics_demo',STATISTICS_POLICY_VERSION:'b82-run-hybrid-v1',STATISTICS_SERVICE_USER:'twosides_statistics_ingest_v1'};
const reject=(env,code)=>{try{resolveStatisticsStorage(env);}catch(e){expect(e).toBeInstanceOf(StatisticsConfigError);expect(e.code).toBe(code);return;}throw Error('was not rejected: '+code);};
const PASSWORD='Ab3_'+'x'.repeat(30);

describe('B86 configuration: Atlas is off unless explicitly selected and authorized',()=>{
 it('is off by default and ignores URIs and unrelated variables',()=>{
  expect(resolveStatisticsStorage({})).toEqual({mode:'off'});
  expect(resolveStatisticsStorage({MONGODB_URI:'mongodb+srv://x.y.mongodb.net/db',MONGO_URL:'mongodb://z',STATISTICS_ATLAS_HOST:'cluster0.abcde.mongodb.net'})).toEqual({mode:'off'});
  expect(resolveStatisticsStorage({...FULL,STATISTICS_ENABLE:'false'})).toEqual({mode:'off'});
  expect(resolveStatisticsStorage({...FULL,STATISTICS_ENABLE:undefined})).toEqual({mode:'off'});
 });
 it('never reads the process environment by itself',()=>{
  vi.stubEnv('STATISTICS_ENABLE','true');vi.stubEnv('STATISTICS_STORAGE','atlas-test');vi.stubEnv('MONGODB_URI','mongodb+srv://x.y.mongodb.net/db');
  try{expect(resolveStatisticsStorage()).toEqual({mode:'off'});}finally{vi.unstubAllEnvs();}
 });
 it('enabling without choosing a storage, or choosing production, is refused',()=>{
  reject({STATISTICS_ENABLE:'true'},'storage_not_selected');reject({STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas'},'storage_not_selected');
  reject({STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'production'},'production_retention_not_approved');
  expect(resolveStatisticsStorage({STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'local-demo'})).toEqual({mode:'local-demo'});
 });
 it('Atlas test mode needs the owner phrase and exact host, database, policy and identity',()=>{
  reject({...FULL,STATISTICS_ATLAS_AUTHORIZATION:undefined},'owner_authorization_missing');reject({...FULL,STATISTICS_ATLAS_AUTHORIZATION:'yes'},'owner_authorization_missing');
  for(const host of ['0.0.0.0','127.0.0.1','localhost','cluster0.abcde.mongodb.net.evil.com','evil.com','cluster0.mongodb.net','https://cluster0.abcde.mongodb.net','cluster0.abcde.mongodb.net:27017','user:pw@cluster0.abcde.mongodb.net',''])reject({...FULL,STATISTICS_ATLAS_HOST:host},'atlas_host_rejected');
  for(const database of ['two_sides_db','twosides_statistics','admin','twosides_statistics_demo2',undefined])reject({...FULL,STATISTICS_DATABASE:database},'database_rejected');
  for(const analytics of ['twosides_statistics_demo','twosides_statistics','admin','two_sides_db',undefined])reject({...FULL,STATISTICS_ANALYTICS_DATABASE:analytics},'database_rejected');
  for(const policy of ['bounded-v1','b83-campaign-v1',undefined])reject({...FULL,STATISTICS_POLICY_VERSION:policy},'policy_rejected');
  for(const user of ['twosides_backend','main_v2_user','twosides_statistics_ingest_v2',undefined])reject({...FULL,STATISTICS_SERVICE_USER:user},'service_user_rejected');
 });
 it('a valid selection yields a frozen configuration without any secret field',()=>{
  const config=resolveStatisticsStorage(FULL);
  expect(config.analyticsDatabase).toBeUndefined();   // ingestion never sees the analytical database
  const reader=resolveStatisticsStorage({...FULL,STATISTICS_SERVICE_USER:'twosides_statistics_reader_v1'});expect(reader).toMatchObject({identity:'reader',database:'twosides_statistics_demo',analyticsDatabase:'twosides_statistics_analytics_demo'});
  expect(config).toMatchObject({mode:'atlas-test',kind:'atlas',identity:'ingest',database:'twosides_statistics_demo',tls:true,authMechanism:'SCRAM-SHA-1',authSource:'admin',user:'twosides_statistics_ingest_v1'});
  expect(Object.isFrozen(config)).toBe(true);expect(JSON.stringify(config)).not.toMatch(/password|secret|token|mongodb\+srv|@/i);expect(isPreparedConfiguration(config)).toBe(true);
 });
 it('a prepared configuration cannot be forged by copying it',()=>{
  const config=resolveStatisticsStorage(FULL),copy={...config};expect(isPreparedConfiguration(copy)).toBe(false);
  expect(()=>buildClientOptions(copy,{username:config.user,password:PASSWORD})).toThrow();
  const client={options:{srvHost:config.host,tls:true,retryWrites:false,credentials:{username:config.user,mechanism:config.authMechanism,source:'admin'}}},db={databaseName:config.database,collection(){},};
  expect(()=>assertStatisticsDriverTarget(client,db,copy)).toThrow();      // falls back to the unchanged B81 rules, which reject Atlas
  expect(assertStatisticsDriverTarget(client,db,config)).toBe(config);
 });
 it('the CLI exits before any network use when disabled, unauthorized or without credentials',()=>{
  const env=extra=>({SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,...extra});
  const run=(e,input)=>spawnSync(process.execPath,['tools/b86/atlas-session.mjs','--action','preflight'],{cwd:backend,env:env(e),input,encoding:'utf8',timeout:30000});
  const a=run({},'');expect(a.status).toBe(2);expect(a.stderr).toContain('disabled');
  const b=run({STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test'},'');expect(b.status).toBe(2);expect(b.stderr).toContain('owner_authorization_missing');
  const c=run(FULL,'');expect(c.status).toBe(3);expect(c.stderr).toContain('Credentials not supplied');
  const d=spawnSync(process.execPath,['tools/b86/atlas-session.mjs','--action','seed'],{cwd:backend,env:env({...FULL,STATISTICS_SERVICE_USER:'twosides_statistics_reader_v1'}),input:'',encoding:'utf8',timeout:30000});expect(d.status).toBe(2);
  for(const r of [a,b,c,d])expect(r.stdout+r.stderr).not.toMatch(/mongodb\.net|password/i);
 });
});

describe('B86 driver target and connector rules',()=>{
 const atlas=()=>resolveStatisticsStorage(FULL);
 const handle=(config,patch={})=>({options:{srvHost:config.host,tls:true,retryWrites:false,credentials:{username:config.user,mechanism:config.authMechanism,source:'admin'},...patch}});
 it('accepts only a TLS, SCRAM (SHA-1 for Atlas), correctly named handle; rejects every weakening',()=>{
  const config=atlas(),db={databaseName:config.database};expect(assertPreparedDriverTarget(handle(config),db,config)).toBe(config);
  for(const patch of [{tls:false},{tlsAllowInvalidCertificates:true},{tlsAllowInvalidHostnames:true},{tlsInsecure:true},{srvHost:'other.abcde.mongodb.net'},{proxyHost:'x'},{loadBalanced:true},{retryWrites:true},{credentials:{username:config.user,mechanism:'DEFAULT',source:'admin'}},{credentials:{username:'twosides_backend',mechanism:'SCRAM-SHA-256',source:'admin'}},{credentials:{username:config.user,mechanism:'SCRAM-SHA-256',source:'twosides_statistics_demo'}},{credentials:undefined}])
   expect(()=>assertPreparedDriverTarget(handle(config,patch),db,config),JSON.stringify(patch)).toThrow();
  expect(()=>assertPreparedDriverTarget(handle(config),{databaseName:'two_sides_db'},config)).toThrow();
 });
 it('options: credentials only as driver options, never in the URI; no insecure TLS flags; custom CA refused for Atlas',()=>{
  const config=atlas(),options=buildClientOptions(config,{username:config.user,password:PASSWORD});
  expect(connectionUri(config)).toBe('mongodb+srv://cluster0.abcde.mongodb.net/');expect(connectionUri(config)).not.toMatch(/@|password/i);
  expect(options).toMatchObject({authMechanism:'SCRAM-SHA-1',authSource:'admin',tls:true,retryWrites:false,serverSelectionTimeoutMS:5000,timeoutMS:15000});
  for(const k of ['tlsAllowInvalidCertificates','tlsAllowInvalidHostnames','tlsInsecure','tlsCAFile'])expect(options[k]).toBeUndefined();
  expect(()=>buildClientOptions(config,{username:config.user,password:PASSWORD},{tlsCAFile:'C:/x.pem'})).toThrow();
  for(const bad of [{username:config.user,password:'short'},{username:config.user,password:'has space in it long enough'},{username:'other',password:PASSWORD},{password:PASSWORD},undefined])
   expect(()=>buildClientOptions(config,bad)).toThrow(StatisticsConnectionError);
  const client=createStatisticsClient(config,{username:config.user,password:PASSWORD});expect(client.options.srvHost).toBe(config.host);expect(client.options.tls).toBe(true);   // constructed, never connected
 });
 it('errors become a safe category: no host, user, password or driver text',async()=>{
  const config=atlas();
  const table=[[Object.assign(Error('Authentication failed for user twosides_statistics_ingest_v1 on cluster0.abcde.mongodb.net'),{code:18}),'authentication'],[Error('unable to verify the first certificate'),'tls'],[Error('Hostname/IP does not match certificate altnames'),'tls'],
   [Error('Server selection timed out after 5000 ms'),'timeout'],[Error('getaddrinfo ENOTFOUND cluster0.abcde.mongodb.net'),'network'],[Object.assign(Error('not authorized'),{code:13}),'authorization'],[Error('weird'),'unknown']];
  for(const [error,category] of table){const e=classifyConnectionError(error,'connect');expect(e.category).toBe(category);expect(e.message+JSON.stringify(e)).not.toMatch(/mongodb\.net|twosides_statistics_ingest|password/i);}
  class Fake{constructor(){}async connect(){throw Object.assign(Error('connection to cluster0.abcde.mongodb.net failed: self signed certificate'),{name:'MongoServerSelectionError'});}async close(){}}
  const e=await connectPrepared(config,{username:config.user,password:PASSWORD},{ClientImpl:Fake}).catch(x=>x);
  expect(e).toBeInstanceOf(StatisticsConnectionError);expect(e.category).toBe('tls');expect(JSON.stringify([e.message,e.stage,e.category])).not.toMatch(/mongodb\.net|password|twosides_statistics/i);
 });
 it('refuses a primary that cannot run transactions, before reading anything',async()=>{
  const config=atlas();class Fake{async connect(){}db(){return {command:async c=>c.hello?{isWritablePrimary:true,setName:undefined}:{}};}async close(){}}
  const e=await connectPrepared(config,{username:config.user,password:PASSWORD},{ClientImpl:Fake}).catch(x=>x);expect(e.category).toBe('transactions_unsupported');
 });
 it('the production database name is not accepted for any Atlas configuration in B86',()=>{
  expect(()=>preparedConfiguration({kind:'atlas',host:'cluster0.abcde.mongodb.net',database:STATISTICS_DATABASES.production,identity:'ingest'})).toThrow();
  expect(()=>preparedConfiguration({kind:'atlas',host:'cluster0.abcde.mongodb.net',database:STATISTICS_DATABASES.atlasTest,identity:'owner'})).toThrow();
  expect(()=>preparedConfiguration({kind:'local-rbac',host:'10.0.0.5',database:LOCAL_RBAC.databasePrefix+'0'.repeat(16),identity:'ingest'})).toThrow();
 });
 it('analytics database rules: only identities that need it carry it, never equal to the source, never a foreign name',()=>{
  const base={kind:'atlas',host:'cluster0.abcde.mongodb.net',database:'twosides_statistics_demo'};
  expect(()=>preparedConfiguration({...base,identity:'ingest',analyticsDatabase:'twosides_statistics_analytics_demo'})).toThrow();
  for(const id of ['schema','publisher','reader']){
   expect(()=>preparedConfiguration({...base,identity:id})).toThrow();
   expect(()=>preparedConfiguration({...base,identity:id,analyticsDatabase:'twosides_statistics_demo'})).toThrow();
   expect(()=>preparedConfiguration({...base,identity:id,analyticsDatabase:'two_sides_db'})).toThrow();
   expect(preparedConfiguration({...base,identity:id,analyticsDatabase:'twosides_statistics_analytics_demo'}).analyticsDatabase).toBe('twosides_statistics_analytics_demo');
  }
 });
 it('the offline app accepts the prepared profile only with a registered MongoDB repository',()=>{
  expect(()=>createStatisticsOfflineApp({profile:'statistics-atlas-prepared',identities:new SyntheticStatisticsIdentity(),store:{commit(){}}})).toThrow();
  expect(()=>createStatisticsOfflineApp({profile:'statistics-atlas',identities:new SyntheticStatisticsIdentity(),store:{commit(){}}})).toThrow();
 });
});

describe('B86 privilege matrix',()=>{
 const SRC='twosides_statistics_demo',AN='twosides_statistics_analytics_demo',WRITE=['insert','update','remove','createCollection','createIndex','dropCollection','dropIndex','collMod','dropDatabase','renameCollectionSameDB','bypassDocumentValidation'];
 const spec=id=>mongoRoleSpec(id,SRC,PRIVILEGE_MATRIX[id].analytics?AN:undefined);
 it('is exactly the verified set (any change must be re-proven against the real server)',()=>{
  expect(PRIVILEGE_MATRIX.ingest.source.collections).toEqual({stats_v1_counters:['find','insert','update','listIndexes'],stats_v1_receipts:['find','insert','remove','listIndexes'],stats_v1_semantic:['find','insert','listIndexes'],stats_v1_active:['find','insert','remove','listIndexes'],stats_v1_budgets:['find','insert','update','listIndexes'],stats_v1_meta:['find','update','listIndexes']});
  expect(PRIVILEGE_MATRIX.ingest.analytics).toBeUndefined();
  expect(PRIVILEGE_MATRIX.publisher).toEqual({source:{collections:{stats_v1_counters:['find']},database:[]},analytics:{collections:{stats_v1_counters:['find','insert','remove']},database:[]}});
  expect(PRIVILEGE_MATRIX.reader).toEqual({analytics:{collections:{stats_v1_counters:['find']},database:['listCollections','dbStats']}});
 });
 it('the reader (Metabase) lives ONLY in the analytical database: no write, no DDL, no ingestion database, no technical collection',()=>{
  const r=spec('reader'),actions=r.privileges.flatMap(p=>p.actions);
  for(const a of WRITE)expect(actions).not.toContain(a);
  expect(r.privileges.every(p=>p.resource.db===AN)).toBe(true);expect(r.privileges.filter(p=>p.resource.collection!=='').map(p=>p.resource.collection)).toEqual(['stats_v1_counters']);expect(r.roles).toEqual([]);
 });
 it('the publisher reads the source counters only, and can only find/insert/remove the analytical counters (atomic replace)',()=>{
  const p=spec('publisher');expect(p.privileges.filter(x=>x.resource.db===SRC)).toEqual([{resource:{db:SRC,collection:'stats_v1_counters'},actions:['find']}]);
  expect(p.privileges.filter(x=>x.resource.db===AN)).toEqual([{resource:{db:AN,collection:'stats_v1_counters'},actions:['find','insert','remove']}]);
 });
 it('ingestion has no DDL, no broad role, no analytical database and no semantic/counters/budgets removal',()=>{
  const i=spec('ingest'),by=Object.fromEntries(i.privileges.map(p=>[p.resource.collection,p.actions]));
  for(const p of i.privileges){expect(p.resource.db).toBe(SRC);for(const a of ['createCollection','createIndex','dropCollection','dropIndex','collMod','dropDatabase','bypassDocumentValidation'])expect(p.actions).not.toContain(a);}
  expect(by.stats_v1_semantic).not.toContain('remove');expect(by.stats_v1_counters).not.toContain('remove');expect(by.stats_v1_budgets).not.toContain('remove');expect(i.roles).toEqual([]);
 });
 it('every identity names only statistics collections of the two authorized databases, never a wildcard',()=>{
  for(const id of Object.keys(PRIVILEGE_MATRIX))for(const p of spec(id).privileges){expect([SRC,AN]).toContain(p.resource.db);expect(p.resource.collection===''||/^stats_v1_(counters|receipts|semantic|active|budgets|meta)$/.test(p.resource.collection)).toBe(true);}
  for(const id of ['publisher','reader'])for(const p of spec(id).privileges)if(p.resource.db===AN)expect(['','stats_v1_counters']).toContain(p.resource.collection);
 });
 it('role specification refuses inconsistent database arguments',()=>{
  expect(()=>mongoRoleSpec('reader',SRC)).toThrow();expect(()=>mongoRoleSpec('ingest',SRC,AN)).toThrow();expect(()=>mongoRoleSpec('reader',SRC,SRC)).toThrow();expect(()=>mongoRoleSpec('reader','bad name',AN)).toThrow();
 });
 it('Atlas custom-role definitions mirror the native roles action for action',()=>{
  expect(atlasRoleSpec('reader',SRC,AN)).toEqual({roleName:'two_sides_statistics_reader_v1',inheritedRoles:[],actions:[{action:'DB_STATS',resources:[{db:AN,collection:''}]},{action:'FIND',resources:[{db:AN,collection:'stats_v1_counters'}]},{action:'LIST_COLLECTIONS',resources:[{db:AN,collection:''}]}]});
  for(const id of Object.keys(STATISTICS_IDENTITIES)){const native=spec(id),atlas=atlasRoleSpec(id,SRC,PRIVILEGE_MATRIX[id].analytics?AN:undefined);
   expect(atlas.actions.reduce((n,a)=>n+a.resources.length,0)).toBe(native.privileges.reduce((n,p)=>n+p.actions.length,0));}
 });
 it('the exact-union preflight rejects extra privileges, extra roles, a foreign user, missing privileges and unverifiable answers',()=>{
  const good=id=>({authInfo:{authenticatedUsers:[{user:STATISTICS_IDENTITIES[id].user,db:'admin'}],authenticatedUserRoles:[{role:STATISTICS_IDENTITIES[id].role,db:'admin'}],authenticatedUserPrivileges:spec(id).privileges}}),an=id=>PRIVILEGE_MATRIX[id].analytics?AN:undefined;
  for(const id of Object.keys(PRIVILEGE_MATRIX))expect(verifyEffectivePrivileges(good(id),id,SRC,an(id))).toBe(true);
  const extra=good('ingest');extra.authInfo.authenticatedUserPrivileges=[...extra.authInfo.authenticatedUserPrivileges,{resource:{db:SRC,collection:'other'},actions:['find']}];expect(()=>verifyEffectivePrivileges(extra,'ingest',SRC)).toThrow('privileges_differ');
  const wide=good('reader');wide.authInfo.authenticatedUserPrivileges=wide.authInfo.authenticatedUserPrivileges.map(p=>p.resource.collection==='stats_v1_counters'?{...p,actions:['find','update']}:p);expect(()=>verifyEffectivePrivileges(wide,'reader',SRC,AN)).toThrow('privileges_differ');
  const wrongDb=good('reader');wrongDb.authInfo.authenticatedUserPrivileges=spec('reader').privileges.map(p=>({...p,resource:{...p.resource,db:SRC}}));expect(()=>verifyEffectivePrivileges(wrongDb,'reader',SRC,AN)).toThrow('privileges_differ');
  const roles=good('reader');roles.authInfo.authenticatedUserRoles.push({role:'readWrite',db:'admin'});expect(()=>verifyEffectivePrivileges(roles,'reader',SRC,AN)).toThrow('unexpected_roles');
  const user=good('reader');user.authInfo.authenticatedUsers=[{user:'twosides_backend',db:'admin'}];expect(()=>verifyEffectivePrivileges(user,'reader',SRC,AN)).toThrow('unexpected_user');
  const missing=good('ingest');missing.authInfo.authenticatedUserPrivileges=missing.authInfo.authenticatedUserPrivileges.slice(1);expect(()=>verifyEffectivePrivileges(missing,'ingest',SRC)).toThrow('privileges_differ');
  expect(()=>verifyEffectivePrivileges({},'ingest',SRC)).toThrow('privileges_unverifiable');expect(()=>verifyEffectivePrivileges(good('ingest'),'reader',SRC,AN)).toThrow();
 });
});

describe('B86 Atlas preflight is strictly read-only',()=>{
 const readerConfig=()=>resolveStatisticsStorage({...FULL,STATISTICS_SERVICE_USER:'twosides_statistics_reader_v1'});
 it('only connects and issues hello and connectionStatus; no collection is touched; the report holds no secret',async()=>{
  const config=readerConfig(),log=[],status={authInfo:{authenticatedUsers:[{user:config.user,db:'admin'}],authenticatedUserRoles:[{role:'two_sides_statistics_reader_v1',db:'admin'}],authenticatedUserPrivileges:mongoRoleSpec('reader',config.database,config.analyticsDatabase).privileges}};
  const touch=name=>new Proxy(()=>{},{get:()=>{throw Error('collection access in preflight: '+name);},apply:()=>{throw Error('call in preflight');}});
  class Fake{constructor(uri,options){log.push(['construct',uri,Object.keys(options)]);}async connect(){log.push(['connect']);}
   db(name){return {databaseName:name,command:async c=>{log.push(['command',Object.keys(c)[0],name]);return c.hello?{isWritablePrimary:true,setName:'atlas-x',logicalSessionTimeoutMinutes:30}:c.connectionStatus?status:{};},collection:touch(name),listCollections:touch(name)};}
   startSession(){throw Error('session in preflight');}async close(){log.push(['close']);}}
  const report=await runPreparedSession({config,credentials:{username:config.user,password:PASSWORD},action:'preflight',ClientImpl:Fake});
  expect(log.filter(x=>x[0]==='command').map(x=>x[1])).toEqual(['hello','connectionStatus']);expect(log.at(-1)).toEqual(['close']);
  expect(report).toMatchObject({readOnly:true,privileges:'exact-match',authenticatedUser:'matches-identity',tls:true,authMechanism:'SCRAM-SHA-1'});
  expect(JSON.stringify(report)+JSON.stringify(log.map(x=>x.slice(0,2)))).not.toMatch(/password|twosides_statistics_reader/i);expect(JSON.stringify(report)).not.toMatch(/mongodb\.net/i);
  expect(log[0][1]).toBe('mongodb+srv://cluster0.abcde.mongodb.net/');
 });
 it('a mismatched account is refused after the two reads, with nothing else attempted',async()=>{
  const config=readerConfig(),log=[];
  class Fake{constructor(){}async connect(){}db(){return {command:async c=>{log.push(Object.keys(c)[0]);return c.hello?{isWritablePrimary:true,setName:'x',logicalSessionTimeoutMinutes:30}:{authInfo:{authenticatedUsers:[{user:config.user,db:'admin'}],authenticatedUserRoles:[{role:'readWrite',db:'admin'}],authenticatedUserPrivileges:[]}};}};}async close(){}}
  const e=await runPreparedSession({config,credentials:{username:config.user,password:PASSWORD},action:'preflight',ClientImpl:Fake}).catch(x=>x);
  expect(e.category).toBe('unexpected_roles');expect(log).toEqual(['hello','connectionStatus']);
 });
});

describe('B86 synthetic Atlas dataset and deployment plan',()=>{
 it('is small, new, valid, coherent and shares no identifier with the B84 demonstration',()=>{
  const {events}=atlasSyntheticEvents(),b84=new Set(generateDemoEvents().events.map(x=>x.event.EventId)),now=Date.parse('2026-11-05T12:00:00Z');
  expect(events.length).toBeGreaterThan(50);expect(events.length).toBeLessThan(600);expect(ATLAS_SYNTHETIC_DATASET.seed).toContain('atlas-synthetic');
  expect(events.some(x=>b84.has(x.event.EventId))).toBe(false);expect(new Set(events.map(x=>x.event.EventId)).size).toBe(events.length);
  const inst=new Set(generateDemoEvents().installationIds);expect(atlasSyntheticEvents().installationIds.some(i=>inst.has(i))).toBe(false);
  for(const x of events){const v=validateEvent({EventJson:x.canonical,PayloadHash:x.payloadHash},x.installationId,now);expect(v.error).toBeUndefined();expect(v.forbidden).toBeUndefined();}
  const t=expectedTotals(events);expect(t.gamesStarted).toBeGreaterThan(0);expect(t.gamesCompleted).toBeGreaterThan(0);expect(t.gamesCompleted).toBeLessThanOrEqual(t.gamesStarted);
  for(const b of Object.values(t.biomes)){expect(b.reject).toBe(b.healthy);expect(b.approve).toBe(b.degraded);}
  expect(t.endings.good+t.endings.medium+t.endings.bad).toBe(t.gamesCompleted);expect(Object.keys(t.biomes)).toEqual(['ocean','jungle','desert','forest','tundra']);
  expect(JSON.stringify(atlasSyntheticEvents().events.map(x=>x.canonical))).toBe(JSON.stringify(atlasSyntheticEvents().events.map(x=>x.canonical)));   // deterministic -> idempotent seeding
 });
 it('the B84 demonstration data is unchanged by the optional seed parameter',()=>{
  const g=generateDemoEvents();expect(g.events.length).toBe(2293);expect(expectedTotals(g.events)).toMatchObject({installations:30,gamesStarted:81,gamesCompleted:52,effectiveMs:36795232});
 });
 it('the deployment plan is offline, secret free, names the exact roles and marks retention as unapproved',()=>{
  const plan=deploymentPlan(),text=JSON.stringify(plan);
  expect(plan.status).toContain('Nothing has been created');expect(plan.retentionStatus).toContain('NOT approved');expect(Object.keys(plan.collections).sort()).toEqual(['stats_v1_active','stats_v1_budgets','stats_v1_counters','stats_v1_meta','stats_v1_receipts','stats_v1_semantic']);
  expect(Object.values(plan.collections).filter(c=>c.visibleToMetabase)).toHaveLength(0);expect(plan.metabaseReadsOnly).toBe('twosides_statistics_analytics_demo');expect(Object.keys(plan.analyticsCollections)).toEqual(['stats_v1_counters']);
  expect(Object.keys(plan.identities)).toEqual(['ingest','schema','publisher','reader']);expect(text).not.toMatch(/password|mongodb\+srv|0\.0\.0\.0\/0.*allow/i);
 });
});
