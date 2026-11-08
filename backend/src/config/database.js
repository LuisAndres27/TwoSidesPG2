import {MAIN_CONFIG,MAIN_URI,MainError} from '../main/policy.js';
export {MAIN_CONFIG};
// Password is a separate option, never part of a URI. This adapter opens only when explicitly called.
export function mainConnector(mongoose){return async(uri,options)=>{
  if(uri!==MAIN_URI||options.user!==MAIN_CONFIG.user||options.dbName!==MAIN_CONFIG.database||options.authSource!=='admin'||options.authMechanism!==MAIN_CONFIG.authMechanism||options.authMechanismProperties!==undefined||options.tls!==true||options.tlsAllowInvalidCertificates!==false||options.tlsAllowInvalidHostnames!==false||options.rejectUnauthorized===false||typeof options.checkServerIdentity==='function'||options.autoIndex!==false||options.autoCreate!==false)throw new MainError('main_configuration_rejected');
  let connection;
  try{connection=mongoose.createConnection(uri,options);connection.on('error',()=>{});await connection.asPromise();return connection;}
  catch{if(connection)await connection.close().catch(()=>{});throw new MainError('main_connection_unavailable');}
};}
