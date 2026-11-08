// B86 — prints the deployment plan for the future Atlas statistics database. OFFLINE: no connection, no credentials, no files read or written.
//   node tools/b86/deployment-plan.mjs > plan.json
import {STATISTICS_DATABASES,STATISTICS_IDENTITIES,SYNTHETIC_ATLAS_POLICY,AUTH_MECHANISM_BY_KIND} from '../../src/modules/statistics/atlas-policy.js';
import {atlasRoleSpec,mongoRoleSpec,PRIVILEGE_MATRIX} from '../../src/modules/statistics/atlas-privileges.js';
import {MONGO_STATISTICS_COLLECTIONS as names,statisticsCollectionOptions,schemaForRetention} from '../../src/modules/statistics/mongo-schema.js';

export function deploymentPlan(database=STATISTICS_DATABASES.atlasTest,analyticsDatabase=STATISTICS_DATABASES.analyticsTest){
 const ttl=['receipts','distinct','budgets'];
 return {
  status:'PLAN ONLY. Nothing has been created in Atlas.',database,analyticsDatabase,metabaseReadsOnly:analyticsDatabase,productionDatabaseName:STATISTICS_DATABASES.production,retentionPolicy:SYNTHETIC_ATLAS_POLICY,retentionStatus:'EXPERIMENTAL; production retention NOT approved',schema:schemaForRetention(SYNTHETIC_ATLAS_POLICY),
  collections:Object.fromEntries(Object.entries(names).map(([group,name])=>[name,{group,validator:statisticsCollectionOptions(group,{retentionPolicy:SYNTHETIC_ATLAS_POLICY}),indexes:[{name:'_id_'},...(ttl.includes(group)?[{name:'expiry_v1',key:{expiresAt:1},expireAfterSeconds:0}]:[])],visibleToMetabase:false}])),
  analyticsCollections:{[names.counts]:{purpose:'published copy of the aggregate counters (only _id and numeric values); the ONLY thing Metabase can read',validator:statisticsCollectionOptions('counts',{retentionPolicy:SYNTHETIC_ATLAS_POLICY}),visibleToMetabase:true}},
  identities:Object.fromEntries(Object.entries(STATISTICS_IDENTITIES).map(([k,v])=>[k,{databaseUser:v.user,role:v.role,authentication:AUTH_MECHANISM_BY_KIND.atlas,authenticationNote:'Atlas mode uses SCRAM-SHA-1 explicitly (verified in TwoSidesCluster only; SCRAM-SHA-256 was rejected there). Local test server: SCRAM-SHA-256.',authSource:'admin',nativeRole:mongoRoleSpec(k,database,PRIVILEGE_MATRIX[k].analytics?analyticsDatabase:undefined),atlasCustomRole:atlasRoleSpec(k,database,PRIVILEGE_MATRIX[k].analytics?analyticsDatabase:undefined)}])),
  order:['1 owner creates the three custom roles and users (no built-in readWrite/atlasAdmin)','2 owner restricts Network Access to the exact egress IPs (never 0.0.0.0/0)','3 preflight with each identity (exact-privilege check)','4 provision with the schema identity (requires NEW empty databases: source and analytics)','5 seed the synthetic dataset with the ingest identity','6 publish the aggregate counters with the publisher identity','7 read with the reader identity (analytics database) and compare with the oracle','8 owner removes the schema user and any test access when finished'],
 };
}
if(import.meta.url===new URL(process.argv[1],'file:///').href||process.argv[1]?.endsWith('deployment-plan.mjs'))console.log(JSON.stringify(deploymentPlan(),null,2));
