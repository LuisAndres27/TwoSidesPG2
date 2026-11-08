// B67 synthetic transport only. No driver, HTTP, remote authorization or arbitrary secret.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT='C:\\Users\\luis2\\OneDrive\\Desktop\\PRUEBA\\TWO SIDES PRUEBA\\Two-Sides PRUEBA\\backend';
const SENTINEL='B67-ONLY-FAKE-2026!';
const sha=b=>createHash('sha256').update(b).digest('hex');
const NAMES=['gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1','offline-receiver.mjs','offline-selftest.ps1','v5-reference.json'];
export async function entry(args){
 let credential,credentials,networkAttempts=0;
 const oldConnect=net.Socket.prototype.connect,oldDns=new Map();
 try{
  if(args.length!==2||!['--preflight','--receive-synthetic'].includes(args[0])||!/^[a-f0-9]{64}$/.test(args[1]))throw Error();
  const here=path.dirname(fileURLToPath(import.meta.url)),id=path.basename(here);
  if(!/^[a-f0-9]{32}$/.test(id)||!process.env.LOCALAPPDATA||here.toLowerCase()!==path.join(process.env.LOCALAPPDATA,'TwoSides','AtlasV2FirstRead',id).toLowerCase())throw Error();
  const raw=fs.readFileSync(path.join(here,'deployment.json'));if(sha(raw)!==args[1])throw Error();const d=JSON.parse(raw);
  if(d.kind!=='two-sides-b67-offline-only'||d.remoteEnabled!==false||d.runId!==id||d.backendRoot!==ROOT||Object.keys(d.files??{}).length!==NAMES.length)throw Error();
  for(const name of NAMES){const p=path.join(here,name),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||sha(fs.readFileSync(p))!==d.files[name])throw Error();}
  const {verifyBackend,regularPath}=await import('./gate.mjs');regularPath(here,{directory:true});
  // Candidate snapshot is allowed ONLY in this offline receiver. Real receiver still requires active v5.
  await verifyBackend(path.join(here,'v5-reference.json'),ROOT);
  if(args[0]==='--preflight')return {ok:true,mode:'offline-preflight',manifestVerified:true,remoteEnabled:false};
  net.Socket.prototype.connect=function(){networkAttempts++;throw Error('OFFLINE_ONLY');};
  for(const name of ['lookup','resolve','resolveSrv','resolveTxt','resolve4','resolve6','resolveAny']){oldDns.set(name,dns[name]);dns[name]=()=>{networkAttempts++;throw Error('OFFLINE_ONLY');};}
  credentials=await import(pathToFileURL(path.join(ROOT,'src/modules/sync/atlas-credentials.js')).href);
  credential=await credentials.receiveAtlasCredential(process.stdin,{timeoutMs:5000});
  const value=credentials.consumeAtlasCredential(credential);
  if(value!==SENTINEL||process.argv.some(a=>a.includes(value))||Object.values(process.env).some(v=>v.includes(value)))throw Error();
  return {ok:true,mode:'synthetic-only',exact:true,argvLeak:false,envLeak:false,manifestVerified:true,networkAttempts,remoteEnabled:false};
 }catch{return {ok:false,code:'b67_offline_rejected',networkAttempts,remoteEnabled:false};}
 finally{if(credentials)credentials.destroyAtlasCredential(credential);net.Socket.prototype.connect=oldConnect;for(const [n,f]of oldDns)dns[n]=f;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const r=await entry(process.argv.slice(2));process.stdout.write(JSON.stringify(r)+'\n');process.exitCode=r.ok?0:1;}
