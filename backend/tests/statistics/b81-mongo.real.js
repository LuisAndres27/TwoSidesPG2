// Prepared in B81; executed in B81.1 (see backend/docs/B81_1_VALIDACION_REAL_MONGODB_LOCAL.md).
import './b80-isolation-guard.js';
import {it,expect} from 'vitest';import {randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {statisticsRepositoryContract} from './transaction-contract-suite.js';
import {startOwnedB81Mongo} from './b81-local-instance.js';
import {startOwnedB81Container} from './b81-container-instance.js';
import {value,B80_KEY,keyCheck,barrier} from './b80-fixture.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
import {CONTRACT} from '../../src/modules/statistics/contract.js';
// B81.1: B81_CONTAINER_TESTS=1 selects the owner-prepared container twosides-b811-mongo (127.0.0.1:27028, rsB811) instead of a native mongod.
// The 17 cases are identical in both modes; the container is never stopped or restarted unless B81_CONTAINER_RESTART_AUTHORIZED=1.
const containerMode=process.env.B81_CONTAINER_TESTS==='1',restartAuthorized=process.env.B81_CONTAINER_RESTART_AUTHORIZED==='1';
const restartIt=containerMode&&!restartAuthorized?it.skip:it;
async function factory(){
 const runtime=containerMode?await startOwnedB81Container({enabled:process.env.B81_OWNED_LOCAL_TESTS==='1',keyCheck,restartAuthorized}):await startOwnedB81Mongo({enabled:process.env.B81_OWNED_LOCAL_TESTS==='1',mongodExecutable:process.env.B81_APPROVED_MONGOD,expectedSha256:process.env.B81_APPROVED_MONGOD_SHA256,keyCheck});
 let hook=async()=>{},adapter=await runtime.adapter({checkpoint:(...args)=>hook(...args)}),repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:B80_KEY,now:()=>Date.parse('2026-11-04T12:00:00.000Z')});
 return {runtime,get adapter(){return adapter;},get repository(){return repository;},point:fn=>{hook=fn;},
  async reopen({restartMongo=false}={}){hook=async()=>{};await repository.close();if(restartMongo)await runtime.restart();adapter=await runtime.adapter({checkpoint:(...args)=>hook(...args)});repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:B80_KEY,now:()=>Date.parse('2026-11-04T12:00:00.000Z')});},
  async close(){hook=async()=>{};try{await repository.close();}finally{await runtime.close();}}
 };
}
statisticsRepositoryContract('B80 identical contract / OWNED REAL MongoDB',factory);
async function fixture(run){const f=await factory();try{await run(f);}finally{await f.close();}}
it('REAL Mongo: overlapping batches and same counter remain coherent',()=>fixture(async f=>{const vv=Array.from({length:4},()=>value()),rr=await Promise.all([Promise.all(vv.slice(0,3).map(v=>f.repository.commit(v))),Promise.all(vv.slice(1).map(v=>f.repository.commit(v)))]);expect(rr.flat().filter(x=>x.status==='accepted')).toHaveLength(4);expect(rr.flat().filter(x=>x.status==='duplicate')).toHaveLength(2);expect((await f.repository.aggregates())['all|events']).toBe(4);}));
it.each([true,false])('REAL Mongo: independent transaction writers, identical=%s',identical=>fixture(async f=>{
 const otherAdapter=await f.runtime.adapter(),other=createB81MongoRepository({profile:'statistics-b81-local-test',adapter:otherAdapter,key:B80_KEY,now:()=>Date.parse('2026-11-04T12:00:00.000Z')});
 try{const v=value(),r=await Promise.all([f.repository.commit(v),other.commit(identical?v:value())]);expect(r.map(x=>x.status).sort()).toEqual(identical?['accepted','duplicate']:['accepted','accepted']);expect((await f.repository.aggregates())['all|events']).toBe(identical?1:2);}finally{await other.close();}
}));
it('REAL Mongo: duplicate unique key aborts both inserts and the fence',()=>fixture(async f=>{
 await expect(f.adapter.runAtomic(async tx=>{await tx.insertUnique('semantic','7'.repeat(64),{expires:Date.parse('2027-01-01T00:00:00.000Z')});await tx.insertUnique('semantic','7'.repeat(64),{expires:Date.parse('2027-01-01T00:00:00.000Z')});})).rejects.toThrow();
 const s=await f.adapter.readCommitted();expect(s.semantic).toEqual({});expect(s.counts).toEqual({});expect(s.revision).toBe(0);
}));
it('REAL Mongo: reader sees no partial transaction',()=>fixture(async f=>{const b=barrier();f.point(async n=>{if(n==='after_increment'){b.arrive();await b.wait;}});const pending=f.repository.commit(value());await b.arrived;try{expect((await f.adapter.readCommitted()).counts).toEqual({});}finally{b.release();}await pending;expect((await f.repository.aggregates())['all|events']).toBe(1);}));
it.each(['before_transaction','after_idempotency','after_increment','before_commit'])('REAL Mongo: injected application fault %s aborts all effects',point=>fixture(async f=>{f.point(async n=>{if(n===point)throw Error('B81_PUBLIC_APPLICATION_FAULT');});await expect(f.repository.commit(value())).rejects.toThrow();f.point(async()=>{});const s=await f.adapter.readCommitted();expect(s.counts).toEqual({});expect(s.receipts).toEqual({});}));
restartIt('REAL Mongo: restart owned mongod, reopen client, retry without counting twice',()=>fixture(async f=>{const v=value();await f.repository.commit(v);await f.reopen({restartMongo:true});expect((await f.repository.commit(v)).status).toBe('duplicate');expect((await f.repository.aggregates())['all|events']).toBe(1);}));
it('REAL Mongo: independent Node processes retain the same receipt across restart',()=>fixture(async f=>{
 const v=value(),run=()=>new Promise((resolve,reject)=>{
  const child=fork(fileURLToPath(new URL('./b81-node-worker.js',import.meta.url)),[],{execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP}});
  let result;const timer=setTimeout(()=>{child.kill();reject(Error('B81 owned child timeout'));},30000);
  child.once('error',()=>{clearTimeout(timer);reject(Error('B81 child failed'));});child.once('message',message=>{result=message;});
  child.once('exit',code=>{clearTimeout(timer);if(code===0&&result?.ok)resolve(result);else reject(Error('B81 child failed'));});
  child.send({config:f.runtime.config,directory:f.runtime.directory,expectedPid:f.runtime.pid,container:f.runtime.ownedContainer===true,value:v});
 });
 expect(await run()).toMatchObject({status:'accepted',events:1});expect(await run()).toMatchObject({status:'duplicate',events:1});expect((await f.repository.aggregates())['all|events']).toBe(1);
}));
it('REAL Mongo + Express: lost HTTP response, replay reconstructs the receipt',()=>fixture(async f=>{
 const installation=randomUUID(),identities=new SyntheticStatisticsIdentity(),now=Date.parse('2026-11-04T12:00:00.000Z'),token=identities.issueSynthetic({installationId:installation,now});
 const app=createStatisticsOfflineApp({profile:'statistics-b81-local-test',identities,store:f.repository,now:()=>now}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const v=value(installation),post=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/v1/statistics/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({Contract:CONTRACT,Events:[{EventJson:v.canonical,PayloadHash:v.hash}]})});
 try{const lost=await post();await lost.body.cancel();const receipt=(await (await post()).json()).Receipts[0];expect(receipt.Status).toBe('duplicate');expect(receipt.PayloadHash).toBe(v.hash);expect((await f.repository.aggregates())['all|events']).toBe(1);}finally{await new Promise(r=>server.close(r));}
}));
