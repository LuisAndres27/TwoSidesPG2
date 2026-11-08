// Owner-authorized fresh B85 containers only; refuses existing names/volumes.
import {docker,names,secret,mongoJs} from './runtime.mjs';
import {MongoClient} from 'mongodb';
import {inspectOwnedContainer,identifyServer} from '../../tests/statistics/b81-container-instance.js';
import {DEMO_DATABASE,B84_KEY_CHECK} from '../b84/demo-store.js';
import {generateDemoEvents,expectedTotals} from '../b84/generator.js';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const check=(v,m)=>{if(!v)throw Error(m);};
const container=await inspectOwnedContainer();
const c=new MongoClient('mongodb://127.0.0.1:27028',{directConnection:true,replicaSet:'rsB811',serverSelectionTimeoutMS:5000,timeoutMS:15000});
let rows;
try{await c.connect();await identifyServer(c);const s=c.startSession();try{await s.withTransaction(async()=>{const db=c.db(DEMO_DATABASE);const meta=await db.collection('stats_v1_meta').findOne({_id:'statistics-v1'},{session:s,projection:{keyCheck:1}});check(meta?.keyCheck===B84_KEY_CHECK,'B84_IDENTITY_MISMATCH');rows=await db.collection(names.collection).find({},{session:s}).toArray();},{readConcern:{level:'snapshot'},readPreference:'primary'});}finally{await s.endSession();}}finally{await c.close();}
const oracle=expectedTotals(generateDemoEvents().events),g=rows.find(r=>r._id==='all')?.values;
check(g?.installations_registered===oracle.installations&&g.games_started===oracle.gamesStarted&&g.games_completed===oracle.gamesCompleted&&g.effective_ms===oracle.effectiveMs&&g.events===oracle.events,'B84_ORACLE_MISMATCH');
check(rows.every(r=>r&&typeof r._id==='string'&&/^(all|day:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$/.test(r._id)&&Object.values(r.values).every(Number.isSafeInteger)),'B84_AGGREGATE_SCHEMA');
// Whitelist only statistical counters; no metadata, technical ledger, identifiers or events copied.
rows=rows.map(r=>({_id:r._id,values:r.values}));
const snapshotDigest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const images=JSON.parse(await docker(['image','inspect','metabase/metabase:v0.65.2']));
const digest=images[0].RepoDigests.find(d=>d.startsWith('metabase/metabase@sha256:'));
check(digest,'METABASE_DIGEST_MISSING');
const containers=(await docker(['ps','-a','--format','{{.Names}}'])).trim().split(/\r?\n/);
check(!containers.includes(names.mongo)&&!containers.includes(names.metabase),'B85_ALREADY_EXISTS_REFUSED');
const existingVolumes=(await docker(['volume','ls','--format','{{.Name}}'])).trim().split(/\r?\n/);
for(const v of ['twosides-b85-mongo-data','twosides-b85-private','twosides-b85-metabase-data'])check(!existingVolumes.includes(v),'B85_VOLUME_ALREADY_EXISTS');
await docker(['network','create','--internal',names.network]);
await docker(['network','create','twosides-b85-ui']);
for(const v of ['twosides-b85-mongo-data','twosides-b85-private','twosides-b85-metabase-data'])await docker(['volume','create',v]);
await docker(['run','-d','--pull=never','--name',names.mongo,'--network',names.network,'--memory=512m','--cpus=1','--mount','type=volume,src=twosides-b85-mongo-data,dst=/data/db','--mount','type=volume,src=twosides-b85-private,dst=/b85-private','mongo:8.0','mongod','--auth','--bind_ip_all','--wiredTigerCacheSizeGB','0.25']);
const credentials={rootUser:'b85_provisioner',rootPassword:secret(),readerUser:names.reader,readerPassword:secret(),metabaseEmail:'admin@twosides.example',metabasePassword:secret()};
await docker(['exec','-i',names.mongo,'sh','-c','umask 077; cat > /b85-private/credentials.json'],JSON.stringify(credentials));
let ready=false;for(let i=0;i<45;i++){try{await mongoJs('print(JSON.stringify(db.adminCommand({ping:1})));');ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}
check(ready,'B85_MONGO_NOT_READY');
await mongoJs(`const fs=require('fs');const c=JSON.parse(fs.readFileSync('/b85-private/credentials.json','utf8'));db=db.getSiblingDB('admin');db.createUser({user:c.rootUser,pwd:c.rootPassword,roles:[{role:'root',db:'admin'}]});db.auth(c.rootUser,c.rootPassword);db=db.getSiblingDB('${names.db}');db.createCollection('${names.collection}');db.${names.collection}.insertMany(${JSON.stringify(rows)});db.createRole({role:'b85_aggregates_read',privileges:[{resource:{db:'${names.db}',collection:'${names.collection}'},actions:['find']}],roles:[]});db.createUser({user:c.readerUser,pwd:c.readerPassword,roles:[{role:'b85_aggregates_read',db:'${names.db}'}],mechanisms:['SCRAM-SHA-256']});print(JSON.stringify({created:true,rows:db.${names.collection}.countDocuments({})}));`);
// Key generated inside the new application volume; no secret in Docker arguments/configuration.
const boot=`set -eu\numask 077\nfor key in encryption-key session-key; do if [ ! -f /metabase-data/$key ]; then head -c 32 /dev/urandom | base64 > /metabase-data/$key; fi; done\nexport MB_ENCRYPTION_SECRET_KEY="$(cat /metabase-data/encryption-key)"\nexport MB_SESSION_SECRET_KEY="$(cat /metabase-data/session-key)"\nexec /app/run_metabase.sh\n`;
await docker(['create','--pull=never','--name',names.metabase,'--network',names.network,'--memory=1536m','--cpus=2','-p','127.0.0.1:4185:3000','--mount','type=volume,src=twosides-b85-metabase-data,dst=/metabase-data','-e','MB_DB_TYPE=h2','-e','MB_DB_FILE=/metabase-data/metabase','-e','MB_SITE_URL=http://127.0.0.1:4185','-e','MB_ANON_TRACKING_ENABLED=false','-e','MB_CHECK_FOR_UPDATES=false','-e','JAVA_OPTS=-Xmx1024m','--entrypoint','/bin/sh',digest,'/metabase-data/boot.sh']);
// Copy stdin into the new volume using the already available Mongo image, no extra image/download.
await docker(['run','--rm','-i','--pull=never','--network=none','--mount','type=volume,src=twosides-b85-metabase-data,dst=/metabase-data','--entrypoint','sh','mongo:8.0','-c','umask 077; cat > /metabase-data/boot.sh'],boot);
await docker(['network','connect','twosides-b85-ui',names.metabase]);
await docker(['start',names.metabase]);
await mkdir('.work/b85',{recursive:true});
await writeFile('.work/b85/deployment.json',JSON.stringify({date:new Date().toISOString(),sourceDatabase:DEMO_DATABASE,sourceContainer:container,rows:rows.length,snapshotDigest,metabaseImage:digest,names,oracle},null,2));
console.log(JSON.stringify({prepared:true,rows:rows.length,metabaseImage:digest,sourcePreserved:true}));
