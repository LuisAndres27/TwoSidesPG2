import '../../tests/statistics/b80-isolation-guard.js';
import {MongoClient} from 'mongodb';
import {inspectOwnedContainer,identifyServer} from '../../tests/statistics/b81-container-instance.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const d=JSON.parse(await readFile('.work/b85/deployment.json','utf8')),container=await inspectOwnedContainer();
if(container.id!==d.sourceContainer.id||container.startedAt!==d.sourceContainer.startedAt)throw Error('B85_SOURCE_CONTAINER_CHANGED');
const c=new MongoClient('mongodb://127.0.0.1:27028',{directConnection:true,replicaSet:'rsB811',timeoutMS:15000});
try{await c.connect();await identifyServer(c);const rows=(await c.db(d.sourceDatabase).collection('stats_v1_counters').find({}).toArray()).map(r=>({_id:r._id,values:r.values}));const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');if(digest!==d.snapshotDigest)throw Error('B85_SOURCE_AGGREGATES_CHANGED');const result={sourceUnchanged:true,containerNotRestarted:true,rows:rows.length,digest,date:new Date().toISOString()};await writeFile('.work/b85/source-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{await c.close();}
