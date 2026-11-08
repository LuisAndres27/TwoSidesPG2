import './b80-isolation-guard.js';
import {SnapshotTransactionAdapter} from '../../src/modules/statistics/snapshot-transaction-adapter.js';
import {TransactionalStatisticsRepository} from '../../src/modules/statistics/transactional-repository.js';
import {B80_KEY,keyCheck} from './b80-fixture.js';
process.once('message',async input=>{
 try{
  const adapter=new SnapshotTransactionAdapter({directory:input.directory,keyCheck,checkpoint:async(name,detail)=>{
   if(name===input.point&&(name!=='after_increment'||detail.index===2)){process.send({stage:name});await new Promise(()=>{});}
  }});
  const repository=new TransactionalStatisticsRepository({adapter,key:B80_KEY,now:()=>input.now});
  const outcome=await repository.commit(input.value);process.send({outcome:outcome.status});await repository.close();process.disconnect();
 }catch{process.send({error:'synthetic_worker_failed'});process.disconnect();}
});
