import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exportJWK } from 'jose';
import mongoose from 'mongoose';
import { fixture,vectors,resources,clone,mutate,batch } from './support/fixture.js';
import { mongoDouble } from './support/mongo-double.js';
import { MongoIngestionRepository } from '../../src/modules/sync/mongo-ingestion-repository.js';
import { mongoIdentityModels } from '../../src/modules/auth/mongo-identity-models.js';
import { MongoIdentityRepository } from '../../src/modules/auth/mongo-identity-repository.js';
import { JwtService } from '../../src/modules/auth/jwt-service.js';
import { resolveSyncContext } from '../../src/middleware/sync-auth-context.js';
import { IngestionService } from '../../src/modules/sync/ingestion-service.js';
import { concurrencyOperation } from '../../scripts/atlas-concurrency-harness.js';

afterEach(async()=>{for(const f of resources.splice(0))await f.close();vi.restoreAllMocks();});
const op=()=>clone(vectors.operations[0]);
const revoke=(identity,ctx,options={})=>identity.revoke(ctx,{commandId:randomUUID(),...options});
async function setup(){const db=mongoDouble(),f=await fixture({repositoryFactory:db.factory});return {db,f};}
async function peer(db,f){
  const identity=db.identityFactory({now:f.now});
  const auth=new JwtService({config:f.config,repository:identity,now:f.now,version:2});
  const ctx=await resolveSyncContext(await auth.authenticate(f.token),f.token,identity,f.now);
  const repository=await db.factory({identityRepository:identity,coordinator:identity.coordinator,now:f.now,context:ctx});
  return {identity,ctx,auth,repository,service:new IngestionService({repository,identityRepository:identity})};
}
function gate(){let release;const wait=new Promise(r=>{release=r;});return {wait,release};}
const operationWrite=s=>[...s.writes].some(k=>k.startsWith('operations|'));

it('DR01 real adapter commits operation, receipt and owner revision on one session',async()=>{
  const {db,f}=await setup();expect((await f.ingest([op()])).status).toBe(200);
  const stored=db.rows.operations[0];expect(stored.authorizationDecision).toEqual({owner:f.accountId,revision:2});
  const writes=db.calls.filter(c=>c.kind==='write');expect(new Set(writes.map(c=>c.session)).size).toBe(1);
  expect(writes.map(c=>c.name)).toEqual(expect.arrayContaining(['ownerGuards','operations','facts']));
});
it('DR02 revocation before authorization rejects old JWT and creates no receipt',async()=>{
  const {db,f}=await setup();await revoke(f.identity,f.ctx);expect((await f.ingest([op()])).status).toBe(401);
  await expect(f.auth.authenticate(f.token)).rejects.toMatchObject({status:401});expect(db.rows.operations).toHaveLength(0);
});
it('DR03 revocation between authorization and storage forces conflict then fresh rejection',async()=>{
  const {db,f}=await setup(),p=await peer(db,f);f.repository.beforeCommit=async()=>{f.repository.beforeCommit=async()=>{};await revoke(p.identity,p.ctx);};
  const r=await f.ingest([op()]);expect(r.status).toBe(401);expect(db.conflicts).toBeGreaterThan(0);expect(db.rows.operations).toHaveLength(0);expect(db.rows.facts).toHaveLength(0);
});
it('DR04 revocation after final validation but before commit cannot leave an accepted receipt',async()=>{
  const {db,f}=await setup(),p=await peer(db,f);db.beforeCommit=async s=>{if(operationWrite(s)){db.beforeCommit=null;await revoke(p.identity,p.ctx);}};
  const r=await f.ingest([op()]);expect(r.status).toBe(401);expect(db.conflicts).toBeGreaterThan(0);expect(db.rows.operations).toHaveLength(0);
});
it('DR05 operation commits while revocation snapshot is held; revocation retries and preserves receipt',async()=>{
  const {db,f}=await setup(),p=await peer(db,f);let accepted;
  db.beforeCommit=async s=>{if([...s.writes].some(k=>k.startsWith('revocations|'))){db.beforeCommit=null;accepted=await f.ingest([op()]);}};
  const record=await revoke(p.identity,p.ctx);expect(accepted.status).toBe(200);expect(db.conflicts).toBeGreaterThan(0);
  expect(record.revision).toBeGreaterThan(db.rows.operations[0].authorizationDecision.revision);
  expect(db.rows.operations[0].record.receipt).toEqual(accepted.body.results[0].receipt);
});
it('DR06 two independent receivers overlap without shared process lock and retry one conflict',async()=>{
  const {db,f}=await setup(),p=await peer(db,f),entered=gate(),release=gate();let held=false;
  db.beforeCommit=async s=>{if(operationWrite(s)&&!held){held=true;entered.release();await release.wait;}};
  const first=f.ingest([op()]);await entered.wait;
  const second=await p.service.batches(p.ctx,batch([op()]));release.release();const a=await first;
  expect(a.status).toBe(200);expect(second.status).toBe(200);expect(a.body.results[0].receipt).toEqual(second.body.results[0].receipt);
  expect(db.rows.operations).toHaveLength(1);expect(db.conflicts).toBeGreaterThan(0);expect(f.coordinator).not.toBe(p.identity.coordinator);
});
it('DR07 independent owners preserve separate guards and operation IDs',async()=>{
  const {db,f}=await setup(),binding={installationId:randomUUID(),localPlayerId:randomUUID(),bindingGeneration:1};
  const b=await fixture({repositoryFactory:db.factory,binding});
  const r=await Promise.all([f.ingest([op()]),b.ingest([mutate(op(),e=>Object.assign(e,binding))])]);
  expect(r.map(x=>x.status)).toEqual([200,200]);expect(db.rows.ownerGuards).toHaveLength(2);expect(db.rows.operations).toHaveLength(2);
});
it('DR08 installation revocation affects only its own identity/profile',async()=>{
  const {db,f}=await setup(),binding={installationId:f.binding.installationId,localPlayerId:randomUUID(),bindingGeneration:1};
  const b=await fixture({repositoryFactory:db.factory,binding});await revoke(f.identity,f.ctx,{kind:'installation',target:f.binding.installationId});
  expect((await f.ingest([op()])).status).toBe(401);expect((await b.ingest([mutate(op(),e=>Object.assign(e,binding))])).status).toBe(200);
});
it('DR09 revocation prevents new session issuance from a formerly verified account',async()=>{
  const {f}=await setup(),a=await f.identity.findAccount(f.accountId);await revoke(f.identity,f.ctx);
  expect(await f.identity.createSession(a,'a'.repeat(64))).toBeUndefined();
});
it('DR10 generation mutation invalidates earlier contexts and JWT',async()=>{
  const {db,f}=await setup();await revoke(f.identity,f.ctx,{kind:'generation'});
  expect((await f.identity.findAccount(f.accountId)).bindingGeneration).toBe(2);expect((await f.ingest([op()])).status).toBe(401);expect(db.rows.operations).toHaveLength(0);
});
it('DR11 bounded callback replay revalidates and emits one postcommit result',async()=>{
  const {db,f}=await setup();db.failure='transient';const after=vi.fn();f.repository.afterCommit=after;
  expect((await f.ingest([op()])).status).toBe(200);expect(after).toHaveBeenCalledTimes(1);expect(db.rows.operations).toHaveLength(1);expect(db.conflicts).toBe(1);
});
it('DR12 abort rolls back guard, facts and receipt together',async()=>{
  const {db,f}=await setup(),before=clone(db.rows.ownerGuards);db.failure='rollback';
  expect((await f.ingest([op()])).status).toBe(503);expect(db.rows.ownerGuards).toEqual(before);expect(db.rows.operations).toHaveLength(0);expect(db.rows.facts).toHaveLength(0);
});
it('DR13 caller stable retry resolves one uncertain committed receipt',async()=>{
  const {db,f}=await setup();db.failure='unknown';const a=await f.ingest([op()]);expect(a.status).toBe(503);expect(a.body.results[0].receipt).toBeUndefined();
  const receipt=clone(db.rows.operations[0].record.receipt);expect((await f.ingest([op()])).body.results[0].receipt).toEqual(receipt);
});
it('DR14 unknown revocation commit gives 503 but retains durable revocation, never reauthorizes',async()=>{
  const {db,f}=await setup();db.failure='unknown';const commandId=randomUUID();
  await expect(revoke(f.identity,f.ctx,{commandId})).rejects.toMatchObject({status:503});expect(db.rows.revocations[0].commandId).toBe(commandId);
  expect((await f.ingest([op()])).status).toBe(401);
});
it('DR15 reconstructing repositories and JWT service preserves confirmed revocation in double image',async()=>{
  const {db,f}=await setup();await revoke(f.identity,f.ctx);const identity=db.identityFactory({now:f.now});
  const auth=new JwtService({config:f.config,repository:identity,now:f.now,version:2});
  await expect(auth.authenticate(f.token)).rejects.toMatchObject({status:401});expect((await identity.findAccount(f.accountId)).active).toBe(false);
});
it('DR16 another real Node process executes revocation on snapshot double before parent commit',async()=>{
  const {db,f}=await setup(),publicKey=await exportJWK(f.config.publicKey);let childClosed=false;
  db.beforeCommit=async s=>{if(!operationWrite(s))return;db.beforeCommit=null;
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,[fileURLToPath(new URL('./support/durable-revocation-worker.js',import.meta.url))],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
      let result;const timer=setTimeout(()=>{child.kill();reject(new Error('Synthetic child timeout'));},8000);
      child.once('message',r=>{result=r;});child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);childClosed=true;code===0&&result?.ok?resolve(result):reject(new Error('Synthetic child failed'));});
      child.send({rows:db.rows,now:f.now(),token:f.token,publicKey,issuer:f.config.issuer,audience:f.config.audience,commandId:randomUUID()});
    });db.rows=result.rows;
  };
  expect((await f.ingest([op()])).status).toBe(401);expect(childClosed).toBe(true);expect(db.conflicts).toBeGreaterThan(0);expect(db.rows.operations).toHaveLength(0);
});
it('DR17 identical duplicate after revocation cannot reveal historical receipt',async()=>{
  const {db,f}=await setup();await f.ingest([op()]);const saved=clone(db.rows.operations[0].record.receipt);await revoke(f.identity,f.ctx);
  const r=await f.ingest([op()]);expect(r.status).toBe(401);expect(r.body.results[0].receipt).toBeUndefined();expect(db.rows.operations[0].record.receipt).toEqual(saved);
});
it('DR18 contradictory duplicate remains conflict before revocation',async()=>{
  const {db,f}=await setup();await f.ingest([op()]);const saved=clone(db.rows.operations[0]);
  expect((await f.ingest([mutate(op(),e=>{e.createdAtUtc='2026-10-29T00:00:00.000Z';})])).status).toBe(409);expect(db.rows.operations[0]).toEqual(saved);
});
it('DR19 confirmed receipt is historical but receipt query requires current authorization',async()=>{
  const {db,f}=await setup(),o=op();await f.ingest([o]);await revoke(f.identity,f.ctx);
  await expect(f.service.receipts(f.ctx,{schemaVersion:2,attempts:[{operationId:o.operationId,payloadHash:o.payloadHash,leaseId:o.leaseId,attempt:1}]})).rejects.toMatchObject({status:401});expect(db.rows.operations).toHaveLength(1);
});
it('DR20 abort of revocation does not invalidate a still active identity',async()=>{
  const {db,f}=await setup(),before=clone(db.rows.ownerGuards);db.failure='rollback';await expect(revoke(f.identity,f.ctx)).rejects.toMatchObject({status:503});
  expect(db.rows.revocations).toHaveLength(0);expect(db.rows.ownerGuards).toEqual(before);expect((await f.ingest([op()])).status).toBe(200);
});
it('DR21 revocation cannot target another owner or session',async()=>{
  const {db,f}=await setup();for(const options of [{target:randomUUID()},{kind:'session',target:randomUUID()},{kind:'installation',target:randomUUID()}])await expect(revoke(f.identity,f.ctx,options)).rejects.toMatchObject({status:403});
  expect(db.rows.revocations).toHaveLength(0);expect((await f.identity.findAccount(f.accountId)).active).toBe(true);
});
it('DR22 player role and exact binding remain mandatory',async()=>{
  const {db,f}=await setup();expect((await f.ingest([mutate(op(),e=>{e.localPlayerId=randomUUID();})])).status).toBe(403);expect(db.rows.operations).toHaveLength(0);
});
it('DR23 admin claims cannot elevate a player or revoke through this player path',async()=>{
  const {db,f}=await setup();await expect(f.auth.authenticate(await f.signed({role:'admin'}))).rejects.toMatchObject({status:401});
  db.rows.identities[0].role='admin';await expect(revoke(f.identity,f.ctx)).rejects.toMatchObject({status:401});expect(db.rows.revocations).toHaveLength(0);
});
it('DR24 missing dependency remains deferred without receipt or guard commit',async()=>{
  const {db,f}=await setup(),o=vectors.operations.find(o=>JSON.parse(o.canonicalEnvelope).payload.phase==='terminal'),before=clone(db.rows.ownerGuards);
  const r=await f.ingest([o]);expect(r.status).toBe(503);expect(r.body.results[0].error.code).toBe('dependency_missing');expect(db.rows.ownerGuards).toEqual(before);
});
it('DR25 partial batch retains accepted receipts and rejects malformed second item',async()=>{
  const {db,f}=await setup();const r=await f.ingest([op(),mutate(op(),e=>{e.schemaVersion=99;},{newId:true})]);expect(r.status).toBe(207);expect(r.body.results[0].receipt).toBeTruthy();expect(r.body.results[1].receipt).toBeUndefined();expect(db.rows.operations).toHaveLength(1);
});
it('DR26 session revocation preserves another session under the same owner',async()=>{
  const {db,f}=await setup(),old=f.ctx,next=await f.renew();db.seed(next);await revoke(f.identity,old,{kind:'session',target:old.sessionId});
  expect((await f.ingest([op()],old)).status).toBe(401);expect((await f.ingest([op()],next)).status).toBe(200);
});
it('DR27 expired JWT cannot commit when time advances inside transaction',async()=>{
  const {db,f}=await setup();f.repository.beforeCommit=async()=>{f.clock.value+=900000;};expect((await f.ingest([op()])).status).toBe(401);expect(db.rows.operations).toHaveLength(0);
});
it('DR28 three conflicts exhaust bounded retries without ACK or state changes',async()=>{
  const {db,f}=await setup();db.beforeCommit=async()=>{throw Object.assign(new Error('Synthetic transient'),{hasErrorLabel:l=>l==='TransientTransactionError'});};
  const r=await f.ingest([op()]);expect(r.status).toBe(503);expect(db.conflicts).toBe(2);expect(db.rows.operations).toHaveLength(0);
});
it('DR29 memory identity and permissive callback cannot bypass mandatory durable boundary',async()=>{
  const db=mongoDouble(),f=await fixture();expect(()=>new MongoIngestionRepository({synthetic:true,disposable:true,connection:db.connection,models:db.models,identityRepository:f.identity,coordinator:f.coordinator,fenceAuthorization:async()=>true})).toThrow();
});
it('DR30 missing or invalid owner guard fails closed without recreating it from JWT',async()=>{
  const {db,f}=await setup();
  for(const rows of [[],[{_id:f.accountId,revision:-1}],[{_id:f.accountId,revision:Number.MAX_SAFE_INTEGER}]]){
    db.rows.ownerGuards=clone(rows);expect((await f.ingest([op()])).status).toBe(503);expect(db.rows.ownerGuards).toEqual(rows);expect(db.rows.operations).toHaveLength(0);
  }
});
it('DR31 unsafe indexes, model namespace drift and foreign connection reject',async()=>{
  const {db,f}=await setup();db.models.identities.collection.indexes=async()=>[];expect((await f.ingest([op()])).status).toBe(503);
  db.models.ownerGuards.collection.name='foreign';expect(()=>new MongoIdentityRepository({synthetic:true,connection:db.connection,models:db.models})).toThrow();
});
it('DR32 identity schemas are strict, disconnected and declare only required unique indexes',()=>{
  const c=mongoose.createConnection(),m=mongoIdentityModels(c);expect(c.readyState).toBe(0);
  for(const model of Object.values(m)){expect(model.schema.options).toMatchObject({strict:'throw',autoCreate:false,autoIndex:false});}
  expect(m.identities.schema.indexes()).toHaveLength(2);expect(m.identitySessions.schema.indexes()).toHaveLength(1);
});
it('DR33 legacy actor-free mutation methods fail closed',async()=>{
  const {f}=await setup();for(const method of ['revokeIdentity','revokeSession','invalidateAccountSessions'])await expect(f.identity[method](f.accountId)).rejects.toMatchObject({status:403});
});
it('DR34 credential epoch invalidates old JWT without leaking diagnostics',async()=>{
  const {db,f}=await setup();await revoke(f.identity,f.ctx,{kind:'credential'});const r=await f.ingest([op()]);expect(r.status).toBe(401);expect(JSON.stringify(r)).not.toContain(f.token);expect(JSON.stringify(r)).not.toContain(f.credential);expect(db.rows.operations).toHaveLength(0);
});
it('DR35 two distinct operations overlap and both survive safe conflict retry',async()=>{
  const {db,f}=await setup(),p=await peer(db,f),a=concurrencyOperation(op()),b=concurrencyOperation(op());
  const results=await Promise.all([f.ingest([a]),p.service.batches(p.ctx,batch([b]))]);expect(results.map(r=>r.status)).toEqual([200,200]);expect(db.rows.operations).toHaveLength(2);expect(db.conflicts).toBeGreaterThan(0);
});
it('DR36 new registration does not silently relink an existing installation/profile',async()=>{
  const {db,f}=await setup();await expect(f.identity.createIfAbsent(randomUUID(),'$argon2id$synthetic',()=>{},f.binding)).rejects.toMatchObject({status:409});expect(db.rows.identities).toHaveLength(1);
});
it('DR37 durable authorization works without legacy mirrored session controls or callback',async()=>{
  const {db,f}=await setup();db.rows.authorization=[];
  const repository=new MongoIngestionRepository({synthetic:true,disposable:true,connection:db.connection,models:db.models,identityRepository:f.identity,coordinator:f.coordinator,now:f.now});
  const service=new IngestionService({repository,identityRepository:f.identity});expect((await service.batches(f.ctx,batch([op()]))).status).toBe(200);
  await revoke(f.identity,f.ctx);expect((await service.batches(f.ctx,batch([op()]))).status).toBe(401);
});
it('DR38 contradictory duplicate after revocation rejects authorization before revealing conflict',async()=>{
  const {db,f}=await setup();await f.ingest([op()]);await revoke(f.identity,f.ctx);
  const r=await f.ingest([mutate(op(),e=>{e.createdAtUtc='2026-10-29T00:00:00.000Z';})]);expect(r.status).toBe(401);expect(r.body.results[0].receipt).toBeUndefined();expect(db.rows.operations).toHaveLength(1);
});
it('DR39 command replay with newly authorized session preserves revocation receipt and epochs',async()=>{
  const {db,f}=await setup(),commandId=randomUUID();const a=await revoke(f.identity,f.ctx,{kind:'generation',commandId});
  const context=await f.renew();const b=await revoke(f.identity,context,{kind:'generation',commandId});
  expect(a).toEqual(b);expect((await f.identity.findAccount(f.accountId)).bindingGeneration).toBe(2);expect(db.rows.revocations).toHaveLength(1);
});
it('DR40 missing authorization evidence is not silently migrated',async()=>{
  const {db,f}=await setup();await f.ingest([op()]);delete db.rows.operations[0].authorizationDecision;
  expect((await f.ingest([op()])).status).toBe(503);expect(db.rows.operations[0].authorizationDecision).toBeUndefined();
});
it('DR41 revocation racing two independently authorized operations orders all accepted decisions first',async()=>{
  const {db,f}=await setup(),p=await peer(db,f),q=await peer(db,f),a=concurrencyOperation(op()),b=concurrencyOperation(op());
  const [one,two,rev]=await Promise.all([f.ingest([a]),p.service.batches(p.ctx,batch([b])),revoke(q.identity,q.ctx)]);
  for(const result of [one,two])expect([200,401]).toContain(result.status);
  for(const row of db.rows.operations)expect(row.authorizationDecision.revision).toBeLessThan(rev.revision);
  expect((await f.ingest([a])).status).toBe(401);expect(db.conflicts).toBeGreaterThan(0);
});
