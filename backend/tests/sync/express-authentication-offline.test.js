import './support/isolation-guard.js';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import net from 'node:net';
import dns from 'node:dns';
import mongoose from 'mongoose';
import {openIntegrationProfile,integrationConnector,INTEGRATION_ACTIVATION} from '../../src/integration/profile.js';
import {temporaryAtlasCredential,receiveAtlasCredential} from '../../src/modules/sync/atlas-credentials.js';
import {PassThrough} from 'node:stream';

beforeEach(()=>{
  vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw Error('Offline network boundary');});
  vi.spyOn(dns,'lookup').mockImplementation(()=>{throw Error('Offline DNS boundary');});
  vi.spyOn(dns.promises,'resolveSrv').mockImplementation(async()=>{throw Error('Offline SRV boundary');});
});
afterEach(()=>vi.restoreAllMocks());
const open=credential=>openIntegrationProfile({activation:INTEGRATION_ACTIVATION,credential,connector:integrationConnector(mongoose)});
it('EA01 the actual Mongoose/driver parser preserves fictitious passwords and fixed SCRAM options without connecting',async()=>{
  const samples=['FAKE-ASCII-01','FAKE @:/?#[]%+$`\\\" end','  FAKE padded  ','FAKE-ñ-密-😀','\uFEFFFAKE-e\u0301'];
  const seen=[],optionsSeen=[];
  const connect=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockImplementation(async function(){
    const o=this.options;
    seen.push(o.credentials.password);optionsSeen.push(o);
    throw Object.assign(new Error('Offline simulated authentication rejection'),{name:'MongoServerError',code:18,codeName:'AuthenticationFailed'});
  });
  for(const sample of samples)await expect(open(temporaryAtlasCredential(Buffer.from(sample,'utf8')))).rejects.toMatchObject({code:'atlas_authentication_failed',diagnostic:{stage:'mongoose-connect',category:'AUTHENTICATION_FAILURE'}});
  for(const o of optionsSeen){
    expect(o.srvHost).toBe('twosidescluster.fxqeo8o.mongodb.net');expect(o.dbName).toBe('two_sides_integration_test');
    expect(o.credentials).toMatchObject({username:'twosides_integration_test',source:'admin',mechanism:'SCRAM-SHA-256'});
    expect(o.tls).toBe(true);expect(o.rejectUnauthorized).toBe(true);expect(o.checkServerIdentity).toBeUndefined();
  }
  expect(seen).toEqual(samples);expect(connect).toHaveBeenCalledTimes(samples.length);
  expect(net.Socket.prototype.connect).not.toHaveBeenCalled();expect(dns.lookup).not.toHaveBeenCalled();expect(dns.promises.resolveSrv).not.toHaveBeenCalled();
});
it('EA02 each new stdin frame supplies a fresh fictitious credential, not a cached prior password',async()=>{
  const seen=[];
  vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockImplementation(async function(){seen.push(this.options.credentials.password);throw Error('Offline boundary');});
  for(const text of ['FAKE-PREVIOUS-ONLY','FAKE-UPDATED-ONLY']){
    const stream=new PassThrough(),body=Buffer.from(text),frame=Buffer.alloc(body.length+4);frame.writeUInt32BE(body.length);body.copy(frame,4);
    const received=receiveAtlasCredential(stream);stream.end(frame);
    await expect(open(await received)).rejects.toMatchObject({name:'AtlasIntegrationError'});
  }
  expect(seen).toEqual(['FAKE-PREVIOUS-ONLY','FAKE-UPDATED-ONLY']);expect(net.Socket.prototype.connect).not.toHaveBeenCalled();
});
