import { openAtlasIntegration } from './atlas-integration.js';
import { ATLAS_TARGET,AtlasIntegrationError,validateAtlasConfig } from './atlas-policy.js';
import { destroyAtlasCredential } from './atlas-credentials.js';

const safeCodes=new Set(['atlas_configuration_rejected','atlas_credential_required','atlas_connector_required',
  'atlas_authentication_failed','atlas_connection_unavailable','atlas_permissions_unverified','atlas_close_failed','atlas_client_configuration_rejected']);
// No model factory, collection access, session, transaction or writing repository in this probe.
export async function probeAtlasReadonly({config,credential,connector}={}){
  const result={schemaVersion:1,phase:'B05.4C.2D.1',status:'blocked',target:{...ATLAS_TARGET},
    connection:'not-attempted',authentication:'not-verified',destination:'not-verified',permissions:null,
    ping:'not-attempted',topology:null,serverVersion:null,versionObservation:'not-attempted',
    closed:false,errorCode:null,remoteDocumentWrites:0,transactionsExecuted:0};
  let connection,handle;
  try{
    const c=validateAtlasConfig(config);
    result.authenticationMechanismRequested=c.authMechanism;
    if(c.allowWrites!==false)throw new AtlasIntegrationError();
    if(typeof connector!=='function')throw new AtlasIntegrationError('atlas_connector_required');
    handle=await openAtlasIntegration({config:c,credential,connector:async(uri,options)=>{
      result.connection='attempted';
      connection=await connector(uri,options);
      result.connection='established';result.authentication='accepted-by-driver';return connection;
    }});
    result.destination='verified';result.permissions=handle.permissions;result.status='partial';
    const ping=await connection.db.command({ping:1,maxTimeMS:2000});
    if(ping.ok!==1)throw new Error();result.ping='ok';
    const hello=await connection.db.command({hello:1,maxTimeMS:2000});
    if(hello.ok!==1 || typeof hello.setName!=='string' || hello.isWritablePrimary!==true)throw new Error();
    result.topology={kind:'replica-set',primary:true,
      membersObserved:Array.isArray(hello.hosts)?hello.hosts.length:null,
      logicalSessionTimeoutMinutes:Number.isSafeInteger(hello.logicalSessionTimeoutMinutes)?hello.logicalSessionTimeoutMinutes:null,
      maxWireVersion:Number.isSafeInteger(hello.maxWireVersion)?hello.maxWireVersion:null};
    try{
      const build=await connection.db.command({buildInfo:1,maxTimeMS:2000});
      if(build.ok===1 && typeof build.version==='string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:[-+][A-Za-z0-9.-]{1,32})?$/.test(build.version)){
        result.serverVersion=build.version;result.versionObservation='observed';
      }else result.versionObservation='unavailable';
    }catch{result.versionObservation='unavailable';}
    result.status='completed';
  }catch(error){
    if(result.connection==='established')result.status='partial';
    result.errorCode=error instanceof AtlasIntegrationError&&safeCodes.has(error.code)?error.code:'atlas_diagnostic_unavailable';
    if(result.errorCode==='atlas_authentication_failed')result.authentication='failed';
  }finally{
    destroyAtlasCredential(credential);
    if(handle){try{await handle.close();result.closed=true;}catch{result.status='partial';result.errorCode='atlas_close_failed';}}
    else if(connection){try{await connection.close();result.closed=true;}catch{result.status='partial';result.errorCode='atlas_close_failed';}}
    // A connector must close its own incomplete connection if it throws before returning it.
    else result.closed=true;
  }
  return result;
}
