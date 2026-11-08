// C.2 one-use receiver core. Orchestration only: every effect (stdin, filesystem, Atlas, C.2 execution) is injected.
// This module never opens a socket, reads the environment on its own, prints, or logs. Results carry fixed codes only.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { receiveAtlasCredential,destroyAtlasCredential } from '../src/modules/sync/atlas-credentials.js';
import { ATLAS_TARGET,ATLAS_URI,ATLAS_SCHEMA_RUN } from '../src/modules/sync/atlas-policy.js';

export const RECEIVER_PHASE='B05.4C.2F.1C.2';
export const RECEIVER_TARGET=Object.freeze({host:ATLAS_TARGET.host,user:ATLAS_TARGET.user,database:ATLAS_TARGET.database,
  authSource:'admin',authMechanism:'DEFAULT',tls:true});
// Exact names the launcher gives the child (compared case-insensitively, as Windows does). Nothing else is accepted.
export const CHILD_ENV_NAMES=Object.freeze(['LOCALAPPDATA','NODE_ENV','PATH','SYSTEMDRIVE','SYSTEMROOT','TEMP','TMP','WINDIR']);
export const RECEIVER_SCENARIOS=Object.freeze(['A','B','C']);
export const MAX_ACTIVATION_MS=4*60*60*1000;
const CODES=Object.freeze(['ARGS_REJECTED','ENV_REJECTED','ACTIVATION_REJECTED','REUSE_REJECTED','CREDENTIAL_REQUIRED',
  'CONNECTION_REJECTED','EXECUTION_FAILED','COMMIT_UNCERTAIN','CLEANUP_BLOCKED','CLOSE_FAILED']);
export class ReceiverError extends Error {
  constructor(code){super('C.2 receiver unavailable.');this.name='ReceiverError';this.code=CODES.includes(code)?code:'EXECUTION_FAILED';}
}
const reject=code=>{throw new ReceiverError(code);};
const permits=new WeakMap();
const hex=(value,length)=>typeof value==='string'&&new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const same=(a,b)=>Object.keys(b).length===Object.keys(a??{}).length&&Object.entries(b).every(([k,v])=>a?.[k]===v);
// Strict UTC instant, identical to the launcher's pattern; no other date format is accepted by either gate.
const INSTANT=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ACTIVATION_KEYS=Object.freeze(['createdAtUtc','executionId','expiresAtUtc','runId','scenarios']);

// Only these three arguments exist. There is deliberately no argument for host, user, database, URI or password.
export function parseReceiverArgs(argv){
  if(!Array.isArray(argv)||argv.length!==6)reject('ARGS_REJECTED');
  const names=['--run-id','--result','--manifest-sha256'],values={};
  for(let i=0;i<argv.length;i+=2){
    const name=argv[i];
    if(!names.includes(name)||Object.hasOwn(values,name)||typeof argv[i+1]!=='string')reject('ARGS_REJECTED');
    values[name]=argv[i+1];
  }
  if(Object.keys(values).length!==3||!hex(values['--run-id'],32)||!/^[A-F0-9]{64}$/.test(values['--manifest-sha256']))reject('ARGS_REJECTED');
  // The execution id names this one attempt; the reserved C.2A schema id can never be one.
  if(values['--run-id']===ATLAS_SCHEMA_RUN)reject('ARGS_REJECTED');
  return Object.freeze({runId:values['--run-id'],result:values['--result'],manifestSha256:values['--manifest-sha256']});
}

export function assertChildEnvironment(env){
  if(!env||typeof env!=='object')reject('ENV_REJECTED');
  const keys=Object.keys(env),upper=keys.map(k=>k.toUpperCase());
  if(new Set(upper).size!==upper.length||upper.length!==CHILD_ENV_NAMES.length||!CHILD_ENV_NAMES.every(n=>upper.includes(n)))reject('ENV_REJECTED');
  const value=name=>env[keys[upper.indexOf(name)]];
  if(value('NODE_ENV')!=='test'||typeof value('TEMP')!=='string'||value('TEMP')!==value('TMP')||
     CHILD_ENV_NAMES.some(n=>typeof value(n)!=='string'||!value(n)||/[\0\r\n]/.test(value(n))))reject('ENV_REJECTED');
}

// Remote use needs a manifest made for ONE execution. The sealed offline release can never satisfy this.
export function payloadDigest(files){
  if(!Array.isArray(files))reject('ACTIVATION_REJECTED');
  const seen=new Set();
  for(const f of files){if(typeof f?.path!=='string'||!f.path||/[\0\r\n\\:]/.test(f.path)||f.path.startsWith('/')||f.path.split('/').some(p=>p==='.'||p==='..'||!p)||seen.has(f.path)||!/^[A-F0-9]{64}$/.test(f.sha256))reject('ACTIVATION_REJECTED');seen.add(f.path);}
  return createHash('sha256').update(files.map(f=>f.path+'\0'+f.sha256+'\n').join(''),'utf8').digest('hex').toUpperCase();
}
export function assertActivation(manifest,{runId,manifestSha256,expectedManifestSha256,now,releaseId}){
  if(!manifest||typeof manifest!=='object'||!/^[A-F0-9]{64}$/.test(manifestSha256)||manifestSha256!==expectedManifestSha256)reject('ACTIVATION_REJECTED');
  if(!/^c2-[a-f0-9]{32}$/.test(manifest.releaseId)||manifest.releaseId!==releaseId||manifest.payloadSha256!==payloadDigest(manifest.files))reject('ACTIVATION_REJECTED');
  const a=manifest.activation;
  if(!a||typeof a!=='object'||JSON.stringify(Object.keys(a).sort())!==JSON.stringify(ACTIVATION_KEYS)||!INSTANT.test(a.createdAtUtc)||!INSTANT.test(a.expiresAtUtc))reject('ACTIVATION_REJECTED');
  const created=Date.parse(a.createdAtUtc),expires=Date.parse(a.expiresAtUtc);
  if(manifest.version!==2||manifest.mode!=='c2-remote-once'||manifest.remoteEnabled!==true||!same(manifest.target,RECEIVER_TARGET)||
     a?.executionId!==runId||!Number.isFinite(created)||!Number.isFinite(expires)||expires<=created||now<created-60000||now>=expires||expires-created>MAX_ACTIVATION_MS||
     a.runId!==ATLAS_SCHEMA_RUN||a.executionId===a.runId||JSON.stringify(a.scenarios)!==JSON.stringify(RECEIVER_SCENARIOS))reject('ACTIVATION_REJECTED');
}
export function issueExecutionPermit(manifest,context){
  assertActivation(manifest,context);const permit=Object.freeze(Object.create(null));
  permits.set(permit,{runId:context.runId,expires:Date.parse(manifest.activation.expiresAtUtc)});return permit;
}
export function assertExecutionPermit(permit,runId){
  const state=permits.get(permit);if(!state||state.runId!==runId||Date.now()>=state.expires)reject('ACTIVATION_REJECTED');
}
export function assertReleaseLayout(packageRoot,env,fsImpl=fs,runId){
  if(!hex(runId,32))reject('ARGS_REJECTED');
  const release=path.dirname(path.resolve(packageRoot)),runs=path.join(release,'runs'),run=path.join(runs,runId),temp=path.join(run,'temp');
  const actual=Object.entries(env).find(([k])=>k.toUpperCase()==='TEMP')?.[1];
  if(typeof actual!=='string'||path.resolve(actual)!==temp)reject('ENV_REJECTED');
  try{
    for(const p of [runs,run])if(!fsImpl.lstatSync(p).isDirectory()||fsImpl.lstatSync(p).isSymbolicLink())reject('ENV_REJECTED');
    if(!fsImpl.lstatSync(temp).isDirectory()||fsImpl.lstatSync(temp).isSymbolicLink()||fsImpl.readdirSync(temp).length)reject('ENV_REJECTED');
    const allowed=new Set(['package','manifest.json','runs','temp']);
    if(fsImpl.readdirSync(release).some(n=>!allowed.has(n)))reject('ENV_REJECTED');
  }catch(error){if(error instanceof ReceiverError)throw error;reject('ENV_REJECTED');}
}

// The launcher records the consumption of the release in the shared C2Runtime folder, OUTSIDE the release and the run directory,
// before it asks for any secret. The child refuses to start without that exact record. This resists accidental or partial deletion
// of runs/<id>; it cannot resist a process that controls the same Windows account (that account can also delete the record).
export function consumptionRecordPath(packageRoot){
  const release=path.dirname(path.resolve(packageRoot));return path.join(path.dirname(release),'consumed',path.basename(release)+'.json');
}
export function assertConsumptionRecord(packageRoot,{runId,manifestSha256},fsImpl=fs){
  const release=path.basename(path.dirname(path.resolve(packageRoot)));
  try{
    const file=consumptionRecordPath(packageRoot),stat=fsImpl.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024)reject('ACTIVATION_REJECTED');
    const record=JSON.parse(fsImpl.readFileSync(file,'utf8'));
    if(JSON.stringify(Object.keys(record).sort())!==JSON.stringify(['executionId','manifestSha256','releaseId','reservedAtUtc','version'])||record.version!==1||
       record.releaseId!==release||record.executionId!==runId||record.manifestSha256!==manifestSha256||!INSTANT.test(record.reservedAtUtc))reject('ACTIVATION_REJECTED');
  }catch(error){if(error instanceof ReceiverError)throw error;reject('ACTIVATION_REJECTED');}
}

export function runPaths(packageRoot,runId,resultArgument){
  const root=path.resolve(packageRoot),release=path.dirname(root);
  if(path.basename(root)!=='package'||!/^c2-[a-f0-9]{32}$/.test(path.basename(release)))reject('ARGS_REJECTED');
  const directory=path.join(release,'runs',runId),result=path.join(directory,'result.json');
  if(path.resolve(resultArgument)!==result)reject('ARGS_REJECTED');
  return Object.freeze({directory,result,marker:path.join(directory,'receiver-attempt.started')});
}

export function claimRun(fsImpl,paths){
  try{
    if(!fsImpl.existsSync(paths.directory)||fsImpl.existsSync(paths.result))reject('REUSE_REJECTED');
    fsImpl.closeSync(fsImpl.openSync(paths.marker,'wx'));
  }catch(error){if(error instanceof ReceiverError)throw error;reject('REUSE_REJECTED');}
}

export function receiverConfig(){
  return Object.freeze({mode:'atlas-integration-test',authorized:true,uri:ATLAS_URI,host:ATLAS_TARGET.host,database:ATLAS_TARGET.database,
    user:ATLAS_TARGET.user,tls:true,runId:ATLAS_SCHEMA_RUN,allowWrites:true,authMechanism:'DEFAULT',persistenceTest:RECEIVER_PHASE});
}

// The supervised runtime owns every option except the password: pool size, retries, timeouts, TLS and target are fixed there.
export function makeRuntimeConnector(runtime,createConnection){
  return (uri,options)=>{
    if(uri!==ATLAS_URI||typeof options?.pass!=='string'||typeof createConnection!=='function')reject('CONNECTION_REJECTED');
    const {pass}=options;
    return runtime.openClient((fixed,signal)=>createConnection(uri,{...fixed,pass},signal));
  };
}

export async function runReceiver({args,env,manifest,manifestSha256,packageRoot,stdin,openIntegration,execute,runtime,cleanup,
  fsImpl=fs,now=Date.now,credentialTimeoutMs=30000}){
  // Nothing below this line is reached unless environment, one-use manifest and arguments all agree.
  assertChildEnvironment(env);
  assertActivation(manifest,{runId:args.runId,manifestSha256,expectedManifestSha256:args.manifestSha256,now:now(),releaseId:path.basename(path.dirname(path.resolve(packageRoot)))});
  assertReleaseLayout(packageRoot,env,fsImpl,args.runId);
  assertConsumptionRecord(packageRoot,{runId:args.runId,manifestSha256:args.manifestSha256},fsImpl);
  const paths=runPaths(packageRoot,args.runId,args.result);
  claimRun(fsImpl,paths);
  const result={version:1,mode:'c2-remote-once',runId:args.runId,status:'rejected',code:'EXECUTION_FAILED',
    atlasConnected:false,uncertain:false,cleanup:'skipped',resourcesClosed:false};
  let credential,integration,failed=null,activeRuntime=runtime,execution;
  try{
    try{credential=await receiveAtlasCredential(stdin,{timeoutMs:credentialTimeoutMs});}catch{reject('CREDENTIAL_REQUIRED');}
    try{integration=await openIntegration({config:receiverConfig(),credential});}catch{reject('CONNECTION_REJECTED');}
    result.atlasConnected=true;
    activeRuntime??=integration?.runtime;
    try{execution=await execute(integration);if(execution?.completed===false)failed='EXECUTION_FAILED';}catch{failed='EXECUTION_FAILED';}
    if(execution?.completed===true){
      const number=n=>Number.isSafeInteger(n)&&n>=0?n:null;
      result.evidence={revocationFirst:execution.revocationFirst?.revocationConfirmed===true,
        noNewReceipt:execution.revocationFirst?.noNewReceipt===true,
        operationRevision:number(execution.ingestionFirst?.operationRevision),revocationRevision:number(execution.ingestionFirst?.revocationRevision),
        historicalReceiptPreserved:execution.ingestionFirst?.receiptPreserved===true,
        receiptRecovered:execution.lostResponseUnlink?.receiptRecovered===true,
        foreignBindingRejected:execution.lostResponseUnlink?.foreignBindingRejected===true,
        revokedTokenRejected:execution.reopened?.oldTokenRejected===true,persistedReceipt:execution.reopened?.persistedReceipt===true,
        cleanedDocuments:number(execution.cleanup?.documentsDeleted)};
    }
    const state=activeRuntime?.snapshot?.();
    result.uncertain=state?.uncertain===true;
    if(result.uncertain||state?.pendingWrites>0){result.cleanup='blocked';failed=result.uncertain?'COMMIT_UNCERTAIN':'CLEANUP_BLOCKED';}
    else if(!failed&&execution?.cleanup?.cleanupConfirmed===true)result.cleanup='done';
    else if(!failed&&typeof cleanup==='function'){
      try{await cleanup(integration);result.cleanup='done';}catch{result.cleanup='blocked';failed='CLEANUP_BLOCKED';}
    }
    if(!failed){result.status='passed';result.code='OK';}else result.code=failed;
  }catch(error){result.code=error instanceof ReceiverError?error.code:'EXECUTION_FAILED';}
  finally{
    destroyAtlasCredential(credential);
    let closed=true;
    if(integration){try{await integration.close();}catch{closed=false;}}
    if(activeRuntime?.finish){try{const s=await activeRuntime.finish();closed=closed&&s.closed===true&&s.activeSessions===0;
      if(s.uncertain){result.uncertain=true;result.cleanup='blocked';result.status='rejected';result.code='COMMIT_UNCERTAIN';}}catch{closed=false;}}
    result.resourcesClosed=closed;
    if(!closed&&result.status==='passed'){result.status='rejected';result.code='CLOSE_FAILED';}
    try{fsImpl.writeFileSync(paths.result,JSON.stringify(result)+'\n',{flag:'wx'});}catch{}
  }
  return Object.freeze(result);
}
