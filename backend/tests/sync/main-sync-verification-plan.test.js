import './support/isolation-guard.js';
import { afterAll, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// B31: the read-only verification of the synthetic run is only PREPARED. Offline: a fake database, no network, no Atlas, no server.
const backend = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tpl = name => fs.readFileSync(path.join(backend, 'docs', 'main-sync-test', name), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-vf-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
fs.writeFileSync(path.join(dir, 'verify.mjs'), tpl('verify-synthetic-run.mjs.template'));
const lib = await import(pathToFileURL(path.join(dir, 'verify.mjs')).href);

const sha = text => createHash('sha256').update(text).digest('hex');
function world() {
  const T = randomUUID(), e = { technicalAccountId: T, registrationId: randomUUID(), installationId: randomUUID(), localPlayerId: randomUUID(), operationId: randomUUID(), payloadHash: sha('payload'), factDigest: sha('fact'), sourceKey: 'session:' + randomUUID() + ':open' };
  const scope = [T, e.installationId, e.localPlayerId, 1].join(':'), factKey = scope + '|' + e.sourceKey;
  const docs = {
    main_v2_identities: [{ _id: T, technicalAccountId: T, registrationId: e.registrationId, installationId: e.installationId, localPlayerId: e.localPlayerId, bindingGeneration: 1, credentialVersion: 1, authzVersion: 1, active: true, linked: true, role: 'player', credentialVerifier: '$argon2id$SECRET' }],
    main_v2_ownerGuards: [{ _id: T, revision: 2 }],
    main_v2_identitySessions: [{ _id: randomUUID(), sessionId: randomUUID(), technicalAccountId: T, bindingGeneration: 1, createdAt: 1, expiresAt: 2, revoked: false, tokenHash: 'SECRETHASH' }],
    main_v2_operations: [{ _id: T + ':' + e.operationId, scope, technicalAccountId: T, operationId: e.operationId, authorizationDecision: { owner: T, revision: 2 },
      record: { factKey, payloadHash: e.payloadHash, dependencies: [], receivedAtUtc: '2026-11-02T17:00:00.000Z', receipt: { receiptVersion: 1, technicalAccountId: T, operationId: e.operationId, localPlayerId: e.localPlayerId, installationId: e.installationId, bindingGeneration: 1, payloadHash: e.payloadHash, receiptId: randomUUID(), committedAtUtc: '2026-11-02T17:00:00.123Z', acceptedAs: 'committed' } } }],
    main_v2_facts: [{ _id: factKey, scope, sourceKey: e.sourceKey, record: { factDigest: e.factDigest, type: 'session.report', sourceId: randomUUID(), gameId: null } }],
    main_v2_fences: [{ _id: 'ingestion-v1:' + T, revision: 1 }],
    main_v2_revocations: [],
  };
  return { e, docs };
}
// Fake driver: ONLY collection(name).find(filter,{projection}).limit(n).toArray() exists; anything else throws. Filters are exact-equality on one top-level key.
function fakeDb(docs, calls = []) {
  const strip = (doc, projection) => { const out = {}; for (const k of Object.keys(projection)) { const parts = k.split('.'); let s = doc, t = out; for (let i = 0; i < parts.length - 1; i++) { s = s?.[parts[i]]; if (s === undefined) break; t[parts[i]] ??= {}; t = t[parts[i]]; } if (s !== undefined && s?.[parts.at(-1)] !== undefined) t[parts.at(-1)] = s[parts.at(-1)]; } return { _id: doc._id, ...out }; };
  return { collection: name => ({ find: (filter, options) => { calls.push({ name, filter, projection: options?.projection });
    if (!(name in docs)) throw new Error('unknown collection ' + name);
    const [[k, v]] = Object.entries(filter), rows = docs[name].filter(d => d[k] === v).map(d => strip(d, options.projection));
    return { limit: n => ({ toArray: async () => rows.slice(0, n) }) }; } }) };
}
const run = (w, calls) => lib.verifySyntheticRun(lib.guardedReader(fakeDb(w.docs, calls)), w.e);

it('VF01 a run that matches B29 is "consistent"; reads touch only the seven main_v2 collections of ONE account, by identifier, with no secret field', async () => {
  const w = world(), calls = [], r = await run(w, calls);
  expect(r.verdict).toBe('consistent'); expect(r.failed).toEqual([]);
  expect(r.counts).toEqual({ identities: 1, ownerGuards: 1, identitySessions: 1, operations: 1, facts: 1, fences: 1, revocations: 0 });
  expect(r.receipt).toMatchObject({ acceptedAs: 'committed' }); expect(r.revisionsConsistentWithOneCommit).toBe(true);
  expect(calls.map(c => c.name).sort()).toEqual(['main_v2_facts', 'main_v2_fences', 'main_v2_identities', 'main_v2_identitySessions', 'main_v2_operations', 'main_v2_ownerGuards', 'main_v2_revocations']);
  for (const c of calls) {
    expect(Object.keys(c.filter)).toHaveLength(1);
    expect(Object.values(c.filter)[0]).toMatch(new RegExp(w.e.technicalAccountId + '|' + w.e.registrationId));   // always the run's own identifiers
    expect(JSON.stringify(c.projection)).not.toMatch(/credentialVerifier|tokenHash/);
  }
  expect(JSON.stringify(r)).not.toMatch(/SECRET|argon2/);
});

it('VF02 every discrepancy is reported, never hidden (aborted batch, duplicate, wrong hash, second operation, missing fact, revoked session)', async () => {
  let w = world(); w.docs.main_v2_operations = []; w.docs.main_v2_facts = []; w.docs.main_v2_fences = [];
  let r = await run(w); expect(r.verdict).toBe('inconsistent'); expect(r.failed).toEqual(expect.arrayContaining(['operation_single', 'fact_single', 'fence_present']));
  w = world(); w.docs.main_v2_operations[0].record.receipt.acceptedAs = 'duplicate'; r = await run(w); expect(r.failed).toContain('receipt_accepted_as_committed');
  w = world(); w.docs.main_v2_operations[0].record.receipt.payloadHash = sha('other'); r = await run(w); expect(r.failed).toContain('receipt_payload_hash');
  w = world(); w.docs.main_v2_operations.push({ ...w.docs.main_v2_operations[0], _id: 'x', operationId: randomUUID() }); r = await run(w); expect(r.failed).toContain('operation_single');
  w = world(); w.docs.main_v2_facts[0].record.factDigest = sha('x'); r = await run(w); expect(r.failed).toContain('fact_digest');
  w = world(); w.docs.main_v2_identitySessions[0].revoked = true; r = await run(w); expect(r.failed).toContain('session_matches');
  w = world(); w.docs.main_v2_revocations = [{ _id: 'r', technicalAccountId: w.e.technicalAccountId }]; r = await run(w); expect(r.failed).toContain('revocations_none');
  w = world(); w.docs.main_v2_ownerGuards[0].revision = 1; r = await run(w); expect(r.revisionsConsistentWithOneCommit).toBe(false);   // informative, not a failure
});

it('VF03 the guarded reader refuses historical collections, operators, foreign filters and secret projections', async () => {
  const read = lib.guardedReader(fakeDb(world().docs));
  await expect(read('users', { _id: 'x' }, { _id: 1 })).rejects.toThrow('collection_not_allowed');
  await expect(read('operations', { technicalAccountId: { $ne: 'x' } }, { operationId: 1 })).rejects.toThrow('filter_not_allowed');
  await expect(read('operations', {}, { operationId: 1 })).rejects.toThrow('filter_not_allowed');
  await expect(read('operations', { operationId: 'x' }, { operationId: 1 })).rejects.toThrow('filter_not_allowed');
  await expect(read('identities', { registrationId: 'x' }, { credentialVerifier: 1 })).rejects.toThrow('projection_not_allowed');
  await expect(read('identitySessions', { technicalAccountId: 'x' }, { tokenHash: 1 })).rejects.toThrow('projection_not_allowed');
  await expect(read('identities', { registrationId: 'x' }, {})).rejects.toThrow('projection_not_allowed');
});

it('VF04 the templates contain no write path, no HTTP, no secret in arguments and require explicit enabling', () => {
  const body = tpl('verify-synthetic-run.mjs.template').split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
  expect(body).not.toMatch(/insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite|findOneAnd|\.drop\(|createIndex|createCollection|aggregate|\$set|\$inc|startSession|withTransaction|fetch\(|http\.request|node:http|node:https/);
  expect([...body.matchAll(/\.command\(\{\s*([A-Za-z]+)/g)].map(m => m[1])).toEqual(['connectionStatus']);
  expect(body).toMatch(/--enable-synthetic-verification/);
  expect(body).not.toMatch(/process\.env|\.env\b|console\.log\(/);
  const ps = tpl('run-verify-synthetic.ps1.template').split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
  expect(ps).toMatch(/\[switch\]\$Enable/); expect(ps).toMatch(/Read-Host -Prompt [^\n]*-AsSecureString/); expect(ps).toMatch(/Environment\.Clear\(\)/);
  expect(ps).not.toMatch(/\$info\.Arguments[^\n]*\$(secure|chars|bytes|frame|pass)/i);
  expect(ps).not.toMatch(/SkipCertificateCheck|\.env/);
});

it('VF05 the runner refuses to start without the explicit flag, with a terminal stdin, or with a relative/foreign argument', async () => {
  const out = { write() {} }, stdin = { isTTY: false, on() {}, once() {}, removeListener() {} };
  await expect(lib.main([], stdin, out)).rejects.toMatchObject({ code: 'not_enabled' });
  const base = ['--enable-synthetic-verification', '--authorization', path.join(dir, 'a.json'), '--run-dir', dir, '--account', randomUUID(), '--backend', backend];
  await expect(lib.main(base, { ...stdin, isTTY: true }, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
  await expect(lib.main([...base, '--extra', 'x'], stdin, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
  await expect(lib.main(base.map(x => x === backend ? 'relative/backend' : x), stdin, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
  await expect(lib.main(base.map(x => x.length === 36 && x[14] === '4' ? 'not-a-uuid' : x), stdin, out)).rejects.toMatchObject({ code: 'arguments_rejected' });
});
