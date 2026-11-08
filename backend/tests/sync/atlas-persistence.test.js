import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { atlasConfig,atlasDouble } from './support/atlas-double.js';
import { validateAtlasConfig } from '../../src/modules/sync/atlas-policy.js';
import { ingestionModels } from '../../src/modules/sync/mongo-models.js';
import { validateOperation } from '../../src/modules/sync/schemas.js';
import { syntheticOperation,expectedDocumentIds,assertOwnedRows } from '../../scripts/atlas-persistence-suite.js';
afterEach(()=>vi.restoreAllMocks());
const config=()=>atlasConfig({authMechanism:'DEFAULT',allowWrites:true,persistenceTest:'B05.4C.2D.2'});
function cp(){return {runId:randomUUID().replaceAll('-',''),accountId:randomUUID(),installationId:'10000000-0000-4000-8000-000000000002',localPlayerId:'10000000-0000-4000-8000-000000000001',
  operationIds:[randomUUID(),randomUUID(),randomUUID()],sessionIds:[randomUUID(),randomUUID(),randomUUID()],authorizationIds:[randomUUID()],leaseId:randomUUID(),foreignInstallationId:randomUUID()};}
it('P01 DEFAULT writes require exact D.2 capability; ordinary DEFAULT still rejects writes',()=>{
  expect(validateAtlasConfig(config()).persistenceTest).toBe('B05.4C.2D.2');
  for(const changes of [{persistenceTest:undefined},{persistenceTest:'other'},{allowWrites:false},{authMechanism:'SCRAM-SHA-256'},
    {tls:false},{database:'two_sides_db'},{user:'twosides_backend'}])expect(()=>validateAtlasConfig({...config(),...changes})).toThrow();
});
it('P02 all four scoped adapter schemas default immutable ownership markers and disable auto creation/indexing',async()=>{
  const c=config(),db=atlasDouble(c);const options=db.connection.getClient().options;options.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options});
  db.connection.models={};db.connection.model=(name,schema,collection)=>({db:db.connection,schema,collection:{name:collection,conn:db.connection}});
  let models;const h=await db.open({modelFactory:(connection,options)=>(models=ingestionModels(connection,options))});
  const coordinator={run:work=>work()};
  const identity=h.createIdentityRepository();h.createRepository({identityRepository:identity,coordinator:identity.coordinator,fenceAuthorization:async()=>false});
  if(!models)throw new Error('Models were not constructed');
  for(const model of Object.values(models)){
    expect(model.schema.path('integrationRunId').getDefault()).toBe(c.runId);
    expect(model.schema.path('syntheticOwnerId').getDefault()).toBe(c.runId);
    expect(model.schema.path('integrationRunId').options.immutable).toBe(true);
    expect(model.schema.options.autoCreate).toBe(false);expect(model.schema.options.autoIndex).toBe(false);
  }
  await h.close();
});
it('P03 cleanup rejects foreign ownership, unexpected IDs, excessive rows and inconsistent operation owner',()=>{
  const c=cp(),id=expectedDocumentIds(c).operations[0];
  const row={_id:id,integrationRunId:c.runId,syntheticOwnerId:c.runId,technicalAccountId:c.accountId,record:{key:id,receipt:{technicalAccountId:c.accountId}}};
  expect(()=>assertOwnedRows(c,'operations',[row])).not.toThrow();
  for(const bad of [{...row,_id:randomUUID()},{...row,integrationRunId:'other'},{...row,syntheticOwnerId:'other'},
    {...row,technicalAccountId:randomUUID()},{...row,record:{}}])expect(()=>assertOwnedRows(c,'operations',[bad])).toThrow();
  expect(()=>assertOwnedRows(c,'operations',Array(13).fill(row))).toThrow();
});
it('P04 generated operations and contradictions are valid synthetic envelopes with stable identity',()=>{
  const c=cp();for(const index of [0,1,2]){
    const a=validateOperation(syntheticOperation(c,index)),b=validateOperation(syntheticOperation(c,index,{contradiction:true}));
    expect(a.operationId).toBe(b.operationId);expect(a.payloadHash===b.payloadHash).toBe(false);
    expect(a.envelope.sourceKey).toBe(b.envelope.sourceKey);expect(a.envelope.payload.sessionId).toBe(c.sessionIds[index]);
  }
});
it.skipIf(process.platform!=='win32')('P05 persistence launcher rejects missing authorization before hidden input',()=>{
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.resolve('scripts/send-atlas-persistence-credential.ps1')],{encoding:'utf8',windowsHide:true,timeout:10000});
  expect(r.status).toBe(1);expect(r.stdout).not.toContain('entrada oculta');
});
