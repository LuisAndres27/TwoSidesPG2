import { AtlasIntegrationError,validateAtlasConfig,assertAtlasConnection,authorizeAtlasScope,closeAtlasScope,assertAtlasModels,ATLAS_SCHEMA_PHASE,ATLAS_C2_PHASE } from './atlas-policy.js';
import { consumeAtlasCredential,destroyAtlasCredential } from './atlas-credentials.js';
import { ingestionModels } from './mongo-models.js';
import { MongoIngestionRepository } from './mongo-ingestion-repository.js';
import { MongoIdentityRepository,assertMongoIdentity } from '../auth/mongo-identity-repository.js';
import { mongoIdentityModels } from '../auth/mongo-identity-models.js';

// No default connector; importing this module cannot open a socket or inspect environment.
export async function openAtlasIntegration({config,credential,connector,modelFactory=ingestionModels}={}){
  let connection,scope;
  try{
    const c=validateAtlasConfig(config);
    if(typeof connector!=='function')throw new AtlasIntegrationError('atlas_connector_required');
    const pass=consumeAtlasCredential(credential);
    connection=await connector(c.uri,{
      dbName:c.database,user:c.user,pass,authSource:'admin',authMechanism:c.authMechanism,
      tls:true,tlsAllowInvalidCertificates:false,tlsAllowInvalidHostnames:false,
      directConnection:false,readPreference:'primary',retryWrites:true,w:'majority',
      maxPoolSize:2,minPoolSize:0,maxConnecting:1,maxIdleTimeMS:10000,serverSelectionTimeoutMS:10000,
      connectTimeoutMS:10000,waitQueueTimeoutMS:2000,autoIndex:false,autoCreate:false,bufferCommands:false,monitorCommands:false,
      appName:'TwoSides-B054C2C',
    });
    assertAtlasConnection(connection,c);
    const authorized=await authorizeAtlasScope(connection,c);
    const permissions=authorized.permissions;scope=authorized.scope;
    let models;
    return Object.freeze({
      mode:c.mode,runId:c.runId,permissions,
      get connection(){if(c.persistenceTest!==ATLAS_C2_PHASE)throw new AtlasIntegrationError('atlas_scope_rejected');return connection;},
      createIdentityRepository({now}={}) {
        if(c.persistenceTest===ATLAS_SCHEMA_PHASE)throw new AtlasIntegrationError('atlas_schema_only');
        if(!c.allowWrites)throw new AtlasIntegrationError('atlas_writes_not_authorized');
        return new MongoIdentityRepository({synthetic:true,connection,atlasScope:scope,models:mongoIdentityModels(connection,{atlasScope:scope}),now});
      },
      createRepository(options){
        try{
          // No model creation on the initial read-only connection path.
          if(c.persistenceTest===ATLAS_SCHEMA_PHASE)throw new AtlasIntegrationError('atlas_schema_only');
          if(!c.allowWrites)throw new AtlasIntegrationError('atlas_writes_not_authorized');
          assertMongoIdentity(options?.identityRepository,connection,scope);
          models??=modelFactory(connection,{atlasScope:scope});
          assertAtlasModels(scope,connection,models,{write:true});
          return new MongoIngestionRepository({...options,synthetic:true,disposable:true,connection,models,atlasScope:scope});
        }catch(error){if(error instanceof AtlasIntegrationError)throw error;throw new AtlasIntegrationError('atlas_repository_unavailable');}
      },
      async close(){closeAtlasScope(scope);try{await connection.close();}catch{throw new AtlasIntegrationError('atlas_close_failed');}},
    });
  }catch(error){
    closeAtlasScope(scope);if(connection)try{await connection.close();}catch{}
    if(error instanceof AtlasIntegrationError)throw error;
    throw new AtlasIntegrationError('atlas_connection_unavailable');
  }finally{destroyAtlasCredential(credential);}
}
