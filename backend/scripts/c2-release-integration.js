// Final C.2 composition. Importing this file never connects. A validated, one-use
// activation is required before consuming a credential or invoking any connector.
import mongoose from 'mongoose';
import {generateKeyPair} from 'jose';
import {openAtlasIntegration} from '../src/modules/sync/atlas-integration.js';
import {consumeAtlasCredential,temporaryAtlasCredential} from '../src/modules/sync/atlas-credentials.js';
import {validateAtlasConfig,ATLAS_C2_PHASE} from '../src/modules/sync/atlas-policy.js';
import {CredentialHasher} from '../src/modules/auth/credential-hasher.js';
import {RateLimiter,RATE_POLICY} from '../src/middleware/rate-limiter.js';
import {prepareDurableAtlasPlan,durableRuntime,inspectDurableAtlasPreflight,verifyDurableModels,verifyDurableIndexes,
  verifyDurableInitialInventory,registerDurableRaceActor,cloneDurableRaceActor,executeDurableAtlasRun} from './durable-revocation-atlas-harness.js';
import {issueExecutionPermit,makeRuntimeConnector,ReceiverError} from './c2-receiver-core.js';

const integrations=new WeakMap();
export async function nativeC2Connection(uri,options,signal){
  const connection=mongoose.createConnection();connection.on('error',()=>{});
  const abort=()=>{void connection.close(true).catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try{await connection.openUri(uri,options);if(signal.aborted)throw new Error();return connection;}
  catch{abort();throw new ReceiverError('CONNECTION_REJECTED');}
  finally{signal.removeEventListener('abort',abort);}
}
export async function openC2Integration({config,credential,activation,createConnection=nativeC2Connection,recordPlan=()=>{}}){
  const permit=issueExecutionPermit(activation?.manifest,activation?.context??{});
  const checked=validateAtlasConfig(config);if(checked.persistenceTest!==ATLAS_C2_PHASE)throw new ReceiverError('CONNECTION_REJECTED');
  let password=consumeAtlasCredential(credential);
  const plan=prepareDurableAtlasPlan({executionId:activation.context.runId}),runtime=durableRuntime(plan),handles=[];
  const open=async()=>{
    runtime.assertActive();
    const handle=await openAtlasIntegration({config:checked,credential:temporaryAtlasCredential(Buffer.from(password,'utf8')),
      connector:makeRuntimeConnector(runtime,createConnection)});handles.push(handle);return handle;
  };
  const close=async()=>{
    password=null;
    const settled=await Promise.allSettled(handles.map(h=>h.close()));
    const state=await runtime.finish();if(settled.some(r=>r.status==='rejected')||!state.closed)throw new ReceiverError('CLOSE_FAILED');
  };
  try{
    recordPlan({executionId:plan.executionId,runId:plan.runId,collections:plan.collections,identities:plan.identities});
    const first=await open();
    const facade=Object.create(null);
    Object.defineProperty(facade,'runtime',{get:()=>runtime});Object.defineProperty(facade,'close',{value:close});
    integrations.set(facade,{plan,permit,runtime,first,open,used:false,config:checked,now:Date.now});return Object.freeze(facade);
  }catch{await close().catch(()=>{});throw new ReceiverError('CONNECTION_REJECTED');}
}
async function inspect(state,handle,{initial=false}={}){
  const {plan,runtime}=state,connection=handle.connection;
  await inspectDurableAtlasPreflight(plan,connection,state.config);
  const identity=handle.createIdentityRepository({now:state.now});
  const repository=handle.createRepository({identityRepository:identity,coordinator:identity.coordinator,now:state.now});
  const models={...repository.models,...identity.models};runtime.bindModels(models);verifyDurableModels(plan,models);
  for(const [key,model]of Object.entries(models))verifyDurableIndexes(key,await model.collection.indexes());
  if(initial){const rows={};for(const [key,m]of Object.entries(models))rows[key]=await m.find({}).limit(25).lean();verifyDurableInitialInventory(plan,rows);}
  return {identity,repository,models,connection,close:()=>handle.close()};
}
export async function runC2Integration(handle){
  const state=integrations.get(handle);if(!state||state.used)throw new ReceiverError('REUSE_REJECTED');state.used=true;
  try{
    const first=await inspect(state,state.first,{initial:true}),second=await inspect(state,await state.open());
    const keys=await generateKeyPair('RS256',{modulusLength:2048}),jwtConfig={...keys,mode:'isolated-test',algorithm:'RS256',
      issuer:'https://two-sides.test.invalid',audience:'two-sides-isolated-api',keyId:'c2-final-synthetic'};
    const hasher=new CredentialHasher(),limiter=new RateLimiter({now:state.now}),actors={},peers={};
    for(const label of ['A','B','C'])actors[label]=await registerDurableRaceActor({plan:state.plan,label,identity:first.identity,
      createRepository:options=>state.first.createRepository(options),jwtConfig,hasher,limiter,policy:RATE_POLICY,now:state.now});
    for(const label of ['A','B'])peers[label]=await cloneDurableRaceActor({actor:actors[label],...second});
    return await executeDurableAtlasRun({permit:state.permit,plan:state.plan,actors,peers,models:first.models,
      reopen:async()=>inspect(state,await state.open())});
  }catch{void state.runtime.stop();throw new ReceiverError('EXECUTION_FAILED');}
}
