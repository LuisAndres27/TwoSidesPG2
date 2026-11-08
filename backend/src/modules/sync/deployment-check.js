import { performance } from 'node:perf_hooks';

// F1 (B33 5.1): cache of the DEPLOYMENT checks only (replica set / writable primary, index definitions, seed document). It never holds identity, session, guard,
// authorization, quota or idempotency data: its whole state is {verifiedAt, generation}. A check is recorded only after a successful LIVE verification made by the
// owner of this instance; callers cannot seed it. Every failure is fail-closed and never cached. The cheap in-process boundary assertions (scope, models, connection
// options) are NOT cached: the repositories run them on every operation.
export const DEPLOYMENT_TTL_MS = 30000;

export class DeploymentCheck {
  #verifiedAt = null;       // monotonic milliseconds of the last successful live verification
  #generation = 0;          // bumped by every invalidation; a verification started before it cannot be recorded afterwards
  #inflight = null;         // { promise, generation }: concurrent callers share ONE verification
  #now;
  #ttlMs;
  constructor({ ttlMs = DEPLOYMENT_TTL_MS, now = () => performance.now() } = {}) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > DEPLOYMENT_TTL_MS || typeof now !== 'function') throw new Error('Invalid deployment cache configuration');
    this.#ttlMs = ttlMs; this.#now = now;
  }
  get fresh() { return this.#verifiedAt !== null && this.#now() - this.#verifiedAt < this.#ttlMs && this.#now() >= this.#verifiedAt; }
  get generation() { return this.#generation; }
  invalidate() { this.#generation++; this.#verifiedAt = null; this.#inflight = null; }
  // `verify` performs the live verification and THROWS on any incompatibility. Concurrent callers of the same generation await the same promise.
  async ensure(verify) {
    if (this.fresh) return;
    if (this.#inflight && this.#inflight.generation === this.#generation) return this.#inflight.promise;
    const generation = this.#generation;
    const entry = { generation, promise: null };
    entry.promise = (async () => {
      await verify();
      if (generation === this.#generation) this.#verifiedAt = this.#now();     // an invalidation that happened meanwhile wins: nothing is recorded
    })().finally(() => { if (this.#inflight === entry) this.#inflight = null; });
    this.#inflight = entry;
    return entry.promise;
  }
}

// Invalidates `check` on every connection or topology event that can change the deployment (see B33 5.3). Defensive: a connection without an event API (test doubles)
// simply has no listeners. Listeners are removed when the connection closes (scope closure). Returns the disposer.
const CONNECTION_EVENTS = ['close', 'disconnected', 'reconnected', 'error'];
const TOPOLOGY_EVENTS = ['serverDescriptionChanged', 'topologyDescriptionChanged'];
export function watchConnection(connection, check) {
  const attached = [];
  const bump = () => check.invalidate();
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; for (const [emitter, event, handler] of attached) { try { emitter.removeListener?.(event, handler); } catch { /* closing */ } } attached.length = 0; };
  const onClose = () => { bump(); dispose(); };
  const attach = (emitter, event, handler) => { if (typeof emitter?.on === 'function') { try { emitter.on(event, handler); attached.push([emitter, event, handler]); } catch { /* no events available */ } } };
  for (const event of CONNECTION_EVENTS) attach(connection, event, event === 'close' ? onClose : bump);
  let client; try { client = typeof connection?.getClient === 'function' ? connection.getClient() : null; } catch { client = null; }
  for (const event of TOPOLOGY_EVENTS) attach(client, event, bump);
  return dispose;
}

// Optional proactive refresh so a request never has to pay the live verification (B33 5.3 item 7). OFF unless a positive interval below the TTL is given; the timer
// is unref'ed, stops when `stop()` is called or the connection closes, and its failures only invalidate the cache (the next request then verifies live, fail-closed).
export function keepWarm(check, verify, intervalMs) {
  if (!Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs >= DEPLOYMENT_TTL_MS) return () => {};
  const timer = setInterval(() => { check.ensure(verify).catch(() => check.invalidate()); }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
