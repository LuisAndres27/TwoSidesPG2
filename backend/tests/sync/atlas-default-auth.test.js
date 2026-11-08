import './support/isolation-guard.js';
import { afterEach,expect,it,vi } from 'vitest';
import mongoose from 'mongoose';
import net from 'node:net';
import { mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atlasConfig,atlasDouble,credential } from './support/atlas-double.js';
import { validateAtlasConfig } from '../../src/modules/sync/atlas-policy.js';
import { openAtlasIntegration } from '../../src/modules/sync/atlas-integration.js';
import { diagnosticReadonlyConnector } from '../../src/modules/sync/atlas-readonly-connector.js';
import { probeAtlasReadonly } from '../../src/modules/sync/atlas-readonly-probe.js';

afterEach(()=>vi.restoreAllMocks());
it('N01 existing integrations retain explicit SHA-256 unless DEFAULT is requested',()=>{
  expect(validateAtlasConfig(atlasConfig()).authMechanism).toBe('SCRAM-SHA-256');
  expect(validateAtlasConfig(atlasConfig({authMechanism:'DEFAULT'})).authMechanism).toBe('DEFAULT');
});
it('N02 DEFAULT cannot authorize writes or arbitrary mechanisms/options',()=>{
  for(const changes of [{authMechanism:'DEFAULT',allowWrites:true},{authMechanism:'SCRAM-SHA-1'},
    {authMechanism:'DEFAULT',authSource:'other'},{authMechanism:'DEFAULT',tls:false},
    {authMechanism:'DEFAULT',tlsAllowInvalidCertificates:true}])expect(()=>validateAtlasConfig(atlasConfig(changes))).toThrow();
});
it('N03 actual Mongoose passes DEFAULT with strict normalized TLS and identical identity before intercepted connect',async()=>{
  const socket=vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Network forbidden');});
  let inspected=false;
  const connect=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockImplementation(async function(){
    const o=this.options,c=o.credentials;
    expect(c.username).toBe('twosides_integration_test');expect(c.source).toBe('admin');expect(c.mechanism).toBe('DEFAULT');
    expect(o.dbName).toBe('two_sides_integration_test');expect(o.srvHost).toBe('twosidescluster.fxqeo8o.mongodb.net');
    expect(o.tls).toBe(true);expect(o.rejectUnauthorized).toBe(true);expect(o.checkServerIdentity).toBeUndefined();
    expect(o.monitorCommands).toBe(false);expect(o.serverSelectionTimeoutMS).toBe(10000);
    expect(c.resolveAuthMechanism({saslSupportedMechs:['SCRAM-SHA-1','SCRAM-SHA-256']}).mechanism).toBe('SCRAM-SHA-256');
    expect(c.resolveAuthMechanism({saslSupportedMechs:['SCRAM-SHA-1']}).mechanism).toBe('SCRAM-SHA-1');
    inspected=true;throw new Error('Offline boundary');
  });
  await expect(openAtlasIntegration({config:atlasConfig({authMechanism:'DEFAULT'}),credential:credential(),
    connector:diagnosticReadonlyConnector(mongoose)})).rejects.toMatchObject({code:'atlas_connection_unavailable'});
  expect(inspected).toBe(true);expect(connect).toHaveBeenCalledTimes(1);expect(socket).not.toHaveBeenCalled();
});
function defaultDouble(){
  const db=atlasDouble(atlasConfig({authMechanism:'DEFAULT'})),options=db.connection.getClient().options;
  options.credentials.mechanism='DEFAULT';db.connection.getClient=()=>({options});return {db,options};
}
it('N04 DEFAULT still verifies permissions and denies repository creation without models/writes',async()=>{
  const {db}=defaultDouble(),models=vi.fn();
  const h=await db.open({modelFactory:models});
  try{expect(h.permissions.user).toBe('twosides_integration_test');expect(()=>h.createRepository()).toThrow();
    expect(models).not.toHaveBeenCalled();expect(db.calls).toHaveLength(0);
  }finally{await h.close();}
});
it('N05 wrong identity, source, mechanism and normalized TLS bypasses remain rejected',async()=>{
  for(const mutate of [o=>{o.credentials.username='twosides_backend';},o=>{o.credentials.source='other';},
    o=>{o.credentials.mechanism='SCRAM-SHA-1';},o=>{o.tlsAllowInvalidCertificates=true;},
    o=>{o.tlsAllowInvalidHostnames=true;},o=>{o.rejectUnauthorized=false;},o=>{o.checkServerIdentity=()=>{};}]){
    const {db,options}=defaultDouble();mutate(options);
    await expect(db.open()).rejects.toMatchObject({code:'atlas_configuration_rejected'});
    expect(db.commands).toHaveLength(0);expect(db.closed).toBe(true);
  }
});
it('N06 DEFAULT with writes is rejected before invoking the connector',async()=>{
  const connector=vi.fn();await expect(openAtlasIntegration({config:atlasConfig({authMechanism:'DEFAULT',allowWrites:true}),
    credential:credential(),connector})).rejects.toThrow();expect(connector).not.toHaveBeenCalled();
});
it('N07 readonly result records requested DEFAULT without claiming a negotiated mechanism',async()=>{
  const {db}=defaultDouble(),original=db.connection.db.command;
  db.connection.db.command=async c=>c.connectionStatus?original(c):c.hello?
    {ok:1,setName:'synthetic-rs',isWritablePrimary:true}:{ok:1,version:'8.0.1'};
  const result=await probeAtlasReadonly({config:db.config,credential:credential(),connector:db.connector});
  expect(result.status).toBe('completed');expect(result.authenticationMechanismRequested).toBe('DEFAULT');
  expect(result).not.toHaveProperty('authenticationMechanismNegotiated');
  expect(result.remoteDocumentWrites).toBe(0);expect(result.transactionsExecuted).toBe(0);expect(result.closed).toBe(true);
});
it('N08 receiver rejects an old manifest or consumed marker before loading a connector or credential',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'two-sides-receiver-offline-'));
  try{
    for(const consumed of [false,true]){
      const directory=path.join(root,'b054c2c-'+(consumed?'b':'a').repeat(32));mkdirSync(directory);
      const receiver=path.join(directory,'atlas-readonly-receiver.js');
      copyFileSync(path.resolve('scripts/atlas-readonly-receiver.js'),receiver);
      writeFileSync(path.join(directory,'preflight-manifest.json'),JSON.stringify({Phase:'B05.4C.2D.1B'}));
      if(consumed)writeFileSync(path.join(directory,'readonly-attempt.started'),'');
      const run=()=>spawnSync(process.execPath,[receiver],{cwd:directory,input:'',encoding:'utf8',timeout:5000,windowsHide:true});
      const first=run();expect(first.status).toBe(1);expect(first.stdout.length+first.stderr.length).toBe(0);
      expect(existsSync(path.join(directory,'readonly-attempt.started'))).toBe(true);
      const result=path.join(directory,'readonly-result.json');
      if(consumed){expect(existsSync(result)).toBe(false);}
      else{
        const before=readFileSync(result,'utf8'),second=run();expect(second.status).toBe(1);
        expect(readFileSync(result,'utf8')===before).toBe(true);
      }
    }
  }finally{
    const resolved=path.resolve(root);
    if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('two-sides-receiver-offline-'))throw new Error('Unexpected cleanup target');
    rmSync(resolved,{recursive:true,force:true});
  }
});
