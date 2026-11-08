import './b80-isolation-guard.js';
import {it,expect} from 'vitest';import {randomUUID} from 'node:crypto';
import {createB80Fixture,value} from './b80-fixture.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
import {CONTRACT,biomes} from '../../src/modules/statistics/contract.js';
async function endpoint(run){
 const f=createB80Fixture(),installation=randomUUID(),identities=new SyntheticStatisticsIdentity(),token=identities.issueSynthetic({installationId:installation,now:f.clock.now});
 const app=createStatisticsOfflineApp({profile:'statistics-offline-test',identities,store:f.repository,now:()=>f.clock.now}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=async values=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({Contract:CONTRACT,Events:values.map(v=>({EventJson:v.canonical,PayloadHash:v.hash}))})});expect(r.status).toBe(200);return r.json();};
 try{await run({...f,installation,post});}finally{await new Promise(r=>server.close(r));await f.close();}
}
it('HTTP: twenty simultaneous batches commit all one hundred distinct contributions',()=>endpoint(async f=>{
 const vv=Array.from({length:100},(_,i)=>value(f.installation,{BiomeId:biomes[i%5],Data:JSON.stringify({state:'ActiveHuman',startMs:i*30000,endMs:(i+1)*30000,excluded:false,active:true})}));
 const batches=Array.from({length:20},(_,i)=>vv.slice(i*5,i*5+5)),responses=await Promise.all(batches.map(f.post));expect(responses.flatMap(r=>r.Receipts).every(r=>r.Status==='accepted')).toBe(true);
 const s=await f.adapter.readCommitted();expect(s.counts['all|events']).toBe(100);expect(s.counts['all|effective_ms']).toBe(3000000);expect(Object.keys(s.receipts)).toHaveLength(100);for(const biome of biomes)expect(s.counts['all|time:'+biome]).toBe(600000);
}));
it('HTTP: overlapping concurrent batches reconstruct individual duplicate receipts',()=>endpoint(async f=>{const vv=Array.from({length:4},()=>value(f.installation));const rr=await Promise.all([f.post(vv.slice(0,3)),f.post(vv.slice(1))]);const receipts=rr.flatMap(r=>r.Receipts);expect(receipts.filter(r=>r.Status==='accepted')).toHaveLength(4);expect(receipts.filter(r=>r.Status==='duplicate')).toHaveLength(2);const s=await f.adapter.readCommitted();expect(s.counts['all|events']).toBe(4);expect(Object.keys(s.receipts)).toHaveLength(4);}));
it('HTTP: rejected pre-commit write returns only retryable outcomes and no increments',()=>endpoint(async f=>{const v=value(f.installation);f.point(async n=>{if(n==='before_commit')throw Error('write refused');});expect((await f.post([v])).Receipts[0].Status).toBe('retryable');f.point(async()=>{});expect((await f.adapter.readCommitted()).counts).toEqual({});expect((await f.post([v])).Receipts[0].Status).toBe('accepted');expect((await f.adapter.readCommitted()).counts['all|events']).toBe(1);}));
it('HTTP: uncertain commit with unavailable reconciliation remains retryable, then replays once',()=>endpoint(async f=>{const v=value(f.installation);f.point(async n=>{if(n==='after_commit'||n==='read')throw Error('uncertain');});expect((await f.post([v])).Receipts[0].Status).toBe('retryable');f.point(async()=>{});expect((await f.adapter.readCommitted()).counts['all|events']).toBe(1);expect((await f.post([v])).Receipts[0].Status).toBe('duplicate');expect((await f.adapter.readCommitted()).counts['all|events']).toBe(1);}));
