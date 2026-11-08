import {readMainEnvironment} from '../config/env.js';
import {validateJwtConfig} from '../config/jwt.js';
import {mainConnector} from '../config/database.js';
import {MainError} from './policy.js';
import {openMainProfile,MAIN_ACTIVATION} from './profile.js';
import {createBackend} from '../composition/backend.js';
import {receiveAtlasCredential,destroyAtlasCredential} from '../modules/sync/atlas-credentials.js';
import {loadMainSigningKey} from './signing-key.js';
import {verifyRuntimeIntegrity} from './runtime-integrity.js';

// The persisted PKCS#8 RSA key is supplied by the operator (see signing-key.js). Never generated at startup, embedded or read from .env.
export {loadMainSigningKey};
// Injectable for offline tests and deployment secret managers. No default or fallback credential source.
export async function startMainBackend({config,credentialProvider,signingKeyProvider,connector,now}={}){
  if(config?.profile!=='main'||typeof credentialProvider!=='function'||typeof signingKeyProvider!=='function'||typeof connector!=='function')throw new MainError('main_not_enabled');
  let bundle,backend,credential;
  try{
    let jwtConfig;try{jwtConfig=validateJwtConfig(await signingKeyProvider());}catch{throw new MainError('main_signing_key_rejected');}   // key first: no credential is read and nothing connects without a valid key
    if(jwtConfig.mode!=='main')throw new MainError('main_signing_key_rejected');
    credential=await credentialProvider();bundle=await openMainProfile({activation:MAIN_ACTIVATION,credential,connector,now});
    backend=createBackend({profile:'main',main:bundle,jwtConfig,now});await backend.start({host:'127.0.0.1',port:config.port});return backend;
  }catch(error){if(backend)await backend.close().catch(()=>{});else if(bundle)await bundle.close().catch(()=>{});throw error instanceof MainError?error:new MainError('main_start_failed');}
  finally{destroyAtlasCredential(credential);}
}
export async function runMainFromProcess(){
  try{
    const config=readMainEnvironment();
    if(process.argv.length!==2||process.stdin.isTTY)throw new MainError('main_credential_channel_required');
    await verifyRuntimeIntegrity(config);
    const mongoose=(await import('mongoose')).default;
    return await startMainBackend({config,credentialProvider:()=>receiveAtlasCredential(process.stdin),signingKeyProvider:()=>loadMainSigningKey(config.keyFile,config.keyId),connector:mainConnector(mongoose)});
  }catch(error){throw error instanceof MainError?error:new MainError('main_configuration_rejected');}
}
