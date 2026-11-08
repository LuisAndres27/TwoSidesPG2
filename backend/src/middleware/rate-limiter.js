import { ApiError, unavailable } from '../utils/errors.js';

export const RATE_POLICY = Object.freeze({
  registrationAttempts: 20, registrationWindow: 60_000,
  creationsPerIp: 5, creationsGlobal: 100, creationWindow: 3_600_000,
  sessionAttempts: 30, sessionWindow: 300_000,
  sessionFailures: 5, failureWindow: 900_000,
  meAttempts: 120, meWindow: 60_000,
});

export class RateLimiter {
  #entries = new Map();
  constructor({ now = Date.now, maxEntries = 10_000 } = {}) { Object.assign(this, { now, maxEntries }); }

  #times(key, window) {
    const now = this.now();
    const entry = this.#entries.get(key);
    const times = entry?.times.filter(time => time > now - window) ?? [];
    if (times.length) this.#entries.set(key, { times, window });
    else this.#entries.delete(key);
    return times;
  }

  check(key, limit, window) {
    const times = this.#times(key, window);
    if (times.length >= limit) throw new ApiError(429, 'rate_limited', Math.max(1, Math.ceil((times[0] + window - this.now()) / 1000)));
  }

  consume(key, limit, window) {
    this.check(key, limit, window);
    if (!this.#entries.has(key) && this.#entries.size >= this.maxEntries) {
      for (const [storedKey, entry] of this.#entries) this.#times(storedKey, entry.window);
      if (this.#entries.size >= this.maxEntries) throw unavailable();
    }
    const times = this.#times(key, window);
    times.push(this.now());
    this.#entries.set(key, { times, window });
  }

  clear(key) { this.#entries.delete(key); }
}
