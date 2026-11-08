import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {TRANSACTION_CONTRACT,TransactionConflict,CommitUncertain,StatisticsUnavailable} from './transaction-contract.js';
import {assertAggregateInvariants} from './projection.js';
const adapters=new WeakSet(),groups=['receipts','semantic','distinct','budgets'];
export const isSyntheticTransactionAdapter=x=>adapters.has(x);
export const newTransactionTestDirectory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'twosides-b80-'));
export class SnapshotTransactionAdapter {
 contract=TRANSACTION_CONTRACT;#state;#tail=Promise.resolve();#directory;#file;#lock;#closed=false;
 constructor({directory,keyCheck,checkpoint=async()=>{},recoverAbandonedPid}={}){
  const full=path.resolve(directory);
  if(!path.isAbsolute(directory)||full.startsWith('\\\\')||os.tmpdir().startsWith('\\\\')||full.split(/[\\/]/).some(p=>p.toLowerCase().startsWith('onedrive')))throw Error('Synthetic transaction directory rejected');
  const parent=fs.realpathSync(os.tmpdir());
  if(path.dirname(full).toLowerCase()!==parent.toLowerCase()||!/^twosides-b(?:79|80)-[a-z0-9-]+$/i.test(path.basename(full))||!/^[a-f0-9]{64}$/.test(keyCheck))throw Error('Synthetic transaction directory rejected');
  let cursor=full;while(true){if(fs.lstatSync(cursor).isSymbolicLink())throw Error('Synthetic link rejected');const next=path.dirname(cursor);if(next===cursor)break;cursor=next;}
  this.#directory=full;this.#file=path.join(full,'statistics-fixture.json');this.#lock=path.join(full,'fixture.lock');this.onCheckpoint=checkpoint;
  if(recoverAbandonedPid!==undefined){
   const info=fs.lstatSync(this.#lock);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Synthetic recovery refused');
   const lock=JSON.parse(fs.readFileSync(this.#lock,'utf8'));
   if(!Number.isSafeInteger(recoverAbandonedPid)||lock.pid!==recoverAbandonedPid)throw Error('Synthetic recovery refused');
   let gone=false;try{process.kill(recoverAbandonedPid,0);}catch(e){gone=e.code==='ESRCH';}if(!gone)throw Error('Synthetic writer still alive');fs.unlinkSync(this.#lock);
  }
  const fd=fs.openSync(this.#lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);
  try{
   if(fs.existsSync(this.#file)){const info=fs.lstatSync(this.#file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw Error('Unsafe snapshot');this.#state=JSON.parse(fs.readFileSync(this.#file,'utf8'));}
   else {if(fs.readdirSync(full).some(n=>n!=='fixture.lock'))throw Error('Synthetic directory not empty');this.#state={kind:'b79-statistics-synthetic-v1',keyCheck,revision:0,receipts:{},semantic:{},distinct:{},counts:{},budgets:{}};this.#writeInitial();}
   if(this.#state.kind!=='b79-statistics-synthetic-v1'||this.#state.keyCheck!==keyCheck)throw Error('Synthetic snapshot rejected');
   this.#state.revision??=0;this.#verify(this.#state);
   // Only an explicit abandoned-writer recovery removes unpublished, flat pending snapshots.
   if(recoverAbandonedPid!==undefined)for(const n of fs.readdirSync(full))if(/^pending-[a-f0-9-]{36}$/.test(n)){const file=path.join(full,n);if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Unsafe recovery artifact');fs.unlinkSync(file);}
   adapters.add(this);
  }catch(e){fs.unlinkSync(this.#lock);throw e;}
 }
 #verify(state){
  if(!Number.isSafeInteger(state.revision)||state.revision<0||Object.keys(state).some(k=>!['kind','keyCheck','revision','counts',...groups].includes(k)))throw Error('Snapshot format rejected');
  for(const group of groups){if(!state[group]||typeof state[group]!=='object'||Array.isArray(state[group]))throw Error('Snapshot format rejected');for(const [key,row]of Object.entries(state[group])){if(!/^[a-f0-9]{64}$/.test(key)||!Number.isSafeInteger(row.expires)||row.expires<0||Object.keys(row).some(k=>!(group==='receipts'?['hash','expires','revision']:group==='budgets'?['value','expires']:['expires']).includes(k)))throw Error('Operational record rejected');if(group==='receipts'&&(!/^[a-f0-9]{64}$/.test(row.hash)||(row.revision!==undefined&&(!Number.isSafeInteger(row.revision)||row.revision<1||row.revision>state.revision))))throw Error('Receipt rejected');if(group==='budgets'&&(!Number.isSafeInteger(row.value)||row.value<0))throw Error('Budget rejected');}}
  assertAggregateInvariants(state.counts);
 }
 #writeInitial(){const fd=fs.openSync(this.#file,'wx');try{fs.writeFileSync(fd,JSON.stringify(this.#state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 checkpoint(name,details={}){return this.onCheckpoint(name,Object.freeze({...details}));}
 async #persist(state,signal){
  const tmp=path.join(this.#directory,'pending-'+randomUUID());let renamed=false;
  try{const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}await this.checkpoint('after_durable_write');signal?.throwIfAborted();fs.renameSync(tmp,this.#file);renamed=true;}
  finally{if(!renamed&&fs.existsSync(tmp))fs.unlinkSync(tmp);}
 }
 runAtomic(work,{signal}={}){
  const task=this.#tail.then(async()=>{
   if(this.#closed)throw new StatisticsUnavailable();signal?.throwIfAborted();const staged=structuredClone(this.#state);let changed=false,active=true;
   const guard=group=>{if(!active||!groups.includes(group))throw Error('Inactive statistics transaction');};
   const tx=Object.freeze({revision:staged.revision+1,
    get(group,key){guard(group);return structuredClone(staged[group][key]);},
    put(group,key,value){guard(group);staged[group][key]=structuredClone(value);changed=true;},
    insertUnique(group,key,value){guard(group);if(Object.hasOwn(staged[group],key))throw new TransactionConflict();staged[group][key]=structuredClone(value);changed=true;},
    increment(period,key,amount=1){if(!active||!Number.isSafeInteger(amount)||amount<=0)throw Error('Invalid statistics increment');const id=period+'|'+key;staged.counts[id]=(staged.counts[id]??0)+amount;changed=true;},
    expire(now){if(!active)throw Error('Inactive statistics transaction');for(const group of groups)for(const[key,row]of Object.entries(staged[group]))if(row.expires<now){delete staged[group][key];changed=true;}}
   });
   let result;try{result=await work(tx);active=false;signal?.throwIfAborted();if(changed){staged.revision=tx.revision;this.#verify(staged);await this.checkpoint('before_commit');signal?.throwIfAborted();await this.#persist(staged,signal);this.#state=staged;try{await this.checkpoint('after_commit');}catch{throw new CommitUncertain();}}return {committed:true,revision:this.#state.revision,result};}
   finally{active=false;}
  });this.#tail=task.catch(()=>{});return task;
 }
 async readCommitted(){if(this.#closed)throw new StatisticsUnavailable();await this.checkpoint('read');return structuredClone(this.#state);}
 async lookupCommittedReceipt(key){if(this.#closed||!/^[a-f0-9]{64}$/.test(key))throw new StatisticsUnavailable();await this.checkpoint('read');return {revision:this.#state.revision,receipt:structuredClone(this.#state.receipts[key])};}
 async close(){await this.#tail;if(!this.#closed){this.#closed=true;fs.unlinkSync(this.#lock);}}
}
