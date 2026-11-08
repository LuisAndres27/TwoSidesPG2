// Future REAL local suite only. No credential input, environment configuration or public listener.
import './b80-isolation-guard.js';
import fs from 'node:fs';import path from 'node:path';import {MongoClient} from 'mongodb';
import {B80_KEY,keyCheck} from './b80-fixture.js';
import {b81LocalConfiguration} from '../../src/modules/statistics/mongo-local-policy.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {assertRetentionPolicy,BOUNDED_RETENTION} from '../../src/modules/statistics/retention-policy.js';
import {inspectOwnedContainer} from './b81-container-instance.js';
if(typeof process.send!=='function')throw Error('B81 owned child IPC required');
process.once('message',async request=>{
 let client,repository;try{
  const config=b81LocalConfiguration(request.config),retentionPolicy=assertRetentionPolicy(request.retentionPolicy??BOUNDED_RETENTION);
  if(request.container===true){
   // B81.1 owned-container mode: the configuration must carry the container marker (rsB811 on 127.0.0.1:27028) and the server is identified by its own answers.
   if(config.ownedContainer===undefined)throw Error();const owned=await inspectOwnedContainer();if(request.expectedContainerId!==undefined&&owned.id!==request.expectedContainerId)throw Error();
  }else{
   const identity=JSON.parse(fs.readFileSync(path.join(request.directory,'runtime.identity.json'),'utf8'));
   if(identity.runId!==config.runId||identity.purpose!=='b81-owned-mongo'||!Number.isSafeInteger(request.expectedPid))throw Error();
  }
  client=new MongoClient('mongodb://127.0.0.1:'+config.port,{directConnection:true,replicaSet:config.replicaSet,retryWrites:false,maxPoolSize:2,serverSelectionTimeoutMS:request.container===true?5000:2000,timeoutMS:10000,monitorCommands:false});await client.connect();
  const admin=client.db('admin'),status=await admin.command({serverStatus:1}),opts=await admin.command({getCmdLineOpts:1}),hello=await admin.command({hello:1});
  if(request.container===true){
   const build=await admin.command({buildInfo:1});
   if(status.process!=='mongod'||status.pid!==1||!/^8\.0\.\d+$/.test(build.version)||opts.parsed?.replication?.replSet!==config.replicaSet||!hello.isWritablePrimary||hello.setName!==config.replicaSet)throw Error();
  }else if(status.pid!==request.expectedPid||path.resolve(opts.parsed?.storage?.dbPath??'')!==path.join(request.directory,'db')||!hello.isWritablePrimary||hello.setName!==config.replicaSet)throw Error();
  const adapter=await registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db:client.db(config.database),config,keyCheck,retentionPolicy}));
  repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:B80_KEY,retentionPolicy,now:()=>Date.parse('2026-11-04T12:00:00.000Z')});
  const receipt=await repository.commit(request.value),counts=await repository.aggregates();
  await repository.close();repository=undefined;await client.close();client=undefined;
  process.send({ok:true,status:receipt.status,code:receipt.code,events:counts['all|events']},()=>process.disconnect());
 }catch{try{await repository?.close();}catch{}try{await client?.close();}catch{}process.exitCode=1;process.send({ok:false,code:'B81_CHILD_UNAVAILABLE'},()=>process.disconnect());}
});
