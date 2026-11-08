import './support/isolation-guard.js';
import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TARGET,COLLECTIONS,runReadProbe,verifyReadPermissions} from '../../tools/atlas-v2-first-read/probe.mjs';
import {decodeManifest,validateAuthorization,hash,claimOnce} from '../../tools/atlas-v2-first-read/gate.mjs';
import {entry} from '../../tools/atlas-v2-first-read/receiver.mjs';
import {MAIN_SCHEMA} from '../../src/main/schema-inventory.js';
import {classifyAtlasError} from '../../src/modules/sync/atlas-error-diagnostic.js';
import {temporaryAtlasCredential,consumeAtlasCredential,destroyAtlasCredential,receiveAtlasCredential} from '../../src/modules/sync/atlas-credentials.js';
import {restrictedStatus} from './support/restricted-status.js';
import {PassThrough} from 'node:stream';
import mongoose from 'mongoose';
const clone=structuredClone;
const cursor=rows=>({ok:1,cursor:{id:0,firstBatch:rows}});
function fixture(){
 const state={commands:[],closed:0,connects:0,reads:0,checks:0,status:restrictedStatus(),secret:'FAKE-B64-ñ-密碼-🔐-%:@/?# +\uFEFF',options:null};
 const driverOptions={srvHost:TARGET.host,dbName:TARGET.database,directConnection:false,tls:true,credentials:{username:TARGET.user,source:'admin',mechanism:'SCRAM-SHA-256'}};
 const respond=doc=>{
  if(doc.connectionStatus)return state.status;
  if(doc.hello)return {ok:1,setName:'atlas-fake-only',isWritablePrimary:true};
  if(doc.listCollections)return cursor(COLLECTIONS.map(name=>({name,type:'collection'})));
  if(doc.listIndexes){const d=Object.values(MAIN_SCHEMA.collections).find(d=>d.name===doc.listIndexes);return cursor([{name:'_id_',key:{_id:1}},...clone(d.indexes)]);}
  if(doc.find)return cursor([{revision:0}]);
  throw new Error('Unexpected command');
 };
 state.respond=respond;
 const connection={readyState:1,name:TARGET.database,getClient:()=>({options:driverOptions}),close:async()=>{state.closed++;if(state.closeError)throw state.closeError;},db:{databaseName:TARGET.database,command:async doc=>{state.commands.push(clone(doc));return state.respond(doc);}}};
 state.connection=connection;state.driverOptions=driverOptions;
 const options={config:clone(TARGET),schema:MAIN_SCHEMA,integrity:async()=>{state.checks++;return true;},readCredential:async()=>{state.reads++;return temporaryAtlasCredential(Buffer.from(state.secret));},credentials:{consume:consumeAtlasCredential,destroy:destroyAtlasCredential},classify:classifyAtlasError,
 connect:async(uri,opts)=>{state.connects++;state.uri=uri;state.options=opts;if(state.connectError)throw state.connectError;return connection;}};
 return {state,options,run:()=>runReadProbe(options)};
}
describe('B64 first-read allowlist and lifecycle (offline only)',()=>{
 it('success: 11 literal reads, seven collections, no document/history reads, closes',async()=>{
  const f=fixture(),r=await f.run();expect(r).toMatchObject({ok:true,readOnly:true,authenticationVerified:true,readPermissionsVerified:true,runtimePrivilegesVerified:true,commandsIssued:11,close:'completed'});
  expect(f.state.connects).toBe(1);expect(f.state.closed).toBe(1);expect(f.state.checks).toBe(1);
  expect(f.state.commands.map(c=>Object.keys(c)[0])).toEqual(['connectionStatus','hello','listCollections',...Array(7).fill('listIndexes'),'find']);
  expect(f.state.commands[2]).toEqual({listCollections:1,nameOnly:true,authorizedCollections:true,cursor:{batchSize:200},maxTimeMS:2000});
  expect(f.state.commands.at(-1)).toEqual({find:'main_v2_fences',filter:{_id:'ingestion-v1'},projection:{_id:0,revision:1},limit:2,batchSize:2,singleBatch:true,maxTimeMS:2000});
  expect(JSON.stringify(r)).not.toContain(f.state.secret);expect(f.state.uri).not.toContain('@');
 });
 it('no write privilege is needed for reads; does not approve application readiness',async()=>{
  const f=fixture();for(const p of f.state.status.authInfo.authenticatedUserPrivileges)p.actions=p.actions.filter(a=>!['insert','update'].includes(a));
  expect(await f.run()).toMatchObject({ok:true,readPermissionsVerified:true,runtimePrivilegesVerified:false});
 });
 it.each(['user','host','database','authSource','authMechanism','tls','extra'])('rejects configuration field %s before credential or connect',async k=>{
  const f=fixture();f.options.config[k]=k==='tls'?false:'wrong';expect(await f.run()).toMatchObject({ok:false,code:'configuration_rejected'});expect(f.state.reads).toBe(0);expect(f.state.connects).toBe(0);
 });
 it.each(['SCRAM-SHA-1','DEFAULT'])('rejects mechanism %s',async mechanism=>{const f=fixture();f.options.config.authMechanism=mechanism;expect((await f.run()).ok).toBe(false);expect(f.state.connects).toBe(0);});
 it('failed integrity never receives a credential or connects',async()=>{const f=fixture();f.options.integrity=async()=>false;expect(await f.run()).toMatchObject({ok:false,code:'integrity_rejected'});expect(f.state.reads).toBe(0);expect(f.state.connects).toBe(0);});
 it('absent credential fails before connecting',async()=>{const f=fixture();f.options.readCredential=async()=>undefined;expect((await f.run()).ok).toBe(false);expect(f.state.connects).toBe(0);});
 it('all seven missing find/listIndexes privileges rejected; no query after permissions',async()=>{
  for(let i=1;i<=7;i++)for(const action of ['find','listIndexes']){const f=fixture();f.state.status.authInfo.authenticatedUserPrivileges[i].actions=f.state.status.authInfo.authenticatedUserPrivileges[i].actions.filter(a=>a!==action);expect(await f.run()).toMatchObject({ok:false,code:'read_permissions_insufficient',commandsIssued:1,close:'completed'});}
 });
 it.each(['remove','createIndex','createCollection','dropCollection','anyAction'])('rejects extra action %s',async action=>{const f=fixture();f.state.status.authInfo.authenticatedUserPrivileges[1].actions.push(action);expect((await f.run()).ok).toBe(false);expect(f.state.commands).toHaveLength(1);});
 it.each([{db:'other',collection:'main_v2_facts'},{db:'two_sides_db',collection:'users'},{db:'two_sides_db',collection:'*'},{anyResource:true},{cluster:true}])('rejects extra resource %j',async resource=>{const f=fixture();f.state.status.authInfo.authenticatedUserPrivileges.push({resource,actions:['find']});expect((await f.run()).ok).toBe(false);});
 it('rejects old user, additional user, broad role and wrong role namespace',async()=>{
  for(const mutate of [s=>s.authInfo.authenticatedUsers[0].user='twosides_backend',s=>s.authInfo.authenticatedUsers.push({user:TARGET.user,db:'admin'}),s=>s.authInfo.authenticatedUserRoles[0].role='readWrite',s=>s.authInfo.authenticatedUserRoles[0].db='two_sides_db']){const f=fixture();mutate(f.state.status);expect((await f.run()).ok).toBe(false);expect(f.state.closed).toBe(1);}
 });
 it.each(['tlsInsecure','tlsAllowInvalidCertificates','tlsAllowInvalidHostnames'])('rejects effective TLS bypass %s',async key=>{const f=fixture();f.state.driverOptions[key]=true;expect(await f.run()).toMatchObject({ok:false,code:'connection_rejected',commandsIssued:0,close:'completed'});});
 it('rejects callback bypass and effective wrong host/db/user/mechanism',async()=>{
  for(const mutate of [o=>o.checkServerIdentity=()=>{},o=>o.srvHost='wrong.invalid',o=>o.dbName='wrong',o=>o.credentials.username='twosides_backend',o=>o.credentials.mechanism='DEFAULT']){const f=fixture();mutate(f.state.driverOptions);expect((await f.run()).ok).toBe(false);expect(f.state.commands).toHaveLength(0);}
 });
 it.each([{rows:[]},{rows:[{name:'unapproved',type:'collection'}]}])('rejects missing/unexpected catalogue %j',async({rows})=>{const f=fixture(),base=f.state.respond;f.state.respond=d=>d.listCollections?cursor(rows):base(d);expect(await f.run()).toMatchObject({ok:false,code:'catalog_rejected',commandsIssued:3});});
 it('permits known historical names only in catalogue, never opens their data',async()=>{const f=fixture(),base=f.state.respond;f.state.respond=d=>{const r=base(d);if(d.listCollections)r.cursor.firstBatch.push({name:'users',type:'collection'});return r;};expect((await f.run()).ok).toBe(true);expect(f.state.commands.filter(d=>d.find)).toHaveLength(1);});
 it.each(['missing','nonunique','extra','ttl','view','cursor','seed','secondary'])('rejects damaged metadata: %s',async kind=>{
  const f=fixture(),base=f.state.respond;f.state.respond=d=>{const r=base(d);if(d.listIndexes&&d.listIndexes==='main_v2_operations'){if(kind==='missing')r.cursor.firstBatch.pop();if(kind==='nonunique')r.cursor.firstBatch[1].unique=false;if(kind==='extra')r.cursor.firstBatch.push({name:'extra',key:{x:1}});if(kind==='ttl')r.cursor.firstBatch[1].expireAfterSeconds=0;}if(kind==='view'&&d.listCollections)r.cursor.firstBatch[0].type='view';if(kind==='cursor'&&d.listCollections)r.cursor.id=1;if(kind==='seed'&&d.find)r.cursor.firstBatch[0].revision=-1;if(kind==='secondary'&&d.hello)r.isWritablePrimary=false;return r;};
  expect((await f.run()).ok).toBe(false);expect(f.state.closed).toBe(1);
 });
 it.each([18,8000])('bad fake credential code %s is sanitized, never retried',async code=>{const f=fixture();f.state.connectError=Object.assign(new Error('bad auth : authentication failed '+f.state.secret),{name:'MongoServerError',code});const r=await f.run();expect(r).toMatchObject({ok:false,category:'AUTHENTICATION_FAILURE',technicalCode:code});expect(f.state.connects).toBe(1);expect(JSON.stringify(r)).not.toContain(f.state.secret);});
 it('authorization failure after connection closes and does not fall back',async()=>{const f=fixture();f.state.respond=()=>{throw Object.assign(new Error(f.state.secret),{code:13,name:'MongoServerError'});};expect(await f.run()).toMatchObject({ok:false,category:'AUTHORIZATION_FAILURE',technicalCode:13,close:'completed'});expect(f.state.connects).toBe(1);});
 it('sanitizer failure cannot leak error or prevent close',async()=>{const f=fixture();f.state.respond=()=>{throw new Error(f.state.secret);};f.options.classify=()=>{throw new Error(f.state.secret);};const r=await f.run();expect(r.close).toBe('completed');expect(JSON.stringify(r)).not.toContain(f.state.secret);});
 it('close failure is a failure even after successful reads',async()=>{const f=fixture();f.state.closeError=new Error(f.state.secret);expect(await f.run()).toMatchObject({ok:false,close:'failed',code:'close_failed'});});
 it('real installed driver parses exactly fixed SCRAM and strict TLS without a network call',async()=>{
  const f=fixture();await f.run();let parsed,c;
  const stop=new Error('OFFLINE-NETWORK-INTERCEPT');
  const spy=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockImplementation(function(){parsed=this.options;return Promise.reject(stop);});
  try{c=mongoose.createConnection(f.state.uri,f.state.options);c.on('error',()=>{});await expect(c.asPromise()).rejects.toBe(stop);
   expect(parsed).toMatchObject({srvHost:TARGET.host,dbName:TARGET.database,tls:true,directConnection:false,retryReads:false,retryWrites:false,maxPoolSize:1,credentials:{username:TARGET.user,source:'admin',mechanism:'SCRAM-SHA-256',password:f.state.secret}});
   expect(c.config.autoIndex).toBe(false);expect(c.config.autoCreate).toBe(false);expect(c.config.bufferCommands).toBe(false);
  }finally{if(c)await c.close();spy.mockRestore();}
 });
 it('strict framed UTF-8 preserves fake special characters, no URI encoding needed',async()=>{
  for(const text of ['FAKE:@/%?# +','\uFEFFFAKE-密碼-🔐-ñ','FAKE with trailing space ']){const s=new PassThrough(),b=Buffer.from(text),frame=Buffer.alloc(4+b.length);frame.writeUInt32BE(b.length);b.copy(frame,4);const received=receiveAtlasCredential(s);s.end(frame);expect(consumeAtlasCredential(await received)).toBe(text);}
 });
});
describe('B64 bootstrap and one-use preparation (no actual authorization issued)',()=>{
 const toolHashes=Object.fromEntries(['receiver.mjs','gate.mjs','probe.mjs','send-first-read.ps1'].map(n=>[n,'a'.repeat(64)]));
 const runId='b'.repeat(32),now=Date.parse('2026-11-04T02:00:00Z');
 const authorization=()=>({kind:'two-sides-atlas-v2-first-read-once',runId,issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+1000).toISOString(),externalReferenceVerified:true,privacyApproved:true,target:clone(TARGET),tools:clone(toolHashes)});
 it('accepts only complete, bounded owner authorization and independently supplied artifact hashes',()=>{expect(validateAuthorization(authorization(),{now,runId,toolHashes})).toBe(true);});
 it.each(['expired','future','long-window','privacy','external','hash','target','extra'])('rejects unsafe authorization: %s',kind=>{const a=authorization();if(kind==='expired')a.expiresAt=new Date(now-1).toISOString();if(kind==='future')a.issuedAt=new Date(now+1).toISOString();if(kind==='long-window')a.expiresAt=new Date(now+900001).toISOString();if(kind==='privacy')a.privacyApproved=false;if(kind==='external')a.externalReferenceVerified=false;if(kind==='hash')a.tools['probe.mjs']='0'.repeat(64);if(kind==='target')a.target.user='twosides_backend';if(kind==='extra')a.enableWrites=true;expect(()=>validateAuthorization(a,{now,runId,toolHashes})).toThrow();});
 it('receiver has no activation by default; rejects missing flags before files/stdin/driver',async()=>{expect(await entry([])).toMatchObject({ok:false});expect(await entry(['--authorized-first-read','wrong'])).toMatchObject({ok:false});});
 it('one-use claim refuses reuse and an existing result on disposable directories',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'b64-fake-claim-'));
  try{claimOnce(temp,runId);expect(()=>claimOnce(temp,runId)).toThrow();fs.unlinkSync(path.join(temp,'used.json'));fs.writeFileSync(path.join(temp,'result.json'),'{}');expect(()=>claimOnce(temp,runId)).toThrow();}
  finally{for(const n of ['used.json','result.json']){const p=path.join(temp,n);if(fs.existsSync(p))fs.unlinkSync(p);}fs.rmdirSync(temp);}
 });
 it('PowerShell template parses without execution; SecureString UTF-8 conversion preserves only fake codepoints',()=>{
  const script=fileURLToPath(new URL('../../tools/atlas-v2-first-read/send-first-read.ps1',import.meta.url));
  const command=`$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'","''")}',[ref]$tokens,[ref]$errors);if($errors.Count){exit 1};$s=New-Object Security.SecureString;$original=[char[]]@(0xfeff,0x0046,0x0041,0x004b,0x0045,0x003a,0x0025,0x00f1,0x5bc6,0xd83d,0xdd10,0x0020);foreach($ch in $original){$s.AppendChar($ch)};$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{$chars=New-Object 'char[]' $s.Length;for($i=0;$i -lt $chars.Length;$i++){$chars[$i]=[char]([Runtime.InteropServices.Marshal]::ReadInt16($ptr,2*$i) -band 0xffff)};$utf8=New-Object Text.UTF8Encoding($false,$true);$decoded=$utf8.GetChars($utf8.GetBytes($chars));if([string]::new($decoded) -cne [string]::new($original)){exit 2}}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$s.Dispose()};Write-Output 'OFFLINE_FAKE_UTF8_PASS'`;
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',timeout:15000});expect(r.status,r.stderr).toBe(0);expect(r.stdout.trim()).toBe('OFFLINE_FAKE_UTF8_PASS');
 });
 it('manifest bytes, internal digest, declared count and traversal names fail closed',()=>{
  // Entirely synthetic manifest in RAM; no original files or protected scope modified.
  const files={'src/fake.js':{size:1,sha256:'f'.repeat(64)}};
  const m={kind:'two-sides-backend-integrity',formatVersion:2,algorithm:'sha256',scope:['src','scripts','node_modules','package.json','package-lock.json','vitest.config.js'],excluded:[],fileCount:1,treeDigest:hash(`src/fake.js\0${files['src/fake.js'].sha256}\n`),files};
  const bytes=Buffer.from(JSON.stringify(m)),expected={sha256:hash(bytes),treeDigest:m.treeDigest,fileCount:1};expect(decodeManifest(bytes,expected).fileCount).toBe(1);
  expect(()=>decodeManifest(Buffer.concat([bytes,Buffer.from(' ')]),expected)).toThrow();
  for(const mutate of [v=>v.fileCount=2,v=>v.treeDigest='0'.repeat(64),v=>v.files['src/../secret']=v.files['src/fake.js'],v=>v.excluded=['src'],v=>v.scope.push('tools')]){const v=clone(m);mutate(v);const b=Buffer.from(JSON.stringify(v));expect(()=>decodeManifest(b,{...expected,sha256:hash(b)})).toThrow();}
 });
 it('receiver claims before credentials and only imports protected code after integrity; no automatic env loader',()=>{
  const source=fs.readFileSync(fileURLToPath(new URL('../../tools/atlas-v2-first-read/receiver.mjs',import.meta.url)),'utf8');
  expect(source.indexOf("await verifyBackend(manifest,ROOT)")).toBeLessThan(source.indexOf('claimOnce(here,runId)'));expect(source.indexOf('claimOnce(here,runId)')).toBeLessThan(source.indexOf('receiveAtlasCredential(process.stdin'));
  expect(source).not.toMatch(/dotenv|openMainProfile|createBackend|createModel|syncIndexes|startSession/);
  expect(source).toContain("['used.json','result.json']");
 });
});
