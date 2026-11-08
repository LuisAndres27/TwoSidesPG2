import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { createHash,randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertActivation,assertChildEnvironment,claimRun,makeRuntimeConnector,parseReceiverArgs,receiverConfig,runReceiver,
  runPaths,payloadDigest,CHILD_ENV_NAMES,RECEIVER_PHASE,RECEIVER_TARGET } from '../../scripts/c2-receiver-core.js';
import { createDurableRuntime,durableClientOptions } from '../../scripts/durable-revocation-runtime.js';
import { openAtlasIntegration } from '../../src/modules/sync/atlas-integration.js';
import { consumeAtlasCredential } from '../../src/modules/sync/atlas-credentials.js';
import { ATLAS_TARGET,ATLAS_URI,ATLAS_SCHEMA_RUN,validateAtlasConfig } from '../../src/modules/sync/atlas-policy.js';
import {openC2Integration} from '../../scripts/c2-release-integration.js';
import { writeConsumption } from './support/c2-consumption.js';

// Every credential in this file is an obvious synthetic string. No Atlas, no real secret, no protected data.
const FAKE='FAKE-SYNTHETIC-CREDENTIAL-0001';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
const LAUNCHER=here('../../scripts/c2-receiver.ps1'),ENTRY=here('../../scripts/c2-receiver-entry.js'),CORE=here('../../scripts/c2-receiver-core.js');
const NODE='C:\\Program Files\\nodejs\\node.exe';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const frame=text=>{const body=Buffer.from(text,'utf8'),out=Buffer.alloc(4+body.length);out.writeUInt32BE(body.length);body.copy(out,4);return out;};
const goodEnv=()=>({LOCALAPPDATA:'C:\\Users\\x\\AppData\\Local',NODE_ENV:'test',PATH:'C:\\Windows\\System32',SystemDrive:'C:',SystemRoot:'C:\\Windows',TEMP:'C:\\t',TMP:'C:\\t',WINDIR:'C:\\Windows'});
const dirs=[];
afterEach(()=>{vi.restoreAllMocks();for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true});
  if(!process.env.C2_FINAL_TEST_ROOT)try{fs.rmdirSync(path.join(process.env.LOCALAPPDATA,'TwoSides','C2ReceiverTests'));}catch{}});
const tmp=()=>{const d=fs.mkdtempSync(path.join(process.env.C2_FINAL_TEST_ROOT??os.tmpdir(),'c2-recv-test-'));dirs.push(d);return d;};

const activationManifest=(runId,now=Date.now(),patch={})=>({version:2,mode:'c2-remote-once',remoteEnabled:true,releaseId:'c2-'+'b'.repeat(32),payloadSha256:payloadDigest([]),target:{...RECEIVER_TARGET},
  node:{version:'24.19.0',sha256:'0'.repeat(64)},forbiddenSids:['S-1-5-21-1-2-3-4','S-1-5-21-5-6-7-8'],files:[],
  activation:{executionId:runId,runId:ATLAS_SCHEMA_RUN,scenarios:['A','B','C'],createdAtUtc:new Date(now-1000).toISOString(),expiresAtUtc:new Date(now+3600000).toISOString()},...patch});
function fixture(patch){
  const base=tmp(),release=path.join(base,'c2-'+randomBytes(16).toString('hex')),packageRoot=path.join(release,'package');
  const runId=randomBytes(16).toString('hex'),runDir=path.join(release,'runs',runId);
  fs.mkdirSync(path.join(packageRoot,'scripts'),{recursive:true});fs.mkdirSync(path.join(runDir,'temp'),{recursive:true});fs.mkdirSync(path.join(release,'temp'));
  const manifest=patch?.manifest??activationManifest(runId,Date.now(),{releaseId:path.basename(release)}),manifestSha256=sha(Buffer.from(JSON.stringify(manifest)));
  const resultPath=path.join(runDir,'result.json');writeConsumption(release,runId,manifestSha256);
  return {release,packageRoot,runId,runDir,manifest,manifestSha256,resultPath,args:{runId,result:resultPath,manifestSha256}};
}
function deps(f,over={}){
  const opened=[],integration={close:vi.fn(async()=>{})},stdin=new PassThrough();
  stdin.end(over.input??frame(FAKE));
  return {opened,integration,stdin,d:{args:f.args,env:{...goodEnv(),TEMP:path.join(f.runDir,'temp'),TMP:path.join(f.runDir,'temp')},manifest:f.manifest,manifestSha256:f.manifestSha256,packageRoot:f.packageRoot,stdin,
    openIntegration:async({config,credential})=>{opened.push({config,pass:consumeAtlasCredential(credential)});return integration;},execute:async()=>{},credentialTimeoutMs:2000,...over.d}};
}
const code=async promise=>{try{await promise;return null;}catch(e){return e?.code??'UNCODED';}};

it('RX01 the offline-only sealed manifest can never activate the receiver; stdin is not read and nothing is claimed',async()=>{
  const offline={version:1,mode:'offline-only',remoteEnabled:false,target:{...RECEIVER_TARGET},forbiddenSids:[],files:[]};
  const f=fixture({manifest:offline});const {d,stdin,opened}=deps(f);const on=vi.spyOn(stdin,'on');
  expect(await code(runReceiver(d))).toBe('ACTIVATION_REJECTED');
  expect(on).not.toHaveBeenCalled();expect(opened).toHaveLength(0);
  expect(fs.readdirSync(f.runDir)).toEqual(['temp']);
});
it('RX02 any change of target, scope, scenarios, window, version or digest rejects activation',async()=>{
  const now=Date.now(),id='a'.repeat(32),base=()=>activationManifest(id,now),h=sha(Buffer.from('x'));
  const ok=m=>assertActivation(m,{releaseId:'c2-'+'b'.repeat(32),runId:id,manifestSha256:h,expectedManifestSha256:h,now});
  expect(()=>ok(base())).not.toThrow();
  for(const patch of [{host:'evil.example.net'},{user:'twosides_backend'},{database:'two_sides_db'},{authSource:'$external'},{authMechanism:'SCRAM-SHA-1'},{tls:false}])
    expect(()=>ok({...base(),target:{...RECEIVER_TARGET,...patch}})).toThrow();
  const withActivation=p=>({...base(),activation:{...base().activation,...p}});
  for(const p of [{executionId:'b'.repeat(32)},{runId:'0'.repeat(32)},{scenarios:['A','B']},{scenarios:['A','B','C','D']},
    {expiresAtUtc:new Date(now-1).toISOString()},{expiresAtUtc:new Date(now+5*3600000).toISOString()},
    {createdAtUtc:new Date(now+50000).toISOString(),expiresAtUtc:new Date(now+40000).toISOString()},{createdAtUtc:new Date(now+3600000).toISOString()}])
    expect(()=>ok(withActivation(p))).toThrow();
  for(const m of [{...base(),version:1},{...base(),remoteEnabled:false},{...base(),mode:'offline-only'},null,[]])expect(()=>ok(m)).toThrow();
  expect(()=>assertActivation(base(),{runId:id,manifestSha256:h,expectedManifestSha256:sha(Buffer.from('y')),now})).toThrow();
});
it('RX03 there is no argument that can select another host, user, database, URI or password',()=>{
  const ok=['--run-id','a'.repeat(32),'--result','C:\\x\\result.json','--manifest-sha256','A'.repeat(64)];
  expect(parseReceiverArgs(ok)).toMatchObject({runId:'a'.repeat(32)});
  for(const extra of [['--host','x'],['--user','twosides_backend'],['--database','two_sides_db'],['--uri','mongodb://x'],['--password','p'],['--auth-source','x'],['--package-root','C:\\x']])
    expect(()=>parseReceiverArgs([...ok,...extra])).toThrow();
  expect(()=>parseReceiverArgs(['--run-id','a'.repeat(32),'--run-id','a'.repeat(32),'--result','r','--manifest-sha256','A'.repeat(64)])).toThrow();
  expect(()=>parseReceiverArgs(['--run-id','xyz','--result','r','--manifest-sha256','A'.repeat(64)])).toThrow();
  expect(()=>parseReceiverArgs(['--run-id','a'.repeat(32),'--result','r','--manifest-sha256','a'.repeat(64)])).toThrow();
  expect(()=>parseReceiverArgs(ok.slice(0,4))).toThrow();
  const f=fixture();expect(()=>runPaths(f.packageRoot,f.runId,path.join(f.release,'elsewhere.json'))).toThrow();
  expect(()=>runPaths(path.join(f.release,'pkg'),f.runId,f.resultPath)).toThrow();
});
it('RX04 the child environment must be exactly the eight launcher variables; anything else is rejected',()=>{
  expect(()=>assertChildEnvironment(goodEnv())).not.toThrow();
  expect(()=>assertChildEnvironment({...goodEnv(),systemroot:undefined,SYSTEMROOT:'C:\\Windows'})).toThrow();
  for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED','NAPI_RS_ENFORCE_VERSION_CHECK',
    'NAPI_RS_NATIVE_LIBRARY_PATH','NAPI_RS_FORCE_WASI','MONGODB_LOG_PATH','MONGODB_LOG_ALL','OIDC_TOKEN_FILE','DOTENV_CONFIG_PATH','NPM_CONFIG_USERCONFIG',
    'LD_PRELOAD','DYLD_INSERT_LIBRARIES','HTTPS_PROXY','FOO'])
    expect(()=>assertChildEnvironment({...goodEnv(),[name]:'1'}),name).toThrow();
  const missing=goodEnv();delete missing.WINDIR;expect(()=>assertChildEnvironment(missing)).toThrow();
  expect(()=>assertChildEnvironment({...goodEnv(),NODE_ENV:'production'})).toThrow();
  expect(()=>assertChildEnvironment({...goodEnv(),TMP:'C:\\other'})).toThrow();
  expect(()=>assertChildEnvironment(null)).toThrow();
  expect(CHILD_ENV_NAMES).toHaveLength(8);
});
it('RX05 a complete synthetic run uses the fixed target, passes the fake credential once, and writes a fixed-schema result',async()=>{
  const f=fixture();const {d,opened,integration}=deps(f);
  const result=await runReceiver(d);
  expect(result).toMatchObject({status:'passed',code:'OK',atlasConnected:true,cleanup:'skipped',resourcesClosed:true,runId:f.runId});
  expect(opened).toHaveLength(1);expect(opened[0].pass).toBe(FAKE);
  expect(opened[0].config).toMatchObject({uri:ATLAS_URI,host:ATLAS_TARGET.host,database:ATLAS_TARGET.database,user:ATLAS_TARGET.user,runId:ATLAS_SCHEMA_RUN,
    authMechanism:'DEFAULT',tls:true,persistenceTest:RECEIVER_PHASE});
  expect(ATLAS_URI).not.toMatch(/@/);expect(integration.close).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fs.readFileSync(f.resultPath,'utf8'))).toEqual(result);
  expect(Object.keys(result).sort()).toEqual(['atlasConnected','cleanup','code','mode','resourcesClosed','runId','status','uncertain','version']);
  expect(fs.existsSync(path.join(f.runDir,'receiver-attempt.started'))).toBe(true);
});
it('RX06 reuse is rejected, including a second run with a consumed marker or an existing result, without touching the saved result',async()=>{
  const f=fixture();const first=deps(f);await runReceiver(first.d);
  const saved=fs.readFileSync(f.resultPath,'utf8');
  const second=deps(f);const on=vi.spyOn(second.stdin,'on');
  expect(await code(runReceiver(second.d))).toBe('REUSE_REJECTED');
  expect(on).not.toHaveBeenCalled();expect(second.opened).toHaveLength(0);expect(fs.readFileSync(f.resultPath,'utf8')).toBe(saved);
  const g=fixture();fs.writeFileSync(path.join(g.runDir,'receiver-attempt.started'),'');
  expect(await code(runReceiver(deps(g).d))).toBe('REUSE_REJECTED');
  const h=fixture();fs.rmSync(h.runDir,{recursive:true});expect(()=>claimRun(fs,runPaths(h.packageRoot,h.runId,h.resultPath))).toThrow();
});
it('RX07 a missing, empty, truncated, oversized, malformed or late credential is rejected before any connector call',async()=>{
  const bad=[Buffer.alloc(0),Buffer.from([0,0,0,0]),Buffer.from([0,0,0,9,65]),frame('x'.repeat(1025)),frame('abc\ndef'),frame('abc\rdef'),frame('abc\0def'),
    Buffer.concat([Buffer.from([0,0,0,2]),Buffer.from([0xc3,0x28])]),Buffer.concat([frame(FAKE),Buffer.from([1])])];
  for(const input of bad){
    const f=fixture();const {d,opened}=deps(f,{input});
    expect(await code(runReceiver(d)),'frame').toBeNull();
    const saved=JSON.parse(fs.readFileSync(f.resultPath,'utf8'));
    expect(saved).toMatchObject({status:'rejected',code:'CREDENTIAL_REQUIRED',atlasConnected:false});expect(opened).toHaveLength(0);
  }
  const f=fixture(),stdin=new PassThrough(),opened=[];
  const r=await runReceiver({...deps(f).d,stdin,credentialTimeoutMs:50,openIntegration:async()=>{opened.push(1);}});
  expect(r).toMatchObject({code:'CREDENTIAL_REQUIRED'});expect(opened).toHaveLength(0);
});
it('RX08 the fake credential never appears in results, errors, console or process output, and the handle is destroyed',async()=>{
  const spies=['log','info','warn','error','debug'].map(n=>vi.spyOn(console,n)),out=vi.spyOn(process.stdout,'write'),err=vi.spyOn(process.stderr,'write');
  let handle;const artifacts=[];
  for(const scenario of ['ok','execute-fails','open-fails','late-close-fails']){
    const f=fixture();const {d,integration}=deps(f);
    if(scenario==='execute-fails')d.execute=async()=>{throw new Error('boom '+FAKE);};
    if(scenario==='open-fails')d.openIntegration=async({credential})=>{handle=credential;throw new Error('refused '+FAKE);};
    if(scenario==='late-close-fails')integration.close=vi.fn(async()=>{throw new Error('close '+FAKE);});
    const r=await runReceiver(d);artifacts.push(JSON.stringify(r),fs.readFileSync(f.resultPath,'utf8'),fs.readdirSync(f.runDir).join(','));
  }
  for(const text of artifacts)expect(text).not.toContain(FAKE);
  expect(spies.every(s=>s.mock.calls.length===0)).toBe(true);expect(out).not.toHaveBeenCalled();expect(err).not.toHaveBeenCalled();
  expect(()=>consumeAtlasCredential(handle)).toThrow();
});
it('RX09 the fixed C.2 capability is valid but opening without an activation permit is rejected before connecting',async()=>{
  expect(()=>validateAtlasConfig(receiverConfig())).not.toThrow();
  const f=fixture();let handle;const connector=vi.fn();
  const r=await runReceiver({...deps(f).d,openIntegration:({config,credential})=>{handle=credential;return openC2Integration({config,credential,createConnection:connector});}});
  expect(r).toMatchObject({status:'rejected',code:'CONNECTION_REJECTED',atlasConnected:false});
  expect(connector).not.toHaveBeenCalled();expect(()=>consumeAtlasCredential(handle)).toThrow();
});
const fakeConnection=options=>{
  const native={options:{...options,srvHost:ATLAS_TARGET.host,credentials:{username:ATLAS_TARGET.user,source:'admin',mechanism:'DEFAULT'}}};
  return {name:ATLAS_TARGET.database,readyState:1,db:{databaseName:ATLAS_TARGET.database},getClient:()=>native,
    async close(){this.readyState=0;},async startSession(){return {async withTransaction(work){return work();},async endSession(){}};}};
};
it('RX10 the runtime connector fixes every option except the password and enforces client and session limits',async()=>{
  const runtime=createDurableRuntime(),seen=[];
  const connector=makeRuntimeConnector(runtime,async(uri,options)=>{seen.push({uri,options});return fakeConnection(options);});
  expect(()=>makeRuntimeConnector(runtime,null)(ATLAS_URI,{pass:FAKE})).toThrow();
  expect(()=>connector('mongodb+srv://other.example.net/two_sides_db',{pass:FAKE})).toThrow();
  expect(()=>connector(ATLAS_URI,{})).toThrow();
  const first=await connector(ATLAS_URI,{pass:FAKE,retryWrites:true,maxPoolSize:99,appName:'x'});
  expect(seen[0].uri).toBe(ATLAS_URI);
  expect(seen[0].options).toMatchObject({...durableClientOptions,pass:FAKE,maxPoolSize:2,maxConnecting:1,retryWrites:false,timeoutMS:10000});
  expect(seen[0].options.appName).toBeUndefined();
  const a=await first.startSession(),b=await first.startSession();
  await expect(first.startSession()).rejects.toMatchObject({code:'SESSION_LIMIT'});
  await a.endSession().catch(()=>{});await b.endSession().catch(()=>{});
  const state=await runtime.finish();expect(state).toMatchObject({stopped:true,reason:"SESSION_LIMIT"});
  const second=createDurableRuntime(),again=makeRuntimeConnector(second,async(u,o)=>fakeConnection(o));
  await again(ATLAS_URI,{pass:FAKE});await again(ATLAS_URI,{pass:FAKE});await again(ATLAS_URI,{pass:FAKE});
  await expect(again(ATLAS_URI,{pass:FAKE})).rejects.toMatchObject({code:'CLIENT_LIMIT'});
  await second.finish();
});
it('RX11 an uncertain commit blocks cleanup and is reported, never retried',async()=>{
  const f=fixture(),runtime=createDurableRuntime(),cleanup=vi.fn(),execute=vi.fn(async()=>{
    await runtime.io(async()=>{throw Object.assign(new Error('x'),{hasErrorLabel:l=>l==='UnknownTransactionCommitResult'});},{transaction:true,write:true}).catch(()=>{});
  });
  const {d,integration}=deps(f);
  const r=await runReceiver({...d,runtime,execute,cleanup});
  expect(r).toMatchObject({status:'rejected',code:'COMMIT_UNCERTAIN',uncertain:true,cleanup:'blocked'});
  expect(cleanup).not.toHaveBeenCalled();expect(execute).toHaveBeenCalledTimes(1);expect(integration.close).toHaveBeenCalledTimes(1);
});
it('RX12 a pending write blocks cleanup; a clean run performs it exactly once',async()=>{
  const f=fixture(),runtime=createDurableRuntime(),cleanup=vi.fn();
  const {d}=deps(f);
  const r=await runReceiver({...d,runtime,cleanup,execute:async()=>{void runtime.io(()=>new Promise(()=>{}),{write:true}).catch(()=>{});}});
  expect(r).toMatchObject({status:'rejected',code:'COMMIT_UNCERTAIN',uncertain:true,cleanup:'blocked'});expect(cleanup).not.toHaveBeenCalled();
  const g=fixture(),clean=vi.fn(async()=>{}),run2=createDurableRuntime();
  const ok=await runReceiver({...deps(g).d,runtime:run2,cleanup:clean,execute:async()=>{}});
  expect(ok).toMatchObject({status:'passed',cleanup:'done',resourcesClosed:true});expect(clean).toHaveBeenCalledTimes(1);
  const h=fixture(),failing=await runReceiver({...deps(h).d,runtime:createDurableRuntime(),cleanup:async()=>{throw new Error('x');},execute:async()=>{}});
  expect(failing).toMatchObject({status:'rejected',code:'CLEANUP_BLOCKED'});
});
it('RX13 the temporal supervisor stops a stalled execution and closes resources',async()=>{
  const f=fixture(),runtime=createDurableRuntime({totalMs:60,shutdownMs:5}),started=Date.now();
  const r=await runReceiver({...deps(f).d,runtime,execute:async()=>{await runtime.wait(()=>new Promise(resolve=>setTimeout(resolve,1000)));}});
  expect(r).toMatchObject({status:'rejected',code:'EXECUTION_FAILED',resourcesClosed:true});expect(Date.now()-started).toBeLessThan(800);
});
it('RX14 shutdown is orderly on every outcome: integration closed once, runtime finished once, a failed close is reported',async()=>{
  for(const scenario of ['ok','execute-fails']){
    const f=fixture(),real=createDurableRuntime(),finish=vi.fn(()=>real.finish()),runtime={snapshot:()=>real.snapshot(),finish};
    const {d,integration}=deps(f);if(scenario==='execute-fails')d.execute=async()=>{throw new Error('x');};
    await runReceiver({...d,runtime});expect(integration.close).toHaveBeenCalledTimes(1);expect(finish).toHaveBeenCalledTimes(1);
  }
  const f=fixture(),{d,integration}=deps(f);integration.close=vi.fn(async()=>{throw new Error('x');});
  expect(await runReceiver(d)).toMatchObject({status:'rejected',code:'CLOSE_FAILED',resourcesClosed:false});
});
it('RX15 the receiver sources have no console/process output, no environment reads in the core and no secret-handling shortcuts',()=>{
  const core=fs.readFileSync(CORE,'utf8'),entry=fs.readFileSync(ENTRY,'utf8'),ps=fs.readFileSync(LAUNCHER,'utf8');
  for(const text of [core,entry]){expect(text).not.toMatch(/console\.|process\.stdout|process\.stderr|process\.argv\.slice\(2\)\.join/);}
  expect(core).not.toMatch(/process\.env/);expect(core).not.toMatch(/child_process|net'|tls'|http|fetch\(/);
  expect(entry).not.toMatch(/mongoose|createConnection|dotenv/i);expect((entry.match(/process\.env/g)??[]).length).toBe(1);
  for(const banned of ['Read-Host','SecureString','Out-File','Set-Content','Add-Content','Export-','Start-Transcript','Write-Output $frame'])expect(ps).not.toContain(banned);
  expect(ps).toMatch(/\[Array\]::Clear\(\$chars/);expect(ps).toMatch(/IsInputRedirected/);
});
it('RX16 the real entrypoint refuses in this state: exit 1, no output, no files, with and without a hostile environment',()=>{
  const before=fs.readdirSync(path.dirname(ENTRY)).sort().join();
  for(const extra of [{},{NODE_OPTIONS:'--max-old-space-size=64'},{MONGODB_LOG_PATH:'stderr'}]){
    const env={...goodEnv(),...extra,SystemRoot:process.env.SystemRoot,TEMP:os.tmpdir(),TMP:os.tmpdir()};
    const run=spawnSync(NODE,[ENTRY,'--run-id','a'.repeat(32),'--result','C:\\none\\result.json','--manifest-sha256','A'.repeat(64)],{env,input:frame(FAKE),encoding:'utf8',timeout:30000});
    expect(run.status).toBe(1);expect(run.stdout).toBe('');expect(run.stderr).toBe('');
  }
  expect(fs.readdirSync(path.dirname(ENTRY)).sort().join()).toBe(before);
});
const sealed=process.env.TWOSIDES_C2_OFFLINE_ROOT;
it.skipIf(!sealed)('RX17 the actual sealed manifest (read only) cannot activate the receiver',()=>{
  const bytes=fs.readFileSync(path.join(sealed,'manifest.json')),manifest=JSON.parse(bytes.toString('utf8'));
  expect(manifest).toMatchObject({mode:'offline-only',remoteEnabled:false});
  expect(()=>assertActivation(manifest,{runId:'a'.repeat(32),manifestSha256:sha(bytes),expectedManifestSha256:sha(bytes),now:Date.now()})).toThrow();
});

// ---- PowerShell launcher (dot-sourced: only functions are defined; no real runtime is touched) ----
const BLOCKED=/^(NODE_(OPTIONS|PATH|COMPILE_CACHE|DEBUG|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED)|NAPI_RS_|LD_|DYLD_|MONGO|DOTENV|NPM_CONFIG_|OPENSSL_|SSL_CERT|HTTPS?_PROXY|ALL_PROXY)/i;
function ps(script){
  const dir=tmp(),file=path.join(dir,'t.ps1');fs.writeFileSync(file,'$ErrorActionPreference=\'Stop\'\n. \''+LAUNCHER+'\'\n'+script,'utf8');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!BLOCKED.test(k)&&k.toUpperCase()!=='NODE_ENV'));
  return spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{env,encoding:'utf8',timeout:120000});
}
const keyScript=tokens=>{
  const file=path.join(tmp(),'keys.json');fs.writeFileSync(file,JSON.stringify(tokens));
  return `$tokens=Get-Content -LiteralPath '${file}' -Raw -Encoding UTF8 | ConvertFrom-Json
$q=New-Object System.Collections.Generic.Queue[object]
foreach($t in $tokens){ if($t -is [ValueType]){ $q.Enqueue([pscustomobject]@{Key=[ConsoleKey]::A;KeyChar=[char][int]$t}) } else { $q.Enqueue([pscustomobject]@{Key=[ConsoleKey]$t.special;KeyChar=[char]0}) } }
$source={ $script:q.Dequeue() }
`;
};
const typed=text=>text.split('').map(c=>c.charCodeAt(0));
const hexOf=buffer=>buffer.toString('hex');
it('RX18 hidden input builds the exact length-prefixed UTF-8 frame, honours Backspace, ignores control keys and handles non-BMP characters',()=>{
  const text=FAKE+'ñ\ud83d\ude00';
  const tokens=[...typed('XY'),{special:'Backspace'},{special:'Backspace'},...typed(FAKE+'Z'),{special:'Backspace'},...typed('ñ\ud83d\ude00'),{special:'Tab'},{special:'Enter'}];
  const run=ps(keyScript(tokens)+`$f=Read-C2HiddenCredential $source
($f|ForEach-Object{$_.ToString('x2')}) -join ''`);
  expect(run.status,run.stderr).toBe(0);expect(run.stdout.trim()).toBe(hexOf(frame(text)));
},60000);
it('RX19 hidden input rejects cancellation, too-short and too-long entries',()=>{
  const cases=[[[...typed('abc'),{special:'Enter'}],'input'],[[...typed('abcdefgh'),{special:'Escape'}],'input'],[[...typed('x'.repeat(257)),{special:'Enter'}],'input'],[[{special:'Enter'}],'input']];
  const script=cases.map(([tokens,stage],i)=>keyScript(tokens)+`try{ $null=Read-C2HiddenCredential $source; 'case${i}=accepted' }catch{ 'case${i}='+$_.Exception.Message }\n`).join('');
  const run=ps(script);expect(run.status,run.stderr).toBe(0);
  for(let i=0;i<cases.length;i++)expect(run.stdout).toContain(`case${i}=C2_RECEIVER_REJECTED:input`);
});
it('RX20 the launcher rejects dangerous parent variables without printing their values',()=>{
  const names=['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NAPI_RS_ENFORCE_VERSION_CHECK','NAPI_RS_NATIVE_LIBRARY_PATH','MONGODB_LOG_PATH','DOTENV_CONFIG_PATH','NPM_CONFIG_USERCONFIG','NODE_EXTRA_CA_CERTS'];
  const script=`foreach($n in @(${names.map(n=>`'${n}'`).join(',')})){ Set-Item -Path "Env:$n" -Value 'SENTINEL-VALUE'; try{ Assert-C2Environment; "$n=accepted" }catch{ "$n="+$_.Exception.Message }; Remove-Item -Path "Env:$n" }
$env:NODE_ENV='production'; try{ Assert-C2Environment; 'NODE_ENV=accepted' }catch{ 'NODE_ENV='+$_.Exception.Message }; Remove-Item Env:NODE_ENV
try{ Assert-C2Environment; 'clean=accepted' }catch{ 'clean=rejected' }`;
  const run=ps(script);expect(run.status,run.stderr).toBe(0);
  for(const n of [...names,'NODE_ENV'])expect(run.stdout).toContain(`${n}=C2_RECEIVER_REJECTED:env`);
  expect(run.stdout).toContain('clean=accepted');expect(run.stdout).not.toContain('SENTINEL-VALUE');
});
function psRelease(manifestOf){
  // A directory whose inherited DACL is clean (the user Temp folder carries an extra explicit Modify entry, which the launcher correctly rejects).
  const root=process.env.C2_FINAL_TEST_ROOT??path.join(process.env.LOCALAPPDATA,'TwoSides','C2ReceiverTests');fs.mkdirSync(root,{recursive:true});
  const base=fs.mkdtempSync(path.join(root,'t-'));dirs.push(base);const release=path.join(base,'c2-'+randomBytes(16).toString('hex')),runId=randomBytes(16).toString('hex');
  fs.mkdirSync(path.join(release,'package','scripts'),{recursive:true});fs.mkdirSync(path.join(release,'runs'));fs.mkdirSync(path.join(release,'temp'));
  return {base,release,runId,manifestOf};
}
function seal(r,manifest){manifest.releaseId=path.basename(r.release);manifest.payloadSha256=payloadDigest(manifest.files);const text=JSON.stringify(manifest);fs.writeFileSync(path.join(r.release,'manifest.json'),text);return sha(Buffer.from(text));}
it('RX21 the launcher refuses every gate failure before it asks for the secret or creates a run',()=>{
  const now=Date.now(),cases=[];
  const mk=(name,build,digest)=>{const r=psRelease();const m=build(r.runId);const h=seal(r,m);cases.push({name,r,digest:digest?digest(h):h});};
  mk('offline',()=>({version:1,mode:'offline-only',remoteEnabled:false,target:{...RECEIVER_TARGET},forbiddenSids:[],files:[]}));
  mk('digest',id=>activationManifest(id,now),h=>(h[0]==='A'?'B':'A')+h.slice(1));
  mk('disabled',id=>activationManifest(id,now,{remoteEnabled:false}));
  mk('host',id=>activationManifest(id,now,{target:{...RECEIVER_TARGET,host:'evil.example.net'}}));
  mk('user',id=>activationManifest(id,now,{target:{...RECEIVER_TARGET,user:'twosides_backend'}}));
  mk('database',id=>activationManifest(id,now,{target:{...RECEIVER_TARGET,database:'two_sides_db'}}));
  mk('execution',id=>activationManifest('f'.repeat(32),now));
  mk('expired',id=>{const m=activationManifest(id,now);m.activation.expiresAtUtc=new Date(now-1000).toISOString();m.activation.createdAtUtc=new Date(now-2000).toISOString();return m;});
  mk('window',id=>{const m=activationManifest(id,now);m.activation.expiresAtUtc=new Date(now+9*3600000).toISOString();return m;});
  const script=cases.map(c=>`$script:asked=$false
try{ Invoke-C2Receiver -Root '${c.r.release}' -ExpectedBase '${c.r.base}' -ManifestSha256 '${c.digest}' -RunId '${c.r.runId}' -KeySource { $script:asked=$true; [pscustomobject]@{Key=[ConsoleKey]::Enter;KeyChar=[char]13} } | Out-Null; '${c.name}=accepted' }catch{ '${c.name}='+$_.Exception.Message+' asked='+$script:asked }
`).join('');
  const run=ps(script);expect(run.status,run.stderr).toBe(0);
  const expected={offline:'activation',digest:'hash',disabled:'activation',host:'activation',user:'activation',database:'activation',execution:'activation',expired:'activation',window:'activation'};
  for(const c of cases){expect(run.stdout).toContain(`${c.name}=C2_RECEIVER_REJECTED:${expected[c.name]} asked=False`);expect(fs.readdirSync(path.join(c.r.release,'runs'))).toEqual([]);}
});
it('RX22 a complete synthetic release: hidden fake credential reaches the child only through stdin, the child sees the eight allowed variables, reuse is rejected',()=>{
  const r=psRelease(),entry=path.join(r.release,'package','scripts','c2-receiver-entry.js');
  fs.writeFileSync(entry,`import fs from 'node:fs';
const chunks=[];for await(const c of process.stdin)chunks.push(c);const b=Buffer.concat(chunks);const a=process.argv.slice(2);
const recorded=JSON.stringify({version:1,mode:'c2-remote-once',runId:a[1],status:'passed',code:'OK',frameOk:b.readUInt32BE(0)===b.length-4,bytes:b.length-4,
  env:Object.keys(process.env).sort(),argc:a.length,hasSecretInArgs:a.join(' ').includes(${JSON.stringify(FAKE)}),hasSecretInEnv:Object.values(process.env).join(' ').includes(${JSON.stringify(FAKE)})});
fs.writeFileSync(a[3],recorded+'\\n',{flag:'wx'});
`);
  fs.writeFileSync(path.join(r.release,'package','package.json'),'{"private":true,"type":"module"}\n');
  const files=['scripts/c2-receiver-entry.js','package.json'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(r.release,'package',...p.split('/'))))}));
  const m=activationManifest(r.runId,Date.now(),{files,node:{version:'24.19.0',sha256:sha(fs.readFileSync(NODE))}});
  const digest=seal(r,m),tokens=[...typed(FAKE),{special:'Enter'}];
  const script=keyScript(tokens)+`$count=0
$src={ $script:q.Dequeue() }
try{ $o=Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${digest}' -RunId '${r.runId}' -KeySource $src; 'first='+$o.Status }catch{ 'first='+$_.Exception.Message }
try{ Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${digest}' -RunId '${r.runId}' -KeySource { $script:count++; [pscustomobject]@{Key=[ConsoleKey]::Enter;KeyChar=[char]13} } | Out-Null; 'second=accepted' }catch{ 'second='+$_.Exception.Message+' asked='+$script:count }
`;
  const run=ps(script);expect(run.status,run.stderr).toBe(0);
  expect(run.stdout).toContain('first=passed');expect(run.stdout).toContain('second=C2_RECEIVER_REJECTED:reuse asked=0');
  const result=JSON.parse(fs.readFileSync(path.join(r.release,'runs',r.runId,'result.json'),'utf8'));
  expect(result).toMatchObject({status:'passed',frameOk:true,bytes:Buffer.byteLength(FAKE),argc:6,hasSecretInArgs:false,hasSecretInEnv:false});
  expect(result.env.map(n=>n.toUpperCase()).sort()).toEqual([...CHILD_ENV_NAMES].sort());
  const leaked=[];const scan=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())scan(p);else if(p!==entry&&fs.readFileSync(p).includes(FAKE))leaked.push(p);}};
  scan(r.release);expect(leaked).toEqual([]);expect(run.stdout).not.toContain(FAKE);expect(run.stderr).not.toContain(FAKE);
});
it('RX23 a modified, extra or missing package file is rejected after the gate and before the secret is requested',()=>{
  const build=()=>{
    const r=psRelease(),entry=path.join(r.release,'package','scripts','c2-receiver-entry.js'),pkg=path.join(r.release,'package','package.json');
    fs.writeFileSync(entry,'export default 1;\n');fs.writeFileSync(pkg,'{"private":true,"type":"module"}\n');
    const files=[['scripts/c2-receiver-entry.js',entry],['package.json',pkg]].map(([p,f])=>({path:p,sha256:sha(fs.readFileSync(f))}));
    const digest=seal(r,activationManifest(r.runId,Date.now(),{files,node:{version:'24.19.0',sha256:sha(fs.readFileSync(NODE))}}));
    return {r,entry,pkg,digest};
  };
  const cases=[['modified',c=>fs.appendFileSync(c.entry,'// tamper\n')],['extra',c=>fs.writeFileSync(path.join(c.r.release,'package','extra.js'),'1')],
    ['missing',c=>fs.rmSync(c.pkg)],['nested-extra',c=>{fs.mkdirSync(path.join(c.r.release,'package','node_modules'));fs.writeFileSync(path.join(c.r.release,'package','node_modules','x.js'),'1');}]];
  const built=cases.map(([name,tamper])=>{const c=build();tamper(c);return {name,c};});
  const script=built.map(({name,c})=>`$script:asked=$false
try{ Invoke-C2Receiver -Root '${c.r.release}' -ExpectedBase '${c.r.base}' -ManifestSha256 '${c.digest}' -RunId '${c.r.runId}' -KeySource { $script:asked=$true; [pscustomobject]@{Key=[ConsoleKey]::Enter;KeyChar=[char]13} } | Out-Null; '${name}=accepted' }catch{ '${name}='+$_.Exception.Message+' asked='+$script:asked }
`).join('');
  const run=ps(script);expect(run.status,run.stderr).toBe(0);
  for(const {name,c} of built){expect(run.stdout).toContain(`${name}=C2_RECEIVER_REJECTED:inventory asked=False`);expect(fs.readdirSync(path.join(c.r.release,'runs'))).toEqual([]);}
},60000);
