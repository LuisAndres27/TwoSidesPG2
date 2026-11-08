// B87 — DISPOSABLE local stack used only to exercise tools/b87/metabase-provision.mjs: a NEW authenticated MongoDB (holding a copy of the aggregate counters,
// exactly like the Atlas analytical database) and a NEW Metabase from the already-present image metabase/metabase:v0.65.2 (same digest as B85).
// Everything is created with its own names/labels on its own private network and removed afterwards. The owner's containers (twosides-b811-mongo,
// twosides-b85-metabase, twosides-b85-analytics) and B85 data are never inspected, started, stopped or modified. Opt-in: B87_REAL_TESTS=1. Never Atlas, never AWS.
import http from 'node:http';
import {HARDENED_ENV,HARDENED_FLAGS,REQUIRED_CAPS} from './hardening.js';
import {execFile,spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {generateDemoEvents,expectedTotals} from '../../tools/b84/generator.js';
import {createB81DriverFixture} from '../statistics/b81-driver-double.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {seedThroughHttp} from '../../tools/b84/seed.js';

export const NAMES=Object.freeze({network:'twosides-b87-test-net',mongo:'twosides-b87-test-mongo',metabase:'twosides-b87-test-metabase',label:'twosides.b87.disposable'});
export const B85_METABASE_IMAGE='metabase/metabase@sha256:b62ac14872e9992d28218a2264d99484e0707064aae9fb594d8fbb3bc1518a9e';   // v0.65.2, the image of B85
// B87 may be tested against another pinned image (the one chosen for AWS) without editing this file: B87_METABASE_IMAGE=metabase/metabase@sha256:<64 hex>.
export const METABASE_IMAGE=(()=>{const value=process.env.B87_METABASE_IMAGE;if(value===undefined)return B85_METABASE_IMAGE;if(!/^metabase\/metabase@sha256:[0-9a-f]{64}$/.test(value))throw Error('B87_METABASE_IMAGE must be metabase/metabase@sha256:<digest>');return value;})();
export {HARDENED_ENV,HARDENED_FLAGS,REQUIRED_CAPS};
export const DATA_VOLUME='twosides-b87-test-metabase-data';
export const ANALYTICS_DB='twosides_statistics_analytics_demo',COLLECTION='stats_v1_counters',READER='twosides_statistics_reader_v1';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const dockerEnv=()=>Object.fromEntries(['SystemRoot','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','TEMP','TMP'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const docker=(...args)=>new Promise((resolve,reject)=>execFile('docker',args,{windowsHide:true,timeout:180000,maxBuffer:1<<22,env:dockerEnv()},(e,out)=>e?reject(Error('docker command failed: '+args.slice(0,2).join(' '))):resolve(out.trim())));
const dockerStdin=(args,input)=>new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,env:dockerEnv()});let out='';p.stdout.on('data',d=>out+=d);p.on('error',()=>reject(Error('docker unavailable')));p.on('close',code=>code===0?resolve(out.trim()):reject(Error('docker exec failed')));p.stdin.end(input);});
const secret=()=>randomBytes(24).toString('base64url');

async function ownedOrAbsent(name,kind){
 try{const inspect=JSON.parse(await docker(kind,'inspect',name))[0],labels=(kind==='container'?inspect.Config?.Labels:inspect.Labels)??{};if(labels[NAMES.label]!=='true')throw Error('foreign '+kind+' with a disposable name');return true;}
 catch(e){if(/foreign/.test(e.message))throw e;return false;}
}
export async function removeStack(){
 for(const name of [NAMES.metabase,NAMES.mongo])if(await ownedOrAbsent(name,'container'))await docker('rm','-f','-v',name).catch(()=>{});   // -v also removes the anonymous volumes of the image
 if(await ownedOrAbsent(DATA_VOLUME,'volume'))await docker('volume','rm','-f',DATA_VOLUME).catch(()=>{});
 if(await ownedOrAbsent(NAMES.network,'network'))await docker('network','rm',NAMES.network).catch(()=>{});
}

// A stand-in for Caddy: it forwards to Metabase and adds `X-Forwarded-Proto: https`, exactly what the AWS proxy does. With MB_SITE_URL and MB_REDIRECT_ALL_REQUESTS_TO_HTTPS set,
// Metabase redirects every plain-HTTP request to https://<site-url>, so the hardened server is only usable behind such a proxy. Loopback only.
export async function startTlsTerminatingProxyStandIn(targetPort){
 const server=http.createServer((req,res)=>{
  const headers={...req.headers,'x-forwarded-proto':'https'};
  const upstream=http.request({host:'127.0.0.1',port:targetPort,method:req.method,path:req.url,headers},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);});
  upstream.on('error',()=>{res.statusCode=502;res.end();});req.pipe(upstream);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {baseUrl:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();})};
}

// The same deterministic dataset as the Atlas seed, aggregated by the REAL repository into {_id, values} documents (the shape of the published copy).
export async function analyticsDataset(){
 const {atlasSyntheticEvents}=await import('../../tools/b86/session.js'),{events}=atlasSyntheticEvents();
 const f=await createB81DriverFixture({retentionPolicy:'b82-run-hybrid-v1'}),identities=new SyntheticStatisticsIdentity();f.clock.now=Date.now();
 const app=createStatisticsOfflineApp({profile:'statistics-b81-local-test',identities,store:f.repository,now:()=>f.clock.now,limiter:{consume(){}}}),server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(r=>server.once('listening',r));
  await seedThroughHttp({baseUrl:'http://127.0.0.1:'+server.address().port,events,issue:id=>identities.issueSynthetic({installationId:id,lifetimeMs:3600000,now:f.clock.now})});
  const flat=await f.repository.aggregates(),byPeriod=new Map();
  for(const [id,n] of Object.entries(flat)){const [period,key]=id.split('|');if(!byPeriod.has(period))byPeriod.set(period,{});byPeriod.get(period)[key]=n;}
  return {docs:[...byPeriod].map(([_id,values])=>({_id,values})),oracle:expectedTotals(events),events};
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections?.();});await f.close();}
}

export async function startStack({port=4287,mechanisms=['SCRAM-SHA-1'],hardened=true}={}){
 if(process.env.B87_REAL_TESTS!=='1')throw Error('B87 real tests disabled');
 await removeStack();
 const rootPassword=secret(),readerPassword=secret(),label=['--label',NAMES.label+'=true'];
 await docker('network','create',...label,NAMES.network);
 await docker('volume','create',...label,DATA_VOLUME);   // H2 application database on a volume, like /opt/metabase-data on the AWS server
 await docker('run','-d','--name',NAMES.mongo,...label,'--network',NAMES.network,'--memory','512m','--cpus','1','-e','MONGO_INITDB_ROOT_USERNAME=root','-e','MONGO_INITDB_ROOT_PASSWORD='+rootPassword,'mongo:8.0','--auth');
 const shell=script=>dockerStdin(['exec','-i',NAMES.mongo,'mongosh','--quiet','--norc','--file','/dev/stdin'],`const a=db.getSiblingDB('admin');a.auth('root',${JSON.stringify(rootPassword)});${script}`);
 for(let i=0;;i++){try{await shell('print("ready")');break;}catch{if(i>60)throw Error('disposable MongoDB did not start');await pause(1000);}}
 const {docs,oracle,events}=await analyticsDataset();
 // Exactly the reader's privileges of the Atlas matrix: find on the counters, listCollections and dbStats on the analytical database; SCRAM mechanisms as requested.
 await shell(`const t=db.getSiblingDB(${JSON.stringify(ANALYTICS_DB)});t.createCollection(${JSON.stringify(COLLECTION)});t.getCollection(${JSON.stringify(COLLECTION)}).insertMany(${JSON.stringify(docs)});
  a.createRole({role:'two_sides_statistics_reader_v1',privileges:[{resource:{db:${JSON.stringify(ANALYTICS_DB)},collection:''},actions:['listCollections','dbStats']},{resource:{db:${JSON.stringify(ANALYTICS_DB)},collection:${JSON.stringify(COLLECTION)}},actions:['find']}],roles:[]});
  a.createUser({user:${JSON.stringify(READER)},pwd:${JSON.stringify(readerPassword)},roles:['two_sides_statistics_reader_v1'],mechanisms:${JSON.stringify(mechanisms)}});print("seeded")`);
 await docker('run','-d','--name',NAMES.metabase,...label,'--network',NAMES.network,'--memory','1536m','--cpus','2','-p',`127.0.0.1:${port}:3000`,'-v',DATA_VOLUME+':/metabase-data','-e','MB_DB_FILE=/metabase-data/metabase','-e','JAVA_OPTS=-Xmx1024m','-e','MB_ANON_TRACKING_ENABLED=false','-e','MB_CHECK_FOR_UPDATES=false',
  ...(hardened?[...HARDENED_FLAGS,'-e','MB_ENCRYPTION_SECRET_KEY='+randomBytes(32).toString('base64'),'-e','MB_SESSION_SECRET_KEY='+randomBytes(32).toString('base64'),...HARDENED_ENV.flatMap(v=>['-e',v])]:[]),METABASE_IMAGE);
 const directUrl=`http://127.0.0.1:${port}`;
 for(let i=0;;i++){try{const r=await fetch(directUrl+'/api/health',{headers:{'X-Forwarded-Proto':'https'},redirect:'manual'});if(r.ok&&(await r.json()).status==='ok')break;}catch{}if(i>180)throw Error('disposable Metabase did not start');await pause(2000);}
 const proxy=hardened?await startTlsTerminatingProxyStandIn(port):undefined,baseUrl=proxy?proxy.baseUrl:directUrl;
 return {baseUrl,mongoHost:NAMES.mongo,readerPassword,rootPassword,docs,oracle,events,shell,hardened,image:METABASE_IMAGE,async stop(){await proxy?.close();await removeStack();}};
}
