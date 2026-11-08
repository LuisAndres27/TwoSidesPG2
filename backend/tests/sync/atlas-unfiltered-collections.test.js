import './support/isolation-guard.js';
import {expect,it,vi} from 'vitest';
import {atlasDouble,atlasConfig,credential} from './support/atlas-double.js';
import {probeAtlasUnfilteredCollections} from '../../src/modules/sync/atlas-unfiltered-collections-probe.js';
function setup(response={ok:1,cursor:{id:0,firstBatch:[]}}){
  const db=atlasDouble(atlasConfig({authMechanism:'DEFAULT'})),o=db.connection.getClient().options;o.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options:o});
  db.status.authInfo.authenticatedUserPrivileges[0].actions.push('listCollections');
  const original=db.connection.db.command;db.connection.db.command=vi.fn(async c=>c.connectionStatus?original(c):response);
  db.probe=extra=>probeAtlasUnfilteredCollections({config:db.config,credential:credential(),connector:db.connector,...extra});return db;
}
it('U01 one exact unfiltered command, no other metadata command or model/write',async()=>{
  const db=setup(),r=await db.probe();expect(r).toMatchObject({status:'completed',queryInvocations:1,alternativeExecuted:true,enumerationComplete:true,closed:true,remoteDocumentWrites:0,modelsCreated:0});
  expect(db.connection.db.command.mock.calls.filter(([c])=>c.listCollections)).toEqual([[{listCollections:1,authorizedCollections:true,nameOnly:true}]]);
  expect(db.connection.db.command.mock.calls.every(([c])=>c.connectionStatus||c.listCollections)).toBe(true);expect(db.calls).toHaveLength(0);
});
it('U02 missing permission stops before enumeration',async()=>{
  const db=setup();db.status.authInfo.authenticatedUserPrivileges[0].actions.pop();const r=await db.probe();expect(r.outcome).toBe('B');expect(r.queryInvocations).toBe(0);expect(r.closed).toBe(true);
});
it('U03 live cursor is incomplete and never triggers getMore',async()=>{
  const db=setup({ok:1,cursor:{id:42,firstBatch:[]}}),r=await db.probe();expect(r.status).toBe('partial');expect(r.enumerationComplete).toBe(false);expect(r.selectedNamespacesAbsent).toBe(false);expect(r.additionalCursorCommandsExecuted).toBe(0);
});
it('U04 returns only pertinent names and counts others without disclosing them',async()=>{
  const name='b054c2c_'+'a'.repeat(32)+'_ops',db=setup({ok:1,cursor:{id:0,firstBatch:[{name},{name:'private_other_project'}]}}),r=await db.probe();
  expect(r.pertinentCollections).toEqual([name]);expect(r.otherCollectionCount).toBe(1);expect(JSON.stringify(r)).not.toContain('private_other_project');
});
it('U05 error 8000 executes no second command or retry',async()=>{
  const db=setup(),original=db.connection.db.command;db.connection.db.command=vi.fn(async c=>{if(c.listCollections)throw Object.assign(new Error('synthetic unknown'),{name:'MongoServerError',code:8000});return original(c);});
  const r=await db.probe();expect(r.outcome).toBe('E');expect(r.queryInvocations).toBe(1);expect(r.closed).toBe(true);expect(db.connection.db.command.mock.calls.filter(([c])=>c.listCollections)).toHaveLength(1);
});
it('U06 write or foreign configuration is rejected before connector',async()=>{
  for(const changes of [{database:'two_sides_db'},{allowWrites:true,persistenceTest:'B05.4C.2D.2'},{user:'twosides_backend'},{tls:false}]){
    const db=setup(),connector=vi.fn();await db.probe({config:{...db.config,...changes},connector});expect(connector).not.toHaveBeenCalled();
  }
});
