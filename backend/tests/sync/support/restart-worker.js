import { createApp } from '../../../src/app.js';
import { SyntheticKeyProvider } from '../../identity-persistence/support/key-provider.js';
import { SyntheticIdentityRepository } from '../../identity-persistence/support/synthetic-repository.js';
import { SyntheticCoordinator } from './coordinator.js';
import { SyntheticIngestionRepository } from './synthetic-ingestion-repository.js';
let server,stage='repository';
process.once('message',async input=>{
  try {
    const options={directory:input.directory,masterKey:Buffer.from(input.masterKey),synthetic:true,now:()=>input.clock};
    const coordinator=new SyntheticCoordinator(options);
    const identity=await SyntheticIdentityRepository.open({...options,coordinator});
    const config=await new SyntheticKeyProvider(options).load();
    const repository=await SyntheticIngestionRepository.open({...options,identityRepository:identity,coordinator,
      beforeCommit:async()=>{if(input.mode==='crash-before-commit')process.exit(74);},
      afterCommit:async()=>{if(input.mode==='crash-after-commit')process.exit(74);}});
    stage='listener';const app=createApp({now:options.now,persistentJwt:{config,repository:identity},sync:{repository}});
    server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v2/sync/batches`,{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+input.token},body:JSON.stringify(input.body)});
    const body=await response.json();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;
    const snapshot=await repository.snapshot();process.send({ok:true,status:response.status,body,operations:snapshot.operations.length,facts:snapshot.facts.length});process.disconnect();
  }catch{if(server){server.closeAllConnections();server.close();}process.send?.({ok:false,stage});process.disconnect();process.exitCode=1;}
});
