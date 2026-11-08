export const TRANSACTION_CONTRACT='statistics-transaction-v1';
export class TransactionConflict extends Error{constructor(){super('Statistics transaction conflict');this.name='TransactionConflict';}}
export class CommitUncertain extends Error{constructor(){super('Statistics commit uncertain');this.name='CommitUncertain';}}
export class StatisticsUnavailable extends Error{constructor(){super('Statistics storage unavailable');this.name='StatisticsUnavailable';}}
// Adapter contract: runAtomic(fn)->{committed:true,revision,result}; readCommitted() is one complete snapshot.
// tx: revision, get(group,key), insertUnique(group,key,value), put(group,key,value), increment(period,key,n), expire(now).
// All tx operations may return promises (a Mongo implementation must not emulate synchronous network I/O).
// lookupCommittedReceipt(key) reads a single durable ledger entry; no full-ledger scan for uncertain commits.
// A callback can be replayed only after a definite conflict/abort. Unknown commits require a committed-ledger lookup.
export function assertTransactionAdapter(adapter){
 if(adapter?.contract!==TRANSACTION_CONTRACT||!['runAtomic','readCommitted','lookupCommittedReceipt','checkpoint','close'].every(name=>typeof adapter[name]==='function'))throw Error('Statistics transaction adapter rejected');
 return adapter;
}
