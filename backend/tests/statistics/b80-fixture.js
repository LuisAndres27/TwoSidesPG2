import './b80-isolation-guard.js';
import fs from 'node:fs';import path from 'node:path';import {createHash,createHmac,randomUUID} from 'node:crypto';
import {SnapshotTransactionAdapter,newTransactionTestDirectory} from '../../src/modules/statistics/snapshot-transaction-adapter.js';
import {TransactionalStatisticsRepository} from '../../src/modules/statistics/transactional-repository.js';
import {hash,validateEvent} from '../../src/modules/statistics/contract.js';
export const B80_KEY=createHash('sha256').update('PUBLIC B80 SYNTHETIC TRANSACTION KEY').digest();
export const keyCheck=createHmac('sha256',B80_KEY).update('key-check').digest('hex');
export function value(installation=randomUUID(),patch={},now=Date.parse('2026-11-04T12:00:00.000Z')){
 const event={EventId:randomUUID(),SchemaVersion:1,InstallationId:installation,SessionId:randomUUID(),Type:'playtime_interval',OccurredAtUtc:new Date(now).toISOString(),GameId:randomUUID().replaceAll('-',''),BiomeId:'ocean',DurationMs:30000,Data:JSON.stringify({state:'ActiveHuman',startMs:0,endMs:30000,active:true,excluded:false}),...patch};
 const canonical=JSON.stringify(event);return validateEvent({EventJson:canonical,PayloadHash:hash(canonical)},event.InstallationId,now);
}
export function createB80Fixture({dailyLimit=6000}={}){
 const directory=newTransactionTestDirectory(),clock={now:Date.parse('2026-11-04T12:00:00.000Z')};let hook=async()=>{};
 const adapter=new SnapshotTransactionAdapter({directory,keyCheck,checkpoint:(...args)=>hook(...args)}),repository=new TransactionalStatisticsRepository({adapter,key:B80_KEY,now:()=>clock.now,dailyLimit});
 return {directory,clock,adapter,repository,point:fn=>{hook=fn;},async close(){hook=async()=>{};await repository.close();for(const name of fs.readdirSync(directory)){const file=path.join(directory,name);if((!['statistics-fixture.json','fixture.lock'].includes(name)&&!/^pending-[a-f0-9-]{36}$/.test(name))||!fs.lstatSync(file).isFile())throw Error('Unsafe test cleanup');fs.unlinkSync(file);}fs.rmdirSync(directory);}};
}
export async function withB80Fixture(run,options){const f=createB80Fixture(options);try{return await run(f);}finally{await f.close();}}
export function barrier(){let arrive,release;return {arrived:new Promise(r=>{arrive=r;}),wait:new Promise(r=>{release=r;}),arrive:()=>arrive(),release:()=>release()};}
