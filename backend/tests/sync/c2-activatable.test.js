import './support/isolation-guard.js';
import {afterEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assertActivation,payloadDigest,assertReleaseLayout,RECEIVER_TARGET} from '../../scripts/c2-receiver-core.js';
import {ATLAS_SCHEMA_RUN} from '../../src/modules/sync/atlas-policy.js';

const dirs=[];
afterEach(()=>{vi.restoreAllMocks();for(const d of dirs.splice(0))fs.rmSync(d,{recursive:true,force:true});});
const id='a'.repeat(32),releaseId='c2-'+'b'.repeat(32),hash='A'.repeat(64);
function synthetic(){const files=[{path:'synthetic.js',sha256:hash}];return {version:2,mode:'c2-remote-once',remoteEnabled:true,releaseId,
  files,payloadSha256:payloadDigest(files),target:{...RECEIVER_TARGET},activation:{executionId:id,runId:ATLAS_SCHEMA_RUN,
    scenarios:['A','B','C'],createdAtUtc:new Date(Date.now()-1000).toISOString(),expiresAtUtc:new Date(Date.now()+60000).toISOString()}};}
const context=()=>({runId:id,releaseId,manifestSha256:hash,expectedManifestSha256:hash,now:Date.now()});
it('AC01 binding rejects a changed payload digest, file list, release or expected external digest',()=>{
  expect(()=>assertActivation(synthetic(),context())).not.toThrow();
  for(const change of [m=>{m.payloadSha256='0'.repeat(64);},m=>{m.files[0].sha256='B'.repeat(64);},m=>{m.releaseId='c2-'+'c'.repeat(32);},m=>{m.files.push({...m.files[0]});}]){
    const m=synthetic();change(m);expect(()=>assertActivation(m,context())).toThrow();}
  expect(()=>assertActivation(synthetic(),{...context(),expectedManifestSha256:'B'.repeat(64)})).toThrow();
  expect(()=>payloadDigest([{path:'../x',sha256:hash}])).toThrow();
});
it('AC02 delivered template and blocked manifest cannot mint a remote permit',()=>{
  const template=JSON.parse(fs.readFileSync(new URL('../../scripts/c2-activation-template.json',import.meta.url)));
  expect(template).toMatchObject({templateOnly:true,remoteEnabled:false,mode:'c2-blocked',releaseId:null,payloadSha256:null});
  expect(template.activation).toMatchObject({executionId:null,createdAtUtc:null,expiresAtUtc:null});
  expect(()=>assertActivation(template,context())).toThrow();
  const m=synthetic();Object.assign(m,{mode:'c2-blocked',remoteEnabled:false,activation:null});expect(()=>assertActivation(m,context())).toThrow();
});
it('AC03 temp is unique to the authorized run, not the release or another execution',()=>{
  const base=process.env.C2_FINAL_TEST_ROOT;if(!base)throw Error('Disposable root required');
  const release=fs.mkdtempSync(path.join(base,'c2-activation-layout-'));dirs.push(release);const pkg=path.join(release,'package');
  fs.mkdirSync(pkg);fs.mkdirSync(path.join(release,'temp'));fs.mkdirSync(path.join(release,'runs',id,'temp'),{recursive:true});
  const temp=path.join(release,'runs',id,'temp');
  expect(()=>assertReleaseLayout(pkg,{TEMP:temp},fs,id)).not.toThrow();
  for(const wrong of [path.join(release,'temp'),base,path.join(release,'runs','c'.repeat(32),'temp')])expect(()=>assertReleaseLayout(pkg,{TEMP:wrong},fs,id)).toThrow();
  fs.writeFileSync(path.join(temp,'residue'),'synthetic');expect(()=>assertReleaseLayout(pkg,{TEMP:temp},fs,id)).toThrow();
});

const root=process.env.TWOSIDES_C2_ACTIVATABLE_ROOT;
const runtimeIt=it.skipIf(!root);
const ps=(file,args=[])=>spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',[
  '-NoProfile','-NonInteractive','-File',file,...args],{encoding:'utf8',timeout:30000,windowsHide:true});
runtimeIt('AC04 disposable delivered release is blocked before prompt or run creation and detects tampering',()=>{
  const manifestFile=path.join(root,'manifest.json'),bytes=fs.readFileSync(manifestFile),m=JSON.parse(bytes);
  if(!/^C:\\Users\\luis2\\AppData\\Local\\TwoSides\\C2Runtime\\c2-[a-f0-9]{32}$/.test(root)||m.disposableFor!=='activatable-build')throw Error('Disposable copy required');
  expect(m).toMatchObject({mode:'c2-blocked',remoteEnabled:false,activation:null});
  const digest=createHash('sha256').update(bytes).digest('hex').toUpperCase();
  const checker=path.join(root,'package/scripts/c2-activatable-verify-reference.ps1');
  const check=(h=digest)=>ps(checker,['-ReleaseDirectory',root,'-ExpectedManifestSha256',h]);
  expect(check().stdout).toContain('C2_ACTIVATABLE_REFERENCE_CHECK=PASS');
  expect(check('0'.repeat(64)).status).toBe(1);
  const launch=ps(path.join(root,'package/scripts/c2-receiver.ps1'),['-ManifestSha256',digest,'-RunId',id]);
  expect(launch.status).toBe(1);expect(launch.stdout).toContain('Receptor C.2 rechazado');
  expect(launch.stdout).not.toContain('entrada oculta');expect(fs.readdirSync(path.join(root,'runs'))).toEqual([]);
  const file=path.join(root,'package/scripts/c2-receiver-core.js'),original=fs.readFileSync(file);
  try{fs.appendFileSync(file,'\n// synthetic integrity failure\n');expect(check().status).toBe(1);}finally{fs.writeFileSync(file,original);}
  expect(check().status).toBe(0);expect(fs.readFileSync(manifestFile).equals(bytes)).toBe(true);
},60000);
