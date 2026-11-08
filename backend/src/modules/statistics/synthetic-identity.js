import {randomBytes} from 'node:crypto';
import {uuid,hash} from './contract.js';
const registries=new WeakSet();
export class SyntheticStatisticsIdentity {
 #tokens=new Map();
 constructor(){registries.add(this);}
 issueSynthetic({installationId,now=Date.now(),scope='statistics:write',lifetimeMs=900000,authorizedSyntheticToken}){
  uuid.parse(installationId);if(!Number.isSafeInteger(lifetimeMs)||lifetimeMs<1||lifetimeMs>3600000)throw Error('Invalid synthetic lifetime');
  for(const [key,value] of this.#tokens)if(value.expires<=now)this.#tokens.delete(key);
  if(this.#tokens.size>=10000)throw Error('Synthetic credential capacity');
  const token=authorizedSyntheticToken??randomBytes(32).toString('base64url');if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error('Synthetic credential rejected');
  this.#tokens.set(hash(token),Object.freeze({installationId,scope,expires:now+lifetimeMs}));return token;
 }
 revokeSynthetic(token){this.#tokens.delete(hash(token));}
 authenticate(header,now){
  if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(header))return null;
  const identity=this.#tokens.get(hash(header.slice(7)));return identity&&identity.expires>now?identity:null;
 }
}
export const isSyntheticIdentity=value=>registries.has(value);
