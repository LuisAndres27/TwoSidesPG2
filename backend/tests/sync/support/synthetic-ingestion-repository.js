import { IngestionEngine } from '../../../src/modules/sync/ingestion-engine.js';
import { EncryptedStore } from '../../identity-persistence/support/encrypted-store.js';

// File/memory harness; domain validation is shared with the MongoDB adapter.
export class SyntheticIngestionRepository extends IngestionEngine {
  static async open(options) {
    const store = new EncryptedStore({ ...options, name:'ingestion' });
    if(options.initialize) await store.initialize({ version:1, operations:[], facts:[] });
    const repository = new SyntheticIngestionRepository({ ...options, store });
    await repository.load(); return repository;
  }
}