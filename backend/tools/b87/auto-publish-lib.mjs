// B87 — scheduling core of the automatic local publisher. Pure: no Atlas, no driver, no environment, no secrets (it receives two async functions).
//   fingerprint(): a short digest of the source counters (or null when it cannot tell)   publish(): runs the EXISTING publish action and returns {documents}
// Guarantees: one cycle at a time (the next waits for the end of a slow one, measured start-to-start), publish only when the fingerprint changed since the last
// SUCCESSFUL publish, failures never stop the loop (exponential backoff, one sanitized line), stop() waits for the cycle in flight and starts no other.
export const MIN_INTERVAL_MS=60000,BACKOFF_BASE_MS=15000,BACKOFF_MAX_MS=600000;
const defaultSleep=(ms,signal)=>new Promise(resolve=>{if(signal.aborted)return resolve();const t=setTimeout(done,ms);function done(){signal.removeEventListener('abort',done);clearTimeout(t);resolve();}signal.addEventListener('abort',done,{once:true});});
const clock=date=>date.toTimeString().slice(0,8);

export function createAutoPublisher({fingerprint,publish,describeError=()=>'error',intervalMs,minIntervalMs=MIN_INTERVAL_MS,backoffBaseMs=BACKOFF_BASE_MS,backoffMaxMs=BACKOFF_MAX_MS,
 sleep=defaultSleep,now=()=>new Date(),monotonic=()=>Date.now(),log=()=>{}}={}){
 if(typeof fingerprint!=='function'||typeof publish!=='function')throw Error('Auto publisher needs fingerprint and publish');
 if(!Number.isInteger(intervalMs)||intervalMs<minIntervalMs)throw Error('Interval below the minimum');
 const abort=new AbortController(),state={cycles:0,published:0,skipped:0,failures:0,consecutiveFailures:0,running:false,maxConcurrent:0};
 let lastFingerprint,loop;
 const line=(message)=>{try{log(`${clock(now())} ${message}`);}catch{/* logging never breaks the loop */}};
 async function cycle(){
  state.running=true;state.maxConcurrent=Math.max(state.maxConcurrent,1);state.cycles++;
  try{
   const fp=await fingerprint();
   if(fp!==null&&fp!==undefined&&fp===lastFingerprint){state.skipped++;line('sin cambios (no se publica)');}
   else{const result=await publish();lastFingerprint=fp??undefined;state.published++;line(`publicado: ${result?.documents??'?'} documentos`);}
   state.consecutiveFailures=0;
  }catch(error){
   state.failures++;state.consecutiveFailures++;
   let text='error';try{text=String(describeError(error)).replace(/\s*\r?\n\s*/g,' | ').slice(0,300);}catch{/* keep the fixed word */}
   line(`error: ${text}`);
  }finally{state.running=false;}
 }
 async function run(){
  while(!abort.signal.aborted){
   const started=monotonic();
   await cycle();
   if(abort.signal.aborted)break;
   const backoff=state.consecutiveFailures?Math.min(backoffMaxMs,backoffBaseMs*2**(state.consecutiveFailures-1)):0;
   const wait=state.consecutiveFailures?Math.max(backoff,0):Math.max(0,intervalMs-(monotonic()-started));
   if(state.consecutiveFailures)line(`reintento en ${Math.round(wait/1000)} s`);
   await sleep(wait,abort.signal);
  }
 }
 return {state,
  start(){if(loop)return loop;loop=run();return loop;},
  async stop(){abort.abort();if(loop)await loop;}};
}
