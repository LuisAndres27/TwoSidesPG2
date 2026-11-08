// B86 — REAL tests on the disposable authenticated + TLS replica set (never Atlas, never the owner's containers). Opt-in: B86_REAL_TESTS=1.
// They cover the connection checklist of B86 §12 as far as it can be proven locally, and prove that the privilege matrix is SUFFICIENT and that
// every action of the ingestion role is NECESSARY. They do not prove anything about Atlas.
import '../statistics/b80-isolation-guard.js';
import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {randomUUID} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {startRbacServer} from './rbac-container.js';
import {connectPrepared,openPreparedIngestRepository,createStatisticsClient,StatisticsConnectionError} from '../../src/modules/statistics/atlas-connector.js';
import {PRIVILEGE_MATRIX,mongoRoleSpec} from '../../src/modules/statistics/atlas-privileges.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {MONGO_STATISTICS_COLLECTIONS as names} from '../../src/modules/statistics/mongo-schema.js';
import {B84_KEY,B84_KEY_CHECK} from '../../tools/b84/demo-store.js';
import {runPreparedSession,atlasSyntheticEvents} from '../../tools/b86/session.js';
import {value,B80_KEY} from '../statistics/b80-fixture.js';
import {startDemo} from '../b84/b84-fixture.js';
import {generateDemoEvents,expectedTotals,toEnvelope} from '../../tools/b84/generator.js';

const enabled=process.env.B86_REAL_TESTS==='1',suite=enabled?describe:describe.skip;
const REGISTER={Type:'installation_registered',GameId:null,BiomeId:null,DurationMs:null,Data:'{}'};
const denied=async fn=>{try{await fn();}catch(e){return e.code;}return 'NOT_DENIED';};
const settle=async fn=>{for(let i=0;i<8;i++){try{return await fn();}catch(e){if(i===7)throw e;await new Promise(r=>setTimeout(r,150*(i+1)));}}};
let s;
suite('B86 authenticated TLS replica set (disposable)',()=>{
 beforeAll(async()=>{
  s=await startRbacServer();
  const r=await runPreparedSession({config:s.config('schema'),credentials:s.credentials.schema,action:'provision',tlsCAFile:s.caFile});
  expect(r.provisioned).toBe(true);
 },300000);
 afterAll(async()=>{if(s){try{await s.dropDatabase();}catch{}await s.close();}},120000);
 const ingest=(extra={})=>openPreparedIngestRepository({config:s.config('ingest'),credentials:s.credentials.ingest,key:B84_KEY,tlsCAFile:s.caFile,...extra});

 it('provisioned inventory: six collections, four TTL indexes, validators strict; schema identity cannot be used by ingestion',async()=>{
  const c=await connectPrepared(s.config('schema'),s.credentials.schema,{tlsCAFile:s.caFile});
  try{
   const cols=await c.db.listCollections({},{nameOnly:false}).toArray();expect(cols.map(x=>x.name).sort()).toEqual(Object.values(names).sort());
   for(const x of cols){expect(x.options.validationLevel).toBe('strict');expect(x.options.validationAction).toBe('error');expect(x.options.validator.$jsonSchema.additionalProperties).toBe(false);}
   for(const n of [names.receipts,names.distinct,names.budgets])expect((await c.db.collection(n).listIndexes().toArray()).some(i=>i.name==='expiry_v1'&&i.expireAfterSeconds===0)).toBe(true);
  }finally{await c.client.close();}
 });

 it('TLS: trusted CA connects; no CA, an unrelated CA and plain-text are refused with a safe category',async()=>{
  await (await connectPrepared(s.config('reader'),s.credentials.reader,{tlsCAFile:s.caFile})).client.close();
  for(const ca of [undefined,s.otherCaFile]){
   const e=await connectPrepared(s.config('reader'),s.credentials.reader,{tlsCAFile:ca}).catch(x=>x);
   expect(e).toBeInstanceOf(StatisticsConnectionError);expect(['tls','timeout']).toContain(e.category);expect(e.message).not.toMatch(/127\.0\.0\.1|27086|twosides_statistics|password/i);
  }
  const plain=new MongoClient('mongodb://127.0.0.1:27086/',{directConnection:true,tls:false,serverSelectionTimeoutMS:2500});
  await expect(plain.connect().then(()=>plain.db('admin').command({ping:1}))).rejects.toBeTruthy();await plain.close().catch(()=>{});
 });

 it('authentication: wrong password and a different identity fail with category "authentication"; the connector never accepts invalid TLS options',async()=>{
  const wrong=await connectPrepared(s.config('ingest'),{username:s.config('ingest').user,password:'W'+s.credentials.ingest.password.slice(1)},{tlsCAFile:s.caFile}).catch(x=>x);
  expect(wrong).toBeInstanceOf(StatisticsConnectionError);expect(wrong.category).toBe('authentication');
  // The reader's credentials cannot be presented for the ingest configuration (user mismatch is rejected before any network I/O).
  const e=await connectPrepared(s.config('ingest'),s.credentials.reader,{tlsCAFile:s.caFile}).catch(x=>x);expect(e.category).toBe('credentials_rejected');
  const client=createStatisticsClient(s.config('ingest'),s.credentials.ingest,{tlsCAFile:s.caFile});
  expect(client.options.tls).toBe(true);expect(client.options.tlsAllowInvalidCertificates).toBeFalsy();expect(client.options.tlsAllowInvalidHostnames).toBeFalsy();expect(client.options.credentials.mechanism).toBe('SCRAM-SHA-256');await client.close();
 });

 it('exact privileges: an account holding any extra or missing action is refused by the preflight (no HTTP, no data)',async()=>{
  const widened=mongoRoleSpec('ingest',s.database).privileges.map(p=>p.resource.collection===names.budgets?{...p,actions:[...p.actions,'remove']}:p);
  await s.replaceRole('ingest',widened);
  try{const e=await ingest().catch(x=>x);expect(e).toBeInstanceOf(StatisticsConnectionError);expect(e.category).toBe('privilege_mismatch');}finally{await s.restoreRole('ingest');}
  const wrongDb=s.config('ingest');   // same server, but ask the preflight about another database name
  const other=(await import('../../src/modules/statistics/atlas-policy.js')).preparedConfiguration({kind:'local-rbac',host:'127.0.0.1',database:'twosides_statistics_b86_'+'0'.repeat(16),identity:'ingest'});
  const e2=await connectPrepared(other,s.credentials.ingest,{tlsCAFile:s.caFile}).catch(x=>x);expect(e2.category).toBe('privilege_mismatch');void wrongDb;
 });

 it('authorization: ingestion cannot do DDL, touch other collections/databases; the reader cannot write or read technical collections',async()=>{
  const c=await connectPrepared(s.config('ingest'),s.credentials.ingest,{tlsCAFile:s.caFile});
  try{
   expect(await denied(()=>c.db.createCollection('not_authorized'))).toBe(13);
   expect(await denied(()=>c.db.collection(names.receipts).createIndex({hash:1}))).toBe(13);
   expect(await denied(()=>c.db.collection(names.counts).drop())).toBe(13);
   expect(await denied(()=>c.db.command({collMod:names.counts,validator:{}}))).toBe(13);
   expect(await denied(()=>c.db.collection('two_sides_probe').insertOne({_id:'x'}))).toBe(13);
   expect(await denied(()=>c.client.db('two_sides_db').collection('probe').insertOne({_id:'x'}))).toBe(13);   // wrong database, a name that does not exist
   expect(await denied(()=>c.client.db('admin').collection('probe').find({}).toArray())).toBe(13);
   expect(await denied(()=>c.db.collection(names.semantic).deleteOne({_id:'a'.repeat(64)}))).toBe(13);        // semantic markers are never removed by ingestion
  }finally{await c.client.close();}
  const r=await connectPrepared(s.config('reader'),s.credentials.reader,{tlsCAFile:s.caFile}),A=r.analyticsDb;
  try{
   const before=await A.collection(names.counts).countDocuments({});
   expect(await denied(()=>A.collection(names.counts).insertOne({_id:'all',values:{}}))).toBe(13);
   expect(await denied(()=>A.collection(names.counts).updateOne({_id:'all'},{$set:{values:{}}}))).toBe(13);
   expect(await denied(()=>A.collection(names.counts).deleteMany({}))).toBe(13);
   expect(await denied(()=>A.collection(names.counts).drop())).toBe(13);
   expect(await denied(()=>A.createCollection('x'))).toBe(13);
   expect(await denied(()=>A.collection(names.counts).createIndex({a:1}))).toBe(13);
   // The ingestion database is invisible to Metabase: no technical collection can be read or even listed.
   for(const n of Object.values(names))expect(await denied(()=>r.db.collection(n).find({}).toArray()),n).toBe(13);
   expect(await denied(()=>r.db.listCollections({},{nameOnly:true}).toArray())).toBe(13);
   expect(await A.collection(names.counts).countDocuments({})).toBe(before);
   // Evidence for the Metabase connection (B86.1): the analytical database lists ONLY the published counters.
   expect((await A.listCollections({},{nameOnly:true}).toArray()).map(x=>x.name)).toEqual([names.counts]);
  }finally{await r.client.close();}
  const pub=await connectPrepared(s.config('publisher'),s.credentials.publisher,{tlsCAFile:s.caFile});
  try{
   for(const n of [names.receipts,names.semantic,names.distinct,names.budgets,names.meta])expect(await denied(()=>pub.db.collection(n).find({}).toArray()),n).toBe(13);
   expect(await denied(()=>pub.db.collection(names.counts).insertOne({_id:'x',values:{}}))).toBe(13);          // never writes the source
   expect(await denied(()=>pub.db.collection(names.counts).updateOne({_id:'all'},{$set:{values:{}}}))).toBe(13);
   expect(await denied(()=>pub.analyticsDb.collection(names.counts).updateOne({_id:'all'},{$set:{values:{}}}))).toBe(13);   // replace = delete + insert only
   expect(await denied(()=>pub.analyticsDb.collection('other').insertOne({_id:'x'}))).toBe(13);
   expect(await denied(()=>pub.analyticsDb.collection(names.counts).createIndex({a:1}))).toBe(13);
   expect(await denied(()=>pub.analyticsDb.createCollection('y'))).toBe(13);
  }finally{await pub.client.close();}
 });

 it('every action of the ingestion role is necessary (removing any one breaks a real ingestion) and the full matrix is sufficient',async()=>{
  const spec=mongoRoleSpec('ingest',s.database);
  const workload=async()=>{   // like openPreparedIngestRepository WITHOUT the exact-privilege preflight, so reduced roles can be probed
   const client=createStatisticsClient(s.config('ingest'),s.credentials.ingest,{tlsCAFile:s.caFile});
   try{
    await client.connect();const db=client.db(s.database);
    const adapter=await registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db,config:s.config('ingest'),keyCheck:B84_KEY_CHECK,retentionPolicy:s.config('ingest').retentionPolicy}));
    const repo=createB81MongoRepository({profile:'statistics-atlas-prepared',adapter,key:Buffer.from(B84_KEY),retentionPolicy:s.config('ingest').retentionPolicy,now:()=>Date.parse('2026-11-05T12:00:00Z')});
    try{const inst=randomUUID(),now=Date.parse('2026-11-05T12:00:00Z');
     const a=await repo.commit(value(inst,REGISTER,now)),b=await repo.commit(value(inst,{},now)),c=await repo.commit(value(inst,{},now));   // distinct intervals share a time; second/third exercise updates
     return [a,b,c].every(r=>r.status==='accepted'||r.status==='duplicate');}finally{try{await repo.close();}catch{}}
   }catch{return false;}finally{try{await client.close();}catch{}}
  };
  expect(await workload()).toBe(true);
  const unnecessary=[];
  for(const [i,p] of spec.privileges.entries())for(const action of p.actions){
   const reduced=spec.privileges.map((q,j)=>j===i?{...q,actions:q.actions.filter(a=>a!==action)}:q).filter(q=>q.actions.length);
   await s.replaceRole('ingest',reduced);
   try{if(await workload())unnecessary.push(`${p.resource.collection||'<db>'}.${action}`);}finally{await s.restoreRole('ingest');}
  }
  console.log('B86_UNNECESSARY_ACTIONS',JSON.stringify(unnecessary));
  expect(unnecessary).toEqual([]);
 },600000);

 it('ingestion semantics on the authenticated server: valid, duplicate, lost acknowledgement, abort, retry, receipt, semantic conflict',async()=>{
  let hook=async()=>{};const h=await ingest({checkpoint:(...a)=>hook(...a)}),inst=randomUUID(),now=Date.now();
  try{
   const base=(await h.repository.aggregates())['all|installations_registered']??0,v=value(inst,REGISTER,now),total=async()=>((await h.repository.aggregates())['all|installations_registered']??0)-base;
   expect((await h.repository.commit(v)).status).toBe('accepted');expect((await h.repository.commit(v)).status).toBe('duplicate');expect(await total()).toBe(1);
   expect(await h.repository.commit(value(inst,REGISTER,now))).toMatchObject({status:'rejected',code:'fact_conflict'});expect(await total()).toBe(1);   // same fact, new EventId
   const w=value(randomUUID(),REGISTER,now);hook=async n=>{if(n==='before_commit')throw Error('PUBLIC ABORT');};
   await expect(h.repository.commit(w)).rejects.toBeTruthy();hook=async()=>{};expect(await total()).toBe(1);           // aborted: nothing counted
   expect((await h.repository.commit(w)).status).toBe('accepted');expect(await total()).toBe(2);                    // retry counts once
   const x=value(randomUUID(),REGISTER,now);hook=async n=>{if(n==='after_commit'||n==='read')throw Error('PUBLIC ACK LOST');};
   await expect(h.repository.commit(x)).rejects.toBeTruthy();hook=async()=>{};
   expect((await h.repository.commit(x)).status).toBe('duplicate');expect(await total()).toBe(3);                    // committed but unacknowledged: replay is a duplicate
  }finally{await h.close();}
 });

 it('concurrent writers (4 clients, overlapping events) never lose or double count; reader sees the exact totals',async()=>{
  const plan=generateDemoEvents({installations:2,days:3,anchor:'2026-11-04',seed:'twosides-b86-concurrency-v1'}),items=plan.events.slice(0,50),expected=expectedTotals(items);
  const before=await (async()=>{const h=await ingest();try{return await settle(()=>h.repository.aggregates());}finally{await settle(()=>h.close()).catch(()=>{});}})();
  const writers=await Promise.all([ingest(),ingest(),ingest(),ingest()]);
  try{
   const {validateEvent}=await import('../../src/modules/statistics/contract.js'),validated=items.map(x=>validateEvent({EventJson:x.canonical,PayloadHash:x.payloadHash},x.installationId,Date.now()));
   const pending=new Set(validated.map(v=>v.id));let rounds=0;
   while(pending.size&&rounds++<12){
    await Promise.all(writers.map(async w=>{for(const v of validated)if(pending.has(v.id)){try{const r=await w.repository.commit(v);if(['accepted','duplicate'].includes(r.status))pending.delete(v.id);else if(r.status==='rejected')throw Error('unexpected rejection '+r.code);}catch(e){if(/unexpected rejection/.test(e.message))throw e;}}}));
   }
   expect(pending.size).toBe(0);
   const after=await settle(()=>writers[0].repository.aggregates());
   expect((after['all|events']??0)-(before['all|events']??0)).toBe(expected.events);
   expect((after['all|effective_ms']??0)-(before['all|effective_ms']??0)).toBe(expected.effectiveMs);
  }finally{for(const w of writers)await settle(()=>w.close()).catch(()=>{});}
 },300000);

 it('index validation: a tampered index makes the ingestion preflight refuse to start (no writes)',async()=>{
  const root=s.rootClient();await root.connect();
  try{
   await root.db(s.database).collection(names.receipts).createIndex({hash:1},{name:'tampered_hash'});
   const e=await ingest().catch(x=>x);expect(e).toBeInstanceOf(StatisticsConnectionError);expect(e.category).toBe('schema_not_ready');
   await root.db(s.database).collection(names.receipts).dropIndex('tampered_hash');
   await (await ingest()).close();   // restored: starts again
  }finally{await root.close();}
 });

 it('session reports contain no secrets; synthetic dataset: seed (idempotent) -> publish (atomic replace) -> reader on the separate analytical database equals the oracle',async()=>{
  await s.useFreshDatabase();await runPreparedSession({config:s.config('schema'),credentials:s.credentials.schema,action:'provision',tlsCAFile:s.caFile});
  const seed1=await runPreparedSession({config:s.config('ingest'),credentials:s.credentials.ingest,action:'seed',tlsCAFile:s.caFile,events:atlasSyntheticEvents().events});
  const seed2=await runPreparedSession({config:s.config('ingest'),credentials:s.credentials.ingest,action:'seed',tlsCAFile:s.caFile,events:atlasSyntheticEvents().events});
  const pub1=await runPreparedSession({config:s.config('publisher'),credentials:s.credentials.publisher,action:'publish',tlsCAFile:s.caFile});
  const pub2=await runPreparedSession({config:s.config('publisher'),credentials:s.credentials.publisher,action:'publish',tlsCAFile:s.caFile});   // idempotent replace
  const read=await runPreparedSession({config:s.config('reader'),credentials:s.credentials.reader,action:'read',tlsCAFile:s.caFile,events:atlasSyntheticEvents().events});
  const pre=await runPreparedSession({config:s.config('reader'),credentials:s.credentials.reader,action:'preflight',tlsCAFile:s.caFile});
  const n=atlasSyntheticEvents().events.length;
  expect(seed1.tally.accepted).toBeGreaterThan(0);expect(seed2.tally.accepted).toBe(0);expect(seed2.tally.rejected).toBe(0);expect(seed1.aggregatesMatchOracle).toBe(true);expect(seed2.aggregatesMatchOracle).toBe(true);expect(read.aggregatesMatchOracle).toBe(true);expect(read.onlyCountersVisible).toBe(true);expect(pub1.published).toBe(true);expect(pub2.documents).toBe(pub1.documents);expect(read.counterDocuments).toBe(pub1.documents);expect(n).toBeLessThan(600);
  const text=JSON.stringify([seed1,seed2,pub1,pub2,read,pre]);
  for(const secret of [...Object.values(s.credentials).flatMap(c=>[c.password,c.username]),'127.0.0.1','27086'])expect(text.includes(secret),'leak: '+String(secret).slice(0,4)).toBe(false);
 },300000);

 it('storage outage: Express answers "retryable" without confirming, nothing is lost or double counted when the server returns',async()=>{
  const h=await ingest(),demo=await startDemo({store:h.repository});
  try{
   const plan=generateDemoEvents({installations:1,days:2,anchor:'2026-11-04',seed:'twosides-b86-outage-v1'}),items=plan.events.slice(0,10),expected=expectedTotals(items);
   const token=demo.identities.issueSynthetic({installationId:plan.installationIds[0],lifetimeMs:3600000});
   const send=batch=>fetch(demo.url+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(toEnvelope(batch))}).then(r=>r.json());
   const before=(await h.repository.aggregates())['all|events']??0;
   expect((await send(items.slice(0,5))).Receipts.every(r=>r.Status==='accepted')).toBe(true);
   await s.stop();
   const t0=Date.now(),during=await send(items.slice(5,10)),outageMs=Date.now()-t0;console.log('B86_OUTAGE_MS_FOR_BATCH_OF_5',outageMs);
   expect(outageMs).toBeLessThan(9000);   // was ~25 s before the request budget; the .NET client waits 15 s
   const t1=Date.now();await send(items.slice(5,10));expect(Date.now()-t1).toBeLessThan(1000);   // circuit breaker: answered at once while open
   expect(during.Receipts.every(r=>r.Status==='retryable')).toBe(true);expect(during.Receipts.every(r=>r.Code==='storage_unavailable')).toBe(true);
   await s.start();
   let final;for(let i=0;i<15;i++){final=await send(items.slice(5,10));if(final.Receipts.every(r=>r.Status==='accepted'))break;await new Promise(r=>setTimeout(r,2000));}
   console.log('B86_OUTAGE_RECOVERY_STATUSES',JSON.stringify(final.Receipts.map(r=>r.Status)));
   expect(final.Receipts.every(r=>r.Status==='accepted')).toBe(true);
   for(const part of [items.slice(0,5),items.slice(5,10)])expect((await send(part)).Receipts.every(r=>r.Status==='duplicate')).toBe(true);
   expect(((await h.repository.aggregates())['all|events']??0)-before).toBe(expected.events);
  }finally{await demo.close().catch(()=>{});await h.close().catch(()=>{});}
 },300000);
});
