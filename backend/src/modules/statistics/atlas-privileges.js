// B86 — exact minimum privileges per identity (derived from B83 and VERIFIED against the real adapter on a disposable authenticated mongod, see
// tests/b86). One matrix feeds three consumers: the Atlas custom-role definitions for the owner, the native roles of the local RBAC test server,
// and the runtime preflight that refuses to start if the connected account holds anything else (adding a restrictive role to a broad one
// does not reduce it, so the UNION must equal this set exactly).
// B86.1: Metabase reads a SEPARATE analytical database that only holds a published copy of stats_v1_counters (B85 isolation model). It never
// sees the ingestion database, so the technical collections (receipts, semantic marks, activity, budgets, meta) are not even listed for it.
import {MONGO_STATISTICS_COLLECTIONS as C} from './mongo-schema.js';
import {STATISTICS_IDENTITIES} from './atlas-policy.js';

const all=Object.values(C),TTL=[C.receipts,C.distinct,C.budgets];
// Native action names. A resource with collection '' is the database itself.
// `source` = ingestion database, `analytics` = analytical database (published aggregates only).
export const PRIVILEGE_MATRIX=Object.freeze({
 // Express ingestion at runtime. Evidence for each action: tests/b86/b86-rbac.real.js (sufficiency and per-action necessity).
 ingest:Object.freeze({
  source:Object.freeze({collections:Object.freeze({[C.counts]:['find','insert','update','listIndexes'],[C.receipts]:['find','insert','remove','listIndexes'],[C.semantic]:['find','insert','listIndexes'],[C.distinct]:['find','insert','remove','listIndexes'],[C.budgets]:['find','insert','update','listIndexes'],[C.meta]:['find','update','listIndexes']}),database:Object.freeze(['listCollections'])})}),
 // Separate, temporary identity: creates the six collections with validators, the three TTL indexes and the seed document in the source database and the
 // (empty) counters collection of the analytical database. Never inside Express.
 schema:Object.freeze({
  source:Object.freeze({collections:Object.freeze(Object.fromEntries(all.map(n=>[n,['createCollection','find','insert','listIndexes',...(TTL.includes(n)?['createIndex']:[])]]))),database:Object.freeze(['listCollections'])}),
  analytics:Object.freeze({collections:Object.freeze({[C.counts]:['createCollection','listIndexes']}),database:Object.freeze(['listCollections'])})}),
 // Publisher: copies the aggregate counters (and nothing else) from the source into the analytical database, in one transaction (delete + insert).
 publisher:Object.freeze({
  source:Object.freeze({collections:Object.freeze({[C.counts]:['find']}),database:Object.freeze([])}),
  analytics:Object.freeze({collections:Object.freeze({[C.counts]:['find','insert','remove']}),database:Object.freeze([])})}),
 // Metabase / analytics: only the published counters of the analytical database; metadata actions are those the B85 driver discovery required (error 13 without them).
 reader:Object.freeze({analytics:Object.freeze({collections:Object.freeze({[C.counts]:['find']}),database:Object.freeze(['listCollections','dbStats'])})})});

const sorted=a=>[...new Set(a)].sort();
function resources(identity,database,analyticsDatabase){
 const m=PRIVILEGE_MATRIX[identity];if(!m||!/^[A-Za-z0-9_]{1,63}$/.test(database)||(analyticsDatabase!==undefined&&!/^[A-Za-z0-9_]{1,63}$/.test(analyticsDatabase))||(m.analytics&&analyticsDatabase===undefined)||(!m.analytics&&analyticsDatabase!==undefined)||analyticsDatabase===database)throw Error('Role specification rejected');
 const out=[];
 for(const [scope,dbName] of [['source',database],['analytics',analyticsDatabase]]){const part=m[scope];if(!part)continue;
  if(part.database.length)out.push({resource:{db:dbName,collection:''},actions:sorted(part.database)});
  for(const [collection,actions] of Object.entries(part.collections))out.push({resource:{db:dbName,collection},actions:sorted(actions)});}
 return out;
}
export function mongoRoleSpec(identity,database,analyticsDatabase){return {role:STATISTICS_IDENTITIES[identity].role,privileges:resources(identity,database,analyticsDatabase),roles:[]};}
const ATLAS_ACTION={find:'FIND',insert:'INSERT',update:'UPDATE',remove:'REMOVE',listCollections:'LIST_COLLECTIONS',listIndexes:'LIST_INDEXES',createCollection:'CREATE_COLLECTION',createIndex:'CREATE_INDEX',dbStats:'DB_STATS'};
// Shape accepted by the Atlas "custom role" form/API: actions with their resources. Names must still be confirmed in the owner's project UI.
export function atlasRoleSpec(identity,database,analyticsDatabase){
 const spec=mongoRoleSpec(identity,database,analyticsDatabase),byAction=new Map();
 for(const p of spec.privileges)for(const a of p.actions){if(!ATLAS_ACTION[a])throw Error('Unmapped action');const list=byAction.get(ATLAS_ACTION[a])??[];list.push({db:p.resource.db,collection:p.resource.collection});byAction.set(ATLAS_ACTION[a],list);}
 return {roleName:spec.role,inheritedRoles:[],actions:[...byAction].sort(([a],[b])=>a<b?-1:1).map(([action,r])=>({action,resources:r}))};
}
// `showPrivileges` is the result of {connectionStatus:1,showPrivileges:true}. Exact union comparison; only categories are thrown, never values.
export function verifyEffectivePrivileges(connectionStatus,identity,database,analyticsDatabase){
 const expected=mongoRoleSpec(identity,database,analyticsDatabase),roles=connectionStatus?.authInfo?.authenticatedUserRoles??[],got=connectionStatus?.authInfo?.authenticatedUserPrivileges,users=connectionStatus?.authInfo?.authenticatedUsers??[];
 if(!Array.isArray(got))throw Error('privileges_unverifiable');
 if(users.length!==1||users[0].user!==STATISTICS_IDENTITIES[identity].user)throw Error('unexpected_user');
 if(roles.length!==1||roles[0].role!==expected.role||roles[0].db!=='admin')throw Error('unexpected_roles');
 const key=p=>`${p.resource?.db??''}.${p.resource?.collection??''}`,normalize=list=>Object.fromEntries(list.map(p=>[key(p),sorted(p.actions)]).sort(([a],[b])=>a<b?-1:1));
 if(JSON.stringify(normalize(got))!==JSON.stringify(normalize(expected.privileges)))throw Error('privileges_differ');
 return true;
}
