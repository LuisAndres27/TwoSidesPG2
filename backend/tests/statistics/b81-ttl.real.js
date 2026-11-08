// B81.1 — REAL evidence about the four TTL indexes and the long-term idempotency risk documented in B81. Container mode only
// (B81_CONTAINER_TESTS=1). Extra to the 17 prepared cases; it never replaces any of them. Synthetic data in a dedicated database only.
import './b80-isolation-guard.js';
import {describe,it,expect} from 'vitest';import {randomUUID} from 'node:crypto';import {MongoClient} from 'mongodb';
import {startOwnedB81Container} from './b81-container-instance.js';
import {value,B80_KEY,keyCheck} from './b80-fixture.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {MONGO_STATISTICS_COLLECTIONS as names} from '../../src/modules/statistics/mongo-schema.js';
const containerMode=process.env.B81_CONTAINER_TESTS==='1'&&process.env.B81_OWNED_LOCAL_TESTS==='1';
const DAY=86400000,REGISTER={Type:'installation_registered',GameId:null,BiomeId:null,DurationMs:null,Data:'{}'};
const describeReal=containerMode?describe:describe.skip;
describeReal('B81.1 TTL and long-term idempotency (REAL MongoDB)',()=>{
 it('the four expiry_v1 indexes are TTL(0) on expiresAt; counters and metadata have none; the server TTL monitor is enabled',async()=>{
  const runtime=await startOwnedB81Container({enabled:true,keyCheck}),admin=new MongoClient('mongodb://127.0.0.1:27028',{directConnection:true,replicaSet:'rsB811',serverSelectionTimeoutMS:5000});
  try{
   await admin.connect();const db=admin.db(runtime.config.database),report={};
   for(const [group,name] of Object.entries(names)){report[name]=(await db.collection(name).listIndexes().toArray()).map(i=>({name:i.name,key:i.key,expireAfterSeconds:i.expireAfterSeconds}));}
   for(const name of [names.receipts,names.semantic,names.distinct,names.budgets])expect(report[name]).toContainEqual({name:'expiry_v1',key:{expiresAt:1},expireAfterSeconds:0});
   for(const name of [names.counts,names.meta])expect(report[name]).toEqual([{name:'_id_',key:{_id:1},expireAfterSeconds:undefined}]);
   const p=await admin.db('admin').command({getParameter:1,ttlMonitorEnabled:1,ttlMonitorSleepSecs:1});
   expect(p.ttlMonitorEnabled).toBe(true);console.log('B81_1_TTL_INDEXES',JSON.stringify(report),'ttlMonitorEnabled',p.ttlMonitorEnabled,'ttlMonitorSleepSecs',p.ttlMonitorSleepSecs);
  }finally{await admin.close();await runtime.close();}
 });
 it('TTL physically removes expired receipt, semantic, active and budget keys (counters survive), and the same fact with ANOTHER EventId is counted again',async()=>{
  const runtime=await startOwnedB81Container({enabled:true,keyCheck}),admin=new MongoClient('mongodb://127.0.0.1:27028',{directConnection:true,replicaSet:'rsB811',serverSelectionTimeoutMS:5000});
  const clock={now:Date.parse('2026-02-10T12:00:00.000Z')},installation=randomUUID();
  let adapter=await runtime.adapter(),repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:B80_KEY,now:()=>clock.now});
  try{
   await admin.connect();const db=admin.db(runtime.config.database);
   const sizes=async()=>Object.fromEntries(await Promise.all([names.receipts,names.semantic,names.distinct,names.budgets,names.counts].map(async n=>[n,await db.collection(n).countDocuments({})])));
   // 1. A fact accepted "in February": every ledger key gets an expiresAt that is already in the real past (today is November 2026).
   const first=value(installation,REGISTER,clock.now);
   expect((await repository.commit(first)).status).toBe('accepted');
   const registered=async()=>(await repository.aggregates())['all|installations_registered'];
   expect(await registered()).toBe(1);const before=await sizes();
   const expired=await db.collection(names.receipts).find({}).toArray();expect(expired.every(r=>r.expiresAt.getTime()<Date.now())).toBe(true);
   console.log('B81_1_TTL_BEFORE',JSON.stringify(before),'expiresAt(receipt)=',expired[0].expiresAt.toISOString());
   // 2. Wait for the server TTL monitor (default sweep every 60 s) to remove all four ledger groups.
   const t0=Date.now();let now;
   for(;;){now=await sizes();if(now[names.receipts]===0&&now[names.semantic]===0&&now[names.distinct]===0&&now[names.budgets]===0)break;if(Date.now()-t0>170000)break;await new Promise(r=>setTimeout(r,2000));}
   const waited=Math.round((Date.now()-t0)/1000);console.log('B81_1_TTL_AFTER',JSON.stringify(now),'seconds_until_all_four_removed=',waited);
   expect([now[names.receipts],now[names.semantic],now[names.distinct],now[names.budgets]]).toEqual([0,0,0,0]);
   expect(now[names.counts]).toBeGreaterThan(0);expect(await registered()).toBe(1);   // totals have no TTL
   // 3. The ORIGINAL bytes, replayed today, are refused: its event date left the 90-day admission window (the protection B81 relies on).
   clock.now=Date.parse('2026-11-04T12:00:00.000Z');
   const replay=await repository.commit(first);console.log('B81_1_REPLAY_OF_EXPIRED_EVENT',JSON.stringify(replay));
   expect(replay).toMatchObject({status:'rejected',code:'event_expired'});expect(await registered()).toBe(1);
   // 4. RISK: the same installation registers "again" with a NEW EventId and a fresh admissible date. The semantic key that would have said
   //    fact_conflict has been physically expired, so the lifetime-unique total grows.
   const again=value(installation,REGISTER,clock.now),second=await repository.commit(again);
   console.log('B81_1_SAME_FACT_NEW_EVENTID',JSON.stringify(second),'installations_registered=',await registered());
   expect(second.status).toBe('accepted');expect(await registered()).toBe(2);
   // 5. Control: while the key is still alive the same new-EventId attempt IS refused (fact_conflict), so the dedup works inside the retention window.
   const third=await repository.commit(value(installation,REGISTER,clock.now));console.log('B81_1_CONTROL_INSIDE_RETENTION',JSON.stringify(third));
   expect(third).toMatchObject({status:'rejected',code:'fact_conflict'});expect(await registered()).toBe(2);
  }finally{try{await repository.close();}catch{}await admin.close();await runtime.close();}
 },240000);
});
