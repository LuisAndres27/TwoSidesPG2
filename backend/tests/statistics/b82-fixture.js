import './b80-isolation-guard.js';
import {randomUUID} from 'node:crypto';import {MongoClient} from 'mongodb';
import {value,B80_KEY,keyCheck} from './b80-fixture.js';
import {startOwnedB81Container,inspectOwnedContainer,identifyServer} from './b81-container-instance.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {B82_RUN_HYBRID} from '../../src/modules/statistics/retention-policy.js';
import {TransactionConflict} from '../../src/modules/statistics/transaction-contract.js';
export function factValue(installation,type,now,game=randomUUID().replaceAll('-','')){
 const details={installation_registered:{},game_started:{},game_completed:{ending:'good'},biome_completed:{result:'good'},environmental_decision:{decisionKey:'ocean_waste_disposal',option:'reject',state:'healthy'}};
 return value(installation,{Type:type,GameId:type==='installation_registered'?null:game,BiomeId:['biome_completed','environmental_decision'].includes(type)?'ocean':null,DurationMs:null,Data:JSON.stringify(details[type])},now);
}
export async function createB82RealFixture({retentionPolicy=B82_RUN_HYBRID,now=Date.parse('2026-11-04T12:00:00.000Z')}={}){
 if(process.env.B82_REAL_TESTS!=='1')throw Error('B82 real tests disabled');
 const runtime=await startOwnedB81Container({enabled:true,keyCheck,retentionPolicy,restartAuthorized:false}),clock={now},writers=[];
 async function writer(){
  const owned=await inspectOwnedContainer();if(owned.id!==runtime.container.id||owned.image!==runtime.container.image)throw Error('B82 owned container changed');
  const client=new MongoClient('mongodb://127.0.0.1:27028',{directConnection:true,replicaSet:'rsB811',retryWrites:false,maxPoolSize:2,minPoolSize:0,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,timeoutMS:15000,monitorCommands:true,appName:'TwoSides-B82-Synthetic'});
  let hook=async()=>{};const metrics={attempts:0,classifiedConflicts:0,serverWriteConflicts:0,serverDuplicateKeys:0,commits:0,aborts:0};
  client.on('commandFailed',event=>{if(event.failure?.code===112)metrics.serverWriteConflicts++;if(event.failure?.code===11000)metrics.serverDuplicateKeys++;});
  client.on('commandSucceeded',event=>{if(event.commandName==='commitTransaction')metrics.commits++;if(event.commandName==='abortTransaction')metrics.aborts++;});
  try{
   await client.connect();await identifyServer(client);
   const adapter=await registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db:client.db(runtime.config.database),config:runtime.config,keyCheck,retentionPolicy,checkpoint:(...args)=>hook(...args)}));
   const run=adapter.runAtomic.bind(adapter);adapter.runAtomic=async(...args)=>{metrics.attempts++;try{return await run(...args);}catch(e){if(e instanceof TransactionConflict)metrics.classifiedConflicts++;throw e;}};
   const repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:B80_KEY,retentionPolicy,now:()=>clock.now});
   const w={adapter,repository,client,metrics,point:fn=>{hook=fn;},async close(){hook=async()=>{};try{await repository.close();}finally{await client.close();}}};writers.push(w);return w;
  }catch(e){await client.close();throw e;}
 }
 try{const first=await writer();return {runtime,clock,writer,first,async close(){let failure;for(const w of writers)try{await w.close();}catch(e){failure??=e;}try{await runtime.close();}catch(e){failure??=e;}if(failure)throw failure;}};}
 catch(e){await runtime.close();throw e;}
}
