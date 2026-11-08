import { MAIN_SCHEMA } from '../../../src/main/schema-inventory.js';
import { MAIN_TARGET } from '../../../src/main/administrative-policy.js';
import { fullSchema, idIndex } from './inspection-double.js';

// A STATEFUL MongoDB DOUBLE for the bootstrap. Writes change the state (so a second run sees the first one's work), but only the three write shapes the tool may
// use exist, with exactly the fixed options; anything else is recorded in `forbidden` and throws. A write aimed at anything but a managed main_v2 collection is
// recorded in `violations`. `writes` lists every write in order; `reads` every read. Nothing here touches a network.
const historicalIndexes = extra => [idIndex(), ...extra];
export const historicalCollections = () => ({
  users: { indexes: historicalIndexes([{ v: 2, name: 'email_1', key: { email: 1 }, unique: true }]), count: 120 },
  decisions: { indexes: historicalIndexes([{ v: 2, name: 'userId_1', key: { userId: 1 } }]), count: 640 },
  gameevents: { indexes: historicalIndexes([]), count: 9000 },
  gameprogresses: { indexes: historicalIndexes([{ v: 2, name: 'userId_1_gameId_1', key: { userId: 1, gameId: 1 }, unique: true }]), count: 300 },
  statisticevents: { indexes: historicalIndexes([]), count: 4000 },
  statisticsummaries: { indexes: historicalIndexes([{ v: 2, name: 'userId_1', key: { userId: 1 }, unique: true }]), count: 120 },
  syncidentities: { indexes: historicalIndexes([{ v: 2, name: 'deviceId_1', key: { deviceId: 1 }, unique: true }]), count: 80 },
});
const ACTIONS = ['find', 'listCollections', 'listIndexes', 'collStats', 'createCollection', 'createIndex', 'insert', 'update', 'remove'];
export const backendStatus = ({ role = 'readWrite', actions = ACTIONS, user = MAIN_TARGET.user } = {}) => ({ ok: 1, authInfo: { authenticatedUsers: [{ user, db: 'admin' }],
  authenticatedUserRoles: [{ role, db: MAIN_TARGET.database }], authenticatedUserPrivileges: [{ resource: { db: MAIN_TARGET.database, collection: '' }, actions }] } });
export const WRITE_CONCERN = { w: 'majority', j: true };

export function bootstrapDouble({ main = {}, seed = null, historical = historicalCollections(), status, mechanisms = ['SCRAM-SHA-1'], replicaSet = true, failOn = null, failCode = 8000,
  types = {}, options = {}, silent = [] } = {}) {
  const state = { reads: [], writes: [], forbidden: [], violations: [], closed: 0, connects: 0, optionsSeen: [], uriSeen: [] };
  const collections = { ...structuredClone(historical), ...structuredClone(main) };
  let seedDoc = seed ? structuredClone(seed) : null;
  const trap = (target, scope) => new Proxy(target, { get(t, prop) {
    if (prop === 'then') return undefined;
    if (prop in t) return t[prop];
    return () => { state.forbidden.push(scope + '.' + String(prop)); throw new Error('FORBIDDEN_OPERATION ' + scope + '.' + String(prop)); };
  } });
  const managed = name => Object.values(MAIN_SCHEMA.collections).some(c => c.name === name);
  const write = (label, name, apply) => {
    if (!managed(name)) { state.violations.push(label); throw new Error('VIOLATION ' + label); }
    if (failOn && label === failOn) throw Object.assign(new Error('injected failure'), { code: failCode });
    if (!silent.includes(label)) apply(); state.writes.push(label);
  };
  const same = (a, b) => JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));
  const concern = o => o && same(o.writeConcern ?? {}, WRITE_CONCERN);
  const collectionFor = name => trap({
    async indexes() { state.reads.push('listIndexes'); return structuredClone(collections[name].indexes); },
    async estimatedDocumentCount() { state.reads.push('estimatedDocumentCount'); return collections[name].count; },
    async findOne(filter, opt) {
      state.reads.push('findOne:seed');
      if (name !== MAIN_SCHEMA.collections.fences.name || filter?._id !== 'ingestion-v1' || JSON.stringify(opt) !== JSON.stringify({ projection: { revision: 1 } })) throw new Error('UNEXPECTED_READ');
      return seedDoc ? structuredClone(seedDoc) : null;
    },
    async createIndex(key, opt) {
      const label = `createIndex:${name}:${opt?.name}`;
      const allowed = managed(name) ? Object.values(MAIN_SCHEMA.collections).find(c => c.name === name).indexes.find(i => i.name === opt?.name) : null;
      if (managed(name) && (!allowed || !same(key, allowed.key) || opt.unique !== true || !concern(opt) || Object.keys(opt).sort().join() !== 'name,unique,writeConcern')) { state.violations.push(label + ':shape'); throw new Error('BAD_INDEX_SHAPE'); }
      write(label, name, () => {
        if (!collections[name]) throw Object.assign(new Error('NamespaceNotFound'), { code: 26 });
        const found = collections[name].indexes.find(i => i.name === opt.name), byKey = collections[name].indexes.find(i => same(i.key, key));
        if (found && !same(found.key, key)) throw Object.assign(new Error('IndexKeySpecsConflict'), { code: 86 });
        if (byKey && byKey.name !== opt.name) throw Object.assign(new Error('IndexOptionsConflict'), { code: 85 });
        if (!found) collections[name].indexes.push({ v: 2, name: opt.name, key: structuredClone(key), unique: true });
      });
    },
    async updateOne(filter, update, opt) {
      const label = 'seedUpsert';
      if (name !== MAIN_SCHEMA.collections.fences.name || !same(filter, { _id: 'ingestion-v1' }) || !same(update, { $setOnInsert: { revision: 0 } }) || opt?.upsert !== true || !concern(opt)) { state.violations.push('updateOne:' + name); throw new Error('BAD_UPDATE_SHAPE'); }
      write(label, name, () => { if (!collections[name]) throw Object.assign(new Error('NamespaceNotFound'), { code: 26 }); seedDoc ??= { _id: 'ingestion-v1', revision: 0 }; });
    },
  }, 'collection:' + name);
  const db = trap({
    databaseName: MAIN_TARGET.database,
    async command(command) { if (command?.connectionStatus !== 1 || command.showPrivileges !== true) throw new Error('UNEXPECTED_COMMAND'); state.reads.push('connectionStatus'); return structuredClone(status ?? backendStatus()); },
    admin() { return trap({ async command(command) { if (command?.hello !== 1 || command.saslSupportedMechs !== `admin.${MAIN_TARGET.user}`) throw new Error('UNEXPECTED_ADMIN_COMMAND'); state.reads.push('hello'); return { ...(replicaSet ? { setName: 'atlas-rs' } : {}), isWritablePrimary: true, saslSupportedMechs: mechanisms }; } }, 'admin'); },
    listCollections(filter) { if (JSON.stringify(filter) !== '{}') throw new Error('UNEXPECTED_FILTER'); return { async toArray() { state.reads.push('listCollections'); return Object.keys(collections).sort().map(name => ({ name, type: types[name] ?? 'collection', options: options[name] ?? {} })); } }; },
    collection(name) { if (!collections[name]) throw Object.assign(new Error('UNKNOWN_COLLECTION'), { code: 26 }); return collectionFor(name); },
    async createCollection(name, opt) {
      const label = `createCollection:${name}`;
      if (managed(name) && !(Object.keys(opt ?? {}).join() === 'writeConcern' && concern(opt))) { state.violations.push(label + ':shape'); throw new Error('BAD_COLLECTION_SHAPE'); }
      write(label, name, () => { if (collections[name]) throw Object.assign(new Error('NamespaceExists'), { code: 48 }); collections[name] = { indexes: [idIndex()], count: 0 }; });
    },
  }, 'db');
  const connection = trap({
    name: MAIN_TARGET.database, readyState: 1, db,
    getClient: () => ({ options: { srvHost: MAIN_TARGET.host, dbName: MAIN_TARGET.database, directConnection: false, tls: true, credentials: { username: MAIN_TARGET.user, source: 'admin', mechanism: 'DEFAULT' } } }),
    on: () => connection, asPromise: async () => connection, async close() { state.closed += 1; },
  }, 'connection');
  const mongoose = { createConnection(uri, opt) { state.connects += 1; state.uriSeen.push(uri); state.optionsSeen.push(opt); if (state.rejectWith) throw state.rejectWith; return connection; } };
  Object.assign(state, { connection, mongoose, collections });
  Object.defineProperty(state, 'seed', { get: () => seedDoc, enumerable: true });
  return state;
}
export const completeMain = () => fullSchema();
