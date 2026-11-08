import './support/isolation-guard.js';
import {expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {restrictedStatus} from './support/restricted-status.js';
import {verifyMainPermissions,MAIN_CONFIG,MAIN_TARGET} from '../../src/main/policy.js';
import {openMainProfile,MAIN_ACTIVATION} from '../../src/main/profile.js';
import {temporaryAtlasCredential} from '../../src/modules/sync/atlas-credentials.js';
import {integrationDouble} from './support/integration-double.js';
import {verifyRuntimeIntegrity} from '../../src/main/runtime-integrity.js';
const clone=structuredClone;
function fixture(){
 const d=integrationDouble(),c=d.connection;c.name=MAIN_TARGET.database;c.db.databaseName=MAIN_TARGET.database;
 d.clientOptions={srvHost:MAIN_TARGET.host,dbName:MAIN_TARGET.database,directConnection:false,tls:true,credentials:{username:MAIN_TARGET.user,source:'admin',mechanism:MAIN_CONFIG.authMechanism}};
 d.status=restrictedStatus();d.remote=new Set(['operations','facts','fences','identities','ownerGuards','identitySessions','revocations'].map(k=>'main_v2_'+k));
 for(const m of Object.values(d.models)){const indexes=m.collection.indexes;m.collection.indexes=async()=>[{name:'_id_',key:{_id:1}},...await indexes()];}
 d.connector=async()=>{d.connects++;return c;};return d;
}
const open=d=>openMainProfile({activation:MAIN_ACTIVATION,credential:temporaryAtlasCredential(Buffer.from('FAKE-B60-NOT-A-SECRET')),connector:d.connector});
it('LP01 exact minimum effective matrix accepted; split, reordered and repeated entries normalized as a union',()=>{
 const r=restrictedStatus();expect(verifyMainPermissions(r)).toMatchObject({user:'twosides_backend_v2',role:'two_sides_main_runtime_v1'});
 r.authInfo.authenticatedUserPrivileges=r.authInfo.authenticatedUserPrivileges.flatMap(p=>p.actions.map(a=>({resource:clone(p.resource),actions:[a]}))).reverse();
 r.authInfo.authenticatedUserPrivileges.push(clone(r.authInfo.authenticatedUserPrivileges[0]));expect(()=>verifyMainPermissions(r)).not.toThrow();
});
it('LP02 every missing action on every resource is refused (including metadata and unused-index collections)',()=>{
 const r=restrictedStatus();for(let i=0;i<r.authInfo.authenticatedUserPrivileges.length;i++)for(const action of r.authInfo.authenticatedUserPrivileges[i].actions){const f=clone(r);f.authInfo.authenticatedUserPrivileges[i].actions=f.authInfo.authenticatedUserPrivileges[i].actions.filter(a=>a!==action);expect(()=>verifyMainPermissions(f)).toThrow();}
});
it('LP03 grants beyond the matrix never substitute for minimum permissions',()=>{
 for(const action of ['remove','createCollection','createIndex','dropCollection','dropIndex','dropDatabase','bypassDocumentValidation','collStats','killAnySession','anyAction']){const r=restrictedStatus();r.authInfo.authenticatedUserPrivileges[1].actions.push(action);expect(()=>verifyMainPermissions(r),action).toThrow();}
 for(const resource of [{db:'two_sides_db',collection:'users'},{db:'two_sides_db',collection:'main_v2_authorization'},{db:'two_sides_db',collection:'*'},{db:'two_sides_db',collection:''},{db:'two_sides_integration_test',collection:'main_v2_facts'},{anyResource:true},{cluster:true}]){const r=restrictedStatus();r.authInfo.authenticatedUserPrivileges.push({resource,actions:['find']});expect(()=>verifyMainPermissions(r)).toThrow();}
});
it('LP04 identities, role names/namespaces, broad inherited roles and malformed results fail closed',()=>{
 for(const change of [r=>r.authInfo.authenticatedUsers[0].user='twosides_backend',r=>r.authInfo.authenticatedUsers.push({user:'another',db:'admin'}),r=>r.authInfo.authenticatedUserRoles[0].role='readWrite',r=>r.authInfo.authenticatedUserRoles[0].db='two_sides_db',r=>r.authInfo.authenticatedUserRoles.push({role:'readWriteAnyDatabase',db:'admin'}),r=>r.authInfo.authenticatedUserPrivileges[1].resource.anyResource=true,r=>r.authInfo.authenticatedUserPrivileges=[]]){const r=restrictedStatus();change(r);expect(()=>verifyMainPermissions(r)).toThrow();}
 for(const r of [null,{}, {ok:0}, {ok:1,authInfo:null}])expect(()=>verifyMainPermissions(r)).toThrow();
 for(const field of ['authenticatedUsers','authenticatedUserRoles']){const r=restrictedStatus();r.authInfo[field]={0:r.authInfo[field][0],length:1};expect(()=>verifyMainPermissions(r)).toThrow();}
});
it('LP05 minimum-role startup checks schema and warm-up, performs no DDL, and closes once',async()=>{
 const d=fixture(),b=await open(d);expect(b.permissions.role).toBe('two_sides_main_runtime_v1');expect(d.created).toEqual([]);expect(d.indexed).toEqual([]);
 expect(d.rows.operations).toHaveLength(0);expect(d.rows.identities).toHaveLength(0);await b.close();await b.close();expect(d.closed).toBe(1);
});
it('LP06 failed privileges, missing collections/indexes/seed and incompatible indexes close before writes',async()=>{
 for(const change of [d=>d.status.authInfo.authenticatedUserPrivileges.pop(),d=>d.remote.delete('main_v2_facts'),d=>d.rows.fences=[],d=>d.models.operations.collection.indexes=async()=>[{name:'_id_',key:{_id:1}}],d=>d.models.facts.collection.indexes=async()=>[{name:'_id_',key:{_id:1}},{name:'scope_source_unique',key:{scope:1,sourceKey:1},unique:true,sparse:true}]]){
  const d=fixture();change(d);await expect(open(d)).rejects.toThrow();expect(d.closed).toBe(1);expect(d.created).toEqual([]);expect(d.indexed).toEqual([]);expect(d.rows.operations).toHaveLength(0);
 }
});
it('LP07 runtime entry requires complete integrity anchors before any key/credential/connection access',async()=>{
 for(const env of [{},{MAIN_INTEGRITY_MANIFEST:'C:\\fake',MAIN_INTEGRITY_ANCHOR:'a'.repeat(64)},{MAIN_INTEGRITY_MANIFEST:'C:\\fake',MAIN_INTEGRITY_ANCHOR:'invalid',MAIN_KEY_FINGERPRINT:'b'.repeat(64),MAIN_EXPECTED_KEY_ID:'x'}])await expect(verifyRuntimeIntegrity({keyFile:'NOT-READ',keyId:'x'},env)).rejects.toMatchObject({code:'main_integrity_required'});
});
it('LP08 old manifest cannot validate the edited tree; verification is read-only and no v5 is issued',async()=>{
 const {verifyManifestFile}=await import('../../scripts/backend-integrity.js');
 const file=process.env.LOCALAPPDATA+'\\TwoSidesMainIntegrity\\backend-integrity-manifest.json';
 const before=fs.readFileSync(file);expect(verifyManifestFile(file)).toMatchObject({ok:false,reason:'tree_differs'});expect(fs.readFileSync(file)).toEqual(before);
});
it('LP09 complete but invalid runtime anchors/key are rejected with a fixed error',async()=>{
 const env={MAIN_INTEGRITY_MANIFEST:'C:\\fictitious-b60\\manifest.json',MAIN_INTEGRITY_ANCHOR:'a'.repeat(64),MAIN_KEY_FINGERPRINT:'b'.repeat(64),MAIN_EXPECTED_KEY_ID:'fake-key'};
 await expect(verifyRuntimeIntegrity({keyFile:'C:\\fictitious-b60\\key.pem',keyId:'fake-key'},env)).rejects.toMatchObject({code:'main_integrity_rejected'});
});
it('LP10 invoking node directly cannot omit integrity, read the synthetic stdin secret or connect',()=>{
 const r=spawnSync(process.execPath,['src/server.js'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),input:'FAKE-CREDENTIAL-NOT-CONSUMED',encoding:'utf8',timeout:20000,
  env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,NODE_ENV:'production',TWOSIDES_PROFILE:'main',MAIN_ENABLE:'true',MAIN_JWT_PRIVATE_KEY_FILE:'C:\\fake-b60.pem',MAIN_JWT_KEY_ID:'fake'}});
 expect(r.status).toBe(1);expect(r.stderr).toContain('main_integrity_required');expect(r.stdout+r.stderr).not.toMatch(/FAKE-CREDENTIAL|listening|BEGIN|PRIVATE/);
});
it('LP11 PowerShell cannot omit integrity before its password prompt (fictitious file, no live key)',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b60-wrapper-')),key=path.join(dir,'fake.pem');
 try{
  fs.writeFileSync(key,'FAKE-NOT-A-KEY');
  const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File','scripts/run-main-backend.ps1','-EnableMain','-SigningKeyFile',key,'-KeyId','fake'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8',timeout:20000});
  expect(r.status).toBe(1);expect(r.stdout+r.stderr).toMatch(/Integrity guard failed/);expect(r.stdout+r.stderr).not.toMatch(/Main database password|FAKE-NOT-A-KEY|listening/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
