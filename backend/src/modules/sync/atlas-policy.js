import { z } from 'zod';
import { assertNotProduction } from '../../config/jwt.js';
import {isMainScope,mainScopeState,assertMainConnection,closeMainScope} from '../../main/policy.js';

export const ATLAS_TARGET=Object.freeze({host:'twosidescluster.fxqeo8o.mongodb.net',database:'two_sides_integration_test',user:'twosides_integration_test'});
export const ATLAS_URI=`mongodb+srv://${ATLAS_TARGET.host}/${ATLAS_TARGET.database}`;
export const ATLAS_SCHEMA_PHASE='B05.4C.2F.1C.2A';
export const ATLAS_C2_PHASE='B05.4C.2F.1C.2';
export const ATLAS_SCHEMA_RUN='10ef4f6d653f4ee4a1d1b2e6591013c2';
// B05.5 stage 6: the long-lived 'integration' profile. Same fixed target as C.2, but NOT the one-shot C.2 phases: no run id, fixed collection prefix,
// SCRAM only, writes always on (the profile exists to persist synthetic sync data). It is minted only by src/integration/profile.js.
export const ATLAS_PROFILE_MODE='atlas-integration-profile';
export const INTEGRATION_COLLECTION_PREFIX='integration_v2';
export class AtlasIntegrationError extends Error {
  constructor(code='atlas_configuration_rejected'){super('Atlas integration unavailable.');this.name='AtlasIntegrationError';this.code=code;}
}
const reject=()=>{throw new AtlasIntegrationError();};
const configSchema=z.strictObject({
  mode:z.literal('atlas-integration-test'),authorized:z.literal(true),
  uri:z.literal(ATLAS_URI),host:z.literal(ATLAS_TARGET.host),database:z.literal(ATLAS_TARGET.database),
  user:z.literal(ATLAS_TARGET.user),tls:z.literal(true),runId:z.string().regex(/^[0-9a-f]{32}$/),
  allowWrites:z.boolean().default(false),
  authMechanism:z.enum(['SCRAM-SHA-256','DEFAULT']).default('SCRAM-SHA-256'),
  persistenceTest:z.enum(['B05.4C.2D.2','B05.4C.2D.2E',ATLAS_SCHEMA_PHASE,ATLAS_C2_PHASE]).optional(),
}).refine(c=>c.authMechanism!=='DEFAULT'||!c.allowWrites||!!c.persistenceTest)
  .refine(c=>!c.persistenceTest||(c.authMechanism==='DEFAULT'&&c.allowWrites===true))
  .refine(c=>![ATLAS_SCHEMA_PHASE,ATLAS_C2_PHASE].includes(c.persistenceTest)||c.runId===ATLAS_SCHEMA_RUN);
const profileSchema=z.strictObject({
  mode:z.literal(ATLAS_PROFILE_MODE),authorized:z.literal(true),
  uri:z.literal(ATLAS_URI),host:z.literal(ATLAS_TARGET.host),database:z.literal(ATLAS_TARGET.database),
  user:z.literal(ATLAS_TARGET.user),tls:z.literal(true),allowWrites:z.literal(true),authMechanism:z.literal('SCRAM-SHA-256'),
});
export const INTEGRATION_PROFILE_CONFIG=Object.freeze({mode:ATLAS_PROFILE_MODE,authorized:true,uri:ATLAS_URI,...ATLAS_TARGET,tls:true,allowWrites:true,authMechanism:'SCRAM-SHA-256'});
export function validateAtlasConfig(input){
  try{assertNotProduction();const result=z.union([configSchema,profileSchema]).safeParse(input);if(!result.success)reject();return Object.freeze(result.data);}
  catch{reject();}
}
export function atlasCollections(config){
  const c=validateAtlasConfig(config);
  if(c.mode===ATLAS_PROFILE_MODE){const p=INTEGRATION_COLLECTION_PREFIX;return Object.freeze({operations:p+'_operations',facts:p+'_facts',fences:p+'_fences',authorization:p+'_authorization'});}
  const prefix='b054c2c_'+c.runId;
  return Object.freeze({operations:prefix+'_ops',facts:prefix+'_facts',fences:prefix+'_fence',authorization:prefix+'_authorization'});
}
const scopes=new WeakMap();
// Minted only by the factory after a READ-ONLY server permission inspection.
function registerAtlasScope(connection,config){
  const c=validateAtlasConfig(config),scope=Object.freeze({mode:c.mode,runId:c.runId});
  scopes.set(scope,{connection,config:c,collections:atlasCollections(c),prefix:c.mode===ATLAS_PROFILE_MODE?INTEGRATION_COLLECTION_PREFIX:'b054c2c_'+c.runId,active:true});return scope;
}
export async function authorizeAtlasScope(connection,config){
  try{
    assertAtlasConnection(connection,config);
    const permissions=verifyAtlasPermissions(await connection.db.command({connectionStatus:1,showPrivileges:true}));
    return Object.freeze({scope:registerAtlasScope(connection,config),permissions});
  }catch(error){if(error instanceof AtlasIntegrationError)throw error;throw new AtlasIntegrationError('atlas_permissions_unverified');}
}
export function atlasScopeState(scope,connection){
  if(isMainScope(scope,connection))return mainScopeState(scope,connection);
  const s=scopes.get(scope);if(!s?.active || s.connection!==connection || connection.name!==ATLAS_TARGET.database ||
    connection.db?.databaseName!==ATLAS_TARGET.database)reject();return Object.freeze({config:s.config,collections:s.collections,prefix:s.prefix});
}
export function isIntegrationProfileScope(scope){const s=scopes.get(scope);return !!s?.active&&s.config.mode===ATLAS_PROFILE_MODE;}
export function assertAtlasModels(scope,connection,models,{write=false}={}){
  const s=atlasScopeState(scope,connection);
  if(write&&!s.config.allowWrites)throw new AtlasIntegrationError('atlas_writes_not_authorized');
  for(const [key,name]of Object.entries(s.collections)){
    const model=models[key];
    if(model?.db!==connection || model.collection?.name!==name || model.collection?.conn!==undefined&&model.collection.conn!==connection)reject();
  }
  return s;
}
export function closeAtlasScope(scope){closeMainScope(scope);const s=scopes.get(scope);if(s)s.active=false;}

export function verifyAtlasPermissions(result){
  const a=result?.authInfo;
  if(result?.ok!==1 || a?.authenticatedUsers?.length!==1 || a.authenticatedUsers[0].user!==ATLAS_TARGET.user || a.authenticatedUsers[0].db!=='admin' ||
    a.authenticatedUserRoles?.length!==1 || a.authenticatedUserRoles[0].role!=='readWrite' || a.authenticatedUserRoles[0].db!==ATLAS_TARGET.database ||
    !Array.isArray(a.authenticatedUserPrivileges) || !a.authenticatedUserPrivileges.length)throw new AtlasIntegrationError('atlas_permissions_unverified');
  const actions=new Set();
  for(const p of a.authenticatedUserPrivileges){
    if(p.resource?.db!==ATLAS_TARGET.database || typeof p.resource.collection!=='string' || Object.keys(p.resource).some(k=>!['db','collection'].includes(k)) ||
      !Array.isArray(p.actions)||p.actions.some(v=>typeof v!=='string'))throw new AtlasIntegrationError('atlas_permissions_unverified');
    if(p.resource.collection==='')for(const action of p.actions)actions.add(action);
  }
  if(!['find','insert','update','remove','createCollection','createIndex','listIndexes'].every(a=>actions.has(a)))throw new AtlasIntegrationError('atlas_permissions_unverified');
  return Object.freeze({user:ATLAS_TARGET.user,database:ATLAS_TARGET.database,role:'readWrite',status:'verified-read-only'});
}

export function assertAtlasConnection(connection,config){
  if(config?.mode==='atlas-main')return assertMainConnection(connection,config);
  const c=validateAtlasConfig(config),o=connection?.getClient?.().options;
  if(connection?.readyState!==1 || connection.name!==c.database || connection.db?.databaseName!==c.database ||
    o?.srvHost!==c.host || o.dbName!==c.database || o.directConnection!==false || o.tls!==true ||
    o.tlsInsecure===true || o.tlsAllowInvalidCertificates===true || o.tlsAllowInvalidHostnames===true ||
    o.rejectUnauthorized===false || typeof o.checkServerIdentity==='function' ||
    o.credentials?.username!==c.user || o.credentials?.source!=='admin' || o.credentials?.mechanism!==c.authMechanism)reject();
}
