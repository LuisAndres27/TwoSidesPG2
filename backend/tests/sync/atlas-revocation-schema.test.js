import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import net from 'node:net';
import { atlasDouble,credential } from './support/atlas-double.js';
import { schemaInventory,schemaConfiguration,provisionRevocationSchema,checkSchemaIndexes } from '../../scripts/atlas-revocation-schema-suite.js';
import { validateAtlasConfig,ATLAS_C2_PHASE } from '../../src/modules/sync/atlas-policy.js';
import { openAtlasIntegration } from '../../src/modules/sync/atlas-integration.js';
import { executeDurableAtlasRun,durableIndexes } from '../../scripts/durable-revocation-atlas-harness.js';
import { executeAtlasConcurrencyRun } from '../../scripts/atlas-concurrency-harness.js';
afterEach(()=>vi.restoreAllMocks());
function schemaDouble(options={}){
  const db=atlasDouble(schemaConfiguration()),names=new Set(schemaInventory.previous),tables=new Map(),writes=[];
  if(options.unexpected)names.add(options.unexpected);
  db.status.authInfo.authenticatedUserPrivileges[0].actions.push('listCollections');
  const keys=new Map(Object.entries(schemaInventory.collections).map(([k,v])=>[v,k]));
  db.connection.db.command=async command=>{db.commands.push(command);if(command.connectionStatus)return structuredClone(db.status);
    expect(command).toEqual({listCollections:1,authorizedCollections:true,nameOnly:true});return {ok:1,cursor:{id:options.cursorId??0,firstBatch:[...names].map(name=>({name}))}};};
  db.connection.db.createCollection=async(name)=>{
    if(!keys.has(name)||names.has(name))throw Object.assign(new Error('Unexpected namespace'),{code:48});
    if(options.createError)throw Object.assign(new Error('synthetic private failure'),{code:48});
    writes.push({kind:'collection',name});names.add(name);tables.set(name,{rows:[],indexes:[{name:'_id_',key:{_id:1}}]});
  };
  db.connection.db.collection=name=>{
    if(!keys.has(name))throw new Error('Other run forbidden');const key=keys.get(name);
    const table=()=>{if(!tables.has(name))throw new Error('Missing collection');return tables.get(name);};
    return {dbName:'two_sides_integration_test',collectionName:name,
      async indexes(){if(options.extraIndex)return [...table().indexes,{name:'unknown',key:{unknown:1}}];return structuredClone(table().indexes);},
      async createIndex(definition,index){
        const exact=schemaInventory.indexes.find(i=>i.model===key&&i.name===index.name);expect(definition).toEqual(exact.key);expect(index.unique).toBe(true);
        if(options.indexError)throw Object.assign(new Error('synthetic private failure'),{code:85});
        table().indexes.push({name:index.name,key:definition,unique:true});writes.push({kind:'index',name,index:index.name});return index.name;
      },
      async findOne(filter){expect(Object.keys(filter)).toEqual(['_id']);if(options.nonempty===key&&filter._id?.$exists)return {_id:'synthetic-outsider'};
        return structuredClone(filter._id?.$exists?(table().rows[0]??null):(table().rows.find(r=>r._id===filter._id)??null));},
      async insertOne(document){expect(key).toBe('fences');expect(document).toEqual({_id:'ingestion-v1',revision:0});
        writes.push({kind:'document',name});table().rows.push(structuredClone(document));
        if(options.unknownFence)throw Object.assign(new Error('synthetic private failure'),{code:50});return {acknowledged:true};},
      async countDocuments(filter){expect(filter).toEqual({_id:{$exists:true}});return table().rows.length;},
    };
  };
  const connector=vi.fn(async(_uri,o)=>{
    const safe={srvHost:'twosidescluster.fxqeo8o.mongodb.net',dbName:o.dbName,directConnection:false,tls:o.tls,
      credentials:{username:o.user,source:o.authSource,mechanism:o.authMechanism},timeoutMS:o.timeoutMS,retryReads:o.retryReads,retryWrites:o.retryWrites,
      maxPoolSize:o.maxPoolSize};db.connection.getClient=()=>({options:safe});return db.connection;
  });
  return {db,tables,writes,connector};
}
const run=f=>provisionRevocationSchema({credential:credential(),connector:f.connector});
it('SC01 schema and C.2 capabilities pin runId, DEFAULT, TLS, user and database; unconfigured mode remains blocked',()=>{
  const config=schemaConfiguration();
  // C.2 is an existing scoped capability, not an invalid phase. Activation remains a separate receiver gate.
  for(const phase of [config.persistenceTest,ATLAS_C2_PHASE]){
    const scoped={...config,persistenceTest:phase};
    expect(validateAtlasConfig(scoped)).toMatchObject({runId:schemaInventory.runId,persistenceTest:phase});
    for(const patch of [{runId:'a'.repeat(32)},{authMechanism:'SCRAM-SHA-256'},{database:'two_sides_db'},{user:'twosides_backend'},{tls:false},{allowWrites:false},{authorized:false},{persistenceTest:'unrecognized-phase'}])expect(()=>validateAtlasConfig({...scoped,...patch})).toThrow();
  }
  expect(()=>validateAtlasConfig({})).toThrow();
});
it('SC02 eight names and five unique definitions match the approved report and C.1',()=>{
  expect(Object.values(schemaInventory.collections)).toHaveLength(8);expect(schemaInventory.indexes).toEqual(durableIndexes);
  const report=fs.readFileSync(new URL('../../docs/B05_DURABLE_REVOCATION_ATLAS_RESULT.md',import.meta.url),'utf8');
  for(const name of Object.values(schemaInventory.collections))expect(report).toContain(name);expect(schemaInventory.limits).toMatchObject({documents:1,connections:1,secondaryIndexes:5});
});
it('SC03 raw schema path creates only eight collections, five indexes and one fence; closes connection',async()=>{
  const f=schemaDouble(),r=await run(f);expect(r).toMatchObject({status:'completed',closed:true,fenceConfirmed:true,structuresVerified:true,racesExecuted:false,previousStructuresUntouched:true});
  expect(f.writes.filter(w=>w.kind==='collection')).toHaveLength(8);expect(f.writes.filter(w=>w.kind==='index')).toHaveLength(5);expect(f.writes.filter(w=>w.kind==='document')).toHaveLength(1);
  expect([...f.tables.values()].reduce((n,t)=>n+t.rows.length,0)).toBe(1);expect(f.connector).toHaveBeenCalledTimes(1);
});
it('SC04 an unexpected namespace or an existing target aborts before ANY write',async()=>{
  for(const unexpected of ['foreign-collection',schemaInventory.collections.operations]){const f=schemaDouble({unexpected}),r=await run(f);expect(r.status).toBe('blocked');expect(f.writes).toHaveLength(0);expect(r.closed).toBe(true);}
});
it('SC05 missing catalog permission and incomplete enumeration stop without writes or fallback',async()=>{
  const f=schemaDouble();f.db.status.authInfo.authenticatedUserPrivileges[0].actions=f.db.status.authInfo.authenticatedUserPrivileges[0].actions.filter(a=>a!=='listCollections');
  expect((await run(f)).status).toBe('blocked');expect(f.writes).toHaveLength(0);
  const g=schemaDouble({cursorId:7});expect((await run(g)).status).toBe('blocked');expect(g.writes).toHaveLength(0);
});
it('SC06 incompatible index stops, preserves created collections and exposes no raw error',async()=>{
  const f=schemaDouble({indexError:true}),r=await run(f);expect(r.status).toBe('partial');expect(r.serverCode).toBe(85);expect(r.createdCollections).toHaveLength(8);expect(r.createdIndexes).toHaveLength(0);
  expect(JSON.stringify(r)).not.toContain('synthetic private failure');expect(f.writes.filter(w=>w.kind==='document')).toHaveLength(0);expect(f.tables.size).toBe(8);
});
it('SC07 an unexpected automatic index stops after the first owned collection without deleting anything',async()=>{
  const f=schemaDouble({extraIndex:true}),r=await run(f);expect(r.status).toBe('partial');expect(f.tables.size).toBe(1);expect(f.writes).toHaveLength(1);
});
it('SC08 unexpected data in a new namespace prevents fence insertion',async()=>{
  const f=schemaDouble({nonempty:'facts'}),r=await run(f);expect(r.status).toBe('partial');expect(r.fenceConfirmed).toBe(false);expect(f.writes.filter(w=>w.kind==='document')).toHaveLength(0);
});
it('SC09 uncertain fence write is never retried or declared absent/confirmed',async()=>{
  const f=schemaDouble({unknownFence:true}),r=await run(f);expect(r.status).toBe('partial');expect(r.fenceConfirmed).toBe(false);expect(r.preserveCreatedStructures).toBe(true);
  expect(f.writes.filter(w=>w.kind==='document')).toHaveLength(1);expect(f.tables.get(schemaInventory.collections.fences).rows).toHaveLength(1);
});
it('SC10 close failure prevents completed status even when schema was acknowledged',async()=>{
  const f=schemaDouble();f.db.connection.close=async()=>{throw new Error('synthetic private failure');};const r=await run(f);expect(r.status).toBe('partial');expect(r.closed).toBe(false);
});
it('SC11 progress precedes each mutating call and contains only safe inventory metadata',async()=>{
  const f=schemaDouble(),events=[];const r=await provisionRevocationSchema({credential:credential(),connector:f.connector,onProgress:async e=>{events.push({stage:e.stage,kind:e.attemptedObject?.kind,writes:f.writes.length});}});
  expect(r.status).toBe('completed');expect(events[0]).toEqual({stage:'create-collection',kind:'collection',writes:0});
  expect(events.find(e=>e.stage==='insert-fence').writes).toBe(13);expect(JSON.stringify(events)).not.toMatch(/pass|credential|token/i);
});
it('SC12 no ingestion/identity factory may be composed under schema-only capability',async()=>{
  const f=schemaDouble(),modelFactory=vi.fn();const h=await openAtlasIntegration({config:schemaConfiguration(),credential:credential(),connector:f.connector,modelFactory});
  try{expect(()=>h.createRepository({})).toThrow();expect(()=>h.createIdentityRepository()).toThrow();expect(modelFactory).not.toHaveBeenCalled();expect(f.writes).toHaveLength(0);}finally{await h.close();}
});
it('SC13 C.2 race and F.2 entries remain unconditionally disabled',async()=>{
  await expect(executeDurableAtlasRun()).rejects.toMatchObject({code:'DURABLE_REVOCATION_C2_NOT_AUTHORIZED'});
  await expect(executeAtlasConcurrencyRun()).rejects.toMatchObject({code:'REVOCATION_COMMIT_RACE_REQUIRES_REVIEW'});
});
it('SC14 unsafe partial, sparse, TTL or hidden index definitions cannot be accepted',()=>{
  const id={name:'_id_',key:{_id:1}},i=schemaInventory.indexes[0];
  for(const patch of [{sparse:true},{partialFilterExpression:{}},{expireAfterSeconds:1},{hidden:true},{unique:false},{key:{other:1}}])expect(()=>checkSchemaIndexes('operations',[id,{...i,unique:true,...patch}],{complete:true})).toThrow();
});
it('SC15 no actual socket is needed for the entire schema suite with doubles',async()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Network forbidden');});expect((await run(schemaDouble())).status).toBe('completed');expect(socket).not.toHaveBeenCalled();
});
it('SC16 launcher rejects absent authorization before password input, and never reads ACL/owner',()=>{
  const file=fileURLToPath(new URL('../../scripts/send-atlas-schema-credential.ps1',import.meta.url));const source=fs.readFileSync(file,'utf8');
  expect(source).not.toMatch(/Get-Acl|Set-Acl|icacls|\.Owner\b|takeown/i);
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',timeout:10000,windowsHide:true});expect(r.status).toBe(1);expect(r.stdout).not.toContain('entrada oculta');
});
