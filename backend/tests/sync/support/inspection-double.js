import { MAIN_SCHEMA } from '../../../src/main/schema-inventory.js';
import { MAIN_TARGET } from '../../../src/main/administrative-policy.js';

// A MongoDB DOUBLE for the read-only inspection. Every property of the database and of each collection is a Proxy trap: only the operations the tool may use
// exist; anything else (insert, update, delete, createIndex, drop, ...) is recorded in `forbidden` and throws. `log` is the exact list of operations performed.
export const ALLOWED = Object.freeze(['connectionStatus', 'hello', 'listCollections', 'listIndexes', 'estimatedDocumentCount', 'findOne:seed']);
const index = (name, key, extra = {}) => ({ v: 2, name, key, ...extra });
export const idIndex = () => index('_id_', { _id: 1 });
export const requiredIndexes = definition => [idIndex(), ...definition.indexes.map(i => index(i.name, i.key, { unique: true }))];
export function fullSchema() {
  const collections = {};
  for (const definition of Object.values(MAIN_SCHEMA.collections)) collections[definition.name] = { indexes: requiredIndexes(definition), count: 0 };
  return collections;
}
const privileges = (actions = ['find', 'listCollections', 'listIndexes', 'collStats']) => [{ resource: { db: MAIN_TARGET.database, collection: '' }, actions }];
export const statusFor = ({ user = 'twosides_inspector', role = 'read', actions } = {}) => ({ ok: 1, authInfo: { authenticatedUsers: [{ user, db: 'admin' }],
  authenticatedUserRoles: [{ role, db: MAIN_TARGET.database }], authenticatedUserPrivileges: privileges(actions) } });

export function inspectionDouble({ user = 'twosides_inspector', collections = fullSchema(), seed = { _id: 'ingestion-v1', revision: 0, tokenHash: 'SECRET-SHOULD-NEVER-APPEAR' }, status, replicaSet = true,
  failOn = null, types = {}, options = {}, mechanisms = ['SCRAM-SHA-256', 'SCRAM-SHA-1'] } = {}) {
  const state = { log: [], forbidden: [], closed: 0, connects: 0, optionsSeen: [], uriSeen: [] };
  const trap = (target, scope) => new Proxy(target, { get(t, prop) {
    if (prop === 'then') return undefined;
    if (prop in t) return t[prop];
    return (...args) => { state.forbidden.push(scope + '.' + String(prop)); throw new Error('FORBIDDEN_OPERATION ' + scope + '.' + String(prop)); };
  } });
  const record = (op, error) => { state.log.push(op); if (failOn === op) throw error ?? Object.assign(new Error('not authorized'), { code: 13, codeName: 'Unauthorized' }); };
  const collectionFor = name => trap({
    async indexes() { record('listIndexes'); return structuredClone(collections[name].indexes); },
    async estimatedDocumentCount() { record('estimatedDocumentCount'); return collections[name].count; },
    async findOne(filter, opt) { record('findOne:seed'); if (name !== MAIN_SCHEMA.collections.fences.name || filter?._id !== 'ingestion-v1' || JSON.stringify(opt) !== JSON.stringify({ projection: { revision: 1 } })) throw new Error('UNEXPECTED_READ'); return seed ? structuredClone(seed) : null; },
  }, 'collection:' + name);
  const db = trap({
    databaseName: MAIN_TARGET.database,
    async command(command) { if (command?.connectionStatus !== 1 || command.showPrivileges !== true) throw new Error('UNEXPECTED_COMMAND'); record('connectionStatus'); return structuredClone(status ?? statusFor({ user })); },
    admin() { return trap({ async command(command) { if (command?.hello !== 1 || command.saslSupportedMechs !== `admin.${user}` || Object.keys(command).length !== 2) throw new Error('UNEXPECTED_ADMIN_COMMAND'); record('hello'); return { ...(replicaSet ? { setName: 'atlas-rs' } : {}), isWritablePrimary: true, saslSupportedMechs: mechanisms }; } }, 'admin'); },
    listCollections(filter, opt) { if (JSON.stringify(filter) !== '{}') throw new Error('UNEXPECTED_FILTER'); return { async toArray() { record('listCollections'); return Object.keys(collections).sort().map(name => ({ name, type: types[name] ?? 'collection', options: options[name] ?? {} })); } }; },
    collection(name) { if (!collections[name]) throw new Error('UNKNOWN_COLLECTION'); return collectionFor(name); },
  }, 'db');
  const connection = trap({
    name: MAIN_TARGET.database, readyState: 1, db,
    getClient: () => ({ options: { srvHost: MAIN_TARGET.host, dbName: MAIN_TARGET.database, directConnection: false, tls: true, credentials: { username: user, source: 'admin', mechanism: 'DEFAULT' } } }),
    on: () => connection, asPromise: async () => connection, async close() { state.closed += 1; },
  }, 'connection');
  const mongoose = { createConnection(uri, opt) { state.connects += 1; state.uriSeen.push(uri); state.optionsSeen.push(opt); if (state.rejectWith) throw state.rejectWith; return connection; } };
  return Object.assign(state, { connection, mongoose, collections, user });
}
