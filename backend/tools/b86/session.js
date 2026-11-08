// B86 — one controlled session against a prepared statistics target (the authenticated/TLS local test server today; Atlas only after the owner's
// explicit authorization). Pure library: it returns a report that contains NO secret, user name, host or URI. Nothing runs on import.
import {createHmac} from 'node:crypto';
import {connectPrepared,openPreparedIngestRepository} from '../../src/modules/statistics/atlas-connector.js';
import {provisionB81Statistics,statisticsCollectionOptions,MONGO_STATISTICS_COLLECTIONS as names} from '../../src/modules/statistics/mongo-schema.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {overviewView,biomesView,endingsView} from '../../src/modules/statistics/admin-statistics.js';
import {generateDemoEvents,expectedTotals} from '../b84/generator.js';
import {seedThroughHttp} from '../b84/seed.js';
import {B84_KEY,B84_KEY_CHECK} from '../b84/demo-key.js';   // neutral module: demo-store.js would load the B80 test-isolation guard (and tests/), unreachable from Atlas actions

// Small, brand-new synthetic dataset for the future Atlas demonstration (NOT the 2 293 events of B84, not B78, not historical operations).
export const ATLAS_SYNTHETIC_DATASET=Object.freeze({seed:'twosides-b86-atlas-synthetic-v1',installations:5,days:4,anchor:'2026-11-04'});
export const atlasSyntheticEvents=()=>generateDemoEvents({...ATLAS_SYNTHETIC_DATASET});
const noLimit={consume(){}};
const keyCheck=createHmac('sha256',B84_KEY).update('key-check').digest('hex');
const matches=(counts,expected)=>{const o=overviewView(counts),b=biomesView(counts),e=endingsView(counts);
 return o.installations===expected.installations&&o.gamesStarted===expected.gamesStarted&&o.gamesCompleted===expected.gamesCompleted&&o.effectiveMs===expected.effectiveMs&&o.events===expected.events&&o.sessionsStarted===expected.sessionsStarted&&
  ['good','medium','bad'].every(k=>e[k]===expected.endings[k])&&b.biomes.every(x=>x.visits===expected.biomes[x.id].visits&&x.completions===expected.biomes[x.id].completions&&x.effectiveMs===expected.biomes[x.id].effectiveMs&&x.decisions.approve===expected.biomes[x.id].approve&&x.decisions.reject===expected.biomes[x.id].reject);};

export async function runPreparedSession({config,credentials,action,tlsCAFile,ClientImpl,events=atlasSyntheticEvents().events}){
 const base={action,mode:config.mode,identity:config.identity,database:config.analyticsDatabase&&['reader','publisher'].includes(config.identity)?'(analytics database)':config.database,tls:true,authMechanism:config.authMechanism};
 if(action==='preflight'){const c=await connectPrepared(config,credentials,{tlsCAFile,ClientImpl});try{return {...base,readOnly:true,operations:['connect (TLS, '+config.authMechanism+')','hello','connectionStatus(showPrivileges)'],topology:'replica-set-primary',transactions:'supported',authenticatedUser:'matches-identity',privileges:'exact-match'};}finally{await c.client.close();}}
 if(action==='provision'){
  if(config.identity!=='schema')throw Error('provision requires the schema identity');
  const c=await connectPrepared(config,credentials,{tlsCAFile,ClientImpl});
  try{await provisionB81Statistics(c.db,{keyCheck:B84_KEY_CHECK,emptyDatabaseAuthorized:true,retentionPolicy:config.retentionPolicy});
   const inventory={};for(const n of Object.values(names))inventory[n]=(await c.db.collection(n).listIndexes().toArray()).map(i=>({name:i.name,ttl:i.expireAfterSeconds===0}));
   // Analytical database (Metabase's only source): ONE empty counters collection with the same strict validator; filled later by the publisher.
   if((await c.analyticsDb.listCollections({},{nameOnly:true}).toArray()).length!==0)throw Error('analytical database must be newly empty');
   await c.analyticsDb.createCollection(names.counts,statisticsCollectionOptions('counts',{retentionPolicy:config.retentionPolicy}));
   return {...base,provisioned:true,collections:inventory,analyticsCollections:[names.counts]};}finally{await c.client.close();}
 }
 if(action==='seed'){
  if(config.identity!=='ingest')throw Error('seed requires the ingest identity');
  const store=await openPreparedIngestRepository({config,credentials,key:B84_KEY,tlsCAFile,ClientImpl}),identities=new SyntheticStatisticsIdentity();
  const app=createStatisticsOfflineApp({profile:'statistics-atlas-prepared',identities,store:store.repository,limiter:noLimit}),server=app.listen(0,'127.0.0.1');
  try{
   await new Promise(r=>server.once('listening',r));
   const result=await seedThroughHttp({baseUrl:'http://127.0.0.1:'+server.address().port,events,issue:installationId=>identities.issueSynthetic({installationId,lifetimeMs:3600000})});
   const counts=await store.repository.aggregates(),expected=expectedTotals(events);
   return {...base,dataset:ATLAS_SYNTHETIC_DATASET.seed,distinctEvents:events.length,tally:result.tally,aggregatesMatchOracle:matches(counts,expected)};
  }finally{await new Promise(r=>{server.close(r);server.closeAllConnections?.();});await store.close();}
 }
 if(action==='publish'){
  if(config.identity!=='publisher')throw Error('publish requires the publisher identity');
  const c=await connectPrepared(config,credentials,{tlsCAFile,ClientImpl}),session=c.client.startSession();
  try{
   // Only _id and the numeric `values` are copied. One transaction: readers never see an empty or half-written snapshot.
   const source=(await c.db.collection(names.counts).find({}).toArray()).map(d=>({_id:d._id,values:d.values}));
   session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true}});
   try{await c.analyticsDb.collection(names.counts).deleteMany({},{session});if(source.length)await c.analyticsDb.collection(names.counts).insertMany(source,{session});await session.commitTransaction();}
   catch(error){try{await session.abortTransaction();}catch{/* the original failure is what matters */}throw error;}
   return {...base,published:true,documents:source.length};
  }finally{await session.endSession();await c.client.close();}
 }
 if(action==='read'){
  if(config.identity!=='reader')throw Error('read requires the reader identity');
  const c=await connectPrepared(config,credentials,{tlsCAFile,ClientImpl});
  try{
   const docs=await c.analyticsDb.collection(names.counts).find({}).toArray(),counts={};
   for(const d of docs)for(const [k,v] of Object.entries(d.values??{}))counts[d._id+'|'+k]=v;
   const visible=(await c.analyticsDb.listCollections({},{nameOnly:true}).toArray()).map(x=>x.name);
   return {...base,counterDocuments:docs.length,visibleCollections:visible.length,onlyCountersVisible:visible.length===1&&visible[0]===names.counts,aggregatesMatchOracle:matches(counts,expectedTotals(events))};
  }finally{await c.client.close();}
 }
 throw Error('Unknown action');
}
