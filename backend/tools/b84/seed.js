// B84 — sends the synthetic events through the REAL ingestion endpoint (POST /api/v1/statistics/events), so every event passes the
// statistics-only-v1 validation, the technical authentication, the idempotent transaction and the receipt logic. Counters are never edited.
import {generateDemoEvents,toEnvelope} from './generator.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function seedThroughHttp({baseUrl,issue,events=generateDemoEvents().events,onProgress=()=>{}}){
 const byInstallation=new Map();
 for(const item of events){if(!byInstallation.has(item.installationId))byInstallation.set(item.installationId,[]);byInstallation.get(item.installationId).push(item);}
 const tokens=new Map();for(const id of byInstallation.keys())tokens.set(id,issue(id));
 const tally={accepted:0,duplicate:0,rejected:0,retryable:0,requests:0,replayedBatches:0,codes:{}};let batchNumber=0;
 const count=r=>{tally[r.Status]++;if(r.Code)tally.codes[r.Code]=(tally.codes[r.Code]??0)+1;};
 const post=async(installationId,items)=>{
  for(let attempt=0;attempt<6;attempt++){
   tally.requests++;
   const response=await fetch(baseUrl+'/api/v1/statistics/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.get(installationId)},body:JSON.stringify(toEnvelope(items))});
   if(response.status===429||response.status>=500){await pause(200*(attempt+1));continue;}
   if(response.status!==200)throw Error('B84 seed: unexpected HTTP status '+response.status);
   const {Receipts}=await response.json();
   // accepted / duplicate / rejected are final; only 'retryable' events are resent.
   for(const r of Receipts)if(r.Status!=='retryable')count(r);
   const pending=Receipts.filter(r=>r.Status==='retryable');tally.retryable+=pending.length;
   if(!pending.length)return;
   items=items.filter(x=>pending.some(r=>r.EventId===x.event.EventId));await pause(100*(attempt+1));
  }
  throw Error('B84 seed: batch could not be completed');
 };
 const sent=[];
 for(const [installationId,items] of byInstallation){
  for(let i=0;i<items.length;i+=5){
   const batch=items.slice(i,i+5);await post(installationId,batch);sent.push([installationId,batch]);batchNumber++;
   // Controlled retry simulation (deterministic): every 23rd batch is resent immediately, as if the first response had been lost.
   if(batchNumber%23===0){tally.replayedBatches++;await post(installationId,batch);}
   if(batchNumber%50===0)onProgress({batches:batchNumber});
  }
 }
 // Final replay of the first 40 batches: the idempotency guarantee, observable.
 for(const [installationId,batch] of sent.slice(0,40)){tally.replayedBatches++;await post(installationId,batch);}
 return {tally,distinctEvents:events.length,batches:batchNumber};
}
