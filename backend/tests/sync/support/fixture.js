import fs from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { generateKeyPair, SignJWT, decodeJwt } from 'jose';
import { createApp } from '../../../src/app.js';
import { JwtService } from '../../../src/modules/auth/jwt-service.js';
import { CredentialHasher } from '../../../src/modules/auth/credential-hasher.js';
import { RateLimiter, RATE_POLICY } from '../../../src/middleware/rate-limiter.js';
import { resolveSyncContext } from '../../../src/middleware/sync-auth-context.js';
import { canonical, digest } from '../../../src/modules/sync/canonical-envelope.js';
import { IngestionService } from '../../../src/modules/sync/ingestion-service.js';
import { SyntheticIdentityRepository } from '../../identity-persistence/support/synthetic-repository.js';
import { SyntheticCoordinator } from './coordinator.js';
import { SyntheticIngestionRepository } from './synthetic-ingestion-repository.js';

export const vectors=JSON.parse(fs.readFileSync(new URL('./csharp-vectors.json',import.meta.url),'utf8'));
let pair;
export const resources=[];
export const clone=value=>structuredClone(value);
export const batch=operations=>({schemaVersion:2,batchId:randomUUID(),operations:clone(operations)});
export const envelope=op=>JSON.parse(op.canonicalEnvelope);
export function mutate(input,change,{newId=false}={}){
  const op=clone(input),e=envelope(op);change(e,op);op.canonicalEnvelope=canonical(e);op.payloadHash=digest(op.canonicalEnvelope);
  if(newId)op.operationId=randomUUID();return op;
}
export async function fixture(options={}) {
  pair??=generateKeyPair('RS256',{modulusLength:2048});
  const config={...await pair,mode:'isolated-test',algorithm:'RS256',issuer:'https://two-sides.test.invalid',audience:'two-sides-isolated-api',keyId:'sync-fixture'};
  const clock={value:Date.parse('2026-10-28T12:00:00.000Z')},now=()=>clock.value;
  const identityFactory=options.identityFactory??options.repositoryFactory?.identityFactory;
  let coordinator=new SyntheticCoordinator();
  const identity=identityFactory?await identityFactory({now}):new SyntheticIdentityRepository({synthetic:true,now,coordinator});
  coordinator=identity.coordinator??coordinator;
  const hasher=new CredentialHasher(),limiter=new RateLimiter({now});
  const auth=new JwtService({config,repository:identity,hasher,limiter,policy:RATE_POLICY,now,version:2});
  const credential=randomBytes(32).toString('base64url');
  const binding=options.binding??{installationId:vectors.installationId,localPlayerId:vectors.localPlayerId,bindingGeneration:1};
  const registration=await auth.register({registrationId:randomUUID(),credential,...binding},'synthetic');
  const accountId=registration.body.technicalAccountId;
  const login=async()=>auth.session({technicalAccountId:accountId,credential,...binding},'synthetic');
  let token=(await login()).accessToken;
  const ctx=await resolveSyncContext(await auth.authenticate(token),token,identity,now);
  const repository=options.repositoryFactory ? await options.repositoryFactory({identityRepository:identity,coordinator,now,context:ctx}) : new SyntheticIngestionRepository({synthetic:true,identityRepository:identity,coordinator,now,...options.repositoryOptions});
  const service=new IngestionService({repository,identityRepository:identity,...options.budgets});
  const app=createApp({now,hasher,limiter,persistentJwt:{config,repository:identity},sync:{repository,...options.budgets}});
  let server;
  const f={clock,now,config,auth,identity,repository,coordinator,service,app,ctx,accountId,binding,credential,
    get token(){return token;},
    async renew(){token=(await login()).accessToken;return resolveSyncContext(await auth.authenticate(token),token,identity,now);},
    async request(body,{path='/api/v2/sync/batches',raw,token:override=token,headers={}}={}){
      if(!server){server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});}
      const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+override,...headers},body:raw??JSON.stringify(body)});
      const text=await response.text();let result;try{result=JSON.parse(text);}catch{result=null;}return {status:response.status,body:result,text,headers:response.headers};
    },
    async ingest(ops=vectors.operations,context=ctx){return service.batches(context,batch(ops));},
    async signed(changes={},header={}){const claims={...decodeJwt(token),...changes};return new SignJWT(claims).setProtectedHeader({alg:'RS256',typ:'at+jwt',kid:config.keyId,...header}).sign(config.privateKey);},
    async close(){if(server){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));server=null;}},
  };
  resources.push(f);return f;
}
