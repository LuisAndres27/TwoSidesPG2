import { performance } from 'node:perf_hooks';

// F2 test support (B36/B37): fault and latency injection AROUND the commit of the Mongo double, without editing mongo-double.js.
// The wrapper sits on connection.startSession().withTransaction, so it also composes with latency-harness `instrumented` (which wraps the same method).
//   spec (one per withTransaction call, chosen by ctl.plan(n) or armed once with ctl.arm(spec)):
//     preDelayMs / retryPreDelayMs  sleep BEFORE the real work of the first / of later attempts        (PRE phase: the 2000 ms style deadline applies)
//     block                         synchronous busy wait AFTER the work returned (event loop starved: no timer can fire)      -> "success known after the deadline"
//     applyDelayMs                  sleep after the callback returned and BEFORE the double applies the writes                  -> commit takes long, rows appear late
//     ackDelayMs                    the double applies the writes at once, the reply (commit acknowledgement) is delayed        -> late success
//     mode: 'unknown-applied' | 'unknown-not-applied' | 'abort-commit' | 'transient-once'
const nap = ms => new Promise(resolve => setTimeout(resolve, ms));
const busy = ms => { const end = performance.now() + ms; while (performance.now() < end); };
const labeled = (message, label, code) => Object.assign(new Error(message), { code, hasErrorLabel: l => l === label });

export function faults(db) {
  const ctl = { calls: 0, attempts: 0, plan: () => null, inflight: new Set(), armed: null };
  ctl.arm = spec => { ctl.armed = spec; };
  ctl.reset = () => { ctl.calls = 0; ctl.attempts = 0; ctl.armed = null; ctl.plan = () => null; };
  ctl.settle = async () => { while (ctl.inflight.size) await Promise.allSettled([...ctl.inflight]); };
  const start = db.connection.startSession.bind(db.connection);
  db.connection.startSession = async () => {
    const session = await start(), original = session.withTransaction.bind(session);
    session.withTransaction = (work, options) => {
      const n = ++ctl.calls, spec = ctl.armed ?? ctl.plan(n) ?? {}; ctl.armed = null;
      let attempt = 0;
      const wrapped = async () => {
        attempt++; ctl.attempts++;
        const pre = attempt === 1 ? spec.preDelayMs : spec.retryPreDelayMs;
        if (pre) await nap(pre);
        const result = await work();
        if (spec.block) busy(spec.block);
        if (spec.applyDelayMs && attempt === 1) await nap(spec.applyDelayMs);
        if (spec.mode === 'unknown-not-applied') throw labeled('Unknown commit result (not applied)', 'UnknownTransactionCommitResult');
        if (spec.mode === 'abort-commit') throw labeled('Transaction aborted at commit', 'TransientTransactionError', 251);
        if (spec.mode === 'transient-once' && attempt === 1) throw labeled('Transient error at commit', 'TransientTransactionError', 112);
        return result;
      };
      if (spec.mode === 'unknown-applied') db.failure = 'unknown';
      const run = (async () => { const out = await original(wrapped, options); if (spec.ackDelayMs) await nap(spec.ackDelayMs); return out; })();
      ctl.inflight.add(run); run.then(() => ctl.inflight.delete(run), () => ctl.inflight.delete(run));
      return run;
    };
    return session;
  };
  return ctl;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
