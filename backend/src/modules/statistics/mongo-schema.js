// Provisioning is explicit and separate from the application adapter. No automatic indexes.
import {eventTypes} from './projection.js';
import {biomes} from './contract.js';
import {BOUNDED_RETENTION,B82_RUN_HYBRID,B82_SEMANTIC_MARKER,assertRetentionPolicy,usesRunSemanticMarkers} from './retention-policy.js';
export const MONGO_STATISTICS_SCHEMA='statistics-mongo-b81-v1';
export const schemaForRetention=policy=>assertRetentionPolicy(policy)===B82_RUN_HYBRID?'statistics-mongo-b82-run-v1':MONGO_STATISTICS_SCHEMA;
export const MONGO_STATISTICS_COLLECTIONS=Object.freeze({counts:'stats_v1_counters',receipts:'stats_v1_receipts',semantic:'stats_v1_semantic',distinct:'stats_v1_active',budgets:'stats_v1_budgets',meta:'stats_v1_meta'});
const groups=['receipts','semantic','distinct','budgets'];
export function statisticsCollectionOptions(group,{retentionPolicy=BOUNDED_RETENTION}={}){
 assertRetentionPolicy(retentionPolicy);
 const properties={_id:{bsonType:'string'}};
 if(group==='counts'){
  properties._id.pattern='^(all|day:[0-9]{4}-[0-9]{2}-[0-9]{2}|month:[0-9]{4}-[0-9]{2})$';
  const metrics=['events','active_installations','installations_registered','sessions_started','sessions_closed','sessions_interrupted','games_started','games_completed','effective_ms',...eventTypes.map(t=>'type:'+t),...['good','medium','bad'].map(x=>'ending:'+x),...biomes.flatMap(b=>['visits:'+b,'completions:'+b,'time:'+b,'decision:'+b+':approve','decision:'+b+':reject','environment:'+b+':healthy','environment:'+b+':degraded'])];
  properties.values={bsonType:'object',additionalProperties:false,properties:Object.fromEntries(metrics.map(k=>[k,{bsonType:['int','long','double'],minimum:0,maximum:Number.MAX_SAFE_INTEGER}]))};
 }
 else if(group==='meta'){properties._id={enum:['statistics-v1']};Object.assign(properties,{schema:{enum:[schemaForRetention(retentionPolicy)]},keyCheck:{bsonType:'string',pattern:'^[a-f0-9]{64}$'},revision:{bsonType:['int','long','double'],minimum:0,maximum:Number.MAX_SAFE_INTEGER}});if(usesRunSemanticMarkers(retentionPolicy))properties.retentionPolicy={enum:[retentionPolicy]};}
 else if(group==='semantic'&&usesRunSemanticMarkers(retentionPolicy)){properties._id.pattern='^[a-f0-9]{64}$';properties.kind={enum:[B82_SEMANTIC_MARKER]};}
 else {properties._id.pattern='^[a-f0-9]{64}$';properties.expiresAt={bsonType:'date'};if(group==='receipts')Object.assign(properties,{hash:{bsonType:'string',pattern:'^[a-f0-9]{64}$'},revision:{bsonType:['int','long','double'],minimum:1,maximum:Number.MAX_SAFE_INTEGER}});if(group==='budgets')properties.value={bsonType:['int','long','double'],minimum:0,maximum:Number.MAX_SAFE_INTEGER};}
 return {validator:{$jsonSchema:{bsonType:'object',required:Object.keys(properties),additionalProperties:false,properties}},validationLevel:'strict',validationAction:'error'};
}
export async function provisionB81Statistics(db,{keyCheck,emptyDatabaseAuthorized=false,retentionPolicy=BOUNDED_RETENTION}={}){
 assertRetentionPolicy(retentionPolicy);
 if(emptyDatabaseAuthorized!==true||!/^(twosides_statistics_b81_[a-f0-9]{32}|twosides_statistics_demo|twosides_statistics_b86_[a-f0-9]{16})$/.test(db?.databaseName??'')||!/^[a-f0-9]{64}$/.test(keyCheck??''))throw Error('B81 provisioning rejected');
 if((await db.listCollections({},{nameOnly:true}).toArray()).length!==0)throw Error('B81 database must be newly empty');
 for(const [group,name]of Object.entries(MONGO_STATISTICS_COLLECTIONS)){
  await db.createCollection(name,statisticsCollectionOptions(group,{retentionPolicy}));
  if(groups.includes(group)&&!(group==='semantic'&&usesRunSemanticMarkers(retentionPolicy)))await db.collection(name).createIndex({expiresAt:1},{name:'expiry_v1',expireAfterSeconds:0});
 }
 await db.collection(MONGO_STATISTICS_COLLECTIONS.meta).insertOne({_id:'statistics-v1',schema:schemaForRetention(retentionPolicy),keyCheck,revision:0,...(usesRunSemanticMarkers(retentionPolicy)?{retentionPolicy}:{})},{writeConcern:{w:'majority',j:true,wtimeoutMS:5000}});
}
export async function verifyB81StatisticsSchema(db,keyCheck,{retentionPolicy=BOUNDED_RETENTION}={}){
 assertRetentionPolicy(retentionPolicy);
 const rows=await db.listCollections({},{nameOnly:false}).toArray(),expected=Object.values(MONGO_STATISTICS_COLLECTIONS).sort();
 if(JSON.stringify(rows.map(r=>r.name).sort())!==JSON.stringify(expected))throw Error('B81 catalogue rejected');
 for(const [group,name]of Object.entries(MONGO_STATISTICS_COLLECTIONS)){
  const row=rows.find(r=>r.name===name),options=statisticsCollectionOptions(group,{retentionPolicy}),ttl=groups.includes(group)&&!(group==='semantic'&&usesRunSemanticMarkers(retentionPolicy));
  if(row.type!=='collection'||JSON.stringify(row.options?.validator)!==JSON.stringify(options.validator)||row.options?.validationLevel!=='strict'||row.options?.validationAction!=='error')throw Error('B81 validator rejected');
  const indexes=await db.collection(name).listIndexes().toArray();
  if(indexes.length!==(ttl?2:1)||!indexes.some(i=>i.name==='_id_'&&JSON.stringify(i.key)==='{"_id":1}'&&!i.partialFilterExpression&&!i.sparse&&!i.collation))throw Error('B81 unique key rejected');
  if(ttl&&!indexes.some(i=>i.name==='expiry_v1'&&JSON.stringify(i.key)==='{"expiresAt":1}'&&i.expireAfterSeconds===0&&!i.unique&&!i.partialFilterExpression&&!i.sparse&&!i.collation))throw Error('B81 expiry index rejected');
 }
 const seed=await db.collection(MONGO_STATISTICS_COLLECTIONS.meta).findOne({_id:'statistics-v1'});
 const hybrid=usesRunSemanticMarkers(retentionPolicy);
 if(seed?.schema!==schemaForRetention(retentionPolicy)||seed.keyCheck!==keyCheck||!Number.isSafeInteger(seed.revision)||seed.revision<0||hybrid&&seed.retentionPolicy!==retentionPolicy||Object.keys(seed).some(k=>!['_id','schema','keyCheck','revision',...(hybrid?['retentionPolicy']:[])].includes(k)))throw Error('B81 metadata rejected');
 return true;
}
