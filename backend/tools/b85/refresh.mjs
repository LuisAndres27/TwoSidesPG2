// Explicit, bounded publication of a verified B84 snapshot. Does not ingest events.
import {docker,mongoJs,authJs,names} from './runtime.mjs';
import {MongoClient} from 'mongodb';
import {inspectOwnedContainer,identifyServer} from '../../tests/statistics/b81-container-instance.js';
import {generateDemoEvents,expectedTotals} from '../b84/generator.js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
const check=(v,m)=>{if(!v)throw Error(m);};
const d=JSON.parse(await readFile('.work/b85/deployment.json','utf8'));
const [mb]=JSON.parse(await docker(['inspect',names.metabase]));check(!mb.State.Running,'STOP_ONLY_B85_METABASE_BEFORE_REFRESH');
const source=await inspectOwnedContainer();check(source.id===d.sourceContainer.id,'SOURCE_IDENTITY_CHANGED');
const c=new MongoClient('mongodb://127.0.0.1:27028',{directConnection:true,replicaSet:'rsB811',timeoutMS:15000});let rows;
try{await c.connect();await identifyServer(c);const s=c.startSession();try{await s.withTransaction(async()=>{rows=await c.db(d.sourceDatabase).collection(names.collection).find({},{session:s}).toArray();},{readConcern:{level:'snapshot'},readPreference:'primary'});}finally{await s.endSession();}}finally{await c.close();}
check(rows.length===17&&rows.every(r=>typeof r._id==='string'&&/^(all|day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$/.test(r._id)&&Object.values(r.values).every(Number.isSafeInteger)),'UNEXPECTED_AGGREGATES');
rows=rows.map(r=>({_id:r._id,values:r.values}));
const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
// This release only accepts the already independently validated B84 demonstration.
// A different dataset requires another oracle validation, never silent publication.
check(digest===d.snapshotDigest,'NEW_DATASET_REQUIRES_INDEPENDENT_VALIDATION');
const stage='b85_staging_'+randomBytes(8).toString('hex');
await mongoJs(`${authJs} const target=db.getSiblingDB('${names.db}');if(target.getCollectionNames().some(n=>n!=='${names.collection}'))throw Error('unexpected-object');target.createCollection('${stage}');target.getCollection('${stage}').insertMany(${JSON.stringify(rows)});if(target.getCollection('${stage}').countDocuments({})!==17)throw Error('count');db.adminCommand({renameCollection:'${names.db}.${stage}',to:'${names.db}.${names.collection}',dropTarget:true});print(JSON.stringify({published:true,rows:17}));`);
await writeFile('.work/b85/refresh-result.json',JSON.stringify({date:new Date().toISOString(),digest,rows:17,sourceReadOnly:true},null,2));console.log('B85_SNAPSHOT_REFRESHED_START_METABASE_MANUALLY');
