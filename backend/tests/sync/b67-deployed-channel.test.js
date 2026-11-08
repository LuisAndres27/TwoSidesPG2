import './support/isolation-guard.js';
import {it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const staged=path.join(process.env.LOCALAPPDATA,'TwoSides','AtlasV2FirstRead','aeec6c0d34394a65817de04755d88535');
// Negative attacks target disposable copies; NEVER mutate the deployed/externally referenced artifacts.
function fixture(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'b67-only-fake-'));
 const base=path.join(temp,'TwoSides'),parent=path.join(base,'AtlasV2FirstRead'),id=randomUUID().replaceAll('-',''),dir=path.join(parent,id);
 fs.mkdirSync(dir,{recursive:true});
 const d=JSON.parse(fs.readFileSync(path.join(staged,'deployment.json')));d.runId=id;
 const files=Object.keys(d.files);for(const n of files)fs.copyFileSync(path.join(staged,n),path.join(dir,n));
 const seal=()=>{const bytes=Buffer.from(JSON.stringify(d));fs.writeFileSync(path.join(dir,'deployment.json'),bytes);return hash(bytes);};
 const run=(args,input)=>spawnSync(process.execPath,[path.join(dir,'offline-receiver.mjs'),...args],{env:{SystemRoot:process.env.SystemRoot,windir:process.env.windir,LOCALAPPDATA:temp},input,encoding:'utf8',timeout:25000,windowsHide:true});
 return {dir,d,seal,run,dispose(){
  if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe fixture');
  for(const n of [...files,'deployment.json']){const p=path.join(dir,n);if(fs.existsSync(p))fs.unlinkSync(p);}
  for(const p of [dir,parent,base,temp])fs.rmdirSync(p);
 }};
}
it.each(['changed-code','changed-manifest','bad-seal','unexpected-args','SHA-1','remote-enabled'])('B67 disposable copy rejects %s without an accepted credential',kind=>{
 const f=fixture();try{
  if(kind==='changed-code')fs.appendFileSync(path.join(f.dir,'probe.mjs'),'\n// altered copy\n');
  if(kind==='changed-manifest'){fs.appendFileSync(path.join(f.dir,'v5-reference.json'),' ');f.d.files['v5-reference.json']=hash(fs.readFileSync(path.join(f.dir,'v5-reference.json')));}
  if(kind==='remote-enabled')f.d.remoteEnabled=true;
  const args=['--preflight',f.seal()];if(kind==='bad-seal')args[1]='0'.repeat(64);if(kind==='unexpected-args')args.push('--extra');if(kind==='SHA-1')args.push('--authMechanism','SCRAM-SHA-1');
  const r=f.run(args);expect(r.status,r.stderr).toBe(1);expect(JSON.parse(r.stdout)).toMatchObject({ok:false,code:'b67_offline_rejected',networkAttempts:0,remoteEnabled:false});
 }finally{f.dispose();}
});
it('B67 refuses a non-sentinel synthetic input without reporting or persisting it',()=>{
 const f=fixture();try{
  const fake='FAKE-REJECT-B67-NOT-A-CREDENTIAL',b=Buffer.from(fake),frame=Buffer.alloc(b.length+4);frame.writeUInt32BE(b.length);b.copy(frame,4);
  const r=f.run(['--receive-synthetic',f.seal()],frame);expect(r.status,r.stderr).toBe(1);expect(r.stdout+r.stderr).not.toContain(fake);expect(JSON.parse(r.stdout)).toMatchObject({ok:false,networkAttempts:0,remoteEnabled:false});
  expect(fs.readdirSync(f.dir).sort()).toEqual([...Object.keys(f.d.files),'deployment.json'].sort());
 }finally{f.dispose();}
});
it('B67 stage has no remote capability or receipt and the four original components retain B66 hashes',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(staged,'deployment.json')));expect(d.remoteEnabled).toBe(false);
 const expected={'gate.mjs':'e1fa695193bb716dc45db24dc27f9b36625cbb5e1313391d87071040d3f8a695','probe.mjs':'fb7b63c429c3cde1055561038173068e0525f247f70ee064b8d248832b032080','receiver.mjs':'11fc67bc135ef4ccac0a8623ec5529818a400829fe12d428da68ae3473c13354','send-first-read.ps1':'21ab67270d8eb7f6ee50b06b38298ec6db9628e70ec1377d073f8c0ded7ebbde'};
 for(const [n,sha]of Object.entries(expected))expect(hash(fs.readFileSync(path.join(staged,n)))).toBe(sha);
 expect(fs.readdirSync(staged).sort()).toEqual([...Object.keys(d.files),'deployment.json'].sort());
});
