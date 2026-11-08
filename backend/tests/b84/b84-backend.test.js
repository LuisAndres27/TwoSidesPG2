import {describe,it,expect,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {createB81DriverFixture} from '../statistics/b81-driver-double.js';
import {startDemo} from './b84-fixture.js';
import {generateDemoEvents,expectedTotals,toEnvelope} from '../../tools/b84/generator.js';
import {CONTRACT,hash} from '../../src/modules/statistics/contract.js';

const open=[];
async function demo({events,dailyLimit}={}){
 const f=await createB81DriverFixture({dailyLimit}),d=await startDemo({store:f.repository,now:()=>f.clock.now});
 const entry={...f,...d,async close(){await d.close();await f.close();}};open.push(entry);return entry;
}
afterEach(async()=>{await Promise.all(open.splice(0).map(x=>x.close()));});
const ADMIN='/api/v1/admin/statistics/';
const small=()=>generateDemoEvents({installations:6,days:5,anchor:'2026-11-04'});

describe('B84 administrative authentication and authorization',()=>{
 it('rejects every administrative route without a token, with garbage and with a duplicated header',async()=>{
  const d=await demo();
  for(const route of ['overview','biomes','decisions','endings','timeseries','status']){
   expect((await d.call('GET',ADMIN+route)).status).toBe(401);
   expect((await d.call('GET',ADMIN+route,{token:'not.a.jwt'})).status).toBe(401);
  }
  expect((await d.call('POST','/api/v1/admin/logout')).status).toBe(401);
 });
 it('a PLAYER credential cannot get an administrative session',async()=>{
  const d=await demo(),result=await d.login(d.player.id,d.player.credential);
  expect(result.status).toBe(403);expect(result.json.accessToken).toBeUndefined();
 });
 it('the admin guard refuses a principal whose role is player (403) and one without principal (401)',async()=>{
  const {authorize}=await import('../../src/middleware/authorization.js'),{createAdminStatisticsRouter}=await import('../../src/modules/statistics/admin-statistics.js'),{errorHandler}=await import('../../src/middleware/security.js'),express=(await import('express')).default;
  const f=await createB81DriverFixture();open.push(f);
  for(const principal of [{id:randomUUID(),role:'player'},undefined]){
   const app=express();app.use((request,_r,next)=>{request.principal=principal;next();});
   app.use('/s',createAdminStatisticsRouter({repository:f.repository,guards:[authorize('admin')],mode:{demo:true}}));app.use(errorHandler);
   const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
   const status=(await fetch('http://127.0.0.1:'+server.address().port+'/s/overview')).status;await new Promise(r=>{server.close(r);server.closeAllConnections?.();});
   expect(status).toBe(principal?403:401);
  }
  expect(()=>createAdminStatisticsRouter({repository:f.repository,guards:[],mode:{demo:true}})).toThrow();
  expect(()=>createAdminStatisticsRouter({repository:f.repository,guards:[authorize('admin')],mode:{demo:false}})).toThrow();
 });
 it('wrong credential is a generic 401 and invalid shapes are 400',async()=>{
  const d=await demo();
  const bad=await d.login(d.admin.technicalAccountId,'A'.repeat(43));expect(bad.status).toBe(401);expect(JSON.stringify(bad.json)).not.toContain(d.admin.credential);
  expect((await d.call('POST','/api/v1/admin/session',{body:{schemaVersion:1,technicalAccountId:'x',credential:'y'}})).status).toBe(400);
  expect((await d.call('POST','/api/v1/admin/session?x=1',{body:{}})).status).toBe(400);
  expect((await d.call('POST','/api/v1/admin/session',{body:'not json',headers:{'Content-Type':'application/json'}})).status).toBe(400);
 });
 it('the session endpoint rate-limits repeated failures',async()=>{
  const d=await demo();let last;for(let i=0;i<7;i++)last=await d.login(d.admin.technicalAccountId,'A'.repeat(43));
  expect(last.status).toBe(429);
 });
 it('logout revokes the session server-side',async()=>{
  const d=await demo(),token=await d.adminToken();
  expect((await d.call('GET',ADMIN+'overview',{token})).status).toBe(200);
  expect((await d.call('POST','/api/v1/admin/logout',{token})).json.status).toBe('logged_out');
  expect((await d.call('GET',ADMIN+'overview',{token})).status).toBe(401);
 });
 it('an expired token (15 min) is refused',async()=>{
  const d=await demo(),token=await d.adminToken();
  d.clock.now+=901000;expect((await d.call('GET',ADMIN+'overview',{token})).status).toBe(401);
 });
 it('the response of a successful login declares demo mode and carries no verifier or account data',async()=>{
  const d=await demo(),r=await d.login();
  expect(r.json.mode.demo).toBe(true);expect(Object.keys(r.json).sort()).toEqual(['accessToken','expiresIn','mode','role','schemaVersion','tokenType']);
 });
});

describe('B84 ingestion -> aggregates -> administrative API (driver double, exact arithmetic)',()=>{
 it('every figure of the API equals an independent count of the accepted events; replays and duplicates change nothing',async()=>{
  const d=await demo(),plan=small(),expected=expectedTotals(plan.events);
  const first=await d.seed(plan.events);
  expect(first.tally.accepted).toBe(plan.events.length);expect(first.tally.rejected).toBe(0);expect(first.tally.duplicate).toBeGreaterThan(0);   // controlled replays
  const token=await d.adminToken(),get=async r=>(await d.call('GET',ADMIN+r,{token})).json;
  const o=(await get('overview')).data;
  expect(o).toMatchObject({installations:expected.installations,gamesStarted:expected.gamesStarted,gamesCompleted:expected.gamesCompleted,effectiveMs:expected.effectiveMs,sessionsStarted:expected.sessionsStarted,sessionsClosed:expected.sessionsClosed,sessionsInterrupted:expected.sessionsInterrupted,events:expected.events});
  expect(o.completionRate).toBe(expected.gamesCompleted/expected.gamesStarted);
  expect(o.averages.effectiveMsPerGameStarted).toBe(expected.effectiveMs/expected.gamesStarted);
  const biomes=(await get('biomes')).data.biomes;expect(biomes.map(b=>b.id)).toEqual(['ocean','jungle','desert','forest','tundra']);
  for(const b of biomes)expect(b).toMatchObject({visits:expected.biomes[b.id].visits,completions:expected.biomes[b.id].completions,effectiveMs:expected.biomes[b.id].effectiveMs,
   decisions:{approve:expected.biomes[b.id].approve,reject:expected.biomes[b.id].reject},environment:{healthy:expected.biomes[b.id].healthy,degraded:expected.biomes[b.id].degraded}});
  const e=(await get('endings')).data;expect([e.good,e.medium,e.bad]).toEqual([expected.endings.good,expected.endings.medium,expected.endings.bad]);expect(e.total).toBe(expected.gamesCompleted);expect(e.good+e.medium+e.bad).toBe(e.total);
  const dec=(await get('decisions')).data.totals;expect(dec.approve+dec.reject).toBe(dec.healthy+dec.degraded);
  const ts=(await get('timeseries?days=10')).data;expect(ts.points).toHaveLength(10);
  for(const p of ts.points)expect(p).toMatchObject({gamesStarted:expected.days[p.date]?.gamesStarted??0,gamesCompleted:expected.days[p.date]?.gamesCompleted??0,effectiveMs:expected.days[p.date]?.effectiveMs??0});
  expect(ts.totals.gamesStarted).toBe(expected.gamesStarted);
  // Running the whole generator again must not move a single counter.
  const second=await d.seed(plan.events);expect(second.tally.accepted).toBe(0);expect(second.tally.duplicate).toBeGreaterThan(plan.events.length-1);
  expect((await get('overview')).data).toEqual(o);
 });
 it('invalid events are rejected per event and never counted; full games and personal fields are refused',async()=>{
  const d=await demo(),plan=small(),identity=plan.installationIds[0],token=d.identities.issueSynthetic({installationId:identity,now:d.clock.now,lifetimeMs:3600000});
  const post=body=>fetch(d.url+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:typeof body==='string'?body:JSON.stringify(body)}).then(async r=>({status:r.status,json:await r.json()}));
  const good=plan.events.find(x=>x.installationId===identity&&x.event.Type==='installation_registered');
  const tampered=JSON.stringify({...good.event,EventId:randomUUID()}),withPerson=JSON.stringify({...good.event,EventId:randomUUID(),PlayerName:'PUBLIC FAKE NAME'});
  const r=await post({Contract:CONTRACT,Events:[{EventJson:tampered,PayloadHash:'0'.repeat(64)},{EventJson:withPerson,PayloadHash:hash(withPerson)}]});
  expect(r.status).toBe(200);expect(r.json.Receipts.map(x=>x.Status)).toEqual(['rejected','rejected']);expect(r.json.Receipts.map(x=>x.Code)).toEqual(['hash_mismatch','invalid_event']);
  expect((await post({Contract:CONTRACT,Snapshot:{gameId:'PUBLIC FAKE'},Events:[]})).status).toBe(400);
  expect((await post({Contract:'statistics-only-v2',Events:[]})).status).toBe(400);
  expect((await post(toEnvelope(plan.events.slice(0,6)))).status).toBe(400);   // more than 5 per batch
  const forbidden=await post(toEnvelope([plan.events.find(x=>x.installationId!==identity)]));expect(forbidden.status).toBe(403);
  const adminToken=await d.adminToken();
  expect((await d.call('GET',ADMIN+'overview',{token:adminToken})).json.data.events).toBe(0);
 });
 it('concurrent clients sending the same and overlapping batches count each event exactly once',async()=>{
  const d=await demo(),plan=generateDemoEvents({installations:1,days:3,anchor:'2026-11-04'}),items=plan.events.slice(0,40),
   token=d.identities.issueSynthetic({installationId:plan.installationIds[0],now:d.clock.now,lifetimeMs:3600000});
  const send=batch=>fetch(d.url+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(toEnvelope(batch))}).then(r=>r.json());
  const batches=[];for(let i=0;i<items.length;i+=5)batches.push(items.slice(i,i+5));
  // 3 "clients" send ALL batches at once (3x overlap); retryable receipts are re-sent like a real client would.
  const results=[];
  for(let attempt=0;attempt<8;attempt++){
   const pending=attempt===0?batches:batches;   // resend everything: the store must absorb every repetition
   results.push(...(await Promise.all([...pending,...pending,...pending].map(send))).flatMap(r=>r.Receipts));
  }
  expect(results.every(r=>['accepted','duplicate'].includes(r.Status)||r.Status==='retryable')).toBe(true);
  const expected=expectedTotals(items),o=(await d.call('GET',ADMIN+'overview',{token:await d.adminToken()})).json.data;
  expect(o.events).toBe(expected.events);expect(o.gamesStarted).toBe(expected.gamesStarted);expect(o.effectiveMs).toBe(expected.effectiveMs);
 },120000);
 it('a failed commit is retryable, the replay then counts once (temporary storage error)',async()=>{
  const d=await demo(),plan=small(),item=plan.events[0],token=d.identities.issueSynthetic({installationId:item.installationId,now:d.clock.now,lifetimeMs:3600000});
  const send=()=>fetch(d.url+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(toEnvelope([item]))}).then(r=>r.json());
  d.point(async n=>{if(n==='before_commit')throw Error('PUBLIC FAULT');});
  expect((await send()).Receipts[0].Status).toBe('retryable');d.point(async()=>{});
  expect((await send()).Receipts[0].Status).toBe('accepted');expect((await send()).Receipts[0].Status).toBe('duplicate');
  expect((await d.call('GET',ADMIN+'overview',{token:await d.adminToken()})).json.data.events).toBe(1);
 });
 it('a lost acknowledgment is not double counted when the client retries',async()=>{
  const d=await demo(),item=small().events[0],token=d.identities.issueSynthetic({installationId:item.installationId,now:d.clock.now,lifetimeMs:3600000});
  const send=()=>fetch(d.url+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(toEnvelope([item]))}).then(r=>r.json());
  d.point(async n=>{if(n==='after_commit'||n==='read')throw Error('PUBLIC ACK LOST');});
  expect((await send()).Receipts[0].Status).toBe('retryable');d.point(async()=>{});
  expect((await send()).Receipts[0].Status).toBe('duplicate');
  expect((await d.call('GET',ADMIN+'overview',{token:await d.adminToken()})).json.data.events).toBe(1);
 });
});

describe('B84 query hardening and error handling',()=>{
 it('storage errors become a generic 503 with no internals',async()=>{
  const d=await demo(),token=await d.adminToken();
  d.point(async n=>{if(n==='read')throw Error('PUBLIC DRIVER SECRET mongodb://x');});
  const r=await d.call('GET',ADMIN+'overview',{token});
  expect(r.status).toBe(503);expect(r.text).not.toMatch(/DRIVER|mongodb|stack|at /);expect(r.json.error.code).toBe('temporarily_unavailable');
  d.point(async()=>{});expect((await d.call('GET',ADMIN+'overview',{token})).status).toBe(200);
 });
 it('only a numeric days window is accepted; no free filters exist',async()=>{
  const d=await demo(),token=await d.adminToken();
  for(const q of ['?days=0','?days=91','?days=abc','?days=1.5','?installation=1','?days=7&x=1','?days[]=7','?days=-1'])expect((await d.call('GET',ADMIN+'timeseries'+q,{token})).status,q).toBe(400);
  for(const q of ['?days=1','?days=90','?days=7',''])expect((await d.call('GET',ADMIN+'timeseries'+q,{token})).status,q).toBe(200);
  expect((await d.call('GET',ADMIN+'overview?installation=x',{token})).status).toBe(400);
  expect((await d.call('GET',ADMIN+'biomes/ocean',{token})).status).toBe(404);
  expect((await d.call('POST',ADMIN+'overview',{token,body:{}})).status).toBe(404);
 });
 it('responses expose only totals: no identifiers, hashes, keys, documents or tokens',async()=>{
  const d=await demo();await d.seed(small().events);const token=await d.adminToken();let all='';
  for(const r of ['overview','biomes','decisions','endings','timeseries','status'])all+=(await d.call('GET',ADMIN+r,{token})).text;
  expect(all).not.toMatch(/EventId|InstallationId|SessionId|GameId|_id|"hash"|payload|mongodb:\/\/|keyCheck|Bearer|accessToken/i);
  expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/);
 });
 it('every administrative response is explicitly in demonstration mode',async()=>{
  const d=await demo(),token=await d.adminToken();
  for(const r of ['overview','biomes','decisions','endings','timeseries','status'])expect((await d.call('GET',ADMIN+r,{token})).json.mode).toMatchObject({demo:true,dataset:'b84-synthetic-v1'});
 });
 it('serves the dashboard with a strict CSP, only on loopback, never dotfiles or traversal',async()=>{
  const d=await demo();expect(d.server.address().address).toBe('127.0.0.1');
  const page=await d.call('GET','/dashboard/');expect(page.status).toBe(200);
  expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");expect(page.headers.get('content-security-policy')).not.toContain('unsafe');
  expect(page.headers.get('cache-control')).toBe('no-store');expect(page.text).not.toMatch(/<script(?![^>]*src=)/);expect(page.text).not.toMatch(/\sstyle=/);
  for(const bad of ['/dashboard/.env','/dashboard/%2e%2e/package.json','/dashboard/..%2f..%2fpackage.json','/dashboard/js/../../src/app.js'])expect([403,404],bad).toContain((await d.call('GET',bad)).status);
  expect((await d.call('GET','/')).status).toBe(302);
 });
});
