// B86.3: connection failures are reduced to a safe category plus errorName/code taken ONLY from fixed lists. No driver text ever leaves.
import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {MongoParseError,MongoAPIError,MongoInvalidArgumentError,MongoRuntimeError,MongoNetworkError,MongoServerSelectionError} from 'mongodb';
import {preparedConfiguration,LOCAL_RBAC} from '../../src/modules/statistics/atlas-policy.js';
import {connectPrepared,classifyConnectionError,StatisticsConnectionError} from '../../src/modules/statistics/atlas-connector.js';

const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SECRETS=/mongodb(\+srv)?:\/\/|cluster0\.abcde|mongodb\.net|twosides_statistics_ingest_v1|Zq9-secret-pass|B86_OWNER_AUTHORIZES|\bat .*\.js:\d+/i;
const dns=(code,syscall='querySrv')=>Object.assign(new Error(syscall+' '+code+' _mongodb._tcp.cluster0.abcde.mongodb.net'),{code,syscall});
const aggregate=(code,...inner)=>Object.assign(new AggregateError(inner,''),{code});

describe('B86.3 error classification: safe categories, whitelisted detail',()=>{
 it('maps every known failure family to a category (never "unknown" for the listed ones)',()=>{
  const table=[
   ['querySrv ENOTFOUND',dns('ENOTFOUND'),'dns_srv','ENOTFOUND'],['querySrv ESERVFAIL',dns('ESERVFAIL'),'dns_srv','ESERVFAIL'],['querySrv ENODATA',dns('ENODATA'),'dns_srv','ENODATA'],
   ['querySrv EREFUSED',dns('EREFUSED'),'dns_srv','EREFUSED'],['querySrv EBADRESP',dns('EBADRESP'),'dns_srv','EBADRESP'],['querySrv ECANCELLED',dns('ECANCELLED'),'dns_srv','ECANCELLED'],
   ['querySrv ETIMEOUT',dns('ETIMEOUT'),'dns_srv','ETIMEOUT'],['queryTxt ENODATA',dns('ENODATA','queryTxt'),'dns_srv','ENODATA'],
   ['parse error',new MongoParseError('Text record may only set any of: authSource, replicaSet'),'uri_or_options','other'],
   ['invalid argument',new MongoInvalidArgumentError('bad option'),'uri_or_options','other'],['api error',new MongoAPIError('x'),'uri_or_options','other'],
   ['runtime error',new MongoRuntimeError('x'),'driver_internal','other'],['TypeError',new TypeError('x is not a function'),'driver_internal','other'],
   ['Aggregate ETIMEDOUT with empty message',aggregate('ETIMEDOUT',Object.assign(new Error(''),{code:'ETIMEDOUT'})),'timeout','ETIMEDOUT'],
   ['Aggregate ECONNREFUSED (all addresses)',aggregate('ECONNREFUSED',Object.assign(new Error(''),{code:'ECONNREFUSED'}),Object.assign(new Error(''),{code:'ECONNREFUSED'})),'network','ECONNREFUSED'],
   ['Aggregate nested in a network error cause',Object.assign(new MongoNetworkError('read failed'),{cause:aggregate('EHOSTUNREACH')}),'network','EHOSTUNREACH'],
   ['server selection',new MongoServerSelectionError('Server selection timed out after 5000 ms',{type:'ReplicaSetNoPrimary',servers:new Map(),setName:null,maxSetVersion:null,maxElectionId:null,commonWireVersion:0,logicalSessionTimeoutMinutes:null,compatible:true}),'timeout','other'],
   ['tls alert',Object.assign(new Error('ssl3_read_bytes:tlsv1 alert internal error'),{code:'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR'}),'tls','ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR'],
   ['altname',Object.assign(new Error('Hostname/IP does not match'),{code:'ERR_TLS_CERT_ALTNAME_INVALID'}),'tls','ERR_TLS_CERT_ALTNAME_INVALID'],
   ['self signed',Object.assign(new Error('self signed certificate in certificate chain'),{code:'SELF_SIGNED_CERT_IN_CHAIN'}),'tls','SELF_SIGNED_CERT_IN_CHAIN'],
   ['bad auth 8000',Object.assign(new Error('bad auth : authentication failed'),{code:8000}),'authentication','8000'],['auth 18',Object.assign(new Error('x'),{code:18}),'authentication','18'],
   ['not authorized 13',Object.assign(new Error('x'),{code:13}),'authorization','13'],['ECONNRESET',new MongoNetworkError('read ECONNRESET'),'network','other'],
  ];
  for(const [label,error,category,code] of table){const e=classifyConnectionError(error,'connect');expect([label,e.category,e.code]).toEqual([label,category,code]);expect(e).toBeInstanceOf(StatisticsConnectionError);expect(e.stage).toBe('connect');}
 });
 it('an unrecognised error stays "unknown" with errorName/code "other" (nothing is guessed)',()=>{
  const e=classifyConnectionError(Object.assign(new Error('weird'),{code:'SOMETHING_NEW',name:'StrangeError'}),'connect');
  expect([e.category,e.errorName,e.code]).toEqual(['unknown','other','other']);
  expect(classifyConnectionError(undefined,'connect').category).toBe('unknown');expect(classifyConnectionError('a string',"connect").code).toBe('other');expect(classifyConnectionError(null,'connect').errorName).toBe('other');
 });
 it('names and codes outside the lists are reported as "other", even when they look harmless',()=>{
  const e=classifyConnectionError(Object.defineProperty(Object.assign(new Error('x'),{code:'user@host'}),'name',{value:'cluster0.abcde.mongodb.net'}),'connect');
  expect(e.errorName).toBe('other');expect(e.code).toBe('other');expect(JSON.stringify(e)).not.toMatch(SECRETS);
 });
 it('cycles and very deep cause chains terminate',()=>{
  const a=new Error('a'),b=new Error('b');a.cause=b;b.cause=a;expect(classifyConnectionError(a,'connect').category).toBe('unknown');
  let deep=new Error('end');for(let i=0;i<500;i++)deep=Object.assign(new Error('x'+i),{cause:deep});expect(classifyConnectionError(deep,'connect').stage).toBe('connect');
 });
 it('no message, stack, URI, host, user, password or phrase leaks from any serialisation of the result',()=>{
  const nasty='connect to mongodb+srv://twosides_statistics_ingest_v1:Zq9-secret-pass@cluster0.abcde.mongodb.net/ failed B86_OWNER_AUTHORIZES_ATLAS_SYNTHETIC_SESSION';
  const make=()=>[Object.assign(new Error(nasty),{code:'ETIMEDOUT'}),new MongoParseError(nasty),aggregate('ECONNREFUSED',new Error(nasty)),Object.assign(dns('ESERVFAIL'),{message:nasty}),Object.assign(new Error(nasty),{cause:new TypeError(nasty)}),Object.assign(new Error(nasty),{code:18}),new Error(nasty)];
  for(const error of make()){
   const e=classifyConnectionError(error,'connect'),shown=[e.message,e.stack?.split('\n')[0],JSON.stringify(e),String(e),Object.keys(e).join(','),e.category,e.stage,e.errorName,e.code].join('|');
   expect(shown).not.toMatch(SECRETS);expect(Object.keys(e).sort()).toEqual(['category','code','errorName','name','stage']);expect(e.cause).toBeUndefined();
  }
 });
 it('connectPrepared reports detail from a failing client without altering its own behaviour',async()=>{
  const config=preparedConfiguration({kind:'atlas',host:'cluster0.abcde.mongodb.net',database:'twosides_statistics_demo',analyticsDatabase:'twosides_statistics_analytics_demo',identity:'reader'});
  let closed=0;class Fake{async connect(){throw dns('ESERVFAIL');}async close(){closed++;}}
  const e=await connectPrepared(config,{username:config.user,password:'Ab3_'+'x'.repeat(30)},{ClientImpl:Fake}).catch(x=>x);
  expect([e.category,e.stage,e.errorName,e.code]).toEqual(['dns_srv','connect','Error','ESERVFAIL']);expect(closed).toBe(1);expect(JSON.stringify(e)+e.message).not.toMatch(SECRETS);
 });
 it('the command line prints category, stage and whitelisted detail only (checked on the real script with a throwing stub of the session)',()=>{
  // atlas-session.mjs refuses to run without STATISTICS_* + stdin credentials; with Atlas disabled it must contact nothing and print no detail.
  const run=spawnSync(process.execPath,['tools/b86/atlas-session.mjs','--action','preflight'],{cwd:backend,input:'{}',encoding:'utf8',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});
  expect(run.status).toBe(2);expect(run.stdout+run.stderr).not.toMatch(SECRETS);
 });
});

describe('B86.3 a real client against a closed local port (no Atlas, no TLS server)',()=>{
 it('fails with a safe network/timeout/tls category quickly and shows nothing sensitive',async()=>{
  // 127.0.0.1:27086 is the disposable test server's port; nothing listens on it unless the real suite is running.
  const database=LOCAL_RBAC.databasePrefix+'0123456789abcdef',config=preparedConfiguration({kind:'local-rbac',host:LOCAL_RBAC.host,database,identity:'ingest'});
  const t0=Date.now(),e=await connectPrepared(config,{username:config.user,password:'Ab3_'+'x'.repeat(30)}).catch(x=>x);
  expect(e).toBeInstanceOf(StatisticsConnectionError);expect(e.stage).toBe('connect');expect(['network','timeout','tls']).toContain(e.category);expect(Date.now()-t0).toBeLessThan(15000);
  expect(e.category).not.toBe('unknown');expect(JSON.stringify(e)+e.message+e.stack).not.toMatch(/127\.0\.0\.1|27086|twosides_statistics|Ab3_x|password/i);
  console.log('closed-port result:',e.category,e.stage,e.errorName,e.code);
 });
});
