// B84 — opens the B84-owned synthetic databases inside the owner's container (twosides-b811-mongo, 127.0.0.1:27028, rsB811).
// Everything is verified BEFORE any write: local Docker context, the container (name/image/ports/mounts), the mongod identity and the
// absence of foreign databases. admin/config/local are never written. Only databases whose name carries the B84 prefix are touched.
// No URI from the environment, no credentials, no Atlas, and the container is never stopped, restarted or recreated.
import '../../tests/statistics/b80-isolation-guard.js';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {inspectOwnedContainer,identifyServer} from '../../tests/statistics/b81-container-instance.js';
import {b81LocalConfiguration,B81_OWNED_CONTAINER as C} from '../../src/modules/statistics/mongo-local-policy.js';
import {provisionB81Statistics,schemaForRetention} from '../../src/modules/statistics/mongo-schema.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {B82_RUN_HYBRID} from '../../src/modules/statistics/retention-policy.js';

// The public synthetic HMAC key now lives in ./demo-key.js (a neutral module); it is re-exported here so every existing import keeps working.
import {B84_KEY,B84_KEY_CHECK} from './demo-key.js';
export {B84_KEY,B84_KEY_CHECK};
// Database names must satisfy the B81 policy (twosides_statistics_b81_<32 hex>). B84 databases are recognisable by the run id prefix:
//   demo database (kept for the presentation): run id "b84d" + 28 hex derived from a fixed label
//   integration-test databases (dropped by their test): run id "b84e" + 28 random hex
export const DEMO_RUN_ID='b84d'+createHash('sha256').update('twosides-b84-demo-database').digest('hex').slice(0,28);
export const DEMO_DATABASE='twosides_statistics_b81_'+DEMO_RUN_ID;
export const isB84Database=name=>/^twosides_statistics_b81_b84[de][a-f0-9]{28}$/.test(name);
export const RETENTION=B82_RUN_HYBRID;   // experimental, synthetic databases only; NOT approved for production
const pause=ms=>new Promise(r=>setTimeout(r,ms));

const newClient=()=>new MongoClient('mongodb://'+C.host+':'+C.port,{directConnection:true,replicaSet:C.replicaSet,retryWrites:false,maxPoolSize:6,minPoolSize:0,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:15000,timeoutMS:15000,appName:'TwoSides-B84-Demo'});

// kind: 'demo' (persistent demonstration database, created if missing, never dropped here) | 'test' (fresh random database, dropped on close)
export async function openB84Store({kind='demo',now=Date.now}={}){
 if(!['demo','test'].includes(kind))throw Error('B84 store kind rejected');
 const container=await inspectOwnedContainer();
 const runId=kind==='demo'?DEMO_RUN_ID:'b84e'+randomBytes(14).toString('hex'),database='twosides_statistics_b81_'+runId;
 const config=b81LocalConfiguration({enabled:true,runId,host:C.host,port:C.port,database,replicaSet:C.replicaSet,ownedContainer:C.name});
 const client=newClient();let created=false,closed=false;
 try{
  await client.connect();const server=await identifyServer(client);
  const names=(await client.db('admin').command({listDatabases:1,nameOnly:true},{maxTimeMS:3000})).databases.map(d=>d.name);
  // Only the engine databases and databases of B84 itself may coexist with this run; anything else is foreign and stops the run.
  if(names.some(n=>!['admin','config','local'].includes(n)&&!isB84Database(n)))throw Error('B84 foreign database present');
  const db=client.db(database);
  if(!names.includes(database)){await provisionB81Statistics(db,{keyCheck:B84_KEY_CHECK,emptyDatabaseAuthorized:true,retentionPolicy:RETENTION});created=true;}
  const adapter=await registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db,config,keyCheck:B84_KEY_CHECK,retentionPolicy:RETENTION}));
  const repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:Buffer.from(B84_KEY),retentionPolicy:RETENTION,now});
  return {kind,database,created,serverVersion:server.version,containerId:container.id,repository,client,
   // Verified, idempotent. In 'test' mode it drops only this run's own database (name pattern + the run's own seed document).
   async close({keepDatabase=kind==='demo'}={}){
    if(closed)return;closed=true;let failure;
    try{await repository.close();}catch(e){failure=e;}
    try{if(!keepDatabase){
      if(kind!=='test'||!/^twosides_statistics_b81_b84e[a-f0-9]{28}$/.test(database))throw Error('B84 refuses to drop this database');
      const seed=await client.db(database).collection('stats_v1_meta').findOne({_id:'statistics-v1'});
      if(seed?.keyCheck!==B84_KEY_CHECK||seed.schema!==schemaForRetention(RETENTION))throw Error('B84 cleanup ownership rejected');
      await client.db(database).dropDatabase();}}catch(e){failure??=e;}
    try{await client.close();}catch(e){failure??=e;}
    if(failure)throw failure;
   }};
 }catch(error){
  // A freshly created TEST database must not be left behind if its own preparation failed.
  if(created&&kind==='test'){try{await client.db(database).dropDatabase();}catch{}}
  try{await client.close();}catch{}throw error;}
}
export {pause};
