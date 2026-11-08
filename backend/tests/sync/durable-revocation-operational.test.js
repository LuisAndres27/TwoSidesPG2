import './support/isolation-guard.js';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import net from 'node:net';
import mongoose from 'mongoose';
import { createRequire } from 'node:module';
import { createDurableRuntime,durableClientOptions,operationalLimits } from '../../scripts/durable-revocation-runtime.js';
import { ATLAS_TARGET,ATLAS_URI } from '../../src/modules/sync/atlas-policy.js';
import { executeDurableAtlasRun } from '../../scripts/durable-revocation-atlas-harness.js';

const runtimes=[];
const runtime=options=>{const r=createDurableRuntime(options);runtimes.push(r);return r;};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const {resolveOptions}=createRequire(import.meta.url)('mongodb/lib/utils.js');
beforeEach(()=>{vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Offline tests only');});});
afterEach(async()=>{
  const finished=runtimes.splice(0).map(r=>r.finish());
  if(vi.isFakeTimers())await vi.runAllTimersAsync();
  await Promise.allSettled(finished);vi.useRealTimers();vi.restoreAllMocks();
});
function fakeClient(options=durableClientOptions,changes={}){
  const created=[];
  const native={options:{...options,srvHost:ATLAS_TARGET.host,credentials:{username:ATLAS_TARGET.user,source:'admin',mechanism:'DEFAULT'}}};
  const connection={name:ATLAS_TARGET.database,readyState:1,db:{databaseName:ATLAS_TARGET.database},getClient:()=>native,
    close:vi.fn(async()=>{connection.readyState=0;}),startSession:vi.fn(async()=>{
      const session={endSession:vi.fn(async()=>{}),abortTransaction:vi.fn(async()=>{}),
        withTransaction:vi.fn(async work=>work(session))};created.push(session);return session;
    }),...changes};return {connection,native,created};
}
async function opened(r,changes){let fixture;const connection=await r.openClient(async options=>{fixture=fakeClient(options,changes);return fixture.connection;});return {...fixture,connection};}
it('OL01 a global deadline aborts waiting work, rejects new work and closes the client',async()=>{
  vi.useFakeTimers();const r=runtime({totalMs:30,ioMs:100,shutdownMs:5}),f=await opened(r);
  const wait=r.wait(()=>new Promise(()=>{})).catch(error=>error);
  await vi.advanceTimersByTimeAsync(31);expect(await wait).toMatchObject({code:'GLOBAL_DEADLINE'});
  expect(r.signal.aborted).toBe(true);expect(()=>r.assertActive()).toThrow();expect(f.connection.close).toBeDefined();
  expect((await r.finish()).closed).toBe(true);
});
it('OL02 timeout during a transaction requests abort/end/close without asserting rollback',async()=>{
  vi.useFakeTimers();const r=runtime({totalMs:30,ioMs:100,shutdownMs:5}),f=await opened(r),session=await f.connection.startSession(),gate=deferred();
  const failed=session.withTransaction(()=>gate.promise).catch(error=>error);
  await vi.advanceTimersByTimeAsync(31);expect(await failed).toMatchObject({code:'GLOBAL_DEADLINE'});
  expect(session.abortTransaction).toHaveBeenCalled();expect(r.snapshot().uncertain).toBe(true);
  expect(()=>r.assertCleanup()).toThrow();gate.resolve();await vi.runAllTimersAsync();
  expect(r.snapshot().uncertain).toBe(true);
});
it('OL03 an underlying write can settle after timeout; uncertainty stays sticky and forbids cleanup',async()=>{
  vi.useFakeTimers();const r=runtime({totalMs:100,ioMs:10,shutdownMs:5}),gate=deferred();let committed=false;
  const failed=expect(r.io(async()=>{await gate.promise;committed=true;},{write:true,transaction:true})).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(11);await failed;expect(r.snapshot().pendingWrites).toBe(1);expect(committed).toBe(false);
  gate.resolve();await vi.runAllTimersAsync();expect(committed).toBe(true);expect(r.snapshot().pendingWrites).toBe(0);
  expect(r.snapshot().uncertain).toBe(true);expect(()=>r.assertCleanup()).toThrow();
});
it('OL04 UnknownTransactionCommitResult stops new transactions without serializing raw errors',async()=>{
  const r=runtime(),f=await opened(r),s=await f.connection.startSession();
  const raw=Object.assign(new Error('synthetic confidential marker'),{hasErrorLabel:l=>l==='UnknownTransactionCommitResult'});
  await expect(s.withTransaction(async()=>{throw raw;})).rejects.toMatchObject({code:'UNKNOWN_COMMIT'});
  expect(r.snapshot().uncertain).toBe(true);expect(JSON.stringify(r.snapshot())).not.toContain(raw.message);
  await expect(f.connection.startSession()).rejects.toThrow();expect(()=>r.assertCleanup()).toThrow();
});
it('OL05 client slots are reserved before concurrent factory calls and a fourth factory is never invoked',async()=>{
  const r=runtime(),fixtures=await Promise.all([opened(r),opened(r),opened(r)]);expect(fixtures).toHaveLength(3);
  const factory=vi.fn();await expect(r.openClient(factory)).rejects.toMatchObject({code:'CLIENT_LIMIT'});expect(factory).not.toHaveBeenCalled();
  expect(r.snapshot().clientsCreated).toBe(3);expect((await r.finish()).closed).toBe(true);
});
it('OL06 Mongoose normalizes its options before the native driver parser, with connect intercepted offline',async()=>{
  let parsed;const connect=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockImplementation(async function(){parsed=this.options;throw new Error('Offline boundary');});
  const connection=mongoose.createConnection();
  try{await expect(connection.openUri(ATLAS_URI,durableClientOptions)).rejects.toThrow('Offline boundary');}
  finally{await connection.close();}
  expect(parsed).toMatchObject({maxPoolSize:2,maxConnecting:1,minPoolSize:0,timeoutMS:10000,retryReads:false,retryWrites:false,tls:true,rejectUnauthorized:true});
  expect(parsed.credentials).toMatchObject({username:ATLAS_TARGET.user,source:'admin',mechanism:'DEFAULT'});
  expect(connect).toHaveBeenCalledTimes(1);expect(net.Socket.prototype.connect).not.toHaveBeenCalled();
});
it('OL07 a connector with a larger pool or wrong account is rejected and its returned client is closed',async()=>{
  for(const mutate of [o=>{o.maxPoolSize=3;},o=>{o.credentials.username='twosides_backend';},o=>{o.dbName='two_sides_db';}]){
    const r=runtime();let close;
    const task=r.openClient(async options=>{const f=fakeClient(options);mutate(f.native.options);close=f.connection.close;return f.connection;});
    // The dbName option is checked as well as connection.name.
    await expect(task).rejects.toThrow();expect(close).toHaveBeenCalled();
  }
});
it('OL08 two simultaneous sessions admit no third opening, even on another client',async()=>{
  const r=runtime(),a=await opened(r),b=await opened(r);await a.connection.startSession();await b.connection.startSession();
  await expect(a.connection.startSession()).rejects.toMatchObject({code:'SESSION_LIMIT'});
  expect(r.snapshot().sessionsCreated).toBe(2);expect((await r.finish()).activeSessions).toBe(0);
});
it('OL09 ending a session frees its simultaneous slot; lifetime sessions remain bounded',async()=>{
  const r=runtime({totalSessions:2}),f=await opened(r),s=await f.connection.startSession();await s.endSession();
  const next=await f.connection.startSession();await next.endSession();
  await expect(f.connection.startSession()).rejects.toMatchObject({code:'SESSION_LIMIT'});expect(r.snapshot().activeSessions).toBe(0);
});
it('OL10 session opening failure releases its reservation and closes clients',async()=>{
  const r=runtime(),f=await opened(r,{startSession:vi.fn(async()=>{throw new Error('synthetic private value');})});
  await expect(f.connection.startSession()).rejects.toMatchObject({code:'SESSION_OPEN_FAILED'});
  expect((await r.finish()).activeSessions).toBe(0);expect(r.snapshot().closed).toBe(true);
});
it('OL11 session closing failure is retained even if a repository swallows endSession errors',async()=>{
  const r=runtime(),f=await opened(r),s=await f.connection.startSession();
  // The wrapper captured the original, so supply the failed original at opening instead.
  await s.endSession();const g=await opened(r,{startSession:async()=>({withTransaction:async w=>w(),endSession:async()=>{throw new Error();}})});
  const bad=await g.connection.startSession();await expect(bad.endSession()).rejects.toThrow();
  const result=await r.finish();expect(result.closed).toBe(false);expect(result.closeFailures).toBeGreaterThan(0);
});
it('OL12 client closing error is sanitized and prevents a successful resource result',async()=>{
  const r=runtime(),f=await opened(r,{close:vi.fn(async()=>{throw new Error('synthetic confidential value');})});
  await expect(f.connection.close()).rejects.toMatchObject({code:'CLIENT_CLOSE_FAILED'});
  const result=await r.finish();expect(result.closed).toBe(false);expect(JSON.stringify(result)).not.toContain('confidential');
});
it('OL13 pending writes forbid cleanup even before a deadline',async()=>{
  const r=runtime(),gate=deferred(),job=r.io(()=>gate.promise,{write:true});await Promise.resolve();
  expect(()=>r.assertCleanup()).toThrow();gate.resolve();await job;expect(()=>r.assertCleanup()).not.toThrow();
});
it('OL14 successful and failed transactions release sessions via finally and respect three callbacks',async()=>{
  const r=runtime(),f=await opened(r);const s=await f.connection.startSession();
  try{expect(await s.withTransaction(async()=>17)).toBe(17);}finally{await s.endSession();}
  const t=await f.connection.startSession();try{await expect(t.withTransaction(async()=>{throw new Error('expected failure');})).rejects.toThrow();}finally{await t.endSession();}
  expect(r.snapshot().activeSessions).toBe(0);expect((await r.finish()).closed).toBe(true);
});
it('OL15 callback overrun stops the runtime before a fourth application callback',async()=>{
  const r=runtime();let raw;const f=await opened(r,{startSession:async()=>raw={endSession:async()=>{},withTransaction:async w=>{for(let i=0;i<4;i++)await w(raw);}}});
  const s=await f.connection.startSession(),work=vi.fn(async()=>{});await expect(s.withTransaction(work)).rejects.toThrow();
  expect(work).toHaveBeenCalledTimes(3);expect(r.snapshot().reason).toBe('RETRY_LIMIT');
});
it('OL16 a hung close is bounded and stays a failure, not a claim of resources released',async()=>{
  vi.useFakeTimers();const r=runtime({shutdownMs:5}),f=await opened(r,{close:async()=>new Promise(()=>{})});
  const finished=r.finish();await vi.advanceTimersByTimeAsync(6);expect((await finished).closed).toBe(false);
});
it('OL17 late session opening after timeout is ended and never admitted to a new transaction',async()=>{
  vi.useFakeTimers();const r=runtime({ioMs:10,shutdownMs:5}),gate=deferred(),end=vi.fn(async()=>{}),f=await opened(r,{startSession:()=>gate.promise});
  const failed=expect(f.connection.startSession()).rejects.toThrow();await vi.advanceTimersByTimeAsync(11);await failed;
  gate.resolve({endSession:end,withTransaction:async()=>{}});await vi.runAllTimersAsync();expect(end).toHaveBeenCalledTimes(1);expect(r.snapshot().activeSessions).toBe(0);
});
it('OL18 injected reads receive cancellation; unsupported write cancellation is not assumed',async()=>{
  const r=runtime(),f=await opened(r);let queryOptions,writeOptions;
  const models={x:{find:()=>({setOptions:o=>{queryOptions=o;},limit(){return this;},lean:async()=>[]}),updateOne:async(_f,_u,o)=>{writeOptions=o;return {matchedCount:1};}}};
  r.bindModels(models);await models.x.find({}).limit(1).lean();await models.x.updateOne({},{$inc:{revision:1}},{});
  expect(queryOptions).toMatchObject({signal:r.signal,timeoutMS:10000});expect(writeOptions.timeoutMS).toBe(10000);expect(writeOptions.signal).toBeUndefined();
});
it('OL19 remote activation stays disabled before any supplied secret or connector is consumed',async()=>{
  const connector=vi.fn(),secret=vi.fn();await expect(executeDurableAtlasRun({connector,get credential(){secret();}})).rejects.toMatchObject({code:'DURABLE_REVOCATION_C2_NOT_AUTHORIZED'});
  expect(connector).not.toHaveBeenCalled();expect(secret).not.toHaveBeenCalled();expect(operationalLimits.clients).toBe(3);
});
it('OL20 opening clients reserve their slots before resolution; late clients are closed after cancellation',async()=>{
  const r=runtime(),gate=deferred(),created=[],factory=vi.fn(async options=>{await gate.promise;const f=fakeClient(options);created.push(f);return f.connection;});
  const pending=Array.from({length:3},()=>r.openClient(factory).catch(e=>e));await Promise.resolve();
  const extra=vi.fn();await expect(r.openClient(extra)).rejects.toThrow();expect(factory).toHaveBeenCalledTimes(3);expect(extra).not.toHaveBeenCalled();
  gate.resolve();await Promise.all(pending);await Promise.resolve();await Promise.resolve();
  expect(created).toHaveLength(3);expect(created.every(f=>f.connection.close.mock.calls.length===1)).toBe(true);
});
it('OL21 operation options inherit the native driver transaction timeout without an incompatible override',async()=>{
  const r=runtime(),f=await opened(r),s=await f.connection.startSession();s.explicit=true;s.timeoutContext={};s.transaction={options:{}};s.inTransaction=()=>true;
  let readOptions,writeOptions;
  const models={x:{find:()=>({setOptions:o=>{readOptions=o;},limit(){return this;},lean:async()=>[]}),
    updateOne:async(_f,_u,o)=>{writeOptions=o;resolveOptions({},o);return {matchedCount:1};}}};r.bindModels(models);
  try{await s.withTransaction(async()=>{await models.x.find({},null,{session:s}).limit(1).lean();await models.x.updateOne({},{$inc:{revision:1}},{session:s});});}
  finally{await s.endSession();}
  expect(readOptions.signal).toBe(r.signal);expect(readOptions.timeoutMS).toBeUndefined();expect(writeOptions.timeoutMS).toBeUndefined();
  expect(()=>resolveOptions({},{session:s,timeoutMS:10000})).toThrow('cannot be given a timeoutMS');
});
it('OL22 arbitrary caller-provided stop messages never enter diagnostics',async()=>{
  const r=runtime();await r.stop('synthetic-secret-stop-reason');expect(r.snapshot().reason).toBe('EXECUTION_FAILED');
  expect(JSON.stringify(r.snapshot())).not.toContain('secret');
});
it('OL23 manual transactions cannot bypass supervision, and cancellation rejects a not-yet-sent commit',async()=>{
  const start=vi.fn(),commit=vi.fn(async()=>{}),r=runtime(),f=await opened(r,{startSession:async()=>({
    startTransaction:start,commitTransaction:commit,endSession:async()=>{},withTransaction:async work=>work(),
  })}),session=await f.connection.startSession();
  expect(()=>session.startTransaction()).toThrow('Controlled C.2');expect(start).not.toHaveBeenCalled();
  await session.withTransaction(async()=>{session.startTransaction();await session.commitTransaction();});expect(start).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledTimes(1);
  await r.stop();expect(()=>session.commitTransaction()).toThrow();expect(commit).toHaveBeenCalledTimes(1);
});
it('OL24 budgets cannot be enlarged and shutdown grace must fit inside the total duration',()=>{
  for(const limits of [{clients:4},{poolSize:3},{sessions:3},{totalMs:120001},{totalMs:10,shutdownMs:5}])expect(()=>createDurableRuntime(limits)).toThrow();
});
it('OL25 a closed client cannot open another session',async()=>{
  const r=runtime(),start=vi.fn(),f=await opened(r,{startSession:start});await f.connection.close();
  await expect(f.connection.startSession()).rejects.toMatchObject({code:'CLIENT_CLOSED'});expect(start).not.toHaveBeenCalled();
});
it('OL26 native implicit sessions have their own admission cap and join bounded resource shutdown',async()=>{
  const r=runtime();let native;
  const c=await r.openClient(async options=>{
    const f=fakeClient(options);native=f.native;native.startSession=()=>({endSession:vi.fn(async()=>{}),withTransaction:async w=>w()});return f.connection;
  });
  native.startSession({explicit:false});native.startSession({explicit:false});await c.startSession();await c.startSession();
  expect(r.snapshot()).toMatchObject({activeSessions:4,activeExplicitSessions:2,activeImplicitSessions:2});
  expect(()=>native.startSession({explicit:false})).toThrow();expect((await r.finish()).activeSessions).toBe(0);
});
it('OL27 asynchronous Mongoose session opening and native admission reserve a single explicit slot',async()=>{
  const r=runtime();let native;
  const c=await r.openClient(async options=>{
    const f=fakeClient(options);native=f.native;native.startSession=()=>({endSession:async()=>{},withTransaction:async w=>w()});
    f.connection.startSession=async options=>{await Promise.resolve();return native.startSession(options);};return f.connection;
  });
  const session=await c.startSession();expect(r.snapshot()).toMatchObject({sessionsCreated:1,activeSessions:1});
  await session.endSession();expect(r.snapshot().activeSessions).toBe(0);await c.close();expect(()=>native.startSession()).toThrow();
});
for(const recover of [false,true])it(`OL${recover?'29':'28'} native commit retries are capped without repeating application effects (recover=${recover})`,async()=>{
  const r=runtime(),error=Object.assign(new Error('synthetic unknown commit'),{hasErrorLabel:l=>l==='UnknownTransactionCommitResult'});
  let raw,calls=0;const commit=vi.fn(async()=>{if(!recover||++calls<3)throw error;});
  const f=await opened(r,{startSession:async()=>raw={endSession:async()=>{},commitTransaction:commit,withTransaction:async work=>{
    const result=await work(raw);for(let i=0;i<4;i++){try{await raw.commitTransaction();return result;}catch(e){if(!e.hasErrorLabel?.('UnknownTransactionCommitResult'))throw e;}}throw error;
  }}}),session=await f.connection.startSession(),work=vi.fn(async()=>({receipt:'synthetic-stable-receipt'}));
  if(recover)expect(await session.withTransaction(work)).toEqual({receipt:'synthetic-stable-receipt'});
  else{await expect(session.withTransaction(work)).rejects.toMatchObject({code:'COMMIT_RETRY_LIMIT'});expect(()=>r.assertCleanup()).toThrow();expect(r.snapshot().uncertain).toBe(true);}
  expect(work).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledTimes(3);await session.endSession();
});
