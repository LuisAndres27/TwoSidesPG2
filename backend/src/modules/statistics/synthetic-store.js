import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHmac} from 'node:crypto';
import {SnapshotTransactionAdapter} from './snapshot-transaction-adapter.js';
import {TransactionalStatisticsRepository,isSyntheticStatisticsRepository} from './transactional-repository.js';
export const isSyntheticStore=isSyntheticStatisticsRepository;
export const newSyntheticDirectory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'twosides-b79-'));
// B79-compatible facade. Projection and transactions are independent B80 components.
export class SyntheticStatisticsStore extends TransactionalStatisticsRepository {
 constructor({directory,key,now=Date.now,beforeCommit=()=>{},afterCommit=()=>{},dailyLimit=6000,checkpoint=async()=>{},recoverAbandonedPid}={}){
  if(!Buffer.isBuffer(key)||key.length!==32||!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>6000)throw Error('Synthetic configuration rejected');
  let owner;
  const adapter=new SnapshotTransactionAdapter({directory,keyCheck:createHmac('sha256',key).update('key-check').digest('hex'),recoverAbandonedPid,
   checkpoint:async(name,details)=>{if(name==='before_commit'&&owner)owner.beforeCommit();await checkpoint(name,details);}});
  try{super({adapter,key,now,dailyLimit});}catch(e){void adapter.close();throw e;}
  owner=this;Object.assign(this,{beforeCommit,afterCommit});
 }
 async commit(value){const result=await super.commit(value);if(result.status==='accepted')this.afterCommit();return result;}
}
