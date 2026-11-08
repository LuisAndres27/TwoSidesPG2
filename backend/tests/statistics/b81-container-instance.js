// B81.1 — Opt-in ONLY. Importing this module does not launch or contact any server.
// Targets exactly ONE owner-prepared container: twosides-b811-mongo (mongo:8.0), published only on 127.0.0.1:27028, replica set rsB811.
// Everything is verified BEFORE any write: Docker context is local, the container is that one (name, image, command, port bindings, mounts),
// the server behind 127.0.0.1:27028 is a mongod 8.0.x primary of rsB811 and holds no foreign database. No URI from the environment, no credentials.
// It never stops, removes or recreates the container (restart only with explicit authorization) and drops only databases it created itself.
import './b80-isolation-guard.js';
import {execFile} from 'node:child_process';import {randomUUID} from 'node:crypto';import {MongoClient} from 'mongodb';
import {b81LocalConfiguration,B81_OWNED_CONTAINER as C} from '../../src/modules/statistics/mongo-local-policy.js';
import {provisionB81Statistics} from '../../src/modules/statistics/mongo-schema.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {BOUNDED_RETENTION,assertRetentionPolicy} from '../../src/modules/statistics/retention-policy.js';
import {schemaForRetention} from '../../src/modules/statistics/mongo-schema.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// Minimal environment for the Docker CLI: no DOCKER_HOST/DOCKER_CONTEXT overrides and no MongoDB variables are forwarded.
const dockerEnv=()=>Object.fromEntries(['SystemRoot','PATH','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','TEMP','TMP'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const docker=(...args)=>new Promise((resolve,reject)=>execFile('docker',args,{windowsHide:true,timeout:90000,maxBuffer:1<<20,env:dockerEnv()},(e,stdout)=>e?reject(Error('B81 docker command failed')):resolve(stdout)));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function inspectOwnedContainer(){
 // The CLI must talk to the LOCAL Docker Desktop engine, never to a remote context.
 const endpoint=(await docker('context','inspect','--format','{{.Endpoints.docker.Host}}')).trim();
 if(!/^npipe:\/\/\/\/\.\/pipe\/docker(Desktop)?(Linux)?Engine$|^npipe:\/\/\/\/\.\/pipe\/docker_engine$/.test(endpoint))throw Error('B81 docker endpoint rejected');
 const [c]=JSON.parse(await docker('inspect',C.name));
 const volumes=(c.Mounts??[]).map(m=>m.Destination).sort();
 if(!c||c.Name!=='/'+C.name||c.Config?.Image!==C.image||c.State?.Running!==true||c.State?.Restarting||c.State?.Paused||
    !same(c.Config.Cmd,['--replSet',C.replicaSet,'--bind_ip_all'])||c.HostConfig?.Privileged||c.HostConfig?.NetworkMode!=='bridge'||
    !same(c.HostConfig.PortBindings,{'27017/tcp':[{HostIp:C.host,HostPort:String(C.port)}]})||
    !same(c.NetworkSettings.Ports,{'27017/tcp':[{HostIp:C.host,HostPort:String(C.port)}]})||
    !same(volumes,['/data/configdb','/data/db'])||(c.Mounts??[]).some(m=>m.Type!=='volume'))
  throw Error('B81 owned container rejected');
 return {id:c.Id,image:c.Image,startedAt:c.State.StartedAt};
}
function newClient(){return new MongoClient('mongodb://'+C.host+':'+C.port,{directConnection:true,replicaSet:C.replicaSet,retryWrites:false,maxPoolSize:4,minPoolSize:0,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,timeoutMS:15000,monitorCommands:false,appName:'TwoSides-B811-OwnedContainer'});}
// Server identity independent of Docker: mongod 8.0.x, PID 1 of its container, replica set rsB811, single member, writable primary, transaction-capable.
export async function identifyServer(client){
 const admin=client.db('admin'),hello=await admin.command({hello:1},{maxTimeMS:3000}),build=await admin.command({buildInfo:1},{maxTimeMS:3000}),
  status=await admin.command({serverStatus:1},{maxTimeMS:3000}),opts=await admin.command({getCmdLineOpts:1},{maxTimeMS:3000});
 if(status.process!=='mongod'||!/^8\.0\.\d+$/.test(build.version)||hello.setName!==C.replicaSet||hello.isWritablePrimary!==true||
    !(hello.logicalSessionTimeoutMinutes>0)||hello.hosts?.length!==1||opts.parsed?.replication?.replSet!==C.replicaSet||status.pid!==1)
  throw Error('B81 owned server identity rejected');
 return {version:build.version,gitVersion:build.gitVersion,maxWireVersion:hello.maxWireVersion,host:status.host,uptime:status.uptime};
}
export async function startOwnedB81Container({enabled=false,keyCheck,restartAuthorized=false,retentionPolicy=BOUNDED_RETENTION}={}){
 if(enabled!==true||!/^[a-f0-9]{64}$/.test(keyCheck??''))throw Error('B81 container authorization required');
 assertRetentionPolicy(retentionPolicy);
 let container=await inspectOwnedContainer();
 const runId=randomUUID().replaceAll('-','');
 const config=b81LocalConfiguration({enabled:true,runId,host:C.host,port:C.port,database:'twosides_statistics_b81_'+runId,replicaSet:C.replicaSet,ownedContainer:C.name});
 let client=newClient(),ready=false,closed=false,server,created=false;
 const connectWhenReady=async()=>{const end=Date.now()+90000;while(Date.now()<end){const candidate=newClient();try{await candidate.connect();await identifyServer(candidate);return candidate;}catch{try{await candidate.close();}catch{}await pause(1000);}}throw Error('B81 owned container did not return as primary');};
 // Cleanup helper: only the database this run created (name pattern + the run's own seed document).
 const dropOwn=async()=>{if(!created)return;const observed=await inspectOwnedContainer();if(observed.id!==container.id||observed.image!==container.image)throw Error('B81 cleanup container changed');await identifyServer(client);const db=client.db(config.database),seed=await db.collection('stats_v1_meta').findOne({_id:'statistics-v1'});
  if(!/^twosides_statistics_b81_[a-f0-9]{32}$/.test(config.database)||seed?._id!=='statistics-v1'||seed.keyCheck!==keyCheck||seed.schema!==schemaForRetention(retentionPolicy))throw Error('B81 cleanup ownership rejected');await db.dropDatabase();created=false;};
 try{
  await client.connect();server=await identifyServer(client);
  const databases=await client.db('admin').command({listDatabases:1,nameOnly:true},{maxTimeMS:3000});
  // Other fixtures of this suite are sequential and drop their own database before the next starts: anything else is foreign.
  if(databases.databases.some(d=>!['admin','config','local'].includes(d.name)))throw Error('B81 unexpected database in the owned container');
  await provisionB81Statistics(client.db(config.database),{keyCheck,emptyDatabaseAuthorized:true,retentionPolicy});created=true;ready=true;
 }catch{try{await dropOwn();}catch{}try{await client.close();}catch{}throw Error('B81 owned container preparation failed');}
 return Object.freeze({config,serverVersion:server.version,server,get container(){return container;},ownedContainer:true,restartAuthorized,
  async adapter({checkpoint}={}){if(!ready||closed)throw Error('B81 runtime inactive');const observed=await inspectOwnedContainer();if(observed.id!==container.id||observed.image!==container.image)throw Error('B81 runtime container changed');await identifyServer(client);return registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db:client.db(config.database),config,keyCheck,checkpoint,retentionPolicy}));},
  async restart(){
   if(closed)throw Error('B81 runtime closed');
   if(restartAuthorized!==true)throw Error('B81 container restart not authorized');
   ready=false;await client.close();
   // Authorized, controlled restart of the owner's container; it must come back as the same container (same ID).
   const before=container.id;await docker('restart','--time','20',C.name);
   // mongod needs a few seconds to come back; a client whose first connect failed is closed for good, so every attempt builds a fresh one.
   client=await connectWhenReady();container=await inspectOwnedContainer();
   if(container.id!==before)throw Error('B81 container identity changed');
   server=await identifyServer(client);ready=true;
  },
  async close(){
   if(closed)return;closed=true;ready=false;
   try{await dropOwn();}
   catch(first){
    // The working client may be unusable after a failed restart: retry the cleanup of THIS run's database with a fresh verified connection.
    try{await client.close();}catch{}
    client=await connectWhenReady();await dropOwn();
   }finally{try{await client.close();}catch{}}
  }
 });
}
