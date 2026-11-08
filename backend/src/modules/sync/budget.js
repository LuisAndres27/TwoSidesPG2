import { performance } from 'node:perf_hooks';
import { unavailable } from './errors.js';

// Operation budget with a COMMIT GATE (F2, B36/B37).
//   PRE        the operation budget (<= 2000 ms, unchanged) governs everything before the commit point. If it expires the transaction is aborted by the next checkBudget() inside
//              the callback (nothing is persisted) and the caller gets 503.
//   COMMIT     entered by commitPoint(): ONE synchronous step (budget check + mark), so the timer cannot fall between the check and the mark. From then on the budget timer never
//              rejects: the commit cannot be cancelled, so a timeout must not be read as an abort. The caller waits for the real outcome up to a bounded grace.
//   Outcomes   committed (the transaction resolved) -> returned even if the budget expired meanwhile; aborted (known) or unknown (grace expired / commit error without proof of abort)
//              -> the same public 503 `storage_unavailable`; the internal distinction travels on a NON-enumerable `commitOutcome` property used only by the service (D1).
const deadlines = new WeakMap(), gates = new WeakMap();
export const COMMIT_GRACE_MS = 3000;

// Minimal in-memory counters (D5): commit states only, no identifiers, no payloads.
const stats = { committed: 0, lateCommitted: 0, aborted: 0, unknown: 0, preDeadline: 0, graceExpired: 0, orphanSettledCommitted: 0, orphanFailed: 0 };
export const commitStats = () => ({ ...stats });
export const resetCommitStats = () => { for (const k of Object.keys(stats)) stats[k] = 0; };

export function checkBudget(signal) {
  if(signal && (signal.aborted || performance.now()>deadlines.get(signal)))throw unavailable();
}
// A new transaction attempt (the driver may run the callback again): back to PRE, so the budget applies again. No-op without a bounded signal.
export function beginAttempt(signal) {
  const gate=signal&&gates.get(signal);if(gate){gate.phase='pre';gate.outcome=null;}
}
// The point of no return. SYNCHRONOUS: check the budget and mark COMMIT with no await in between.
export function commitPoint(signal) {
  checkBudget(signal);
  const gate=signal&&gates.get(signal);if(gate){gate.phase='commit';gate.enteredAt=performance.now();}
}
// Called by the repository when the transaction fails: classifies what is known about the commit. Nothing here changes the error that is thrown.
const ABORT_LABELS=['TransientTransactionError'];
export function noteTransactionFailure(signal,error) {
  const gate=signal&&gates.get(signal);if(!gate)return;
  if(gate.phase!=='commit'){gate.outcome='aborted';return;}                                   // failed before the commit point: the transaction was rolled back
  const labels=l=>typeof error?.hasErrorLabel==='function'&&error.hasErrorLabel(l);
  gate.outcome=ABORT_LABELS.some(labels)&&!labels('UnknownTransactionCommitResult')||error?.code===251?'aborted':'unknown';   // 251 = NoSuchTransaction
}
const tag=(error,outcome)=>{if(error&&typeof error==='object'&&outcome)Object.defineProperty(error,'commitOutcome',{value:outcome,enumerable:false,configurable:true});return error;};

// work(signal) -> result. `graceMs`: maximum wait for the commit once the commit point was reached. `hardDeadline`: absolute performance.now() value (end of the batch) that
// the grace must never exceed (no floor: if the batch is out of time the wait ends there).
export async function bounded(work,milliseconds,{graceMs=COMMIT_GRACE_MS,hardDeadline=Infinity}={}) {
  const controller=new AbortController(),signal=controller.signal,gate={phase:'pre',outcome:null,enteredAt:0};
  deadlines.set(signal,performance.now()+milliseconds);gates.set(signal,gate);
  let timer,graceTimer,timerDecided=false;
  const job=Promise.resolve().then(()=>{checkBudget(signal);return work(signal);})
    .then(result=>{
      if(gate.phase==='commit'){if(!timerDecided&&performance.now()>deadlines.get(signal))stats.lateCommitted++;}   // confirmed commit: never turned into a failure by the clock
      else {try{checkBudget(signal);}catch(e){controller.abort();throw e;}}                                         // no commit gate (non-transactional store): legacy post-check
      return result;
    });
  try {
    const result=await Promise.race([job,new Promise((_,reject)=>{
      const decide=(error,outcome)=>{timerDecided=true;reject(tag(error,outcome));};
      const expirePre=()=>{controller.abort();stats.preDeadline++;stats.aborted++;decide(unavailable(),'aborted');};
      timer=setTimeout(()=>{
        if(gate.phase!=='commit'){expirePre();return;}
        // Commit phase: wait for the real outcome, bounded by the grace measured from the commit point and by the end of the batch (no floor).
        const wait=Math.max(0,Math.min(gate.enteredAt+graceMs,hardDeadline)-performance.now());
        graceTimer=setTimeout(()=>{
          if(gate.phase!=='commit'){expirePre();return;}           // the driver re-ran the callback: back in PRE and out of time
          // Unknown outcome. The abort flag only stops a RE-RUN of the callback (PRE check); it cannot and does not cancel a commit already in flight.
          controller.abort();stats.graceExpired++;stats.unknown++;decide(unavailable(),'unknown');
        },wait);
      },milliseconds);
    })]);
    stats.committed++;return result;
  } catch(error) {
    if(!timerDecided){                                              // the job itself failed before any timer decided
      const outcome=gate.outcome??(gate.phase==='commit'?'unknown':'aborted');
      if(outcome==='unknown')stats.unknown++;else stats.aborted++;
      tag(error,outcome);
    }
    throw error;
  } finally {
    clearTimeout(timer);clearTimeout(graceTimer);
    // If a timer decided first the transaction may still finish (or fail) later: observe it (counters only) so it can never become an unhandled rejection.
    if(timerDecided)job.then(()=>{stats.orphanSettledCommitted++;},()=>{stats.orphanFailed++;});
    deadlines.delete(signal);
  }
}
