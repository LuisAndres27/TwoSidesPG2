import { randomUUID,randomBytes } from 'node:crypto';
import { mongoDouble } from './mongo-double.js';
import { ATLAS_TARGET,ATLAS_URI,atlasCollections } from '../../../src/modules/sync/atlas-policy.js';
import { temporaryAtlasCredential } from '../../../src/modules/sync/atlas-credentials.js';
import { openAtlasIntegration } from '../../../src/modules/sync/atlas-integration.js';
import { mongoAuthorizationFence } from '../../../src/modules/sync/mongo-authorization-fence.js';

export const atlasConfig=(changes={})=>({mode:'atlas-integration-test',authorized:true,uri:ATLAS_URI,...ATLAS_TARGET,tls:true,runId:randomUUID().replaceAll('-',''),...changes});
export const credential=()=>temporaryAtlasCredential(Buffer.from(randomBytes(24).toString('hex')));
export const permissionResult=()=>({ok:1,authInfo:{authenticatedUsers:[{user:ATLAS_TARGET.user,db:'admin'}],
  authenticatedUserRoles:[{role:'readWrite',db:ATLAS_TARGET.database}],authenticatedUserPrivileges:[{resource:{db:ATLAS_TARGET.database,collection:''},actions:['find','insert','update','remove','createCollection','createIndex','listIndexes']}]}});
export function atlasDouble(config=atlasConfig()){
  const db=mongoDouble(),connection=db.connection;db.config=config;db.status=permissionResult();db.commands=[];db.connects=0;
  connection.name=ATLAS_TARGET.database;connection.db.databaseName=ATLAS_TARGET.database;
  connection.db.command=async command=>{db.commands.push(command);return structuredClone(db.status);};
  connection.close=async()=>{db.closed=true;connection.readyState=0;};
  connection.getClient=()=>({options:{srvHost:ATLAS_TARGET.host,dbName:ATLAS_TARGET.database,directConnection:false,tls:true,
    credentials:{username:ATLAS_TARGET.user,source:'admin',mechanism:'SCRAM-SHA-256'}}});
  for(const [key,name]of Object.entries(atlasCollections(config))){db.models[key].db=connection;db.models[key].collection??={};db.models[key].collection.name=name;db.models[key].collection.conn=connection;}
  db.connector=async()=>{db.connects++;return connection;};
  db.open=async(extra={})=>openAtlasIntegration({config,credential:credential(),connector:db.connector,modelFactory:()=>db.models,...extra});
  db.factory=async({context,...options})=>{
    db.seed(context);db.handle??=await db.open();db.calls=[];db.ended=0;
    return db.handle.createRepository({...options,fenceAuthorization:mongoAuthorizationFence(db.models.authorization,options.now)});
  };
  db.factory.identityFactory=async({now})=>{db.handle=await db.open();return db.handle.createIdentityRepository({now});};
  return db;
}
