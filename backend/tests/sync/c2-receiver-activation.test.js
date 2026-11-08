import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { createHash,randomBytes } from 'node:crypto';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { runReceiver,payloadDigest,RECEIVER_TARGET } from '../../scripts/c2-receiver-core.js';
import { executeDurableAtlasRun } from '../../scripts/durable-revocation-atlas-harness.js';
import { openAtlasIntegration } from '../../src/modules/sync/atlas-integration.js';
import { consumeAtlasCredential } from '../../src/modules/sync/atlas-credentials.js';
import { ATLAS_SCHEMA_RUN } from '../../src/modules/sync/atlas-policy.js';
import { writeConsumption } from './support/c2-consumption.js';

// Activation review: the three barriers, the real entrypoint with an OPEN manifest gate, the run-local temporary
// directory, and the interactive-input self-test logic. Synthetic data only. No Atlas, no real secret.
const FAKE='FAKE-SYNTHETIC-CREDENTIAL-0001';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
const BACKEND=here('../../'),SCRIPTS=here('../../scripts/'),LAUNCHER=here('../../scripts/c2-receiver.ps1'),SELFTEST=here('../../scripts/c2-hidden-input-selftest.ps1');
const NODE='C:\\Program Files\\nodejs\\node.exe';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const frame=text=>{const body=Buffer.from(text,'utf8'),out=Buffer.alloc(4+body.length);out.writeUInt32BE(body.length);body.copy(out,4);return out;};
const dirs=[],junctions=[];
afterEach(()=>{vi.restoreAllMocks();
  // Remove each junction itself first, so recursive cleanup can never reach the project's node_modules through it.
  for(const j of junctions.splice(0)){try{fs.rmdirSync(j);}catch{}}
  for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true});
  if(!process.env.C2_FINAL_TEST_ROOT)try{fs.rmdirSync(path.join(process.env.LOCALAPPDATA,'TwoSides','C2ReceiverTests'));}catch{}});
// Directory with a clean inherited DACL (the user Temp folder carries an extra explicit entry; see the review).
function cleanRoot(){const root=process.env.C2_FINAL_TEST_ROOT??path.join(process.env.LOCALAPPDATA,'TwoSides','C2ReceiverTests');fs.mkdirSync(root,{recursive:true});
  const d=fs.mkdtempSync(path.join(root,'t-'));dirs.push(d);return d;}
const gateOpen=(runId,patch={})=>({version:2,mode:'c2-remote-once',remoteEnabled:true,releaseId:'c2-test',target:{...RECEIVER_TARGET},
  node:{version:'24.19.0',sha256:'0'.repeat(64)},forbiddenSids:['S-1-5-21-1-2-3-4','S-1-5-21-5-6-7-8'],files:[],
  activation:{executionId:runId,runId:ATLAS_SCHEMA_RUN,scenarios:['A','B','C'],createdAtUtc:new Date(Date.now()-1000).toISOString(),
    expiresAtUtc:new Date(Date.now()+3600000).toISOString()},...patch});
const offlineManifest={version:1,mode:'offline-only',remoteEnabled:false,target:{...RECEIVER_TARGET},forbiddenSids:[],files:[]};
function release(base){
  const rel=path.join(base,'c2-'+randomBytes(16).toString('hex')),runId=randomBytes(16).toString('hex'),pkg=path.join(rel,'package');
  fs.mkdirSync(path.join(pkg,'scripts'),{recursive:true});fs.mkdirSync(path.join(rel,'runs',runId,'temp'),{recursive:true});fs.mkdirSync(path.join(rel,'temp'));
  return {rel,runId,pkg,runDir:path.join(rel,'runs',runId),resultPath:path.join(rel,'runs',runId,'result.json')};
}
const SYSROOT=process.env.SystemRoot??process.env.SYSTEMROOT??process.env.windir??String.raw`C:\Windows`;
const goodEnv=temp=>({LOCALAPPDATA:process.env.LOCALAPPDATA,NODE_ENV:'test',PATH:path.join(SYSROOT,'System32'),SystemDrive:'C:',SystemRoot:SYSROOT,TEMP:temp,TMP:temp,WINDIR:SYSROOT});
// Real sources in a synthetic package; node_modules is a junction to the project's (no install, no copy).
function populate(r){
  fs.cpSync(path.join(BACKEND,'src'),path.join(r.pkg,'src'),{recursive:true});
  for(const f of ['c2-receiver-core.js','c2-receiver-entry.js','c2-release-integration.js','durable-revocation-atlas-harness.js','durable-revocation-runtime.js'])
    fs.copyFileSync(path.join(SCRIPTS,f),path.join(r.pkg,'scripts',f));
  fs.writeFileSync(path.join(r.pkg,'package.json'),'{"private":true,"type":"module"}\n');
  fs.writeFileSync(path.join(r.pkg,'scripts','offline-native-block.js'),"import mongoose from 'mongoose';import net from 'node:net';mongoose.mongo.MongoClient.prototype.connect=async()=>{throw new Error('Offline boundary');};net.Socket.prototype.connect=function(){throw new Error('Network prohibited');};\n");
  fs.symlinkSync(path.join(BACKEND,'node_modules'),path.join(r.pkg,'node_modules'),'junction');junctions.push(path.join(r.pkg,'node_modules'));
}
function inProcess(manifestFor,{openIntegration,execute,cleanup}){
  const base=fs.mkdtempSync(path.join(process.env.C2_FINAL_TEST_ROOT??os.tmpdir(),'c2-review-'));dirs.push(base);const r=release(base);const manifest=manifestFor(r.runId);
  manifest.releaseId=path.basename(r.rel);manifest.payloadSha256=payloadDigest(manifest.files);
  const text=JSON.stringify(manifest),digest=sha(Buffer.from(text));writeConsumption(r.rel,r.runId,digest);const stdin=new PassThrough();stdin.end(frame(FAKE));
  return runReceiver({args:{runId:r.runId,result:r.resultPath,manifestSha256:digest},env:goodEnv(path.join(r.runDir,'temp')),manifest,manifestSha256:digest,
    packageRoot:r.pkg,stdin,openIntegration,execute,cleanup,credentialTimeoutMs:2000}).then(result=>({result,r}),error=>({error:error.code,r}));
}

it('AR01 the manifest, fixed-scope policy and opaque execution permit reject bypasses independently',async()=>{
  const connector=vi.fn(),liveIntegration=async({config,credential})=>{consumeAtlasCredential(credential);return {close:async()=>{}};};
  const realPolicyOpen=({config,credential})=>openAtlasIntegration({config:{...config,runId:'0'.repeat(32)},credential,connector});
  const refusingOpen=async()=>{throw new Error('no connection factory');};
  // Barrier 1 closed (offline manifest); 2 and 3 "open" (working integration, harmless execute).
  let out=await inProcess(()=>offlineManifest,{openIntegration:liveIntegration,execute:async()=>{}});
  expect(out.error).toBe('ACTIVATION_REJECTED');expect(fs.existsSync(out.r.resultPath)).toBe(false);
  // An injected factory failure remains sanitized even when the synthetic manifest is open.
  out=await inProcess(gateOpen,{openIntegration:refusingOpen,execute:async()=>{}});
  expect(out.result).toMatchObject({status:'rejected',code:'CONNECTION_REJECTED',atlasConnected:false});
  // Wrong fixed schema scope is rejected before a connector call.
  out=await inProcess(gateOpen,{openIntegration:realPolicyOpen,execute:async()=>{}});
  expect(out.result).toMatchObject({status:'rejected',code:'CONNECTION_REJECTED',atlasConnected:false});expect(connector).not.toHaveBeenCalled();
  // Barrier 3b closed (executeDurableAtlasRun) with 1 and 2 open: connected, but nothing can run.
  await expect(executeDurableAtlasRun()).rejects.toMatchObject({code:'DURABLE_REVOCATION_C2_NOT_AUTHORIZED'});
  const cleanup=vi.fn();
  out=await inProcess(gateOpen,{openIntegration:liveIntegration,execute:executeDurableAtlasRun,cleanup});
  expect(out.result).toMatchObject({status:'rejected',code:'EXECUTION_FAILED'});expect(cleanup).not.toHaveBeenCalled();
});

it('AR02 nothing in scripts or src can create an activation manifest; the gate marker appears only where it is checked',()=>{
  const hits=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
    if(e.isDirectory())walk(p);else if(/\.(js|ps1|json|mjs|cjs)$/.test(e.name)&&fs.readFileSync(p,'utf8').includes('c2-remote-once'))hits.push(path.relative(BACKEND,p).split(path.sep).join('/'));}};
  walk(path.join(BACKEND,'scripts'));walk(path.join(BACKEND,'src'));
  expect(hits.sort()).toEqual(['scripts/c2-activatable-verify-reference.ps1','scripts/c2-receiver-core.js','scripts/c2-receiver.ps1']);
  const callers=[];const scan=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
    if(e.isDirectory())scan(p);else if(e.name.endsWith('.js')&&/\bexecuteDurableAtlasRun\b/.test(fs.readFileSync(p,'utf8')))callers.push(path.relative(BACKEND,p).split(path.sep).join('/'));}};
  scan(path.join(BACKEND,'scripts'));scan(path.join(BACKEND,'src'));
  expect(callers.sort()).toEqual(['scripts/c2-release-integration.js','scripts/c2-windows-offline-entry.js','scripts/durable-revocation-atlas-harness.js']);
  expect(fs.readFileSync(path.join(SCRIPTS,'durable-revocation-atlas-harness.js'),'utf8')).toContain("error.code='DURABLE_REVOCATION_C2_NOT_AUTHORIZED'");
});

// Starts the child exactly like the launcher does (.NET Process, environment cleared, only the given names, stdin pipe).
// Node's own spawn is NOT used: on this machine it adds HOMEDRIVE/USERPROFILE/... even when an explicit env is given.
function runEntry(r,entry,digest,{extra={},input=frame(FAKE)}={}){
  const env=Object.entries({...goodEnv(path.join(r.runDir,'temp')),...extra});
  const script=`$i=New-Object Diagnostics.ProcessStartInfo
$i.FileName='${NODE}';$i.Arguments='--import "${pathToFileURL(path.join(r.pkg,'scripts','offline-native-block.js')).href}" "${entry}" --run-id ${r.runId} --result "${r.resultPath}" --manifest-sha256 ${digest}'
$i.WorkingDirectory='${r.pkg}';$i.UseShellExecute=$false;$i.CreateNoWindow=$true
$i.RedirectStandardInput=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
$i.EnvironmentVariables.Clear()
${env.map(([k,v])=>`$i.EnvironmentVariables['${k}']='${v}'`).join('\n')}
$p=[Diagnostics.Process]::Start($i);$bytes=[Convert]::FromBase64String('${input.toString('base64')}')
$s=$p.StandardInput.BaseStream;$s.Write($bytes,0,$bytes.Length);$s.Close()
$o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync()
if(!$p.WaitForExit(60000)){$p.Kill()}
'exit='+$p.ExitCode;'stdout='+$o.Result.Length;'stderr='+$e.Result.Length`;
  const out=ps(script);expect(out.status,out.stderr).toBe(0);
  const get=k=>Number(new RegExp(`${k}=(\\d+)`).exec(out.stdout)[1]);
  return {exit:get('exit'),stdout:get('stdout'),stderr:get('stderr')};
}
it('AR03 the real entrypoint reaches only the intercepted boundary with a synthetic gate; offline gates never claim a run',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'c2-review-'));dirs.push(base);const r=release(base);
  populate(r);
  const text=JSON.stringify(gateOpen(r.runId,{releaseId:path.basename(r.rel),payloadSha256:payloadDigest([])})),digest=sha(Buffer.from(text));fs.writeFileSync(path.join(r.rel,'manifest.json'),text);writeConsumption(r.rel,r.runId,digest);
  const entry=path.join(r.pkg,'scripts','c2-receiver-entry.js');
  const run=runEntry(r,entry,digest);
  expect(run).toEqual({exit:1,stdout:0,stderr:0});
  const result=JSON.parse(fs.readFileSync(r.resultPath,'utf8'));
  expect(result).toMatchObject({mode:'c2-remote-once',status:'rejected',code:'CONNECTION_REJECTED',atlasConnected:false,uncertain:false});
  expect(fs.existsSync(path.join(r.runDir,'receiver-attempt.started'))).toBe(true);
  // A second launch of the same run is refused and leaves the first result untouched.
  const saved=fs.readFileSync(r.resultPath,'utf8'),again=runEntry(r,entry,digest);
  expect(again.exit).toBe(1);expect(fs.readFileSync(r.resultPath,'utf8')).toBe(saved);
  // Same entrypoint with the sealed offline manifest: refuses before the secret is read, nothing is written.
  const r2=release(base);populate(r2);const t2=JSON.stringify(offlineManifest);fs.writeFileSync(path.join(r2.rel,'manifest.json'),t2);
  expect(runEntry(r2,path.join(r2.pkg,'scripts','c2-receiver-entry.js'),sha(Buffer.from(t2))).exit).toBe(1);
  expect(fs.existsSync(r2.resultPath)).toBe(false);expect(fs.existsSync(path.join(r2.runDir,'receiver-attempt.started'))).toBe(false);
  // A stray variable (or a digest that does not match the manifest bytes) is refused before anything is claimed.
  const r3=release(base);populate(r3);const t3=JSON.stringify(gateOpen(r3.runId,{releaseId:path.basename(r3.rel),payloadSha256:payloadDigest([])}));fs.writeFileSync(path.join(r3.rel,'manifest.json'),t3);writeConsumption(r3.rel,r3.runId,sha(Buffer.from(t3)));
  const entry3=path.join(r3.pkg,'scripts','c2-receiver-entry.js');
  expect(runEntry(r3,entry3,sha(Buffer.from(t3)),{extra:{HTTPS_PROXY:'http://127.0.0.1:1'}}).exit).toBe(1);
  expect(runEntry(r3,entry3,sha(Buffer.from('other')).replace(/^./,c=>c==='A'?'B':'A')).exit).toBe(1);
  expect(fs.existsSync(r3.resultPath)).toBe(false);expect(fs.existsSync(path.join(r3.runDir,'receiver-attempt.started'))).toBe(false);
  // Control: the same release with a clean environment and the right digest does run (so the refusals above are real).
  expect(runEntry(r3,entry3,sha(Buffer.from(t3))).exit).toBe(1);expect(JSON.parse(fs.readFileSync(r3.resultPath,'utf8')).code).toBe('CONNECTION_REJECTED');
  const leaked=[];const scan=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink())continue;
    if(e.isDirectory())scan(p);else if(fs.readFileSync(p).includes(FAKE))leaked.push(p);}};scan(base);
  expect(leaked).toEqual([]);
},180000);


const BLOCKED=/^(NODE_(OPTIONS|PATH|COMPILE_CACHE|DEBUG|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED)|NAPI_RS_|LD_|DYLD_|MONGO|DOTENV|NPM_CONFIG_|OPENSSL_|SSL_CERT|HTTPS?_PROXY|ALL_PROXY)/i;
function ps(script){
  const dir=fs.mkdtempSync(path.join(process.env.C2_FINAL_TEST_ROOT??os.tmpdir(),'c2-review-ps-'));dirs.push(dir);const file=path.join(dir,'t.ps1');
  fs.writeFileSync(file,"$ErrorActionPreference='Stop'\n"+script,'utf8');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!BLOCKED.test(k)&&k.toUpperCase()!=='NODE_ENV'));
  return spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{env,encoding:'utf8',timeout:120000});
}
it('AR04 through the full PowerShell flow the child gets TEMP, TMP and os.tmpdir() inside the release temp, not the user Temp',()=>{
  const base=cleanRoot(),r=release(base),entry=path.join(r.pkg,'scripts','c2-receiver-entry.js');fs.rmSync(r.runDir,{recursive:true}); // the launcher creates the run itself
  fs.writeFileSync(entry,`import fs from 'node:fs';import os from 'node:os';
const a=process.argv.slice(2);for await(const c of process.stdin){}
fs.writeFileSync(a[3],JSON.stringify({version:1,mode:'c2-remote-once',runId:a[1],status:'passed',code:'OK',temp:process.env.TEMP,tmp:process.env.TMP,tmpdir:os.tmpdir(),cwd:process.cwd(),
  path:process.env.PATH,names:Object.keys(process.env).sort()})+'\\n',{flag:'wx'});\n`);
  fs.writeFileSync(path.join(r.pkg,'package.json'),'{"private":true,"type":"module"}\n');
  const files=[['scripts/c2-receiver-entry.js',entry],['package.json',path.join(r.pkg,'package.json')]].map(([p,f])=>({path:p,sha256:sha(fs.readFileSync(f))}));
  const m=gateOpen(r.runId,{releaseId:path.basename(r.rel),payloadSha256:payloadDigest(files),files,node:{version:'24.19.0',sha256:sha(fs.readFileSync(NODE))}});const text=JSON.stringify(m);fs.writeFileSync(path.join(r.rel,'manifest.json'),text);
  const keys=path.join(base,'k.json');fs.writeFileSync(keys,JSON.stringify([...FAKE].map(c=>c.charCodeAt(0)).concat([{special:'Enter'}])));
  const out=ps(`. '${LAUNCHER}'
$tokens=Get-Content -LiteralPath '${keys}' -Raw | ConvertFrom-Json
$q=New-Object System.Collections.Generic.Queue[object]
foreach($t in $tokens){ if($t -is [ValueType]){ $q.Enqueue([pscustomobject]@{Key=[ConsoleKey]::A;KeyChar=[char][int]$t}) } else { $q.Enqueue([pscustomobject]@{Key=[ConsoleKey]::Enter;KeyChar=[char]13}) } }
try{ $o=Invoke-C2Receiver -Root '${r.rel}' -ExpectedBase '${base}' -ManifestSha256 '${sha(Buffer.from(text))}' -RunId '${r.runId}' -KeySource { $script:q.Dequeue() }; 'status='+$o.Status }catch{ 'status='+$_.Exception.Message }`);
  expect(out.status,out.stderr).toBe(0);expect(out.stdout).toContain('status=passed');
  const seen=JSON.parse(fs.readFileSync(r.resultPath,'utf8')),temp=path.join(r.runDir,'temp');
  expect(seen.temp.toLowerCase()).toBe(temp.toLowerCase());expect(seen.tmp.toLowerCase()).toBe(temp.toLowerCase());expect(seen.tmpdir.toLowerCase()).toBe(temp.toLowerCase());
  expect(seen.cwd.toLowerCase()).toBe(r.pkg.toLowerCase());expect(seen.path.toLowerCase()).toBe(path.join(SYSROOT,'System32').toLowerCase());
  expect(seen.names).toHaveLength(8);expect(seen.tmpdir.toLowerCase()).not.toBe(os.tmpdir().toLowerCase());
},120000);

it('AR05 the hidden-input self-test accepts only the fictitious text, supports Backspace, and reports Cancel correctly',()=>{
  const dir=fs.mkdtempSync(path.join(process.env.C2_FINAL_TEST_ROOT??os.tmpdir(),'c2-review-keys-'));dirs.push(dir);
  const write=(name,tokens)=>{const f=path.join(dir,name);fs.writeFileSync(f,JSON.stringify(tokens));return f;};
  const codes=t=>[...t].map(c=>c.charCodeAt(0));const sp=k=>({special:k});
  const cases={accept:['Accept',[...codes('FAKE-INTERACTIVE-TEST-0000'),sp('Backspace'),...codes('1'),sp('Enter')]],
    wrong:['Accept',[...codes('FAKE-INTERACTIVE-TEST-9999'),sp('Enter')]],escInAccept:['Accept',[...codes('FAKE-INTERACTIVE'),sp('Escape')]],
    cancel:['Cancel',[...codes('abc'),sp('Escape')]],enterInCancel:['Cancel',[...codes('long-enough-text'),sp('Enter')]]};
  const script=`. '${SELFTEST}'
function Run($name,$mode,$file){
  $tokens=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
  $script:q=New-Object System.Collections.Generic.Queue[object]
  foreach($t in $tokens){ if($t -is [ValueType]){ $script:q.Enqueue([pscustomobject]@{Key=[ConsoleKey]::A;KeyChar=[char][int]$t}) } else { $script:q.Enqueue([pscustomobject]@{Key=[ConsoleKey]$t.special;KeyChar=[char]0}) } }
  $r=Invoke-C2HiddenInputSelfTest $mode { $script:q.Dequeue() }
  "$name => $r"
}
${Object.entries(cases).map(([n,[mode,tokens]])=>`Run '${n}' '${mode}' '${write(n+'.json',tokens)}'`).join('\n')}`;
  const out=ps(script);expect(out.status,out.stderr).toBe(0);
  expect(out.stdout).toContain('accept => HIDDEN_INPUT_SELFTEST=PASS mode=Accept bytes=26');
  expect(out.stdout).toContain('wrong => HIDDEN_INPUT_SELFTEST=FAIL mode=Accept');expect(out.stdout).toContain('escInAccept => HIDDEN_INPUT_SELFTEST=FAIL mode=Accept');
  expect(out.stdout).toContain('cancel => HIDDEN_INPUT_SELFTEST=PASS mode=Cancel');expect(out.stdout).toContain('enterInCancel => HIDDEN_INPUT_SELFTEST=FAIL mode=Cancel');
  expect(out.stdout).not.toContain('FAKE-INTERACTIVE-TEST-0001 ');
  const text=fs.readFileSync(SELFTEST,'utf8');for(const banned of ['Read-Host','SecureString','Out-File','Set-Content','Add-Content','Start-Process','Invoke-WebRequest','New-Object Net'])expect(text).not.toContain(banned);
  // Non-interactive launch is refused rather than reading from a pipe.
  const refused=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',SELFTEST],{input:'FAKE-INTERACTIVE-TEST-0001\r\n',encoding:'utf8',timeout:60000});
  expect(refused.status).toBe(1);expect(refused.stdout).toContain('REFUSED');
},120000);
