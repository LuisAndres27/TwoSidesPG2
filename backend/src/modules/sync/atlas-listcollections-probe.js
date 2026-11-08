import { openAtlasIntegration } from './atlas-integration.js';
import { ATLAS_TARGET,AtlasIntegrationError,validateAtlasConfig,verifyAtlasPermissions } from './atlas-policy.js';
import { atlasNamespaceQueries } from './atlas-namespace-preflight.js';
import { classifyAtlasError } from './atlas-error-diagnostic.js';
import { destroyAtlasCredential } from './atlas-credentials.js';

// D.2B: one original metadata query, no alternate strategy/repository/models/transactions.
export async function probeAtlasListCollections({config,credential,connector}={}){
  const result={phase:'B05.4C.2D.2B',status:'blocked',outcome:null,target:{...ATLAS_TARGET},
    stage:'configuration',authentication:'not-verified',destination:'not-verified',permissions:null,
    originalQuery:'not-attempted',queryInvocations:0,alternativeExecuted:false,closed:false,
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
    const [{filter,options}]=atlasNamespaceQueries(c,'original');
    result.stage='list-collections';result.originalQuery='attempted';result.queryInvocations=1;
    const rows=await connection.db.listCollections(filter,options).toArray();
    if(!Array.isArray(rows)||rows.some(row=>!row||!filter.name.$in.includes(row.name)))throw new AtlasIntegrationError('atlas_configuration_rejected');
    result.originalQuery='succeeded';result.collectionCount=rows.length;result.namespacesAbsent=rows.length===0;
    result.outcome='A';result.status=rows.length===0?'completed':'partial';
  }catch(error){
    result.diagnostic=classifyAtlasError(error,{stage:result.stage});
    result.outcome=result.diagnostic.category==='AUTHORIZATION_FAILURE'?'C':
      result.diagnostic.category==='UNKNOWN_CONNECTION_FAILURE'&&result.diagnostic.code===8000?'E':'D';
    if(result.originalQuery==='attempted')result.originalQuery='failed';
  }finally{
    destroyAtlasCredential(credential);
    try{if(handle)await handle.close();else if(connection)await connection.close();result.closed=true;}
    catch{result.closed=false;result.status='partial';}
    if(result.diagnostic)result.diagnostic={...result.diagnostic,close:result.closed?'completed':'failed'};
    result.recordedAtUtc=new Date().toISOString();
  }
  return result;
}
