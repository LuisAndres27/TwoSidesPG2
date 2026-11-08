// B85 local-only utilities. Never load backend configuration or player storage.
import '../../tests/statistics/b80-isolation-guard.js';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
export const names={mongo:'twosides-b85-analytics',metabase:'twosides-b85-metabase',network:'twosides-b85-private',db:'twosides_b85_analytics',collection:'stats_v1_counters',reader:'b85_metabase_reader'};
export const secret=()=>randomBytes(32).toString('base64url');
export function docker(args,input=''){return new Promise((resolve,reject)=>{const env=Object.fromEntries(['SystemRoot','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));const p=spawn('docker',args,{windowsHide:true,env,stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',()=>reject(Error('B85_DOCKER_UNAVAILABLE')));p.on('exit',c=>c===0?resolve(args[0]==='logs'?out+err:out):reject(Error('B85_DOCKER_FAILED_'+(args[0]??'unknown'))));p.stdin.on('error',()=>{});p.stdin.end(input);});}
export async function mongoJs(code){return JSON.parse(await docker(['exec','-i',names.mongo,'mongosh','--quiet','--norc','--file','/dev/stdin'],`try { ${code} } catch(e) { print(JSON.stringify({failed:true,code:e.code??null})); quit(1); }`));}
export const authJs=`const fs=require('fs');const credentials=JSON.parse(fs.readFileSync('/b85-private/credentials.json','utf8'));db=db.getSiblingDB('admin');db.auth(credentials.rootUser,credentials.rootPassword);`;
export async function privateData(){return mongoJs(`${authJs} print(JSON.stringify(credentials));`);}
export async function api(path,{method='GET',body,session}={}){const r=await fetch('http://127.0.0.1:4185/api'+path,{method,headers:{'Content-Type':'application/json',...(session?{'X-Metabase-Session':session}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});const t=await r.text();let value;try{value=JSON.parse(t);}catch{value={};}if(!r.ok){const e=Error('B85_API_'+r.status+'_'+path.split('?')[0]);e.status=r.status;e.safeKeys=Object.keys(value);throw e;}return value;}
export async function session(){const c=await privateData();return (await api('/session',{method:'POST',body:{username:c.metabaseEmail,password:c.metabasePassword}})).id;}
