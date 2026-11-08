// B86: Express must answer inside the .NET client's 15 s HTTP timeout even when MongoDB is slow or down, without losing idempotency or receipts.
import {describe,it,expect,afterEach} from 'vitest';
import {createB81DriverFixture} from '../statistics/b81-driver-double.js';
import {value} from '../statistics/b80-fixture.js';
import {createStatisticsOfflineApp,DEFAULT_REQUEST_BUDGET_MS,DEFAULT_BREAKER_COOLDOWN_MS} from '../../src/modules/statistics/offline-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {StatisticsUnavailable,TransactionConflict} from '../../src/modules/statistics/transaction-contract.js';
import {toEnvelope} from '../../tools/b84/generator.js';
import {randomUUID} from 'node:crypto';

const CLIENT_TIMEOUT_MS=15000,open=[];
afterEach(async()=>{await Promise.all(open.splice(0).map(x=>x()));});
async function rig(options={}){
 const f=await createB81DriverFixture(),identities=new SyntheticStatisticsIdentity(),installation=randomUUID(),clock={t:1000},calls={n:0};
 const token=identities.issueSynthetic({installationId:installation,now:f.clock.now});
 const app=createStatisticsOfflineApp({profile:'statistics-b81-local-test',identities,store:f.repository,now:()=>f.clock.now,limiter:{consume(){}},monotonic:()=>clock.t,...options});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const original=f.repository.commit.bind(f.repository);
 f.repository.commit=(...a)=>{calls.n++;return impl.fn(...a);};const impl={fn:original};
 const post=async items=>{const t0=Date.now(),response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(toEnvelope(items))});return {status:response.status,body:await response.json(),ms:Date.now()-t0};};
 const events=n=>Array.from({length:n},()=>{const v=value(installation,{},f.clock.now);return {canonical:v.canonical,payloadHash:v.hash,event:v.event};});
 open.push(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections?.();});await f.close();});
 return {f,post,events,clock,calls,impl,original,installation};
}
const never=()=>new Promise(()=>{});

describe('B86 time budget (client timeout 15 s)',()=>{
 it('the default budget plus transport margin is below the client timeout, and bad budgets are refused',async()=>{
  expect(DEFAULT_REQUEST_BUDGET_MS).toBeLessThanOrEqual(CLIENT_TIMEOUT_MS-5000);expect(DEFAULT_BREAKER_COOLDOWN_MS).toBeGreaterThan(0);
  const f=await createB81DriverFixture();open.push(()=>f.close());
  for(const bad of [{requestBudgetMs:20000},{requestBudgetMs:10},{requestBudgetMs:1.5},{breakerCooldownMs:-1},{breakerCooldownMs:61000}])expect(()=>createStatisticsOfflineApp({profile:'statistics-b81-local-test',identities:new SyntheticStatisticsIdentity(),store:f.repository,...bad})).toThrow();
 });
 it('a hanging store answers the whole batch within the budget: retryable, nothing confirmed',async()=>{
  const r=await rig({requestBudgetMs:300});r.impl.fn=never;
  const out=await r.post(r.events(5).map(x=>x));
  expect(out.status).toBe(200);expect(out.ms).toBeLessThan(2000);expect(out.body.Receipts).toHaveLength(5);
  expect(out.body.Receipts.every(x=>x.Status==='retryable')).toBe(true);expect(out.body.Receipts[0].Code).toBe('deadline_exceeded');expect(out.body.Receipts.slice(1).every(x=>x.Code==='storage_unavailable')).toBe(true);
  expect(r.calls.n).toBe(1);   // the breaker stopped the other four from waiting
 });
 it('storage failure: first event fails, the rest of the batch and the cooldown window answer at once; service resumes after the cooldown',async()=>{
  const r=await rig({requestBudgetMs:5000,breakerCooldownMs:5000});r.impl.fn=async()=>{r.clock.t+=1500;throw new StatisticsUnavailable();};   // a SLOW failure: the driver waited for a server that is not there
  const batch=r.events(5),first=await r.post(batch);
  expect(first.body.Receipts.every(x=>x.Status==='retryable'&&x.Code==='storage_unavailable')).toBe(true);expect(r.calls.n).toBe(1);
  const during=await r.post(batch);expect(during.ms).toBeLessThan(1000);expect(during.body.Receipts.every(x=>x.Status==='retryable')).toBe(true);expect(r.calls.n).toBe(1);   // zero attempts while open
  r.clock.t+=5001;r.impl.fn=r.original;
  const after=await r.post(batch);expect(after.body.Receipts.every(x=>x.Status==='accepted')).toBe(true);
  expect((await r.f.repository.aggregates())['all|events']).toBe(5);
 });
 it('a commit that outlives the budget is retryable, still lands once, and its replay is a duplicate (idempotency and receipts preserved)',async()=>{
  const r=await rig({requestBudgetMs:150,breakerCooldownMs:0});let released;const gate=new Promise(res=>{released=res;});
  r.impl.fn=async v=>{await gate;return r.original(v);};
  const one=r.events(1),late=await r.post(one);
  expect(late.body.Receipts[0]).toMatchObject({Status:'retryable',Code:'deadline_exceeded',EventId:one[0].event.EventId});expect(late.ms).toBeLessThan(2000);
  released();await new Promise(res=>setTimeout(res,200));         // the abandoned commit finishes in the background
  r.impl.fn=r.original;const replay=await r.post(one);
  expect(replay.body.Receipts[0].Status).toBe('duplicate');expect(replay.body.Receipts[0].PayloadHash).toBe(one[0].payloadHash);
  expect((await r.f.repository.aggregates())['all|events']).toBe(1);
 });
 it('a replay that races the still-running original is also counted exactly once',async()=>{
  const r=await rig({requestBudgetMs:100,breakerCooldownMs:0});r.impl.fn=async v=>{await new Promise(res=>setTimeout(res,250));return r.original(v);};
  const one=r.events(1),a=await r.post(one),b=await r.post(one);
  expect(a.body.Receipts[0].Status).toBe('retryable');expect(b.body.Receipts[0].Status).toBe('retryable');
  await new Promise(res=>setTimeout(res,900));r.impl.fn=r.original;
  expect((await r.post(one)).body.Receipts[0].Status).toBe('duplicate');expect((await r.f.repository.aggregates())['all|events']).toBe(1);
 });
 it('an isolated fast failure never blocks other clients; three consecutive ones do; a success resets the count',async()=>{
  const r=await rig({breakerCooldownMs:5000});let fail=true;r.impl.fn=async v=>{if(fail)throw new StatisticsUnavailable();return r.original(v);};
  const one=await r.post(r.events(1));expect(one.body.Receipts[0].Code).toBe('storage_unavailable');expect(r.calls.n).toBe(1);
  fail=false;const ok=await r.post(r.events(1));expect(ok.body.Receipts[0].Status).toBe('accepted');   // not blocked, and the success resets the counter
  fail=true;const three=await r.post(r.events(5));expect(three.body.Receipts.every(x=>x.Status==='retryable')).toBe(true);expect(r.calls.n).toBe(1+1+3);   // 3 attempts opened it, 2 events were short-circuited
  const blocked=await r.post(r.events(2));expect(blocked.ms).toBeLessThan(1000);expect(r.calls.n).toBe(5);
 });
 it('write conflicts stay retryable but do NOT shut the service for other clients',async()=>{
  const r=await rig({breakerCooldownMs:5000});r.impl.fn=async()=>{throw new TransactionConflict();};
  const a=await r.post(r.events(2));expect(a.body.Receipts.every(x=>x.Status==='retryable'&&x.Code==='storage_unavailable')).toBe(true);expect(r.calls.n).toBe(2);   // both attempted
  r.impl.fn=r.original;const b=await r.post(r.events(2));expect(b.body.Receipts.every(x=>x.Status==='accepted')).toBe(true);
 });
 it('invalid events are still rejected permanently even while the store is down; nothing is attempted for them',async()=>{
  const r=await rig({requestBudgetMs:200});r.impl.fn=never;
  const good=r.events(1)[0],bad={canonical:good.canonical,payloadHash:'0'.repeat(64),event:good.event};
  const out=await r.post([bad,good]);expect(out.body.Receipts[0]).toMatchObject({Status:'rejected',Code:'hash_mismatch'});expect(out.body.Receipts[1].Status).toBe('retryable');expect(r.calls.n).toBe(1);
 });
 it('the normal path is unchanged: accepted, then duplicate, in a healthy batch of five',async()=>{
  const r=await rig(),batch=r.events(5);
  expect((await r.post(batch)).body.Receipts.map(x=>x.Status)).toEqual(Array(5).fill('accepted'));expect((await r.post(batch)).body.Receipts.map(x=>x.Status)).toEqual(Array(5).fill('duplicate'));
 });
});
