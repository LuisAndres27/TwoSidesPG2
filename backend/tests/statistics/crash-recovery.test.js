import './b80-isolation-guard.js';
import {it,expect} from 'vitest';import {fork} from 'node:child_process';import {once} from 'node:events';import {fileURLToPath} from 'node:url';import fs from 'node:fs';import path from 'node:path';
import {value,B80_KEY,keyCheck} from './b80-fixture.js';
import {SnapshotTransactionAdapter,newTransactionTestDirectory} from '../../src/modules/statistics/snapshot-transaction-adapter.js';
import {TransactionalStatisticsRepository} from '../../src/modules/statistics/transactional-repository.js';
it.each(['after_increment','after_durable_write','after_commit'])('process crash/recovery at %s has no intermediate committed state',async point=>{
 const directory=newTransactionTestDirectory(),v=value();let repository,child;
 try{
  child=fork(fileURLToPath(new URL('./crash-worker.js',import.meta.url)),[],{execArgv:[],stdio:['pipe','pipe','pipe','ipc']});
  const message=once(child,'message');child.send({directory,value:v,point,now:Date.parse('2026-11-04T12:00:00.000Z')});
  expect((await message)[0]).toEqual({stage:point});const pid=child.pid,exit=once(child,'exit');child.kill('SIGTERM');await exit;
  const adapter=new SnapshotTransactionAdapter({directory,keyCheck,recoverAbandonedPid:pid});repository=new TransactionalStatisticsRepository({adapter,key:B80_KEY,now:()=>Date.parse('2026-11-04T12:00:00.000Z')});
  let snapshot=await adapter.readCommitted();expect(snapshot.counts['all|events']??0).toBe(point==='after_commit'?1:0);expect(Object.keys(snapshot.receipts)).toHaveLength(point==='after_commit'?1:0);
  expect((await repository.commit(v)).status).toBe(point==='after_commit'?'duplicate':'accepted');snapshot=await adapter.readCommitted();expect(snapshot.counts['all|events']).toBe(1);expect(Object.keys(snapshot.receipts)).toHaveLength(1);
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}
  if(repository)await repository.close();for(const name of fs.readdirSync(directory)){const file=path.join(directory,name);if(!fs.lstatSync(file).isFile())throw Error('Unsafe recovery cleanup');fs.unlinkSync(file);}fs.rmdirSync(directory);
 }
});
