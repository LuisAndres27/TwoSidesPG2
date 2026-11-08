import './b80-isolation-guard.js';
import {it,expect} from 'vitest';import {randomUUID} from 'node:crypto';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createB82RealFixture,factValue} from './b82-fixture.js';
import {statisticsRepositoryContract} from './transaction-contract-suite.js';
import {MONGO_STATISTICS_COLLECTIONS as names} from '../../src/modules/statistics/mongo-schema.js';
import {MongoStatisticsTransactionAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {keyCheck} from './b80-fixture.js';
import {B82_RUN_HYBRID} from '../../src/modules/statistics/retention-policy.js';
import {createStatisticsOfflineApp} from '../../src/modules/statistics/offline-app.js';
import {SyntheticStatisticsIdentity} from '../../src/modules/statistics/synthetic-identity.js';
const DAY=86400000;
async function contractFactory(){const f=await createB82RealFixture();return {repository:f.first.repository,adapter:f.first.adapter,close:()=>f.close()};}
statisticsRepositoryContract('B80 unchanged contract / REAL B82 hybrid',contractFactory);
async function fixture(run,options){const f=await createB82RealFixture(options);try{await run(f);}finally{await f.close();console.log('B82_RETENTION_CLEANUP',JSON.stringify({database:f.runtime.config.database,deleted:true,restarted:false}));}}
it.each(['installation_registered','game_started','game_completed','biome_completed','environmental_decision'])('REAL B82: %s remains unique beyond the old retention horizon',type=>fixture(async f=>{
 const inst=randomUUID(),game=randomUUID().replaceAll('-',''),first=factValue(inst,type,f.clock.now,game);await f.first.repository.commit(first);const before=await f.first.repository.aggregates();
 f.clock.now+=100*DAY;const second=factValue(inst,type,f.clock.now,game);expect((await f.first.repository.commit(second)).code).toBe('fact_conflict');expect(await f.first.repository.aggregates()).toEqual(before);
 expect((await f.first.repository.commit(first)).code).toBe('event_expired');
}));
it('REAL B82: physical TTL removes temporary keys but the installation marker prevents recounting',()=>fixture(async f=>{
 const inst=randomUUID(),first=factValue(inst,'installation_registered',f.clock.now);expect((await f.first.repository.commit(first)).status).toBe('accepted');
 const db=f.first.client.db(f.runtime.config.database),sizes=async()=>Object.fromEntries(await Promise.all(Object.entries(names).map(async([g,n])=>[g,await db.collection(n).countDocuments({})])));
 const before=await sizes(),started=Date.now();let after=before;
 do{after=await sizes();if(['receipts','distinct','budgets'].every(g=>after[g]===0))break;await new Promise(r=>setTimeout(r,2000));}while(Date.now()-started<170000);
 expect([after.receipts,after.distinct,after.budgets]).toEqual([0,0,0]);expect(after.semantic).toBe(1);
 const marker=await db.collection(names.semantic).findOne({});expect(Object.keys(marker).sort()).toEqual(['_id','kind']);expect(marker.kind).toBe('b82-run-semantic-v1');
 f.clock.now=Date.parse('2026-11-04T12:00:00.000Z');expect((await f.first.repository.commit(first)).code).toBe('event_expired');
 const fresh=factValue(inst,'installation_registered',f.clock.now);expect((await f.first.repository.commit(fresh)).code).toBe('fact_conflict');
 expect((await f.first.repository.aggregates())['all|installations_registered']).toBe(1);
 const next=factValue(randomUUID(),'installation_registered',f.clock.now);expect((await f.first.repository.commit(next)).status).toBe('accepted');expect((await f.first.repository.commit(next)).status).toBe('duplicate');expect((await f.first.repository.aggregates())['all|installations_registered']).toBe(2);
 console.log('B82_TTL_PROOF',JSON.stringify({database:f.runtime.config.database,before,after,waitMs:Date.now()-started,sameFactNewEvent:'fact_conflict',sameFactTotal:1,newInstallationTotal:2,retentionPolicy:B82_RUN_HYBRID,productionRetentionApproved:false}));
},{now:Date.parse('2026-02-10T12:00:00.000Z')}),240000);
it('REAL B82: exact indexes and default-policy refusal preserve policy separation',()=>fixture(async f=>{
 const db=f.first.client.db(f.runtime.config.database),report={};for(const [g,n]of Object.entries(names))report[g]=(await db.collection(n).listIndexes().toArray()).map(i=>({name:i.name,key:i.key,expireAfterSeconds:i.expireAfterSeconds}));
 expect(report.semantic).toEqual([{name:'_id_',key:{_id:1},expireAfterSeconds:undefined}]);for(const g of ['receipts','distinct','budgets'])expect(report[g]).toContainEqual({name:'expiry_v1',key:{expiresAt:1},expireAfterSeconds:0});
 const old=new MongoStatisticsTransactionAdapter({client:f.first.client,db,config:f.runtime.config,keyCheck});try{await expect(old.verify()).rejects.toThrow();}finally{await old.close();}
 console.log('B82_SCHEMA',JSON.stringify({indexes:report,policy:B82_RUN_HYBRID,legacyPolicyRejected:true}));
}));
it('REAL B82 + HTTP: renewed technical token does not bypass semantic uniqueness; a new installation is valid',()=>fixture(async f=>{
 const identities=new SyntheticStatisticsIdentity(),installation=randomUUID(),first=factValue(installation,'installation_registered',f.clock.now),token1=identities.issueSynthetic({installationId:installation,now:f.clock.now});
 const app=createStatisticsOfflineApp({profile:'statistics-b81-local-test',identities,store:f.first.repository,now:()=>f.clock.now}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=async(v,token)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/statistics/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({Contract:'statistics-only-v1',Events:[{EventJson:v.canonical,PayloadHash:v.hash}]})});return {status:response.status,body:await response.json()};};
 try{expect((await post(first,token1)).body.Receipts[0].Status).toBe('accepted');const token2=identities.issueSynthetic({installationId:installation,now:f.clock.now});expect((await post(first,token2)).body.Receipts[0].Status).toBe('duplicate');expect((await post(factValue(installation,'installation_registered',f.clock.now),token2)).body.Receipts[0].Code).toBe('fact_conflict');const newInst=randomUUID(),newEvent=factValue(newInst,'installation_registered',f.clock.now);expect((await post(newEvent,token2)).status).toBe(403);const newToken=identities.issueSynthetic({installationId:newInst,now:f.clock.now});expect((await post(newEvent,newToken)).body.Receipts[0].Status).toBe('accepted');expect((await f.first.repository.aggregates())['all|installations_registered']).toBe(2);}finally{await new Promise(r=>server.close(r));}
}));
it('REAL B82: precommit failure does not leave a semantic marker or false receipt',()=>fixture(async f=>{
 const v=factValue(randomUUID(),'installation_registered',f.clock.now);f.first.point(async name=>{if(name==='before_commit')throw Error('B82_PUBLIC_INJECTED_ABORT');});await expect(f.first.repository.commit(v)).rejects.toThrow();f.first.point(async()=>{});const s=await f.first.adapter.readCommitted();expect(s.semantic).toEqual({});expect(s.receipts).toEqual({});expect(s.counts).toEqual({});expect((await f.first.repository.commit(v)).status).toBe('accepted');
}));
it('REAL B82: independent Node process finds the run-scoped marker after reopening',()=>fixture(async f=>{
 const inst=randomUUID();await f.first.repository.commit(factValue(inst,'installation_registered',f.clock.now));
 const result=await new Promise((resolve,reject)=>{const child=fork(fileURLToPath(new URL('./b81-node-worker.js',import.meta.url)),[],{execArgv:[],windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,USERPROFILE:process.env.USERPROFILE,APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,TEMP:process.env.TEMP,TMP:process.env.TMP}});let message;const timer=setTimeout(()=>{child.kill();reject(Error('B82 owned worker timeout'));},30000);child.once('message',m=>{message=m;});child.once('error',()=>{clearTimeout(timer);reject(Error('B82 worker unavailable'));});child.once('exit',code=>{clearTimeout(timer);if(code===0&&message?.ok)resolve(message);else reject(Error('B82 worker failed'));});child.send({container:true,config:f.runtime.config,retentionPolicy:B82_RUN_HYBRID,expectedContainerId:f.runtime.container.id,value:factValue(inst,'installation_registered',f.clock.now)});});
 expect(result).toMatchObject({ok:true,status:'rejected',code:'fact_conflict',events:1});expect((await f.first.repository.aggregates())['all|installations_registered']).toBe(1);
}));
