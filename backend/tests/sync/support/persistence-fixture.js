import { randomBytes, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { workspace } from '../../identity-persistence/support/harness.js';
import { SyntheticKeyProvider } from '../../identity-persistence/support/key-provider.js';
import { SyntheticIdentityRepository } from '../../identity-persistence/support/synthetic-repository.js';
import { CredentialHasher } from '../../../src/modules/auth/credential-hasher.js';
import { JwtService } from '../../../src/modules/auth/jwt-service.js';
import { RateLimiter,RATE_POLICY } from '../../../src/middleware/rate-limiter.js';
import { resolveSyncContext } from '../../../src/middleware/sync-auth-context.js';
import { IngestionService } from '../../../src/modules/sync/ingestion-service.js';
import { SyntheticCoordinator } from './coordinator.js';
import { SyntheticIngestionRepository } from './synthetic-ingestion-repository.js';
import { vectors } from './fixture.js';

export async function persistentFixture() {
  const directory=workspace('Create'),masterKey=randomBytes(32),clock=Date.parse('2026-10-28T12:00:00.000Z');
  try {
    const options={directory,masterKey,synthetic:true,now:()=>clock};
    const provider=new SyntheticKeyProvider(options);await provider.initialize();const config=await provider.load();
    const coordinator=new SyntheticCoordinator(options);
    const identity=await SyntheticIdentityRepository.open({...options,initialize:true,coordinator});
    const auth=new JwtService({config,repository:identity,hasher:new CredentialHasher(),limiter:new RateLimiter(),policy:RATE_POLICY,version:2,now:options.now});
    const credential=randomBytes(32).toString('base64url'),binding={installationId:vectors.installationId,localPlayerId:vectors.localPlayerId,bindingGeneration:1};
    const registration=await auth.register({registrationId:randomUUID(),credential,...binding},'synthetic');
    const accountId=registration.body.technicalAccountId;
    const token=(await auth.session({technicalAccountId:accountId,credential,...binding},'synthetic')).accessToken;
    const context=await resolveSyncContext(await auth.authenticate(token),token,identity,options.now);
    const repository=await SyntheticIngestionRepository.open({...options,initialize:true,identityRepository:identity,coordinator});
    const service=new IngestionService({repository,identityRepository:identity});
    return {directory,masterKey,clock,config,identity,repository,service,context,token,accountId,
      input:{directory,masterKey:[...masterKey],clock,token},close:()=>workspace('Remove',directory)};
  }catch(error){workspace('Remove',directory);throw error;}
}
export function runChild(input) {
  return new Promise((resolve,reject)=>{
    const p=fork(fileURLToPath(new URL('./restart-worker.js',import.meta.url)),[],{
      execArgv:['--import',new URL('../../jwt/env-guard.js',import.meta.url).href,'--import',new URL('./isolation-guard.js',import.meta.url).href],
      env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,LOCALAPPDATA:process.env.LOCALAPPDATA,NODE_ENV:'test'},
      stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,
    });
    let output=false,message;const timer=setTimeout(()=>{p.kill();reject(new Error('Synthetic restart timeout'));},20000);
    p.stdout.on('data',()=>{output=true;});p.stderr.on('data',()=>{output=true;});p.on('message',m=>{message=m;});
    p.on('error',()=>{clearTimeout(timer);reject(new Error('Synthetic worker unavailable'));});
    p.on('close',code=>{clearTimeout(timer);if(!output&&code===74&&input.mode?.startsWith('crash-'))resolve({exit:74});
      else if(output||code!==0||!message?.ok)reject(new Error('Synthetic worker failed: '+(message?.stage??'bootstrap')));else resolve(message);});
    p.send(input);
  });
}
