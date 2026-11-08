import './support/isolation-guard.js';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {expect,it as baseIt} from 'vitest';

const root=process.env.TWOSIDES_C2_OFFLINE_ROOT;
if(root&&!/^C:\\Users\\luis2\\AppData\\Local\\TwoSides\\C2Runtime\\c2-[a-f0-9]{32}$/.test(root))throw new Error('Explicit synthetic runtime required');
const it=baseIt.skipIf(!root);
const packageRoot=root?path.join(root,'package'):null,manifestPath=root?path.join(root,'manifest.json'):null;
const manifestBytes=root?fs.readFileSync(manifestPath):Buffer.from('{}'),manifest=JSON.parse(manifestBytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const manifestHash=sha(manifestBytes),launcher=root?path.join(packageRoot,'scripts','c2-windows-offline.ps1'):null;
const nonce=()=>randomUUID().replaceAll('-','');
function launch({runId=nonce(),extra=[],env={}}={}){
  return spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',[
    '-NoProfile','-NonInteractive','-File',launcher,'-RuntimePath',root,'-ManifestSha256',manifestHash,'-RunId',runId,...extra,
  ],{encoding:'utf8',windowsHide:true,timeout:150000,env:{...process.env,...env}});
}
function rejected(result){expect(result.error).toBeUndefined();expect(result.status).toBe(1);expect(result.stdout).toContain('Validacion offline rechazada');expect(result.stdout+result.stderr).not.toContain('synthetic-injected-marker');}
it('CP01 every published file matches its manifest and the minimal package has exactly the reviewed direct dependencies',()=>{
  expect(manifest.mode).toBe('offline-only');expect(manifest.remoteEnabled).toBe(false);expect(manifest.dependencies).toHaveLength(23);
  for(const f of manifest.files)expect(sha(fs.readFileSync(path.join(packageRoot,f.path)))).toBe(f.sha256);
  const pkg=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json')));
  expect(pkg.dependencies).toEqual({'@node-rs/argon2':'2.2.2',jose:'6.2.13',mongoose:'9.11.2',zod:'4.6.7'});expect(pkg.scripts).toBeUndefined();
  expect(manifest.files.some(f=>/(^|\/)\.env|\.sqlite|(^|\/)\.git\//.test(f.path))).toBe(false);
});
for(const [flag,value]of [['-Database','two_sides_db'],['-User','twosides_backend'],['-AtlasHost','unexpected.invalid']])it(`CP02 fixed destination rejects ${flag}`,()=>{rejected(launch({extra:[flag,value]}));});
for(const name of ['NODE_OPTIONS','NODE_PATH','NODE_COMPILE_CACHE','NAPI_RS_ENFORCE_VERSION_CHECK','NAPI_RS_NATIVE_LIBRARY_PATH','LD_PRELOAD','MONGODB_URI'])it(`CP03 unexpected parent variable ${name} is rejected before Node starts`,()=>{
  const runId=nonce();rejected(launch({runId,env:{[name]:'synthetic-injected-marker'}}));expect(fs.existsSync(path.join(root,'runs',runId))).toBe(false);
});
it('CP04 integrity tampering is rejected before execution and the synthetic copy is restored exactly',()=>{
  const file=path.join(packageRoot,'src','config','jwt.js'),original=fs.readFileSync(file),runId=nonce();
  try{fs.writeFileSync(file,Buffer.concat([original,Buffer.from('\n// synthetic tamper\n')]));rejected(launch({runId}));expect(fs.existsSync(path.join(root,'runs',runId))).toBe(false);}
  finally{fs.writeFileSync(file,original);}
  expect(sha(fs.readFileSync(file))).toBe(sha(original));
},120000);
it('CP05 the published launcher validates native Argon2 and supervised fakes offline, closes resources and rejects reuse',()=>{
  const runId=nonce(),result=launch({runId});expect(result.error).toBeUndefined();expect(result.status).toBe(0);expect(result.stderr).toBe('');
  expect(result.stdout).toContain('Atlas permanece deshabilitado');
  const bytes=fs.readFileSync(path.join(root,'runs',runId,'result.json'),'utf8'),record=JSON.parse(bytes);
  expect(record).toMatchObject({status:'passed',mode:'offline-only',atlasConnected:false,remoteEnabled:false,argon2Synthetic:true,fixedSchema:true,fencePreserved:true,wrongTargetRejected:true,resourcesClosed:true});
  expect(bytes).not.toMatch(/credentialVerifier|privateKey|accessToken|mongodb\+srv|\$argon2id/);
  rejected(launch({runId}));expect(fs.readFileSync(path.join(root,'runs',runId,'result.json'),'utf8')).toBe(bytes);
},150000);
it('CP06 all payload hashes still match after negative cases',()=>{
  for(const f of manifest.files)expect(sha(fs.readFileSync(path.join(packageRoot,f.path)))).toBe(f.sha256);
});
