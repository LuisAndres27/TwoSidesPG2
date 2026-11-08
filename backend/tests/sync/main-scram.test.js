import './support/isolation-guard.js';
import {expect,it} from 'vitest';
import {MongoClient} from 'mongodb';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MAIN_CONFIG,MAIN_TARGET,MAIN_AUTH_MECHANISM,assertMainConnection} from '../../src/main/policy.js';
import {MAIN_AUTH_MECHANISM as ADMIN_MECHANISM,negotiatedScram} from '../../src/main/administrative-policy.js';
import {mainConnector} from '../../src/config/database.js';
import {readMainEnvironment} from '../../src/config/env.js';
import {INTEGRATION_PROFILE_CONFIG,validateAtlasConfig} from '../../src/modules/sync/atlas-policy.js';
it('MS01 explicit SHA-256 never negotiates down even when the REAL driver sees a SHA-1-only advertisement',()=>{
  const c=new MongoClient(MAIN_CONFIG.uri,{auth:{username:MAIN_TARGET.user,password:'FAKE'},authSource:'admin',authMechanism:MAIN_AUTH_MECHANISM}).options.credentials;
  for(const hello of [{},{saslSupportedMechs:['SCRAM-SHA-1']},{saslSupportedMechs:[]}])expect(c.resolveAuthMechanism(hello).mechanism).toBe('SCRAM-SHA-256');
});
it('MS02 REAL Mongoose/driver options preserve synthetic Unicode credentials and strict TLS without any network',()=>{
  const probe=fileURLToPath(new URL('./support/main-auth-config-probe.mjs',import.meta.url));
  for(const fake of ['FAKE-plain',' FAKE-@:$%/?# ','FAKE-ñ-😀','\uFEFFFAKE','FAKE-\\-é']){
    const r=spawnSync(process.execPath,['--import','./tests/jwt/env-guard.js',probe,fake],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',timeout:20000});
    expect(r.status,r.stderr).toBe(0);const output=JSON.parse(r.stdout),seen=output.seen;
    expect(output.failure).toEqual({code:'main_connection_unavailable'});
    expect(seen).toMatchObject({username:'twosides_backend_v2',source:'admin',mechanism:'SCRAM-SHA-256',passwordEquals:true,tls:true,urlHasCredentials:false,urlHasPassword:false,tlsInsecure:false,tlsAllowInvalidCertificates:false,tlsAllowInvalidHostnames:false});
    expect(r.stdout+r.stderr).not.toContain(fake);
  }
});
it('MS03 incompatible mechanisms, old identity, extra properties and TLS bypass fail before connect',async()=>{
  let connects=0;const connector=mainConnector({createConnection(){connects++;throw Error('must not connect');}});
  const good={user:MAIN_TARGET.user,dbName:MAIN_TARGET.database,authSource:'admin',authMechanism:MAIN_AUTH_MECHANISM,tls:true,tlsAllowInvalidCertificates:false,tlsAllowInvalidHostnames:false,autoIndex:false,autoCreate:false};
  for(const patch of [...['DEFAULT','SCRAM-SHA-1','PLAIN','MONGODB-X509','MONGODB-AWS','GSSAPI','MONGODB-OIDC','MONGODB-CR','default','',null,undefined].map(authMechanism=>({authMechanism})),{authMechanismProperties:{}},{user:'twosides_backend'},{user:'twosides_integration_test'},{tls:false},{tlsAllowInvalidHostnames:true},{tlsAllowInvalidCertificates:true},{rejectUnauthorized:false},{checkServerIdentity:()=>{}},{authSource:'two_sides_db'},{authSource:'$external'},{dbName:'two_sides_integration_test'},{autoCreate:true},{autoIndex:true}])
    await expect(connector(MAIN_CONFIG.uri,{...good,...patch})).rejects.toMatchObject({code:'main_configuration_rejected'});
  for(const uri of ['mongodb://127.0.0.1/two_sides_db','mongodb+srv://other.mongodb.net/two_sides_db',MAIN_CONFIG.uri.replace('two_sides_db','two_sides_integration_test')])await expect(connector(uri,good)).rejects.toMatchObject({code:'main_configuration_rejected'});
  expect(connects).toBe(0);
});
it('MS07 historical inspection may still report its legacy negotiation without changing runtime policy',()=>{
 expect(negotiatedScram(['SCRAM-SHA-1'])).toBe('SCRAM-SHA-1');expect(negotiatedScram(['SCRAM-SHA-256','SCRAM-SHA-1'])).toBe('SCRAM-SHA-256');expect(negotiatedScram(null)).toBe('unknown');expect(MAIN_AUTH_MECHANISM).toBe('SCRAM-SHA-256');
});
it('MS08 SHA-1-only advertisement cannot be mistaken for successful authentication in the candidate',()=>{
 const c=new MongoClient(MAIN_CONFIG.uri,{auth:{username:MAIN_TARGET.user,password:'FAKE'},authMechanism:'SCRAM-SHA-256'}).options.credentials;
 expect(c.resolveAuthMechanism({saslSupportedMechs:['SCRAM-SHA-1']}).mechanism).toBe('SCRAM-SHA-256');expect(MAIN_TARGET.user).not.toBe('twosides_backend');
});
it('MS04 post-connection identity and TLS still fail closed',()=>{
  const options={srvHost:MAIN_TARGET.host,dbName:MAIN_TARGET.database,directConnection:false,tls:true,credentials:{username:MAIN_TARGET.user,source:'admin',mechanism:MAIN_AUTH_MECHANISM}};
  const connection=o=>({readyState:1,name:MAIN_TARGET.database,db:{databaseName:MAIN_TARGET.database},getClient:()=>({options:o})});
  expect(()=>assertMainConnection(connection(options))).not.toThrow();
  for(const o of [{...options,tlsInsecure:true},{...options,tlsAllowInvalidCertificates:true},{...options,credentials:{...options.credentials,mechanism:'DEFAULT'}},{...options,credentials:{...options.credentials,username:'twosides_backend'}}])expect(()=>assertMainConnection(connection(o))).toThrow();
});
it('MS05 integration remains a separate SHA-256 target, and historical administration cannot configure runtime',()=>{
  expect(INTEGRATION_PROFILE_CONFIG.authMechanism).toBe('SCRAM-SHA-256');expect(()=>validateAtlasConfig(MAIN_CONFIG)).toThrow();expect(ADMIN_MECHANISM).toBe('DEFAULT');expect(MAIN_AUTH_MECHANISM).toBe('SCRAM-SHA-256');
});
it('MS06 process config cannot override the pinned account, mechanism or destination',()=>{
  const env={TWOSIDES_PROFILE:'main',MAIN_ENABLE:'true',MAIN_JWT_PRIVATE_KEY_FILE:'C:\\private\\fake.pem',MAIN_JWT_KEY_ID:'fake'};
  expect(readMainEnvironment({...env,MAIN_AUTH_MECHANISM:'DEFAULT',MAIN_DATABASE:'evil',MONGODB_URI:'not-used'})).toEqual(readMainEnvironment(env));
});
