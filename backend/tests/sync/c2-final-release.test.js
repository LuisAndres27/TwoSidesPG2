import './support/isolation-guard.js';
import { writeConsumption } from './support/c2-consumption.js';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {mongoDouble} from './support/mongo-double.js';
import {permissionResult} from './support/atlas-double.js';
import {temporaryAtlasCredential} from '../../src/modules/sync/atlas-credentials.js';
import {ATLAS_SCHEMA_RUN} from '../../src/modules/sync/atlas-policy.js';
import {assertReleaseLayout,payloadDigest,receiverConfig,RECEIVER_TARGET,runReceiver} from '../../scripts/c2-receiver-core.js';
import {openC2Integration,runC2Integration,nativeC2Connection} from '../../scripts/c2-release-integration.js';

const handles=[],directories=[];
beforeEach(()=>{vi.spyOn(net.Socket.prototype,'connect').mockImplementation(()=>{throw new Error('Network prohibited');});});
afterEach(async()=>{for(const h of handles.splice(0))await h.close().catch(()=>{});for(const d of directories.splice(0)){
  if(!process.env.C2_FINAL_TEST_ROOT||!path.resolve(d).startsWith(path.resolve(process.env.C2_FINAL_TEST_ROOT)+path.sep))throw new Error('Out of scope fixture');
  fs.rmSync(d,{recursive:true,force:true});}vi.restoreAllMocks();});
const fake='FAKE-FINAL-RELEASE-CREDENTIAL';
function activation(){const runId=randomUUID().replaceAll('-',''),digest='A'.repeat(64),now=Date.now();return{
  manifest:{version:2,mode:'c2-remote-once',remoteEnabled:true,releaseId:'c2-'+'b'.repeat(32),files:[],payloadSha256:payloadDigest([]),target:{...RECEIVER_TARGET},activation:{executionId:runId,
    runId:ATLAS_SCHEMA_RUN,scenarios:['A','B','C'],createdAtUtc:new Date(now-1000).toISOString(),expiresAtUtc:new Date(now+60000).toISOString()}},
  context:{runId,releaseId:'c2-'+'b'.repeat(32),manifestSha256:digest,expectedManifestSha256:digest,now}};}
const credential=()=>temporaryAtlasCredential(Buffer.from(fake));
function connector(db){return vi.fn(async(_uri,options)=>{
  const connection={name:RECEIVER_TARGET.database,readyState:1,models:{},db:{databaseName:RECEIVER_TARGET.database,
    command:async c=>c.connectionStatus?{...permissionResult(),authInfo:{...permissionResult().authInfo,authenticatedUserPrivileges:[{resource:{db:RECEIVER_TARGET.database,collection:''},actions:[...permissionResult().authInfo.authenticatedUserPrivileges[0].actions,'listCollections']}]}}:
      {ok:1,cursor:{id:0,firstBatch:[...['ops','facts','fence','authorization'].map(s=>'b054c2c_0e803b0278594116a83894c04fb10c53_'+s),...['ops','facts','fence','authorization','identities','ownerGuards','identitySessions','revocations'].map(s=>'b054c2c_'+ATLAS_SCHEMA_RUN+'_'+s)].map(name=>({name}))}},
    admin:()=>({command:async()=>({setName:'synthetic',isWritablePrimary:true})})},
    startSession:db.connection.startSession,async close(){this.readyState=0;},model(name,schema,collection){
      const suffix=collection.slice(('b054c2c_'+ATLAS_SCHEMA_RUN+'_').length),key=({ops:'operations',fence:'fences'})[suffix]??suffix;
      const model={...db.models[key],db:this,schema,collection:{name:collection,conn:this,indexes:async()=>[{name:'_id_',key:{_id:1}},...schema.indexes().map(([key,o])=>({key,...o}))]}};
      this.models[name]=model;return model;
    }};
  const client={options:{...options,srvHost:RECEIVER_TARGET.host,credentials:{username:RECEIVER_TARGET.user,source:'admin',mechanism:'DEFAULT'}}};connection.getClient=()=>client;
  return connection;
});}
it('FR01 the native Mongoose parser uses supervised options but the native connect boundary is intercepted offline',async()=>{
  const connect=vi.spyOn(mongoose.mongo.MongoClient.prototype,'connect').mockRejectedValue(new Error('Offline boundary'));
  const {durableClientOptions}=await import('../../scripts/durable-revocation-runtime.js');
  await expect(nativeC2Connection('mongodb+srv://twosidescluster.fxqeo8o.mongodb.net/two_sides_integration_test',durableClientOptions,new AbortController().signal)).rejects.toMatchObject({code:'CONNECTION_REJECTED'});
  expect(connect).toHaveBeenCalledTimes(1);expect(net.Socket.prototype.connect).not.toHaveBeenCalled();
});
it('FR02 no activation means no connection; an offline manifest cannot be used as a permit',async()=>{
  const create=vi.fn();await expect(openC2Integration({config:receiverConfig(),credential:credential(),createConnection:create})).rejects.toThrow();
  const a=activation();a.manifest.remoteEnabled=false;
  await expect(openC2Integration({config:receiverConfig(),credential:credential(),activation:a,createConnection:create})).rejects.toThrow();expect(create).not.toHaveBeenCalled();
});
it('FR03 the composed real repositories run A/B/C, reopen, preserve the fence and clean exact owned data with injected Mongo only',async()=>{
  const db=mongoDouble(),create=connector(db),record=vi.fn(),a=activation();
  const h=await openC2Integration({config:receiverConfig(),credential:credential(),activation:a,createConnection:create,recordPlan:record});handles.push(h);
  const result=await runC2Integration(h);expect(result.completed).toBe(true);expect(result.remoteGuaranteeValidated).toBe(false);
  expect(result.cleanup.documentsDeleted).toBe(16);expect(result.resources).toMatchObject({closed:true,uncertain:false,activeSessions:0,pendingWrites:0});
  expect(create).toHaveBeenCalledTimes(3);expect(record).toHaveBeenCalledTimes(1);expect(record.mock.calls[0][0].executionId).toBe(a.context.runId);
  expect(JSON.stringify(record.mock.calls)).not.toContain(fake);expect(JSON.stringify(h)).toBe('{}');expect(db.rows.fences).toHaveLength(1);
  expect(Object.entries(db.rows).filter(([k])=>k!=='fences').every(([,v])=>v.length===0)).toBe(true);
  await expect(runC2Integration(h)).rejects.toMatchObject({code:'REUSE_REJECTED'});
});
it('FR04 unexpected initial state stops before registration and never resets or deletes the existing fence',async()=>{
  const db=mongoDouble();db.rows.fences[0].revision=1;const h=await openC2Integration({config:receiverConfig(),credential:credential(),activation:activation(),createConnection:connector(db)});handles.push(h);
  await expect(runC2Integration(h)).rejects.toThrow();expect(db.rows.identities).toHaveLength(0);expect(db.rows.fences[0].revision).toBe(1);
  expect(db.calls.some(c=>c.kind==='write'||c.kind==='delete')).toBe(false);
});
it('FR05 the child requires its exact empty temp and rejects cache/support residue outside the payload',()=>{
  const root=process.env.C2_FINAL_TEST_ROOT;if(!root)throw new Error('Explicit disposable root required');
  const release=fs.mkdtempSync(path.join(root,'c2-layout-'));directories.push(release);const pkg=path.join(release,'package');
  const runId='a'.repeat(32),temp=path.join(release,'runs',runId,'temp');
  fs.mkdirSync(pkg);fs.mkdirSync(path.join(release,'temp'));fs.mkdirSync(temp,{recursive:true});fs.writeFileSync(path.join(release,'manifest.json'),'{}');
  const check=env=>assertReleaseLayout(pkg,env,fs,runId);
  expect(()=>check({TEMP:temp})).not.toThrow();expect(()=>check({TEMP:root})).toThrow();
  expect(()=>check({TEMP:path.join(release,'temp')})).toThrow();
  fs.writeFileSync(path.join(temp,'residue'),'');expect(()=>check({TEMP:temp})).toThrow();fs.unlinkSync(path.join(temp,'residue'));
  fs.mkdirSync(path.join(release,'support'));expect(()=>check({TEMP:temp})).toThrow();
});
it('FR06 the existing receiver composes the final integration and persists only safe scenario evidence',async()=>{
  const base=process.env.C2_FINAL_TEST_ROOT;if(!base)throw new Error('Explicit disposable root required');
  const release=path.join(base,'c2-'+randomUUID().replaceAll('-',''));directories.push(release);fs.mkdirSync(release);
  for(const n of ['package','temp','runs'])fs.mkdirSync(path.join(release,n));
  const a=activation(),runId=a.context.runId,dir=path.join(release,'runs',runId);fs.mkdirSync(path.join(dir,'temp'),{recursive:true});
  a.manifest.releaseId=path.basename(release);a.context.releaseId=a.manifest.releaseId;
  const text=JSON.stringify(a.manifest),digest=createHash('sha256').update(text).digest('hex').toUpperCase();
  fs.writeFileSync(path.join(release,'manifest.json'),text);a.context.manifestSha256=digest;a.context.expectedManifestSha256=digest;directories.push(writeConsumption(release,runId,digest));
  const stdin=new PassThrough(),body=Buffer.from(fake),frame=Buffer.alloc(body.length+4);frame.writeUInt32BE(body.length);body.copy(frame,4);stdin.end(frame);
  const env={LOCALAPPDATA:process.env.LOCALAPPDATA,NODE_ENV:'test',PATH:'C:\\Windows\\System32',SystemDrive:'C:',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',TEMP:path.join(dir,'temp'),TMP:path.join(dir,'temp')};
  const db=mongoDouble();const result=await runReceiver({args:{runId,result:path.join(dir,'result.json'),manifestSha256:digest},env,
    manifest:a.manifest,manifestSha256:digest,packageRoot:path.join(release,'package'),stdin,
    openIntegration:async options=>{const h=await openC2Integration({...options,activation:a,createConnection:connector(db)});handles.push(h);return h;},execute:runC2Integration});
  expect(result).toMatchObject({status:'passed',cleanup:'done',uncertain:false,resourcesClosed:true,evidence:{revocationFirst:true,noNewReceipt:true,historicalReceiptPreserved:true,receiptRecovered:true,foreignBindingRejected:true,revokedTokenRejected:true,persistedReceipt:true,cleanedDocuments:16}});
  expect(result.evidence.operationRevision).toBeLessThan(result.evidence.revocationRevision);expect(JSON.stringify(result)).not.toContain(fake);
});
