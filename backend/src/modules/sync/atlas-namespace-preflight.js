import { AtlasIntegrationError,ATLAS_TARGET,validateAtlasConfig,assertAtlasConnection,verifyAtlasPermissions,atlasCollections } from './atlas-policy.js';

// READ ONLY. No connector, models, environment lookup, or write capability is provided here.
export function atlasNamespaceQueries(config,strategy='original'){
  const c=validateAtlasConfig(config);
  if(c.authMechanism!=='DEFAULT'||!['original','exact-authorized'].includes(strategy))throw new AtlasIntegrationError();
  const names=Object.values(atlasCollections(c));
  return strategy==='original'?
    [{filter:{name:{$in:names}},options:{nameOnly:true}}]:
    names.map(name=>({filter:{name},options:{nameOnly:true,authorizedCollections:true}}));
}
function databaseAction(result,action){
  return result.authInfo.authenticatedUserPrivileges.some(p=>p.resource.db===ATLAS_TARGET.database&&p.resource.collection===''&&p.actions.includes(action));
}
export async function assertAtlasNamespacesAbsent({connection,config,strategy='original'}={}){
  const queries=atlasNamespaceQueries(config,strategy);
  // Validate the actual injected connection, not just the configuration's dbName.
  assertAtlasConnection(connection,config);
  const permissions=await connection.db.command({connectionStatus:1,showPrivileges:true});
  verifyAtlasPermissions(permissions);
  // authorizedCollections can hide namespaces. Database-wide find proves coverage of ALL
  // four candidates. Never accept collection-specific privileges as proof of absence.
  if(!databaseAction(permissions,'find')||(strategy==='original'&&!databaseAction(permissions,'listCollections')))
    throw new AtlasIntegrationError('atlas_permissions_unverified');
  for(const {filter,options}of queries){
    const rows=await connection.db.listCollections(filter,options).toArray();
    if(!Array.isArray(rows)||rows.length!==0)throw new AtlasIntegrationError('atlas_namespaces_not_empty');
  }
  return Object.freeze({verified:true,namespaceCount:4,strategy});
}
