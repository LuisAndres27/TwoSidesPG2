// Future one-use entry; B64 does not deploy, authorize or execute this receiver remotely.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {hash,regularPath,validateAuthorization,verifyBackend,claimOnce} from './gate.mjs';
const ROOT='C:\\Users\\luis2\\OneDrive\\Desktop\\PRUEBA\\TWO SIDES PRUEBA\\Two-Sides PRUEBA\\backend';
const NAMES=['receiver.mjs','gate.mjs','probe.mjs','send-first-read.ps1'];
export async function entry(args){
 let activeConnection;
 try{
  if(args.length!==2||!['--preflight-only','--authorized-first-read'].includes(args[0])||!/^[a-f0-9]{64}$/.test(args[1]))throw new Error();
  const here=path.dirname(fileURLToPath(import.meta.url)),runId=path.basename(here),local=process.env.LOCALAPPDATA;
  if(!local||here.toLowerCase()!==path.join(local,'TwoSides','AtlasV2FirstRead',runId).toLowerCase())throw new Error();
  regularPath(here,{directory:true});const authorization=regularPath(path.join(here,'authorization.json'));
  const bytes=fs.readFileSync(authorization);if(bytes.length>16384||hash(bytes)!==args[1])throw new Error();
  const toolHashes=Object.fromEntries(NAMES.map(n=>[n,hash(fs.readFileSync(regularPath(path.join(here,n))))]));
  validateAuthorization(JSON.parse(bytes.toString('utf8')),{runId,toolHashes});
  for(const n of ['used.json','result.json'])if(fs.existsSync(path.join(here,n)))throw new Error();
  const manifest=path.join(local,'TwoSidesMainIntegrity','backend-integrity-manifest.json');
  await verifyBackend(manifest,ROOT); // Active v4 deliberately fails before stdin or Mongoose.
  if(args[0]==='--preflight-only')return {ok:true,code:'preflight_pass_no_connection'};
  // Claim exclusively BEFORE accepting stdin; any failure consumes this authorization.
  claimOnce(here,runId);
  const load=relative=>import(pathToFileURL(path.join(ROOT,relative)).href);
  const [{runReadProbe,TARGET},credentials,{MAIN_SCHEMA},{classifyAtlasError}]=await Promise.all([
   import('./probe.mjs'),load('src/modules/sync/atlas-credentials.js'),load('src/main/schema-inventory.js'),load('src/modules/sync/atlas-error-diagnostic.js')]);
  const require=createRequire(path.join(ROOT,'package.json'));const mongoose=require('mongoose');
  let result=await runReadProbe({config:TARGET,schema:MAIN_SCHEMA,integrity:()=>verifyBackend(manifest,ROOT),
   readCredential:()=>credentials.receiveAtlasCredential(process.stdin,{timeoutMs:30000}),
   credentials:{consume:credentials.consumeAtlasCredential,destroy:credentials.destroyAtlasCredential},classify:classifyAtlasError,
   connect:async(uri,options)=>{
    const c=mongoose.createConnection(uri,options);activeConnection=c;c.on('error',()=>{});
    try{await c.asPromise();return c;}catch(error){try{await c.close();activeConnection=null;}catch{throw new Error('first_read_close_failed');}throw error;}
   }});
  activeConnection=null;
  // Successful read capability alone must never approve an incomplete application role.
  if(result.ok&&result.runtimePrivilegesVerified!==true)result={...result,ok:false,code:'runtime_permissions_incomplete'};
  fs.writeFileSync(path.join(here,'result.json'),JSON.stringify(result),{flag:'wx'});return result;
 }catch{return {ok:false,code:'first_read_precondition_or_close_failure',readOnly:true};}
 finally{if(activeConnection)try{await activeConnection.close();}catch{}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const result=await entry(process.argv.slice(2));process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.ok?0:1;
}
