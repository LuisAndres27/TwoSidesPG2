import {MAIN_COLLECTION_NAMES} from './schema-inventory.js';
// Atlas custom roles live on admin; their data resources remain exclusively two_sides_db.
export const RUNTIME_IDENTITY=Object.freeze({user:'twosides_backend_v2',role:'two_sides_main_runtime_v1',roleDatabase:'admin'});
export const RUNTIME_ACTIONS=Object.freeze(['find','insert','update','listIndexes']);
// Closed effective privilege set. Entries may be split/reordered by the server; their union must be EXACT.
export function assertRuntimePermissions(result){
  const fail=()=>{throw new Error('Restricted runtime permissions unavailable');};
  const a=result?.authInfo;
  if(result?.ok!==1||!Array.isArray(a?.authenticatedUsers)||a.authenticatedUsers.length!==1||a.authenticatedUsers[0]?.user!==RUNTIME_IDENTITY.user||a.authenticatedUsers[0]?.db!=='admin'||
     !Array.isArray(a.authenticatedUserRoles)||a.authenticatedUserRoles.length!==1||a.authenticatedUserRoles[0]?.role!==RUNTIME_IDENTITY.role||a.authenticatedUserRoles[0]?.db!==RUNTIME_IDENTITY.roleDatabase||
     !Array.isArray(a.authenticatedUserPrivileges)||!a.authenticatedUserPrivileges.length)fail();
  const required=new Map([['',new Set(['listCollections'])],...MAIN_COLLECTION_NAMES.map(n=>[n,new Set(RUNTIME_ACTIONS)])]);
  const seen=new Map([...required.keys()].map(n=>[n,new Set()]));
  for(const p of a.authenticatedUserPrivileges){
    const r=p?.resource;
    if(!r||Object.keys(r).length!==2||Object.keys(r).some(k=>!['db','collection'].includes(k))||r.db!=='two_sides_db'||typeof r.collection!=='string'||!required.has(r.collection)||
       !Array.isArray(p.actions)||!p.actions.length)fail();
    for(const action of p.actions){if(typeof action!=='string'||!required.get(r.collection).has(action))fail();seen.get(r.collection).add(action);}
  }
  for(const [name,actions]of required)if([...actions].some(v=>!seen.get(name).has(v)))fail();
  return Object.freeze({user:RUNTIME_IDENTITY.user,database:'two_sides_db',role:RUNTIME_IDENTITY.role});
}
