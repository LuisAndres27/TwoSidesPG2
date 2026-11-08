import { randomUUID } from 'node:crypto';
import { assertNotProduction } from '../../config/jwt.js';
import { assertSyncContext } from '../../middleware/sync-auth-context.js';
import { canonical } from './canonical-envelope.js';
import { validateOperation, receiptSchema } from './schemas.js';
import { validateRelations } from './relations.js';
import { IngestionError, conflict, deferred, unavailable } from './errors.js';

import { checkBudget } from './budget.js';
import {isMainScope} from '../../main/policy.js';

const empty = () => ({ version:1, operations:[], facts:[] });
export const scope = c => [c.technicalAccountId,c.installationId,c.localPlayerId,c.bindingGeneration].join(':');
export const key = (c,id) => c.technicalAccountId + ':' + id;

// Two storage styles share this engine:
//  * whole-state stores (`store.load()` / `store.commit(state)`, or in memory): the synthetic file harness. Unchanged behaviour.
//  * SCOPED stores (`store.loadFor` / `commitDelta` / `receiptsFor` / `total`): the MongoDB adapter. They return only the documents ONE owner's
//    operation can need, and persist only what the operation adds. Every decision below already depends on the caller's scope alone (operation keys
//    contain the account id, facts are keyed by the owner scope), so a scoped view gives the same answers as the whole state did.
export class IngestionEngine {
  // maxRecords: operations ONE owner may hold (was: all owners together). maxTotalRecords: safety valve over the whole store (scoped stores only).
  constructor({ synthetic, mainScope, identityRepository, coordinator, store, now=Date.now, beforeCommit=async()=>{}, afterCommit=async()=>{}, maxRecords=1000, maxTotalRecords=50000 }) {
    const main=isMainScope(mainScope);
    if(!main)assertNotProduction();
    if ((main?synthetic!==false:synthetic!==true) || !coordinator || identityRepository?.coordinator !== coordinator) throw new Error('Coordinated storage capability required');
    if(!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>10000)throw new Error('Invalid synthetic capacity');
    if(!Number.isInteger(maxTotalRecords)||maxTotalRecords<maxRecords||maxTotalRecords>1000000)throw new Error('Invalid synthetic capacity');
    this.synthetic = !main; this.identityRepository=identityRepository; this.coordinator=coordinator; this.store=store; this.now=now;
    this.beforeCommit=beforeCommit; this.afterCommit=afterCommit; this.maxRecords=maxRecords; this.maxTotalRecords=maxTotalRecords; this.state=empty();
  }
  get scoped() { return typeof this.store?.loadFor === 'function'; }

  // Integrity of stored records. `partial` = a scoped view: every record is checked on its own, but whole-store cross references (facts nobody
  // references, parents of parents) are not available and not required.
  check(s,{partial=false}={}) {
    if(s.version!==1 || !Array.isArray(s.operations) || !Array.isArray(s.facts))throw unavailable();
    const ops=new Set(),facts=new Map();
    for(const f of s.facts){
      if(facts.has(f.key))throw unavailable();facts.set(f.key,f);
      if(partial&&(f.key!==f.scope+'|'+f.sourceKey || f.canonicalPayload!==canonical(JSON.parse(f.canonicalPayload))))throw unavailable();
    }
    for(const o of s.operations){
      if(ops.has(o.key))throw unavailable();ops.add(o.key);
      const f=facts.get(o.factKey);if(!f || f.scope!==o.scope)throw unavailable();
      const op=validateOperation({ operationId:o.operationId,payloadHash:o.payloadHash,
        canonicalEnvelope:canonical({...o.header,payload:JSON.parse(f.canonicalPayload)}),dependencies:o.dependencies,leaseId:o.receipt.receiptId,attempt:1 });
      if(f.canonicalPayload!==canonical(JSON.parse(f.canonicalPayload)) || f.type!==op.envelope.type || f.gameId!==op.envelope.gameId || f.sourceId!==op.sourceId ||
         op.factDigest!==f.factDigest || o.receipt.operationId!==o.operationId || o.receipt.payloadHash!==o.payloadHash ||
         o.key!==o.receipt.technicalAccountId+':'+o.operationId || o.scope!==scope(o.receipt) || f.key!==o.scope+'|'+op.envelope.sourceKey ||
         !receiptSchema.safeParse(o.receipt).success || !['committed','duplicate','superseded'].includes(o.receipt.acceptedAs))throw unavailable();
    }
    if(!partial) {
      const references=new Set(s.operations.map(o=>o.factKey)),byOperation=new Map(s.operations.map(o=>[o.key,o]));
      if(s.facts.some(f=>!references.has(f.key)))throw unavailable();
      for(const o of s.operations)if(o.dependencies.some(id=>byOperation.get(o.receipt.technicalAccountId+':'+id)?.scope!==o.scope))throw unavailable();
    }
  }
  async load() {
    try {
      const s=this.store?await this.store.load():structuredClone(this.state);
      if(s.version!==1 || !Array.isArray(s.operations) || !Array.isArray(s.facts) || s.operations.length>10000 || s.facts.length>10000 || Buffer.byteLength(JSON.stringify(s))>2*1024*1024)throw unavailable();
      this.check(s);
      return s;
    }catch{throw unavailable();}
  }
  async loadScoped(context,op) {
    try {
      const s=await this.store.loadFor(context,op);
      this.check(s,{partial:true});
      return s;
    }catch(error){if(error instanceof IngestionError)throw error;throw unavailable();}
  }
  async snapshot(){return structuredClone(await this.load());}
  async transaction(work) { return work(); }
  async afterStorageCommit() { await this.afterCommit(); }
  async afterTransactionCommit() {}
  async acceptOperation(context,op,signal) {
    assertSyncContext(context,this.identityRepository);
    const result=await this.coordinator.run(()=>this.transaction(async()=>{
      checkBudget(signal);await context.validate();checkBudget(signal);
      const scoped=this.scoped,own=scope(context),e=op.envelope;
      if(e.installationId!==context.installationId || e.localPlayerId!==context.localPlayerId || e.bindingGeneration!==context.bindingGeneration)throw new IngestionError(403,'forbidden');
      const s=scoped?await this.loadScoped(context,op):await this.load();
      const old=s.operations.find(o=>o.key===key(context,op.operationId));
      const dependencies=[...op.dependencies].sort();
      if(old){
        if(old.scope!==own)throw new IngestionError(403,'forbidden');
        const f=s.facts.find(f=>f.key===old.factKey);
        if(old.payloadHash!==op.payloadHash || canonical({...old.header,payload:JSON.parse(f.canonicalPayload)})!==op.canonicalEnvelope || canonical(old.dependencies)!==canonical(dependencies))throw conflict('idempotency_conflict');
        return { status:'duplicate',receipt:structuredClone(old.receipt) };
      }
      const parents=dependencies.map(id=>s.operations.find(o=>o.key===key(context,id)&&o.scope===own));
      if(parents.some(p=>!p))throw deferred();
      const ownedFacts=s.facts.filter(f=>f.scope===own),factKey=own+'|'+e.sourceKey;
      let fact=s.facts.find(f=>f.key===factKey),status='committed',newFact=null;
      if(fact){if(fact.factDigest!==op.factDigest)throw conflict();status='duplicate';}
      else {
        validateRelations(ownedFacts,op,parents.map(o=>s.facts.find(f=>f.key===o.factKey)));
        if(e.type==='game.report' && ownedFacts.some(f=>f.type===e.type && f.gameId===e.gameId && JSON.parse(f.canonicalPayload).revision>e.payload.revision))status='superseded';
        fact={key:factKey,scope:own,sourceKey:e.sourceKey,type:e.type,sourceId:op.sourceId,gameId:e.gameId,
          canonicalPayload:canonical(e.payload),factDigest:op.factDigest};s.facts.push(fact);newFact=fact;
      }
      // Alias still has to carry equivalent typed parents, not arbitrary already-accepted UUIDs.
      if(status==='duplicate'){
        const first=s.operations.find(o=>o.factKey===factKey);
        const parentKeys=rows=>rows.map(o=>o.factKey).sort();
        const prior=first.dependencies.map(id=>s.operations.find(o=>o.key===key(context,id)&&o.scope===own));
        if(canonical(parentKeys(parents))!==canonical(parentKeys(prior)))throw conflict('dependency_conflict');
      }
      // Capacity is per owner: one player's history can exhaust that player's quota only. The whole-store valve is a separate, much larger bound.
      if((scoped?s.ownCount:s.operations.length)>=this.maxRecords)throw new IngestionError(429,'quota_exceeded',true);
      if(scoped&&await this.store.total()>=this.maxTotalRecords)throw new IngestionError(429,'quota_exceeded',true);
      const committedAtUtc=new Date(this.now()).toISOString();
      const receipt=receiptSchema.parse({receiptVersion:1,operationContractVersion:1,technicalAccountId:context.technicalAccountId,
        operationId:op.operationId,localPlayerId:context.localPlayerId,installationId:context.installationId,bindingGeneration:context.bindingGeneration,
        payloadHash:op.payloadHash,receiptId:randomUUID(),committedAtUtc,acceptedAs:status});
      const {payload,...header}=e;
      const record={key:key(context,op.operationId),scope:own,operationId:op.operationId,factKey,header,payloadHash:op.payloadHash,dependencies,receivedAtUtc:committedAtUtc,receipt};
      s.operations.push(record);
      if(!scoped&&Buffer.byteLength(JSON.stringify(s))>2*1024*1024)throw new IngestionError(429,'quota_exceeded',true);
      await this.beforeCommit();checkBudget(signal);await context.validate();checkBudget(signal);
      if(scoped)await this.store.commitDelta({fact:newFact,operation:record});          // only what this operation adds
      else if(this.store)await this.store.commit(s);else this.state=s;
      await this.afterStorageCommit();
      return {status,receipt:structuredClone(receipt),newlyStored:true};
    }));
    if(result.newlyStored){delete result.newlyStored;await this.afterTransactionCommit();}
    return result;
  }
  async findReceipts(context,descriptors,signal) {
    assertSyncContext(context,this.identityRepository);
    return this.coordinator.run(()=>this.transaction(async()=>{
      checkBudget(signal);await context.validate();
      const s=this.scoped?await this.store.receiptsFor(context,descriptors):await this.load();
      return descriptors.map(d=>{
        const o=s.operations.find(o=>o.key===key(context,d.operationId)&&o.scope===scope(context));
        if(!o)return {operationId:d.operationId,status:'not_found'};
        if(o.payloadHash!==d.payloadHash)throw conflict('idempotency_conflict');
        return {operationId:d.operationId,status:'found',receipt:structuredClone(o.receipt),attempt:{leaseId:d.leaseId,attempt:d.attempt}};
      });
    }));
  }
}
