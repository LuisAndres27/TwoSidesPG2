import './support/isolation-guard.js';
import {expect,it} from 'vitest';
import {atlasConfig,atlasDouble} from './support/atlas-double.js';
import {validateAtlasConfig} from '../../src/modules/sync/atlas-policy.js';
import {ingestionModels} from '../../src/modules/sync/mongo-models.js';
import {requiredIndexes,requireEmptyEnumeration,checkIndexInventory,validateOwnedInventory} from '../../scripts/atlas-transactional-suite.js';
it('T01 D.2E needs exact capability, DEFAULT and explicit writes',()=>{
  const c=atlasConfig({persistenceTest:'B05.4C.2D.2E',authMechanism:'DEFAULT',allowWrites:true});expect(validateAtlasConfig(c).persistenceTest).toBe('B05.4C.2D.2E');
  for(const changes of [{persistenceTest:'other'},{authMechanism:'SCRAM-SHA-256'},{allowWrites:false},{database:'two_sides_db'},{user:'twosides_backend'},{tls:false}])expect(()=>validateAtlasConfig({...c,...changes})).toThrow();
});
it('T02 incomplete metadata, wrong response or ANY existing namespace stops before writes',()=>{
  expect(()=>requireEmptyEnumeration({ok:1,cursor:{id:0,firstBatch:[]}})).not.toThrow();
  for(const r of [{ok:0},{ok:1,cursor:{id:5,firstBatch:[]}},{ok:1,cursor:{id:0,firstBatch:[{name:'unknown'}]}}])expect(()=>requireEmptyEnumeration(r)).toThrow();
});
it('T03 only exact two unique index definitions and standard id indexes are permitted',()=>{
  expect(requiredIndexes).toHaveLength(2);const id={name:'_id_',key:{_id:1}};
  for(const r of requiredIndexes){expect(()=>checkIndexInventory([id],r)).not.toThrow();expect(()=>checkIndexInventory([id],r,{prepared:true})).toThrow();
    expect(()=>checkIndexInventory([id,{name:r.name,key:r.key,unique:true}],r,{prepared:true})).not.toThrow();
    for(const bad of [{name:r.name,key:r.key,unique:false},{name:r.name,key:{other:1},unique:true},{name:'foreign',key:r.key,unique:true},{name:r.name,key:r.key,unique:true,sparse:true}])expect(()=>checkIndexInventory([id,bad],r)).toThrow();}
});
it('T04 cleanup requires one consistent owned document per collection and rejects foreign or missing data',()=>{
  const cp={runId:'a'.repeat(32),accountId:'account',installationId:'installation',localPlayerId:'player',operationId:'operation',sessionId:'session',authSessionId:'auth'};
  const scope='account:installation:player:1',opId='account:operation',factId=scope+'|session:session:open';
  const mark={integrationRunId:cp.runId,syntheticOwnerId:cp.runId};
  const rows={operations:[{...mark,_id:opId,technicalAccountId:'account',record:{key:opId,receipt:{technicalAccountId:'account'}}}],facts:[{...mark,_id:factId,scope,record:{key:factId}}],fences:[{...mark,_id:'ingestion-v1'}],authorization:[{...mark,_id:'auth',technicalAccountId:'account',installationId:'installation',localPlayerId:'player'}]};
  expect(()=>validateOwnedInventory(cp,rows)).not.toThrow();
  for(const key of Object.keys(rows)){const bad=structuredClone(rows);bad[key][0].integrationRunId='other';expect(()=>validateOwnedInventory(cp,bad)).toThrow();const missing=structuredClone(rows);missing[key]=[];expect(()=>validateOwnedInventory(cp,missing)).toThrow();}
});
it('T05 real adapter D.2E schemas carry ownership markers and exactly two declared indexes',async()=>{
  const c=atlasConfig({persistenceTest:'B05.4C.2D.2E',authMechanism:'DEFAULT',allowWrites:true}),db=atlasDouble(c),o=db.connection.getClient().options;o.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options:o});
  db.connection.models={};db.connection.model=(name,schema,collection)=>({db:db.connection,schema,collection:{name:collection,conn:db.connection}});let models;
  const h=await db.open({modelFactory:(conn,options)=>(models=ingestionModels(conn,options))});const coordinator={run:work=>work()};
  try{const identity=h.createIdentityRepository();h.createRepository({coordinator:identity.coordinator,identityRepository:identity,fenceAuthorization:async()=>false});
    expect(Object.values(models).flatMap(m=>m.schema.indexes())).toHaveLength(2);
    for(const m of Object.values(models)){expect(m.schema.options.autoCreate).toBe(false);expect(m.schema.options.autoIndex).toBe(false);expect(m.schema.path('integrationRunId').getDefault()).toBe(c.runId);}
  }finally{await h.close();}
});
