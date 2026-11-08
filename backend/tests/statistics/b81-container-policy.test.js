// B81.1: offline checks of the narrow owned-container profile. No Docker command, no connection, no environment read.
import './b80-isolation-guard.js';
import {describe,it,expect} from 'vitest';import {randomUUID} from 'node:crypto';
import {b81LocalConfiguration,assertB81DriverTarget,B81_OWNED_CONTAINER} from '../../src/modules/statistics/mongo-local-policy.js';
import {startOwnedB81Container} from './b81-container-instance.js';
import {keyCheck,value,withB80Fixture} from './b80-fixture.js';
import {TransactionConflict} from '../../src/modules/statistics/transaction-contract.js';
const run=()=>randomUUID().replaceAll('-','');
const container=(patch={})=>{const runId=run();return {enabled:true,runId,host:'127.0.0.1',port:27028,database:'twosides_statistics_b81_'+runId,replicaSet:'rsB811',ownedContainer:'twosides-b811-mongo',...patch};};
const native=(patch={})=>{const runId=run();return {enabled:true,runId,host:'127.0.0.1',port:41234,database:'twosides_statistics_b81_'+runId,replicaSet:'b81_'+runId,...patch};};
describe('B81.1 owned-container profile',()=>{
 it('accepts exactly twosides-b811-mongo on 127.0.0.1:27028 with rsB811',()=>{const c=b81LocalConfiguration(container());expect(Object.isFrozen(c)).toBe(true);expect(c.ownedContainer).toBe(B81_OWNED_CONTAINER.name);expect(c.replicaSet).toBe('rsB811');});
 it('keeps the native-process profile unchanged',()=>{const n=native();expect(b81LocalConfiguration(n).replicaSet).toBe(n.replicaSet);});
 it.each([
  ['rsB811 without the container marker',()=>native({replicaSet:'rsB811'})],
  ['container marker with a native-style replica set',()=>{const c=container();return {...c,replicaSet:'b81_'+c.runId};}],
  ['container marker on another port',()=>container({port:27029})],
  ['container marker on the default port',()=>container({port:27017})],
  ['another container name',()=>container({ownedContainer:'twosides-mongo-it-53d5ecdcb71669dbe78912bad89016e2'})],
  ['an empty container marker',()=>container({ownedContainer:''})],
  ['localhost instead of the literal loopback',()=>container({host:'localhost'})],
  ['an Atlas host',()=>container({host:'twosidescluster.fxqeo8o.mongodb.net'})],
  ['a production database',()=>container({database:'two_sides_db'})],
  ['an unknown key',()=>container({uri:'mongodb://127.0.0.1:27028'})],
  ['credentials',()=>container({user:'u',password:'p'})],
  ['disabled',()=>container({enabled:false})]
 ])('rejects %s',(name,make)=>{expect(()=>b81LocalConfiguration(make())).toThrow('B81 local configuration rejected');});
 it('validates driver options for the container profile and rejects a mismatching replica set',()=>{
  const config=container(),db={databaseName:config.database},options={directConnection:true,replicaSet:'rsB811',hosts:[{host:'127.0.0.1',port:27028}]};
  expect(assertB81DriverTarget({options},db,config).port).toBe(27028);
  for(const patch of [{replicaSet:'b81_x'},{directConnection:false},{hosts:[{host:'127.0.0.1',port:27017}]},{hosts:[{host:'127.0.0.1',port:27028},{host:'127.0.0.1',port:27029}]},{credentials:{}},{srvHost:'x'},{tls:true}])
   expect(()=>assertB81DriverTarget({options:{...options,...patch}},db,config)).toThrow('B81 driver target rejected');
 });
 // B81.1: observed on a real MongoDB 8.0.34, the loser of a WriteConflict was retried instantly three times and gave up. Same three attempts, now separated by a bounded pause.
 it('conflict retries keep three attempts but pause between them (30-60 ms, then 90-180 ms)',()=>withB80Fixture(async f=>{
  const times=[];f.point(async n=>{if(n==='before_commit'){times.push(Date.now());if(times.length<3)throw new TransactionConflict();}});
  expect((await f.repository.commit(value())).status).toBe('accepted');
  expect(times).toHaveLength(3);expect(times[1]-times[0]).toBeGreaterThanOrEqual(28);expect(times[2]-times[1]).toBeGreaterThanOrEqual(85);expect(times[2]-times[0]).toBeLessThan(2000);
  expect((await f.repository.aggregates())['all|events']).toBe(1);
 }));
 it('exhausted conflicts still stop after exactly three attempts and leave zero partial counts',()=>withB80Fixture(async f=>{
  let attempts=0;f.point(async n=>{if(n==='before_commit'){attempts++;throw new TransactionConflict();}});
  await expect(f.repository.commit(value())).rejects.toThrow();expect(attempts).toBe(3);f.point(async()=>{});
  const s=await f.adapter.readCommitted();expect(s.counts).toEqual({});expect(s.receipts).toEqual({});
 }));
 it('the container harness refuses to start without explicit authorization (before any Docker or network use)',async()=>{
  await expect(startOwnedB81Container({keyCheck})).rejects.toThrow('B81 container authorization required');
  await expect(startOwnedB81Container({enabled:true,keyCheck:'x'})).rejects.toThrow('B81 container authorization required');
 });
});
