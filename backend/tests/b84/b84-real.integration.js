// B84 — REAL integration: synthetic event -> Express -> MongoDB 8 (owner's container, fresh synthetic test database) -> aggregate -> admin API.
// Opt-in only (B84_REAL_TESTS=1, config tests/b84/b84-real.config.js). Never touches the demo database, admin/config/local or Atlas.
import '../statistics/b80-isolation-guard.js';
import {describe,it,expect} from 'vitest';
import {openB84Store,DEMO_DATABASE} from '../../tools/b84/demo-store.js';
import {startDemo} from './b84-fixture.js';
import {generateDemoEvents,expectedTotals,toEnvelope} from '../../tools/b84/generator.js';

const enabled=process.env.B84_REAL_TESTS==='1',suite=enabled?describe:describe.skip;
const ADMIN='/api/v1/admin/statistics/';
async function withRealDemo(run){
 const store=await openB84Store({kind:'test'});let demo;
 try{demo=await startDemo({store:store.repository});await run({store,demo});}
 finally{try{await demo?.close();}finally{await store.close({keepDatabase:false});}}
}
suite('B84 real MongoDB end to end',()=>{
 it('uses a fresh B84 test database inside the verified container, never the demo database',async()=>{
  await withRealDemo(async({store})=>{expect(store.database).toMatch(/^twosides_statistics_b81_b84e[a-f0-9]{28}$/);expect(store.database).not.toBe(DEMO_DATABASE);expect(store.serverVersion).toMatch(/^8\.0\./);});
 });
 it('ingests through HTTP, aggregates inside MongoDB transactions and serves exactly the accepted figures; replays and duplicates change nothing',async()=>{
  await withRealDemo(async({store,demo})=>{
   const plan=generateDemoEvents({installations:10,days:8,anchor:'2026-11-04'}),expected=expectedTotals(plan.events);
   const first=await demo.seed(plan.events,Date.now());
   expect(first.tally.accepted).toBe(plan.events.length);expect(first.tally.rejected).toBe(0);expect(first.tally.duplicate).toBeGreaterThan(0);
   const token=await demo.adminToken(),get=async r=>(await demo.call('GET',ADMIN+r,{token})).json.data;
   const o=await get('overview');
   expect(o).toMatchObject({installations:expected.installations,gamesStarted:expected.gamesStarted,gamesCompleted:expected.gamesCompleted,effectiveMs:expected.effectiveMs,sessionsStarted:expected.sessionsStarted,sessionsClosed:expected.sessionsClosed,sessionsInterrupted:expected.sessionsInterrupted,events:expected.events});
   for(const b of (await get('biomes')).biomes)expect(b).toMatchObject({visits:expected.biomes[b.id].visits,completions:expected.biomes[b.id].completions,effectiveMs:expected.biomes[b.id].effectiveMs});
   const e=await get('endings');expect([e.good,e.medium,e.bad]).toEqual([expected.endings.good,expected.endings.medium,expected.endings.bad]);
   const ts=await get('timeseries?days=14');for(const p of ts.points)expect(p.gamesStarted).toBe(expected.days[p.date]?.gamesStarted??0);
   const counters=await store.repository.aggregates();   // the store's own invariant check runs inside aggregates()
   expect(counters['all|events']).toBe(expected.events);
   const second=await demo.seed(plan.events,Date.now());expect(second.tally.accepted).toBe(0);
   expect(await get('overview')).toEqual(o);expect(await store.repository.aggregates()).toEqual(counters);
  });
 },240000);
 it('concurrent writers (same installation, overlapping batches) never lose or double count an event',async()=>{
  await withRealDemo(async({store,demo})=>{
   const plan=generateDemoEvents({installations:1,days:4,anchor:'2026-11-04'}),items=plan.events.slice(0,60),expected=expectedTotals(items);
   const token=demo.identities.issueSynthetic({installationId:plan.installationIds[0],lifetimeMs:3600000});
   const send=batch=>fetch(demo.url+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(toEnvelope(batch))}).then(r=>r.json());
   const batches=[];for(let i=0;i<items.length;i+=5)batches.push(items.slice(i,i+5));
   const statuses=new Map();
   // Rounds of 4 concurrent copies of every batch. Retryable receipts (write conflicts exhausted) are legitimately re-sent, as the game client would.
   for(let round=0;round<6;round++){
    const receipts=(await Promise.all(batches.flatMap(b=>[b,b,b,b].map(send)))).flatMap(r=>r.Receipts);
    for(const r of receipts)statuses.set(r.Status,(statuses.get(r.Status)??0)+1);
    const o=(await demo.call('GET',ADMIN+'overview',{token:await demo.adminToken()})).json.data;if(o.events===expected.events)break;
   }
   const o=(await demo.call('GET',ADMIN+'overview',{token:await demo.adminToken()})).json.data;
   expect(o.events).toBe(expected.events);expect(o.gamesStarted).toBe(expected.gamesStarted);expect(o.effectiveMs).toBe(expected.effectiveMs);
   expect(statuses.get('rejected')??0).toBe(0);console.log('B84_CONCURRENCY_STATUSES',JSON.stringify(Object.fromEntries(statuses)));
   expect(Object.keys(await store.repository.aggregates()).length).toBeGreaterThan(0);
  });
 },240000);
});
