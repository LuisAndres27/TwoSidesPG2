// Offline bootstrap only. No stdin protocol, password prompt or network connector.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CredentialHasher } from '../src/modules/auth/credential-hasher.js';
import { prepareDurableAtlasPlan,verifyDurableInitialInventory,durableProvisionSteps,
  executeDurableAtlasRun,durableRuntime } from './durable-revocation-atlas-harness.js';
import { createDurableRuntime,durableClientOptions } from './durable-revocation-runtime.js';
import { ATLAS_TARGET,ATLAS_URI,ATLAS_SCHEMA_RUN,validateAtlasConfig } from '../src/modules/sync/atlas-policy.js';

let output,runtime,plan;
try {
  const args=process.argv.slice(2);
  assert.equal(args.length,4);assert.equal(args[0],'--offline-result');assert.equal(args[2],'--run-id');
  assert.match(args[3],/^[a-f0-9]{32}$/);
  const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  output=path.resolve(args[1]);
  assert.equal(output,path.join(path.dirname(packageRoot),'runs',args[3],'result.json'));
  assert.equal(process.env.NODE_ENV,'test');
  for(const name of Object.keys(process.env))assert(!/^(?:NODE_(?:OPTIONS|PATH|COMPILE_CACHE)|NAPI_RS_|MONGO|LD_|DYLD_)/i.test(name));
  const loadedNative=Object.keys(createRequire(import.meta.url).cache).filter(p=>p.endsWith('.node'));
  assert.deepEqual(loadedNative,[path.join(packageRoot,'node_modules','@node-rs','argon2-win32-x64-msvc','argon2.win32-x64-msvc.node')]);
  const hasher=new CredentialHasher();let synthetic=randomBytes(32).toString('base64url');
  const verifier=await hasher.hash(synthetic);assert.equal(await hasher.verify(verifier,synthetic),true);
  assert.equal(await hasher.verify(verifier,synthetic+'x'),false);synthetic=null;
  plan=prepareDurableAtlasPlan();assert.equal(plan.runId,ATLAS_SCHEMA_RUN);
  const rows=Object.fromEntries(Object.keys(plan.collections).map(k=>[k,k==='fences'?[{_id:'ingestion-v1',revision:0}]:[]]));
  verifyDurableInitialInventory(plan,rows);assert.equal(durableProvisionSteps(plan).seedFence,null);
  assert.deepEqual(durableProvisionSteps(plan).createCollections,[]);
  let connectorCalled=false;
  await assert.rejects(executeDurableAtlasRun({connector(){connectorCalled=true;}}),{code:'DURABLE_REVOCATION_C2_NOT_AUTHORIZED'});
  assert.equal(connectorCalled,false);
  const config={mode:'atlas-integration-test',authorized:true,uri:ATLAS_URI,...ATLAS_TARGET,tls:true,
    runId:ATLAS_SCHEMA_RUN,authMechanism:'DEFAULT'};
  for(const changed of [{database:'two_sides_db'},{user:'twosides_backend'},{tls:false}])assert.throws(()=>validateAtlasConfig({...config,...changed}));
  runtime=createDurableRuntime();
  const connection=await runtime.openClient(async options=>{
    const native={options:{...options,srvHost:ATLAS_TARGET.host,credentials:{username:ATLAS_TARGET.user,source:'admin',mechanism:'DEFAULT'}}};
    return {name:ATLAS_TARGET.database,readyState:1,db:{databaseName:ATLAS_TARGET.database},getClient:()=>native,
      async close(){this.readyState=0;},async startSession(){return{async withTransaction(work){return work();},async endSession(){}};}};
  });
  const session=await connection.startSession();try{await session.withTransaction(async()=>17);}finally{await session.endSession();}
  const resources=await runtime.finish();assert.equal(resources.closed,true);assert.equal(resources.activeSessions,0);
  assert.equal(resources.pendingOperations,0);assert.equal(durableClientOptions.maxPoolSize,2);
  assert.deepEqual(rows.fences,[{_id:'ingestion-v1',revision:0}]);
  fs.writeFileSync(output,JSON.stringify({version:1,mode:'offline-only',runId:args[3],status:'passed',
    atlasConnected:false,remoteEnabled:false,argon2Synthetic:true,fixedSchema:true,fencePreserved:true,
    wrongTargetRejected:true,resourcesClosed:true})+'\n',{flag:'wx'});
} catch {
  // Never print exception, input, verifier, token, stack or configuration.
  process.exitCode=1;
} finally {
  if(runtime)await runtime.finish();if(plan)await durableRuntime(plan).finish();
}
