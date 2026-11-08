import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import net from 'node:net';
import { MongoClient } from 'mongodb';
import { ListCollectionsOperation } from '../../node_modules/mongodb/lib/operations/list_collections.js';
import { atlasConfig,atlasDouble } from './support/atlas-double.js';
import { ATLAS_URI,ATLAS_TARGET,atlasCollections,verifyAtlasPermissions } from '../../src/modules/sync/atlas-policy.js';
import { atlasNamespaceQueries,assertAtlasNamespacesAbsent } from '../../src/modules/sync/atlas-namespace-preflight.js';
import { classifyAtlasError } from '../../src/modules/sync/atlas-error-diagnostic.js';
afterEach(()=>vi.restoreAllMocks());
function setup(){
  const db=atlasDouble(atlasConfig({authMechanism:'DEFAULT'}));
  const o=db.connection.getClient().options;o.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options:o});
  db.status.authInfo.authenticatedUserPrivileges[0].actions.push('listCollections');
  db.connection.db.listCollections=vi.fn(()=>({toArray:async()=>[]}));
  db.preflight=strategy=>assertAtlasNamespacesAbsent({connection:db.connection,config:db.config,strategy});return {db,o};
}
it('L01 original request preserves the four exact names, nameOnly and the authorized database',async()=>{
  const {db}=setup();expect(await db.preflight()).toEqual({verified:true,namespaceCount:4,strategy:'original'});
  expect(db.connection.db.listCollections).toHaveBeenCalledExactlyOnceWith({name:{$in:Object.values(atlasCollections(db.config))}},{nameOnly:true});
  expect(db.commands).toEqual([{connectionStatus:1,showPrivileges:true}]);expect(db.calls).toHaveLength(0);
});
it('L02 original requires listCollections even if the older generic gate accepted the role/action summary',async()=>{
  const {db}=setup();db.status.authInfo.authenticatedUserPrivileges[0].actions=
    db.status.authInfo.authenticatedUserPrivileges[0].actions.filter(a=>a!=='listCollections');
  expect(()=>verifyAtlasPermissions(db.status)).not.toThrow();
  await expect(db.preflight()).rejects.toMatchObject({code:'atlas_permissions_unverified'});
  expect(db.connection.db.listCollections).not.toHaveBeenCalled();
});
it('L03 alternative passes BOTH authorization/name options and queries only four exact names',async()=>{
  const {db}=setup();await db.preflight('exact-authorized');
  expect(db.connection.db.listCollections.mock.calls).toEqual(Object.values(atlasCollections(db.config)).map(name=>[{name},{nameOnly:true,authorizedCollections:true}]));
});
it('L04 database-wide find preserves alternative completeness without listCollections',async()=>{
  const {db}=setup();db.status.authInfo.authenticatedUserPrivileges[0].actions=
    db.status.authInfo.authenticatedUserPrivileges[0].actions.filter(a=>a!=='listCollections');
  await expect(db.preflight('exact-authorized')).resolves.toMatchObject({verified:true});
});
it('L05 collection-limited permissions cannot turn a hidden existing collection into verified absence',async()=>{
  for(const strategy of ['original','exact-authorized']){
    const {db}=setup();db.status.authInfo.authenticatedUserPrivileges[0].resource.collection=Object.values(atlasCollections(db.config))[0];
    await expect(db.preflight(strategy)).rejects.toMatchObject({code:'atlas_permissions_unverified'});
    expect(db.connection.db.listCollections).not.toHaveBeenCalled();
  }
});
it('L06 insufficient effective actions reject despite an expected readWrite role',async()=>{
  const {db}=setup();db.status.authInfo.authenticatedUserPrivileges[0].actions=['listCollections'];
  await expect(db.preflight()).rejects.toThrow();expect(db.connection.db.listCollections).not.toHaveBeenCalled();
});
it('L07 invalid target/configuration/strategy fails before metadata or enumeration',async()=>{
  for(const changes of [{database:'two_sides_db'},{user:'twosides_backend'},{host:'other.mongodb.net'},{tls:false},{authorized:false},{authMechanism:'SCRAM-SHA-256'}]){
    const {db}=setup();db.config={...db.config,...changes};await expect(db.preflight()).rejects.toThrow();
    expect(db.commands).toHaveLength(0);expect(db.connection.db.listCollections).not.toHaveBeenCalled();
  }
  const {db}=setup();await expect(db.preflight('arbitrary')).rejects.toThrow();expect(db.commands).toHaveLength(0);
});
it('L08 actual connection pointing to another database is rejected without enumerating it',async()=>{
  const {db}=setup();db.connection.db.databaseName='two_sides_db';await expect(db.preflight()).rejects.toThrow();
  expect(db.commands).toHaveLength(0);expect(db.connection.db.listCollections).not.toHaveBeenCalled();
});
it('L09 actual wrong user, authSource, host or unsafe TLS are rejected before metadata',async()=>{
  for(const mutate of [o=>{o.credentials.username='other';},o=>{o.credentials.source='other';},o=>{o.srvHost='other.mongodb.net';},
    o=>{o.tls=false;},o=>{o.tlsAllowInvalidCertificates=true;},o=>{o.tlsAllowInvalidHostnames=true;},o=>{o.rejectUnauthorized=false;}]){
    const {db,o}=setup();mutate(o);await expect(db.preflight()).rejects.toThrow();
    expect(db.commands).toHaveLength(0);expect(db.connection.db.listCollections).not.toHaveBeenCalled();
  }
});
it('L10 server error 8000 stops enumeration and remains unknown without an authentication signature',async()=>{
  const {db}=setup(),error=Object.assign(new Error('synthetic private detail'),{name:'MongoServerError',code:8000,codeName:'AtlasError'});
  db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>{throw error;}}));
  await expect(db.preflight('exact-authorized')).rejects.toBe(error);expect(db.connection.db.listCollections).toHaveBeenCalledTimes(1);
  const d=classifyAtlasError(error,{stage:'diagnostic'});expect(d.category).toBe('UNKNOWN_CONNECTION_FAILURE');expect(d.code).toBe(8000);
  expect(JSON.stringify(d)).not.toContain('synthetic private detail');expect(db.calls).toHaveLength(0);
});
it('L11 existing collection/view prevents absence for either strategy; never skip it',async()=>{
  for(const strategy of ['original','exact-authorized'])for(const type of ['collection','view']){
    const {db}=setup();db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>[{name:Object.values(atlasCollections(db.config))[0],type}]}));
    await expect(db.preflight(strategy)).rejects.toMatchObject({code:'atlas_namespaces_not_empty'});
    expect(db.connection.db.listCollections).toHaveBeenCalledTimes(1);expect(db.calls).toHaveLength(0);
  }
});
it('L12 non-array or unexpected returned namespace is rejected without writes or document inspection',async()=>{
  for(const rows of [null,{},[{name:'foreign_namespace',type:'collection'}]]){
    const {db}=setup();db.connection.db.listCollections.mockImplementation(()=>({toArray:async()=>rows}));
    await expect(db.preflight()).rejects.toThrow();expect(db.calls).toHaveLength(0);
  }
});
it('L13 installed native driver builds the original and alternative commands with unchanged flags, offline',()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Offline only');});
  const client=new MongoClient(ATLAS_URI),nativeDb=client.db(ATLAS_TARGET.database),{db}=setup();
  for(const strategy of ['original','exact-authorized'])for(const {filter,options}of atlasNamespaceQueries(db.config,strategy)){
    const cursor=nativeDb.listCollections(filter,options);
    const operation=new ListCollectionsOperation(cursor.parent,cursor.filter,cursor.options),command=operation.buildCommandDocument();
    expect(operation.db.databaseName).toBe('two_sides_integration_test');
    expect(command).toMatchObject({listCollections:1,filter,nameOnly:true,authorizedCollections:strategy==='exact-authorized'});
    expect(command).not.toHaveProperty('writeConcern');
  }
  expect(socket).not.toHaveBeenCalled();
});
it('L14 metadata authorization failure prevents enumeration and any write',async()=>{
  const {db}=setup();db.connection.db.command=vi.fn(async()=>{throw Object.assign(new Error('private'),{code:13});});
  await expect(db.preflight()).rejects.toMatchObject({code:13});expect(db.connection.db.listCollections).not.toHaveBeenCalled();expect(db.calls).toHaveLength(0);
});
