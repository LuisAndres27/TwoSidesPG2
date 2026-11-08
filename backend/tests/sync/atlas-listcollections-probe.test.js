import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import net from 'node:net';
import mongoose from 'mongoose';
import { atlasDouble,atlasConfig,credential } from './support/atlas-double.js';
import { probeAtlasListCollections } from '../../src/modules/sync/atlas-listcollections-probe.js';
import { classifyAtlasError } from '../../src/modules/sync/atlas-error-diagnostic.js';
import { diagnosticReadonlyConnector } from '../../src/modules/sync/atlas-readonly-connector.js';
afterEach(()=>vi.restoreAllMocks());
function setup(){
  const db=atlasDouble(atlasConfig({authMechanism:'DEFAULT'})),o=db.connection.getClient().options;
  o.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options:o});
  db.status.authInfo.authenticatedUserPrivileges[0].actions.push('listCollections');
  db.connection.db.listCollections=vi.fn(()=>({toArray:async()=>[]}));
  db.probe=(extra={})=>probeAtlasListCollections({config:db.config,credential:credential(),connector:db.connector,...extra});return db;
}
const failure=(message,code=8000)=>Object.assign(new Error(message),{name:'MongoServerError',code,codeName:'AtlasError'});
it('Q01 succeeds with one original query, no alternate/models/writes, explicit permission flags and close',async()=>{
  const db=setup(),r=await db.probe();expect(r).toMatchObject({outcome:'A',status:'completed',queryInvocations:1,alternativeExecuted:false,collectionCount:0,closed:true,remoteDocumentWrites:0,transactionsExecuted:0,modelsCreated:0});
  expect(r.permissions).toMatchObject({listCollections:true,databaseWideFind:true});expect(db.connection.db.listCollections).toHaveBeenCalledTimes(1);
  const [filter,options]=db.connection.db.listCollections.mock.calls[0];expect(filter.name.$in).toHaveLength(4);expect(options).toEqual({nameOnly:true});expect(db.calls).toHaveLength(0);
});
it('Q02 missing listCollections gives B without invoking a cursor',async()=>{
  const db=setup();db.status.authInfo.authenticatedUserPrivileges[0].actions.pop();const r=await db.probe();
  expect(r).toMatchObject({outcome:'B',originalQuery:'not-attempted',queryInvocations:0,closed:true});expect(r.permissions.listCollections).toBe(false);
  expect(db.connection.db.listCollections).not.toHaveBeenCalled();
});
it('Q03 authorization rejection gives C and never retries/falls back',async()=>{
  const db=setup();db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>{throw failure('private',13);}}));const r=await db.probe();
  expect(r.outcome).toBe('C');expect(r.diagnostic.category).toBe('AUTHORIZATION_FAILURE');expect(r.closed).toBe(true);expect(db.connection.db.listCollections).toHaveBeenCalledTimes(1);
});
it('Q04 unknown 8000 gives E without inventing authentication or tier failure',async()=>{
  const db=setup();db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>{throw failure('synthetic unrecognized detail');}}));const r=await db.probe();
  expect(r.outcome).toBe('E');expect(r.diagnostic.category).toBe('UNKNOWN_CONNECTION_FAILURE');expect(r.authentication).toBe('accepted-by-driver');expect(r.queryInvocations).toBe(1);expect(r.alternativeExecuted).toBe(false);
  expect(JSON.stringify(r)).not.toContain('synthetic unrecognized detail');
});
it('Q05 fixed metadata signatures classify as D without returning message content',async()=>{
  for(const [message,category]of [['unsupported type in filter','UNSUPPORTED_METADATA_FILTER'],["can\'t get regex from filter doc",'UNSUPPORTED_METADATA_FILTER'],['command listCollections is not allowed in this Atlas tier','UNSUPPORTED_METADATA_COMMAND']]){
    const db=setup();db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>{throw failure(message);}}));const r=await db.probe();
    expect(r.outcome).toBe('D');expect(r.diagnostic.category).toBe(category);expect(r.diagnostic.stage).toBe('list-collections');expect(JSON.stringify(r)).not.toContain(message);
  }
});
it('Q06 signatures require command stage, numeric 8000 and a recognized fixed prefix',()=>{
  for(const [error,stage]of [[failure('unsupported type in filter'),'mongoose-connect'],[failure('unsupported type in filter',6),'list-collections'],[failure('secret prefix unsupported type in filter'),'list-collections']])
    expect(classifyAtlasError(error,{stage}).category).not.toBe('UNSUPPORTED_METADATA_FILTER');
});
it('Q07 invalid/write configuration never invokes a connector',async()=>{
  for(const changes of [{allowWrites:true,persistenceTest:'B05.4C.2D.2'},{database:'two_sides_db'},{user:'twosides_backend'},{tls:false},{authMechanism:'SCRAM-SHA-256'}]){
    const connector=vi.fn(),db=setup();await db.probe({config:{...db.config,...changes},connector});expect(connector).not.toHaveBeenCalled();
  }
});
it('Q08 driver receives retryReads false, bounded timeout, identical DEFAULT identity and strict TLS offline',async()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Offline');});let checked=false;
  const connect=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockImplementation(async function(){
    const o=this.options;expect(o.retryReads).toBe(false);expect(o.timeoutMS).toBe(5000);expect(o.tls).toBe(true);expect(o.rejectUnauthorized).toBe(true);
    expect(o.credentials.username).toBe('twosides_integration_test');expect(o.credentials.source).toBe('admin');expect(o.credentials.mechanism).toBe('DEFAULT');checked=true;throw new Error('Offline boundary');
  });
  const db=setup();await db.probe({connector:diagnosticReadonlyConnector(mongoose)});expect(checked).toBe(true);expect(connect).toHaveBeenCalledTimes(1);expect(socket).not.toHaveBeenCalled();
});
it('Q09 unexpected namespace aborts without recording its name; existing selected namespace is partial',async()=>{
  const db=setup();db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>[{name:'synthetic_foreign_name'}]}));let r=await db.probe();expect(r.status).toBe('blocked');expect(JSON.stringify(r)).not.toContain('synthetic_foreign_name');
  const own=setup();own.connection.db.listCollections.mockImplementation(filter=>({toArray:async()=>[{name:filter.name.$in[0],type:'collection'}]}));r=await own.probe();expect(r.outcome).toBe('A');expect(r.namespacesAbsent).toBe(false);expect(r.status).toBe('partial');
});
it('Q10 close failure is reported separately, not as a validated preflight',async()=>{
  const db=setup();db.connection.close=async()=>{throw new Error('private');};const r=await db.probe();expect(r.closed).toBe(false);expect(r.status).toBe('partial');
});
