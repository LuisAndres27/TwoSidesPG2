// Opt-in ONLY. Importing this module does not launch or contact any server.
// Requires an already installed, independently approved mongod executable + digest.
import './b80-isolation-guard.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';
import {spawn} from 'node:child_process';import {createHash,randomUUID} from 'node:crypto';import {MongoClient} from 'mongodb';
import {b81LocalConfiguration} from '../../src/modules/statistics/mongo-local-policy.js';
import {provisionB81Statistics} from '../../src/modules/statistics/mongo-schema.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
const pause=()=>new Promise(r=>setTimeout(r,100));
function noLinks(file){let cursor=path.resolve(file);for(;;){const s=fs.lstatSync(cursor);if(s.isSymbolicLink())throw Error('B81 link rejected');const next=path.dirname(cursor);if(next===cursor)break;cursor=next;}}
async function reservePort(){const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});const port=s.address().port;await new Promise(r=>s.close(r));return port;}
export async function startOwnedB81Mongo({enabled=false,mongodExecutable,expectedSha256,keyCheck}={}){
 if(enabled!==true||typeof mongodExecutable!=='string'||!path.isAbsolute(mongodExecutable)||!/^[a-fA-F0-9]{64}$/.test(expectedSha256??'')||!/^[a-f0-9]{64}$/.test(keyCheck??''))throw Error('B81 local binary authorization required');
 noLinks(mongodExecutable);const exe=fs.lstatSync(mongodExecutable);
 if(!exe.isFile()||exe.nlink!==1||createHash('sha256').update(fs.readFileSync(mongodExecutable)).digest('hex')!==expectedSha256.toLowerCase())throw Error('B81 local binary rejected');
 const temp=fs.realpathSync(os.tmpdir());noLinks(temp);if(/onedrive/i.test(temp))throw Error('B81 temporary root rejected');
 const directory=fs.mkdtempSync(path.join(temp,'twosides-b81-')),runId=randomUUID().replaceAll('-',''),dbPath=path.join(directory,'db');fs.mkdirSync(dbPath);
 fs.writeFileSync(path.join(directory,'runtime.identity.json'),JSON.stringify({runId,purpose:'b81-owned-mongo'}),{flag:'wx'});
 const config=b81LocalConfiguration({enabled:true,runId,host:'127.0.0.1',port:await reservePort(),database:'twosides_statistics_b81_'+runId,replicaSet:'b81_'+runId});
 const args=['--dbpath',dbPath,'--bind_ip','127.0.0.1','--port',String(config.port),'--replSet',config.replicaSet,'--nounixsocket'];
 let child,client,ready=false,closed=false,serverVersion;
 const alive=()=>child&&child.exitCode===null&&child.signalCode===null;
 const newClient=initialized=>new MongoClient('mongodb://127.0.0.1:'+config.port,{directConnection:true,...(initialized?{replicaSet:config.replicaSet}:{}),retryWrites:false,maxPoolSize:4,minPoolSize:0,serverSelectionTimeoutMS:1000,connectTimeoutMS:1000,socketTimeoutMS:10000,timeoutMS:10000,monitorCommands:false,appName:'TwoSides-B81-OwnedLocal'});
 async function launch(initialized=true){
  noLinks(directory);noLinks(dbPath);
  child=spawn(mongodExecutable,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:temp,TMP:temp}});
  let output='',error=false;child.once('error',()=>{error=true;});child.stdout.on('data',b=>{output=(output+b.toString('utf8')).slice(-65536);});child.stderr.on('data',()=>{});
  const deadline=Date.now()+30000;while(!output.includes('Waiting for connections')){if(error||!alive()||Date.now()>deadline)throw Error('B81 owned Mongo startup unavailable');await pause();}
  // An ephemeral-port race cannot authorize another service: ready output must belong to
  // this newly spawned child, then server PID AND dbPath must match before any DB writes.
  client=newClient(initialized);
  await client.connect();await identify();
 }
 async function identify(){
  if(!alive())throw Error('B81 child no longer owned');
  const admin=client.db('admin'),status=await admin.command({serverStatus:1},{maxTimeMS:2000}),opts=await admin.command({getCmdLineOpts:1},{maxTimeMS:2000});
  if(status.pid!==child.pid||path.resolve(opts.parsed?.storage?.dbPath??'')!==dbPath||opts.parsed?.net?.bindIp!=='127.0.0.1'||opts.parsed?.net?.port!==config.port||opts.parsed?.replication?.replSetName!==config.replicaSet)throw Error('B81 server identity rejected');
 }
 async function primary(){const end=Date.now()+30000;while(Date.now()<end){try{const h=await client.db('admin').command({hello:1},{maxTimeMS:1000});if(h.isWritablePrimary&&h.setName===config.replicaSet&&h.logicalSessionTimeoutMinutes>0&&h.maxWireVersion>=7)return;}catch{}if(!alive())break;await pause();}throw Error('B81 transaction topology unavailable');}
 async function stop(){
  let graceful=false;
  if(client&&alive())try{await identify();try{await client.db('admin').command({shutdown:1,force:false,timeoutSecs:5},{timeoutMS:7000});graceful=true;}catch(e){if(['MongoNetworkError','MongoServerSelectionError','MongoNetworkTimeoutError'].includes(e?.name))graceful=true;}}catch{/* no command to an unverified service */}
  if(client){try{await client.close();}finally{client=undefined;}}
  // Startup/identity failure: terminate ONLY our own ChildProcess, never a port/service/PID search.
  if(!graceful&&alive())child.kill();
  const end=Date.now()+10000;while(alive()&&Date.now()<end)await pause();if(alive())throw Error('B81 owned Mongo still running; no cleanup');return graceful;
 }
 try{
  await launch(false);await client.db('admin').command({replSetInitiate:{_id:config.replicaSet,members:[{_id:0,host:'127.0.0.1:'+config.port}]}},{timeoutMS:5000});await primary();await identify();await client.close();client=newClient(true);await client.connect();await identify();
  const databases=await client.db('admin').command({listDatabases:1,nameOnly:true},{maxTimeMS:2000});if(databases.databases.some(d=>!['admin','config','local'].includes(d.name)))throw Error('B81 unexpected local database');
  serverVersion=(await client.db('admin').command({buildInfo:1},{maxTimeMS:2000})).version;
  await provisionB81Statistics(client.db(config.database),{keyCheck,emptyDatabaseAuthorized:true});ready=true;
 }catch{try{await stop();}catch{}throw Error('B81 isolated Mongo preparation failed; retain owned directory for inspection');}
 return Object.freeze({directory,config,serverVersion,get pid(){return child.pid;},
  async adapter({checkpoint}={}){if(!ready||closed)throw Error('B81 runtime inactive');await identify();await primary();return registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db:client.db(config.database),config,keyCheck,checkpoint}));},
  async restart(){if(closed)throw Error('B81 runtime closed');ready=false;if(!await stop())throw Error('B81 graceful restart not proven');await launch();await primary();await identify();ready=true;},
  async close(){if(closed)return;const graceful=await stop();closed=true;ready=false;if(!graceful)throw Error('B81 shutdown not proven; owned directory retained');
   const identity=JSON.parse(fs.readFileSync(path.join(directory,'runtime.identity.json'),'utf8'));
   if(identity.runId!==runId||identity.purpose!=='b81-owned-mongo'||path.dirname(directory)!==temp||!path.basename(directory).startsWith('twosides-b81-'))throw Error('B81 cleanup ownership rejected');
   const visit=p=>{const s=fs.lstatSync(p);if(s.isSymbolicLink()||!s.isDirectory()&&(!s.isFile()||s.nlink!==1))throw Error('B81 unsafe cleanup object');if(s.isDirectory())for(const n of fs.readdirSync(p))visit(path.join(p,n));};visit(directory);fs.rmSync(directory,{recursive:true});
  }
 });
}
