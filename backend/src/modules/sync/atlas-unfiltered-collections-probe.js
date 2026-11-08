import { openAtlasIntegration } from './atlas-integration.js';
import { ATLAS_TARGET,AtlasIntegrationError,validateAtlasConfig,verifyAtlasPermissions } from './atlas-policy.js';
import { atlasCollections } from './atlas-policy.js';
import { classifyAtlasError } from './atlas-error-diagnostic.js';
import { destroyAtlasCredential } from './atlas-credentials.js';

// D.2C: exactly one unfiltered command; never getMore, models, or writes.
export async function probeAtlasUnfilteredCollections({config,credential,connector}={}){
  const result={phase:'B05.4C.2D.2C',status:'blocked',outcome:null,target:{...ATLAS_TARGET},
    stage:'configuration',authentication:'not-verified',destination:'not-verified',permissions:null,
    alternativeQuery:'not-attempted',queryInvocations:0,alternativeExecuted:false,closed:false,
    remoteDocumentWrites:0,transactionsExecuted:0,modelsCreated:0};
  let handle,connection;
  try{
    const c=validateAtlasConfig(config);
    if(c.allowWrites!==false||c.authMechanism!=='DEFAULT'||typeof connector!=='function')throw new AtlasIntegrationError();
    result.stage='mongoose-connect';
    handle=await openAtlasIntegration({config:c,credential,connector:async(uri,options)=>{
      // Disable driver READ retries too: a failed metadata query must not be repeated.
      connection=await connector(uri,{...options,retryReads:false,timeoutMS:5000});
      result.authentication='accepted-by-driver';return connection;
    },modelFactory:()=>{throw new AtlasIntegrationError('atlas_writes_not_authorized');}});
    result.destination='verified';result.stage='permission-inspection';
    const info=await connection.db.command({connectionStatus:1,showPrivileges:true});
    verifyAtlasPermissions(info);
    const actions=new Set(info.authInfo.authenticatedUserPrivileges.filter(p=>p.resource.db===c.database&&p.resource.collection==='').flatMap(p=>p.actions));
    result.permissions={...handle.permissions,listCollections:actions.has('listCollections'),databaseWideFind:actions.has('find')};
    if(!result.permissions.listCollections||!result.permissions.databaseWideFind){result.outcome='B';return result;}
    result.stage='list-collections';result.alternativeQuery='attempted';result.queryInvocations=1;result.alternativeExecuted=true;
    const response=await connection.db.command({listCollections:1,authorizedCollections:true,nameOnly:true});
    const rows=response?.cursor?.firstBatch,id=response?.cursor?.id;
    const zero=id===0||id===0n||id?.isZero?.()===true;
    if(response?.ok!==1||!Array.isArray(rows)||rows.some(row=>!row||typeof row.name!=='string'))throw new AtlasIntegrationError();
    const candidates=new Set(Object.values(atlasCollections(c)));
    result.collectionCount=rows.length;
    result.pertinentCollections=rows.filter(row=>/^b054c2c_[0-9a-f]{32}_(ops|facts|fence|authorization)$/.test(row.name)).map(row=>row.name);
    result.otherCollectionCount=rows.length-result.pertinentCollections.length;
    result.enumerationComplete=zero;
    result.selectedNamespacesAbsent=zero&&!rows.some(row=>candidates.has(row.name));
    result.alternativeQuery='succeeded';result.outcome='A';
    result.status=zero?'completed':'partial';
    // A live cursor would require another command, which this authorization forbids.
    result.additionalCursorCommandsExecuted=0;

  }catch(error){
    result.diagnostic=classifyAtlasError(error,{stage:result.stage});
    result.outcome=result.diagnostic.category==='AUTHORIZATION_FAILURE'?'C':
      result.diagnostic.category==='UNKNOWN_CONNECTION_FAILURE'&&result.diagnostic.code===8000?'E':'D';
    if(result.alternativeQuery==='attempted')result.alternativeQuery='failed';
  }finally{
    destroyAtlasCredential(credential);
    try{if(handle)await handle.close();else if(connection)await connection.close();result.closed=true;}
    catch{result.closed=false;result.status='partial';}
    if(result.diagnostic)result.diagnostic={...result.diagnostic,close:result.closed?'completed':'failed'};
    result.recordedAtUtc=new Date().toISOString();
  }
  return result;
}
