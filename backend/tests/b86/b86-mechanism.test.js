// B86.5: Atlas mode uses exactly SCRAM-SHA-1 (verified in TwoSidesCluster only); the local test server keeps SCRAM-SHA-256 and cannot be degraded.
import {describe,it,expect} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {MongoServerError} from 'mongodb';
import {resolveStatisticsStorage,preparedConfiguration,assertPreparedDriverTarget,AUTH_MECHANISM_BY_KIND,ATLAS_AUTHORIZATION_PHRASE,STATISTICS_IDENTITIES,LOCAL_RBAC} from '../../src/modules/statistics/atlas-policy.js';
import {buildClientOptions,createStatisticsClient,classifyConnectionError,StatisticsConnectionError} from '../../src/modules/statistics/atlas-connector.js';
import {deploymentPlan} from '../../tools/b86/deployment-plan.mjs';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const HOST='cluster0.abcde.mongodb.net',PASSWORD='Ab3_'+'x'.repeat(30),IDENTITIES=Object.keys(STATISTICS_IDENTITIES);
const DB='twosides_statistics_demo',AN='twosides_statistics_analytics_demo';
const atlas=identity=>preparedConfiguration({kind:'atlas',host:HOST,database:DB,analyticsDatabase:['schema','publisher','reader'].includes(identity)?AN:undefined,identity});
const local=identity=>preparedConfiguration({kind:'local-rbac',host:LOCAL_RBAC.host,database:LOCAL_RBAC.databasePrefix+'0123456789abcdef',analyticsDatabase:['schema','publisher','reader'].includes(identity)?LOCAL_RBAC.databasePrefix+'fedcba9876543210':undefined,identity});
const creds=config=>({username:config.user,password:PASSWORD});
const ENV=identity=>({STATISTICS_ENABLE:'true',STATISTICS_STORAGE:'atlas-test',STATISTICS_ATLAS_AUTHORIZATION:ATLAS_AUTHORIZATION_PHRASE,STATISTICS_ATLAS_HOST:HOST,STATISTICS_DATABASE:DB,STATISTICS_ANALYTICS_DATABASE:AN,STATISTICS_POLICY_VERSION:'b82-run-hybrid-v1',STATISTICS_SERVICE_USER:STATISTICS_IDENTITIES[identity].user});

describe('B86.5 Atlas mode uses exactly SCRAM-SHA-1',()=>{
 it('the table is exactly Atlas = SCRAM-SHA-1, local = SCRAM-SHA-256, and it is frozen',()=>{
  expect(AUTH_MECHANISM_BY_KIND).toEqual({atlas:'SCRAM-SHA-1','local-rbac':'SCRAM-SHA-256'});expect(Object.isFrozen(AUTH_MECHANISM_BY_KIND)).toBe(true);
  expect(()=>{AUTH_MECHANISM_BY_KIND.atlas='SCRAM-SHA-256';}).toThrow();
 });
 it('every Atlas identity: configuration, driver options and the constructed client say SCRAM-SHA-1 with authSource admin and TLS on',()=>{
  for(const identity of IDENTITIES){
   const fromEnv=resolveStatisticsStorage(ENV(identity)),config=atlas(identity);
   for(const c of [fromEnv,config]){
    expect(c.authMechanism).toBe('SCRAM-SHA-1');const options=buildClientOptions(c,creds(c));
    expect(options).toMatchObject({authMechanism:'SCRAM-SHA-1',authSource:'admin',tls:true,retryWrites:false,retryReads:false});
    const client=createStatisticsClient(c,creds(c));   // constructed, never connected
    expect([client.options.credentials.mechanism,client.options.credentials.source,client.options.tls,client.options.srvHost]).toEqual(['SCRAM-SHA-1','admin',true,HOST]);
    expect(client.options.tlsAllowInvalidCertificates).toBeFalsy();expect(client.options.tlsAllowInvalidHostnames).toBeFalsy();expect(client.options.tlsInsecure).toBeFalsy();
   }
  }
 });
 it('the mechanism cannot be chosen from the environment or from arguments in Atlas mode',()=>{
  const env={...ENV('reader'),STATISTICS_AUTH_MECHANISM:'SCRAM-SHA-256',STATISTICS_ATLAS_AUTH_MECHANISM:'SCRAM-SHA-256',AUTH_MECHANISM:'SCRAM-SHA-256'};
  expect(resolveStatisticsStorage(env).authMechanism).toBe('SCRAM-SHA-1');
  const forged=preparedConfiguration({kind:'atlas',host:HOST,database:DB,analyticsDatabase:AN,identity:'reader',authMechanism:'SCRAM-SHA-256'});expect(forged.authMechanism).toBe('SCRAM-SHA-1');
 });
 it('a prepared Atlas handle is accepted only with SCRAM-SHA-1; SCRAM-SHA-256 or anything else is rejected',()=>{
  const config=atlas('ingest'),db={databaseName:config.database,collection(){}};
  const handle=mechanism=>({options:{srvHost:config.host,tls:true,retryWrites:false,credentials:{username:config.user,mechanism,source:'admin'}}});
  expect(assertPreparedDriverTarget(handle('SCRAM-SHA-1'),db,config)).toBe(config);
  for(const wrong of ['SCRAM-SHA-256','PLAIN','MONGODB-X509','DEFAULT',undefined])expect(()=>assertPreparedDriverTarget(handle(wrong),db,config)).toThrow();
 });
 it('the deployment plan and the generated specification record SCRAM-SHA-1 for Atlas (and say it is verified only in TwoSidesCluster)',()=>{
  const plan=deploymentPlan(),file=JSON.parse(fs.readFileSync(path.join(backend,'docs/B86_ATLAS_ROLES_Y_ESQUEMA.json'),'utf8'));
  for(const spec of [plan,file])for(const identity of IDENTITIES){expect(spec.identities[identity].authentication).toBe('SCRAM-SHA-1');expect(spec.identities[identity].authenticationNote).toMatch(/TwoSidesCluster only/);}
  expect(file).toEqual(JSON.parse(JSON.stringify(plan)));   // the committed specification is exactly the generated one
 });
});

describe('B86.5 the local test server keeps SCRAM-SHA-256 and cannot be degraded',()=>{
 it('every local identity: SCRAM-SHA-256 in the configuration, in the options and in the constructed client',()=>{
  for(const identity of IDENTITIES){
   const config=local(identity);expect(config.authMechanism).toBe('SCRAM-SHA-256');
   expect(buildClientOptions(config,creds(config))).toMatchObject({authMechanism:'SCRAM-SHA-256',authSource:'admin',tls:true});
   const client=createStatisticsClient(config,creds(config),{tlsCAFile:undefined});expect(client.options.credentials.mechanism).toBe('SCRAM-SHA-256');expect(client.options.tls).toBe(true);
  }
 });
 it('the prepared configuration is frozen and its mechanism cannot be rewritten',()=>{
  const config=local('ingest');expect(Object.isFrozen(config)).toBe(true);
  expect(()=>{config.authMechanism='SCRAM-SHA-1';}).toThrow();expect(config.authMechanism).toBe('SCRAM-SHA-256');
 });
 it('a copied or hand-built configuration with SCRAM-SHA-1 is refused by the connector (it is not a prepared one)',()=>{
  const config=local('ingest');
  for(const forged of [{...config,authMechanism:'SCRAM-SHA-1'},Object.assign(Object.create(Object.getPrototypeOf(config)),config,{authMechanism:'SCRAM-SHA-1'})])
   expect(()=>buildClientOptions(forged,creds(config))).toThrow();
 });
 it('the mechanism cannot be passed in to weaken a local configuration',()=>{
  const database=LOCAL_RBAC.databasePrefix+'0123456789abcdef',forged=preparedConfiguration({kind:'local-rbac',host:LOCAL_RBAC.host,database,identity:'ingest',authMechanism:'SCRAM-SHA-1'});
  expect(forged.authMechanism).toBe('SCRAM-SHA-256');
 });
 it('a local driver handle is accepted only with SCRAM-SHA-256; SCRAM-SHA-1 is refused',()=>{
  const config=local('ingest'),db={databaseName:config.database,collection(){}};
  const handle=mechanism=>({options:{directConnection:true,replicaSet:config.replicaSet,hosts:[{host:config.host,port:config.port}],tls:true,retryWrites:false,credentials:{username:config.user,mechanism,source:'admin'}}});
  expect(assertPreparedDriverTarget(handle('SCRAM-SHA-256'),db,config)).toBe(config);
  for(const wrong of ['SCRAM-SHA-1','PLAIN','DEFAULT',undefined])expect(()=>assertPreparedDriverTarget(handle(wrong),db,config)).toThrow();
 });
 it('the connector refuses a mechanism that does not match the kind, even from a prepared-looking object',()=>{
  const config=atlas('reader'),mismatch=new Proxy(config,{get:(t,k)=>k==='authMechanism'?'SCRAM-SHA-256':t[k]});
  let error;try{buildClientOptions(mismatch,creds(config));}catch(e){error=e;}
  expect(error).toBeDefined();   // a proxy is not the prepared object, and a prepared one with a wrong mechanism is also rejected below
  const local1=local('reader');const bad=Object.freeze({...local1});expect(()=>buildClientOptions(bad,creds(local1))).toThrow();
  expect(StatisticsConnectionError).toBeDefined();
 });
});

describe('B86.5 code 8000 in the connect stage is "authentication"',()=>{
 const serverError=(code,codeName,errmsg='x')=>new MongoServerError({ok:0,code,codeName,errmsg});
 it('MongoServerError 8000 (AtlasError) at connect is authentication whatever its message',()=>{
  for(const errmsg of ['bad auth : authentication failed','x','something else entirely','']){
   const e=classifyConnectionError(serverError(8000,'AtlasError',errmsg),'connect');expect([e.category,e.stage,e.errorName,e.code]).toEqual(['authentication','connect','MongoServerError','8000']);
  }
 });
 it('code 18 at connect remains authentication; 8000 outside the connect stage is not promoted',()=>{
  expect(classifyConnectionError(serverError(18,'AuthenticationFailed'),'connect').category).toBe('authentication');
  expect(classifyConnectionError(serverError(8000,'AtlasError'),'topology').category).not.toBe('authentication');
  expect(classifyConnectionError(Object.assign(new Error('x'),{code:8000}),'connect').category).toBe('unknown');   // a non-server error with that number is not guessed
 });
 it('a nested server error with 8000 in the cause chain is also found, and nothing leaks',()=>{
  const e=classifyConnectionError(Object.assign(new Error('wrapper mongodb+srv://user:pw@cluster0.abcde.mongodb.net'),{cause:serverError(8000,'AtlasError','bad auth for user twosides_statistics_reader_v1')}),'connect');
  expect(e.category).toBe('authentication');expect(JSON.stringify(e)+e.message).not.toMatch(/mongodb\+srv|abcde|twosides_statistics|pw/);
 });
});
