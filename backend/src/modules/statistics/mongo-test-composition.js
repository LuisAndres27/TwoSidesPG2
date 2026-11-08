import {TransactionalStatisticsRepository} from './transactional-repository.js';
import {isB81MongoAdapter} from './mongo-transaction-adapter.js';
import {createHmac} from 'node:crypto';
const repositories=new WeakSet();
export function createB81MongoRepository({profile,adapter,...options}){
 if(!['statistics-b81-local-test','statistics-atlas-prepared'].includes(profile)||!Buffer.isBuffer(options.key)||options.key.length!==32||!isB81MongoAdapter(adapter,createHmac('sha256',options.key).update('key-check').digest('hex')))throw Error('B81 local repository capability required');
 const repository=new TransactionalStatisticsRepository({...options,adapter});repositories.add(repository);return repository;
}
export const isB81MongoRepository=x=>repositories.has(x);
