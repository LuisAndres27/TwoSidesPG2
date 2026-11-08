import './support/isolation-guard.js';
import {afterEach,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sourcePath=fileURLToPath(new URL('../../scripts/run-main-backend.ps1',import.meta.url)),source=fs.readFileSync(sourcePath,'utf8'),dirs=[];
const ps=(file,args=[])=>spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-File',file,...args],{encoding:'utf8',timeout:30000,windowsHide:true});
afterEach(()=>{for(const d of dirs.splice(0)){if(!path.resolve(d).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe fixture cleanup');fs.rmSync(d,{recursive:true,force:true});}});
it('MC01 the manual main wrapper refuses before prompting when not explicitly enabled',()=>{
  const r=ps(sourcePath);expect(r.status).toBe(1);expect(r.stdout).not.toContain('Main database password');
  expect(source).not.toMatch(/Authorization|SyntheticRun|PrepareCollections|MONGODB_URI|ConvertFrom-SecureString/);
});
it('MC02 the real main transport sends a fictitious Unicode password by stdin with no URI, arguments or environment secret',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'main-channel-'));dirs.push(root);fs.mkdirSync(path.join(root,'src'));
  const fake='  FAKE-MAIN-ñ-😀-@:$%\\  ';
  const credentialModule=new URL('../../src/modules/sync/atlas-credentials.js',import.meta.url).href;
  fs.writeFileSync(path.join(root,'src/server.js'),`import{receiveAtlasCredential,consumeAtlasCredential}from '${credentialModule}';const value=consumeAtlasCredential(await receiveAtlasCredential(process.stdin));console.log(JSON.stringify({exact:value===${JSON.stringify(fake)},argvLeak:process.argv.some(v=>v.includes(value)),envLeak:Object.values(process.env).some(v=>v.includes(value)),main:process.env.TWOSIDES_PROFILE,production:process.env.NODE_ENV,keyId:process.env.MAIN_JWT_KEY_ID}));`);
  const runner=path.join(root,'transport.ps1');
  const header=`$ErrorActionPreference='Stop'\n$fake=-join([char[]]@(${fake.split('').map(c=>c.charCodeAt(0)).join(',')}))\n$secure=ConvertTo-SecureString $fake -AsPlainText -Force\n$node='${process.execPath}'\n$backend='${root}'\n$keyPath='C:\\private\\fictitious.pem'\n$KeyId='fake-key'\n$Port=3000\n`;
  fs.writeFileSync(runner,header+source.slice(source.indexOf('$bstr=[IntPtr]::Zero')));
  const r=ps(runner);expect(r.status,r.stderr).toBe(0);expect(JSON.parse(r.stdout)).toEqual({exact:true,argvLeak:false,envLeak:false,main:'main',production:'production',keyId:'fake-key'});
  expect(r.stdout+r.stderr).not.toContain(fake);
});
