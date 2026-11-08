// Injected C.2 resource controls only. No network implementation or credentials.
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ATLAS_TARGET } from '../src/modules/sync/atlas-policy.js';

export const operationalLimits=Object.freeze({totalMs:120000,ioMs:10000,shutdownMs:2000,
  clients:3,poolSize:2,maxConnecting:1,sessions:2,totalSessions:18,
  implicitSessions:2,totalImplicitSessions:256,callbackAttempts:3,commitAttempts:3});
export const durableClientOptions=Object.freeze({dbName:ATLAS_TARGET.database,user:ATLAS_TARGET.user,
  authSource:'admin',authMechanism:'DEFAULT',tls:true,tlsAllowInvalidCertificates:false,tlsAllowInvalidHostnames:false,
  directConnection:false,readPreference:'primary',w:'majority',retryReads:false,retryWrites:false,
  maxPoolSize:2,minPoolSize:0,maxConnecting:1,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,
  waitQueueTimeoutMS:2000,timeoutMS:10000,autoIndex:false,autoCreate:false,bufferCommands:false,monitorCommands:false});
const failure=code=>Object.assign(new Error('Controlled C.2 execution unavailable.'),{code});
const unknown=error=>{try{return error?.hasErrorLabel?.('UnknownTransactionCommitResult')===true;}catch{return true;}};
const originals=new WeakMap();
const originalOf=fn=>originals.get(fn)??fn;
const reasons=new Set(['GLOBAL_DEADLINE','IO_DEADLINE','EXECUTION_FAILED','SESSION_LIMIT','CLIENT_LIMIT',
  'UNKNOWN_COMMIT','RETRY_LIMIT','COMMIT_RETRY_LIMIT','SESSION_OPEN_FAILED','SESSION_CLOSE_FAILED','CLIENT_OPEN_FAILED','UNMANAGED_CLIENT']);

export function createDurableRuntime(overrides={}) {
  const limits={...operationalLimits,...overrides};
  for(const [k,v] of Object.entries(limits))if(!Object.hasOwn(operationalLimits,k)||!Number.isInteger(v)||v<1||v>operationalLimits[k])throw failure('INVALID_LIMIT');
  if(limits.totalMs<=2*limits.shutdownMs)throw failure('INVALID_LIMIT');
  const controller=new AbortController(),started=performance.now(),clients=new Map(),sessions=new Map(),pending=new Set(),wrapped=new WeakSet();
  const explicitOpening=new AsyncLocalStorage(),closingScope=new AsyncLocalStorage();
  const activeMs=Math.max(1,limits.totalMs-2*limits.shutdownMs); // Reserve abort + end-session grace inside the total.
  let stopped=false,disposed=false,reason=null,uncertain=false,clientCount=0,sessionCount=0,reservedSessions=0,shutdownJob;
  let implicitCount=0,reservedImplicit=0;
  const closeFailures=new Set();
  function assertActive(){
    if(!stopped&&!disposed&&performance.now()-started>=activeMs)stop('GLOBAL_DEADLINE');
    if(stopped||disposed)throw failure(reason??'RUNTIME_CLOSED');
  }
  // Bound caller waiting; underlying work remains tracked. Never infer rollback.
  async function settleClose(work,kind){
    let timer;
    try{await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('CLOSE_TIMEOUT')),limits.shutdownMs);})]);return true;}
    catch{closeFailures.add(kind);return false;}
    finally{clearTimeout(timer);}
  }
  function stop(code='EXECUTION_FAILED'){
    if(!reasons.has(code))code='EXECUTION_FAILED';
    if(!stopped){stopped=true;reason=code;
      if([...pending].some(p=>p.write))uncertain=true;
      controller.abort(failure(code));
    }
    shutdownJob??=shutdownResources();return shutdownJob;
  }
  const globalTimer=setTimeout(()=>{void stop('GLOBAL_DEADLINE');},activeMs);globalTimer.unref?.();
  async function io(work,{write=false,transaction=false,timeoutMs=limits.ioMs}={}){
    assertActive();const record={write};pending.add(record);let timer,onAbort;
    const job=Promise.resolve().then(()=>{assertActive();return work(controller.signal);});
    // Retain pending records until the ORIGINAL operation settles, even after timeout.
    job.then(()=>pending.delete(record),error=>{pending.delete(record);if(transaction&&unknown(error))uncertain=true;});
    try{
      return await Promise.race([job,new Promise((_,reject)=>{
        onAbort=()=>reject(failure(reason??'EXECUTION_CANCELLED'));
        controller.signal.addEventListener('abort',onAbort,{once:true});
        const remaining=Math.max(1,Math.ceil(activeMs-(performance.now()-started)));
        timer=setTimeout(()=>{void stop(timeoutMs>=remaining?'GLOBAL_DEADLINE':'IO_DEADLINE');},Math.min(timeoutMs,remaining));
      })]);
    }catch(error){
      if(transaction&&unknown(error)){uncertain=true;void stop('UNKNOWN_COMMIT');}
      if(stopped)throw failure(reason);
      // Preserve driver labels for eligible transaction retries, and 401/403.
      // No raw error is logged or included in a public runtime result.
      throw error;
    }
    finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);}
  }
  async function endSession(entry){
    if(entry.ending)return entry.ending;
    entry.ending=(async()=>{
      const ok=await settleClose(()=>entry.end(),'session');
      if(ok){sessions.delete(entry.session);if(entry.implicit)reservedImplicit--;else reservedSessions--;}
      else{uncertain||=entry.transaction;void stop('SESSION_CLOSE_FAILED');}
      return ok;
    })();return entry.ending;
  }
  async function closeClient(entry){
    if(entry.closing)return entry.closing;
    entry.closing=settleClose(()=>closingScope.run(true,()=>entry.close(true)),'client');return entry.closing;
  }
  async function shutdownResources(){
    // Clients close in parallel with at most two bounded session shutdown phases.
    await Promise.allSettled([
      ...[...sessions.values()].map(async e=>{
        if(e.transaction&&typeof e.abort==='function')await settleClose(()=>e.abort(),'abort');
        await endSession(e);
      }),
      ...[...clients.values()].map(closeClient),
    ]);
  }
  function reserveSession(implicit=false){
    if(!(implicit&&closingScope.getStore()))assertActive();
    if(implicit){
      if(reservedImplicit>=limits.implicitSessions||implicitCount>=limits.totalImplicitSessions){void stop('SESSION_LIMIT');throw failure('SESSION_LIMIT');}
      reservedImplicit++;implicitCount++;
    }else{
      if(reservedSessions>=limits.sessions||sessionCount>=limits.totalSessions){void stop('SESSION_LIMIT');throw failure('SESSION_LIMIT');}
      reservedSessions++;sessionCount++;
    }
  }
  function attachSession(session,implicit=false){
    const entry={session,implicit,end:session.endSession.bind(session),abort:session.abortTransaction?.bind(session),transaction:false,commitAttempts:0,ending:null};
    sessions.set(session,entry);
    const original=session.withTransaction.bind(session);
    for(const method of ['startTransaction','commitTransaction'])if(typeof session[method]==='function'){
      const native=session[method].bind(session);
      session[method]=(...args)=>{
        assertActive();if(entry.ending||!entry.transaction)throw failure('TRANSACTION_NOT_SUPERVISED');
        if(method==='commitTransaction'&&++entry.commitAttempts>limits.commitAttempts){uncertain=true;void stop('COMMIT_RETRY_LIMIT');throw failure('COMMIT_RETRY_LIMIT');}
        return native(...args);
      };
    }
    session.withTransaction=async(work,options={})=>{
      assertActive();if(entry.ending||entry.transaction)throw failure('SESSION_BUSY');
      entry.transaction=true;entry.commitAttempts=0;let attempts=0;
      try{return await io(()=>original(async(...args)=>{
        assertActive();if(++attempts>limits.callbackAttempts){void stop('RETRY_LIMIT');throw failure('RETRY_LIMIT');}
        return work(...args);
      },{...options,timeoutMS:Math.min(options.timeoutMS??limits.ioMs,limits.ioMs),maxCommitTimeMS:Math.min(options.maxCommitTimeMS??1000,1000)}),{write:true,transaction:true});}
      finally{entry.transaction=false;}
    };
    session.endSession=async()=>{if(!await endSession(entry))throw failure('SESSION_CLOSE_FAILED');};
    return session;
  }
  function ioOptions(options={},abortable=false){
    const result={...options};
    // Driver 7 forbids an explicit operation timeout inside a CSOT withTransaction.
    // Those operations inherit the transaction deadline instead.
    if(sessions.get(options.session)?.transaction)delete result.timeoutMS;
    else result.timeoutMS=limits.ioMs;
    if(abortable)result.signal=controller.signal;
    return result;
  }
  function attachClient(connection,{double=false}={}){
    if(clients.has(connection))return connection;
    if(connection.readyState!==1)throw failure('CLIENT_NOT_READY');
    const options=connection.getClient().options;
    if(double){
      if(!/^twosides_sync_test_[0-9a-f]{32}$/.test(connection.name)||options.directConnection!==true||options.srvHost||options.credentials||
        !options.hosts?.length||options.hosts.some(h=>!['localhost','127.0.0.1','::1'].includes(h.host)))throw failure('UNMANAGED_CLIENT');
    }else{
      if(options.srvHost!==ATLAS_TARGET.host||options.dbName!==ATLAS_TARGET.database||connection.name!==ATLAS_TARGET.database||connection.db?.databaseName!==ATLAS_TARGET.database||
        options.credentials?.username!==ATLAS_TARGET.user||options.credentials?.source!=='admin'||options.credentials?.mechanism!=='DEFAULT'||
        options.tls!==true||options.tlsInsecure===true||options.tlsAllowInvalidCertificates===true||options.tlsAllowInvalidHostnames===true||options.rejectUnauthorized===false||typeof options.checkServerIdentity==='function'||
        options.directConnection!==false||options.maxPoolSize!==limits.poolSize||options.maxConnecting!==limits.maxConnecting||
        options.retryReads!==false||options.retryWrites!==false||options.timeoutMS!==limits.ioMs)throw failure('CLIENT_OPTIONS_REJECTED');
      if([...clients.values()].some(e=>e.native===connection.getClient()))throw failure('CLIENT_NOT_INDEPENDENT');
    }
    const entry={connection,native:connection.getClient(),close:originalOf(connection.close).bind(connection),closing:null};clients.set(connection,entry);
    const rawStart=originalOf(connection.startSession),originalStart=rawStart.bind(connection);
    connection.startSession=async(...args)=>{
      assertActive();if(entry.closing){void stop();throw failure('CLIENT_CLOSED');}
      if(args[0]?.explicit===false)throw failure('SESSION_OPTIONS_REJECTED');
      reserveSession();let startedOpening=false;
      const opening=io(async()=>{
        startedOpening=true;let session;
        try{session=await explicitOpening.run(true,()=>originalStart(...args));}catch(error){reservedSessions--;throw error;}
        if(stopped||disposed){if(await settleClose(()=>session.endSession(),'late-session'))reservedSessions--;throw failure(reason??'RUNTIME_CLOSED');}
        return attachSession(session);
      });
      try{return await opening;}catch{if(!startedOpening)reservedSessions--;void stop('SESSION_OPEN_FAILED');throw failure(reason);}
    };
    originals.set(connection.startSession,rawStart);
    const rawClose=originalOf(connection.close);
    connection.close=async()=>{if(!await closeClient(entry))throw failure('CLIENT_CLOSE_FAILED');};
    originals.set(connection.close,rawClose);
    if(typeof entry.native.startSession==='function'){
      const nativeStart=entry.native.startSession.bind(entry.native);
      entry.native.startSession=(options={})=>{
        if(entry.closing&&!closingScope.getStore())throw failure('CLIENT_CLOSED');
        const implicit=options.explicit===false;
        // Mongoose's asynchronous explicit open already reserved a slot above.
        if(!implicit&&explicitOpening.getStore())return nativeStart(options);
        reserveSession(implicit);
        try{return attachSession(nativeStart(options),implicit);}
        catch(error){if(implicit)reservedImplicit--;else reservedSessions--;throw error;}
      };
    }
    if(connection.db?.command){const command=connection.db.command.bind(connection.db);connection.db.command=(cmd,options={})=>io(()=>command(cmd,ioOptions(options,true)));}
    if(connection.db?.admin){const admin=connection.db.admin.bind(connection.db);connection.db.admin=()=>{const db=admin();return Object.assign(Object.create(db),{command:(cmd,options={})=>io(()=>db.command(cmd,ioOptions(options,true)))});};}
    return connection;
  }
  async function openClient(factory){
    assertActive();if(typeof factory!=='function'||clientCount>=limits.clients){void stop('CLIENT_LIMIT');throw failure('CLIENT_LIMIT');}
    clientCount++; // Reserve before invoking a connector, including concurrent opens.
    try{return await io(async signal=>{
      const connection=await factory(Object.freeze({...durableClientOptions,maxPoolSize:limits.poolSize,maxConnecting:limits.maxConnecting,timeoutMS:limits.ioMs}),signal);
      if(stopped||disposed){await settleClose(()=>connection.close(true),'late-client');throw failure(reason??'RUNTIME_CLOSED');}
      try{return attachClient(connection);}catch{await settleClose(()=>connection.close(true),'rejected-client');throw failure('CLIENT_OPTIONS_REJECTED');}
    });}catch{void stop('CLIENT_OPEN_FAILED');throw failure(reason);}
  }
  function adoptDouble(connection){
    assertActive();if(clients.has(connection))return connection;
    if(clientCount>=limits.clients){void stop('CLIENT_LIMIT');throw failure('CLIENT_LIMIT');}
    clientCount++;try{return attachClient(connection,{double:true});}catch(error){void stop('UNMANAGED_CLIENT');throw error;}
  }
  function bindModels(models){
    for(const model of Object.values(models)){
      for(const name of ['updateOne','deleteOne'])if(typeof model[name]==='function'&&!wrapped.has(model[name])){
        const original=model[name];const guarded=function(filter,update,options){
          const args=name==='deleteOne'?[filter,ioOptions(update)]:[filter,update,ioOptions(options)];
          return io(()=>original.apply(this,args),{write:true});
        };wrapped.add(guarded);model[name]=guarded;
      }
      if(typeof model.find==='function'&&!wrapped.has(model.find)){
        const original=model.find;const guarded=function(...args){
          assertActive();const query=original.apply(this,args);query.setOptions?.(ioOptions(args[2],true));
          const lean=query.lean;query.lean=function(...values){return io(()=>lean.apply(this,values));};return query;
        };wrapped.add(guarded);model.find=guarded;
      }
      if(model.collection?.indexes&&!wrapped.has(model.collection.indexes)){
        const original=model.collection.indexes;const guarded=function(...args){return io(()=>original.apply(this,args));};wrapped.add(guarded);model.collection.indexes=guarded;
      }
    }
  }
  function assertCleanup(){assertActive();if(uncertain||[...pending].some(p=>p.write))throw failure('UNSAFE_CLEANUP');}
  async function wait(work,maximumMs=limits.totalMs){return io(work,{timeoutMs:Math.min(maximumMs,limits.totalMs)});}
  async function finish(){
    clearTimeout(globalTimer);disposed=true;
    // Keep stopped/uncertain sticky even if an operation completes later.
    if(pending.size) {uncertain||=[...pending].some(p=>p.write);if(!stopped){stopped=true;reason='PENDING_OPERATIONS';}controller.abort(failure(reason));}
    shutdownJob??=shutdownResources();await shutdownJob;return snapshot();
  }
  function snapshot(){return Object.freeze({stopped,reason,uncertain,activeBudgetMs:activeMs,clientsCreated:clientCount,sessionsCreated:sessionCount,
    activeSessions:reservedSessions+reservedImplicit,activeExplicitSessions:reservedSessions,activeImplicitSessions:reservedImplicit,
    implicitSessionsCreated:implicitCount,pendingOperations:pending.size,pendingWrites:[...pending].filter(p=>p.write).length,
    closeFailures:closeFailures.size,closed:[...clients.values()].every(e=>e.closing)&&sessions.size===0&&closeFailures.size===0});}
  return Object.freeze({assertActive,assertCleanup,openClient,adoptDouble,bindModels,wait,io,stop,finish,snapshot,signal:controller.signal,limits:Object.freeze(limits)});
}
