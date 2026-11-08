import { unavailable } from './errors.js';

export class WorkPool {
  #active = 0;
  #queue = [];
  #peak = 0;

  constructor({ concurrency = 2, maxQueue = 8, waitMs = 2000 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(maxQueue) || maxQueue < 0 || !Number.isFinite(waitMs) || waitMs < 1) {
      throw new Error('Invalid work pool configuration');
    }
    Object.assign(this, { concurrency, maxQueue, waitMs });
  }

  get stats() { return { active: this.#active, queued: this.#queue.length, peak: this.#peak }; }

  #acquire() {
    if (this.#active < this.concurrency) {
      this.#active++;
      this.#peak = Math.max(this.#peak, this.#active);
      return Promise.resolve();
    }
    if (this.#queue.length >= this.maxQueue) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const entry = { resolve, timer: undefined };
      entry.timer = setTimeout(() => {
        const index = this.#queue.indexOf(entry);
        if (index !== -1) this.#queue.splice(index, 1);
        reject(unavailable());
      }, this.waitMs);
      this.#queue.push(entry);
    });
  }

  #release() {
    const next = this.#queue.shift();
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else {
      this.#active--;
    }
  }

  async run(operation) {
    await this.#acquire();
    try { return await operation(); } finally { this.#release(); }
  }
}
