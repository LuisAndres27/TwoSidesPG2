// Deliberately a driver double, NOT a MongoDB server or evidence of Mongo durability.
import './b80-isolation-guard.js';
import {randomUUID} from 'node:crypto';
import {b81LocalConfiguration} from '../../src/modules/statistics/mongo-local-policy.js';
import {provisionB81Statistics} from '../../src/modules/statistics/mongo-schema.js';
import {MongoStatisticsTransactionAdapter,registerB81MongoAdapter} from '../../src/modules/statistics/mongo-transaction-adapter.js';
import {createB81MongoRepository} from '../../src/modules/statistics/mongo-test-composition.js';
import {B80_KEY,keyCheck} from './b80-fixture.js';
export function mongoError({code,name='MongoServerError',labels=[]}={}){const e=Error('PUBLIC SYNTHETIC ERROR');Object.assign(e,{code,name,errorLabels:labels,hasErrorLabel:n=>labels.includes(n)});return e;}
function matches(row,filter){return Object.entries(filter).every(([k,v])=>v&&typeof v==='object'&&'$lt'in v?row[k]<v.$lt:row[k]===v);}
export async function createB81DriverFixture({persistentState,dailyLimit=6000,retentionPolicy='bounded-v1'}={}){
 const runId=randomUUID().replaceAll('-',''),config=b81LocalConfiguration({enabled:true,runId,host:'127.0.0.1',port:48981,database:'twosides_statistics_b81_'+runId,replicaSet:'b81_'+runId});
 const state=persistentState??{collections:new Map(),version:0},calls=[],faults={commit:[],operations:[]};let hook=async()=>{};
 const clock={now:Date.parse('2026-11-04T12:00:00.000Z')};
 const record=(op,collection,options)=>{calls.push({op,collection,session:!!options?.session});const fault=faults.operations[0];if(fault?.op===op&&(!fault.collection||fault.collection===collection)){faults.operations.shift();throw fault.error;}};
 const data=options=>options?.session?.data??state.collections;
 const collection=name=>({
  find(filter={},options={}){record('find',name,options);return {async toArray(){return [...(data(options).get(name)?.rows.values()??[])].filter(r=>matches(r,filter)).map(x=>structuredClone(x));}};},
  async findOne(filter,options={}){record('findOne',name,options);return structuredClone([...(data(options).get(name)?.rows.values()??[])].find(r=>matches(r,filter)))??null;},
  async insertOne(row,options={}){record('insertOne',name,options);const c=data(options).get(name);if(c.rows.has(row._id))throw mongoError({code:11000});c.rows.set(row._id,structuredClone(row));if(options.session)options.session.dirty=true;return {insertedId:row._id};},
  async replaceOne(filter,row,options={}){record('replaceOne',name,options);const c=data(options).get(name);c.rows.set(row._id,structuredClone(row));if(options.session)options.session.dirty=true;return {matchedCount:1};},
  async updateOne(filter,update,options={}){record('updateOne',name,options);const c=data(options).get(name);let row=[...c.rows.values()].find(r=>matches(r,filter)),matched=!!row;if(!row&&!options.upsert)return {matchedCount:0};row??={_id:filter._id};for(const [key,value]of Object.entries(update.$inc??{})){const p=key.split('.');if(p.length===1)row[key]=(row[key]??0)+value;else{row[p[0]]??={};row[p[0]][p[1]]=(row[p[0]][p[1]]??0)+value;}}c.rows.set(row._id,row);if(options.session)options.session.dirty=true;return {matchedCount:matched?1:0,upsertedCount:matched?0:1};},
  async deleteOne(filter,options={}){record('deleteOne',name,options);const c=data(options).get(name),row=[...c.rows.values()].find(r=>matches(r,filter));if(row){c.rows.delete(row._id);if(options.session)options.session.dirty=true;}return {deletedCount:row?1:0};},
  async createIndex(key,options){record('createIndex',name);state.collections.get(name).indexes.push({key,...options});},
  listIndexes(){record('listIndexes',name);return {async toArray(){return structuredClone(state.collections.get(name).indexes);}};}
 });
 const db={databaseName:config.database,collection,
  listCollections(){record('listCollections');return {async toArray(){return [...state.collections].map(([name,c])=>({name,type:'collection',options:structuredClone(c.options)}));}};},
  async createCollection(name,options){record('createCollection',name);if(state.collections.has(name))throw mongoError({code:48});state.collections.set(name,{options:structuredClone(options),indexes:[{name:'_id_',key:{_id:1}}],rows:new Map()});}
 };
 const sessions=[];
 const client={options:{directConnection:true,replicaSet:config.replicaSet,hosts:[{host:'127.0.0.1',port:config.port}]},
  startSession(options){record('startSession');const s={options,active:false,data:undefined,dirty:false,committed:false,
   startTransaction(options){record('startTransaction');this.transactionOptions=options;this.data=structuredClone(state.collections);this.version=state.version;this.active=true;},
   async commitTransaction(){record('commitTransaction');const fault=faults.commit.shift();if(fault==='unknown-before')throw mongoError({labels:['UnknownTransactionCommitResult']});if(fault instanceof Error)throw fault;if(!this.committed){if(this.dirty&&this.version!==state.version)throw mongoError({code:112,labels:['TransientTransactionError']});if(this.dirty){state.collections=this.data;state.version++;}this.committed=true;this.active=false;}if(fault==='unknown-after')throw mongoError({labels:['UnknownTransactionCommitResult']});},
   inTransaction(){return this.active;},async abortTransaction(){record('abortTransaction');this.active=false;},async endSession(){record('endSession');this.active=false;}
  };sessions.push(s);return s;},async close(){record('close');}
 };
 if(!persistentState)await provisionB81Statistics(db,{keyCheck,emptyDatabaseAuthorized:true,retentionPolicy});
 const adapter=await registerB81MongoAdapter(new MongoStatisticsTransactionAdapter({client,db,config,keyCheck,checkpoint:(...args)=>hook(...args),retentionPolicy}));
 const repository=createB81MongoRepository({profile:'statistics-b81-local-test',adapter,key:B80_KEY,now:()=>clock.now,dailyLimit,retentionPolicy});
 return {repository,adapter,db,client,config,state,calls,faults,sessions,clock,point:fn=>{hook=fn;},async close(){hook=async()=>{};await repository.close();}};
}
