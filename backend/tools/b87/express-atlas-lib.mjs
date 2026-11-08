// B87 — persistent statistics ingestion server for a SINGLE authorized test game, library part (no Atlas knowledge, no guard, no environment, no secrets).
// It wraps the UNCHANGED statistics-only-v1 endpoint (createStatisticsOfflineApp) and adds only the hand-over of one technical credential through a kit folder:
//   <kitDir>/installation.json   written by the game:   {"schema":1,"installationId":"<uuid>"}            (not a secret)
//   <kitDir>/kit.json            written by this server: {"schema":1,"audience":"http://127.0.0.1:PORT","token":"<43 chars>","expiresAtMs":N,"installationId":"<uuid>"}
// Rules: listens on 127.0.0.1 only; binds the FIRST installation id it sees and ignores any other; the token is random per start, lives in memory and in kit.json only,
// is renewed before it expires (lifetime 1 h, renewal every 20 min) and kit.json is deleted on close. Nothing is logged except fixed codes and counts.
import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';

export const KIT_FILES=Object.freeze({installation:'installation.json',credential:'kit.json'});
export const TOKEN_LIFETIME_MS=3600000,RENEW_EVERY_MS=1200000,POLL_EVERY_MS=2000,MAX_FILE_BYTES=512;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class ExpressKitError extends Error{constructor(code){super('Express kit rejected: '+code);this.code=code;this.name='ExpressKitError';}}

function readSmallJson(file){
 let fd;try{fd=fs.openSync(file,'r');}catch{return null;}
 try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>MAX_FILE_BYTES)return null;const buffer=Buffer.alloc(stat.size);fs.readSync(fd,buffer,0,stat.size,0);return JSON.parse(buffer.toString('utf8'));}
 catch{return null;}finally{fs.closeSync(fd);}
}
function writeAtomic(file,object){const temp=file+'.'+randomBytes(4).toString('hex')+'.tmp';fs.writeFileSync(temp,JSON.stringify(object),{mode:0o600});fs.renameSync(temp,file);}

export async function startKitExpress({store,profile='statistics-atlas-prepared',kitDir,port=4187,now=Date.now,tokenLifetimeMs=TOKEN_LIFETIME_MS,renewEveryMs=RENEW_EVERY_MS,pollEveryMs=POLL_EVERY_MS,limiter,requestBudgetMs}={}){
 if(typeof kitDir!=='string'||!path.isAbsolute(kitDir))throw new ExpressKitError('kit_dir');
 if(!Number.isInteger(port)||port<1024||port>65535)throw new ExpressKitError('port');
 if(!Number.isInteger(tokenLifetimeMs)||tokenLifetimeMs<10000||tokenLifetimeMs>3600000||!Number.isInteger(renewEveryMs)||renewEveryMs<1000||renewEveryMs>=tokenLifetimeMs)throw new ExpressKitError('lifetime');
 fs.mkdirSync(kitDir,{recursive:true});
 const credentialFile=path.join(kitDir,KIT_FILES.credential),installationFile=path.join(kitDir,KIT_FILES.installation);
 try{fs.rmSync(credentialFile,{force:true});}catch{throw new ExpressKitError('kit_dir_not_writable');}   // a stale token from a previous run never survives
 const identities=new SyntheticStatisticsIdentity(),token=randomBytes(32).toString('base64url');   // 43 characters, as the game requires
 const app=createStatisticsOfflineApp({profile,identities,store,now,...(limiter?{limiter}:{}),...(requestBudgetMs?{requestBudgetMs}:{})});
 const server=app.listen(port,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const audience='http://127.0.0.1:'+server.address().port;
 const state={installationId:null,issued:0,ignoredOtherInstallations:0};
 const issue=()=>{
  identities.issueSynthetic({installationId:state.installationId,authorizedSyntheticToken:token,lifetimeMs:tokenLifetimeMs,now:now()});
  writeAtomic(credentialFile,{schema:1,audience,token,expiresAtMs:now()+tokenLifetimeMs,installationId:state.installationId});state.issued++;
 };
 const poll=()=>{
  const value=readSmallJson(installationFile);
  if(!value||value.schema!==1||typeof value.installationId!=='string'||!UUID.test(value.installationId))return;
  if(state.installationId===null){state.installationId=value.installationId;issue();}
  else if(state.installationId!==value.installationId)state.ignoredOtherInstallations++;
 };
 poll();
 const pollTimer=setInterval(poll,pollEveryMs),renewTimer=setInterval(()=>{if(state.installationId)issue();},renewEveryMs);
 pollTimer.unref?.();renewTimer.unref?.();
 let closed=false;
 return {audience,port:server.address().port,state,app,
  async close(){if(closed)return;closed=true;clearInterval(pollTimer);clearInterval(renewTimer);
   if(state.installationId)identities.revokeSynthetic(token);
   try{fs.rmSync(credentialFile,{force:true});}catch{/* best effort: the token is also dead with the process */}
   await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});}};
}
