import './support/isolation-guard.js';
import { afterEach,expect,it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough,Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { createHash,randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertActivation,assertExecutionPermit,issueExecutionPermit,payloadDigest,runReceiver,parseReceiverArgs,consumptionRecordPath,RECEIVER_TARGET,MAX_ACTIVATION_MS } from '../../scripts/c2-receiver-core.js';
import { prepareDurableAtlasPlan } from '../../scripts/durable-revocation-atlas-harness.js';
import { ATLAS_SCHEMA_RUN } from '../../src/modules/sync/atlas-policy.js';
import { writeConsumption } from './support/c2-consumption.js';

// Single-use activation mechanism: every case uses an obviously fictitious credential, disposable copies and no network.
// No valid remote manifest is ever written to, or derived from, the sealed release.
const FAKE='FAKE-SYNTHETIC-CREDENTIAL-0001';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
const LAUNCHER=here('../../scripts/c2-receiver.ps1');
const NODE='C:\\Program Files\\nodejs\\node.exe';
const SEALED=path.join(process.env.LOCALAPPDATA??'','TwoSides','C2Runtime','c2-22fa685aef680f59de7e52427a42d647');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const frame=text=>{const body=Buffer.from(text,'utf8'),out=Buffer.alloc(4+body.length);out.writeUInt32BE(body.length);body.copy(out,4);return out;};
const dirs=[];
afterEach(()=>{for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true});
  if(!process.env.C2_FINAL_TEST_ROOT)try{fs.rmdirSync(path.join(process.env.LOCALAPPDATA,'TwoSides','C2ReceiverTests'));}catch{}});
const tmp=()=>{const d=fs.mkdtempSync(path.join(process.env.C2_FINAL_TEST_ROOT??os.tmpdir(),'c2-su-'));dirs.push(d);return d;};

const T=Date.parse('2026-10-29T12:00:00.000Z'),H=3600000;
const RELEASE='c2-'+'b'.repeat(32),ID='a'.repeat(32),DIGEST='A'.repeat(64);
const manifestAt=(patch={},activation={})=>({version:2,mode:'c2-remote-once',remoteEnabled:true,releaseId:RELEASE,payloadSha256:payloadDigest([]),
  target:{...RECEIVER_TARGET},node:{version:'24.19.0',sha256:'0'.repeat(64)},forbiddenSids:['S-1-5-21-1-2-3-4','S-1-5-21-5-6-7-8'],files:[],
  activation:{executionId:ID,runId:ATLAS_SCHEMA_RUN,scenarios:['A','B','C'],createdAtUtc:new Date(T-1000).toISOString(),expiresAtUtc:new Date(T-1000+H).toISOString(),...activation},...patch});
const target=p=>({target:{...RECEIVER_TARGET,...p}});
const window_=(c,e)=>({createdAtUtc:new Date(T+c).toISOString(),expiresAtUtc:new Date(T+e).toISOString()});
// name -> [manifest, expected]. Both the JavaScript gate and the PowerShell gate must answer the same way.
const CASES={
  valid:[manifestAt(),'ok'],
  window_exactly_4h:[manifestAt({},window_(-1000,-1000+MAX_ACTIVATION_MS)),'ok'],
  window_over_4h:[manifestAt({},window_(-1000,-1000+MAX_ACTIVATION_MS+1)),'reject'],
  window_expired:[manifestAt({},window_(-2000,0)),'reject'],
  window_empty:[manifestAt({},window_(-1000,-1000)),'reject'],
  start_within_skew:[manifestAt({},window_(60000,60000+H)),'ok'],
  start_beyond_skew:[manifestAt({},window_(61000,61000+H)),'reject'],
  offline_mode:[manifestAt({mode:'offline-only'}),'reject'],
  blocked_mode:[manifestAt({mode:'c2-blocked'}),'reject'],
  disabled:[manifestAt({remoteEnabled:false}),'reject'],
  version_1:[manifestAt({version:1}),'reject'],
  host:[manifestAt(target({host:'evil.example.net'})),'reject'],
  user_backend:[manifestAt(target({user:'twosides_backend'})),'reject'],
  database_prod:[manifestAt(target({database:'two_sides_db'})),'reject'],
  auth_source:[manifestAt(target({authSource:'$external'})),'reject'],
  mechanism:[manifestAt(target({authMechanism:'SCRAM-SHA-1'})),'reject'],
  tls_off:[manifestAt(target({tls:false})),'reject'],
  other_execution:[manifestAt({},{executionId:'f'.repeat(32)}),'reject'],
  other_schema_scope:[manifestAt({},{runId:'0'.repeat(32)}),'reject'],
  scenarios_short:[manifestAt({},{scenarios:['A','B']}),'reject'],
  scenarios_extra:[manifestAt({},{scenarios:['A','B','C','D']}),'reject'],
  scenarios_order:[manifestAt({},{scenarios:['C','B','A']}),'reject'],
  scenarios_repeat:[manifestAt({},{scenarios:['A','B','C','A']}),'reject'],
  // Added with the activation-gap fix: both gates must now agree on these as well.
  execution_is_schema_id:[manifestAt({},{executionId:ATLAS_SCHEMA_RUN}),'reject',ATLAS_SCHEMA_RUN],
  target_extra_key:[manifestAt({target:{...RECEIVER_TARGET,extra:'x'}}),'reject'],
  target_missing_key:[manifestAt({target:Object.fromEntries(Object.entries(RECEIVER_TARGET).filter(([k])=>k!=='tls'))}),'reject'],
  target_tls_string:[manifestAt(target({tls:'true'})),'reject'],
  target_host_number:[manifestAt(target({host:1})),'reject'],
  activation_extra_key:[manifestAt({},{extra:'x'}),'reject'],
  activation_missing_key:[(()=>{const m=manifestAt();delete m.activation.scenarios;return m;})(),'reject'],
  version_string:[manifestAt({version:'2'}),'reject'],
  enabled_string:[manifestAt({remoteEnabled:'true'}),'reject'],
  scenarios_scalar:[manifestAt({},{scenarios:'ABC'}),'reject'],
  scenarios_numbers:[manifestAt({},{scenarios:[1,2,3]}),'reject'],
  date_not_iso:[manifestAt({},{createdAtUtc:'2026-10-29 11:59:59Z'}),'reject'],
  date_no_zone:[manifestAt({},{expiresAtUtc:'2026-10-29T13:00:00'}),'reject'],
  date_number:[manifestAt({},{expiresAtUtc:T+H}),'reject'],
  window_with_millis:[manifestAt({},{createdAtUtc:'2026-10-29T11:59:59.000Z',expiresAtUtc:'2026-10-29T12:30:00.500Z'}),'ok']
};
const jsAnswer=(m,id=ID)=>{try{assertActivation(m,{releaseId:RELEASE,runId:id,manifestSha256:DIGEST,expectedManifestSha256:DIGEST,now:T});return 'ok';}catch{return 'reject';}};

const BLOCKED=/^(NODE_(OPTIONS|PATH|COMPILE_CACHE|DEBUG|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED)|NAPI_RS_|LD_|DYLD_|MONGO|DOTENV|NPM_CONFIG_|OPENSSL_|SSL_CERT|HTTPS?_PROXY|ALL_PROXY)/i;
function ps(script){
  const file=path.join(tmp(),'t.ps1');fs.writeFileSync(file,"$ErrorActionPreference='Stop'\n. '"+LAUNCHER+"'\n"+script,'utf8');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!BLOCKED.test(k)&&k.toUpperCase()!=='NODE_ENV'));
  return spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{env,encoding:'utf8',timeout:120000});
}

it('SU01 the JavaScript and PowerShell gates answer identically for window, target, scope, scenario and mode changes',()=>{
  for(const [name,[m,expected,id]] of Object.entries(CASES))expect(`${name}=${jsAnswer(m,id)}`).toBe(`${name}=${expected}`);
  const file=path.join(tmp(),'cases.json');fs.writeFileSync(file,JSON.stringify(Object.fromEntries(Object.entries(CASES).map(([k,[m,,id]])=>[k,{m,id:id??ID}]))));
  const run=ps(`$cases=Get-Content -LiteralPath '${file}' -Raw -Encoding UTF8 | ConvertFrom-Json
$style=[Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
$now=[datetime]::Parse('2026-10-29T12:00:00.000Z',[Globalization.CultureInfo]::InvariantCulture,$style)
foreach($p in $cases.PSObject.Properties){ try{ Test-C2Activation $p.Value.m $p.Value.id $now; $p.Name+'=ok' }catch{ $p.Name+'=reject' } }`);
  expect(run.status,run.stderr).toBe(0);
  for(const [name,[,expected]] of Object.entries(CASES))expect(run.stdout).toContain(`${name}=${expected}`);
});

it('SU02 the digest must equal both the supplied external digest and the manifest bytes; a release or payload change is rejected',()=>{
  const m=manifestAt(),ok=o=>{try{assertActivation(m,{releaseId:RELEASE,runId:ID,manifestSha256:DIGEST,expectedManifestSha256:DIGEST,now:T,...o});return 'ok';}catch{return 'reject';}};
  expect(ok({})).toBe('ok');
  expect(ok({expectedManifestSha256:'B'+DIGEST.slice(1)})).toBe('reject');
  expect(ok({expectedManifestSha256:DIGEST.toLowerCase()})).toBe('reject');
  expect(ok({expectedManifestSha256:undefined})).toBe('reject');
  expect(ok({releaseId:'c2-'+'c'.repeat(32)})).toBe('reject');
  expect(ok({runId:'e'.repeat(32)})).toBe('reject');
  const bad={...m,payloadSha256:'C'.repeat(64)};
  expect(()=>assertActivation(bad,{releaseId:RELEASE,runId:ID,manifestSha256:DIGEST,expectedManifestSha256:DIGEST,now:T})).toThrow();
});

function jsRelease(forcedId){
  const base=tmp(),rel=path.join(base,'c2-'+randomBytes(16).toString('hex')),runId=forcedId??randomBytes(16).toString('hex'),pkg=path.join(rel,'package');
  fs.mkdirSync(path.join(pkg,'scripts'),{recursive:true});fs.mkdirSync(path.join(rel,'runs',runId,'temp'),{recursive:true});fs.mkdirSync(path.join(rel,'temp'));
  const manifest=manifestAt({releaseId:path.basename(rel)},{executionId:runId,createdAtUtc:new Date(Date.now()-1000).toISOString(),expiresAtUtc:new Date(Date.now()+H).toISOString()});
  const digest=sha(Buffer.from(JSON.stringify(manifest))),runDir=path.join(rel,'runs',runId);writeConsumption(rel,runId,digest);
  const env={LOCALAPPDATA:'C:\\x',NODE_ENV:'test',PATH:'C:\\Windows\\System32',SystemDrive:'C:',SystemRoot:'C:\\Windows',TEMP:path.join(runDir,'temp'),TMP:path.join(runDir,'temp'),WINDIR:'C:\\Windows'};
  return {rel,pkg,runId,runDir,manifest,digest,env,result:path.join(runDir,'result.json'),marker:path.join(runDir,'receiver-attempt.started'),
    args:{runId,result:path.join(runDir,'result.json'),manifestSha256:digest}};
}
const receiver=(r,over={})=>runReceiver({args:r.args,env:r.env,manifest:r.manifest,manifestSha256:r.digest,packageRoot:r.pkg,
  stdin:over.stdin??(()=>{const s=new PassThrough();s.end(frame(FAKE));return s;})(),openIntegration:over.open??(async()=>{throw new Error('no connection in this test');}),
  execute:async()=>{},credentialTimeoutMs:2000});

it('SU03 (JS) the attempt is reserved before the credential stream is touched; a rejected gate never touches it',async()=>{
  const r=jsRelease();let markerWhenRead=null,reads=0;
  const stdin=new Readable({read(){reads++;if(markerWhenRead===null)markerWhenRead=fs.existsSync(r.marker);this.push(frame(FAKE));this.push(null);}});
  const result=await receiver(r,{stdin});
  expect(markerWhenRead).toBe(true);expect(result).toMatchObject({status:'rejected',code:'CONNECTION_REJECTED',atlasConnected:false});
  // Gate failure (wrong digest): the stream is never read and no marker is created.
  const r2=jsRelease();let reads2=0;const guard=new Readable({read(){reads2++;this.push(null);}});
  await expect(receiver({...r2,args:{...r2.args,manifestSha256:'B'+r2.digest.slice(1)}},{stdin:guard})).rejects.toMatchObject({code:'ACTIVATION_REJECTED'});
  expect(reads2).toBe(0);expect(fs.existsSync(r2.marker)).toBe(false);expect(fs.existsSync(r2.result)).toBe(false);
});

it('SU04 (JS) a failed, cancelled or credential-less attempt consumes the run and the saved result is never overwritten',async()=>{
  const r=jsRelease(),first=await receiver(r,{stdin:(()=>{const s=new PassThrough();s.end();return s;})()});
  expect(first).toMatchObject({status:'rejected',code:'CREDENTIAL_REQUIRED',atlasConnected:false});
  const saved=fs.readFileSync(r.result,'utf8');
  await expect(receiver(r)).rejects.toMatchObject({code:'REUSE_REJECTED'});
  expect(fs.readFileSync(r.result,'utf8')).toBe(saved);
  // Same after a connection failure and after a crash that left only the marker.
  const r2=jsRelease();expect((await receiver(r2)).code).toBe('CONNECTION_REJECTED');await expect(receiver(r2)).rejects.toMatchObject({code:'REUSE_REJECTED'});
  const r3=jsRelease();fs.closeSync(fs.openSync(r3.marker,'wx'));await expect(receiver(r3)).rejects.toMatchObject({code:'REUSE_REJECTED'});expect(fs.existsSync(r3.result)).toBe(false);
});

it('SU05 the execution permit is opaque, bound to one run, unforgeable, and expires with the window',async()=>{
  const now=Date.now(),m=manifestAt({},{createdAtUtc:new Date(now-1000).toISOString(),expiresAtUtc:new Date(now+250).toISOString()});
  const permit=issueExecutionPermit(m,{releaseId:RELEASE,runId:ID,manifestSha256:DIGEST,expectedManifestSha256:DIGEST,now});
  expect(Object.keys(permit)).toEqual([]);expect(Object.isFrozen(permit)).toBe(true);expect(JSON.stringify(permit)).toBe('{}');
  expect(()=>assertExecutionPermit(permit,ID)).not.toThrow();
  expect(()=>assertExecutionPermit(permit,'e'.repeat(32))).toThrow();
  for(const forged of [{},Object.create(null),Object.freeze(Object.create(null)),null,undefined,{runId:ID,expires:Date.now()+H}])expect(()=>assertExecutionPermit(forged,ID)).toThrow();
  await new Promise(resolve=>setTimeout(resolve,350));
  expect(()=>assertExecutionPermit(permit,ID)).toThrow();
});

// ---- PowerShell launcher with a stub entrypoint (the real entrypoint is never started with an open gate) ----
function psRelease(){
  const root=process.env.C2_FINAL_TEST_ROOT??path.join(process.env.LOCALAPPDATA,'TwoSides','C2ReceiverTests');fs.mkdirSync(root,{recursive:true});
  const base=fs.mkdtempSync(path.join(root,'t-'));dirs.push(base);const release=path.join(base,'c2-'+randomBytes(16).toString('hex'));
  fs.mkdirSync(path.join(release,'package','scripts'),{recursive:true});fs.mkdirSync(path.join(release,'runs'));fs.mkdirSync(path.join(release,'temp'));
  const entry=path.join(release,'package','scripts','c2-receiver-entry.js');
  fs.writeFileSync(entry,`import fs from 'node:fs';
const chunks=[];for await(const c of process.stdin)chunks.push(c);const a=process.argv.slice(2);
fs.writeFileSync(a[3],JSON.stringify({version:1,mode:'c2-remote-once',runId:a[1],status:'passed',code:'OK',argv:a,env:process.env,bytes:Buffer.concat(chunks).length})+'\\n',{flag:'wx'});\n`);
  fs.writeFileSync(path.join(release,'package','package.json'),'{"private":true,"type":"module"}\n');
  const files=['scripts/c2-receiver-entry.js','package.json'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(release,'package',...p.split('/'))))}));
  const seal=runId=>{const now=Date.now(),m=manifestAt({releaseId:path.basename(release),files,payloadSha256:payloadDigest(files),node:{version:'24.19.0',sha256:sha(fs.readFileSync(NODE))}},
    {executionId:runId,createdAtUtc:new Date(now-1000).toISOString(),expiresAtUtc:new Date(now+H).toISOString()});
    const text=JSON.stringify(m);fs.writeFileSync(path.join(release,'manifest.json'),text);return sha(Buffer.from(text));};
  return {base,release,seal,files};
}
const typedKeys=text=>[...text].map(c=>c.charCodeAt(0));
function keyScript(tokens){
  const file=path.join(tmp(),'keys.json');fs.writeFileSync(file,JSON.stringify(tokens));
  return `$tokens=Get-Content -LiteralPath '${file}' -Raw -Encoding UTF8 | ConvertFrom-Json
$q=New-Object System.Collections.Generic.Queue[object]
foreach($t in $tokens){ if($t -is [ValueType]){ $q.Enqueue([pscustomobject]@{Key=[ConsoleKey]::A;KeyChar=[char][int]$t}) } else { $q.Enqueue([pscustomobject]@{Key=[ConsoleKey]$t.special;KeyChar=[char]0}) } }
`;
}

it('SU06 (PowerShell) the run, both markers and the run temp exist before the first key is requested; cancelling consumes the only attempt',()=>{
  const r=psRelease(),id1=randomBytes(16).toString('hex'),id2=randomBytes(16).toString('hex'),d1=r.seal(id1);
  const probe=path.join(r.base,'probe.txt');
  const run=ps(`$script:n=0
$probeSource={ $script:n++; $run=Join-Path '${r.release}\\runs' '${id1}'
  if($script:n -eq 1){ ('run='+(Test-Path -LiteralPath $run)+' launcher='+(Test-Path -LiteralPath (Join-Path $run 'launcher-attempt.started'))+' temp='+(Test-Path -LiteralPath (Join-Path $run 'temp'))+' result='+(Test-Path -LiteralPath (Join-Path $run 'result.json'))) | Set-Content -LiteralPath '${probe}' -Encoding ASCII }
  [pscustomobject]@{Key=[ConsoleKey]::Escape;KeyChar=[char]27} }
try{ Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${d1}' -RunId '${id1}' -KeySource $probeSource | Out-Null; 'first=accepted' }catch{ 'first='+$_.Exception.Message }
$script:asked=0
try{ Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${d1}' -RunId '${id1}' -KeySource { $script:asked++; [pscustomobject]@{Key=[ConsoleKey]::Escape;KeyChar=[char]27} } | Out-Null; 'same=accepted' }catch{ 'same='+$_.Exception.Message+' asked='+$script:asked }
`);
  expect(run.status,run.stderr).toBe(0);
  expect(fs.readFileSync(probe,'utf8').trim()).toBe('run=True launcher=True temp=True result=False');
  expect(run.stdout).toContain('first=C2_RECEIVER_REJECTED:input');
  expect(run.stdout).toContain('same=C2_RECEIVER_REJECTED:reuse asked=0');
  // A fresh manifest for a different execution id on the same release is refused too: the consumed run keeps runs/ non-empty.
  const d2=r.seal(id2);
  const run2=ps(`$script:asked=0
try{ Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${d2}' -RunId '${id2}' -KeySource { $script:asked++; [pscustomobject]@{Key=[ConsoleKey]::Enter;KeyChar=[char]13} } | Out-Null; 'other=accepted' }catch{ 'other='+$_.Exception.Message+' asked='+$script:asked }`);
  expect(run2.status,run2.stderr).toBe(0);expect(run2.stdout).toContain('other=C2_RECEIVER_REJECTED:temp asked=0');
  expect(fs.readdirSync(path.join(r.release,'runs'))).toEqual([id1]);expect(fs.existsSync(path.join(r.release,'runs',id1,'result.json'))).toBe(false);
});

it('SU07 (PowerShell) the fictitious secret appears in no argument, environment value, output or file; the child gets exactly six arguments',()=>{
  const r=psRelease(),id=randomBytes(16).toString('hex'),digest=r.seal(id);
  const run=ps(keyScript([...typedKeys(FAKE),{special:'Enter'}])+`$src={ $script:q.Dequeue() }
try{ $o=Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${digest}' -RunId '${id}' -KeySource $src; 'status='+$o.Status }catch{ 'status='+$_.Exception.Message }`);
  expect(run.status,run.stderr).toBe(0);expect(run.stdout).toContain('status=passed');
  const seen=JSON.parse(fs.readFileSync(path.join(r.release,'runs',id,'result.json'),'utf8'));
  expect(seen.argv).toHaveLength(6);expect(seen.bytes).toBe(4+Buffer.byteLength(FAKE));
  expect(JSON.stringify(seen.argv)+JSON.stringify(seen.env)).not.toContain(FAKE);
  expect(Object.keys(seen.env)).toHaveLength(8);
  const entry=path.join(r.release,'package','scripts','c2-receiver-entry.js'),leaked=[];
  const scan=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())scan(p);else if(p!==entry&&fs.readFileSync(p).includes(FAKE))leaked.push(p);}};
  scan(r.release);expect(leaked).toEqual([]);expect(run.stdout+run.stderr).not.toContain(FAKE);
});

it('SU08 the delivered sealed release stays blocked: no remote manifest, nothing consumed, and no gate accepts it (read only)',()=>{
  if(!fs.existsSync(SEALED))return;
  const bytes=fs.readFileSync(path.join(SEALED,'manifest.json')),manifest=JSON.parse(bytes.toString('utf8')),digest=sha(bytes);
  expect(digest).toBe('0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579');
  expect(manifest).toMatchObject({version:2,mode:'c2-blocked',remoteEnabled:false,activation:null,releaseId:path.basename(SEALED)});
  expect(fs.readdirSync(path.join(SEALED,'runs'))).toEqual([]);expect(fs.readdirSync(path.join(SEALED,'temp'))).toEqual([]);
  for(const runId of [ID,ATLAS_SCHEMA_RUN])expect(()=>assertActivation(manifest,{releaseId:path.basename(SEALED),runId,manifestSha256:digest,expectedManifestSha256:digest,now:Date.now()})).toThrow();
  const run=ps(`$m=Get-Content -LiteralPath '${path.join(SEALED,'manifest.json')}' -Raw -Encoding UTF8 | ConvertFrom-Json
try{ Test-C2Activation $m '${ID}' ([datetime]::UtcNow); 'gate=accepted' }catch{ 'gate='+$_.Exception.Message }`);
  expect(run.status,run.stderr).toBe(0);expect(run.stdout).toContain('gate=C2_RECEIVER_REJECTED:activation');
});

it('SU09 an execution id equal to the reserved C.2A schema id is rejected by the arguments, the gate and the plan',async()=>{
  const m=manifestAt({},{executionId:ATLAS_SCHEMA_RUN});
  expect(()=>assertActivation(m,{releaseId:RELEASE,runId:ATLAS_SCHEMA_RUN,manifestSha256:DIGEST,expectedManifestSha256:DIGEST,now:T})).toThrow();
  expect(()=>parseReceiverArgs(['--run-id',ATLAS_SCHEMA_RUN,'--result','C:\\x\\result.json','--manifest-sha256','A'.repeat(64)])).toThrow();
  expect(parseReceiverArgs(['--run-id',ID,'--result','C:\\x\\result.json','--manifest-sha256','A'.repeat(64)])).toMatchObject({runId:ID});
  expect(()=>prepareDurableAtlasPlan({executionId:ATLAS_SCHEMA_RUN})).toThrow();
  expect(prepareDurableAtlasPlan({executionId:ID})).toMatchObject({executionId:ID,runId:ATLAS_SCHEMA_RUN});
  // Through the real receiver: a release prepared for that id never reaches the credential stream.
  const r=jsRelease(ATLAS_SCHEMA_RUN);let reads=0;const guard=new Readable({read(){reads++;this.push(null);}});
  await expect(receiver(r,{stdin:guard})).rejects.toMatchObject({code:'ACTIVATION_REJECTED'});expect(reads).toBe(0);expect(fs.existsSync(r.marker)).toBe(false);
});

it('SU10 (PowerShell) every manifest the JavaScript gate refuses is refused by the launcher before the first key is requested and before any run or record exists',()=>{
  const names=['execution_is_schema_id','target_extra_key','target_missing_key','target_tls_string','activation_extra_key','version_string','date_not_iso','scenarios_scalar'];
  const rs=names.map(name=>{
    const r=psRelease(),[m,,id]=CASES[name],runId=id??randomBytes(16).toString('hex'),now=Date.now();
    const manifest=JSON.parse(JSON.stringify(m));manifest.releaseId=path.basename(r.release);
    const a=manifest.activation;
    if(a&&typeof a==='object'){
      if(a.executionId!==ATLAS_SCHEMA_RUN)a.executionId=runId;
      if(name!=='date_not_iso'&&'createdAtUtc' in a)a.createdAtUtc=new Date(now-1000).toISOString();
      if('expiresAtUtc' in a)a.expiresAtUtc=new Date(now+H).toISOString();
    }
    manifest.files=r.files;manifest.payloadSha256=payloadDigest(r.files);manifest.node={version:'24.19.0',sha256:sha(fs.readFileSync(NODE))};
    const text=JSON.stringify(manifest);fs.writeFileSync(path.join(r.release,'manifest.json'),text);
    return {name,r,runId,digest:sha(Buffer.from(text))};
  });
  const run=ps(rs.map(c=>`$script:asked=0
try{ Invoke-C2Receiver -Root '${c.r.release}' -ExpectedBase '${c.r.base}' -ManifestSha256 '${c.digest}' -RunId '${c.runId}' -KeySource { $script:asked++; [pscustomobject]@{Key=[ConsoleKey]::Enter;KeyChar=[char]13} } | Out-Null; '${c.name}=accepted' }catch{ '${c.name}='+$_.Exception.Message+' asked='+$script:asked }
`).join(''));
  expect(run.status,run.stderr).toBe(0);
  for(const c of rs){
    expect(run.stdout).toMatch(new RegExp(`${c.name}=C2_RECEIVER_REJECTED:(activation|args) asked=0`));
    expect(fs.readdirSync(path.join(c.r.release,'runs'))).toEqual([]);expect(fs.existsSync(path.join(c.r.base,'consumed'))).toBe(false);
  }
});

it('SU11 the consumption record outside the release is required by the child and exactly bound to release, execution and digest',async()=>{
  const bad=[{executionId:'e'.repeat(32)},{manifestSha256:'B'.repeat(64)},{releaseId:'c2-'+'d'.repeat(32)},{version:2},{extra:1},{reservedAtUtc:'yesterday'}];
  for(const patch of bad){
    const r=jsRelease();writeConsumption(r.rel,r.runId,r.digest,patch);
    await expect(receiver(r),JSON.stringify(patch)).rejects.toMatchObject({code:'ACTIVATION_REJECTED'});expect(fs.existsSync(r.marker)).toBe(false);
  }
  const missing=jsRelease();fs.rmSync(path.join(path.dirname(missing.rel),'consumed'),{recursive:true});
  await expect(receiver(missing)).rejects.toMatchObject({code:'ACTIVATION_REJECTED'});expect(fs.existsSync(missing.marker)).toBe(false);
  const big=jsRelease();fs.writeFileSync(path.join(path.dirname(big.rel),'consumed',path.basename(big.rel)+'.json'),' '.repeat(2048));
  await expect(receiver(big)).rejects.toMatchObject({code:'ACTIVATION_REJECTED'});
  expect(consumptionRecordPath(path.join(missing.rel,'package'))).toBe(path.join(path.dirname(missing.rel),'consumed',path.basename(missing.rel)+'.json'));
});

it('SU12 (PowerShell) deleting runs/<id> after an attempt does not re-arm the release; only removing the record too does (documented limit, same account)',()=>{
  const r=psRelease(),id=randomBytes(16).toString('hex'),digest=r.seal(id),ledger=path.join(r.base,'consumed',path.basename(r.release)+'.json');
  const attemptFor=(runId,hash)=>`$script:asked=0
try{ Invoke-C2Receiver -Root '${r.release}' -ExpectedBase '${r.base}' -ManifestSha256 '${hash}' -RunId '${runId}' -KeySource { $script:asked++; [pscustomobject]@{Key=[ConsoleKey]::Escape;KeyChar=[char]27} } | Out-Null; 'accepted' }catch{ $_.Exception.Message+' asked='+$script:asked }`;
  let out=ps(attemptFor(id,digest));expect(out.status,out.stderr).toBe(0);expect(out.stdout).toContain('C2_RECEIVER_REJECTED:input asked=1');
  const record=JSON.parse(fs.readFileSync(ledger,'utf8'));
  expect(record).toMatchObject({version:1,releaseId:path.basename(r.release),executionId:id,manifestSha256:digest});expect(JSON.stringify(record)).not.toContain('FAKE');
  fs.rmSync(path.join(r.release,'runs',id),{recursive:true});          // what a careless or hostile deletion of the run folder does
  out=ps(attemptFor(id,digest));expect(out.stdout).toContain('C2_RECEIVER_REJECTED:reuse asked=0');expect(fs.readdirSync(path.join(r.release,'runs'))).toEqual([]);
  // A different execution id for the same release is refused by the record too, with a freshly sealed manifest.
  const id2=randomBytes(16).toString('hex'),digest2=r.seal(id2);
  out=ps(attemptFor(id2,digest2));expect(out.stdout).toContain('C2_RECEIVER_REJECTED:reuse asked=0');
  // LIMIT: a process that controls this Windows account can remove the record as well and re-arm the attempt. This is NOT prevented.
  fs.rmSync(ledger);out=ps(attemptFor(id2,digest2));expect(out.stdout).toContain('C2_RECEIVER_REJECTED:input asked=1');
});

it('SU13 the corrected blocked release matches its local reference package and the reviewed workspace scripts (read only)',()=>{
  const id='c2-ba006dea951a180aabf7561b028ee1cb',release=path.join(process.env.LOCALAPPDATA??'','TwoSides','C2Runtime',id);
  const refRoot=here('../../docs/c2-reference/'),ref=fs.existsSync(refRoot)?fs.readdirSync(refRoot).find(n=>n.startsWith(id+'-')):undefined;
  if(!fs.existsSync(release)||!ref)return;
  const bytes=fs.readFileSync(path.join(release,'manifest.json')),manifest=JSON.parse(bytes.toString('utf8')),dir=path.join(refRoot,ref);
  expect(fs.readdirSync(dir).sort()).toEqual(['INSTRUCCIONES.md','manifest.json','manifest.sha256.txt','reference.json','verifier.sha256.txt']);
  expect(fs.readFileSync(path.join(dir,'manifest.sha256.txt'),'utf8').trim()).toBe(sha(bytes));expect(fs.readFileSync(path.join(dir,'manifest.json')).equals(bytes)).toBe(true);
  expect(manifest).toMatchObject({version:2,mode:'c2-blocked',remoteEnabled:false,activation:null,releaseId:id,parentManifestSha256:'0A8C7D973CE35BFD31D697C5E87B9432D7AC591D1BFBE93E3DCD882F83AA7579'});
  expect(sha(bytes)).not.toBe(manifest.parentManifestSha256);expect(fs.readdirSync(path.join(release,'runs'))).toEqual([]);expect(fs.readdirSync(path.join(release,'temp'))).toEqual([]);
  for(const c of manifest.changes)expect(sha(fs.readFileSync(here('../../'+c.path)))).toBe(c.sha256);
  expect(()=>assertActivation(manifest,{releaseId:id,runId:ID,manifestSha256:sha(bytes),expectedManifestSha256:sha(bytes),now:Date.now()})).toThrow();
});

it('SU14 the prepared activable release matches its reference package, is valid only inside its 4 h window and shares the blocked parent payload (read only)',()=>{
  const id='c2-4d2193d364587b1eed72b7e6ef8345b6',release=path.join(process.env.LOCALAPPDATA??'','TwoSides','C2Runtime',id);
  const refRoot=here('../../docs/c2-reference/'),ref=fs.existsSync(refRoot)?fs.readdirSync(refRoot).find(n=>n.startsWith(id+'-')):undefined;
  if(!fs.existsSync(release)||!ref)return;
  const bytes=fs.readFileSync(path.join(release,'manifest.json')),manifest=JSON.parse(bytes.toString('utf8')),digest=sha(bytes),dir=path.join(refRoot,ref),a=manifest.activation;
  expect(fs.readdirSync(dir).sort()).toEqual(['INSTRUCCIONES.md','manifest.json','manifest.sha256.txt','reference.json','verifier.sha256.txt']);
  expect(fs.readFileSync(path.join(dir,'manifest.sha256.txt'),'utf8').trim()).toBe(digest);expect(fs.readFileSync(path.join(dir,'manifest.json')).equals(bytes)).toBe(true);
  expect(digest).not.toBe(manifest.parentManifestSha256);expect(manifest).toMatchObject({version:2,mode:'c2-remote-once',remoteEnabled:true,releaseId:id,parentReleaseId:'c2-ba006dea951a180aabf7561b028ee1cb'});
  expect(a.executionId).toMatch(/^[a-f0-9]{32}$/);expect(a.executionId).not.toBe(ATLAS_SCHEMA_RUN);expect(a.runId).toBe(ATLAS_SCHEMA_RUN);expect(a.scenarios).toEqual(['A','B','C']);
  const created=Date.parse(a.createdAtUtc),expires=Date.parse(a.expiresAtUtc);expect(expires-created).toBe(MAX_ACTIVATION_MS);
  const at=now=>{try{assertActivation(manifest,{releaseId:id,runId:a.executionId,manifestSha256:digest,expectedManifestSha256:digest,now});return 'ok';}catch{return 'reject';}};
  expect([at(created-61000),at(created),at(expires-1),at(expires),at(expires+3600000)]).toEqual(['reject','ok','ok','reject','reject']);
  expect(()=>assertActivation(manifest,{releaseId:id,runId:a.executionId,manifestSha256:digest,expectedManifestSha256:'B'+digest.slice(1),now:created})).toThrow();
  // Before the authorized execution runs/ was empty and no consumption record existed. Afterwards only that one run may exist.
  expect(fs.readdirSync(path.join(release,'runs')).every(n=>n===a.executionId)).toBe(true);expect(fs.readdirSync(path.join(release,'temp'))).toEqual([]);
  const record=path.join(process.env.LOCALAPPDATA,'TwoSides','C2Runtime','consumed',id+'.json');
  if(fs.existsSync(record))expect(JSON.parse(fs.readFileSync(record,'utf8'))).toMatchObject({releaseId:id,executionId:a.executionId,manifestSha256:digest});
});
