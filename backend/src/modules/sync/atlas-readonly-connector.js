import { performance } from 'node:perf_hooks';
import { ATLAS_URI,ATLAS_TARGET,AtlasIntegrationError } from './atlas-policy.js';
import { classifyAtlasError } from './atlas-error-diagnostic.js';

// Only the private receiver uses this helper. It does NOT connect until explicitly invoked.
export function diagnosticReadonlyConnector(mongoose,onPrivateDiagnostic=()=>{}){
  return async(uri,options)=>{
    const start=performance.now();let connection,close='not-needed';
    try{
      if(uri!==ATLAS_URI || options.dbName!==ATLAS_TARGET.database || options.user!==ATLAS_TARGET.user ||
        options.tls!==true || options.autoCreate!==false || options.autoIndex!==false || options.monitorCommands!==false)
        throw new AtlasIntegrationError('atlas_configuration_rejected');
      connection=mongoose.createConnection(uri,options);connection.on('error',()=>{});
      await connection.asPromise();return connection;
    }catch(error){
      if(connection){try{await connection.close();close='completed';}catch{close='failed';}}
      const diagnostic=classifyAtlasError(error,{stage:'mongoose-connect',durationMs:performance.now()-start,cleanup:close==='failed'?'failed':'completed',close});
      try{onPrivateDiagnostic(diagnostic);}catch{}
      // Preserve the public error contract; do not attach raw/private details to this error.
      throw new AtlasIntegrationError(diagnostic.category==='AUTHENTICATION_FAILURE'?'atlas_authentication_failed':
        diagnostic.category==='INVALID_CONNECTION_OPTIONS'?'atlas_client_configuration_rejected':'atlas_connection_unavailable');
    }
  };
}
