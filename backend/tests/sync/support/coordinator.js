export { checkBudget } from '../../../src/modules/sync/budget.js';
import { EncryptedStore } from '../../identity-persistence/support/encrypted-store.js';

// Common fence for identity mutations and ingestion commits. Not a production/distributed lock.
export class SyntheticCoordinator {
  constructor(options) { this.tail = Promise.resolve(); this.store = options ? new EncryptedStore({ ...options, name:'coordination' }) : null; }
  async run(operation) {
    if (this.store) return this.store.exclusive(operation);
    const previous = this.tail; let release;
    this.tail = new Promise(resolve => { release = resolve; });
    try { await previous; return await operation(); } finally { release(); }
  }
}
