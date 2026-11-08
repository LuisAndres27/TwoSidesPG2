import {restrictedStatus} from './support/restricted-status.js';
import './support/isolation-guard.js';
import {afterEach,expect,it,vi} from 'vitest';
import {generateKeyPair,SignJWT} from 'jose';
import {randomUUID,randomBytes} from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {integrationDouble,fakeMongoose} from './support/integration-double.js';
import {vectors,batch,clone} from './support/fixture.js';
import {openMainProfile,MAIN_ACTIVATION} from '../../src/main/profile.js';
import {MAIN_CONFIG,MAIN_TARGET} from '../../src/main/policy.js';
import {MAIN_JWT,INTEGRATION_JWT} from '../../src/config/jwt.js';
import {readMainEnvironment} from '../../src/config/env.js';
import {validateAtlasConfig} from '../../src/modules/sync/atlas-policy.js';
import {temporaryAtlasCredential} from '../../src/modules/sync/atlas-credentials.js';
import {createBackend} from '../../src/composition/backend.js';
import {startMainBackend,loadMainSigningKey} from '../../src/main/runtime.js';
import {mainConnector} from '../../src/config/database.js';

const running=[];
afterEach(async()=>{for(const h of running.splice(0))await h.close().catch(()=>{});vi.restoreAllMocks();vi.unstubAllEnvs();});
function double(){
  const db=integrationDouble(),c=db.connection;
  c.name=MAIN_TARGET.database;c.db.databaseName=MAIN_TARGET.database;
  db.clientOptions={srvHost:MAIN_TARGET.host,dbName:MAIN_TARGET.database,directConnection:false,tls:true,credentials:{username:MAIN_TARGET.user,source:'admin',mechanism:'SCRAM-SHA-256'}};
  db.status=restrictedStatus();
  db.remote=new Set(['operations','facts','fences','identities','ownerGuards','identitySessions','revocations'].map(k=>'main_v2_'+k));
  for(const m of Object.values(db.models)){const indexes=m.collection.indexes;m.collection.indexes=async()=>[{name:'_id_',key:{_id:1}},...await indexes()];}
  db.connector=async(uri,options)=>{c.readyState=1;db.connects++;db.optionsSeen.push(options);expect(uri).toBe(MAIN_CONFIG.uri);return c;};
  return db;
}
const cred=()=>temporaryAtlasCredential(Buffer.from('FAKE-MAIN-PASSWORD-ONLY'));
const open=(db,extra={})=>openMainProfile({activation:MAIN_ACTIVATION,credential:cred(),connector:db.connector,...extra});
let keys;const jwt=async()=>({...MAIN_JWT,...await(keys??=generateKeyPair('RS256',{modulusLength:2048})),algorithm:'RS256',keyId:'main-offline-persistent-key'});
async function stack(db=double()){
  const bundle=await open(db),config=await jwt(),backend=createBackend({profile:'main',main:bundle,jwtConfig:config});running.push(backend);
  const {port}=await backend.start();
  const call=async(path,{body,token,method=body?'POST':'GET'}={})=>{
    const r=await fetch('http://127.0.0.1:'+port+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    return{status:r.status,json:await r.json()};
  };
  const login=async(account,secret,binding)=>call('/api/v2/technical/sessions',{body:{schemaVersion:2,technicalAccountId:account,credential:secret,installationId:binding.installationId,localPlayerId:binding.localPlayerId}});
  const player=async(binding)=>{const secret=randomBytes(32).toString('base64url'),reg=await call('/api/v2/technical/registrations',{body:{schemaVersion:2,registrationId:randomUUID(),credential:secret,...binding}});expect(reg.status).toBe(201);const account=reg.json.technicalAccountId;const session=await login(account,secret,binding);expect(session.status).toBe(200);return{account,secret,binding,token:session.json.accessToken};};
  return{db,bundle,backend,call,player,login,config};
}
const A={installationId:vectors.installationId,localPlayerId:vectors.localPlayerId,bindingGeneration:1};
it('MP01 main is explicit and separated: no bundle, test profile, injected target or integration config can activate it',async()=>{
  const db=double();await expect(open(db,{activation:undefined})).rejects.toMatchObject({code:'main_not_activated'});expect(db.connects).toBe(0);
  for(const extra of [{host:'other.invalid'},{database:'two_sides_integration_test'},{user:'twosides_integration_test'},{config:MAIN_CONFIG}])await expect(open(db,extra)).rejects.toThrow();
  expect(()=>validateAtlasConfig(MAIN_CONFIG)).toThrow();expect(()=>createBackend({profile:'main',jwtConfig:{}})).toThrow();
  expect(()=>readMainEnvironment({})).toThrow();expect(()=>readMainEnvironment({TWOSIDES_PROFILE:'main',MAIN_ENABLE:'false'})).toThrow();
  const env={TWOSIDES_PROFILE:'main',MAIN_ENABLE:'true',MAIN_JWT_PRIVATE_KEY_FILE:'C:\\private\\signing.pem',MAIN_JWT_KEY_ID:'main-key'};
  Object.defineProperty(env,'MONGODB_URI',{get(){throw Error('Must not access legacy URI');}});
  expect(readMainEnvironment(env).port).toBe(3000);
});
it('MP02 main pins its user, TLS, SCRAM, permissions and pre-existing schema; failures close without provisioning',async()=>{
  for(const mutate of [d=>{d.clientOptions.credentials.username='twosides_integration_test';},d=>{d.clientOptions.tls=false;},d=>{d.clientOptions.credentials.source='two_sides_db';},d=>{d.status.authInfo.authenticatedUserRoles[0].db='two_sides_integration_test';},d=>d.remote.clear(),d=>{d.rows.fences=[];}]){
    const db=double();mutate(db);await expect(open(db)).rejects.toThrow();expect(db.closed).toBe(1);expect(db.created).toEqual([]);expect(db.indexed).toEqual([]);expect(db.rows.identities).toHaveLength(0);
  }
});
it('MP03 main runs under NODE_ENV=production with real repository contracts, main JWT and owner isolation on doubles',async()=>{
  vi.stubEnv('NODE_ENV','production');const s=await stack(),a=await s.player(A),b=await s.player({installationId:randomUUID(),localPlayerId:randomUUID(),bindingGeneration:1});
  expect(s.bundle.ingestionRepository.synthetic).toBe(false);expect(s.db.optionsSeen[0]).toMatchObject({user:'twosides_backend_v2',authMechanism:'SCRAM-SHA-256',autoIndex:false,autoCreate:false});
  expect((await s.call('/api/v2/players/'+a.account,{token:b.token})).status).toBe(403);
  expect((await s.call('/api/v2/sync/batches',{body:batch([vectors.operations[0]]),token:b.token})).status).toBe(403);
  const wrong=await new SignJWT({role:'player',ver:2}).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:s.config.keyId}).setIssuer(INTEGRATION_JWT.issuer).setAudience(INTEGRATION_JWT.audience).setSubject(a.account).setIssuedAt().setExpirationTime('15m').sign(s.config.privateKey);
  expect((await s.call('/api/v2/technical/me',{token:wrong})).status).toBe(401);
});
it('MP04 C# operation vectors persist with transactions, duplicate receipts and owner-scoped receipt lookup',async()=>{
  const s=await stack(),a=await s.player(A);
  const first=await s.call('/api/v2/sync/batches',{body:batch(vectors.operations),token:a.token});expect(first.status).toBe(200);
  const second=await s.call('/api/v2/sync/batches',{body:batch(vectors.operations),token:a.token});expect(second.status).toBe(200);expect(second.json.results.every(r=>r.status==='duplicate')).toBe(true);
  expect(second.json.results.map(r=>r.receipt)).toEqual(first.json.results.map(r=>r.receipt));expect(s.db.rows.operations).toHaveLength(vectors.operations.length);
  const op=vectors.operations[0],r=await s.call('/api/v2/sync/receipts/query',{token:a.token,body:{schemaVersion:2,attempts:[{operationId:op.operationId,payloadHash:op.payloadHash,leaseId:randomUUID(),attempt:1}]}});
  expect(r.status).toBe(200);expect(r.json.results[0].status).toBe('found');expect(s.db.options.writeConcern.w).toBe('majority');
});
it('MP05 rollback and unknown commit remain retryable without duplicate data or false acknowledgements',async()=>{
  const s=await stack(),a=await s.player(A),body=batch([clone(vectors.operations[0])]);
  s.db.failure='rollback';expect((await s.call('/api/v2/sync/batches',{body,token:a.token})).status).toBe(503);expect(s.db.rows.operations).toHaveLength(0);
  s.db.failure='unknown';expect((await s.call('/api/v2/sync/batches',{body,token:a.token})).status).toBe(503);
  expect((await s.call('/api/v2/sync/batches',{body,token:a.token})).status).toBe(200);expect(s.db.rows.operations).toHaveLength(1);
});
it('MP06 reopening with persisted store and signing key preserves identity and receipts; shutdown is idempotent',async()=>{
  const db=double(),first=await stack(db),a=await first.player(A);const sent=await first.call('/api/v2/sync/batches',{body:batch([vectors.operations[0]]),token:a.token});expect(sent.status).toBe(200);
  const closed=await first.backend.close();expect(closed.resourceErrors).toBe(0);await first.backend.close();expect(db.closed).toBe(1);
  const second=await stack(db),session=await second.login(a.account,a.secret,a.binding);expect(session.status).toBe(200);expect(db.rows.identities).toHaveLength(1);
  const retry=await second.call('/api/v2/sync/batches',{body:batch([vectors.operations[0]]),token:session.json.accessToken});expect(retry.status).toBe(200);expect(retry.json.results[0].receipt).toEqual(sent.json.results[0].receipt);
});
it('MP07 runtime requires explicit providers and main signing realm before receiving a database credential',async()=>{
  const connector=vi.fn(),credentialProvider=vi.fn();
  await expect(startMainBackend()).rejects.toMatchObject({code:'main_not_enabled'});
  await expect(startMainBackend({config:{profile:'main',port:0},connector,credentialProvider,signingKeyProvider:async()=>({...await jwt(),...INTEGRATION_JWT})})).rejects.toMatchObject({code:'main_signing_key_rejected'});
  expect(connector).not.toHaveBeenCalled();expect(credentialProvider).not.toHaveBeenCalled();
  await expect(loadMainSigningKey('relative.pem','test')).rejects.toThrow();
  await expect(loadMainSigningKey(fileURLToPath(new URL('../../../fake-key.pem',import.meta.url)),'test')).rejects.toMatchObject({code:'main_signing_key_rejected'});
  await expect(loadMainSigningKey(new URL('../../.env',import.meta.url).pathname,'test')).rejects.toThrow();
});
it('MP08 configured runtime composes main and closes its database, while a failed schema never starts HTTP',async()=>{
  const db=double();const backend=await startMainBackend({config:{profile:'main',port:0},credentialProvider:async()=>cred(),signingKeyProvider:jwt,connector:db.connector});running.push(backend);
  expect(backend.profile).toBe('main');expect((await backend.close()).resourceErrors).toBe(0);expect(db.closed).toBe(1);
  expect(()=>createBackend({profile:'main',main:{...db},jwtConfig:{}})).toThrow();
  const missing=double();missing.remote.clear();
  await expect(startMainBackend({config:{profile:'main',port:0},credentialProvider:async()=>cred(),signingKeyProvider:jwt,connector:missing.connector})).rejects.toMatchObject({code:'main_schema_not_ready'});
  expect(missing.closed).toBe(1);
});
it('MP09 the main native adapter rejects TLS bypass before connect and sanitizes driver failures',async()=>{
  const db=double(),mongoose=fakeMongoose(db),connector=mainConnector(mongoose);
  const bundle=await openMainProfile({activation:MAIN_ACTIVATION,credential:cred(),connector});running.push(bundle);
  const options=db.optionsSeen[0];expect(options.socketTimeoutMS).toBe(10000);
  const before=db.connects;
  for(const patch of [{tlsAllowInvalidCertificates:true},{tlsAllowInvalidHostnames:true},{authMechanism:'DEFAULT'},{authMechanism:'SCRAM-SHA-1'},{authMechanism:'PLAIN'},{authMechanism:'MONGODB-X509'},{authMechanism:'default'},{authMechanismProperties:{}},{user:'twosides_integration_test'}])await expect(connector(MAIN_CONFIG.uri,{...options,...patch})).rejects.toMatchObject({code:'main_configuration_rejected'});
  expect(db.connects).toBe(before);
  const failing=double();await expect(openMainProfile({activation:MAIN_ACTIVATION,credential:cred(),connector:mainConnector(fakeMongoose(failing,{rejectWith:new Error('FAKE-PRIVATE-DRIVER-TEXT')}))})).rejects.toMatchObject({code:'main_connection_unavailable'});
  expect(failing.closed).toBe(1);
});
