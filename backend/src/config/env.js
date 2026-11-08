import {MainError} from '../main/policy.js';
// Process environment contract only. Never dotenv, MONGODB_URI, passwords, URI credentials or fallback test config.
export function readMainEnvironment(env=process.env){
  if(env.TWOSIDES_PROFILE!=='main'||env.MAIN_ENABLE!=='true')throw new MainError('main_not_enabled');
  const port=env.PORT??'3000';if(!/^\d{1,5}$/.test(port)||Number(port)<1||Number(port)>65535)throw new MainError('main_configuration_rejected');
  if(typeof env.MAIN_JWT_PRIVATE_KEY_FILE!=='string'||!env.MAIN_JWT_PRIVATE_KEY_FILE||typeof env.MAIN_JWT_KEY_ID!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(env.MAIN_JWT_KEY_ID))throw new MainError('main_signing_key_required');
  return Object.freeze({profile:'main',host:'127.0.0.1',port:Number(port),keyFile:env.MAIN_JWT_PRIVATE_KEY_FILE,keyId:env.MAIN_JWT_KEY_ID});
}
