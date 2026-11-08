// Main database boundary. No environment, credentials, driver imports or connection on import.
import {assertRuntimePermissions,RUNTIME_IDENTITY} from './runtime-permissions.js';
export const MAIN_TARGET=Object.freeze({host:'twosidescluster.fxqeo8o.mongodb.net',database:'two_sides_db',user:RUNTIME_IDENTITY.user});
export const MAIN_URI=`mongodb+srv://${MAIN_TARGET.host}/${MAIN_TARGET.database}`;
// B60 candidate: explicit SHA-256 only. No negotiation fallback or substitution of the historical account.
// The account/role do not yet exist by virtue of this code, and deployment needs a newly authorized integrity baseline.
export const MAIN_AUTH_MECHANISM='SCRAM-SHA-256';
export const MAIN_CONFIG=Object.freeze({mode:'atlas-main',...MAIN_TARGET,uri:MAIN_URI,authSource:'admin',authMechanism:MAIN_AUTH_MECHANISM,tls:true,allowWrites:true});
export class MainError extends Error{constructor(code='main_unavailable'){super('Main backend unavailable.');this.name='MainError';this.code=code;}}
const scopes=new WeakMap(),bundles=new WeakSet(),repositories=new WeakMap();
export function assertMainConfig(c){
  if(!c||Object.keys(c).length!==Object.keys(MAIN_CONFIG).length||Object.entries(MAIN_CONFIG).some(([k,v])=>c[k]!==v))throw new MainError('main_configuration_rejected');
  return MAIN_CONFIG;
}
export function assertMainConnection(connection,config=MAIN_CONFIG){
  assertMainConfig(config);const o=connection?.getClient?.().options;
  if(connection?.readyState!==1||connection.name!==MAIN_TARGET.database||connection.db?.databaseName!==MAIN_TARGET.database||o?.srvHost!==MAIN_TARGET.host||o.dbName!==MAIN_TARGET.database||o.directConnection!==false||
    o.tls!==true||o.tlsInsecure===true||o.tlsAllowInvalidCertificates===true||o.tlsAllowInvalidHostnames===true||o.rejectUnauthorized===false||typeof o.checkServerIdentity==='function'||
    o.credentials?.username!==MAIN_TARGET.user||o.credentials?.source!=='admin'||o.credentials?.mechanism!==MAIN_AUTH_MECHANISM)throw new MainError('main_connection_rejected');
}
export function verifyMainPermissions(r){
  try{return assertRuntimePermissions(r);}catch{throw new MainError('main_permissions_unverified');}
}
export async function authorizeMainScope(connection){
  assertMainConnection(connection);const permissions=verifyMainPermissions(await connection.db.command({connectionStatus:1,showPrivileges:true}));
  const scope=Object.freeze(Object.create(null));scopes.set(scope,{connection,active:true});return{scope,permissions};
}
export const isMainScope=(scope,connection)=>{const s=scopes.get(scope);return !!s?.active&&(connection===undefined||s.connection===connection);};
export function mainScopeState(scope,connection){
  if(!isMainScope(scope,connection))throw new MainError('main_scope_rejected');assertMainConnection(connection);
  return Object.freeze({config:MAIN_CONFIG,prefix:'main_v2',collections:Object.freeze(Object.fromEntries(['operations','facts','fences','authorization'].map(k=>[k,'main_v2_'+k])))});
}
export function closeMainScope(scope){const s=scopes.get(scope);if(s)s.active=false;}
export function registerMainRepository(repository,scope){if(!isMainScope(scope,repository.connection))throw new MainError('main_scope_rejected');repositories.set(repository,scope);}
export const isMainRepository=repository=>!!repository&&isMainScope(repositories.get(repository),repository.connection);
export function registerMainBundle(bundle){bundles.add(bundle);return bundle;}
export const isMainBundle=bundle=>!!bundle&&bundles.has(bundle)&&isMainRepository(bundle.ingestionRepository);
